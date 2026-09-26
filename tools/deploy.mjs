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
 *   npm run deploy -- --no-push            # 只提交不推送(本地演练)
 *   GITHUB_TOKEN=ghp_xxx npm run deploy    # 用令牌认证(CI / 沙箱)
 *   BLOG_REPO=https://github.com/u/r.git npm run deploy
 *
 * 两个实现上的注意点:
 *   1. 不用 hexo-deployer-git —— 它要求把仓库地址(可能带令牌)写进 _config.yml;
 *   2. 需要读 git 输出的地方,一律把输出重定向到文件而不是管道 ——
 *      受限沙箱里命名管道会被拦,重定向到文件两种环境都能跑。
 *
 * 幂等性:同一个版本连着跑两次不能报错。产物没变时第二步会**没有东西可提交**,
 * 而 `git commit` 在干净的工作区上是以 1 退出的 —— 直接调就会把"没事可做"
 * 报成失败。所以提交前先看 status,没变化就跳过提交,但**照常推送** ——
 * 这样"上次 push 卡在网络/权限上"的仓库,再跑一次就能补推上去。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const tmpDir = path.join(root, '.deploy-tmp');
const BRANCH = 'gh-pages';

const argv = process.argv.slice(2);
const skipSource = argv.includes('--no-source');
const skipPush = argv.includes('--no-push');
const msgIndex = argv.findIndex((a) => a === '-m' || a === '--message');
const customMessage = msgIndex >= 0 ? argv[msgIndex + 1] : null;

const AUTHOR = ['-c', 'user.name=Cos-Cross', '-c', 'user.email=coscross@126.com'];
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

if (!existsSync(path.join(publicDir, 'index.html'))) {
  console.error('public/index.html 不存在,请先运行:npm run build');
  process.exit(1);
}

/* ---------- 出发前先拦住"推不上去"的情况 ---------- */

/**
 * GitHub 对 git 仓库的单文件硬上限是 100 MB,超了**整次 push 会被拒绝**
 * (不是跳过那个文件),而且失败信息是推到最后才出现的,很难查。
 * 所以这里在动手之前先扫一遍 public/:发现超大文件就直接停下来说清楚怎么办。
 *
 * 大文件正确的位置是 files-big/(走 GitHub Release,单个上限 2 GB),
 * 见 README「资源页」和 tools/release-files.mjs。
 */
{
  const LIMIT = 100 * 1024 * 1024;
  const tooBig = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else {
        const size = statSync(full).size;
        if (size > LIMIT) tooBig.push([path.relative(publicDir, full), size]);
      }
    }
  };
  if (existsSync(publicDir)) walk(publicDir);
  if (tooBig.length) {
    console.error('✗ public/ 里有超过 100 MB 的文件,推上去会被 GitHub 整次拒绝:');
    for (const [rel, size] of tooBig) {
      console.error(`    ${rel}  ${(size / 1048576).toFixed(1)} MB`);
    }
    console.error('\n把它们从 files/ 挪到 files-big/(gitignore 已配好),然后:');
    console.error('    npm run files:release    # 传到 GitHub Release');
    console.error('    npm run files            # 重新生成资源页数据(会自动删掉 public/ 里的旧副本)');
    process.exit(1);
  }
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

/**
 * 推送目标:优先用远程名 origin 而不是 URL。
 * 推到裸 URL 时 git 不会更新 origin/main 这个跟踪引用,之后 git status 会一直显示
 * "ahead 1",容易误判。用远程名就没这个问题(认证头对两者同样生效)。
 */
const pushRemote = process.env.BLOG_REPO ? repo : 'origin';

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
    gitRun(['push', '-q', pushRemote, `${branch}:${branch}`], authArgs);
    console.log(`  ✓ 已推送到 ${branch}:${message}`);
  }
}

/* ---------- 第二步:构建产物推送到 gh-pages ---------- */

// 告诉 GitHub 不要再用 Jekyll 处理一遍产物
writeFileSync(path.join(publicDir, '.nojekyll'), '');
// 关键:禁止 git 对这个仓库里的文件做换行符转换。
// 否则 autocrlf / text=auto 会把 CRLF 改成 LF,线上文件字节和本地不一致 ——
// 下载页上标的 sha256 就对不上了,校验功能变成假的。
writeFileSync(path.join(publicDir, '.gitattributes'), '* -text\n');

console.log(`\n[2/2] 发布站点到 ${BRANCH} 分支 …`);
const gitPub = (args, extra = []) => gitRun(args, extra, publicDir);

// 只在还不是仓库时才 init —— 已存在时再 init 会打一句
// "re-init: ignored --initial-branch=gh-pages" 的无害警告,容易被当成出错。
if (!existsSync(path.join(publicDir, '.git'))) {
  gitPub(['init', '-q', '-b', BRANCH]);
}
gitPub(['add', '-A']);

// 工作区没变化就别 commit:干净的时候 `git commit` 会以 1 退出,
// 于是"连着部署同一个版本"会被报成失败 —— 其实什么都没坏。
const pubStatus = gitOut(['status', '--porcelain'], publicDir);
if (pubStatus.status !== 0) {
  console.warn('  ⚠️  读取 public 的 git status 失败,跳过产物提交,直接推送已有提交。');
} else if (!pubStatus.out.trim()) {
  console.log('  产物没有变化,跳过提交(仍然会推送一次,把上次没推成功的补上)。');
} else {
  gitPub([...AUTHOR, 'commit', '-q', '-m', `deploy: ${stamp}`]);
  console.log('  ✓ 已提交产物');
}

if (skipPush) {
  console.log('  (--no-push:跳过推送)');
} else {
  // 注意:-c 是 git 的全局选项,必须排在 push 子命令之前
  gitPub(['push', '-q', '-f', repo, `${BRANCH}:${BRANCH}`], authArgs);
}

console.log(`\n✓ 完成(${stamp})`);
console.log('  GitHub Pages 还要构建 20~60 秒才会生效,然后可以跑 npm run verify 确认。');
