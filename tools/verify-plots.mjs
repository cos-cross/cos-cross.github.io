/**
 * 线上函数图像的统一验证。
 *
 * 和别的"检查页面里有没有某个标签"不同:这里把页面上的每个载荷解析出来,
 * 用**同一份核心**(themes/cos-cross/source/js/plot.js)把每个式子重新算一遍,
 * 确认浏览器真能画出东西来。数学部分是实测的,不是"看起来没问题"。
 *
 * 载荷结构:{ items: [{type: explicit|implicit|point, expr, constraints, x,y,z,label}], region: [...], opts }
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Kit = require(path.join(repo, 'themes', 'cos-cross', 'source', 'js', 'plot.js'));

const BASE = process.argv[2] || 'https://cos-cross.github.io';
/** 默认验证演示文章;也可以传第二个参数指定别的页面路径 */
const PAGE = process.argv[3] || '/posts/function-plot/';
const CAM = { az: -0.62, el: 0.52, dist: 3.4, focal: 3.4, zoom: 1 };

let bad = 0;
const check = (label, ok, extra) => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
};

const page = await (await fetch(BASE + PAGE, { headers: { 'User-Agent': 'v' } })).text();

/* ---------- 结构 ---------- */
const blocks = [...page.matchAll(/<div class="plot" data-kind="(\w+)" data-mount/g)];
check('页面里有图像容器', blocks.length > 10, `${blocks.length} 个`);
check('2D 与 3D 都有', blocks.some((b) => b[1] === '2d') && blocks.some((b) => b[1] === '3d'));
check('每个容器都有 canvas',
  (page.match(/<div class="plot-stage"><canvas><\/canvas><\/div>/g) || []).length === blocks.length);
check('引入了带版本号的 plot.js', /js\/plot\.js\?v=\d+/.test(page));

const jsRes = await fetch(BASE + '/js/plot.js', { headers: { 'User-Agent': 'v' } });
check('plot.js 线上可达', jsRes.status === 200, `HTTP ${jsRes.status}`);
const jsText = await jsRes.text();
check('plot.js 内容完整', jsText.includes('surfaceNets') && jsText.includes('marchingSquares')
  && jsText.includes('compileConstraint') && jsText.includes('splitWhere'));

const payloads = [...page.matchAll(/<script type="application\/json">([\s\S]*?)<\/script>/g)]
  .map((m) => m[1].replace(/\\u003c/g, '<'))
  .map((s) => { try { return JSON.parse(s); } catch { return null; } });
check('所有载荷都能解析', payloads.length === blocks.length && payloads.every(Boolean), `${payloads.length} 个`);
check('用的是统一的 items 结构', payloads.every((p) => Array.isArray(p.items)));

/* ---------- 用同一份核心逐条复算 ---------- */
const all = payloads.flatMap((p) => p.items.map((it) => Object.assign({ __p: p }, it)));
const counts = {
  explicit: all.filter((i) => i.type === 'explicit').length,
  implicit: all.filter((i) => i.type === 'implicit').length,
  point: all.filter((i) => i.type === 'point').length,
  segment: all.filter((i) => i.type === 'segment').length,
  polygon: all.filter((i) => i.type === 'polygon').length,
};
console.log(`       条目:显式曲线 ${counts.explicit},隐式方程 ${counts.implicit},点 ${counts.point},`
  + ` 线段 ${counts.segment},多边形 ${counts.polygon}`);
check('三类条目都有', counts.explicit > 0 && counts.implicit > 0 && counts.point > 0);
check('线段与多边形也有实例', counts.segment > 0 && counts.polygon > 0);

function maskOf(item) {
  const is3d = !item.__p.items.some((i) => i.type === 'explicit')
    && !Object.prototype.hasOwnProperty.call(item.__p, 'region');
  const vars = is3d ? ['x', 'y', 'z'] : ['x', 'y'];
  return Kit.makeMask((item.constraints || []).map((c) => Kit.compileConstraint(c, vars)));
}

