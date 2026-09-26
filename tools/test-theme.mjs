/**
 * 主题配置 → 页面标记这一层的单测(不依赖 Hexo,纯字符串)。
 *
 * 目前只有 shields.io 社交徽章。为什么值得单测:徽章路径的转义规则
 * (`-`→`--`、`_`→`__`、空格→`_`)**错了页面照样出图**,只是文字被截断
 * (cos-cross 显示成 cos),肉眼扫一遍很难发现 —— 所以钉死在这里。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { badgeUrl, badgeHtml, findSocial, escapeSegment, messageFromLink } = require(path.join(root, 'tools', 'social-badge.cjs'));

let pass = 0;
let fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass += 1; console.log(`PASS  ${label}`); } else {
    fail += 1;
    console.log(`FAIL  ${label}${extra !== undefined ? '  → ' + extra : ''}`);
  }
}

console.log('=== shields.io 的转义规则 ===');
{
  ok('连字符翻倍(不然 cos-cross 会被截成 cos)', escapeSegment('cos-cross') === 'cos--cross', escapeSegment('cos-cross'));
  ok('下划线翻倍', escapeSegment('a_b') === 'a__b', escapeSegment('a_b'));
  ok('空格变下划线', escapeSegment('my space') === 'my_space', escapeSegment('my space'));
  ok('斜杠百分号编码(否则会把路径冲断)', escapeSegment('a/b') === 'a%2Fb', escapeSegment('a/b'));
  ok('问号井号与号也编码', escapeSegment('a?b#c&d') === 'a%3Fb%23c%26d', escapeSegment('a?b#c&d'));
  ok('中文原样保留(浏览器会自己编码)', escapeSegment('邮箱') === '邮箱', escapeSegment('邮箱'));
}

console.log('\n=== 三个真实条目(和主题 _config.yml 一致) ===');
{
  const github = badgeUrl({ name: 'GitHub', icon: 'github', link: 'https://github.com/cos-cross', badge: 'cos-cross', badge_color: '181717' });
  ok('GitHub 徽章 URL', github === 'https://img.shields.io/badge/GitHub-cos--cross-181717?style=flat-square&labelColor=0d1017&logo=github&logoColor=white', github);

  const bilibili = badgeUrl({ name: 'Bilibili', icon: 'bilibili', link: 'https://space.bilibili.com/388480733', badge: '@Cos_Cross', badge_color: 'FB7299' });
  ok('Bilibili 徽章 URL(下划线要翻倍,否则会显示成空格)', bilibili === 'https://img.shields.io/badge/Bilibili-@Cos__Cross-FB7299?style=flat-square&labelColor=0d1017&logo=bilibili&logoColor=white', bilibili);

  const mail = badgeUrl({ name: '邮箱', icon: 'mail', link: 'mailto:Cosinecross@163.com', badge: 'Cosinecross@163.com', badge_color: '1f6feb' });
  ok('邮箱徽章不带 logo(mail 在 Simple Icons 里没有)', mail.indexOf('logo=') === -1, mail);
  ok('邮箱徽章 URL', mail === 'https://img.shields.io/badge/邮箱-Cosinecross@163.com-1f6feb?style=flat-square&labelColor=0d1017', mail);
}

console.log('\n=== 兜底与容错 ===');
{
  ok('# 前缀会被去掉', badgeUrl({ name: 'x', badge: 'y', badge_color: '#ff0000' }).indexOf('-ff0000?') !== -1);
  ok('颜色写错时退回中性灰',
    badgeUrl({ name: 'x', badge: 'y', badge_color: 'not-a-color' }).indexOf('-6e7681?') !== -1,
    badgeUrl({ name: 'x', badge: 'y', badge_color: 'not-a-color' }));
  ok('没写 badge 时从 link 推',
    badgeUrl({ name: 'My', link: 'https://example.com/x/' }).indexOf('My-example.com%2Fx-') !== -1,
    badgeUrl({ name: 'My', link: 'https://example.com/x/' }));
  ok('mailto: 会被剥掉', messageFromLink('mailto:a@b.com') === 'a@b.com', messageFromLink('mailto:a@b.com'));
  ok('badge_logo: none 表示不要图标', badgeUrl({ name: 'x', badge: 'y', badge_logo: 'none' }).indexOf('logo=') === -1);
  ok('badge_logo 显式指定时优先', badgeUrl({ name: 'x', badge: 'y', badge_logo: 'zhihu' }).indexOf('logo=zhihu') !== -1);
  ok('未知 icon 名也会当图标传过去(方便以后加)',
    badgeUrl({ name: 'x', badge: 'y', icon: 'zhihu' }).indexOf('logo=zhihu') !== -1);
  ok('缺字段也不炸', typeof badgeUrl({}) === 'string' && badgeUrl({}).startsWith('https://img.shields.io/badge/'), badgeUrl({}));
  ok('空 item 也不炸', typeof badgeUrl() === 'string');
  ok('labelColor 可以覆盖', badgeUrl({ name: 'x', badge: 'y', badge_label_color: 'ffffff' }).indexOf('labelColor=ffffff') !== -1);
  ok('中文标签不会被转义成乱码', badgeUrl({ name: '邮箱', badge: 'a@b.com' }).indexOf('badge/邮箱-a@b.com-') !== -1);
}

console.log('\n=== {% social_badge %} 的取名与标记 ===');
{
  const social = [
    { name: 'GitHub', icon: 'github', link: 'https://github.com/cos-cross', badge: 'cos-cross', badge_color: '181717' },
    { name: 'Bilibili', icon: 'bilibili', link: 'https://space.bilibili.com/388480733', badge: '@Cos_Cross', badge_color: 'FB7299' },
    { name: '邮箱', icon: 'mail', link: 'mailto:Cosinecross@163.com', badge: 'Cosinecross@163.com', badge_color: '1f6feb' },
  ];
  ok('按名字找得到', findSocial(social, 'GitHub') === social[0]);
  ok('名字不分大小写', findSocial(social, 'github') === social[0]);
  ok('中文名也行', findSocial(social, '邮箱') === social[2]);
  ok('写一半也能匹配(git)', findSocial(social, 'git') === social[0]);
  ok('可以用序号', findSocial(social, '2') === social[1]);
  ok('找不到返回 null', findSocial(social, '知乎') === null);
  ok('空名字返回 null', findSocial(social, '') === null);
  ok('列表不是数组也不炸', findSocial(undefined, 'GitHub') === null);

  const html = badgeHtml(social[1]);
  ok('标记是「链接包图片」', /^<a class="social-badge-link" href="https:\/\/space\.bilibili\.com\/388480733"/.test(html), html);
  ok('图片带 social-badge 类', html.indexOf('<img class="social-badge"') !== -1);
  ok('有 alt 和 title(无障碍)', html.indexOf('alt="Bilibili"') !== -1 && html.indexOf('title="Bilibili"') !== -1);
  ok('外链不留 referrer', html.indexOf('rel="noopener noreferrer"') !== -1);
  ok('固定高度,避免加载时跳版', html.indexOf('height="20"') !== -1);
  ok('引号会被转义(不会把标签写坏)',
    badgeHtml({ name: 'a"b', link: 'https://x.com/?a=1&b=2' }).indexOf('href="https://x.com/?a=1&amp;b=2"') !== -1,
    badgeHtml({ name: 'a"b', link: 'https://x.com/?a=1&b=2' }));
}

console.log(`\n${pass} 通过,${fail} 失败`);
process.exit(fail ? 1 : 0);
