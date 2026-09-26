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

// 非正方体包围盒:三个轴必须共用同一个 half。
// 各轴各归一化的话,球会被拉成椭球 —— 形状就不是原来那个了。
const boxed = Kit.surfaceNets(
  Kit.compileImplicit('x^2 + y^2 + z^2 = 1', ['x', 'y', 'z']),
  { x: [-8, 8], y: [-4, 4], z: [-4, 4], grid: 32 },
);
const span = (key, s) => Math.max(...s.verts.map((v) => Math.abs(v[key])));
const sx = span('x', boxed), sy = span('y', boxed), sz = span('z', boxed);
ok('非正方体包围盒里球还是球(三个方向的归一化半径相同)',
  Math.abs(sx - sy) < 0.02 && Math.abs(sy - sz) < 0.02,
  `x=${sx.toFixed(3)} y=${sy.toFixed(3)} z=${sz.toFixed(3)}`);
ok('包围盒比例记在 ext 里(给坐标轴盒子用)',
  Math.abs(boxed.ext[0] - 1) < 1e-9 && Math.abs(boxed.ext[1] - 0.5) < 1e-9 && Math.abs(boxed.ext[2] - 0.5) < 1e-9,
  JSON.stringify(boxed.ext));

console.log('\n=== 等式解析 ===');
ok('parseEquation 认出显式', Kit.parseEquation('sin(x)').implicit === false);
ok('parseEquation 认出隐式', Kit.parseEquation('x^2 + y^2 = 1').implicit === true);
ok('双等号会报错', (() => { try { Kit.parseEquation('a = b = c'); return false; } catch { return true; } })());
ok('隐式式子里未知符号照样报错', (() => {
  try { Kit.compileImplicit('x^2 + q^2 = 1', ['x', 'y']); return false; } catch (e) { return /未知符号/.test(e.message); }
})());

console.log('\n=== 约束条件 ===');
function testC(src, vars, at) {
  const t = Kit.compileConstraint(src, vars);
  const scope = Kit.makeScope(vars);
  Object.assign(scope, at);
  return t(scope);
}
ok('x < y 当 (1,2) → 真', testC('x < y', ['x', 'y'], { x: 1, y: 2 }) === true);
ok('x < y 当 (2,1) → 假', testC('x < y', ['x', 'y'], { x: 2, y: 1 }) === false);
ok('x < y 当 (1,1) → 假(严格)', testC('x < y', ['x', 'y'], { x: 1, y: 1 }) === false);
ok('x <= y 当 (1,1) → 真(含等号)', testC('x <= y', ['x', 'y'], { x: 1, y: 1 }) === true);
ok('x >= y 当 (1,1) → 真', testC('x >= y', ['x', 'y'], { x: 1, y: 1 }) === true);
ok('x > y 当 (1,2) → 假', testC('x > y', ['x', 'y'], { x: 1, y: 2 }) === false);
ok('x + y < z 三个变量', testC('x + y < z', ['x', 'y', 'z'], { x: 1, y: 1, z: 3 }) === true);
ok('x + y < z 不满足时', testC('x + y < z', ['x', 'y', 'z'], { x: 2, y: 2, z: 3 }) === false);
ok('z > 0 当 z=-1 → 假', testC('z > 0', ['x', 'y', 'z'], { x: 0, y: 0, z: -1 }) === false);
ok('<= 不会被误认成 <', testC('y <= 0', ['x', 'y'], { x: 0, y: 0 }) === true);
ok('约束里未知符号会报错', (() => {
  try { Kit.compileConstraint('x < q', ['x', 'y']); return false; } catch (e) { return /未知符号/.test(e.message); }
})());
ok('parseConstraint 认不出比较符号时返回 null', Kit.parseConstraint('x + y') === null);
ok('比较符号两边不能为空', (() => {
  try { Kit.parseConstraint('x <'); return false; } catch { return true; }
})());

console.log('\n=== 约束如何裁剪图形 ===');
// 2D 显式曲线:只有 x < 0 的那半段
const masked2d = Kit.compute2D(['sin(x)'], {
  x: [-Math.PI, Math.PI], samples: 100, mask: Kit.makeMask([Kit.compileConstraint('x < 0', ['x', 'y'])]),
});
const kept = masked2d.series[0].filter((p) => p.y !== null).length;
ok('半边约束把曲线裁掉一半', kept > 40 && kept < 60, `保留 ${kept}/101 点`);
ok('保留的点都满足 x < 0', masked2d.series[0].every((p) => p.y === null || p.x < 0));

// 隐式曲线:单位圆上 x < y 的弧
const arc = Kit.marchingSquares(
  Kit.compileImplicit('x^2 + y^2 = 1', ['x', 'y']),
  { x: [-2, 2], y: [-2, 2], nx: 170, ny: 170, mask: Kit.makeMask([Kit.compileConstraint('x < y', ['x', 'y'])]) },
);
ok('圆弧被裁出来了', arc.length > 50, `${arc.length} 段`);
ok('弧上的点都满足 x < y', arc.every((s) => s.every((p) => p.x < p.y + 1e-6)));
// x<y 在单位圆上对应 θ ∈ (π/4, 5π/4) —— 注意它确实跨过 π,所以不能用"最大角"当判据
const arcAngles = arc.flat().map((p) => Math.atan2(p.y, p.x));
ok('弧只覆盖 θ∈(π/4, 5π/4)', arcAngles.every((a) => a > Math.PI / 4 - 0.02 || a < -3 * Math.PI / 4 + 0.02),
  `${arcAngles.filter((a) => a > Math.PI / 4 - 0.02 || a < -3 * Math.PI / 4 + 0.02).length}/${arcAngles.length}`);

