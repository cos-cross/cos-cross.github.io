/**
 * 无头渲染测试:用桩 canvas 在 Node 里跑真实的 PlotKit.mount()。
 *
 * 为什么需要它:数学核心的单元测试只能验证"算得对不对",
 * 验证不了"画不画得出来" —— 比如区域模块是不是真的往 canvas 上填了东西、
 * 坐标轴范围是不是被别的逻辑覆盖掉了。这个 harness 把整条客户端路径跑一遍,
 * 记录所有 canvas 调用,于是渲染问题也能在 Node 里发现。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Kit = require(path.join(root, 'themes', 'cos-cross', 'source', 'js', 'plot.js'));

let pass = 0;
let fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass += 1; console.log(`PASS  ${label}`); }
  else { fail += 1; console.log(`FAIL  ${label}${extra !== undefined ? '  → ' + extra : ''}`); }
}

/* ---------- 桩 ---------- */

function makeCtx(record) {
  const ctx = {
    canvas: null,
    calls: record,
    // 状态属性直接存下来,便于断言"用的是不是这个颜色"
    set fillStyle(v) { record.fillStyle = v; },
    get fillStyle() { return record.fillStyle; },
    set strokeStyle(v) { record.strokeStyle = v; },
    get strokeStyle() { return record.strokeStyle; },
    set lineWidth(v) { record.lineWidth = v; },
    get lineWidth() { return record.lineWidth; },
    set font(v) { record.font = v; },
    get font() { return record.font; },
    set textAlign(v) { record.textAlign = v; },
    get textAlign() { return record.textAlign; },
    set textBaseline(v) { record.textBaseline = v; },
    get textBaseline() { return record.textBaseline; },
    lineJoin: 'miter', lineCap: 'butt',
    shadowColor: '', shadowBlur: 0,
    // 半透明是靠 globalAlpha 实现的,所以它必须能被记录下来供断言
    set globalAlpha(v) { record.globalAlpha = v; },
    get globalAlpha() { return record.globalAlpha; },
    setTransform() {}, clearRect() {},
    beginPath() { record.paths.push([]); },
    rect(x, y, w, h) { record.rects.push([x, y, w, h]); record.curRects += 1; if (record.cur) record.cur.push(['r', x, y, w, h]); },
    moveTo(x, y) { record.moves.push([x, y]); if (record.cur) record.cur.push(['m', x, y]); },
    lineTo(x, y) { record.lines.push([x, y]); if (record.cur) record.cur.push(['l', x, y]); },
    arc(x, y, r) { record.arcs.push([x, y, r]); if (record.cur) record.cur.push(['a', x, y, r]); },
    closePath() {},
    fill() {
      const path = record.cur ? record.cur.slice() : [];
      record.fills.push(path);
      record.fillRectCounts.push(record.curRects);
      record.shapes.push({ kind: 'fill', style: record.fillStyle, alpha: record.globalAlpha, path });
      // 注意:这里**不能**把 cur 清空 —— 画布上 fill() 之后紧跟的 stroke()
      // 描的是同一条路径(压缝就是这么做的),清空了就记录不到描边。
      record.curRects = 0;
    },
    stroke() {
      const path = record.cur ? record.cur.slice() : [];
      record.strokes.push(path);
      record.shapes.push({ kind: 'stroke', style: record.strokeStyle, width: record.lineWidth, path });
      record.cur = null;
    },    fillText(t, x, y) { record.texts.push([t, x, y]); },
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    toDataURL() { return 'data:image/png;base64,'; },
  };
  // 每次 beginPath 开一条新路径,stroke/fill 时归档
  const origBegin = ctx.beginPath;
  ctx.beginPath = function () { record.cur = []; record.curRects = 0; origBegin.call(ctx); };
  return ctx;
}

