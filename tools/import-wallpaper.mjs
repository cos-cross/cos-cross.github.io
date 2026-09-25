/**
 * 从 Wallpaper Engine 导入壁纸,作为博客背景。
 *
 * 用法:
 *   node tools/import-wallpaper.mjs 2903241954          # 创意工坊 ID
 *   node tools/import-wallpaper.mjs "D:\\...\\431960\\2903241954"   # 或直接给目录
 *   node tools/import-wallpaper.mjs --list              # 列出本机所有壁纸
 *   node tools/import-wallpaper.mjs 2903241954 --duration 8 --width 1280
 *
 * 能做什么、不能做什么:
 *   - type: video → 视频文件能直接当网页背景用,会顺手压成 720p 的 mp4  ✅
 *   - type: web   → 把整个 web 壁纸目录复制过来,可以再嵌进 iframe      ⚠️ 需要手动接
 *   - type: scene → 动作是 Wallpaper Engine 引擎实时渲染的,导不出来。
 *                   退回用 preview.gif(壁纸自带的预览动图)当背景      ⚠️ 降级
 *
 * 关于 ffmpeg:装了就用它压缩和抽封面(强烈建议);没装就直接复制原文件,
 * 并打印出可以手动执行的命令。找 ffmpeg 的顺序:环境变量 FFMPEG → PATH。
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync,
  readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mediaDir = path.join(root, 'source', 'media');
const themeConfig = path.join(root, 'themes', 'cos-cross', '_config.yml');
const tmpDir = path.join(root, '.wallpaper-tmp');

const WALLPAPER_ENGINE_APPID = '431960'; // Steam 上 Wallpaper Engine 的 AppID
const args = process.argv.slice(2);

const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);
const input = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--duration'
  && args[args.indexOf(a) - 1] !== '--width' && args[args.indexOf(a) - 1] !== '--crf');

const TARGET_WIDTH = Number(flag('width', 1280));
const MAX_DURATION = Number(flag('duration', 0)); // 0 = 保留完整时长
const CRF = Number(flag('crf', 30));

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const sizeOf = (f) => (existsSync(f) ? statSync(f).size : 0);

/* ---------- Steam 库定位 ---------- */

function steamRoots() {
  const roots = new Set();
  if (process.env.STEAM_PATH) roots.add(process.env.STEAM_PATH);

  for (const p of [
    'C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam',
    'D:\\Steam', 'E:\\Steam', 'F:\\Steam', 'G:\\Steam',
    'D:\\Program Files (x86)\\Steam', 'E:\\Program Files (x86)\\Steam',
    'D:\\Program Files\\Steam', 'E:\\Program Files\\Steam',
  ]) {
    if (existsSync(path.join(p, 'steamapps'))) roots.add(p);
  }

  // 扫盘符找常见的库目录名
  for (const letter of 'CDEFGHIJ') {
    for (const name of ['SteamLibrary', 'Steam', 'Games\\SteamLibrary', 'Games\\Steam']) {
      const p = `${letter}:\\${name}`;
      if (existsSync(path.join(p, 'steamapps'))) roots.add(p);
    }
  }
  return [...roots];
}

/** 解析 libraryfolders.vdf,拿到所有 Steam 库路径 */
function allLibraries() {
  const libs = new Set(steamRoots());
  for (const r of [...libs]) {
    const vdf = path.join(r, 'steamapps', 'libraryfolders.vdf');
    if (!existsSync(vdf)) continue;
    const text = readFileSync(vdf, 'utf8');
    for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) {
      libs.add(m[1].replace(/\\\\/g, '\\'));
    }
  }
  return [...libs];
}

function workshopDir(lib) {
  return path.join(lib, 'steamapps', 'workshop', 'content', WALLPAPER_ENGINE_APPID);
}

function listWallpapers() {
  const found = [];
  for (const lib of allLibraries()) {
    const dir = workshopDir(lib);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const folder = path.join(dir, entry.name);
      const project = readProject(folder);
      found.push({ id: entry.name, folder, project });
    }
  }
  return found;
}