// 3D 等值面:z > 0 的上半球
const hemi = Kit.surfaceNets(
  Kit.compileImplicit('x^2 + y^2 + z^2 = 1', ['x', 'y', 'z']),
  { x: [-2, 2], y: [-2, 2], z: [-2, 2], grid: 30, mask: Kit.makeMask([Kit.compileConstraint('z > 0', ['x', 'y', 'z'])]) },
);
const full = Kit.surfaceNets(
  Kit.compileImplicit('x^2 + y^2 + z^2 = 1', ['x', 'y', 'z']),
  { x: [-2, 2], y: [-2, 2], z: [-2, 2], grid: 30 },
);
ok('上半球顶点数约为整球的一半', hemi.verts.length > full.verts.length * 0.4
  && hemi.verts.length < full.verts.length * 0.6,
  `${hemi.verts.length} vs 整球 ${full.verts.length}`);
// 归一化坐标里 y 是数学的 z(高度),所以上半球的 y 应该 >= 0
ok('上半球的顶点高度都 >= 0', hemi.verts.every((v) => v.y >= -0.02));

// 3D 显式曲面:被 x*x + y*y < 1 限制在一个圆盘里
const disk = Kit.buildSurface('sin(x)*cos(y)', {
  x: [-3, 3], y: [-3, 3], grid: 24, mask: Kit.makeMask([Kit.compileConstraint('x^2 + y^2 < 1', ['x', 'y', 'z'])]),
});
const inside = [];
for (let i = 0; i <= 24; i += 1) for (let j = 0; j <= 24; j += 1) {
  const p = disk.grid[i][j];
  if (Number.isFinite(p.z)) inside.push(p);
}
ok('曲面被裁剪成圆盘', inside.length > 20 && inside.length < 24 * 24, `保留 ${inside.length} 个网格点`);
ok('保留下来的网格点都在圆盘内', inside.every((p) => {
  const x = (p.ux) * 3, y = (p.uy) * 3; // ux/uy 是归一化到 [-1,1] 的
  return x * x + y * y < 1.4;
}));

console.log('\n=== 区域与单独的点 ===');
const region = Kit.regionCells(
  Kit.makeMask([Kit.compileConstraint('x^2 + y^2 < 1', ['x', 'y'])]),
  { x: [-2, 2], y: [-2, 2], nx: 120, ny: 120 },
);
ok('单位圆盘区域格子数接近 πr²/(面积/格)', region.length > 2700 && region.length < 2900, `${region.length} 格`);
ok('区域内格子中心都在圆内', region.every((c) => {
  const cx = c[0] + c[2] / 2;
  const cy = c[1] + c[3] / 2;
  return cx * cx + cy * cy < 1;
}));

const pts = Kit.parsePoints('point(1, 2) A point(pi/2, 1) B point(0,0,3) C', []);
ok('解析出 3 个点', pts.length === 3, `${pts.length} 个`);
ok('坐标求值正确(含 pi/2)', Math.abs(pts[1].x - Math.PI / 2) < 1e-12);
ok('标签解析正确', pts[0].label === 'A' && pts[1].label === 'B' && pts[2].label === 'C');
ok('三维点带 z 坐标', pts[2].z === 3);
ok('不带标签也可以', Kit.parsePoints('point(0, 0)', [])[0].label === '');
ok('点是常量表达式,不能用 x', (() => {
  try { Kit.parsePoints('point(x, 1)', []); return false; } catch (e) { return /未知符号/.test(e.message); }
})());
ok('点少于两个坐标会报错', (() => {
  try { Kit.parsePoints('point(1)', []); return false; } catch { return true; }
})());

// 坐标里带括号是完全正常的写法(sqrt(2)、sin(pi/6)…),
// 早期版本用 [^,()]+ 抓坐标,这类点会被整条判成"写错了"然后悄悄丢掉。
const p3d = Kit.parsePoints([
  'point(0, 0, sqrt(2)) A',
  'point(1, 0, 0) B',
  'point(-1/2, sqrt(3)/2, 0) C',
  'point(-1/2, -sqrt(3)/2, 0) D',
].join('\n'), []);
ok('坐标里带函数调用也能解析', p3d.length === 4, `${p3d.length} 个`);
ok('sqrt(2) 求值正确', p3d[0] && Math.abs(p3d[0].z - Math.SQRT2) < 1e-12);
ok('负分数 + sqrt 混合求值正确', p3d[2] && p3d[2].x === -0.5 && Math.abs(p3d[2].y - Math.sqrt(3) / 2) < 1e-12);
ok('四个标签都在', p3d.map((p) => p.label).join('') === 'ABCD');
ok('括号里的逗号不算坐标分隔符(min)',
  Math.abs(Kit.parsePoints('point(min(1, 2), max(3, 4)) M', [])[0].y - 4) < 1e-12);
