/**
 * 文章里的函数图像:2D 曲线与 3D 曲面,可在网页上用鼠标缩放 / 旋转。
 *
 * 写法:用一个带 plot2d / plot3d 标记的围栏代码块
 *
 *   ```plot2d x=[-7,7] y=[-2,2]
 *   sin(x)
 *   cos(x)
 *   ```
 *
 *   ```plot3d x=[-5,5] y=[-5,5] grid=48
 *   sin(sqrt(x^2+y^2))
 *   ```
 *
 * 这里只做两件事:把代码块换成 <div class="plot"> 容器,把表达式和选项以 JSON 塞进去。
 * 真正的解析与绘制在 themes/cos-cross/source/js/plot.js(按需加载)。
 *
 * 关键点:
 *   1. 必须挂 after_post_render —— before_post_render 阶段代码块已经被换成
 *      <hexoPostRenderCodeBlock> 占位符,拿不到内容也不认识 figure;
 *   2. 构建期顺手把表达式编译一遍,语法错/未知符号当场在日志里报出来,
 *      不用等打开网页才发现是一张空图;
 *   3. 表达式是**纯文本**高亮(highlight.js 没有 plot2d 这个词法),所以从 HTML 里
 *      还原代码是可靠的,唯一要注意的是把 HTML 实体解回来。
 */
const path = require('node:path');
const fs = require('node:fs');

// 复用前端那份实现的解析器,保证"构建期能过"和"浏览器里能画"是同一套规则
const Kit = require(path.join(hexo.theme_dir, 'source', 'js', 'plot.js'));

