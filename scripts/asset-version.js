/**
 * Hexo 侧注册:`asset_v(urlPath)` —— 返回该静态资源的缓存版本查询串,比如 `?v=3fa91c07`。
 *
 * 模板里这么用(注意它是拼接在 url_for 后面的):
 *   <link rel="stylesheet" href="<%= url_for('/css/style.css') %><%= asset_v('/css/style.css') %>">
 *
 * 为什么要有它:见 tools/asset-version.cjs 的说明 —— HTML 更新了、CSS 还在浏览器缓存里,
 * 就会出现"改了样式但页面没变"的假象。
 *
 * 读的是**源文件**(主题 source/ 优先,其次站点 source/),所以内容指纹只在真的改了文件时才变。
 * 同一次构建里结果会缓存,不会把同一个文件读几十遍。
 */
const fs = require('node:fs');
const path = require('node:path');
const { shortHash, versionQuery } = require('../tools/asset-version.cjs');

const cache = new Map();

/** 在某个 source 根目录下找这个 URL 对应的文件 */
function locate(baseDir, urlPath) {
  if (!baseDir) return null;
  const file = path.join(baseDir, urlPath.replace(/^\/+/, ''));
  try {
    return fs.statSync(file).isFile() ? file : null;
  } catch (e) {
    return null;
  }
}

function assetVersion(urlPath) {
  const key = String(urlPath || '');
  if (!key) return '';
  if (cache.has(key)) return cache.get(key);

  let query = '';
  try {
    const file = locate(hexo.theme_dir && path.join(hexo.theme_dir, 'source'), key)
      || locate(hexo.source_dir, key);
    if (file) query = versionQuery(shortHash(fs.readFileSync(file)));
    else hexo.log.warn('asset_v: 找不到 %s,这个链接不加版本号', key);
  } catch (e) {
    hexo.log.warn('asset_v: %s 读不出来(%s),这个链接不加版本号', key, e.message);
  }

  cache.set(key, query);
  return query;
}

if (typeof hexo !== 'undefined' && hexo && hexo.extend && hexo.extend.helper) {
  hexo.extend.helper.register('asset_v', assetVersion);
}

module.exports = { assetVersion };