ok('四个以上坐标会报错', (() => {
  try { Kit.parsePoints('point(1, 2, 3, 4)', []); return false; } catch { return true; }
})());

console.log('\n=== 线段与多边形的顶点引用 ===');
{
  const call = Kit.parseCallArgs('segment(A, B)', 'segment');
  ok('拆出两个参数', call && call.args.length === 2, JSON.stringify(call && call.args));
  ok('segment 之外的词不会被误认', Kit.parseCallArgs('polygon(A, B, C)', 'segment') === null);
  ok('字母数字混排的关键词不会误命中', Kit.parseCallArgs('mysegment(A, B)', 'segment') === null);
  ok('多边形的顶级逗号切分', Kit.parseCallArgs('polygon(A, B, C, D)', 'polygon').args.length === 4);

  const byLabel = Kit.parseCoordRef('A1');
  ok('裸标识符当成标签引用', byLabel.label === 'A1' && !byLabel.coords);
  const lit = Kit.parseCoordRef('(1, 2, 3)');
  ok('括号里的坐标在构建期就算好',
    lit.coords.x === 1 && lit.coords.y === 2 && Math.abs(lit.coords.z - 3) < 1e-12);
  const lit2 = Kit.parseCoordRef('(sqrt(3)/2, -1/2)');
  ok('坐标里能用函数和负号',
    Math.abs(lit2.coords.x - Math.sqrt(3) / 2) < 1e-12 && lit2.coords.y === -0.5);
  ok('两坐标时 z 默认 0', lit2.coords.z === 0);
  ok('坐标里的逗号不影响解析', Kit.parseCoordRef('(min(1,2), max(3,4))').coords.y === 4);
  ok('既不是标签也不是坐标时报错', (() => {
    try { Kit.parseCoordRef('1, 2'); return false; } catch (e) { return /不认识的顶点/.test(e.message); }
  })());
  ok('坐标数量不对时报错', (() => {
    try { Kit.parseCoordRef('(1)'); return false; } catch { return true; }
  })());
  ok('括号没闭合时报错', (() => {
    try { Kit.parseCallArgs('segment(A, B', 'segment'); return false; } catch { return true; }
  })());
}

console.log('\n=== where:按曲线定制约束 ===');
ok('没有 where 时原样返回', Kit.splitWhere('sin(x)').conds.length === 0);
ok('拆出单个条件', (() => {
  const r = Kit.splitWhere('y = sin(x) where x > 0');
  return r.base === 'y = sin(x)' && r.conds.length === 1 && r.conds[0] === 'x > 0';
})());
ok('and 连接多个条件', (() => {
  const r = Kit.splitWhere('sin(x) where x > 0 and y < 1');
  return r.conds.length === 2 && r.conds[1] === 'y < 1';
})());
ok('&& 也能连接', Kit.splitWhere('sin(x) where x > 0 && x < 3').conds.length === 2);
ok('多个 where 连写', Kit.splitWhere('sin(x) where x > 0 where y > 0').conds.length === 2);
ok('where 前后的空行会被去掉', Kit.splitWhere('   sin(x)   where   x > 0   ').base === 'sin(x)');
ok('wherever 这类标识符不会被误切', Kit.splitWhere('wherever(x)').conds.length === 0);
ok('base 里保留完整的等式', Kit.splitWhere('x^2 + y^2 = 1 where y > 0').base === 'x^2 + y^2 = 1');

// 叠加语义:全局约束 + 各自的 where 一起生效
const g = Kit.compileConstraint('x >= -2', ['x', 'y']);
const own = Kit.compileConstraint('y > 0', ['x', 'y']);
const combined = Kit.makeMask([g, own]);
const sc = Kit.makeScope(['x', 'y']);
function at(x, y) { sc.x = x; sc.y = y; return combined(sc); }
ok('同时满足全局与自身时通过', at(0, 1) === true);
ok('违反全局约束时被排除', at(-3, 1) === false);
ok('违反自身 where 时被排除', at(0, -1) === false);

// 两条曲线各自约束,互不影响
const a = Kit.makeMask([Kit.compileConstraint('x >= 0', ['x', 'y'])]);
const b = Kit.makeMask([Kit.compileConstraint('x < 0', ['x', 'y'])]);
const dA = Kit.compute2D(['sin(x)'], { x: [-5, 5], samples: 200, mask: a }).series[0];
const dB = Kit.compute2D(['cos(x)'], { x: [-5, 5], samples: 200, mask: b }).series[0];
ok('第一条只保留 x>=0 的部分', dA.every((p) => p.y === null || p.x >= 0));
ok('第二条只保留 x<0 的部分', dB.every((p) => p.y === null || p.x < 0));
ok('两条都有一半左右被保留',
  dA.filter((p) => p.y !== null).length > 90 && dA.filter((p) => p.y !== null).length < 110
  && dB.filter((p) => p.y !== null).length > 90 && dB.filter((p) => p.y !== null).length < 110);

