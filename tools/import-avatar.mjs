/**
 * 把 B 站头像导入成网站图标 / 站内头像。
 *
 * 用法:
 *   node tools/import-avatar.mjs 388480733              # B 站 UID
 *   node tools/import-avatar.mjs 388480733 --avatar      # 顺便把站内头像也换掉
 *   node tools/import-avatar.mjs 388480733 --zoom 1.8    # 放大裁切(44px 的 favicon 太小就调它)
 *   node tools/import-avatar.mjs https://example.com/a.png
 *   node tools/import-avatar.mjs D:\\pictures\\me.png
 *   node tools/import-avatar.mjs 388480733 --raw-only    # 只抓原图,不生成尺寸
 *
 * 生成到 themes/cos-cross/source/img/:
 *   favicon-32.png        浏览器标签页图标
 *   apple-touch-icon.png  180×180,iOS 添加到主屏用
 *   avatar.jpg            256×256,站内头像(--avatar 时启用)
 *
 * 原图存在 assets/avatar-source.jpg —— 故意不放主题目录,
 * 因为主题 source/ 下的文件会被原样发布到线上。
 *
 * 为什么要缩:头像原图通常 512px / 200KB+,而 favicon 只需要 32px。
 * 不缩的话每个页面都要多下两百多 KB。
 * 缩放用 ffmpeg(环境变量 FFMPEG → PATH)。
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imgDir = path.join(root, 'themes', 'cos-cross', 'source', 'img');
// 原图放这里而不是主题目录 —— 主题 source/ 下的东西会被原样发布到线上,
// 一张 240KB 的原图没必要让每个访客都下。
const assetsDir = path.join(root, 'assets');
const themeConfig = path.join(root, 'themes', 'cos-cross', '_config.yml');
const tmpDir = path.join(root, '.avatar-tmp');

const args = process.argv.slice(2);
const flagsWithValue = ['--zoom'];
const input = args.find((a, i) => !a.startsWith('--') && !flagsWithValue.includes(args[i - 1]));
const flagValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const wantAvatar = args.includes('--avatar');
const rawOnly = args.includes('--raw-only');
const zoom = Number(flagValue('--zoom', 1));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const kb = (f) => (existsSync(f) ? `${(statSync(f).size / 1024).toFixed(0)} KB` : '-');

if (!input) {
  console.error('用法:node tools/import-avatar.mjs <B站UID | 图片URL | 本地文件路径>');
  process.exit(1);
}

/* ---------- 1. 找到图片地址 ---------- */

async function resolveSource(src) {
  if (/^\d+$/.test(src)) {
    const res = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${src}&photo=false`, {
      headers: { 'User-Agent': UA, Referer: `https://space.bilibili.com/${src}` },
    });
    const j = await res.json();
    if (j.code !== 0) {
      throw new Error(`B 站接口返回 ${j.code}:${j.message}(UID 填错?或者被风控了,过一会儿再试)`);
    }
    const card = j.data.card;
    // 头像地址可能带 @240w_240h.webp 之类的 CDN 后缀,去掉才能拿到原图
    const face = card.face.split('@')[0];
    console.log(`B 站账号:${card.name}`);
    console.log(`头像原图:${face}`);
    return { url: face, referer: `https://space.bilibili.com/${src}` };
  }
  if (/^https?:\/\//i.test(src)) return { url: src, referer: 'https://www.bilibili.com/' };
  if (existsSync(src)) return { file: path.resolve(src) };
  throw new Error(`既不是 UID、也不是 URL、也不是存在的文件:${src}`);
}

/* ---------- 2. 下载 ---------- */

async function download(url, referer, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer } });
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error('下载到的内容太小,可能不是图片');
  writeFileSync(dest, buf);
  return buf.length;
}

/* ---------- 3. 缩放 ---------- */

function findFfmpeg() {
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  const r = spawnSync('ffmpeg', ['-version'], { stdio: ['ignore', 'ignore', 'ignore'] });
  return r.error ? null : 'ffmpeg';
}

/**
 * ffmpeg 输出重定向到文件而不是管道 —— 受限沙箱里命名管道会被拦,
 * 而且出错时能看到完整日志。
 */
function runFfmpeg(bin, ffArgs) {
  mkdirSync(tmpDir, { recursive: true });
  const logPath = path.join(tmpDir, 'ffmpeg.log');
  const fd = openSync(logPath, 'w');
  const res = spawnSync(bin, ffArgs, { stdio: ['ignore', fd, fd] });
  closeSync(fd);
  const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  rmSync(logPath, { force: true });
  return { ok: res.status === 0, log };
}

function resize(bin, src, size, dest, { jpeg = false } = {}) {
  // 先按放大倍数居中裁切,再等比缩放并居中裁成正方形(头像往往不是严格正方形)
  const crop = zoom > 1 ? `crop=iw/${zoom}:ih/${zoom},` : '';
  const vf = `${crop}scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size}`;
  const enc = jpeg
    // 站内头像是 CSS 裁圆的,不需要透明通道,JPEG 比 PNG 小一个数量级
    ? ['-q:v', '3']
    // 图标要清晰,用无损 PNG;去掉 alpha 再压满压缩级别
    : ['-pix_fmt', 'rgb24', '-compression_level', '100'];
  const r = runFfmpeg(bin, ['-y', '-i', src, '-vf', vf, '-frames:v', '1', ...enc, dest]);
  if (!r.ok) {
    console.error(`  ✗ 生成 ${path.basename(dest)} 失败:`);
    console.error(r.log.split('\n').slice(-6).join('\n'));
    return false;
  }
  return true;
}

