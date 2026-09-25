/**
 * plot.js 数学核心的单元测试。
 *
 *   npm test
 *
 * 为什么值得单独跑:表达式解析、采样、曲面网格、投影、深度排序这些错了,
 * 图"看起来还是有东西",但完全是错的 —— 比如曾经把 `x^2` 编译成 JS 的按位异或
 * (`3^2` 算出 1),又把方位角转错了轴(画面原地打滚)。这些肉眼都很难发现,
 * 但写成断言就很明显。
 *
 * 不需要浏览器:plot.js 同时导出到 module.exports,Node 直接 require 即可。
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
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

function evalExpr(src, vars) {
  const f = Kit.compile(src, Object.keys(vars));
  const scope = Kit.makeScope(Object.keys(vars));
  Object.assign(scope, vars);
  return f(scope);
}
function throws(src, vars) {
  try { evalExpr(src, vars || {}); return null; } catch (e) { return e.message; }
}

console.log('=== 表达式解析 ===');
ok('2+3*4 = 14', evalExpr('2+3*4', {}) === 14);
ok('(2+3)*4 = 20', evalExpr('(2+3)*4', {}) === 20);
ok('2^3^2 = 512(乘方右结合)', evalExpr('2^3^2', {}) === 512);
ok('-2^2 = -4(乘方优先于负号)', evalExpr('-2^2', {}) === -4);
ok('sin(pi/2) = 1', near(evalExpr('sin(pi/2)', {}), 1));
ok('sqrt(16) = 4', evalExpr('sqrt(16)', {}) === 4);
ok('log(e) = 1', near(evalExpr('log(e)', {}), 1));
ok('x^2 当 x=3 → 9(不是异或)', evalExpr('x^2', { x: 3 }) === 9);
ok('max(1,5,3) = 5', evalExpr('max(1,5,3)', {}) === 5);
ok('1/(1+x^2) 当 x=1 → 0.5', near(evalExpr('1/(1+x^2)', { x: 1 }), 0.5));
ok('exp(-x^2) 当 x=0 → 1', near(evalExpr('exp(-x^2)', { x: 0 }), 1));
ok('sinc(0) = 1(而不是 NaN)', evalExpr('sinc(0)', {}) === 1);

console.log('\n=== 隐式乘法 ===');
ok('2x 当 x=5 → 10', evalExpr('2x', { x: 5 }) === 10);
ok('3sin(0) = 0', evalExpr('3sin(0)', {}) === 0);
ok('2(x+1) 当 x=2 → 6', evalExpr('2(x+1)', { x: 2 }) === 6);
ok('(x+1)(x-1) 当 x=3 → 8', evalExpr('(x+1)(x-1)', { x: 3 }) === 8);
ok('2x^2 当 x=3 → 18(与显式乘法同级)', evalExpr('2x^2', { x: 3 }) === 18);
ok('pi x 当 x=2 → 2π', near(evalExpr('pi x', { x: 2 }), Math.PI * 2));

console.log('\n=== 错误处理 ===');
ok('未知函数有明确报错', /未知函数/.test(throws('foo(x)', { x: 1 }) || ''), throws('foo(x)', { x: 1 }));
ok('未知变量有明确报错', /未知符号/.test(throws('x + zz', { x: 1 }) || ''), throws('x + zz', { x: 1 }));
ok('括号不闭合会报错', throws('sin(x', { x: 1 }) !== null);
ok('空表达式会报错', throws('', {}) !== null);
ok('多余字符会报错', throws('x y z )', { x: 1 }) !== null);

console.log('\n=== 2D 采样 ===');
const d2 = Kit.compute2D(['sin(x)'], { x: [-Math.PI, Math.PI], samples: 100 });
ok('样本数 = samples+1', d2.series[0].length === 101, d2.series[0].length);
ok('起点 x = -π', near(d2.series[0][0].x, -Math.PI));
ok('sin(-π) ≈ 0', near(d2.series[0][0].y, 0, 1e-12));
ok('中点 sin(0) = 0', near(d2.series[0][50].y, 0, 1e-12));
ok('峰值 sin(π/2) = 1', near(d2.series[0][75].y, 1, 1e-12));
const d2b = Kit.compute2D(['1/x'], { x: [-1, 1], samples: 100 });
ok('1/x 在 x=0 处断开(null 而不是 Infinity)', d2b.series[0][50].y === null);
ok('1/x 在 x=0.5 处 = 2', near(d2b.series[0][75].y, 2));

console.log('\n=== 3D 曲面网格 ===');
const s = Kit.buildSurface('x*y', { x: [-1, 1], y: [-1, 1], grid: 10 });
ok('网格是 (grid+1)²', s.grid.length === 11 && s.grid[0].length === 11);
ok('z 范围 [-1,1]', near(s.zmin, -1) && near(s.zmax, 1), `${s.zmin}..${s.zmax}`);
ok('高度归一化后都在 [-1,1]', s.grid.every((r) => r.every((p) => p.uz >= -1.0001 && p.uz <= 1.0001)));
const s2 = Kit.buildSurface('sin(sqrt(x^2+y^2))', { x: [-5, 5], y: [-5, 5], grid: 20 });
ok('波纹函数峰值接近 1', s2.zmax > 0.8 && s2.zmax <= 1.0001, s2.zmax);
ok('含奇点的曲面不会产生 Infinity', Kit.buildSurface('1/(x*y)', { x: [-1, 1], y: [-1, 1], grid: 8 })
  .grid.every((r) => r.every((p) => Number.isFinite(p.z) || Number.isNaN(p.z))));
ok('指定 z 范围会覆盖自动范围', Kit.buildSurface('x*y', { x: [-1, 1], y: [-1, 1], grid: 4, z: [-5, 5] }).zmin === -5);

console.log('\n=== 投影 ===');
const W = 800;
const H = 500;
const cam = { az: -0.62, el: 0.52, dist: 3.4, focal: 3.4, zoom: 1 };
const up = Kit.project({ x: 0, y: 1, z: 0 }, cam, W, H);
const down = Kit.project({ x: 0, y: -1, z: 0 }, cam, W, H);
ok('高的点画在屏幕更靠上', up.y < down.y, `up=${up.y.toFixed(1)} down=${down.y.toFixed(1)}`);
ok('x 增大时屏幕 x 也增大', Kit.project({ x: 1, y: 0, z: 0 }, cam, W, H).x
  > Kit.project({ x: -1, y: 0, z: 0 }, cam, W, H).x);
ok('所有投影点深度为正(不会跑到相机后面)', [up, down].every((p) => p.depth > 0));
const rot90 = Kit.rotatePoint({ x: 1, y: 0, z: 0 }, { az: Math.PI / 2, el: 0 });
ok('绕竖轴转 90°:x=1 → z=-1', near(rot90.x, 0, 1e-9) && near(rot90.z, -1, 1e-9),
  `x=${rot90.x.toFixed(3)} z=${rot90.z.toFixed(3)}`);
ok('绕竖轴旋转不改变高度', near(Kit.rotatePoint({ x: 1, y: 0.7, z: 0 }, { az: 1.1, el: 0 }).y, 0.7));

console.log('\n=== 拖拽手感(拖右物体就往右转,不能反) ===');
const base = { az: 0, el: 0, dist: 3.4, focal: 3.4, zoom: 1 };
// 正面的点(离观察者最近):拖右时它的屏幕 x 必须增大
const frontBefore = Kit.project({ x: 0, y: 0, z: 1 }, base, W, H);
const afterRight = Object.assign({}, base, Kit.applyOrbit(base, 40, 0));
const frontAfter = Kit.project({ x: 0, y: 0, z: 1 }, afterRight, W, H);
ok('向右拖动 → 正面的点向右移(物体跟手)', frontAfter.x > frontBefore.x,
  `${frontBefore.x.toFixed(1)} → ${frontAfter.x.toFixed(1)}`);
const afterLeft = Object.assign({}, base, Kit.applyOrbit(base, -40, 0));
ok('向左拖动 → 正面的点向左移', Kit.project({ x: 0, y: 0, z: 1 }, afterLeft, W, H).x < frontBefore.x);
// 向下拖:判据是"你手抓住的那个点"(正对观察者的中心点)跟不跟手。
// 不能用顶点当判据 —— 强透视下顶点会因为靠近相机被放大,屏幕位置反而上升,
// 但正面的点仍然是往下走的,手感是对的。
const afterDown = Object.assign({}, base, Kit.applyOrbit(base, 0, 40));
const frontDown = Kit.project({ x: 0, y: 0, z: 1 }, afterDown, W, H);
ok('向下拖动 → 正面的点向下移(物体跟手)', frontDown.y > frontBefore.y,
  `${frontBefore.y.toFixed(1)} → ${frontDown.y.toFixed(1)}`);
const afterUp = Object.assign({}, base, Kit.applyOrbit(base, 0, -40));
ok('向上拖动 → 正面的点向上移', Kit.project({ x: 0, y: 0, z: 1 }, afterUp, W, H).y < frontBefore.y);
// 几何事实:仰角增大 = 顶部朝观察者倾倒
const topBefore = Kit.project({ x: 0, y: 1, z: 0 }, base, W, H);
ok('仰角增大时顶部靠近观察者', Kit.project({ x: 0, y: 1, z: 0 }, afterDown, W, H).depth < topBefore.depth);
ok('仰角被夹在合理范围', Math.abs(Kit.applyOrbit(base, 0, 99999).el) <= 1.5);

console.log('\n=== 画家算法排序 ===');
const surf = Kit.buildSurface('sin(sqrt(x^2+y^2))', { x: [-4, 4], y: [-4, 4], grid: 16 });
const quads = Kit.buildQuads(surf, cam, W, H, {});
ok('生成了 grid² 个四边形', quads.length === 16 * 16, quads.length);
let sortedDesc = true;
for (let i = 1; i < quads.length; i += 1) if (quads[i].depth > quads[i - 1].depth) sortedDesc = false;
ok('按深度从远到近排序(远的先画)', sortedDesc);
ok('着色系数都为正', quads.every((q) => q.light > 0));
ok('颜色参数 t 落在 [0,1]', quads.every((q) => q.t >= 0 && q.t <= 1));
ok('四边形顶点数正确', quads.every((q) => q.pts.length === 4));

console.log('\n=== 刻度与配色 ===');
ok('niceStep 给出整齐的步长', [Kit.niceStep(10, 8), Kit.niceStep(1, 8), Kit.niceStep(1000, 5)]
  .every((v) => { const m = v / 10 ** Math.round(Math.log10(v)); return [1, 2, 5].some((k) => near(m, k) || near(m * 10, k)); }));
ok('t=0 是青色', Kit.colormap(0) === 'rgb(46,230,255)', Kit.colormap(0));
ok('t=1 是粉色', Kit.colormap(1) === 'rgb(255,95,208)', Kit.colormap(1));
ok('超出范围会被夹住', Kit.colormap(5) === Kit.colormap(1) && Kit.colormap(-3) === Kit.colormap(0));

console.log(`\n${pass} 通过,${fail} 失败`);
process.exit(fail ? 1 : 0);