console.log('\n=== 半透明四边形(压接缝) ===');
{
  const quad = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const grown = Kit.inflateQuad(quad, 1);
  const centerOf = (qs) => qs.reduce((s, p) => s + p.x, 0) / qs.length;
  ok('顶点数不变', grown.length === 4);
  ok('重心不动', Math.abs(centerOf(grown) - centerOf(quad)) < 1e-9);
  ok('每个顶点都被推离重心', grown.every((p, i) => Math.hypot(p.x - 5, p.y - 5) > Math.hypot(quad[i].x - 5, quad[i].y - 5)));
  ok('推开的距离正好是给的像素数',
    Math.abs(Math.hypot(grown[0].x - 5, grown[0].y - 5) - (Math.hypot(-5, -5) + 1)) < 1e-9);
  ok('退化四边形(所有点重合)不会算出 NaN',
    Kit.inflateQuad([{ x: 3, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 3 }], 1)
      .every((p) => p.x === 3 && p.y === 3));
}

console.log('\n=== 网格密度上下限(渲染器与插件共用一份) ===');
{
  const L = Kit.GRID_LIMITS;
  ok('隐式/显式各有一套上下限', !!L.implicit && !!L.explicit);
  ok('没写 grid 时给默认值',
    Kit.clampGrid(undefined, 'implicit') === L.implicit.def
    && Kit.clampGrid(undefined, 'explicit') === L.explicit.def);
  ok('超上限会被夹到上限', Kit.clampGrid(9999, 'implicit') === L.implicit.max);
  ok('低于下限会被抬到下限', Kit.clampGrid(1, 'implicit') === L.implicit.min);
  ok('小数会取整', Kit.clampGrid(48.6, 'explicit') === 49);
  ok('区间内的值原样保留', Kit.clampGrid(64, 'implicit') === 64);

  // 这条是回归测试:以前渲染器偷偷夹到 64,而插件说可以到 80,
  // 于是 grid=80 画出来和 grid=64 一模一样,作者完全看不出来。
  const fn = Kit.compileImplicit('x^2 + y^2 + z^2 = 1', ['x', 'y', 'z']);
  const box = { x: [-2, 2], y: [-2, 2], z: [-2, 2] };
  const atMax = Kit.surfaceNets(fn, { ...box, grid: L.implicit.max });
  const over = Kit.surfaceNets(fn, { ...box, grid: L.implicit.max + 50 });
  ok('超过上限时结果稳定等于上限的那一档', over.quads.length === atMax.quads.length,
    `${over.quads.length} vs ${atMax.quads.length}`);
  const finer = Kit.surfaceNets(fn, { ...box, grid: 64 });
  ok('上限确实高于 64(grid=64 还不是天花板)', atMax.quads.length > finer.quads.length,
    `${atMax.quads.length} > ${finer.quads.length}`);

  // 网格越细,球面上四边形越多(单调),而且顶点半径仍然贴近 1
  const counts = [16, 32, 64].map((g) => Kit.surfaceNets(fn, { ...box, grid: g }).quads.length);
  ok('网格越细面越多', counts[0] < counts[1] && counts[1] < counts[2], counts.join(' < '));
  const fine = Kit.surfaceNets(fn, { ...box, grid: 96 });
  const err = Math.max(...fine.verts.map((v) => Math.abs(Math.hypot(v.x * 2, v.y * 2, v.z * 2) - 1)));
  ok('再细形状也不会跑偏(半径仍≈1)', err < 0.03, `最大偏差 ${err.toFixed(4)}`);

  // 范围收紧 = 免费的精细度:同样的 grid,盒子小一半,面数大约翻两番
  const wide = Kit.surfaceNets(fn, { x: [-4, 4], y: [-4, 4], z: [-4, 4], grid: 32 }).quads.length;
  const tight = Kit.surfaceNets(fn, { x: [-1.5, 1.5], y: [-1.5, 1.5], z: [-1.5, 1.5], grid: 32 }).quads.length;
  ok('同样的 grid,盒子收紧后明显更细', tight > wide * 3, `${wide} → ${tight}`);

  // 显式面的上限同样是共享的
  const big = Kit.buildSurface('sin(x)*cos(y)', { x: [-5, 5], y: [-5, 5], grid: 9999 });
  ok('显式曲面的上限也生效', big.n === L.explicit.max, String(big.n));
  const def = Kit.buildSurface('sin(x)*cos(y)', { x: [-5, 5], y: [-5, 5] });
  ok('显式曲面默认网格是 46', def.n === 46, String(def.n));
}