/* ---------- 4. 改主题配置 ---------- */

function updateThemeConfig({ favicon, appleTouchIcon, avatar }) {
  let text = readFileSync(themeConfig, 'utf8');
  const setKey = (src, key, value) => {
    const re = new RegExp(`^(\\s*${key}:\\s*).*$`, 'm');
    if (re.test(src)) return src.replace(re, `$1${value}`);
    // keys 不存在就插到 avatar 后面
    const anchor = /^(\s*avatar:.*)$/m;
    return anchor.test(src) ? src.replace(anchor, `$1\n  ${key}: ${value}`) : src;
  };

  text = setKey(text, 'favicon', `'${favicon}'`);
  text = setKey(text, 'appleTouchIcon', appleTouchIcon ? `'${appleTouchIcon}'` : "''");
  if (avatar) text = setKey(text, 'avatar', `'${avatar}'`);
  writeFileSync(themeConfig, text, 'utf8');
}

/* ---------- 主流程 ---------- */

mkdirSync(imgDir, { recursive: true });
mkdirSync(assetsDir, { recursive: true });

const source = await resolveSource(input);
const original = path.join(assetsDir, 'avatar-source.jpg');

if (source.file) {
  copyFileSync(source.file, original);
  console.log(`本地文件:${source.file}`);
} else {
  const bytes = await download(source.url, source.referer, original);
  console.log(`已下载:avatar-source.jpg  ${(bytes / 1024).toFixed(0)} KB`);
}

const ffmpegBin = findFfmpeg();
const sizes = [['favicon-32.png', 32], ['apple-touch-icon.png', 180]];

if (rawOnly || !ffmpegBin) {
  if (!ffmpegBin && !rawOnly) {
    console.log('\n⚠️  没找到 ffmpeg,没法缩放尺寸。');
    console.log('   会把原图直接当成图标用 —— 体积偏大(每页都会加载)。');
    console.log('   装好 ffmpeg 后重跑一次即可,或者手动执行:');
    console.log(`   ffmpeg -i ${original} -vf "scale=32:32" favicon-32.png`);
  }
  copyFileSync(original, path.join(imgDir, 'favicon-32.png'));
  copyFileSync(original, path.join(imgDir, 'apple-touch-icon.png'));
  console.log('\n已生成(未缩放):');
  console.log(`  favicon-32.png        ${kb(path.join(imgDir, 'favicon-32.png'))}`);
  console.log(`  apple-touch-icon.png  ${kb(path.join(imgDir, 'apple-touch-icon.png'))}`);
  updateThemeConfig({ favicon: '/img/favicon-32.png', appleTouchIcon: '/img/apple-touch-icon.png', avatar: null });
  process.exit(0);
}

console.log(`\n缩放中(ffmpeg,lanczos)…${zoom > 1 ? ` 放大裁切 ${zoom}×` : ''}`);
const results = [];
for (const [name, size] of sizes) {
  const dest = path.join(imgDir, name);
  if (resize(ffmpegBin, original, size, dest)) {
    results.push([name, `${size}×${size}`, statSync(dest).size]);
  }
}

let avatarPath = null;
if (wantAvatar) {
  const dest = path.join(imgDir, 'avatar.jpg');
  if (resize(ffmpegBin, original, 256, dest, { jpeg: true })) {
    results.push(['avatar.jpg', '256×256', statSync(dest).size]);
    avatarPath = '/img/avatar.jpg';
  }
}

console.log('\n生成结果:');
for (const [name, dim, bytes] of results) {
  console.log(`  ${name.padEnd(22)} ${dim.padEnd(9)} ${(bytes / 1024).toFixed(1)} KB`);
}
console.log(`  ${'avatar-source.jpg'.padEnd(22)} ${'原图'.padEnd(8)} ${kb(original)}`);

updateThemeConfig({
  favicon: '/img/favicon-32.png',
  appleTouchIcon: '/img/apple-touch-icon.png',
  avatar: avatarPath,
});

console.log('\n主题配置已更新(themes/cos-cross/_config.yml → profile):');
console.log("  favicon        = '/img/favicon-32.png'");
console.log("  appleTouchIcon = '/img/apple-touch-icon.png'");
if (avatarPath) console.log(`  avatar         = '${avatarPath}'`);

if (!wantAvatar) {
  console.log('\n站内头像(导航和首页那个圆形的)还是原来的 SVG。想一起换成 B 站头像:');
  console.log(`  node tools/import-avatar.mjs ${input} --avatar`);
}
if (zoom <= 1) {
  console.log('\n提示:32px 的标签页图标很小,如果细节糊成一团,可以放大裁切到人物:');
  console.log(`  node tools/import-avatar.mjs ${input} --zoom 1.8${wantAvatar ? ' --avatar' : ''}`);
}
console.log('\n然后:npm run check && npm run deploy');
