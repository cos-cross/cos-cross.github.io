/**
 * 一条命令发布博客:源码 → main,构建产物 → gh-pages。
 *
 * 为什么是两个分支:
 *   main      放 Hexo 源码(文章 .md、主题、配置)—— 这是你要长期维护的东西
 *   gh-pages  放 public/ 构建产物     —— GitHub Pages 实际对外提供的内容
 *   分开是为了不让 Jekyll 去处理 source/ 里的 Markdown 源文件(会生成一堆重名页面)。
 *
 * 用法:
 *   npm run deploy                         # 提交源码 + 构建 + 发布
 *   npm run deploy -- -m "写了新文章"        # 自定义提交信息
 *   npm run deploy -- --no-source          # 只发站点,不动源码提交
 *   GITHUB_TOKEN=ghp_xxx npm run deploy    # 用令牌认证(CI / 沙箱)
 *   BLOG_REPO=https://github.com/u/r.git npm run deploy
 *
 * 两个实现上的注意点:
 *   1. 不用 hexo-deployer-git —— 它要求把仓库地址(可能带令牌)写进 _config.yml;
 *   2. 需要读 git 输出的地方,一律把输出重定向到文件而不是管道 ——
 *      受限沙箱里命名管道会被拦,重定向到文件两种环境都能跑。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const tmpDir = path.join(root, '.deploy-tmp');
const BRANCH = 'gh-pages';

const argv = process.argv.slice(2);
const skipSource = argv.includes('--no-source');
const msgIndex = argv.findIndex((a) => a === '-m' || a === '--message');
const customMessage = msgIndex >= 0 ? argv[msgIndex + 1] : null;

const AUTHOR = ['-c', 'user.name=Cos-Cross', '-c', 'user.email=coscross@126.com'];
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

if (!existsSync(path.join(publicDir, 'index.html'))) {
  console.error('public/index.html 不存在,请先运行:npm run build');
  process.exit(1);
}

/* ---------- 仓库地址 ---------- */

/** 从 .git/config 读 origin,避免起子进程抓输出 */
function readOrigin() {
  if (process.env.BLOG_REPO) return process.env.BLOG_REPO;
  const configPath = path.join(root, '.git', 'config');
  if (!existsSync(configPath)) return null;
  const section = readFileSync(configPath, 'utf8').split(/^\[/m).find((s) => s.startsWith('remote "origin"'));
  if (!section) return null;
  const m = section.match(/^\s*url\s*=\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

const repo = readOrigin();
if (!repo) {
  console.error('没有找到目标仓库。请在仓库里配置 origin,或设置 BLOG_REPO 环境变量。');
  process.exit(1);
}

/* ---------- git 调用 ---------- */

const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

/** 输出直连终端 */
function gitRun(args, extra = [], cwd = root) {
  execFileSync('git', ['-C', cwd, ...extra, ...args], { stdio: 'inherit', env: gitEnv });
}

/** 需要读输出:重定向到文件,不用管道 */
function gitOut(args, cwd = root) {
  mkdirSync(tmpDir, { recursive: true });
  const logPath = path.join(tmpDir, 'git.out');
  const fd = openSync(logPath, 'w');
  const res = spawnSync('git', ['-C', cwd, ...args], { stdio: ['ignore', fd, fd], env: gitEnv });
  closeSync(fd);
  const out = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  rmSync(logPath, { force: true });
  return { status: res.status, out };
}

const authArgs = [];
if (process.env.GITHUB_TOKEN) {
  const basic = Buffer.from(`x-access-token:${process.env.GITHUB_TOKEN}`).toString('base64');
  authArgs.push('-c', 'credential.helper=', '-c', `http.extraheader=Authorization: Basic ${basic}`);
}

/* ---------- 第一步:源码提交并推送到 main ---------- */

if (skipSource) {
  console.log('\n[1/2] 已跳过源码提交(--no-source)');
} else {
  console.log('\n[1/2] 检查源码变更 …');
  const status = gitOut(['status', '--porcelain']);

  if (status.status !== 0) {
    console.warn('  ⚠️  读取 git status 失败,跳过源码提交,直接发布站点。');
  } else if (!status.out.trim()) {
    console.log('  源码没有变更,跳过。');
  } else {
    const changed = status.out.trim().split('\n');
    console.log(`  发现 ${changed.length} 处变更:`);
    for (const line of changed.slice(0, 12)) console.log(`    ${line}`);
    if (changed.length > 12) console.log(`    …还有 ${changed.length - 12} 处`);

    const branch = (gitOut(['rev-parse', '--abbrev-ref', 'HEAD']).out.trim() || 'main');
    const message = customMessage || `publish: ${stamp}`;

    gitRun(['add', '-A']);
    gitRun([...AUTHOR, 'commit', '-q', '-m', message]);
    gitRun(['push', '-q', repo, `${branch}:${branch}`], authArgs);
    console.log(`  ✓ 已推送到 ${branch}:${message}`);
  }
}

/* ---------- 第二步:构建产物推送到 gh-pages ---------- */

// 告诉 GitHub 不要再用 Jekyll 处理一遍产物
writeFileSync(path.join(publicDir, '.nojekyll'), '');

console.log(`\n[2/2] 发布站点到 ${BRANCH} 分支 …`);
const gitPub = (args, extra = []) => gitRun(args, extra, publicDir);

gitPub(['init', '-q', '-b', BRANCH]);
gitPub(['add', '-A']);
gitPub([...AUTHOR, 'commit', '-q', '-m', `deploy: ${stamp}`]);
// 注意:-c 是 git 的全局选项,必须排在 push 子命令之前
gitPub(['push', '-q', '-f', repo, `${BRANCH}:${BRANCH}`], authArgs);

console.log(`\n✓ 完成(${stamp})`);
console.log('  GitHub Pages 还要构建 20~60 秒才会生效,然后可以跑 npm run verify 确认。');