console.log('\n=== sphere(球心, 半径) ===');
{
  const eq = Kit.sphereEquation({ x: 1, y: 0, z: 0 }, 0.75);
  ok('展开成隐式方程', eq === '(x-1)^2+y^2+z^2=0.5625', eq);
  ok('展开后的方程能编译', typeof Kit.compileImplicit(eq, ['x', 'y', 'z']) === 'function');

  const neg = Kit.sphereEquation({ x: -1, y: -0.5, z: 2 }, 2);
  ok('负球心写成 + 号', neg === '(x+1)^2+(y+0.5)^2+(z-2)^2=4', neg);

  // 展开出来的球面必须和手写方程算出一模一样的东西
  const box = { x: [-2, 2], y: [-2, 2], z: [-2, 2], grid: 32 };
  const auto = Kit.surfaceNets(Kit.compileImplicit(Kit.sphereEquation({ x: 1, y: 0, z: 0 }, 0.75), ['x', 'y', 'z']), box);
  const hand = Kit.surfaceNets(Kit.compileImplicit('(x-1)^2+y^2+z^2=0.5625', ['x', 'y', 'z']), box);
  ok('和手写方程结果完全一致',
    auto.quads.length === hand.quads.length && auto.verts.length === hand.verts.length,
    `${auto.quads.length} vs ${hand.quads.length}`);
  ok('球面上的点到球心距离都≈半径', (() => {
    // 渲染空间是归一化过的(x←数学 x,y←数学 z,z←数学 y,half=2),
    // 所以还原回数学坐标要乘 2,再按 x/z/y 的顺序取。
    const bad = auto.verts.filter((v) => {
      const d = Math.hypot(2 * v.x - 1, 2 * v.z, 2 * v.y);
      return Math.abs(d - 0.75) > 0.06;
    });
    return bad.length / auto.verts.length < 0.05;
  })());

  // 浮点噪声要在打印前抹掉:sqrt(2)^2 在双精度里是 2.0000000000000004
  ok('半径 sqrt(2) 时平方显示成整数 2',
    Kit.sphereEquation({ x: 0, y: 0, z: 0 }, Math.SQRT2) === 'x^2+y^2+z^2=2',
    Kit.sphereEquation({ x: 0, y: 0, z: 0 }, Math.SQRT2));
  ok('fmtNum 抹掉浮点噪声', Kit.fmtNum(2.0000000000000004) === '2' && Kit.fmtNum(0.5625) === '0.5625');
  ok('fmtNum 不动正常小数', Kit.fmtNum(Math.PI) === String(Number(Math.PI.toPrecision(12))));
  ok('半径必须大于 0', (() => {
    try { Kit.sphereEquation({ x: 0, y: 0, z: 0 }, 0); return false; } catch (e) { return /半径要大于 0/.test(e.message); }
  })());
  ok('负半径也报错', (() => {
    try { Kit.sphereEquation({ x: 0, y: 0, z: 0 }, -1); return false; } catch { return true; }
  })());

  // 约束照常生效:上半球
  const half = Kit.surfaceNets(
    Kit.compileImplicit(Kit.sphereEquation({ x: 0, y: 0, z: 0 }, 1), ['x', 'y', 'z']),
    { ...box, mask: Kit.makeMask([Kit.compileConstraint('z > 0', ['x', 'y', 'z'])]) },
  );
  const whole = Kit.surfaceNets(Kit.compileImplicit('x^2+y^2+z^2=1', ['x', 'y', 'z']), box);
  ok('sphere 也能被 where 裁成半球',
    half.verts.length > whole.verts.length * 0.3 && half.verts.length < whole.verts.length * 0.7,
    `${half.verts.length} / ${whole.verts.length}`);
  ok('半球上的点 z 都 > 0', half.verts.every((v) => v.y > -1e-9));

  // evalConst 的错误信息要指明是什么算不出
  ok('半径写成变量时给出明确报错', (() => {
    try { Kit.evalConst('r', '半径'); return false; } catch (e) { return /^半径不对:/.test(e.message); }
  })());
  ok('球面里的半球 z 值判据用的是数学坐标', half.verts.every((v) => v.y > -1e-9));
}

