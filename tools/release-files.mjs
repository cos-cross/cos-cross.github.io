/**
 * 把 files-big/ 里的大文件传到 GitHub Release。
 *
 * 用法:
 *   npm run files:release                 # 上传还没传的资源(已存在且大小一致的会跳过)
 *   npm run files:release -- --dry-run    # 只看要传什么
 *   npm run files:release -- --tag files  # 换一个 release tag(默认 files)
 *
 * 为什么大文件要走 Release(而不是 files/):
 *   git 仓库单文件 > 100 MB 会被 GitHub 直接拒(整次 push 失败),Release 单个资源上限 2 GB,
 *   而且**不占仓库体积**、也不计入 Pages 那 1 GB 的发布体积。
 *
 * 链接长这样,由 tools/files-index.cjs 统一拼装(资源页数据也用同一份规则,不会写歪):
 *   https://github.com/<owner>/<repo>/releases/download/files/<文件名>
 *
 * 认证:只从环境变量读令牌,和其它工具一致(见 README「发布」):
 *   GITHUB_TOKEN=ghp_xxx npm run files:release
 * 需要 repo 权限(公开仓库用 classic token 勾 repo 即可)。
 *
 * 断了怎么办:直接重跑。已经传完、大小一致的资源会被跳过,不会重复传 1 GB。
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { human, parseRemote, readOriginRemote, releaseBase, releaseAssetUrl, sizeClass } from './files-index.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIG_DIR = path.join(root, 'files-big');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const tagIndex = args.indexOf('--tag');
const TAG = tagIndex >= 0 && args[tagIndex + 1] ? args[tagIndex + 1] : 'files';

const API = 'https://api.github.com';
const UPLOAD = 'https://uploads.github.com';

/* ---------- 认证与仓库 ---------- */

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
if (!token && !DRY) {
  console.error('缺少令牌。用法:\n  GITHUB_TOKEN=ghp_xxx npm run files:release\n');
  console.error('(公开仓库的 classic token 勾 repo 就够;令牌只从环境变量读,不会写进任何文件)');
  process.exit(1);
}

function remoteRepo() {
  const remote = readOriginRemote(root);
  const parsed = remote ? parseRemote(remote) : null;
  if (parsed) return parsed;
  console.error(remote
    ? `origin 不是 GitHub 地址,认不出仓库:${remote}`
    : '读不到 .git/config 里的 origin(这个目录是不是 git 仓库?)');
  process.exit(1);
}

const { owner, repo } = remoteRepo();

/**
 * GitHub API 请求。装了 GitHub 加速器(Watt Toolkit 之类)时 hosts 会把 api.github.com
 * 指到 127.0.0.1、证书不被信任,所以这里降级重试一次并说明原因(和 manage-projects.mjs 一致)。
 */
async function gh(url, init = {}) {
  const opts = {
    ...init,
    headers: {
      'User-Agent': 'cos-cross-blog-files',
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  };
  try {
    return await fetch(url, opts);
  } catch (e) {
    if (!/certificate|self.signed|UNABLE_TO_VERIFY|fetch failed/i.test(String(e.message))) throw e;
    console.log('   (检测到本机 GitHub 加速器,已关闭证书校验重试)');
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    return await fetch(url, opts);
  }
}

/* ---------- 收集待传文件 ---------- */

async function collect(dir, base = '', out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) await collect(full, rel, out);
    else out.push({ full, rel, name: e.name, size: statSync(full).size });
  }
  return out;
}

if (!existsSync(BIG_DIR)) {
  console.log('files-big/ 不存在,没有要传的东西。');
  console.log('超过 100 MB 的文件请放进 files-big/,再跑这个命令。');
  process.exit(0);
}

const files = (await collect(BIG_DIR)).sort((a, b) => a.rel.localeCompare(b.rel));
if (!files.length) {
  console.log('files-big/ 是空的。');
  process.exit(0);
}

for (const f of files) {
  if (sizeClass(f.size) === 'over-release') {
    console.error(`✗ ${f.rel} 有 ${human(f.size)},超过 Release 单文件 2 GB 上限,传不上去。`);
    process.exit(1);
  }
}

const base = releaseBase(owner, repo, TAG);
console.log(`仓库:${owner}/${repo}`);
console.log(`Release 标签:${TAG}  →  ${base}/`);
console.log(`待处理:${files.length} 个文件,合计 ${human(files.reduce((s, f) => s + f.size, 0))}\n`);

