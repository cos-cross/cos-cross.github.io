/**
 * 把 files/ 里的文件同步到站点,并生成下载页的数据。
 *
 * 用法:
 *   npm run files                # 同步
 *   npm run files -- --dry-run   # 只看会做什么
 *
 * 「npm run build / check / deploy」都会自动先跑一次。
 *
 * 工作方式跟 mdblog/ 一样:files/ 是唯一的数据源,
 *   - 文件本体复制到 source/files/(Hexo 会把它们原样发布到 /files/…)
 *   - 顺便算好大小、日期、sha256 前 8 位,写进 source/_data/files.yml
 *   - /files/ 页面按子目录分组把这些文件列出来
 *
 * ⚠️ 这是"把文件提交进 git 仓库"的方案,不是对象存储:
 *   - GitHub 单文件硬上限 100 MB,仓库建议 1 GB 以内;
 *   - 文件会在 main(files/)和 gh-pages(public/files/)各存一份,仓库体积翻倍。
 *   放 PDF、课件、代码包这类小文件没问题;视频、大镜像请用真正的对象存储
 *   (Cloudflare R2 / 阿里云盘 / Alist 之类,见 README)。
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(root, 'files');
const OUT_DIR = path.join(root, 'source', 'files');
const DATA_FILE = path.join(root, 'source', '_data', 'files.yml');

const DRY = process.argv.includes('--dry-run');
const KEEP = new Set(['index.md']); // source/files/ 里自带的页面文件,不能被覆盖或清理

const added = [];
const removed = [];
const warnings = [];

/* ---------- 工具 ---------- */

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function yamlStr(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** 流式算 sha256,避免把大文件整个读进内存 */
function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex').slice(0, 8)))
      .on('error', reject);
  });
}

async function collect(dir, base = '', out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) await collect(full, rel, out);
    else out.push({ full, rel });
  }
  return out;
}

/* ---------- 主流程 ---------- */

if (!existsSync(SRC_DIR)) {
  console.log('files/ 不存在,跳过同步。(新建这个文件夹,把要分享的文件丢进去即可)');
  process.exit(0);
}

const entries = await collect(SRC_DIR);
await mkdir(OUT_DIR, { recursive: true });
await mkdir(path.dirname(DATA_FILE), { recursive: true });

const wanted = new Set();

for (const item of entries) {
  if (KEEP.has(item.rel)) {
    warnings.push(`files/${item.rel} 与内置页面文件重名,已跳过(换个文件名)`);
    continue;
  }
  const dest = path.join(OUT_DIR, item.rel);
  const info = await stat(item.full);

  if (info.size > 100 * 1024 * 1024) {
    warnings.push(`files/${item.rel} 有 ${human(info.size)},超过 GitHub 单文件 100 MB 硬上限,推不上去`);
  } else if (info.size > 20 * 1024 * 1024) {
    warnings.push(`files/${item.rel} 有 ${human(info.size)},偏大,仓库体积会涨得很快`);
  }

  const hash = await sha256(item.full);
  const date = info.mtime.toISOString().slice(0, 10);
  const group = path.dirname(item.rel) === '.' ? '根目录' : path.dirname(item.rel);
  wanted.add(item.rel.replace(/\//g, path.sep));
  wanted.add(path.basename(item.rel));

  if (!DRY) {
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(item.full, dest);
  }
  added.push({
    name: path.basename(item.rel),
    rel: item.rel,
    url: `/files/${item.rel.split('/').map(encodeURIComponent).join('/')}`,
    group,
    size: human(info.size),
    bytes: info.size,
    date,
    sha: hash,
  });
}

/* ---------- 清理:files/ 里删掉的,发布目录里也要删掉 ---------- */

async function prune(dir, base = '') {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await prune(full, rel);
    } else if (!KEEP.has(rel) && !wanted.has(rel.replace(/\//g, path.sep))) {
      if (!DRY) await rm(full, { force: true });
      removed.push(rel);
    }
  }
}
if (existsSync(OUT_DIR)) await prune(OUT_DIR);

/* ---------- 写数据文件 ---------- */

added.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

const totalBytes = added.reduce((s, f) => s + f.bytes, 0);
const lines = [
  '# ⚠️ 由 tools/sync-files.mjs 自动生成 —— 请把文件放进 files/ 目录,不要直接改这个文件',
  `# 共 ${added.length} 个文件,合计 ${human(totalBytes)}`,
  '',
];
for (const f of added) {
  lines.push(`- name: ${yamlStr(f.name)}`);
  lines.push(`  url: ${yamlStr(f.url)}`);
  lines.push(`  group: ${yamlStr(f.group)}`);
  lines.push(`  size: ${yamlStr(f.size)}`);
  lines.push(`  bytes: ${f.bytes}`);
  lines.push(`  date: ${yamlStr(f.date)}`);
  lines.push(`  sha: ${yamlStr(f.sha)}`);
}
if (!DRY) await writeFile(DATA_FILE, lines.join('\n') + '\n', 'utf8');

/* ---------- 汇报 ---------- */

console.log(`文件同步:${added.length} 个文件,合计 ${human(totalBytes)}${DRY ? ' (dry-run)' : ''}`);
if (removed.length) {
  console.log(`\n清理 ${removed.length} 个已删除的文件:`);
  for (const r of removed) console.log(`  ✗  source/files/${r}`);
}
if (!removed.length && !added.length) console.log('  没有文件。');
if (warnings.length) {
  console.log(`\n提示 ${warnings.length} 条:`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (added.length) {
  const groups = [...new Set(added.map((f) => f.group))];
  console.log(`\n分组:${groups.join('、')}`);
  console.log('下载页:/files/');
}