const FIGURE_RE = /<figure class="highlight [^"]*">([\s\S]*?)<\/figure>/g;
/** 围栏代码块:匹配"同长度的闭合围栏" */
const FENCE_RE = /^(`{3,})([^\n]*)\n([\s\S]*?)^\1[ \t]*$/gm;

let rendered = 0;
const problems = [];

/* ---------- 工具 ---------- */

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** 从渲染好的 figure 里还原代码(plot 块是纯文本高亮,所以能原样还原) */
function extractCode(inner) {
  const m = inner.match(/<td class="code">([\s\S]*?)<\/td>/);
  const html = m ? m[1] : inner;
  return decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''));
}

/** 规范化代码,用来做"源文件 ↔ 渲染结果"的配对 */
function normCode(s) {
  return String(s)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 把选项串解析成对象:x=[-5,5] y=[-1,1] grid=48 */
function parseOptions(str) {
  const out = {};
  if (!str) return out;
  const re = /([A-Za-z_]\w*)\s*=\s*(\[[^\]]*\]|[^\s]+)/g;
  let m;
  while ((m = re.exec(str))) {
    const key = m[1].toLowerCase();
    const raw = m[2];
    if (raw.startsWith('[')) {
      const nums = raw.slice(1, -1).split(',').map((v) => Number(v.trim()));
      if (nums.length === 2 && nums.every(Number.isFinite)) out[key] = nums;
    } else if (Number.isFinite(Number(raw))) {
      out[key] = Number(raw);
    } else {
      out[key] = raw;
    }
  }
  return out;
}

/** 保证区间是 [小, 大],并且有点宽度 */
function normalizeRange(v, fallback) {
  if (!Array.isArray(v) || v.length !== 2) return fallback.slice();
  let [a, b] = v;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return fallback.slice();
  if (a > b) [a, b] = [b, a];
  if (b - a < 1e-6) { a -= 0.5; b += 0.5; }
  return [a, b];
}

/* ---------- 从源文件里找出所有 plot 代码块 ---------- */

/**
 * 为什么读源文件、而不是靠渲染结果里的类名:
 * Hexo 的高亮对"没见过的语言"会统一降级成 plaintext,`plot2d` 这个类名根本留不下来;
 * 而给 highlight.js 注册自定义语言又会踩到 hexo-util 在项目里存在两份实现、
 * 行为不一致的坑。所以直接读原始 Markdown,再用**代码内容**去和渲染出来的
 * figure 配对 —— 顺序、缩进代码块、类名降级都不影响。
 */
function readPlotBlocks(sourcePath) {
  if (!sourcePath) return [];
  const full = path.join(hexo.source_dir, sourcePath);
  if (!fs.existsSync(full)) return [];

  const raw = fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '');
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '');

  const blocks = [];
  for (const m of body.matchAll(FENCE_RE)) {
    const info = m[2].trim();
    const tokens = info.split(/\s+/);
    const kind = (tokens[0] || '').toLowerCase();
    if (kind !== 'plot2d' && kind !== 'plot3d') continue;
    blocks.push({
      kind: kind === 'plot3d' ? '3d' : '2d',
      optsRaw: parseOptions(tokens.slice(1).join(' ')),
      code: m[3].replace(/\s+$/, ''),
      norm: normCode(m[3]),
    });
  }
  return blocks;
}

/* ---------- 生成容器 ---------- */

function buildBlock(kind, payload, opts, rawSource, label, ratio) {
  // JSON 直接嵌在 <script> 里,把 < 转义掉才不会被当成结束标签
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');

  const hint = kind === '3d'
    ? '拖动旋转 · 滚轮缩放 · 双击重置'
    : '滚轮缩放 · 拖动平移 · 双击重置';

  return [
    `<div class="plot" data-kind="${kind}" data-mount${ratio ? ` data-ratio="${ratio}"` : ''}>`,
    '  <div class="plot-bar">',
    `    <span class="plot-kind">${escapeHtml(label)}</span>`,
    `    <span class="plot-hint">${hint}</span>`,
    '    <span class="plot-actions">',
    '      <button type="button" data-plot-action="reset">重置</button>',
    '      <button type="button" data-plot-action="save">存为 PNG</button>',
    '    </span>',
    '  </div>',
    '  <div class="plot-stage"><canvas></canvas></div>',
    `  <script type="application/json">${json}</script>`,
    `  <details class="plot-src"><summary>表达式</summary><pre>${escapeHtml(rawSource)}</pre></details>`,
    '</div>',
  ].join('\n');
}

/* ---------- 过滤器 ---------- */

hexo.extend.filter.register('after_post_render', function (data) {
  if (!data.content || data.content.indexOf('highlight') === -1) return data;

  const blocks = readPlotBlocks(data.source);
  if (!blocks.length) return data;

  // 按代码内容建索引;内容相同的块按出现顺序依次消费
  const queue = new Map();
  blocks.forEach((b) => {
    if (!queue.has(b.norm)) queue.set(b.norm, []);
    queue.get(b.norm).push(b);
  });

  data.content = data.content.replace(FIGURE_RE, (whole, inner) => {
    const code = extractCode(inner);
    const key = normCode(code);
    const list = queue.get(key);
    if (!list || !list.length) return whole;

    const block = list.shift();
    const kind = block.kind;
    const all = code.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
    if (!all.length) {
      problems.push(`${data.source}:一个 plot${kind} 代码块里没有表达式`);
      return whole;
    }

    const o = block.optsRaw;
    const vars = kind === '3d' ? ['x', 'y', 'z'] : ['x', 'y'];

    // 按行分类。判断顺序很重要:点的写法最特殊先认,
    // 然后是比较(<=/>= 里也含 "=",必须排在等号前面),最后才是等号和显式函数。
    const points = [];
    const constraints = [];
    const equations = [];
    const explicit = [];

    /**
     * `y = f(x)` / `z = f(x,y)` 这种"左边只有一个因变量"的等式,按显式函数处理。
     * 效果一样,但显式走的是逐点采样,比 marching squares / surface nets 快得多,
     * 而且不会因为"看起来像隐式"而把画布强行改成正方形。
     */
    function asExplicit(line, dep) {
      const eq = Kit.parseEquation(line);
      if (!eq.implicit) return null;
      if (eq.lhs !== dep) return null;
      let names;
      try {
        names = Kit.collectNames(Kit.parse(eq.rhs));
      } catch {
        return null;
      }
      if (names.vars[dep]) return null; // 右边又出现因变量,那就是真隐式
      return eq.rhs;
    }

    all.forEach((line) => {
      if (/^point\s*\(/i.test(line)) {
        try {
          points.push(...Kit.parsePoints(line, []));
        } catch (e) {
          problems.push(`${data.source}:"${line}" —— ${e.message}`);
        }
      } else if (/<=|>=|<|>/.test(line)) {
        try {
          Kit.compileConstraint(line, vars);
          constraints.push(line);
        } catch (e) {
          problems.push(`${data.source}:"${line}" —— ${e.message}`);
        }
      } else if (line.includes('=')) {
        const dep = kind === '3d' ? 'z' : 'y';
        const asFn = asExplicit(line, dep);
        if (asFn !== null) {
          try {
            Kit.compile(asFn, kind === '3d' ? ['x', 'y'] : ['x']);
            explicit.push(asFn);
          } catch (e) {
            problems.push(`${data.source}:"${line}" —— ${e.message}`);
          }
        } else {
          try {
            Kit.compileImplicit(line, kind === '3d' ? vars : ['x', 'y']);
            equations.push(line);
          } catch (e) {
            problems.push(`${data.source}:"${line}" —— ${e.message}`);
          }
        }
      } else {
        explicit.push(line);
      }
    });

    // 点的坐标只能是常量,构建期就求好;顺便检查它是否落在画图范围里
    if (kind === '2d' && points.length && !constraints.length) {
      // 只有点、没有曲线时,纵轴按点自动定范围(留 20% 边距)
      const ys = points.map((p) => p.y);
      if (!Array.isArray(o.y)) {
        const lo = Math.min(...ys);
        const hi = Math.max(...ys);
        const pad = Math.max((hi - lo) * 0.2, 0.5);
        o.y = [lo - pad, hi + pad];
      }
    }

    const validate = (src, list) => list.forEach((s) => {
      try {
        if (s.includes('=') && !/<=|>=/.test(s)) Kit.compileImplicit(s, vars);
        else Kit.compile(s, vars);
      } catch (e) {
        problems.push(`${data.source}:"${s}" —— ${e.message}`);
      }
    });

    let payload;
    let label;
    let ratio = null;

    if (kind === '3d') {
      const isImplicit = equations.length > 0;
      // 只有"曲面本身"(方程或显式函数)才算数量,约束条件和点不算
      const surfaceCount = equations.length + explicit.length;
      if (surfaceCount > 1) {
        problems.push(`${data.source}:3D 只支持一个曲面/等值面,后面的被忽略了`);
      }
      const surface = isImplicit ? equations[0] : explicit[0];
      if (surface) validate(surface, [surface]);

      if (isImplicit) {
        const opts = {
          x: normalizeRange(o.x, [-2, 2]),
          y: normalizeRange(o.y, [-2, 2]),
          z: normalizeRange(o.z, [-2, 2]),
          grid: Math.max(8, Math.min(64, o.grid || 28)),
        };
        payload = { expr: surface, opts, implicit: true };
        label = `3D 等值面 · ${surface}`;
      } else {
        const opts = {
          x: normalizeRange(o.x, [-5, 5]),
          y: normalizeRange(o.y, [-5, 5]),
          z: Array.isArray(o.z) ? normalizeRange(o.z, [-1, 1]) : null,
          grid: Math.max(8, Math.min(90, o.grid || 46)),
        };
        payload = { expr: surface, opts };
        label = `3D 曲面 · z = ${surface}`;
      }
      payload.constraints = constraints;
      payload.points = points;
      if (constraints.length) label += ` · ${constraints.length} 个约束`;
      if (points.length) label += ` · ${points.length} 个点`;
    } else {
      const keptExplicit = explicit.slice(0, 6);
      const keptImplicit = equations.slice(0, 6);
      validate('', []);
      const allExprs = keptExplicit.concat(keptImplicit);
      allExprs.forEach((s) => {
        try {
          if (s.includes('=')) Kit.compileImplicit(s, ['x', 'y']);
          else Kit.compile(s, ['x']);
        } catch (e) {
          problems.push(`${data.source}:"${s}" —— ${e.message}`);
        }
      });

      const regionOnly = !allExprs.length && constraints.length > 0;
      if (!allExprs.length && !constraints.length && !points.length) {
        problems.push(`${data.source}:一个 plot2d 代码块里没有可画的式子`);
        return whole;
      }

      const xr = normalizeRange(o.x, [-10, 10]);
      let yr = Array.isArray(o.y) ? normalizeRange(o.y, [-1, 1]) : null;
      if ((keptImplicit.length || regionOnly) && !yr) {
        // 隐式曲线和区域(圆、椭圆…)必须横纵等比例,否则会被压扁
        const cxr = (xr[0] + xr[1]) / 2;
        const half = (xr[1] - xr[0]) / 2;
        yr = [cxr - half, cxr + half];
      }
      if (keptImplicit.length || regionOnly) ratio = 1;

      const opts = {
        x: xr,
        y: yr,
        samples: Math.max(100, Math.min(2000, o.n || 900)),
      };
      payload = {
        exprs: keptExplicit,
        implicit: keptImplicit,
        constraints: constraints,
        points: points,
        opts,
      };
      const parts = [];
      if (regionOnly) parts.push('区域');
      if (keptExplicit.length) parts.push(`${keptExplicit.length} 条曲线`);
      if (keptImplicit.length) parts.push(`${keptImplicit.length} 个方程`);
      if (constraints.length && !regionOnly) parts.push(`${constraints.length} 个约束`);
      if (points.length) parts.push(`${points.length} 个点`);
      label = `2D · ${parts.join(' + ')}`;
    }

    rendered += 1;
    return buildBlock(kind, payload, null, code, label, ratio);
  });

  // 有源块但没配上 figure,说明配对失败,要说出来而不是静默失败
  queue.forEach((list) => {
    list.forEach((b) => {
      problems.push(`${data.source}:一个 plot${b.kind} 代码块没能和渲染结果配对(表达式:${b.norm.split('\n')[0]})`);
    });
  });

  return data;
});

hexo.extend.filter.register('after_generate', function () {
  if (rendered) hexo.log.info('plot: 生成了 %d 个函数图像', rendered);
  if (problems.length) {
    hexo.log.warn('plot: %d 个问题:', problems.length);
    problems.forEach((p) => hexo.log.warn('  - %s', p));
  }
});

hexo.log.info('plot: 已启用(代码围栏用 plot2d / plot3d 标记即可插入函数图像)');

