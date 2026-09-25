/**
 * 文章里的"可运行笔记"单元格。
 *
 * 写法:在代码围栏的 info 串里加一个 exec 标记
 *
 *   ```python exec
 *   print(2 ** 10)
 *   ```
 *
 * 构建时这个格子会被真正执行,代码和输出一起渲染进文章 —— 读者不需要装任何东西,
 * 打开网页就能看到真实运行结果(和 nbconvert 导出的 Jupyter notebook 是一个思路)。
 *
 * 为什么放在构建期而不是浏览器里:
 *   - GitHub Pages 是纯静态的,没有后端可以执行代码;
 *   - 浏览器里跑 Python 要靠 Pyodide,首次要下十几 MB 的 WebAssembly;
 *   - 构建期执行的结果是"死"的,任何人任何时候打开都一模一样,还能被搜索引擎抓到。
 *
 * ============================================================
 *  三个踩过的坑(改这个文件前务必先看)
 * ============================================================
 * 1. Hexo 加载 scripts/ 下脚本的方式很特殊:它把文件内容包进
 *    `(function(exports, require, module, __filename, __dirname, hexo){...})` 执行,
 *    hexo 是**注入的函数参数**。写 `module.exports = function (hexo) {}` 不会被执行,
 *    插件会静默失效。
 *
 * 2. **不能用 before_post_render。** 那个阶段 Hexo 已经把代码块渲染成高亮 HTML、
 *    并用 <hexoPostRenderCodeBlock> 占位符替换掉了,原始 Markdown 已经拿不到。
 *    所以这里挂在 after_post_render(此时是最终 HTML),代码则**从源文件里读**,
 *    保证执行的就是作者写的那份代码,而不是从 HTML 里反解出来的。
 *
 * 3. db.json 渲染缓存会跳过过滤器。文章内容没变时 Hexo 直接复用上次的渲染结果,
 *    整个过滤器链都不会跑。改了插件想验证,先删掉 db.json 再 generate。
 */
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { highlight } = require('hexo-util');

/**
 * 语言表。exe 是解释器,hl 是显示高亮用的语言名 ——
 * 两者不一定相同:highlight.js 没有 `node` 这个词法,写 node 会被降级成 plaintext,
 * 所以执行用 node、高亮用 javascript。
 */
const LANGS = {
  python: { ext: '.py', args: (f) => [f], name: 'Python', exe: 'python', hl: 'python' },
  node: { ext: '.mjs', args: (f) => [f], name: 'Node.js', exe: 'node', hl: 'javascript' },
  javascript: { ext: '.mjs', args: (f) => [f], name: 'JavaScript', exe: 'node', hl: 'javascript' },
  js: { ext: '.mjs', args: (f) => [f], name: 'JavaScript', exe: 'node', hl: 'javascript' },
  pwsh: { ext: '.ps1', args: (f) => ['-NoProfile', '-File', f], name: 'PowerShell', exe: 'pwsh', hl: 'powershell' },
  powershell: { ext: '.ps1', args: (f) => ['-NoProfile', '-File', f], name: 'PowerShell', exe: 'pwsh', hl: 'powershell' },
  bash: { ext: '.sh', args: (f) => [f], name: 'Bash', exe: 'bash', hl: 'bash' },
  sh: { ext: '.sh', args: (f) => [f], name: 'Shell', exe: 'bash', hl: 'bash' },
  ruby: { ext: '.rb', args: (f) => [f], name: 'Ruby', exe: 'ruby', hl: 'ruby' },
};

/**
 * 围栏代码块。必须匹配"同长度的闭合围栏" ——
 * 文章里经常出现四个反引号包三个反引号的写法,只认三个会把结构吃错。
 */
