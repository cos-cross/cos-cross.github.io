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

console.log('\n=== 隐式方程:marching squares(2D 等值线) ===');
const circle = Kit.marchingSquares(
  Kit.compileImplicit('x^2 + y^2 = 1', ['x', 'y']),
  { x: [-2, 2], y: [-2, 2], nx: 180, ny: 180 },
);
ok('圆能提取出等值线段', circle.length > 100, `${circle.length} 段`);
const circleErr = Math.max(...circle.flat().map((p) => Math.abs(Math.hypot(p.x, p.y) - 1)));
ok('圆上的点都在半径 1 附近', circleErr < 0.02, `最大偏差 ${circleErr.toFixed(4)}`);
ok('圆上的点不会跑到范围外', circle.every((s) => s.every((p) => Math.abs(p.x) <= 2.01 && Math.abs(p.y) <= 2.01)));

const ellipse = Kit.marchingSquares(
  Kit.compileImplicit('x^2/4 + y^2 = 1', ['x', 'y']),
  { x: [-3, 3], y: [-2, 2], nx: 200, ny: 200 },
);
const ellipseErr = Math.max(...ellipse.flat().map((p) => Math.abs(p.x ** 2 / 4 + p.y ** 2 - 1)));
ok('椭圆 x²/4+y²=1 提取正确', ellipse.length > 100 && ellipseErr < 0.03, `最大偏差 ${ellipseErr.toFixed(4)}`);

const hyperbola = Kit.marchingSquares(
  Kit.compileImplicit('x^2 - y^2 = 1', ['x', 'y']),
  { x: [-3, 3], y: [-3, 3], nx: 200, ny: 200 },
);
ok('双曲线两支都能提取', hyperbola.length > 100, `${hyperbola.length} 段`);
ok('双曲线两支分别落在 |x|>1 两侧', new Set(hyperbola.flat().map((p) => p.x > 0)).size === 2);

const line = Kit.marchingSquares(
  Kit.compileImplicit('y = 2*x + 1', ['x', 'y']),
  { x: [-5, 5], y: [-5, 5], nx: 100, ny: 100 },
);
const lineErr = Math.max(...line.flat().map((p) => Math.abs(p.y - (2 * p.x + 1))));
ok('直线 y=2x+1 提取正确', line.length > 50 && lineErr < 0.05, `最大偏差 ${lineErr.toFixed(4)}`);

const saddle = Kit.marchingSquares(
  Kit.compileImplicit('x*y = 0', ['x', 'y']),
  { x: [-1, 1], y: [-1, 1], nx: 100, ny: 100 },
);
ok('鞍点 x·y=0(两条坐标轴)也能正确提取', saddle.length > 100, `${saddle.length} 段`);

console.log('\n=== 隐式方程:surface nets(3D 等值面) ===');
const sphere = Kit.surfaceNets(
  Kit.compileImplicit('x^2 + y^2 + z^2 = 1', ['x', 'y', 'z']),
  { x: [-2, 2], y: [-2, 2], z: [-2, 2], grid: 32 },
);
ok('球面生成了顶点', sphere.verts.length > 500, `${sphere.verts.length} 个顶点`);
ok('球面生成了四边形', sphere.quads.length > 500, `${sphere.quads.length} 个面`);
const sphereErr = Math.max(...sphere.verts.map((v) => Math.abs(Math.hypot(v.x * 2, v.y * 2, v.z * 2) - 1)));
ok('球面顶点都在半径 1 附近(归一化坐标 ×2 还原)', sphereErr < 0.08, `最大偏差 ${sphereErr.toFixed(4)}`);
ok('所有四边形索引都合法', sphere.quads.every((q) => q.every((i) => i >= 0 && i < sphere.verts.length)));
ok('顶点都落在归一化立方体里', sphere.verts.every((v) => Math.abs(v.x) <= 1.001 && Math.abs(v.y) <= 1.001 && Math.abs(v.z) <= 1.001));
ok('法线是单位向量', sphere.verts.every((v) => Math.abs(Math.hypot(v.nx, v.ny, v.nz) - 1) < 1e-6));
ok('颜色参数 t 在 [0,1]', sphere.verts.every((v) => v.t >= 0 && v.t <= 1));

const meshCam = { az: -0.62, el: 0.52, dist: 3.4, focal: 3.4, zoom: 1 };
const meshQuads = Kit.projectMeshQuads(sphere, meshCam, W, H, {});
ok('网格能投影出屏幕四边形', meshQuads.length > 400, `${meshQuads.length} 个`);
ok('投影后的顶点都是有限数', meshQuads.every((q) => q.pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))));
ok('网格投影也按深度从远到近排序', meshQuads.every((q, i) => i === 0 || meshQuads[i - 1].depth >= q.depth));
ok('网格着色的光照系数都为正', meshQuads.every((q) => q.light > 0));

const torus = Kit.surfaceNets(
  Kit.compileImplicit('(x^2 + y^2 + z^2 + 0.6)^2 = 4*(x^2 + y^2)', ['x', 'y', 'z']),
  { x: [-2, 2], y: [-2, 2], z: [-2, 2], grid: 32 },
);
ok('环面这类复杂曲面也能提取', torus.verts.length > 500 && torus.quads.length > 500,
  `${torus.verts.length} 顶点 / ${torus.quads.length} 面`);

console.log('\n=== 等式解析 ===');
ok('parseEquation 认出显式', Kit.parseEquation('sin(x)').implicit === false);
ok('parseEquation 认出隐式', Kit.parseEquation('x^2 + y^2 = 1').implicit === true);
ok('双等号会报错', (() => { try { Kit.parseEquation('a = b = c'); return false; } catch { return true; } })());
ok('隐式式子里未知符号照样报错', (() => {
  try { Kit.compileImplicit('x^2 + q^2 = 1', ['x', 'y']); return false; } catch (e) { return /未知符号/.test(e.message); }
})());

console.log('\n=== 刻度与配色 ===');
ok('niceStep 给出整齐的步长', [Kit.niceStep(10, 8), Kit.niceStep(1, 8), Kit.niceStep(1000, 5)]
  .every((v) => { const m = v / 10 ** Math.round(Math.log10(v)); return [1, 2, 5].some((k) => near(m, k) || near(m * 10, k)); }));
ok('t=0 是青色', Kit.colormap(0) === 'rgb(46,230,255)', Kit.colormap(0));
ok('t=1 是粉色', Kit.colormap(1) === 'rgb(255,95,208)', Kit.colormap(1));
ok('超出范围会被夹住', Kit.colormap(5) === Kit.colormap(1) && Kit.colormap(-3) === Kit.colormap(0));

console.log(`\n${pass} 通过,${fail} 失败`);
process.exit(fail ? 1 : 0);