console.log('\n=== 自动适配镜头(内容不会被画布切掉) ===');
{
  const CAM = { az: -0.62, el: 0.52, dist: 3.4, focal: 3.4 };
  const W = 800;
  const H = Math.round(W * 0.78);

  // 一个球面的探针点(球在旋转下投影尺寸不变,正好用来验"最坏角度"那套逻辑)
  const sphereProbes = [];
  for (let i = 0; i <= 24; i++) {
    for (let j = 0; j <= 12; j++) {
      const th = (i / 24) * Math.PI * 2;
      const ph = (j / 12) * Math.PI;
      sphereProbes.push({
        x: Math.sin(ph) * Math.cos(th), y: Math.cos(ph), z: Math.sin(ph) * Math.sin(th),
      });
    }
  }

  /** 在任意方位角/仰角下都装得下才算通过 */
  const alwaysInside = (probes, zoom, pad) => {
    for (const az of [0, 30, 60, 120, 200, 300]) {
      for (const el of [-0.6, 0, 0.52, 1.0]) {
        const cam = Object.assign({}, CAM, { az: CAM.az + az * Math.PI / 180, el, zoom });
        for (const p of probes) {
          const q = Kit.project(p, cam, W, H);
          if (Math.abs(q.x - W / 2) > pad * W / 2 + 1e-6) return false;
          if (Math.abs(q.y - H / 2) > pad * H / 2 + 1e-6) return false;
        }
      }
    }
    return true;
  };

  const unit = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) unit.push({ x, y, z });

  const z1 = Kit.fitZoom(unit, CAM, W, H);
  ok('铺满画面的内容会被缩小到装得下', z1 < 1, String(z1));
  // 这就是要修的 bug:默认 zoom=1 是按"小球在图中央"调的,铺满画面的图会被切掉
  ok('默认 zoom=1 时确实装不下(这就是以前被切掉的原因)', !alwaysInside(unit, 1, 1));
  ok('适配后转任意角度都不会被切掉', alwaysInside(sphereProbes, Kit.fitZoom(sphereProbes, CAM, W, H), 0.95));
  ok('而且不会缩得太保守(至少占满一半画面)', (() => {
    const z = Kit.fitZoom(sphereProbes, CAM, W, H);
    const cam = Object.assign({}, CAM, { zoom: z });
    const xs = sphereProbes.map((p) => Kit.project(p, cam, W, H).x);
    return (Math.max(...xs) - Math.min(...xs)) > W * 0.5;
  })());

  const small = sphereProbes.map((p) => ({ x: p.x * 0.2, y: p.y * 0.2, z: p.z * 0.2 }));
  const z2 = Kit.fitZoom(small, CAM, W, H);
  ok('内容小的时候会自动放大', z2 > 1, String(z2));
  ok('放大后同样转任何角度都装得下', alwaysInside(small, z2, 0.95));
  ok('放大有上限(不会把坐标轴整个甩出画面)',
    Kit.fitZoom([{ x: 0.001, y: 0, z: 0 }, { x: -0.001, y: 0, z: 0 }], CAM, W, H) <= 3);
  ok('探针为空时安全返回 1', Kit.fitZoom([], CAM, W, H) === 1 && Kit.fitZoom(null, CAM, W, H) === 1);

  // contentProbes:从各类图元里把点汇总出来,并会抽稀
  const fakeState = {
    surfaces: [{ kind: 'mesh', data: { verts: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0.5, z: 0 }] } }],
    points: [{ nx: 0, ny: 0, nz: 0.9 }],
    segments: [{ a: { x: -0.5, y: -0.5, z: 0 }, b: { x: 0.5, y: 0.5, z: 0 } }],
    polygons: [{ pts: [{ x: 0, y: 0, z: -1 }, { x: 0.2, y: 0, z: 0 }, { x: 0, y: 0.2, z: 0 }] }],
  };
  const probes = Kit.contentProbes(fakeState);
  ok('contentProbes 汇总了所有图元', probes.length === 2 + 1 + 2 + 3, `${probes.length} 个`);
  ok('contentProbes 保留了极值', probes.some((p) => p.z === -1) && probes.some((p) => p.z === 0.9));
  ok('contentProbes 会丢掉非有限值',
    Kit.contentProbes({ surfaces: [{ kind: 'mesh', data: { verts: [{ x: NaN, y: 0, z: 0 }] } }] }).length === 0);
  ok('点数超上限时会抽稀', (() => {
    const many = { surfaces: [{ kind: 'mesh', data: { verts: Array.from({ length: 5000 }, (_, i) => ({ x: i / 5000, y: 0, z: 0 })) } }] };
    const got = Kit.contentProbes(many, 1000);
    return got.length === 1000 && got[got.length - 1].x > 0.99; // 抽稀后仍然覆盖到末尾
  })());
}

