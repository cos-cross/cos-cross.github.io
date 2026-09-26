/**
 * 资源页两档文件的公共逻辑:一档放在仓库里(files/),一档走 GitHub Release(files-big/)。
 *
 * 为什么需要单独一层:同一个 Release 直链会出现在**两个地方** ——
 *   - tools/sync-files.mjs      生成页面数据 source/_data/files.yml
 *   - tools/release-files.mjs   真的把文件传上去
 * 两边必须算出一模一样的 URL,不然页面上会挂一堆 404。所以 URL 拼装只留这一份,
 * 并且配了单测(tools/test-theme.mjs)。
 *
 * 相关硬限制(2026 年 GitHub 官方文档):
 *   - git 仓库单文件 > 100 MB 直接 push 被拒(50 MB 起给警告);
 *   - Release 单个资源文件上限 2 GB;
 *   - Pages 源仓库建议 ≤ 1 GB,发布出来的站点 ≤ 1 GB。
 * 所以「多大算大」不是审美问题,是墙。
 */

/** 超过这个大小就进不了 git 仓库(GitHub 硬上限) */
const GIT_LIMIT = 100 * 1024 * 1024;
/** 超过这个大小就该提醒了(仓库体积会涨得很快) */
const GIT_WARN = 20 * 1024 * 1024;
/** Release 单个资源的上限 */
const RELEASE_LIMIT = 2 * 1024 * 1024 * 1024;

const RELEASES_HOST = 'https://github.com';

const fs = require('node:fs');
const path = require('node:path');

/** 人类可读体积(和 sync-files.mjs / files.ejs 保持一致的算法) */
function human(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
}

/**
 * 从 git remote 解析 owner/repo。支持这几种写法:
 *   https://github.com/owner/repo.git
 *   git@github.com:owner/repo.git
 *   ssh://git@github.com/owner/repo
 *   https://token@github.com/owner/repo
 * 不是 GitHub 的地址返回 null(调用方要给出清楚的报错,而不是拼一个坏 URL)。
 */
function parseRemote(remote) {
  const text = String(remote == null ? '' : remote).trim();
  if (!text) return null;

  let pathPart = '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    // 标准 URL:https://github.com/owner/repo.git / ssh://git@github.com/owner/repo
    try {
      const url = new URL(text);
      if (url.hostname.toLowerCase() !== 'github.com') return null;
      pathPart = url.pathname;
    } catch (e) {
      return null;
    }
  } else {
    // scp 风格:git@github.com:owner/repo.git
    const m = text.match(/^(?:[^@/]+@)?([^:/]+):(.+)$/);
    if (!m || m[1].toLowerCase() !== 'github.com') return null;
    pathPart = m[2];
  }

  const parts = pathPart
    .replace(/^\/+/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
    .split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1] };
}

/**
 * 从 .git/config 的文本里找出 origin 的地址。
 *
 * 为什么不直接跑 `git remote get-url origin`:受限环境(沙箱、部分 CI)里 spawn 子进程
 * 可能被直接拦掉(EPERM),而读 .git/config 只是读一个文本文件,哪儿都能跑。
 */
function remoteFromGitConfig(text) {
  const src = String(text == null ? '' : text);
  const section = src.match(/\[remote\s+"origin"\]\s*([\s\S]*?)(?=\n\s*\[|$)/);
  if (!section) return null;
  const url = section[1].match(/^\s*url\s*=\s*(.+)$/m);
  return url ? url[1].trim() : null;
}

/** 找到仓库的 .git/config(兼容 worktree / submodule:.git 是个指向别处的文件) */
function gitConfigPath(root) {
  const dotGit = path.join(root, '.git');
  try {
    if (fs.statSync(dotGit).isDirectory()) return path.join(dotGit, 'config');
    const m = fs.readFileSync(dotGit, 'utf8').trim().match(/^gitdir:\s*(.+)$/i);
    return m ? path.join(path.resolve(root, m[1].trim()), 'config') : null;
  } catch (e) {
    return null;
  }
}

/** 读出 origin 的地址;读不到就返回 null(调用方给清楚的报错,别拼坏 URL) */
function readOriginRemote(root) {
  const config = gitConfigPath(root);
  if (!config) return null;
  try {
    return remoteFromGitConfig(fs.readFileSync(config, 'utf8'));
  } catch (e) {
    return null;
  }
}

/** Release 里资源的下载地址前缀(不带文件名) */
function releaseBase(owner, repo, tag) {
  if (!owner || !repo || !tag) return '';
  return `${RELEASES_HOST}/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}`;
}

/** 单个资源文件的直链。文件名要按 URL 段编码(中文 / 空格 / @ 都要转) */
function releaseAssetUrl(base, name) {
  if (!base || !name) return '';
  return `${String(base).replace(/\/+$/, '')}/${encodeURIComponent(name)}`;
}

/** 这个体积属于哪一档:ok / warn / 超 git 上限 / 超 Release 上限 */
function sizeClass(bytes) {
  const b = Number(bytes) || 0;
  if (b > RELEASE_LIMIT) return 'over-release';
  if (b > GIT_LIMIT) return 'over-git';
  if (b > GIT_WARN) return 'warn';
  return 'ok';
}

module.exports = {
  human,
  parseRemote,
  remoteFromGitConfig,
  readOriginRemote,
  releaseBase,
  releaseAssetUrl,
  sizeClass,
  GIT_LIMIT,
  GIT_WARN,
  RELEASE_LIMIT,
};
