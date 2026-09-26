/**
 * 项目清单管理:校验 / 添加 / 查看。
 *
 *   npm run projects -- check          校验清单(默认命令)
 *   npm run projects -- check --soft   网络不通时容忍(私有仓库泄露仍然拦),给 deploy 当预检
 *   npm run projects -- list           列出公开仓库,以及在清单里的状态
 *   npm run projects -- add GuessLetter  从 GitHub 拉信息,生成一条清单骨架
 *
 * 为什么能保证私有仓库不会泄露:
 *   这个工具只请求 GitHub 的 **公开** 接口 `/users/{user}/repos`。
 *   未认证请求看不到任何私有仓库,所以「清单里有、公开列表里没有」就等价于
 *   「私有 / 已删除 / 已改名」—— 三种情况都不该出现在公开站点上。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectsFile = path.join(root, 'source', '_data', 'projects.yml');
const siteConfig = path.join(root, '_config.yml');

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('--')) || 'check';
const soft = args.includes('--soft');

/* ---------- 读配置 ---------- */

function readGithubUser() {
  const text = readFileSync(siteConfig, 'utf8');
  const m = text.match(/^github_user:\s*(\S+)/m);
  return m ? m[1] : null;
}

const user = readGithubUser();

/* ---------- 请求(兼容本机 GitHub 加速器) ---------- */

async function gh(url) {
  const opts = { headers: { 'User-Agent': 'cos-cross-blog-projects', Accept: 'application/vnd.github+json' } };
  try {
    return await fetch(url, opts);
  } catch (e) {
    // 装了 GitHub 加速器(Watt Toolkit 之类)时,hosts 会把 api.github.com 指到
    // 127.0.0.1,证书不被信任。这里降级重试一次,并明确说明原因。
    if (!/certificate|self.signed|UNABLE_TO_VERIFY|fetch failed/i.test(String(e.message))) throw e;
    console.log('   (检测到本机 GitHub 加速器,已关闭证书校验重试)\n');
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    return await fetch(url, opts);
  }
}

