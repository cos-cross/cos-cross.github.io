/**
 * 把主题配置里的社交链接编成 shields.io 的静态徽章 URL。
 *
 * 为什么单独一个模块:shields.io 的静态徽章路径有三条**很容易踩、踩了不报错**的规则 ——
 *   `-` 要写成 `--`(不然徽章会把后半句截断:cos-cross 变成 cos)
 *   `_` 要写成 `__`
 *   空格要写成 `_`
 * 编码错了页面照样出图,只是文字不对,肉眼扫一遍很难发现,所以这里配了单测。
 *
 * 配置字段(都在主题 _config.yml 的 social 里):
 *   name               徽章左边的标签
 *   badge              徽章右边的文字;留空则从 link 里去掉 https:// / mailto: 推一个
 *   badge_color        右边那块的底色(十六进制,带不带 # 都行);默认中性灰
 *   badge_label_color  左边那块的底色;默认就是主题面板那个深色
 *   badge_logo         Simple Icons 的图标名;填 none 表示不要图标
 *   icon               没写 badge_logo 时,按这个推图标(github / bilibili / rss 有图标)
 */
const BADGE_BASE = 'https://img.shields.io/badge/';
const DEFAULT_COLOR = '6e7681';
const DEFAULT_LABEL_COLOR = '0d1017';

/** 主题图标名 → Simple Icons 名。空串 = 那个图标 Simple Icons 里没有,徽章就不带 logo */
const LOGO_FROM_ICON = {
  github: 'github',
  bilibili: 'bilibili',
  rss: 'rss',
  mail: '',
  link: '',
};

/** shields.io 的转义规则,外加把会冲断 URL 的字符百分号编码 */
function escapeSegment(text) {
  return String(text == null ? '' : text)
    .replace(/-/g, '--')
    .replace(/_/g, '__')
    .replace(/ /g, '_')
    .replace(/[/?#&%]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** 没写 badge 时,从链接里推一个像样的右半句 */
function messageFromLink(link) {
  return String(link || '')
    .replace(/^mailto:/i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

function logoOf(item) {
  if (item.badge_logo !== undefined && item.badge_logo !== null) {
    const raw = String(item.badge_logo).trim();
    return raw === 'none' ? '' : raw;
  }
  const icon = String(item.icon == null ? '' : item.icon).trim();
  return Object.prototype.hasOwnProperty.call(LOGO_FROM_ICON, icon) ? LOGO_FROM_ICON[icon] : icon;
}

function hex(value, fallback) {
  const raw = String(value == null || value === '' ? fallback : value).replace(/^#/, '').trim();
  return /^[0-9a-fA-F]{3,8}$/.test(raw) ? raw : fallback;
}

/** social 里的一项 → 完整的 img.shields.io URL */
function badgeUrl(item) {
  const it = item || {};
  const name = String(it.name == null ? '' : it.name).trim();
  const label = name || 'link';
  const message = (it.badge === undefined || it.badge === null || it.badge === '')
    ? (messageFromLink(it.link) || label)
    : String(it.badge);

  const params = [
    'style=flat-square',
    'labelColor=' + hex(it.badge_label_color, DEFAULT_LABEL_COLOR),
  ];
  const logo = logoOf(it);
  if (logo) {
    params.push('logo=' + encodeURIComponent(logo));
    params.push('logoColor=white');
  }

  return BADGE_BASE
    + escapeSegment(label) + '-' + escapeSegment(message) + '-' + hex(it.badge_color, DEFAULT_COLOR)
    + '?' + params.join('&');
}

module.exports = { badgeUrl, escapeSegment, messageFromLink, BADGE_BASE };
