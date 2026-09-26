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
 * ⚠️ 分两阶段,而且**公式必须在 Markdown 之前抽出来**(见 tools/math-scan.cjs 的说明):
 *   before_post_render  从原始 Markdown 里把 $...$ / $$...$$ 换成自包含占位 span
 *   after_post_render   把占位 span 换成 KaTeX 的 HTML,并兜底处理漏网的公式
 *
 *   只在 after_post_render 做是不行的:那时 marked 已经把 `\\` 吃成 `\`、
 *   把公式里的换行变成 `<br>` 了,多行公式 / aligned / array 全渲染不出来。
 */
const katex = require('katex');
const { extractMath, decodeTex, PLACEHOLDER_RE } = require('../tools/math-scan.cjs');

/**
 * after_post_render 兜底时,需要原样保护、绝不参与公式解析的片段。
 * figure.highlight 必须排在 <pre> 前面 —— 它内部有多层 <pre>,
 * 用非贪婪的 <pre>...</pre> 会只吃掉第一层,把代码正文漏出来参与解析。
 */
const PROTECT_RE = /(<figure class="highlight[\s\S]*?<\/figure>|<pre\b[\s\S]*?<\/pre>|<code\b[\s\S]*?<\/code>|<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/gi;

let rendered = 0;
let failed = 0;
let extracted = 0;

/**
 * 还原 HTML 实体。
 * 兜底那条路上,Hexo 会把 `=` 编码成 `&#x3D;`,于是 KaTeX 收到
 * `F(n) &#x3D; F(n-1)` 直接报 `Expected 'EOF', got '&'`。
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
  let source = String(tex);
  // 兜底路径上可能残留 Markdown 塞进来的 <br>(正常路径不会走到)
  if (source.indexOf('<br') !== -1) source = source.replace(/\\?\s*<br\s*\/?>/gi, '\\\\');
  source = decodeEntities(source).replace(/\\\\\s*$/, '').trim();

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

/* ---------- 一、Markdown 之前:把公式换成占位符 ---------- */

hexo.extend.filter.register('before_post_render', function (data) {
  if (!data.content || data.content.indexOf('$') === -1) return data;
  const got = extractMath(data.content);
  if (!got.count) return data;
  extracted += got.count;
  data.content = got.text;
  return data;
});

/* ---------- 二、Markdown 之后:把占位符换成真的公式 ---------- */

hexo.extend.filter.register('after_post_render', function (data) {
  if (!data.content || data.content.indexOf('$') === -1
    && data.content.indexOf('dsh-math') === -1) return data;

  const phRe = new RegExp(PLACEHOLDER_RE, 'g');

  // 1) 独占一段的块级公式:把外层的 <p> 一起去掉,
  //    免得块级元素套在段落里被压出一堆多余的行距。
  data.content = data.content.replace(
    new RegExp(`<p>\\s*${PLACEHOLDER_RE.replace('data-display="([01])"', 'data-display="1"')}\\s*</p>`, 'g'),
    (m, tex) => render(decodeTex(tex), true),
  );

  // 2) 其余占位符(行内、以及夹在文字中间的块级)
  data.content = data.content.replace(phRe, (m, tex, disp) => render(decodeTex(tex), disp === '1'));

  // 3) 兜底:还有漏网的 $...$ 就按老规矩处理
  if (data.content.indexOf('$') === -1) return data;

  const store = [];
  let html = data.content.replace(PROTECT_RE, (m) => {
    store.push(m);
    return `\u0000P${store.length - 1}\u0000`;
  });

  html = html.replace(/<p>\s*\$\$([\s\S]+?)\$\$\s*<\/p>/g, (m, tex) => render(tex, true));
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (m, tex) => render(tex, true));
  html = html.replace(/\$([^\s$][^$\n]*?[^\s$]|[^\s$])\$/g, (m, tex) => render(tex, false));

  data.content = html.replace(/\u0000P(\d+)\u0000/g, (m, i) => store[Number(i)]);
  return data;
});

hexo.extend.filter.register('after_generate', function () {
  if (extracted || rendered || failed) {
    hexo.log.info('math: 抽取 %d 条,渲染 %d 条%s',
      extracted, rendered, failed ? `,${failed} 条有语法错误` : '');
  }
});

hexo.log.info('math: 已启用(构建期用 KaTeX 渲染 $...$ 和 $$...$$)');
