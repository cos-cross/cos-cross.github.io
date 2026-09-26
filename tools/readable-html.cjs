/**
 * 从渲染完的 HTML 里取"读者真的看得到的文字"。
 *
 * 起因(2026-xx):笔记里标题写成 `### $D_3$、$D_4$区:完整算一遍`,
 * 侧边目录那一行会变成 `D3D_3D3、D4D_4D4区:完整算一遍`。
 *
 * 原因:KaTeX 每渲染一个公式会吐出两层文字 ——
 *   <span class="katex-mathml">  隐藏层:MathML 字形(D、3)+ TeX 注解(D_3),屏读器用,眼睛不看
 *   <span class="katex-html">    可见层:真正画出来的字形(D、3)
 * 而 Hexo 的 toc() 最后是用 htmlparser2 的 textContent() 抽标题文字的,
 * 两层一视同仁地串起来,一个 $D_3$ 就贡献了 `D` `3` `D_3` `D` `3` 五段 → 目录标题重影。
 * (标题的 id 不受影响:它是 Markdown 渲染时用我们的占位 span 生成的,所以锚点一直是好的。)
 *
 * 同一套"抽纯文本"的逻辑还被用来算"预计阅读时长"(post.ejs / post-card.ejs / archive.ejs),
 * 那里更夸张:plot 的内联 <script type="application/json"> 数据、<style> 正文
 * 全被当成"字"数进去了,那篇数学笔记被算成 99 分钟(实际约 20 分钟)。
 *
 * 所以这里统一成一个入口:去掉隐藏层、去掉脚本/样式正文、去掉零宽空格,
 * 剩下的再交给 Hexo 的 strip_html。
 */

/** KaTeX 隐藏层的开标签(允许属性顺序变化,所以用正则找) */
const HIDDEN_MATH_OPEN_RE = /<span\b[^>]*class="katex-mathml"[^>]*>/g;

/** 脚本/样式正文不算阅读内容;反向引用保证 <script> 配 </script> */
const SCRIPT_OR_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/**
 * 零宽字符:KaTeX 的 vlist 里塞了不少 &#8203;,
 * 肉眼看不见但会被复制、被算进字数。
 */
const ZERO_WIDTH_RE = /[\u200b\u200c\u200d\u2060\ufeff]/g;

/**
 * 删掉 KaTeX 的隐藏 MathML 层,只留可见的字形层。
 *
 * 不能用 `<span class="katex-mathml">[\s\S]*?<\/span>` 直接偷懒:
 * 万一层里出现嵌套 <span>,非贪婪匹配会提前收工,把半截标签留在正文里。
 * 这里按标签配平扫描,并且**遇到不配平就原样放弃**(宁可不清,也不能吃掉后文)。
 */
function stripHiddenMath(html) {
  const src = String(html == null ? '' : html);
  if (src.indexOf('katex-mathml') === -1) return src;

  let out = '';
  let cursor = 0;
  for (;;) {
    HIDDEN_MATH_OPEN_RE.lastIndex = cursor;
    const open = HIDDEN_MATH_OPEN_RE.exec(src);
    if (!open) {
      out += src.slice(cursor);
      return out;
    }
    out += src.slice(cursor, open.index);

    let depth = 1;
    let i = open.index + open[0].length;
    let balanced = true;
    while (depth > 0) {
      const nextOpen = src.indexOf('<span', i);
      const nextClose = src.indexOf('</span>', i);
      if (nextClose === -1) {
        balanced = false;
        break;
      }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        i = nextOpen + 5;
      } else {
        depth -= 1;
        i = nextClose + 7;
      }
    }
    if (!balanced) {
      // 结构不对,原样留下,继续往后找(不要吞掉文档剩余部分)
      out += src.slice(open.index);
      return out;
    }
    cursor = i;
  }
}

/** 去掉隐藏层 + 脚本样式正文 + 零宽字符,得到"可以拿去抽纯文本"的 HTML */
function readableHtml(html) {
  return stripHiddenMath(html)
    .replace(SCRIPT_OR_STYLE_RE, '')
    .replace(ZERO_WIDTH_RE, '');
}

module.exports = { stripHiddenMath, readableHtml, HIDDEN_MATH_OPEN_RE };
