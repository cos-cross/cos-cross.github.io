/**
 * 把 mdblog/ 里的 Markdown 笔记同步成博客文章。
 *
 * 用法:
 *   npm run mdblog              # 手动同步
 *   npm run mdblog -- --dry-run # 只看会做什么,不落盘
 *
 * 「npm run deploy」和「npm run build」都会自动先跑一次,所以平时不用手动执行。
 *
 * 设计要点:
 *   1. **单向同步。** mdblog/ 是唯一的源,source/_posts/ 里那些文件是生成物。
 *      生成的文件带 `mdblog_source:` 标记,同步时只认这个标记 ——
 *      手写在 source/_posts/ 里的文章绝不会被碰。
 *   2. **删了就删了。** mdblog/ 里删掉一篇,对应的生成文章也会被删掉(git 里能找回)。
 *   3. **不依赖 YAML 库。** front-matter 只做浅层解析,够用且不引依赖。
 *   4. **图片会被搬过去。** 笔记里写的相对路径图片会被复制到
 *      source/images/mdblog/<slug>/ 并把路径改写成绝对路径,否则图片会 404。
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MD_DIR = path.join(root, 'mdblog');
const POSTS_DIR = path.join(root, 'source', '_posts');
const IMG_OUT = path.join(root, 'source', 'images', 'mdblog');

const DRY = process.argv.includes('--dry-run');
const changed = [];
const removed = [];
const warnings = [];

/* ---------- 工具 ---------- */

const pad = (s, n) => String(s).padEnd(n);

/**
 * 把字符串包成安全的 YAML 标量。
 * 必须做:标题里出现 ": "(冒号+空格)时,不加引号会被 YAML 当成嵌套映射,
 * 比如 `title: 笔记: 第一部分` 会解析失败或者变成奇怪的结构。
 */
function yamlStr(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** 把文件名变成 slug:空格换连字符,去掉不适合放进 URL 的字符 */
function slugify(name) {
  return name
    .trim()
    .replace(/\.md$/i, '')
    .replace(/\s+/g, '-')
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function splitFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!m) return { fm: '', body: raw.replace(/^\uFEFF/, '') };
  return { fm: m[1], body: raw.slice(m[0].length) };
}

/** 从 front-matter 里取一个标量值(只做浅层解析,够用) */
function fmValue(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  if (!m) return null;
  const v = m[1].trim().replace(/^['"]|['"]$/g, '');
  return v === '' ? null : v;
}

/** 递归收集 .md(跳过 _ 和 . 开头的文件/目录,它们用来放说明和草稿) */
async function collect(dir, base = '', out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) await collect(full, rel, out);
    else if (/\.md$/i.test(e.name)) out.push({ full, rel });
  }
  return out;
}

function formatDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ---------- 图片搬运 ---------- */

const IMG_MD_RE = /(!\[[^\]]*\]\()(?!https?:|\/|data:)([^)\s]+)(\))/g;

/** 收集正文里引用的相对路径图片 */
function findLocalImages(body) {
  const found = [];
  for (const m of body.matchAll(IMG_MD_RE)) found.push(m[2].split('#')[0].split('?')[0]);
  return found;
}

/* ---------- 主流程 ---------- */

if (!existsSync(MD_DIR)) {
  console.log('mdblog/ 不存在,跳过同步。(想用的话新建这个文件夹,把 .md 丢进去即可)');
  process.exit(0);
}

await mkdir(POSTS_DIR, { recursive: true });

const notes = await collect(MD_DIR);

// slug 冲突处理:同名文件才带上子目录前缀,平时保持干净的短网址
const bySlug = new Map();
for (const n of notes) {
  const base = slugify(path.basename(n.rel));
  bySlug.set(base, (bySlug.get(base) || 0) + 1);
}

const wanted = new Set(); // 本次同步应该存在的生成文件

