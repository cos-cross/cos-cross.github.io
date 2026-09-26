/**
 * VSCode 扩展入口:把 plot2d / plot3d 代码块接进自带的 Markdown 预览。
 *
 * 预览用的是 markdown-it,扩展通过 `extendMarkdownIt` 拿到它的实例。
 * 我们只覆盖 `fence` 规则:认出 plot2d / plot3d 就把它换成
 * 和博客上完全一样的 `<div class="plot">` 容器。
 *
 * 两条关键约束:
 *   1. 容器的 JSON 由 scripts/plot.js 生成(经 tools/sync-vscode-ext.mjs 同步到
 *      vendor/plot-build.cjs)—— 解析规则只有一份,"编辑器里看到的"就是"网站上看到的";
 *   2. 预览的 CSP 不允许正文里的内联 <script>,所以渲染器是靠 package.json 的
 *      `markdown.previewScripts` 注入的,那边 VSCode 会带上正确的 nonce。
 */
const path = require('node:path');

const build = require('./vendor/plot-build.cjs');

/** 让构建器用它自己的渲染核心(它在 Hexo 里是 hexo.theme_dir 那份) */
build.setKit(require('./preview/plot.js'));

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 画不出来时给个能看懂的红框,而不是静默留个代码块 */
function errorBox(problems, code) {
  const detail = problems.length ? escapeHtml(problems.join('\n')) : '没有解析出任何可画的式子';
  return [
    '<div class="plot-preview-error">',
    '<div class="plot-preview-error-title">这张图画不出来</div>',
    `<pre class="plot-preview-error-msg">${detail}</pre>`,
    '<div class="plot-preview-error-hint">这段代码块的内容:</div>',
    `<pre class="plot-preview-error-src">${escapeHtml(code)}</pre>`,
    '</div>',
  ].join('\n');
}

function activate() {
  return {
    extendMarkdownIt(md) {
      const defaultFence = md.renderer.rules.fence
        || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const info = (token.info || '').trim();
        const m = /^(plot2d|plot3d)(?=\s|$)/i.exec(info);
        if (!m) return defaultFence(tokens, idx, options, env, self);

        const kind = m[1].toLowerCase() === 'plot3d' ? '3d' : '2d';
        const optsRaw = build.parseOptions(info.slice(m[1].length).trim());
        const code = token.content.replace(/\s+$/, '');
        const where = (env && env.path) || 'markdown';

        let html = null;
        let problems = [];
        try {
          build.takeProblems(); // 清掉上一次的
          html = build.buildPlotBlock(kind, optsRaw, code, where);
          problems = build.takeProblems();
        } catch (e) {
          problems = [`解析时抛错:${(e && e.message) || e}`];
        }

        return html || errorBox(problems, code);
      };
      return md;
    },
  };
}

module.exports = { activate };
