/**
 * 把 KaTeX 的样式与字体复制到主题里。
 *
 * 只复制 CSS + woff2 字体:公式是在**构建期**由 scripts/math.js 渲染成静态 HTML 的,
 * 前端不需要 katex.min.js / auto-render.js(那是浏览器端渲染才要的,266 KB)。
 * 字体也只复制 woff2 —— KaTeX 的 CSS 里同时声明了 woff2 / woff / ttf,
 * 现代浏览器命中第一个就停了,全量复制只会让仓库多出几百 KB 无用文件。
 *
 * 用法:node tools/vendor-katex.mjs
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

await cp(path.join(src, 'katex.min.css'), path.join(dest, 'katex.min.css'));

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

console.log('KaTeX 样式已复制到 themes/cos-cross/source/vendor/katex');
console.log(`  1 个 CSS + ${fontCount} 个 woff2 字体`);
console.log(`  体积:${(bytes / 1024).toFixed(1)} KB(不再包含客户端 JS)`);
