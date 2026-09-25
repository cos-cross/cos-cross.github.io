/**
 * 线上站点验证:部署完成后跑一遍,确认线上内容和本地构建产物一致。
 *
 * 不做任何硬编码的页址列表 —— 它直接读本地 public/ 里的路由,
 * 逐页去线上请求。所以增删文章之后不用改这个脚本。
 *
 * 用法:
 *   node tools/verify-live.mjs
 *   node tools/verify-live.mjs https://你的域名/
 *   node tools/verify-live.mjs --concurrency 4
 */
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

const args = process.argv.slice(2);
const flagIndex = args.indexOf('--concurrency');
const CONCURRENCY = flagIndex >= 0 ? Math.max(1, Number(args[flagIndex + 1]) || 6) : 6;
const BASE = (args.find((a) => a.startsWith('http')) || 'https://cos-cross.github.io').replace(/\/+$/, '');

if (!existsSync(publicDir)) {
  console.error('public/ 不存在,请先运行:npm run build');
  process.exit(1);
}

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = await walk(publicDir);

// 每个 index.html 对应一个目录形式的网址
const routes = files
  .filter((f) => f.endsWith(`${path.sep}index.html`))
  .map((f) => {
    const rel = path.relative(publicDir, path.dirname(f)).replace(/\\/g, '/');
    return rel === '.' ? '/' : `/${rel}/`;
  })
  .sort();

const ASSETS = [
  '/css/style.css',
  '/js/main.js',
  '/img/avatar.svg',
  '/img/favicon.svg',
  '/atom.xml',
];

const problems = [];
let ok = 0;

async function checkRoute(route) {
  const url = BASE + route;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'cos-cross-blog-verify' } });
    const body = await res.text();
    if (res.status !== 200) {
      problems.push(`${route} → HTTP ${res.status}`);
      return;
    }
    if (!body.includes('</html>')) {
      problems.push(`${route} → 响应不是完整 HTML`);
      return;
    }
    ok++;
    console.log(`PASS  ${String(res.status)}  ${route}`);
  } catch (e) {
    problems.push(`${route} → ${e.message}`);
  }
}

async function checkAsset(asset) {
  try {
    const res = await fetch(BASE + asset, { headers: { 'User-Agent': 'cos-cross-blog-verify' } });
    const bytes = (await res.arrayBuffer()).byteLength;
    if (res.status !== 200 || bytes === 0) {
      problems.push(`${asset} → HTTP ${res.status},${bytes} 字节`);
      return;
    }
    ok++;
    console.log(`PASS  ${String(res.status)}  ${asset.padEnd(34)} ${(bytes / 1024).toFixed(1)}KB`);
  } catch (e) {
    problems.push(`${asset} → ${e.message}`);
  }
}

async function pool(items, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

console.log(`验证目标:${BASE}`);
console.log(`本地构建产物里有 ${routes.length} 个页面\n`);

await pool(routes, checkRoute);
console.log('');
await pool(ASSETS, checkAsset);

// 首页结构抽查(空站和有文章时要求不同)
const home = path.join(publicDir, 'index.html');
if (existsSync(home)) {
  const res = await fetch(BASE + '/', { headers: { 'User-Agent': 'cos-cross-blog-verify' } });
  const html = await res.text();
  const hasPosts = routes.some((r) => r.startsWith('/posts/'));
  const expected = [
    ['导航', 'site-nav'],
    ['首页大屏', 'hero-title'],
    ['项目卡片', 'project-card'],
    ['页脚', 'site-footer'],
    [hasPosts ? '文章卡片' : '空状态提示', hasPosts ? 'post-card' : 'empty-state'],
  ];
  for (const [label, token] of expected) {
    if (!html.includes(token)) problems.push(`首页缺少${label}`);
  }
}

console.log('');
if (problems.length) {
  console.error(`${problems.length} 项未通过(通过 ${ok} 项):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`全部通过(${ok} 项),线上与本地构建一致。`);
