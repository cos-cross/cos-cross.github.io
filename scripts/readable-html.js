/**
 * Hexo 侧注册:`readable_html(html)`。
 *
 * 模板里凡是要"把正文抽成纯文本"的地方,都应该先过它再过 strip_html:
 *   - post.ejs   目录(toc)与阅读时长
 *   - post-card.ejs / archive.ejs  阅读时长与摘要
 *   - _partial/head.ejs            meta description
 *
 * 具体为什么需要它(KaTeX 隐藏层导致目录标题重影、内联 script 数据撑爆阅读时长),
 * 见 tools/readable-html.cjs 的注释。
 *
 * 和 scripts/plot.js 一样,这个文件也可能被别处 require,所以注册前先确认真的在 Hexo 里。
 */
const { readableHtml, stripHiddenMath } = require('../tools/readable-html.cjs');

if (typeof hexo !== 'undefined' && hexo && hexo.extend && hexo.extend.helper) {
  hexo.extend.helper.register('readable_html', readableHtml);
}

module.exports = { readableHtml, stripHiddenMath };