let okItems = 0;
const failures = [];
for (const item of all) {
  const p = item.__p;
  const is3d = p.opts.z !== undefined;
  const mask = maskOf(item);

  try {
    if (item.type === 'point') {
      const scope = Kit.makeScope(['x', 'y', 'z']);
      scope.x = item.x; scope.y = item.y; scope.z = item.z;
      const kept = !mask || mask(scope);
      // 点是"要么保留要么被排除",两种都算正常,只要能算出来
      if (Number.isFinite(item.x) && Number.isFinite(item.y) && typeof kept === 'boolean') okItems += 1;
      else failures.push(`点 (${item.x},${item.y})`);
      continue;
    }

    if (item.type === 'segment') {
      const finite = [item.a, item.b].every((v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));
      const len = Math.hypot(item.b.x - item.a.x, item.b.y - item.a.y, item.b.z - item.a.z);
      if (finite && len > 1e-9) okItems += 1;
      else failures.push(`线段 ${JSON.stringify(item.a)}→${JSON.stringify(item.b)} 长度 ${len}`);
      continue;
    }

    if (item.type === 'polygon') {
      const finite = Array.isArray(item.points) && item.points.length >= 3
        && item.points.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));
      if (finite) okItems += 1;
      else failures.push(`多边形顶点数 ${item.points && item.points.length}`);
      continue;
    }

    if (is3d) {
      const vars = ['x', 'y', 'z'];
      const o = Object.assign({}, p.opts, { mask });
      const n = item.type === 'implicit'
        ? Kit.surfaceNets(Kit.compileImplicit(item.expr, vars), o).verts.length
        : (() => {
          const s = Kit.buildSurface(item.expr, o);
          return s.grid.flat().filter((v) => Number.isFinite(v.z)).length;
        })();
      if (n > 30) okItems += 1; else failures.push(`${item.expr} → ${n}`);
      continue;
    }

    if (item.type === 'implicit') {
      const segs = Kit.marchingSquares(Kit.compileImplicit(item.expr, ['x', 'y']),
        { x: p.opts.x, y: p.opts.y, nx: 150, ny: 150, mask });
      if (segs.length > 10) okItems += 1; else failures.push(`${item.expr} → ${segs.length} 段`);
      continue;
    }

    // 显式:算出来还得确认保留下来的点真的满足约束
    const d = Kit.compute2D([item.expr], { x: p.opts.x, samples: 300, mask }).series[0];
    const kept = d.filter((q) => q.y !== null);
    const scope = Kit.makeScope(['x', 'y']);
    const compliant = kept.every((q) => {
      scope.x = q.x; scope.y = q.y;
      return !mask || mask(scope);
    });
    if (kept.length > 5 && compliant) okItems += 1;
    else failures.push(`${item.expr} → ${kept.length} 点,合规=${compliant}`);
  } catch (e) {
    failures.push(`${item.expr || 'point'} 抛错:${e.message}`);
  }
}
check('每个式子都能算出有效结果', okItems === all.length, `${okItems}/${all.length}`);
failures.slice(0, 8).forEach((f) => console.log(`       (${f})`));

/* ---------- 区域模式与按曲线定制 ---------- */
const regionPayloads = payloads.filter((p) => p.region && p.region.length);
check('有区域模式(只有约束条件)', regionPayloads.length >= 1, `${regionPayloads.length} 块`);
for (const p of regionPayloads) {
  const mask = Kit.makeMask(p.region.map((c) => Kit.compileConstraint(c, ['x', 'y'])));
  const cells = Kit.regionCells(mask, { x: p.opts.x, y: p.opts.y, nx: 100, ny: 100 });
  check(`区域能算出格子(${p.region.join(' 且 ')})`, cells.length > 50, `${cells.length} 格`);
}

const multi = payloads.filter((p) => {
  const cs = p.items.filter((i) => i.type !== 'point');
  return cs.length >= 2 && new Set(cs.map((i) => JSON.stringify(i.constraints))).size > 1;
});
check('存在"同图内各曲线约束不同"的图', multi.length >= 2, `${multi.length} 块`);

/* ---------- 不该加载的页面 ---------- */
for (const p of ['/about/', '/files/']) {
  const h = await (await fetch(BASE + p, { headers: { 'User-Agent': 'v' } })).text();
  check(`${p} 不加载 plot.js`, !h.includes('/js/plot.js'));
}

console.log(bad ? `\n${bad} 项未通过` : '\n全部通过');
process.exit(bad ? 1 : 0);
