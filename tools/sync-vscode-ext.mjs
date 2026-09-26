/**
 * 把主题里的绘图代码同步到 VSCode 预览插件。
 *
 * 为什么是"生成"而不是"复制粘贴一份" —— 渲染器只能有一份。
 * 预览里画的图和网站上画的图必须是同一份 plot.js,不然迟早出现
 * "编辑器里好好的、网站上不对"(或反过来)这种最难查的问题。
 *
 * 生成三样东西:
 *   vscode-plot-preview/preview/plot.js        ← themes/cos-cross/source/js/plot.js
 *   vscode-plot-preview/vendor/plot-build.cjs  ← scripts/plot.js(代码块 → 容器 HTML)
 *   vscode-plot-preview/preview/plot.css       ← 主题 style.css 里的变量 + 绘图那一段
 *
 * tools/test-vscode.mjs 会核对这三份是不是最新,改完主题忘了同步的话测试会红。
 *
 * 用法:node tools/sync-vscode-ext.mjs [--check]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ext = path.join(root, 'vscode-plot-preview');
const checkOnly = process.argv.includes('--check');

const outputs = [];

function emit(relPath, content) {
  const full = path.join(ext, relPath);
  const old = existsSync(full) ? readFileSync(full, 'utf8') : null;
  const changed = old !== content;
  if (!checkOnly && changed) {
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  outputs.push({ relPath, changed, isNew: old === null });
  return changed;
}

/* ---------- 1. 渲染核心 ---------- */

const plotJs = readFileSync(path.join(root, 'themes', 'cos-cross', 'source', 'js', 'plot.js'), 'utf8');
emit('preview/plot.js', plotJs);

/* ---------- 2. 代码块 → 容器 HTML 的构建器 ---------- */

const builder = readFileSync(path.join(root, 'scripts', 'plot.js'), 'utf8');
emit('vendor/plot-build.cjs', builder);

/* ---------- 3. 样式 ---------- */

const css = readFileSync(path.join(root, 'themes', 'cos-cross', 'source', 'css', 'style.css'), 'utf8');
const cssLines = css.split('\n');

/** 从 `marker` 那一行开始,取到第一个顶格的 `}`(包含) */
function blockFrom(marker, from = 0) {
  const start = cssLines.findIndex((l, i) => i >= from && l.includes(marker));
  if (start < 0) throw new Error(`style.css 里找不到 ${marker}`);
  const open = cssLines.findIndex((l, i) => i >= start && l.trimEnd().endsWith('{'));
  let end = open;
  while (end < cssLines.length && cssLines[end].trim() !== '}') end += 1;
  return { text: cssLines.slice(start, end + 1).join('\n'), end: end + 1 };
}

/** 取一段以注释分隔的样式区(两条 `/* ---------- ` 之间) */
function section(markerText) {
  const start = cssLines.findIndex((l) => l.includes(markerText));
  if (start < 0) throw new Error(`style.css 里找不到 ${markerText}`);
  let end = start + 1;
  while (end < cssLines.length && !cssLines[end].startsWith('/* ---------- ')) end += 1;
  return cssLines.slice(start, end).join('\n').trimEnd();
}

// 变量:把 `:root` 换成 `.plot`,只作用于图,不去污染 VSCode 预览的全局样式
const vars = blockFrom(':root {').text.replace(/^:root\s*\{/, '.plot {');
const lightVars = blockFrom('[data-theme="light"] {').text
  .replace(/^\[data-theme="light"\]\s*\{/, 'body.vscode-light .plot {');
const plotSection = section('函数图像(scripts/plot.js')
  .replace(/\[data-theme="light"\]/g, 'body.vscode-light');

const header = [
  '/*',
  ' * 自动生成,别手改 —— 改主题的 themes/cos-cross/source/css/style.css,',
  ' * 然后跑 `npm run vscode:sync`。',
  ' * 内容 = 主题的设计变量(限定在 .plot 上)+ 绘图那一段样式 + 预览专有的报错框。',
  ' */',
  '',
].join('\n');

/**
 * 报错框只在预览里有(网站上解析失败是构建期报错,页面根本不会生成),
 * 所以这段是写死在同步脚本里的。前面的前缀写清楚,免得以后有人去找它出自主题哪一段。
 */
const errorBoxCss = `
/* 预览专有:代码块解析失败时的红框(不是从主题同步来的) */
.plot-preview-error {
  border: 1px solid rgba(255, 107, 107, .5);
  border-left-width: 4px;
  border-radius: 8px;
  background: rgba(255, 107, 107, .08);
  padding: 10px 14px;
  margin: 1em 0;
  font: 13px/1.6 var(--vscode-editor-font-family, monospace);
}
.plot-preview-error-title { font-weight: 700; color: #ff6b6b; margin-bottom: 6px; }
.plot-preview-error-msg,
.plot-preview-error-src {
  margin: 6px 0 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, .25);
  white-space: pre-wrap;
  overflow-x: auto;
}
.plot-preview-error-msg { color: #ffb4b4; }
.plot-preview-error-hint { margin-top: 8px; color: var(--text-3); }
.plot-preview-error-src { color: var(--text-2); }
`;

emit('preview/plot.css', `${header}${vars}\n\n${lightVars}\n\n${plotSection}\n${errorBoxCss}`);

/* ---------- 结果 ---------- */

const stale = outputs.filter((o) => o.changed);
if (checkOnly) {
  if (stale.length) {
    console.error('❌ VSCode 插件里的副本不是最新的:');
    stale.forEach((o) => console.error(`   - vscode-plot-preview/${o.relPath}`));
    console.error('   跑一下:npm run vscode:sync');
    process.exit(1);
  }
  console.log(`✅ VSCode 插件与主题一致(${outputs.length} 个文件)`);
} else {
  outputs.forEach((o) => {
    console.log(`   ${o.changed ? (o.isNew ? '新建' : '更新') : '不变'}  vscode-plot-preview/${o.relPath}`);
  });
  console.log(stale.length ? `同步完成,${stale.length} 个文件有变化。` : '已经是最新的。');
}