console.log('\n=== 采样盒子装不装得下(球只剩碎片的那个 bug) ===');
{
  const sphere = (x, y, z) => Kit.compileImplicit(
    Kit.sphereEquation({ x, y, z }, 1), ['x', 'y', 'z'],
  );

  // faceCrossed:半径为 1 的球,f = x²+y²+z²-1
  const fn0 = sphere(0, 0, 0);
  ok('面切过球 → 判为被切', Kit.faceCrossed(fn0, 0, 0.5, [-2, 2], [-2, 2], [-2, 2], 12) === true);
  ok('面在球外面 → 判为没切', Kit.faceCrossed(fn0, 0, 1.5, [-2, 2], [-2, 2], [-2, 2], 12) === false);
  ok('三个轴都认', Kit.faceCrossed(fn0, 1, -0.5, [-2, 2], [-2, 2], [-2, 2], 12) === true
    && Kit.faceCrossed(fn0, 2, 0.9, [-2, 2], [-2, 2], [-2, 2], 12) === true);

  // 盒子够大 → 原样返回
  const fine = Kit.fitImplicitBox([fn0], { x: [-2, 2], y: [-2, 2], z: [-2, 2] });
  ok('装得下时不动盒子', fine.expanded === false
    && fine.x[0] === -2 && fine.x[1] === 2 && fine.z[1] === 2);

  // 球心挪到 (2,0,0),盒子还是 [-1.05,1.05] —— 这正是用户踩的坑
  const off = Kit.fitImplicitBox([sphere(2, 0, 0)], { x: [-1.05, 1.05], y: [-1.05, 1.05], z: [-1.05, 1.05] });
  ok('球伸出盒子时会被撑开', off.expanded === true);
  ok('x 撑到装得下整个球(需要 ±3)', off.x[0] <= -3 && off.x[1] >= 3, JSON.stringify(off.x));
  ok('y/z 本来就够,不会被无谓地撑大', off.y[0] === -1.05 && off.z[1] === 1.05);
  ok('撑完就真的不切了:再检测一次应该干净',
    Kit.fitImplicitBox([sphere(2, 0, 0)], { x: off.x, y: off.y, z: off.z }).expanded === false);

  // 用户的真实场景:14 / 17 个球塞在 ±1.05 的盒子里
  for (const [name, list] of [
    ['面心立方 14 球', (() => {
      const s = Math.SQRT2; const c = [];
      for (const x of [-s, s]) for (const y of [-s, s]) for (const z of [-s, s]) c.push([x, y, z]);
      c.push([0, 0, s], [0, 0, -s], [0, s, 0], [0, -s, 0], [s, 0, 0], [-s, 0, 0]);
      return c;
    })()],
    ['六方最密 17 球', (() => {
      const h = Math.sqrt(8 / 3);
      const hex = [[2, 0], [1, Math.sqrt(3)], [-1, Math.sqrt(3)], [-2, 0], [-1, -Math.sqrt(3)], [1, -Math.sqrt(3)], [0, 0]];
      const mid = [[1, Math.sqrt(3) / 3], [-1, Math.sqrt(3) / 3], [0, -2 * Math.sqrt(3) / 3]];
      const c = [];
      hex.forEach(([x, y]) => c.push([x, y, -h]));
      mid.forEach(([x, y]) => c.push([x, y, 0]));
      hex.forEach(([x, y]) => c.push([x, y, h]));
      return c;
    })()],
  ]) {
    const fns = list.map(([x, y, z]) => sphere(x, y, z));
    const fit = Kit.fitImplicitBox(fns, { x: [-1.05, 1.05], y: [-1.05, 1.05], z: [-1.05, 1.05] });
    ok(`${name}:被撑开了`, fit.expanded === true);
    ok(`${name}:撑完后再检测没有残留的切面`,
      Kit.fitImplicitBox(fns, { x: fit.x, y: fit.y, z: fit.z }).expanded === false);
    // 装得下 = 每个球都完整:网格面积应接近理论 4πr²
    const half = Math.max(fit.x[1] - fit.x[0], fit.y[1] - fit.y[0], fit.z[1] - fit.z[0]) / 2;
    const ratios = fns.map((fn) => {
      const mesh = Kit.surfaceNets(fn, { x: fit.x, y: fit.y, z: fit.z, grid: 24 });
      let s = 0;
      for (const q of mesh.quads) {
        const v = q.map((i) => mesh.verts[i]);
        for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
          const A = v[a]; const B = v[b]; const C = v[c];
          const ux = B.x - A.x; const uy = B.y - A.y; const uz = B.z - A.z;
          const vx = C.x - A.x; const vy = C.y - A.y; const vz = C.z - A.z;
          s += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        }
      }
      return s * half * half / (4 * Math.PI);
    });
    ok(`${name}:每个球都完整(面积≥理论的 93%)`, Math.min(...ratios) >= 0.93,
      `最小 ${Math.min(...ratios).toFixed(3)}`);
  }

  // 病态表达式不能把构建卡死
  const wild = Kit.compileImplicit('exp(x)+exp(y)+exp(z)=0', ['x', 'y', 'z']);
  const t0 = Date.now();
  Kit.fitImplicitBox([wild], { x: [-1, 1], y: [-1, 1], z: [-1, 1] });
  ok('病态表达式不会无限撑下去(有轮数上限)', Date.now() - t0 < 3000, `${Date.now() - t0}ms`);
}

console.log('\n=== links(d):把相切的球心连起来 ===');
{
  const S = Math.SQRT2;
  // 面心立方晶胞的 14 个球心
  const fcc = [];
  for (const x of [-S, S]) for (const y of [-S, S]) for (const z of [-S, S]) fcc.push({ x, y, z });
  fcc.push({ x: 0, y: 0, z: S }, { x: 0, y: 0, z: -S }, { x: 0, y: S, z: 0 },
    { x: 0, y: -S, z: 0 }, { x: S, y: 0, z: 0 }, { x: -S, y: 0, z: 0 });

  const pairs2 = Kit.linkPairs(fcc, 2);
  // 角球↔面心球 8×3=24,面心球之间(正八面体的 12 条棱)= 12
  ok('面心立方:相距 2 的球心对有 36 对', pairs2.length === 36, `${pairs2.length} 对`);
  ok('配出来的对距离都真的是 2', pairs2.every(([i, j]) => {
    const a = fcc[i]; const b = fcc[j];
    return Math.abs(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - 2) < 1e-9;
  }));
  ok('棱长 2√2(角球之间)配出来也都真的是那个距离',
    Kit.linkPairs(fcc, 2 * Math.SQRT2).every(([i, j]) => {
      const a = fcc[i]; const b = fcc[j];
      return Math.abs(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - 2 * Math.SQRT2) < 1e-9;
    }));
  ok('距离写错时一对都配不出来', Kit.linkPairs(fcc, 1.7).length === 0);
  ok('容差能吃掉浮点噪声',
    Kit.linkPairs([{ x: 0, y: 0, z: 0 }, { x: 2 + 4e-16, y: 0, z: 0 }], 2).length === 1);
  ok('超出容差就不连',
    Kit.linkPairs([{ x: 0, y: 0, z: 0 }, { x: 2.001, y: 0, z: 0 }], 2).length === 0);

  // 六方最密堆积的 17 个球心
  const h = Math.sqrt(8 / 3);
  const hex = [[2, 0], [1, Math.sqrt(3)], [-1, Math.sqrt(3)], [-2, 0], [-1, -Math.sqrt(3)], [1, -Math.sqrt(3)], [0, 0]];
  const mid = [[1, Math.sqrt(3) / 3], [-1, Math.sqrt(3) / 3], [0, -2 * Math.sqrt(3) / 3]];
  const hcp = [];
  hex.forEach(([x, y]) => hcp.push({ x, y, z: -h }));
  mid.forEach(([x, y]) => hcp.push({ x, y, z: 0 }));
  hex.forEach(([x, y]) => hcp.push({ x, y, z: h }));
  ok('六方最密:17 个球之间有 45 对相切',
    Kit.linkPairs(hcp, 2).length === 45, `${Kit.linkPairs(hcp, 2).length} 对`);

  ok('只有一个点时不产生线段', Kit.linkPairs([{ x: 0, y: 0, z: 0 }], 2).length === 0);
  ok('空数组安全', Kit.linkPairs([], 2).length === 0);
}

