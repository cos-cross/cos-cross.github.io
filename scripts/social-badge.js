/**
 * Hexo 侧注册:`social_badge_url(item)` —— 见 tools/social-badge.cjs。
 *
 * 模板里这样用(页脚「找到我」、手机端菜单底部都走 _partial/social-badge.ejs):
 *   <img src="<%= social_badge_url(item) %>" alt="<%= item.name %>">
 */
const { badgeUrl } = require('../tools/social-badge.cjs');

if (typeof hexo !== 'undefined' && hexo && hexo.extend && hexo.extend.helper) {
  hexo.extend.helper.register('social_badge_url', badgeUrl);
}

module.exports = { badgeUrl };
