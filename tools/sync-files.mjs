/**
 * 把 files/ 与 files-big/ 里的文件同步到站点,并生成下载页的数据。
 *
 * 用法:
 *   npm run files                # 同步
 *   npm run files -- --dry-run   # 只看会做什么
 *
 * 「npm run build / check / deploy」都会自动先跑一次。
 *
 * 工作方式跟 mdblog/ 一样:两个目录是唯一的数据源,
 *   - files/      小文件(< 100 MB):本体复制到 source/files/(Hexo 原样发布到 /files/…),本站直链下载
 *   - files-big/  大文件:不进仓库,只算大小/日期/sha256,链接指向 GitHub Release
 *     (用 `npm run files:release` 把它们传上去,见 tools/release-files.mjs)
 *   - 顺便算好大小、日期、sha256 前 8 位,写进 source/_data/files.yml
 *   - /files/ 页面按子目录分组把这些文件列出来,外链条目会标一个 Release 小标
 *
 * ⚠️ 为什么必须分两档(GitHub 的硬限制,不是审美):
 *   - git 仓库单文件 > 100 MB 直接 push 被拒(整次 push 失败,不是跳过那个文件);
 *   - Release 单个资源上限 2 GB,且不占仓库体积;
 *   - Pages 源仓库建议 ≤ 1 GB,发布站点 ≤ 1 GB。
 *   所以大文件放进 files/ 的后果是"部署直接挂掉",这里就用体积阈值把它挡住。
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  human, parseRemote, readOriginRemote, releaseBase, releaseAssetUrl, sizeClass, RELEASE_LIMIT,
} from './files-index.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(root, 'files');
const BIG_DIR = path.join(root, 'files-big');
const OUT_DIR = path.join(root, 'source', 'files');
const DATA_FILE = path.join(root, 'source', '_data', 'files.yml');

/** Release 的标签:所有大文件都挂在这一个 tag 下,直链就永远不变 */
const RELEASE_TAG = 'files';

const DRY = process.argv.includes('--dry-run');
const KEEP = new Set(['index.md']); // source/files/ 里自带的页面文件,不能被覆盖或清理

const added = [];
const removed = [];
const warnings = [];

/* ---------- 工具 ---------- */

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

if (!existsSync(SRC_DIR) && !existsSync(BIG_DIR)) {
  console.log('files/ 和 files-big/ 都不存在,跳过同步。(新建 files/ 放大文件之外的东西即可)');
  process.exit(0);
}

const entries = existsSync(SRC_DIR) ? await collect(SRC_DIR) : [];
const bigEntries = existsSync(BIG_DIR) ? await collect(BIG_DIR) : [];
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

  const cls = sizeClass(info.size);
  if (cls === 'over-git') {
    warnings.push(`files/${item.rel} 有 ${human(info.size)},超过 GitHub 单文件 100 MB 硬上限,`
      + '整次 push 会被拒 → 把它挪进 files-big/(走 Release)再跑一次');
  } else if (cls === 'warn') {
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
    external: false,
  });
}

/* ---------- 第二档:files-big/ → GitHub Release 直链(文件本体不进仓库) ---------- */

if (bigEntries.length) {
  let base = '';
  const remote = readOriginRemote(root);
  const parsed = remote ? parseRemote(remote) : null;
  if (parsed) base = releaseBase(parsed.owner, parsed.repo, RELEASE_TAG);
  else warnings.push(`从 .git/config 认不出 GitHub 仓库(${remote || '没有 origin'}),`
    + 'files-big/ 里的大文件暂时拿不到直链,不会被列到资源页');

  for (const item of bigEntries) {
    const info = await stat(item.full);
    const cls = sizeClass(info.size);

    if (cls === 'over-release') {
      warnings.push(`files-big/${item.rel} 有 ${human(info.size)},超过 Release 单文件 2 GB 上限,传不上去(得拆包或用对象存储)`);
    } else if (cls !== 'over-git') {
      warnings.push(`files-big/${item.rel} 只有 ${human(info.size)},不到 100 MB,其实可以直接放进 files/ 走本站直链`);
    }
    if (!base) continue;

    const hash = await sha256(item.full);
    const date = info.mtime.toISOString().slice(0, 10);
    const group = path.dirname(item.rel) === '.' ? '根目录' : path.dirname(item.rel);

    added.push({
      name: path.basename(item.rel),
      rel: item.rel,
      url: releaseAssetUrl(base, path.basename(item.rel)),
      group,
      size: human(info.size),
      bytes: info.size,
      date,
      sha: hash,
      external: true,
    });
  }
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

/* ---------- 清理:public/files/ 也要跟着瘦身 ---------- */

/**
 * Hexo **不会**删除 public/ 里已经不存在的文件 —— 它只负责生成,不负责清理。
 * 于是"从 files/ 挪走的大文件"会永远留在 public/files/ 里,而 public/ 是会被推到
 * gh-pages 的:既不希望 2 GB 的老文件继续被推,也不希望它们还能被下载到。
 * 这里按同一份 wanted 清单把它对齐(public/ 是构建产物,删掉没有风险)。
 */
const PUB_DIR = path.join(root, 'public', 'files');
if (existsSync(PUB_DIR)) {
  const before = removed.length;
  await prune(PUB_DIR);
  const pruned = removed.length - before;
  if (pruned) console.log(`(顺带清掉 public/files/ 里 ${pruned} 个已经不在源目录的文件)`);
}

/* ---------- 写数据文件 ---------- */

added.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

const totalBytes = added.reduce((s, f) => s + f.bytes, 0);
const remoteCount = added.filter((f) => f.external).length;
const lines = [
  '# ⚠️ 由 tools/sync-files.mjs 自动生成 —— 文件放进 files/(小而直链)或 files-big/(大文件走 Release),不要直接改这个文件',
  `# 共 ${added.length} 个文件,合计 ${human(totalBytes)}`
    + (remoteCount ? `(其中 ${remoteCount} 个是 GitHub Release 外链)` : ''),
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
  if (f.external) lines.push('  external: true');
}
if (!DRY) await writeFile(DATA_FILE, lines.join('\n') + '\n', 'utf8');

/* ---------- 汇报 ---------- */

console.log(`文件同步:${added.length} 个文件,合计 ${human(totalBytes)}${DRY ? ' (dry-run)' : ''}`);
if (remoteCount) {
  console.log(`  其中 ${remoteCount} 个大文件走 GitHub Release 直链(本体不进仓库)`);
  console.log('  如果这些直链还没生效,先跑:npm run files:release');
}
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