const FENCE_RE = /^(`{3,})([^\n]*)\n([\s\S]*?)^\1[ \t]*$/gm;

/** Hexo 渲染出来的高亮块 */
const FIGURE_RE = /<figure class="highlight ([A-Za-z0-9_+-]+)">([\s\S]*?)<\/figure>/g;

/** 高亮块上的 caption,extrainfo 会成为它 */
const CAPTION_RE = /<figcaption><span>([^<]*)<\/span><\/figcaption>/;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 把 HTML 实体全部还原,用于代码交叉校验 */
function decodeEntities(html) {
  return html
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // 必须最后,否则 &amp;lt; 会被二次解码
}

/** 从高亮 HTML 里还原代码。只用来和源文件交叉校验,不用于执行。 */
function extractCode(inner) {
  const m = inner.match(/<td class="code">([\s\S]*?)<\/td>/);
  const html = m ? m[1] : inner;
  return decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''));
}

const normalize = (s) => String(s).replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();

/* ---------- 配置 ---------- */

const tmpRoot = path.join(hexo.base_dir, '.notebook-tmp');
const cacheFile = path.join(tmpRoot, 'cache.json');

const cfg = Object.assign(
  { enable: true, timeout: 20000, cache: true, max_output: 20000, runners: {} },
  hexo.config.notebook || {},
);

if (!cfg.enable) {
  hexo.log.info('notebook: 已在 _config.yml 里关闭,代码块按普通高亮渲染');
} else {

/* ---------- 缓存 ---------- */

let cache = {};
if (cfg.cache && fs.existsSync(cacheFile)) {
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }
}
let cacheDirty = false;
let executed = 0;
let cachedHits = 0;

function saveCache() {
  if (!cfg.cache || !cacheDirty) return;
  fs.mkdirSync(tmpRoot, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache), 'utf8');
}

/* ---------- 执行 ---------- */

function runCell(lang, code) {
  const spec = LANGS[lang];
  const exe = (cfg.runners && cfg.runners[lang]) || spec.exe;
  // node 直接用当前进程的可执行文件,避免 PATH 上解析到别的 node
  const command = (lang === 'node' || lang === 'javascript') ? process.execPath : exe;

  const hash = createHash('sha256').update(`${lang}\n${code}`).digest('hex').slice(0, 16);
  const dir = path.join(tmpRoot, hash);
  fs.mkdirSync(dir, { recursive: true });

  const srcFile = path.join(dir, `cell${spec.ext}`);
  const outFile = path.join(dir, 'stdout.txt');
  const errFile = path.join(dir, 'stderr.txt');
  fs.writeFileSync(srcFile, code, 'utf8');

  const outFd = fs.openSync(outFile, 'w');
  const errFd = fs.openSync(errFile, 'w');
  const started = Date.now();
  const res = spawnSync(command, spec.args(srcFile), {
    cwd: dir,
    stdio: ['ignore', outFd, errFd], // 重定向到文件而不是管道:受限沙箱里命名管道会被拦
    timeout: cfg.timeout,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8', // 不加这两行,Windows 上中文输出会乱码
      PYTHONUTF8: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    },
  });
  fs.closeSync(outFd);
  fs.closeSync(errFd);

  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  // 把临时目录的绝对路径抹掉 —— 否则 traceback 里会把本机路径暴露到网页上。
  // 先替换 "目录+分隔符",再兜底替换纯目录,免得留下一个孤零零的反斜杠。
  const scrub = (s) => s
    .split(dir + '\\').join('')
    .split(`${dir}/`).join('')
    .split(dir).join('');
  const stdout = scrub(read(outFile));
  let stderr = scrub(read(errFile));
  const ms = Date.now() - started;

  let timedOut = false;
  if (res.error && res.error.code === 'ETIMEDOUT') timedOut = true;
  else if (res.error) stderr += `\n执行失败:${res.error.message}`;

  const clamp = (s) => (s.length <= cfg.max_output
    ? s
    : `${s.slice(0, cfg.max_output)}\n… 输出过长,已截断(共 ${s.length} 字符)`);

  return {
    stdout: clamp(stdout).replace(/\s+$/, ''),
    stderr: clamp(stderr).replace(/\s+$/, ''),
    ms,
    timedOut,
    failed: timedOut || res.status !== 0 || Boolean(res.error),
  };
}

/* ---------- 渲染 ---------- */

function renderCell(lang, code, result, index) {
  const spec = LANGS[lang];

  // 自己调 highlight 重新渲染,而不是复用 Hexo 已经渲染好的 figure ——
  // 因为 `node` 这类语言名 highlight.js 不认,Hexo 会降级成 plaintext。
  const codeHtml = highlight(code, {
    lang: spec.hl || lang,
    line_number: (hexo.config.highlight && hexo.config.highlight.line_number) !== false,
    tab_replace: (hexo.config.highlight && hexo.config.highlight.tab_replace) || '',
    hljs: false,
  });

  const parts = [];

  parts.push(`<div class="nb-cell" data-lang="${escapeHtml(lang)}">`);
  parts.push('<div class="nb-bar">');
  parts.push(`<span class="nb-lang">${escapeHtml(spec.name)}</span>`);
  parts.push(`<span class="nb-meta">构建时运行 · ${result.ms} ms</span>`);
  parts.push(result.failed
    ? '<span class="nb-status is-error">出错</span>'
    : '<span class="nb-status is-ok">已完成</span>');
  parts.push('<button class="nb-copy" type="button">复制代码</button>');
  parts.push('</div>');

  parts.push(codeHtml);

  parts.push('<div class="nb-out">');
  if (result.stdout || result.stderr || result.timedOut) {
    parts.push(`<div class="nb-out-head"><span class="nb-out-label">Out[${index}]</span></div>`);
    if (result.stdout) parts.push(`<pre class="nb-out-body">${escapeHtml(result.stdout)}</pre>`);
    if (result.stderr) parts.push(`<pre class="nb-out-body is-stderr">${escapeHtml(result.stderr)}</pre>`);
    if (result.timedOut) {
      parts.push(`<pre class="nb-out-body is-stderr">执行超时(超过 ${cfg.timeout} ms 被终止)</pre>`);
    }
  } else {
    parts.push('<pre class="nb-out-body is-empty">(没有输出)</pre>');
  }
  parts.push('</div>');

  parts.push('</div>');
  return parts.join('\n');
}

/* ---------- 从源文件里取出所有 exec 格 ---------- */

function readExecCells(sourcePath) {
  const full = path.join(hexo.source_dir, sourcePath);
  if (!fs.existsSync(full)) return [];

  const raw = fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '');
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''); // 去掉 front-matter

  const cells = [];
  for (const m of body.matchAll(FENCE_RE)) {
    const tokens = m[2].trim().split(/\s+/);
    const lang = (tokens[0] || '').toLowerCase();
    if (!tokens.slice(1).includes('exec')) continue;
    cells.push({ lang, code: m[3] });
  }
  return cells;
}

/* ---------- 过滤器 ---------- */

hexo.extend.filter.register('after_post_render', function (data) {
  if (!data.source || !data.content) return data;

  const cells = readExecCells(data.source);
  if (!cells.length) return data;

  let i = 0;
  data.content = data.content.replace(FIGURE_RE, (whole, lang, inner) => {
    const caption = inner.match(CAPTION_RE);
    if (!caption || !/^exec$/i.test(caption[1].trim())) return whole;

    const cell = cells[i];
    if (!cell) return whole;

    i += 1;
    const index = i;

    // 兜底校验:万一顺序错位,能从日志看出来
    const fromHtml = normalize(extractCode(inner));
    if (fromHtml && fromHtml !== normalize(cell.code)) {
      hexo.log.warn('notebook: %s 第 %d 格的代码与源文件不完全一致(通常是高亮还原差异,顺序若错位请检查)',
        data.source, index);
    }

    const hash = createHash('sha256').update(`${cell.lang}\n${cell.code}`).digest('hex').slice(0, 16);
    let result = cfg.cache ? cache[hash] : null;

    if (result) {
      cachedHits += 1;
    } else {
      result = runCell(cell.lang, cell.code);
      executed += 1;
      if (cfg.cache) { cache[hash] = result; cacheDirty = true; }
      hexo.log.info('notebook: %s %s 第 %d 格(%d ms)%s',
        result.failed ? '✗' : '✓', data.source, index, result.ms,
        result.failed ? ' —— 有错误输出' : '');
    }

    return renderCell(cell.lang, cell.code, result, index);
  });

  return data;
});

// 全部生成完再落盘,避免每格写一次文件
hexo.extend.filter.register('after_generate', function () {
  saveCache();
  if (executed || cachedHits) {
    hexo.log.info('notebook: 本次执行 %d 格,命中缓存 %d 格', executed, cachedHits);
  }
});

hexo.log.info('notebook: 已启用(代码围栏 info 串里加 exec 即可执行)');

}