if (DRY) {
  for (const f of files) console.log(`  ? ${f.rel}  ${human(f.size)}  →  ${releaseAssetUrl(base, f.name)}`);
  console.log('\n--dry-run:什么都没有上传。');
  process.exit(0);
}

/* ---------- 找到或建好那个 release ---------- */

async function ensureRelease() {
  const res = await gh(`${API}/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(TAG)}`);
  if (res.ok) {
    const rel = await res.json();
    console.log(`已有 Release「${rel.name || rel.tag_name}」,继续往里加资源。\n`);
    return rel;
  }
  if (res.status !== 404) {
    console.error(`查询 Release 失败:HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log('还没有这个 Release,新建一个。');
  const created = await gh(`${API}/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: TAG,
      name: '资源文件(大文件)',
      body: [
        '本站「资源」页里那些超过 100 MB 的文件放在这里 ——',
        '它们不适合放进 git 仓库(GitHub 单文件上限 100 MB),但 Release 资源不占仓库体积。',
        '',
        '页面:https://' + owner + '.github.io/files/',
        '',
        '由 `npm run files:release` 自动上传(tools/release-files.mjs)。',
      ].join('\n'),
      draft: false,
      prerelease: false,
    }),
  });
  if (!created.ok) {
    console.error(`创建 Release 失败:HTTP ${created.status} ${await created.text()}`);
    console.error('(令牌需要有 repo 权限;403 通常是权限不够)');
    process.exit(1);
  }
  const rel = await created.json();
  console.log(`已建好:${rel.html_url}\n`);
  return rel;
}

const release = await ensureRelease();

/* ---------- 现有资源(用于跳过已传的) ---------- */

const existing = new Map();
for (let page = 1; page <= 10; page++) {
  const res = await gh(`${API}/repos/${owner}/${repo}/releases/${release.id}/assets?per_page=100&page=${page}`);
  if (!res.ok) break;
  const batch = await res.json();
  if (!Array.isArray(batch) || !batch.length) break;
  for (const a of batch) existing.set(a.name, a);
  if (batch.length < 100) break;
}

/* ---------- 上传 ---------- */

/** 边传边报进度:2 GB 的包安静地传十分钟会让人以为卡死了 */
function withProgress(stream, total, label) {
  let sent = 0;
  const step = 100 * 1024 * 1024; // 每 100 MB 报一次
  let next = step;
  return stream.pipe(new Transform({
    transform(chunk, _enc, cb) {
      sent += chunk.length;
      if (sent >= next) {
        console.log(`    ${label} 已传 ${human(sent)} / ${human(total)}`);
        next += step;
      }
      cb(null, chunk);
    },
  }));
}

let uploaded = 0;
let skipped = 0;
const results = [];

for (const f of files) {
  const url = releaseAssetUrl(base, f.name);
  const already = existing.get(f.name);

  if (already && already.size === f.size) {
    console.log(`= ${f.name}  ${human(f.size)}  已在 Release 上,跳过`);
    skipped += 1;
    results.push({ name: f.name, url: already.browser_download_url || url, state: '已存在' });
    continue;
  }

  console.log(`↑ ${f.name}  ${human(f.size)}  上传中…`);
  const res = await gh(`${UPLOAD}/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(f.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(f.size) },
    body: Readable.toWeb(withProgress(createReadStream(f.full), f.size, f.name)),
    duplex: 'half',
  });

  if (!res.ok) {
    console.error(`✗ ${f.name} 上传失败:HTTP ${res.status} ${await res.text()}`);
    console.error('  已传完的资源会保留,修好之后重跑即可(会自动跳过已完成的)。');
    process.exit(1);
  }
  const asset = await res.json();
  uploaded += 1;
  console.log(`  ✓ ${asset.browser_download_url}`);
  results.push({ name: f.name, url: asset.browser_download_url || url, state: '刚上传' });
}

/* ---------- 收尾 ---------- */

console.log(`\n完成:上传 ${uploaded} 个,跳过 ${skipped} 个。`);
for (const r of results) console.log(`  [${r.state}] ${r.url}`);
console.log('\n页面上的链接由 tools/sync-files.mjs 生成,记得跑一次 npm run files(或直接 npm run deploy)。');
console.log('如果发现资源页上的链接 404,先确认文件名和 files-big/ 里完全一致(含大小写和扩展名)。');
