/**
 * 把 KaTeX 的运行时资源从 node_modules 复制到主题里。
 *
 * 只复制 woff2 字体:KaTeX 的 CSS 里同时声明了 woff2 / woff / ttf,
 * 现代浏览器命中第一个就停了,后面两个只会在老浏览器上才请求。
 * 全量复制会让仓库多出几百 KB 的无用字体。
 *
 * 用法:node scripts/vendor-katex.mjs
 */
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'katex', 'dist');
const dest = path.join(root, 'themes', 'cos-cross', 'source', 'vendor', 'katex');

if (!existsSync(src)) {
  console.error('找不到 node_modules/katex,请先执行:npm install --save --ignore-scripts katex');
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await mkdir(path.join(dest, 'fonts'), { recursive: true });

const files = [
  ['katex.min.css', 'katex.min.css'],
  ['katex.min.js', 'katex.min.js'],
  [path.join('contrib', 'auto-render.min.js'), 'auto-render.min.js'],
];

for (const [from, to] of files) {
  await cp(path.join(src, from), path.join(dest, to));
}

let fontCount = 0;
for (const name of await readdir(path.join(src, 'fonts'))) {
  if (!name.endsWith('.woff2')) continue;
  await cp(path.join(src, 'fonts', name), path.join(dest, 'fonts', name));
  fontCount++;
}

let bytes = 0;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else bytes += (await stat(full)).size;
  }
}
await walk(dest);

console.log(`KaTeX 已复制到 themes/cos-cross/source/vendor/katex`);
console.log(`  文件:3 个脚本/样式 + ${fontCount} 个 woff2 字体`);
console.log(`  体积:${(bytes / 1024).toFixed(1)} KB`);
