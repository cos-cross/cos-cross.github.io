/**
 * 从**原始 Markdown** 里把 `$...$` / `$$...$$` 抽出来。
 *
 * 为什么必须在 Markdown 之前抽(这是踩过的坑):
 *   Hexo 先跑 marked 再跑我们的 after_post_render,而 marked 会
 *     1. 把 `\\`(LaTeX 换行)当成 Markdown 的转义,变成单个 `\`;
 *     2. 把公式里的换行变成 `<br>`。
 *   于是 KaTeX 收到的是 `a = b \<br>c = d`,渲染出来是一堆红色 `<br>` 文本 ——
 *   多行公式、`aligned`、`array` 全都废掉。所以要在 marked 之前就换掉。
 *
 * 占位符是**自包含**的:TeX 用 base64 塞在 data 属性里,不依赖任何跨阶段的全局状态,
 * 所以并行渲染多个文档也不会串。
 *
 * 这里只做纯字符串处理,不碰 hexo,方便单独写单测(tools/test-math.mjs)。
 */

/** 这些区域里的 `$` 不是公式,扫描时要整段跳过 */
const SKIP_PATTERNS = [
  /<hexoPostRenderCodeBlock>[\s\S]*?<\/hexoPostRenderCodeBlock>/y,
  /<!--[\s\S]*?-->/y,
  /<script\b[\s\S]*?<\/script>/iy,
  /<style\b[\s\S]*?<\/style>/iy,
  /<pre\b[\s\S]*?<\/pre>/iy,
  /<code\b[\s\S]*?<\/code>/iy,
];

/** 反引号代码段:`` `x` `` 或 ``` ``x`` ``` */
function codeSpanEnd(s, i) {
  let n = 0;
  while (s[i + n] === '`') n += 1;
  const fence = '`'.repeat(n);
  const end = s.indexOf(fence, i + n);
  if (end < 0) return i + n;
  return end + n;
}

/** 数一下这个位置前面有几个连续反斜杠(奇数个说明这个 $ 是被转义的) */
function backslashesBefore(s, i) {
  let n = 0;
  while (i - n - 1 >= 0 && s[i - n - 1] === '\\') n += 1;
  return n;
}

/**
 * 行内公式的判据沿用老规则:内容非空、首尾都不是空白、不含换行。
 * 这样「花了 $5 到 $10」不会被误判成公式。
 */
function tryInline(s, i) {
  // 找同一行里下一个 $
  let j = i + 1;
  if (j >= s.length || /\s/.test(s[j]) || s[j] === '$') return null;
  while (j < s.length) {
    const c = s[j];
    if (c === '\n') return null;
    if (c === '$') {
      if (j === i + 1) return null;
      if (/\s/.test(s[j - 1])) return null;
      if (backslashesBefore(s, j) % 2 === 1) { j += 1; continue; }
      return { tex: s.slice(i + 1, j), end: j + 1 };
    }
    j += 1;
  }
  return null;
}

function makePlaceholder(tex, display) {
  const b64 = Buffer.from(tex, 'utf8').toString('base64');
  return `<span class="dsh-math" data-tex="${b64}" data-display="${display ? 1 : 0}"></span>`;
}

/** 还原占位符里的 TeX */
function decodeTex(b64) {
  return Buffer.from(b64, 'base64').toString('utf8');
}

/** 占位符的匹配式(捕获组:1=base64 的 TeX,2=是不是行间公式) */
const PLACEHOLDER_RE = '<span class="dsh-math" data-tex="([A-Za-z0-9+/=]*)" data-display="([01])"></span>';

/**
 * 把 Markdown 里的公式换成自包含的占位 span。
 * 返回 { text, count, display }。
 */
function extractMath(markdown) {
  const s = String(markdown);
  let out = '';
  let i = 0;
  let count = 0;
  let display = 0;

  while (i < s.length) {
    // 1) 该跳过的区域
    let skipped = null;
    for (const re of SKIP_PATTERNS) {
      re.lastIndex = i;
      const m = re.exec(s);
      if (m && m.index === i) { skipped = m[0]; break; }
    }
    if (skipped) { out += skipped; i += skipped.length; continue; }

    // 2) 反引号代码段
    if (s[i] === '`') {
      const end = codeSpanEnd(s, i);
      out += s.slice(i, end);
      i = end;
      continue;
    }

    // 3) 公式
    if (s[i] === '$' && backslashesBefore(s, i) % 2 === 0) {
      if (s[i + 1] === '$') {
        const close = s.indexOf('$$', i + 2);
        if (close > 0) {
          const tex = s.slice(i + 2, close);
          if (tex.trim()) {
            out += makePlaceholder(tex, true);
            count += 1;
            display += 1;
            i = close + 2;
            continue;
          }
        }
      } else {
        const hit = tryInline(s, i);
        if (hit && hit.tex.trim()) {
          out += makePlaceholder(hit.tex, false);
          count += 1;
          i = hit.end;
          continue;
        }
      }
    }

    out += s[i];
    i += 1;
  }

  return { text: out, count, display };
}

module.exports = { extractMath, decodeTex, makePlaceholder, PLACEHOLDER_RE };
