/**
 * Hexo 侧注册:`{% social_badge GitHub %}` 标签。
 *
 * 用在哪:正文里的个人链接,比如「关于」页的 Find Me 板块、项目页那行仓库地址。
 *   - **GitHub**:{% social_badge GitHub %}
 *   - **Bilibili**:{% social_badge Bilibili %}
 *
 * 为什么用标签而不是直接把 shields.io 的图片地址写进 Markdown:
 * 徽章的标签文字、右边那句、配色、图标全都来自主题 _config.yml 的 social 配置,
 * 写死的只有名字;以后改 handle / 换配色不用回头翻每一篇文章。
 *
 * 注意页脚「找到我」和手机端菜单底部**不用**这个 —— 那两处保持原来的
 * 「图标 + 文字」样式,是站点自己的门面,不走徽章。
 *
 * 单个项也支持序号写法 `{% social_badge 1 %}`。
 * URL 拼装与转义规则见 tools/social-badge.cjs(那里有单测)。
 */
const { badgeHtml, findSocial } = require('../tools/social-badge.cjs');

const problems = [];

if (typeof hexo !== 'undefined' && hexo && hexo.extend && hexo.extend.tag) {
  hexo.extend.tag.register('social_badge', function (args) {
    const wanted = (args || []).join(' ').trim();
    const social = (hexo.theme && hexo.theme.config && hexo.theme.config.social) || [];
    const item = findSocial(social, wanted);

    if (!item) {
      // 名字写错时页面会少一块,所以一定要在构建日志里喊出来
      problems.push(`social_badge:主题配置 social 里没有「${wanted}」这一项`);
      return '';
    }
    return badgeHtml(item);
  });

  hexo.extend.filter.register('after_generate', function () {
    if (problems.length) {
      hexo.log.warn('social_badge: %d 个问题:', problems.length);
      problems.forEach((p) => hexo.log.warn('  - %s', p));
    }
  });
}

module.exports = { badgeHtml, findSocial };
