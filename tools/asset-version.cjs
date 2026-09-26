/**
 * 静态资源的缓存版本号:内容指纹。
 *
 * 为什么需要(真踩过):GitHub Pages 给 CSS/JS 的缓存是 `max-age=600`,CDN 还会再存一层。
 * 于是会出现"HTML 已经更新、样式文件还是十分钟前的"这种最难查的状态 ——
 * 徽章的内联样式明明已经上线,浏览器还在用旧 CSS,页面上徽章继续独占一行居中,
 * 看起来就像"改了没生效"。给 URL 挂上 `?v=<内容指纹>` 之后,内容一变 URL 就变、
 * 缓存自然失效;内容没变则继续走缓存。
 *
 * 这个文件只做纯计算(指纹 + 查询串),读文件那步在 scripts/asset-version.js,
 * 所以这一层可以直接单测。
 */
const crypto = require('node:crypto');

/** 内容 → 8 位十六进制指纹 */
function shortHash(content) {
  const text = content == null ? '' : String(content);
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 8);
}

/** 指纹 → 查询串。指纹不可用时返回空串(页面照常工作,只是退回老行为) */
function versionQuery(hash) {
  const value = hash == null ? '' : String(hash).trim();
  return /^[0-9a-f]{6,40}$/i.test(value) ? '?v=' + value.toLowerCase() : '';
}

module.exports = { shortHash, versionQuery };