console.log('\n=== 禁止 eval 时的闭包求值器(VSCode 预览的 CSP) ===');
{
  ok('默认走编译版(new Function)', Kit.__nativeCompile() === true);

  const cases = [
    ['2+3*4', {}, 14],
    ['2^3^2', {}, 512],
    ['-2^2', {}, -4],
    ['7 % 3', {}, 1],
    ['1/0', {}, Infinity],
    ['sqrt(16)', {}, 4],
    ['max(1,5,3)', {}, 5],
    ['3sin(0)', {}, 0],
    ['pi x', { x: 2 }, 2 * Math.PI],
    ['(x+1)(x-1)', { x: 3 }, 8],
    ['2x^2', { x: 3 }, 18],
    ['sin(x)^2+cos(x)^2', { x: 0.7 }, 1],
    ['1/(1+x^2)', { x: 1 }, 0.5],
    ['hypot(x, 3)', { x: 4 }, 5],
    ['-x', { x: -2 }, 2],
    ['+x', { x: 5 }, 5],
    ['x*y-z', { x: 2, y: 3, z: 4 }, 2],
    ['sqrt(-1)', {}, NaN],
    ['clamp(x, 0, 1)', { x: 5 }, 1],
  ];

  const run = (expr, scope) => {
    const sc = Kit.makeScope(Object.keys(scope));
    Object.assign(sc, scope);
    return Kit.compile(expr, Object.keys(scope))(sc);
  };

  // 先记下编译版的结果
  const native = cases.map(([e, s]) => run(e, s));
  Kit.__setNativeCompile(false);
  const closures = cases.map(([e, s]) => run(e, s));
  Kit.__setNativeCompile(true);

  const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || Object.is(a, b);
  const bad = cases.filter((_, i) => !same(native[i], closures[i])).map((c, i) => `${c[0]}:${native[i]}/${closures[i]}`);
  ok('两条路的结果逐表达式完全一致', bad.length === 0, bad.join(', '));
  ok('闭包版确实覆盖到了这些用例(不是恒等于 NaN)', cases.every((_, i) => same(native[i], closures[i])));
  ok('表达式里的函数调用也走通了(用 Object.create 的 scope 原型链)',
    same(run('sin(pi/2)', {}), (() => { Kit.__setNativeCompile(false); const v = run('sin(pi/2)', {}); Kit.__setNativeCompile(true); return v; })()));

  // 整条管线(采样 + 等值面)也要能在闭包版下跑出同样的东西
  Kit.__setNativeCompile(false);
  const d2 = Kit.compute2D(['sin(x)'], { x: [-3, 3], samples: 50 }).series[0];
  const mesh = Kit.surfaceNets(Kit.compileImplicit('x^2+y^2+z^2=1', ['x', 'y', 'z']),
    { x: [-2, 2], y: [-2, 2], z: [-2, 2], grid: 16 });
  const mask = Kit.makeMask([Kit.compileConstraint('y > 0', ['x', 'y'])]);
  const sc = Kit.makeScope(['x', 'y']);
  sc.x = 0; sc.y = 1;
  const maskOk = mask(sc);
  Kit.__setNativeCompile(true);

  ok('闭包版下 2D 采样正常', d2.length === 51 && d2.some((p) => p.y !== null && Math.abs(p.y - 1) < 0.05));
  ok('闭包版下等值面正常', mesh.quads.length > 50, `${mesh.quads.length} 个面`);
  ok('闭包版下约束判定正常', maskOk === true);
}

console.log('\n=== 刻度与配色 ===');
ok('niceStep 给出整齐的步长', [Kit.niceStep(10, 8), Kit.niceStep(1, 8), Kit.niceStep(1000, 5)]
  .every((v) => { const m = v / 10 ** Math.round(Math.log10(v)); return [1, 2, 5].some((k) => near(m, k) || near(m * 10, k)); }));
ok('t=0 是青色', Kit.colormap(0) === 'rgb(46,230,255)', Kit.colormap(0));
ok('t=1 是粉色', Kit.colormap(1) === 'rgb(255,95,208)', Kit.colormap(1));
ok('超出范围会被夹住', Kit.colormap(5) === Kit.colormap(1) && Kit.colormap(-3) === Kit.colormap(0));

console.log(`\n${pass} 通过,${fail} 失败`);
process.exit(fail ? 1 : 0);
