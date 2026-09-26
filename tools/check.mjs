/**
 * 构建产物自检。
 *
 * 检查 public/ 里的:
 *   1. 是否残留未渲染的模板标签;
 *   2. 站内链接、图片、脚本、样式的目标文件是否存在;
 *   3. 首页/文章页关键结构是否齐全。
 *
 * 用法:node scripts/check.mjs   (或 npm run check,会先构建)
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

if (!existsSync(publicDir)) {
  console.error('public/ 不存在,请先运行:npm run build');
  process.exit(1);
}

const problems = [];
const stats = { html: 0, links: 0, assets: 0 };

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = await walk(publicDir);
const fileSet = new Set(files.map((f) => f.replace(/\\/g, '/')));

/** 把一个站内 URL 映射到磁盘上的候选文件 */
function candidates(urlPath) {
  let p = urlPath.split('#')[0].split('?')[0];
  try { p = decodeURIComponent(p); } catch { /* 保持原样 */ }
  p = p.replace(/^\/+/, '');
  const abs = path.join(publicDir, p);
  const list = [abs.replace(/\\/g, '/')];
  if (!path.extname(p)) {
    list.push(path.join(abs, 'index.html').replace(/\\/g, '/'));
    list.push((abs + '.html').replace(/\\/g, '/'));
  }
  return list;
}

for (const file of files) {
  if (!file.endsWith('.html')) continue;
  stats.html++;
  const rel = file.replace(/\\/g, '/');
  const html = await readFile(file, 'utf8');

  if (/<%[-=]?/.test(html)) {
    problems.push(`${path.relative(publicDir, file)}: 残留未渲染的模板标签`);
  }

  const base = path.dirname(rel);
  const refs = [...html.matchAll(/(?:href|src)\s*=\s*"([^"]+)"/g)].map((m) => m[1]);

  for (const rawRef of refs) {
    // 静态资源链接会带 ?v=<内容指纹> 这样的缓存版本号(见 tools/asset-version.cjs),
    // 校验"文件在不在"之前必须先把查询串和锚点去掉,否则会被当成本地文件找不着
    const ref = rawRef.split('#')[0].split('?')[0];
    if (!ref || /^(https?:|mailto:|tel:|data:|javascript:|#|\/\/)/.test(ref)) continue;
    stats.links++;
    const target = ref.startsWith('/') ? ref : path.relative(publicDir, path.join(base, ref)).replace(/\\/g, '/');
    const found = candidates(target).some((c) => fileSet.has(c) || existsSync(c));
    if (!found) problems.push(`${path.relative(publicDir, file)}: 链接目标不存在 -> ${rawRef}`);
  }

  for (const asset of ['/css/style.css', '/js/main.js', '/img/avatar.svg', '/img/favicon.svg']) {
    if (html.includes(asset)) stats.assets++;
  }
}

const postFiles = files.filter((f) => /[\\/]posts[\\/].+index\.html$/.test(f));
const hasPosts = postFiles.length > 0;
const hasTags = files.some((f) => /[\\/]tags[\\/].+index\.html$/.test(f));

// 关键结构抽查。没有文章时首页不渲染文章卡片和标签云,
// 改为要求出现空状态提示(由 scripts/empty-site-fallback.js 兜底生成首页)。
const home = path.join(publicDir, 'index.html');
if (!existsSync(home)) {
  problems.push('缺少 index.html —— 首页没有生成');
} else {
  const html = await readFile(home, 'utf8');
  const expected = [
    ['导航', /class="[^"]*\bsite-nav\b/],
    ['首页大屏', /class="[^"]*\bhero-title\b/],
    ['项目卡片', /class="[^"]*\bproject-card\b/],
    ['页脚', /class="[^"]*\bsite-footer\b/],
    ['连击 HUD', /class="[^"]*\bcombo-hud\b/],
  ];
  if (hasPosts) {
    expected.push(['文章卡片', /class="[^"]*\bpost-card\b/]);
  } else {
    expected.push(['空状态提示', /class="[^"]*\bempty-state\b/]);
  }
  // 标签云只在真的存在标签时才渲染
  if (hasTags) expected.push(['标签云', /class="[^"]*\btag-cloud\b/]);
  for (const [label, pattern] of expected) {
    if (!pattern.test(html)) problems.push(`index.html: 缺少${label}`);
  }
}

// 「文章」导航指向 /archives/,空站时靠兜底生成器补上,不能 404
if (!existsSync(path.join(publicDir, 'archives', 'index.html'))) {
  problems.push('缺少 archives/index.html —— 导航里的「文章」会 404');
}

for (const f of postFiles) {
  const html = await readFile(f, 'utf8');
  if (!/class="[^"]*\bpost-content\b/.test(html)) problems.push(`${path.relative(publicDir, f)}: 缺少正文容器`);
  if (!/class="[^"]*\bpost-title\b/.test(html)) problems.push(`${path.relative(publicDir, f)}: 缺少标题`);
}

const size = (await walk(publicDir)).reduce(async (acc, f) => (await acc) + (await stat(f)).size, Promise.resolve(0));
const totalKB = ((await size) / 1024).toFixed(1);

console.log('构建产物自检');
console.log(`  HTML 页面 : ${stats.html}`);
console.log(`  文章页面  : ${postFiles.length}${hasPosts ? '' : '(空站模式,由 scripts/empty-site-fallback.js 兜底)'}`);
console.log(`  站内链接  : ${stats.links}`);
console.log(`  总体积    : ${totalKB} KB`);
console.log('');

if (problems.length) {
  console.error(`发现 ${problems.length} 个问题:`);
  for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
  if (problems.length > 40) console.error(`  ...还有 ${problems.length - 40} 个`);
  process.exit(1);
}

console.log('全部通过,没有发现问题。');
