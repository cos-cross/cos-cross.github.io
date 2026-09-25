/**
 * 构建期渲染数学公式(KaTeX)。
 *
 * 为什么放在构建期而不是浏览器里:
 *   - 浏览器渲染要等 JS 下载执行完,页面会先闪一下 `$$F(n) = ...$$` 原文;
 *   - 还得靠作者记得在 front-matter 里写 `math: true` 才会加载 KaTeX,忘了就渲染不出来
 *     (这正是之前踩的坑);
 *   - 构建期渲染后 HTML 里直接就是公式,不依赖 JS,不闪,还省掉 266 KB 客户端脚本。
 *
 * 渲染后的标记里带 class="katex",主题的 head.ejs 就靠这个判断要不要引入 KaTeX 的 CSS,
 * 所以不需要任何开关。
 *
 * ⚠️ 必须挂在 after_post_render(拿到最终 HTML),不能在 before_post_render ——
 *    那个阶段代码块还是 <hexoPostRenderCodeBlock> 占位符,结构完全不同。
 */
const katex = require('katex');

/**
 * 需要原样保护、绝不参与公式解析的片段。
 * figure.highlight 必须排在 <pre> 前面 —— 它内部有多层 <pre>,
 * 用非贪婪的 <pre>...</pre> 会只吃掉第一层,把代码正文漏出来参与解析。
 */
const PROTECT_RE = /(<figure class="highlight[\s\S]*?<\/figure>|<pre\b[\s\S]*?<\/pre>|<code\b[\s\S]*?<\/code>|<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/gi;

let rendered = 0;
let failed = 0;

/**
 * 还原 HTML 实体。
 * 必须做:Hexo 渲染 Markdown 时会把 `=` 编码成 `&#x3D;`,于是 KaTeX 收到的是
 * `F(n) &#x3D; F(n-1)`,直接报 `Expected 'EOF', got '&'`。
 * `&amp;` 一定要最后解,否则 `&amp;lt;` 会被解成 `<` 而不是 `&lt;`。
 */
function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function render(tex, displayMode) {
  const source = decodeEntities(tex).trim();
  try {
    const html = katex.renderToString(source, {
      displayMode,
      throwOnError: false, // 语法错误时输出红色错误标记,而不是让整个构建挂掉
      strict: false,
      trust: false,
    });
    if (html.indexOf('katex-error') !== -1) {
      failed += 1;
      return html;
    }
    rendered += 1;
    return html;
  } catch (e) {
    failed += 1;
    return `<span class="katex-error" style="color:#ff6b6b">公式渲染失败:${String(e.message).replace(/[<>&]/g, '')}</span>`;
  }
}

hexo.extend.filter.register('after_post_render', function (data) {
  if (!data.content || data.content.indexOf('$') === -1) return data;

  // 1. 把不该解析的片段挖出来换成占位符
  const store = [];
  let html = data.content.replace(PROTECT_RE, (m) => {
    store.push(m);
    return `\u0000P${store.length - 1}\u0000`;
  });

  // 2. 独占一段的块级公式:把外层 <p> 一起去掉,免得块级元素套在段落里
  html = html.replace(/<p>\s*\$\$([\s\S]+?)\$\$\s*<\/p>/g, (m, tex) => render(tex, true));

  // 3. 其余块级公式
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (m, tex) => render(tex, true));

  // 4. 行内公式。要求 $ 紧跟非空白、且 $ 前面也不是空白,
  //    这样 "花了 $5 到 $10" 这种不会被误判成公式。
  html = html.replace(/\$([^\s$][^$\n]*?[^\s$]|[^\s$])\$/g, (m, tex) => render(tex, false));

  // 5. 还原被保护的片段
  data.content = html.replace(/\u0000P(\d+)\u0000/g, (m, i) => store[Number(i)]);

  return data;
});

hexo.extend.filter.register('after_generate', function () {
  if (rendered || failed) {
    hexo.log.info('math: 渲染 %d 条公式%s', rendered, failed ? `,${failed} 条有语法错误` : '');
  }
});

hexo.log.info('math: 已启用(构建期用 KaTeX 渲染 $...$ 和 $$...$$)');