function makeEl(kind, payload, opts = {}) {
  const record = {
    paths: [], rects: [], moves: [], lines: [], arcs: [], fills: [], strokes: [], texts: [],
    shapes: [], cur: null, errorNodes: [], curRects: 0, fillRectCounts: [],
    fillStyle: null, strokeStyle: null, lineWidth: null, font: null, textAlign: null, textBaseline: null,
    globalAlpha: 1,
  };
  const canvas = {
    width: 800, height: 460,
    dataset: {},
    style: {},
    getContext: () => makeCtx(record),
    getBoundingClientRect: () => ({ width: 800, height: 460, left: 0, top: 0 }),
    addEventListener() {}, setPointerCapture() {}, releasePointerCapture() {},
  };
  const payloadEl = { textContent: JSON.stringify(payload) };

  // 工具条按钮的桩:只为把"半透明"开关这条路也跑一遍
  function makeButton(action) {
    const listeners = [];
    const cls = new Set();
    const attrs = {};
    return {
      dataset: { plotAction: action },
      classList: {
        toggle(c, on) { if (on) cls.add(c); else cls.delete(c); },
        contains: (c) => cls.has(c),
      },
      setAttribute(k, v) { attrs[k] = v; },
      getAttribute: (k) => attrs[k],
      title: '',
      addEventListener(ev, fn) { if (ev === 'click') listeners.push(fn); },
      click() { listeners.forEach((fn) => fn()); },
    };
  }
  const buttons = ['reset', 'alpha', 'save'].map(makeButton);

  const el = {
    dataset: Object.assign({
      kind,
      ...(opts.ratio ? { ratio: String(opts.ratio) } : {}),
    }),
    querySelector(sel) {
      if (sel === 'canvas') return canvas;
      if (sel === 'script[type="application/json"]') return payloadEl;
      if (sel === '.plot-error') return record.errors.length ? { textContent: record.errors[record.errors.length - 1] } : null;
      return null;
    },
    querySelectorAll(sel) { return sel === '[data-plot-action]' ? buttons : []; },
    appendChild(node) {
      // textContent 是 appendChild 之后才赋值的,所以存节点本身、断言时再读
      if (node && node.className === 'plot-error') record.errorNodes.push(node);
    },
    style: {},
  };
  return { el, canvas, record, buttons };
}

/** 把 PlotKit.mount 需要的浏览器全局装上 */
function withDom(fn) {
  const saved = {
    window: globalThis.window,
    document: globalThis.document,
    getComputedStyle: globalThis.getComputedStyle,
    ResizeObserver: globalThis.ResizeObserver,
  };
  const styleStub = {
    getPropertyValue(name) {
      return ({
        '--plot-grid': 'rgba(1,1,1,.1)',
        '--plot-axis': 'rgba(1,1,1,.4)',
        '--plot-text': 'rgba(1,1,1,.9)',
      })[name] || '';
    },
  };
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, requestAnimationFrame() {} };
  globalThis.document = { readyState: 'complete', addEventListener() {}, createElement: () => ({ click() {}, style: {} }) };
  globalThis.getComputedStyle = () => styleStub;
  globalThis.ResizeObserver = undefined;
  try {
    return fn();
  } finally {
    globalThis.window = saved.window;
    globalThis.document = saved.document;
    globalThis.getComputedStyle = saved.getComputedStyle;
    globalThis.ResizeObserver = saved.ResizeObserver;
  }
}

function render(kind, payload, opts) {
  const { el, canvas, record, buttons } = makeEl(kind, payload, opts);
  withDom(() => {
    try {
      Kit.mount(el);
    } catch (e) {
      record.errorNodes.push({ className: 'plot-error', textContent: e.message });
      el.dataset.error = '1';
    }
  });
  return { el, canvas, record, buttons };
}

/** 只取某种颜色的描边(用来把曲线和坐标轴/网格分开看) */
function strokesWith(record, color) {
  return record.shapes.filter((s) => s.kind === 'stroke' && s.style === color);
}

/** 把桩捕获到的错误提示拼成字符串 */
function errText(record) {
  return record.errorNodes.map((n) => n.textContent).filter(Boolean).join('; ');
}

/* ============================================================
   用例
   ============================================================ */