function readProject(folder) {
  const p = path.join(folder, 'project.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

/* ---------- ffmpeg ---------- */

function findFfmpeg() {
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  const r = spawnSync('ffmpeg', ['-version'], { stdio: ['ignore', 'ignore', 'ignore'] });
  return r.error ? null : 'ffmpeg';
}

/**
 * 跑 ffmpeg。输出重定向到文件而不是管道 ——
 * 一是便于出错时看到完整日志,二是在受限沙箱里命名管道会被拦。
 */
function ffmpeg(bin, ffArgs) {
  mkdirSync(tmpDir, { recursive: true });
  const logPath = path.join(tmpDir, `ffmpeg-${Date.now()}.log`);
  const fd = openSync(logPath, 'w');
  const res = spawnSync(bin, ffArgs, { stdio: ['ignore', fd, fd] });
  closeSync(fd);
  const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  rmSync(logPath, { force: true });
  return { ok: res.status === 0, log };
}

/** 从 ffmpeg 的日志里读时长(秒) */
function parseDuration(log) {
  const m = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/* ---------- 导入 ---------- */

function ensureMediaDir() {
  mkdirSync(mediaDir, { recursive: true });
}

/** 压缩视频并抽一张封面 */
function importVideo(folder, file, ffmpegBin) {
  const srcPath = path.join(folder, file);
  const outVideo = path.join(mediaDir, 'background.mp4');
  const outPoster = path.join(mediaDir, 'background.jpg');

  if (!ffmpegBin) {
    copyFileSync(srcPath, outVideo);
    const preview = findPreviewImage(folder);
    if (preview) copyFileSync(preview, outPoster);
    return { video: '/media/background.mp4', poster: preview ? '/media/background.jpg' : '', compressed: false, srcSize: sizeOf(srcPath) };
  }

  const vf = [`scale='min(${TARGET_WIDTH},iw)':-2`, 'fps=30'];
  const ffArgs = ['-y', '-i', srcPath];
  if (MAX_DURATION > 0) ffArgs.push('-t', String(MAX_DURATION));
  ffArgs.push(
    '-an',                       // 背景视频不需要声音
    '-vf', vf.join(','),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', String(CRF),
    '-pix_fmt', 'yuv420p',       // 兼容性最好的像素格式
    '-movflags', '+faststart',   // moov 前置,边下边播
    outVideo,
  );

  const enc = ffmpeg(ffmpegBin, ffArgs);
  if (!enc.ok) {
    console.error('ffmpeg 压缩失败,退回直接复制原文件。日志末尾:');
    console.error(enc.log.split('\n').slice(-12).join('\n'));
    copyFileSync(srcPath, outVideo);
    return { video: '/media/background.mp4', poster: '', compressed: false, srcSize: sizeOf(srcPath) };
  }

  const duration = parseDuration(enc.log);
  const poster = ffmpeg(ffmpegBin, [
    '-y', '-ss', String(Math.min(1, (duration || 2) / 3)), '-i', srcPath,
    '-frames:v', '1', '-vf', `scale='min(1600,iw)':-2`, '-q:v', '4', outPoster,
  ]);

  return {
    video: '/media/background.mp4',
    poster: poster.ok ? '/media/background.jpg' : '',
    compressed: true,
    srcSize: sizeOf(srcPath),
    duration,
  };
}

function findPreviewImage(folder) {
  for (const name of ['preview.jpg', 'preview.png', 'preview.jpeg']) {
    const p = path.join(folder, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** 读 GIF / PNG / JPEG 的像素尺寸,用来判断预览图够不够大 */
function imageSize(file) {
  const buf = readFileSync(file);
  if (buf.length > 10 && buf.slice(0, 3).toString('latin1') === 'GIF') {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** scene / application 类型导不出来,退回用自带预览图 */
function importPreview(folder) {
  const preview = findPreviewImage(folder);
  if (preview) {
    copyFileSync(preview, path.join(mediaDir, 'background.jpg'));
    return { video: '', poster: '/media/background.jpg', kind: '静态预览图 (preview.jpg)', src: preview };
  }
  const gif = path.join(folder, 'preview.gif');
  if (existsSync(gif)) {
    copyFileSync(gif, path.join(mediaDir, 'background.gif'));
    return { video: '', poster: '/media/background.gif', kind: '动态预览图 (preview.gif)', src: gif };
  }
  return null;
}

/* ---------- 改主题配置 ---------- */

function updateThemeConfig({ mode, video, poster }) {
  let text = readFileSync(themeConfig, 'utf8');
  const start = text.indexOf('\nbackground:');
  if (start < 0) {
    console.error('主题配置里找不到 background: 段落,请手动填写。');
    return false;
  }
  // background 段落一直到文件结尾(它是最后一个顶级配置)
  const head = text.slice(0, start);
  let block = text.slice(start);

  const setKey = (src, key, value) => {
    const re = new RegExp(`^(\\s*${key}:\\s*).*$`, 'm');
    const line = `${key}: ${value}`;
    return re.test(src) ? src.replace(re, `$1${value}`) : src;
  };

  block = setKey(block, 'mode', mode);
  block = setKey(block, 'video', video ? `'${video}'` : "''");
  block = setKey(block, 'poster', poster ? `'${poster}'` : "''");
  block = setKey(block, 'image', "''");

  writeFileSync(themeConfig, head + block, 'utf8');
  return true;
}

/* ---------- 主流程 ---------- */

if (has('list') || !input) {
  const all = listWallpapers();
  if (!all.length) {
    console.log('没有找到 Wallpaper Engine 的创意工坊内容。');
    console.log('确认 Steam 里装了 Wallpaper Engine,并且下载过壁纸。');
    console.log('也可以直接指定目录:node tools/import-wallpaper.mjs "D:\\...\\431960\\<ID>"');
    process.exit(input ? 1 : 0);
  }
  console.log(`找到 ${all.length} 张壁纸:\n`);
  for (const w of all) {
    const type = (w.project && w.project.type) || '(预设/依赖)';
    const title = (w.project && w.project.title) || '(无标题)';
    const usable = type === 'video' ? '可直接用 ✅'
      : type === 'web' ? '需手动嵌入 ⚠️'
        : '只能降级用预览图 ⚠️';
    console.log(`  ${w.id}  [${type}]  ${title}`);
    console.log(`      ${usable}   ${w.folder}`);
  }
  console.log('\n用法:node tools/import-wallpaper.mjs <ID>   (或 npm run wallpaper -- <ID>)');
  process.exit(0);
}

// 解析输入:ID 或目录
let folder = null;
let entry = null;
if (/^\d+$/.test(input)) {
  const all = listWallpapers();
  entry = all.find((w) => w.id === input);
  if (!entry) {
    console.error(`没有找到 ID 为 ${input} 的壁纸。先跑一次 --list 看看有哪些。`);
    process.exit(1);
  }
  folder = entry.folder;
} else if (existsSync(input)) {
  folder = path.resolve(input);
  entry = { id: path.basename(folder), folder, project: readProject(folder) };
} else {
  console.error(`既不是创意工坊 ID 也不是存在的目录:${input}`);
  process.exit(1);
}

const project = entry.project || {};
const type = project.type || '';
const title = project.title || '(无标题)';

console.log(`壁纸:${title}`);
console.log(`类型:${type || '未标注(可能是预设或依赖其它壁纸)'}`);
console.log(`目录:${folder}\n`);

ensureMediaDir();

let result;
if (type === 'video' && project.file) {
  const src = path.join(folder, project.file);
  if (!existsSync(src)) {
    console.error(`project.json 指向的视频文件不存在:${src}`);
    process.exit(1);
  }
  const ffmpegBin = findFfmpeg();
  console.log(`源视频:${project.file}  ${mb(sizeOf(src))}`);
  if (ffmpegBin) {
    console.log('正在压缩(720p / 无音轨 / faststart)…');
  } else {
    console.log('没找到 ffmpeg,直接复制原文件(体积会偏大)。');
    console.log('  装好 ffmpeg 后可以重新跑一次,或者手动执行:');
    console.log(`  ffmpeg -y -i "${src}" -an -vf "scale='min(1280,iw)':-2,fps=30" -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart source/media/background.mp4`);
  }
  result = importVideo(folder, project.file, ffmpegBin);
  console.log(`\n视频:${result.video}  ${mb(sizeOf(path.join(mediaDir, 'background.mp4')))}` +
    (result.compressed ? `  (原 ${mb(result.srcSize)} → 压到 ${mb(sizeOf(path.join(mediaDir, 'background.mp4')))})` : ''));
  if (result.duration) console.log(`时长:${result.duration.toFixed(1)} 秒`);
  if (result.poster) console.log(`封面:${result.poster}  ${kb(sizeOf(path.join(mediaDir, 'background.jpg')))}`);
} else if (type === 'web') {
  const dest = path.join(mediaDir, 'wallpaper-web');
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const e of readdirSync(folder)) {
    if (e === 'project.json') continue;
    copyFileSync(path.join(folder, e), path.join(dest, e));
  }
  console.log(`web 壁纸已复制到 source/media/wallpaper-web/`);
  console.log('这类壁纸是一整个网页,主题没有内置 iframe 容器,');
  console.log('可以在文章或页面里用 <iframe src="/media/wallpaper-web/index.html"> 自行嵌入。');
  process.exit(0);
} else {
  console.log('这类壁纸由 Wallpaper Engine 引擎实时渲染,导出不了原始动作。');
  console.log('退回使用壁纸自带的预览图。');
  result = importPreview(folder);
  if (!result) {
    console.error('这个目录里没有 preview.jpg / preview.gif,没法降级。');
    console.error('建议用 Wallpaper Engine 本身截一张图或录一段屏,再手动放进 source/media/。');
    process.exit(1);
  }
  const dim = imageSize(result.src);
  console.log(`已导入:${result.poster}  (${result.kind},${kb(sizeOf(path.join(mediaDir, path.basename(result.poster))))})`);

  // Wallpaper Engine 的 preview 只是列表缩略图,常见只有 160~250 px
  if (dim && dim.w < 800) {
    console.log(`\n⚠️  这张预览图只有 ${dim.w}×${dim.h},拉到全屏会非常糊。`);
    console.log('   两个办法:');
    console.log('   1. 把模糊开大,当成抽象色块用 —— 在 _config.yml 里设 background.blur: 40');
    console.log('   2. 用 Wallpaper Engine 录一段屏(或用系统录屏),存成 mp4 后手动放到 source/media/background.mp4,');
    console.log('      再把 _config.yml 的 background.video 指向它 —— 这是唯一能保住原画质的路子。');
  }
}

const mode = 'media';
if (updateThemeConfig({ mode, video: result.video, poster: result.poster })) {
  console.log('\n主题配置已更新:themes/cos-cross/_config.yml');
  console.log(`  background.mode   = ${mode}`);
  console.log(`  background.video  = ${result.video || "''"}`);
  console.log(`  background.poster = ${result.poster || "''"}`);
}

const finalSize = sizeOf(path.join(mediaDir, result.video ? 'background.mp4' : path.basename(result.poster)));
if (finalSize > 6 * 1024 * 1024) {
  console.log(`\n⚠️  背景资源 ${mb(finalSize)},偏大。可以调小一点:`);
  console.log('   node tools/import-wallpaper.mjs <ID> --width 960 --crf 32 --duration 10');
}

console.log('\n下一步:');
console.log('  npm run server    本地看看效果(不满意就调 _config.yml 里的 overlay / blur)');
console.log('  npm run deploy    发布');