/** 拉全部公开仓库(私有仓库在这个接口里根本不存在) */
async function publicRepos() {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const res = await gh(`https://api.github.com/users/${user}/repos?per_page=100&page=${page}&sort=pushed`);
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

/* ---------- 小工具 ---------- */

/** 用户主页仓库(<user>.github.io)是挂在根域名的,其余仓库才是 /仓库名/ */
function pagesUrl(repoName) {
  return repoName.toLowerCase() === `${user.toLowerCase()}.github.io`
    ? `https://${user}.github.io/`
    : `https://${user}.github.io/${repoName}/`;
}

/* ---------- 解析 projects.yml ---------- */

function parseProjects(text) {
  const body = text.replace(/^#[\s\S]*?(?=^- )/m, '');
  return body
    .split(/^- /m)
    .filter((b) => b.trim())
    .map((block) => {
      const get = (key) => {
        const m = block.match(new RegExp(`^\\s*${key}:\\s*(.*)$`, 'm'));
        return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
      };
      const repoUrl = get('repo');
      const repoName = repoUrl ? repoUrl.replace(/\/+$/, '').split('/').pop() : '';
      return {
        name: get('name'),
        repo: repoUrl,
        repoName,
        link: get('link'),
        hidden: get('hidden') === 'true',
        raw: `- ${block}`.trimEnd(),
      };
    });
}

/* ---------- check ---------- */

async function check() {
  if (!existsSync(projectsFile)) {
    console.error('找不到 source/_data/projects.yml');
    return 1;
  }

  const entries = parseProjects(readFileSync(projectsFile, 'utf8'));
  let repos;
  try {
    repos = await publicRepos();
  } catch (e) {
    console.log(`⚠️  无法访问 GitHub(${e.message}),跳过项目清单校验。`);
    return soft ? 0 : 1;
  }

  const publicNames = new Set(repos.map((r) => r.name));
  const listed = new Set(entries.map((e) => e.repoName || e.name));
  const errors = [];
  const warns = [];

  for (const entry of entries) {
    const label = entry.name || entry.repoName || '(未命名)';
    const haystack = entry.repoName || entry.name;

    if (!publicNames.has(haystack)) {
      errors.push(
        `「${label}」不在 ${user} 的公开仓库里 —— 它可能是私有仓库、已删除或已改名。` +
        `私有仓库出现在公开站点上等于泄露,请删掉这一项或加 hidden: true。`,
      );
      continue;
    }

    const repo = repos.find((r) => r.name === haystack);
    if (entry.link && !repo.has_pages) {
      warns.push(`「${label}」填了在线地址 ${entry.link},但这个仓库没有开启 GitHub Pages。`);
    }
    if (entry.hidden) {
      warns.push(`「${label}」当前是 hidden: true,不会展示。`);
    }
  }

  // 还没收录的:fork / 个人资料仓库 / AUTO_SYNC_SKIP 里的不算 ——
  // `sync` 会故意跳过它们,这里再报"想加就跑 add"只会让人困惑。
  const skipReason = (r) => (r.fork ? 'fork' : null)
    || (r.name === user ? '个人资料仓库' : null)
    || (AUTO_SYNC_SKIP.has(r.name) ? '在 AUTO_SYNC_SKIP 里' : null);
  const missing = repos.filter((r) => !listed.has(r.name) && !skipReason(r)).map((r) => r.name);
  const skipped = repos.filter((r) => !listed.has(r.name) && skipReason(r))
    .map((r) => `${r.name}(${skipReason(r)})`);

  const visible = entries.filter((e) => !e.hidden).length;

  console.log(`项目清单校验(基准:${user} 的 ${repos.length} 个公开仓库)`);
  console.log(`  清单条目 : ${entries.length} 条,其中展示 ${visible} 条,隐藏 ${entries.length - visible} 条`);
  console.log('');

  if (errors.length) {
    console.error(`❌ 有 ${errors.length} 个必须修的问题:`);
    for (const e of errors) console.error(`   - ${e}`);
    console.error('');
  }
  if (warns.length) {
    console.log(`提示(${warns.length} 条,不影响发布):`);
    for (const w of warns) console.log(`   - ${w}`);
    console.log('');
  }
  if (missing.length) {
    console.log(`还没收录的公开仓库(${missing.length} 个,跑 npm run projects -- sync 会自动补):`);
    console.log(`   ${missing.join('、')}`);
    console.log('');
  }
  if (skipped.length) {
    console.log(`自动收录会跳过的(${skipped.length} 个):`);
    console.log(`   ${skipped.join('、')}`);
    console.log('');
  }

  if (errors.length) {
    // 注意:泄露私有仓库这件事 --soft 也不放过,只有网络问题才容忍
    return 1;
  }
  console.log('✅ 通过,没有私有仓库混进清单。');
  return 0;
}

/* ---------- list ---------- */

async function list() {
  const entries = existsSync(projectsFile) ? parseProjects(readFileSync(projectsFile, 'utf8')) : [];
  const listed = new Set(entries.map((e) => e.repoName || e.name));
  const repos = await publicRepos();

  console.log(`${user} 的公开仓库(${repos.length} 个):\n`);
  for (const r of repos) {
    if (r.fork) continue;
    const mark = listed.has(r.name) ? '[已收录]' : '[ 未收录 ]';
    const pages = r.has_pages ? `Pages: ${pagesUrl(r.name)}` : '';
    console.log(`  ${mark} ${r.name.padEnd(24)} ${(r.language || '-').padEnd(12)} ${pages}`);
  }
  console.log('\n私有仓库不会出现在这个列表里 —— 这是 GitHub 公开接口的保证。');
  return 0;
}

/* ---------- add ---------- */

async function add(name) {
  if (!name) {
    console.error('用法:npm run projects -- add <仓库名>');
    return 1;
  }

  const res = await gh(`https://api.github.com/repos/${user}/${name}`);
  if (res.status === 404) {
    console.error(`❌ ${user}/${name} 不存在或不是公开仓库。`);
    console.error('   私有仓库不能加到公开站点的展示清单里 —— 这一步被刻意拦住了。');
    return 1;
  }
  if (!res.ok) {
    console.error(`GitHub API ${res.status}`);
    return 1;
  }

  const repo = await res.json();

  const entry = skeleton(repo);

  const text = readFileSync(projectsFile, 'utf8');
  writeFileSync(projectsFile, `${text.replace(/\s*$/, '')}\n\n${entry}\n`, 'utf8');

  console.log(`已添加 ${repo.name} 到 source/_data/projects.yml:\n`);
  console.log(entry);
  console.log('\n记得补一下 desc / tags / group / accent,然后 npm run check && npm run deploy。');
  return 0;
}

/* ---------- 生成清单骨架 ---------- */

/** 仓库 → 一条清单骨架(字段尽量从 GitHub 那边填好,desc/tags 建议再润色) */
function skeleton(repo) {
  const link = repo.homepage || (repo.has_pages ? pagesUrl(repo.name) : '');
  const desc = (repo.description || '待补充一句话介绍').replace(/'/g, "''");
  return [
    `- name: ${repo.name}`,
    `  desc: ${desc}`,
    `  lang: ${repo.language || 'Code'}`,
    `  link: '${link}'`,
    `  repo: ${repo.html_url}`,
    '  tags: []',
    '  icon: code',
    '  accent: cyan',
    '  group: 项目',
  ].join('\n');
}

/* ---------- sync:自动收录新仓库 ---------- */

/**
 * 自动收录时跳过的仓库。
 * 个人资料仓库(`<用户名>/<用户名>`)和 fork 已经在代码里直接跳了,这里放"其它不想自动加"的。
 */
const AUTO_SYNC_SKIP = new Set([
  '10chen01.github.io',
]);

/**
 * 把所有还没收录的公开仓库补进清单。
 *
 * 为什么要有它:新建仓库之后很容易忘了往 projects.yml 里加一条,项目页就一直是旧的。
 * 现在 `npm run deploy` 会先跑一次这个(带 --soft,连不上 GitHub 就跳过),
 * 于是新仓库会自动出现在项目页上,作者只需要事后润色一下描述。
 *
 * 三条安全线:私有仓库根本不会出现在公开接口里;个人资料仓库和 fork 直接跳过;
 * AUTO_SYNC_SKIP 里的也不动。想临时不展示某一条,给它加 `hidden: true` 即可。
 */
async function sync(dry, soft) {
  let repos;
  try {
    repos = await publicRepos();
  } catch (e) {
    if (soft) {
      console.warn(`⚠️  连不上 GitHub,跳过自动收录(${e.message})`);
      return 0;
    }
    throw e;
  }

  const entries = existsSync(projectsFile) ? parseProjects(readFileSync(projectsFile, 'utf8')) : [];
  const listed = new Set(entries.map((e) => e.repoName || e.name));
  const todo = repos.filter((r) => !listed.has(r.name) && !r.fork
    && r.name !== user && !AUTO_SYNC_SKIP.has(r.name));

  if (!todo.length) {
    console.log('项目清单:公开仓库都在里面了,没有要补的。');
    return 0;
  }

  console.log(`项目清单:发现 ${todo.length} 个还没收录的公开仓库`);
  for (const r of todo) {
    console.log(`   + ${r.name}${r.description ? ` —— ${r.description}` : ''}`);
  }
  if (dry) {
    console.log('\n(--dry:只看看,没有写文件)');
    return 0;
  }

  const text = readFileSync(projectsFile, 'utf8');
  writeFileSync(projectsFile, `${text.replace(/\s*$/, '')}\n\n${todo.map(skeleton).join('\n\n')}\n`, 'utf8');
  console.log(`\n已自动补进 source/_data/projects.yml。`);
  console.log('建议手动润色一下 desc / tags / group / accent —— 不想展示就加一行 hidden: true。');
  return 0;
}

/* ---------- 入口 ---------- */

let code = 0;
try {
  if (!user) {
    console.error('_config.yml 里没有 github_user,无法核对仓库。请加上一行:');
    console.error('  github_user: 你的 GitHub 用户名');
    code = 1;
  } else if (command === 'check') {
    code = await check();
  } else if (command === 'list') {
    code = await list();
  } else if (command === 'add') {
    code = await add(args.filter((a) => !a.startsWith('--'))[1]);
  } else if (command === 'sync') {
    code = await sync(args.includes('--dry'), args.includes('--soft'));
  } else {
    console.log('可用命令:');
    console.log('  npm run projects -- sync             把还没收录的公开仓库自动补进清单');
    console.log('  npm run projects -- sync --dry       只看看会补哪些,不写文件');
    console.log('  npm run projects -- check            校验清单');
    console.log('  npm run projects -- list             列出公开仓库及收录状态');
    console.log('  npm run projects -- add <仓库名>      从 GitHub 生成一条清单骨架');
    code = 1;
  }
} catch (e) {
  console.error(`出错了:${e.message}`);
  code = 1;
}

process.exitCode = code;

// Windows 上直接 process.exit() 有时会撞上 libuv 的 async handle 断言
// (handle->flags & UV_HANDLE_CLOSING),让标准流先冲刷完再退出。
setTimeout(() => process.exit(code), 100);