console.log('=== 区域模式(只有约束条件) ===');
{
  const { record, el } = render('2d', {
    items: [], region: ['x^2 + y^2 < 1'], opts: { x: [-2, 2], y: [-2, 2], samples: 900 },
  });
  ok('没有报错', !el.dataset.error, errText(record));
  ok('往 canvas 上填了区域', record.fills.length >= 1, `${record.fills.length} 次 fill`);
  ok('区域边界被描了边', record.strokes.length >= 1, `${record.strokes.length} 次 stroke`);
  ok('填充色是半透明青色', /rgba\(46, 230, 255/.test(String(record.fillStyle)), String(record.fillStyle));
  console.log(`       矩形总数 ${record.rects.length},fill 次数 ${record.fills.length},每次 fill 的矩形数 ${JSON.stringify(record.fillRectCounts)}`);

  // 格子应该落在圆内,而且不该填满整张图
  const dprW = 800;
  const dprH = Math.round(800 * 0.58);
  const sx = dprW / 4, sy = dprH / 4;
  const outside = record.rects.filter(([px, py, w, h]) => {
    const cx = (px + w / 2) / sx - 2;
    const cy = 2 - (py + h / 2) / sy;
    return cx * cx + cy * cy > 1.02;
  });
  ok('所有格子中心都落在圆内', outside.length === 0, `${outside.length}/${record.rects.length} 个越界`);
  ok('格子数量接近圆的理论占比', record.rects.length > 3800 && record.rects.length < 5000,
    `${record.rects.length} 个(理论约 ${Math.round(Math.PI / 16 * 150 * 150)})`);
}

console.log('\n=== 区域 + 单独的点(之前的 bug 场景) ===');
{
  const { record, el } = render('2d', {
    items: [{ type: 'point', x: 0, y: 0, z: 0, label: 'O', constraints: ['x^2 + y^2 < 1'] }],
    region: ['x^2 + y^2 < 1'],
    opts: { x: [-2, 2], y: [-2, 2], samples: 900 },
  });
  ok('没有报错', !el.dataset.error);
  ok('区域照样填了', record.fills.length >= 1, `${record.fills.length} 次 fill`);
  ok('点画出来了', record.arcs.length >= 1, `${record.arcs.length} 个圆`);
  ok('点的标签画出来了', record.texts.some((t) => t[0] === 'O'), JSON.stringify(record.texts.map((t) => t[0])));
  // 关键:y 范围不能被"只有点"的自动缩放逻辑改掉
  const rounded = record.rects.every(([, py]) => py >= -1 && py <= 461);
  ok('格子没有画到画布外(说明 y 范围没被改坏)', rounded);
}

console.log('\n=== 约束下的曲线 ===');
{
  const { record, el } = render('2d', {
    items: [{ type: 'explicit', expr: 'sin(x)', constraints: ['x >= 0'] }],
    region: [],
    opts: { x: [-5, 5], y: [-1.5, 1.5], samples: 900 },
  });
  ok('没有报错', !el.dataset.error, errText(record));
  // 只看曲线的描边(坐标轴和网格是别的颜色),否则会把轴线当成曲线
  const curve = strokesWith(record, '#2ee6ff');
  ok('曲线被画出来了', curve.length >= 1, `${curve.length} 条`);
  const xs = curve.flatMap((s) => s.path.filter((p) => p[0] === 'm' || p[0] === 'l').map((p) => p[1]));
  ok('只画在 x>=0 的一侧', xs.length > 0 && xs.every((px) => px >= 400 - 0.5),
    `最小 x 像素 ${xs.length ? Math.min(...xs).toFixed(1) : '(无)'}`);
}

console.log('\n=== 隐式曲线 + 区域背景 ===');
{
  const { record, el } = render('2d', {
    items: [{ type: 'implicit', expr: 'x^2 + y^2 = 1', constraints: [] }],
    region: [],
    opts: { x: [-2, 2], y: [-2, 2], samples: 900 },
  });
  ok('没有报错', !el.dataset.error);
  ok('等值线被画出来了', record.strokes.length >= 1);
  ok('等值线段数量足够', record.moves.length > 100, `${record.moves.length} 段`);
}

console.log('\n=== 3D 显式曲面 ===');
{
  const { record, el } = render('3d', {
    items: [{ type: 'explicit', expr: 'sin(x)*cos(y)', constraints: [] }],
    opts: { x: [-3, 3], y: [-3, 3], z: null, grid: 20 },
  });
  ok('没有报错', !el.dataset.error, errText(record));
  ok('曲面四边形被填充', record.fills.length > 100, `${record.fills.length} 个`);
}

console.log('\n=== 3D 多曲面(正四面体堆积的四个相切球:用户笔记里的场景) ===');
{
  const { record, el } = render('3d', {
    items: [
      { type: 'implicit', expr: '(x-1)^2+y^2+z^2=3/4', constraints: [] },
      { type: 'implicit', expr: '(x+1/2)^2+(y-sqrt(3)/2)^2+z^2=3/4', constraints: [] },
      { type: 'implicit', expr: '(x+1/2)^2+(y+sqrt(3)/2)^2+z^2=3/4', constraints: [] },
      { type: 'implicit', expr: 'x^2+y^2+(z-sqrt(2))^2=3/4', constraints: [] },
      { type: 'point', x: 1, y: 0, z: 0, label: 'B', constraints: [] },
      { type: 'point', x: 0, y: 0, z: Math.SQRT2, label: 'A', constraints: [] },
      { type: 'point', x: -0.5, y: Math.sqrt(3) / 2, z: 0, label: 'C', constraints: [] },
      { type: 'point', x: -0.5, y: -Math.sqrt(3) / 2, z: 0, label: 'D', constraints: [] },
    ],
    opts: { x: [-4, 4], y: [-4, 4], z: [-4, 4], grid: 28 },
  });
  ok('四个球面 + 四个点没有抛错', !el.dataset.error, errText(record));
  ok('四个球都画出来了(面数远多于单个球)', record.fills.length > 500, `${record.fills.length} 个面`);
  ok('四个点都画出来了', record.arcs.length >= 4, `${record.arcs.length} 个`);
  ok('四个点的标签都在',
    ['A', 'B', 'C', 'D'].every((L) => record.texts.some((t) => t[0] === L)),
    record.texts.map((t) => t[0]).join(''));
  // 多曲面时按曲面编号上色,应该出现多种颜色
  const colors = new Set(record.shapes.filter((s) => s.kind === 'fill').map((s) => s.style));
  ok('多个曲面用了不同颜色', colors.size >= 3, `${colors.size} 种颜色`);
}

console.log('\n=== 半透明曲面 ===');
{
  const items = [
    { type: 'implicit', expr: 'x^2+y^2+z^2=1', constraints: [] },
    { type: 'implicit', expr: '(x-1)^2+y^2+z^2=1', constraints: [] },
  ];

  // 1) 构建期没给 alpha 时:多个曲面依然画出东西,而且是不透明的
  const opaque = render('3d', { items, opts: { x: [-2, 2], y: [-2, 2], z: [-2, 2], grid: 20 } });
  ok('不传 alpha 时没有报错', !opaque.el.dataset.error, errText(opaque.record));
  ok('不传 alpha 时全部是不透明的',
    opaque.record.shapes.filter((s) => s.kind === 'fill').every((s) => s.alpha === 1));
  const opaqueStrokes = opaque.record.shapes.filter((s) => s.kind === 'stroke' && s.path.length === 4).length;
  ok('不透明时仍然用同色描边压缝', opaqueStrokes > 100, `${opaqueStrokes} 条`);

  // 2) alpha=0.6:每个面按 0.6 填,而且不能再描边
  const trans = render('3d', { items, opts: { x: [-2, 2], y: [-2, 2], z: [-2, 2], grid: 20, alpha: 0.6 } });
  ok('半透明时没有报错', !trans.el.dataset.error, errText(trans.record));
  const fills = trans.record.shapes.filter((s) => s.kind === 'fill');
  ok('曲面四边形都画出来了', fills.length > 300, `${fills.length} 个面`);
  ok('每个面都按 0.6 填', fills.every((s) => Math.abs(s.alpha - 0.6) < 1e-9));
  // 坐标轴本身也要描边,所以只看"四边形形状"的描边(path 有 4 个点)
  const quadStrokes = trans.record.shapes.filter((s) => s.kind === 'stroke' && s.path.length === 4);
  ok('半透明时四边形不再描边(否则网格线会浮出来)', quadStrokes.length === 0, `${quadStrokes.length} 条`);
  ok('画完曲面后 alpha 还原成 1', trans.record.globalAlpha === 1, String(trans.record.globalAlpha));
  ok('面的顶点仍然是 4 个(只是被撑大了一点)',
    fills.every((s) => s.path.length === 4));
  // 撑开之后相邻面的投影范围会比不透明时略大
  const spanOf = (rec) => {
    const xs = rec.shapes.filter((s) => s.kind === 'fill').flatMap((s) => s.path.map((p) => p[1]));
    return Math.max(...xs) - Math.min(...xs);
  };
  ok('半透明时四边形被撑开(接缝由相邻面互相咬住)', spanOf(trans.record) > spanOf(opaque.record));

  // 3) 点在任何 alpha 下都必须是不透明的
  const withPoint = render('3d', {
    items: items.concat([{ type: 'point', x: 0, y: 0, z: 0, label: 'O', constraints: [] }]),
    opts: { x: [-2, 2], y: [-2, 2], z: [-2, 2], grid: 16, alpha: 0.5 },
  });
  ok('有点时没有报错', !withPoint.el.dataset.error, errText(withPoint.record));
  ok('点是画出来的', withPoint.record.arcs.length >= 1);
  ok('点不会被画成半透明', withPoint.record.globalAlpha === 1, String(withPoint.record.globalAlpha));

  // 4) alpha 越界要夹住,不能画出全透明的东西
  const clamped = render('3d', { items, opts: { x: [-2, 2], y: [-2, 2], z: [-2, 2], grid: 16, alpha: 3 } });
  ok('alpha 超出范围时按不透明处理',
    clamped.record.shapes.filter((s) => s.kind === 'fill').every((s) => s.alpha === 1));

  // 5) 工具条上的「半透明」按钮要能来回切
  // 点击会触发 draw(),而 draw 要读 CSS 变量 —— 所以点击也得在 DOM 桩里跑
  const clickIn = (btn) => withDom(() => btn.click());
  const toggle = render('3d', { items, opts: { x: [-2, 2], y: [-2, 2], z: [-2, 2], grid: 16 } });
  const alphaBtn = toggle.buttons.find((b) => b.dataset.plotAction === 'alpha');
  const lastAlpha = () => toggle.record.shapes.filter((s) => s.kind === 'fill').pop().alpha;
  ok('默认不透明时按钮显示为关闭', alphaBtn.getAttribute('aria-pressed') === 'false');
  clickIn(alphaBtn);
  ok('点一下变成半透明', lastAlpha() < 1 && lastAlpha() > 0.05, String(lastAlpha()));
  ok('按钮进入按下状态', alphaBtn.getAttribute('aria-pressed') === 'true' && alphaBtn.classList.contains('is-on'));
  clickIn(alphaBtn);
  ok('再点一下变回不透明', lastAlpha() === 1);
  ok('按钮回到未按下状态', alphaBtn.getAttribute('aria-pressed') === 'false' && !alphaBtn.classList.contains('is-on'));
  // 构建期已经给了 alpha 的图,点一下就回到作者给的那个值,而不是硬编码的 0.62
  const authored = render('3d', { items, opts: { x: [-2, 2], y: [-2, 2], z: [-2, 2], grid: 16, alpha: 0.35 } });
  const btn2 = authored.buttons.find((b) => b.dataset.plotAction === 'alpha');
  const lastAlpha2 = () => authored.record.shapes.filter((s) => s.kind === 'fill').pop().alpha;
  ok('作者给了 alpha 时按钮初始就是按下状态', btn2.getAttribute('aria-pressed') === 'true');
  clickIn(btn2);
  ok('切回不透明', lastAlpha2() === 1);
  clickIn(btn2);
  ok('再切回作者指定的 0.35', Math.abs(lastAlpha2() - 0.35) < 1e-9, String(lastAlpha2()));
}

console.log('\n=== 3D 隐式曲面 + 约束 + 点 ===');
{
  const { record, el } = render('3d', {
    items: [
      { type: 'implicit', expr: 'x^2 + y^2 + z^2 = 1', constraints: ['z > 0'] },
      { type: 'point', x: 0, y: 0, z: 1, label: 'Z', constraints: ['z > 0'] },
    ],
    opts: { x: [-2, 2], y: [-2, 2], z: [-2, 2], grid: 24 },
  });
  ok('没有报错', !el.dataset.error);
  ok('上半球被画出来了', record.fills.length > 100, `${record.fills.length} 个面`);
  ok('点画出来了', record.arcs.length >= 1, `${record.arcs.length} 个`);
  ok('点的标签画出来了', record.texts.some((t) => t[0] === 'Z'));
}

console.log('\n=== 出错时的表现 ===');
{
  const { el } = render('2d', {
    items: [{ type: 'explicit', expr: 'nope(', constraints: [] }],
    region: [], opts: { x: [-1, 1], y: [-1, 1], samples: 100 },
  });
  ok('表达式错误会显示提示而不是静默白屏', el.dataset.error === '1', String(el.dataset.error));
}

console.log(`\n${pass} 通过,${fail} 失败`);
process.exit(fail ? 1 : 0);