for (const note of notes) {
  const raw = (await readFile(note.full, 'utf8')).replace(/^\uFEFF/, '');
  const { fm, body: rawBody } = splitFrontMatter(raw);

  const dir = path.dirname(note.rel) === '.' ? '' : path.dirname(note.rel);
  const baseSlug = slugify(path.basename(note.rel));
  let slug = fmValue(fm, 'slug') || (bySlug.get(baseSlug) > 1 && dir ? slugify(`${dir}-${baseSlug}`) : baseSlug);
  if (!slug) {
    warnings.push(`${note.rel}: 文件名生成的 slug 为空,已跳过`);
    continue;
  }

  /* --- 标题:front-matter → 正文第一个 # 标题 → 文件名 --- */
  let body = rawBody;
  let title = fmValue(fm, 'title');
  if (!title) {
    const h1 = body.match(/^\s*#\s+(.+?)\s*$/m);
    if (h1) {
      title = h1[1].trim();
      // 用了正文里的 H1 当标题,就把它从正文里去掉,免得页面出现两个大标题
      body = body.replace(h1[0], '').replace(/^\s*\n/, '');
    } else {
      title = path.basename(note.rel, path.extname(note.rel));
    }
  }

  /* --- 日期:front-matter → 文件修改时间 --- */
  let date = fmValue(fm, 'date');
  if (!date) date = formatDate((await stat(note.full)).mtime);

  /* --- 分类:front-matter → 子目录名 --- */
  let categories = fmValue(fm, 'categories');
  if (!categories && dir) categories = dir.split('/')[0];

  /* --- 图片:复制到 source/images/mdblog/<slug>/ 并改写路径 --- */
  const imgs = [...new Set(findLocalImages(body))];
  for (const rel of imgs) {
    const from = path.resolve(path.dirname(note.full), rel);
    if (!existsSync(from)) {
      warnings.push(`${note.rel}: 图片不存在,已保持原样 -> ${rel}`);
      continue;
    }
    const name = path.basename(rel);
    const destDir = path.join(IMG_OUT, slug);
    const dest = path.join(destDir, name);
    if (!DRY) {
      await mkdir(destDir, { recursive: true });
      await cp(from, dest);
    }
    body = body.split(`](${rel})`).join(`](/images/mdblog/${slug}/${name})`);
    changed.push(`  🖼  ${note.rel} → source/images/mdblog/${slug}/${name}`);
  }

  /* --- 拼装 front-matter ---
     策略:把用户原本写的 front-matter **原样保留**,只替换/补充我们管的几个键。
     这样 `tags:` 写成多行列表、或者有别的自定义字段,都不会被弄丢。 */
  const managed = /^(title|date|categories|mdblog_source)\s*:/;
  const kept = fm
    .split(/\r?\n/)
    .filter((line) => line.trim() && !managed.test(line));

  const fmLines = [
    '---',
    `# ⚠️ 自动生成,请勿直接编辑 —— 改 mdblog/${note.rel}`,
    `title: ${yamlStr(title)}`,
    `date: ${date}`,
  ];
  if (categories) fmLines.push(`categories: ${yamlStr(categories)}`);
  fmLines.push(...kept);
  fmLines.push(`mdblog_source: ${yamlStr(note.rel)}`);
  fmLines.push('---', '');

  const outFile = path.join(POSTS_DIR, `${slug}.md`);
  const outText = fmLines.join('\n') + body.replace(/^\s*\n+/, '');
  wanted.add(path.basename(outFile));

  const before = existsSync(outFile) ? await readFile(outFile, 'utf8') : null;
  if (before !== outText) {
    if (!DRY) await writeFile(outFile, outText, 'utf8');
    changed.push(`  ✎  mdblog/${note.rel} → source/_posts/${slug}.md`);
  }
}

/* ---------- 清理:mdblog 里已经删掉的,生成物也删掉 ---------- */

for (const name of await readdir(POSTS_DIR)) {
  if (!name.endsWith('.md')) continue;
  if (wanted.has(name)) continue;
  const full = path.join(POSTS_DIR, name);
  const text = await readFile(full, 'utf8');
  const m = text.match(/^mdblog_source:\s*"?([^"\n]+?)"?\s*$/m);
  if (!m) continue; // 不是 mdblog 生成的,绝不动
  const sourceRel = m[1].trim();
  if (existsSync(path.join(MD_DIR, sourceRel))) continue; // 源还在,可能只是 slug 变了
  if (!DRY) await rm(full, { force: true });
  removed.push(`  ✗  source/_posts/${name}(源 mdblog/${sourceRel} 已删除)`);
}

/* ---------- 汇报 ---------- */

console.log(`mdblog 同步:${notes.length} 篇笔记${DRY ? ' (dry-run,未落盘)' : ''}`);
if (changed.length) {
  console.log(`\n更新 ${changed.length} 处:`);
  for (const c of changed) console.log(c);
}
if (removed.length) {
  console.log(`\n删除 ${removed.length} 篇(git 里可以找回):`);
  for (const r of removed) console.log(r);
}
if (warnings.length) {
  console.log(`\n提示 ${warnings.length} 条:`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (!changed.length && !removed.length) console.log('  没有变化。');
