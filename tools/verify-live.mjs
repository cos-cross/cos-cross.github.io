/**
 * 线上站点验证:部署完成后跑一遍,确认页面和资源真的可达。
 *
 * 用法:
 *   node tools/verify-live.mjs
 *   node tools/verify-live.mjs https://你的域名/
 */
const BASE = (process.argv[2] || 'https://cos-cross.github.io').replace(/\/+$/, '');

const pages = [
  ['首页', '/', ['hero-title', 'post-card', 'project-card', 'site-footer', 'brand-avatar']],
  ['归档页', '/archives/', ['archive-item', 'archive-year']],
  ['项目页', '/projects/', ['project-card', 'project-name']],
  ['关于页', '/about/', ['info-grid', 'callout']],
  ['文章 · 普通', '/posts/hello-blog/', ['post-content', 'post-title', 'post-toc']],
  ['文章 · 代码', '/posts/css-rhythm-lane/', ['post-content', 'post-nav', 'class="highlight']],
  ['文章 · 公式', '/posts/rhythm-judgement-math/', ['post-content', 'vendor/katex/katex.min.js', 'toc-link']],
  ['文章 · 数学', '/posts/rose-curve-python/', ['post-content', 'vendor/katex']],
];

const assets = [
  '/css/style.css',
  '/js/main.js',
  '/img/avatar.svg',
  '/img/favicon.svg',
  '/vendor/katex/katex.min.css',
  '/vendor/katex/katex.min.js',
  '/vendor/katex/auto-render.min.js',
  '/atom.xml',
];

let failures = 0;

async function get(path) {
  const res = await fetch(BASE + path, { headers: { 'User-Agent': 'cos-cross-blog-verify' } });
  const body = await res.text();
  return { status: res.status, body, bytes: Buffer.byteLength(body) };
}

console.log(`验证目标:${BASE}\n`);

for (const [name, path, expects] of pages) {
  try {
    const { status, body, bytes } = await get(path);
    const missing = expects.filter((token) => !body.includes(token));
    const ok = status === 200 && missing.length === 0;
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(12)} ${String(status).padEnd(4)} ${(bytes / 1024).toFixed(1).padStart(6)}KB` +
      (missing.length ? `  缺少: ${missing.join(', ')}` : ''),
    );
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name.padEnd(12)} 请求失败: ${e.message}`);
  }
}

console.log('');
for (const path of assets) {
  try {
    const res = await fetch(BASE + path, { headers: { 'User-Agent': 'cos-cross-blog-verify' } });
    const bytes = (await res.arrayBuffer()).byteLength;
    const ok = res.status === 200 && bytes > 0;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  资源 ${path.padEnd(32)} ${String(res.status).padEnd(4)} ${(bytes / 1024).toFixed(1).padStart(6)}KB`);
  } catch (e) {
    failures++;
    console.log(`FAIL  资源 ${path.padEnd(32)} ${e.message}`);
  }
}

console.log(failures ? `\n${failures} 项未通过` : '\n全部通过,线站正常。');
process.exit(failures ? 1 : 0);
