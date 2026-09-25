/**
 * 空站兜底生成器。
 *
 * 背景:hexo-generator-index 依赖 hexo-pagination,hexo-generator-archive 在
 * `!allPosts.length` 时直接 return —— 也就是说一篇文章都没有的时候,
 * 它们不会输出任何路由,首页和导航里的「文章」会直接 404。
 *
 * 这个脚本只在「零文章」时补上最简页面,一旦有了文章就完全不介入,
 * 不会和官方生成器抢路由。
 *
 * 两个容易踩的坑:
 *   1. Hexo 会自动加载站点根目录 scripts/ 下的脚本,但必须是 CommonJS ——
 *      它把文件包进 `(function(exports, require, module, __filename, __dirname, hexo){...})`
 *      里执行,所以 .mjs / import 语法会直接语法错误;
 *   2. hexo 是**注入的函数参数**,不是模块导出。写 `module.exports = function (hexo) {}`
 *      不会被执行,必须在顶层直接用 `hexo`。
 */

function escapeXml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 一个合法但没有任何条目的 Atom feed,避免页脚的订阅链接 404 */
function emptyFeed(config) {
  const site = config.url.replace(/\/+$/, '');
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    '  <title>' + escapeXml(config.title) + '</title>',
    '  <subtitle>' + escapeXml(config.subtitle) + '</subtitle>',
    '  <link href="' + site + '/atom.xml" rel="self"/>',
    '  <link href="' + site + '/"/>',
    '  <updated>' + new Date().toISOString() + '</updated>',
    '  <id>' + site + '/</id>',
    '  <author><name>' + escapeXml(config.author) + '</name></author>',
    '  <generator uri="https://hexo.io/">Hexo</generator>',
    '</feed>',
    '',
  ].join('\n');
}

hexo.extend.generator.register('empty_site_fallback', function (locals) {
  if (locals.posts.length) return undefined;

  const config = hexo.config;
  const archiveDir = config.archive_dir.endsWith('/') ? config.archive_dir : config.archive_dir + '/';

  return [
    {
      path: 'index.html',
      layout: ['index'],
      data: {
        __index: true,
        current: 1,
        total: 1,
        base: '',
        path: '',
      },
    },
    {
      path: archiveDir + 'index.html',
      layout: ['archive'],
      data: {
        archive: true,
        current: 1,
        total: 1,
        base: archiveDir,
        path: '',
      },
    },
    {
      path: 'atom.xml',
      data: emptyFeed(config),
    },
  ];
});
