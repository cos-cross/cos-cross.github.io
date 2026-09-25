/**
 * 把 public/ 发布到 GitHub Pages(gh-pages 分支)。
 *
 * 设计要点:
 *   1. 不用 hexo-deployer-git —— 那个插件需要把仓库地址(可能带令牌)写进 _config.yml;
 *   2. 每次发布都在 public/ 里临时 git init 一个新仓库并强推,幂等、不依赖历史;
 *   3. 令牌只从环境变量读,绝不落盘、绝不打印。
 *
 * 用法:
 *   npm run deploy                          # 用 git 凭据管理器认证
 *   GITHUB_TOKEN=ghp_xxx npm run deploy     # 用个人访问令牌认证(CI / 沙箱环境)
 *   BLOG_REPO=https://github.com/u/r.git npm run deploy   # 覆盖目标仓库
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const BRANCH = 'gh-pages';

if (!existsSync(path.join(publicDir, 'index.html'))) {
  console.error('public/index.html 不存在,请先运行:npm run build');
  process.exit(1);
}

/** 从 .git/config 里读 origin 地址,避免起子进程抓输出(sandbox 下管道受限) */
function readOrigin() {
  if (process.env.BLOG_REPO) return process.env.BLOG_REPO;

  const configPath = path.join(root, '.git', 'config');
  if (!existsSync(configPath)) return null;

  const text = readFileSync(configPath, 'utf8');
  const section = text.split(/^\[/m).find((s) => s.startsWith('remote "origin"'));
  if (!section) return null;

  const match = section.match(/^\s*url\s*=\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

const repo = readOrigin();
if (!repo) {
  console.error('没有找到目标仓库。请在仓库里配置 origin,或设置 BLOG_REPO 环境变量。');
  process.exit(1);
}

/** git 一律用 inherit 直连终端:不抓输出,避免命名管道限制 */
function git(args, extra = []) {
  execFileSync('git', ['-C', publicDir, ...extra, ...args], {
    stdio: 'inherit',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

// 告诉 GitHub 不要再用 Jekyll 处理一遍产物
writeFileSync(path.join(publicDir, '.nojekyll'), '');

const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
const authArgs = [];

if (process.env.GITHUB_TOKEN) {
  const basic = Buffer.from(`x-access-token:${process.env.GITHUB_TOKEN}`).toString('base64');
  authArgs.push('-c', 'credential.helper=', '-c', `http.extraheader=Authorization: Basic ${basic}`);
}

console.log(`\n发布到 ${repo} 的 ${BRANCH} 分支 ...\n`);

git(['init', '-q', '-b', BRANCH]);
git(['add', '-A']);
git(
  ['-c', 'user.name=Cos-Cross', '-c', 'user.email=coscross@126.com', 'commit', '-q', '-m', `deploy: ${stamp}`],
);
git(['push', '-q', '-f', ...authArgs, repo, `${BRANCH}:${BRANCH}`]);

console.log(`\n完成。提交时间 ${stamp}`);
console.log('如果这是第一次发布,记得在仓库 Settings → Pages 里把发布源切到 gh-pages 分支。');
