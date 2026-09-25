/**
 * 函数图像渲染:2D 曲线 + 3D 曲面,支持鼠标缩放 / 旋转 / 平移。
 *
 * 设计取舍:没有用 plotly / three.js,而是自己实现。
 *   - 零依赖:不用往仓库里塞 1~3 MB 的库,也不用担心 CDN 在国内的速度;
 *   - 体积小:整个文件就是全部,按需加载(只有含图像的页面才引入);
 *   - 可验证:表达式解析、网格生成、投影排序这些数学核心都能在 Node 里跑单元测试,
 *     引库的话就只能"看起来对"了。
 *
 * 3D 用的是 Canvas 2D + 画家算法(按深度排序后从远到近画四边形),
 * 不是 WebGL —— 对 z = f(x,y) 这种单值高度场完全够用,而且没有 WebGL 上下文丢失
 * 、移动端兼容性这些麻烦。代价是网格密度不能太高(默认 44×44)。
 *
 * 文件末尾同时导出到 window 和 module.exports,所以同一份代码既能给浏览器用,
 * 也能在 Node 里 require 出来做测试。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PlotKit = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ============================================================
     一、表达式解析
     词法分析 → 递归下降 → 编译成 JS 函数
     ============================================================ */

  var CONSTANTS = {
    pi: Math.PI, PI: Math.PI, e: Math.E, E: Math.E, tau: Math.PI * 2,
    inf: Infinity, Infinity: Infinity,
  };

  var FUNCTIONS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
    exp: Math.exp, log: Math.log, ln: Math.log, log2: Math.log2, log10: Math.log10,
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sign: Math.sign,
    floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc,
    min: Math.min, max: Math.max, pow: Math.pow, hypot: Math.hypot,
    mod: function (a, b) { return ((a % b) + b) % b; },
    clamp: function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); },
    // 常用数学记号
    sinc: function (x) { return x === 0 ? 1 : Math.sin(x) / x; },
    gauss: function (x, s) { s = s || 1; return Math.exp(-(x * x) / (2 * s * s)); },
  };

  var TOKEN_RE = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-z_]\w*)|([+\-*/^%(),])|(.))/y;

  function tokenize(src) {
    var tokens = [];
    var re = new RegExp(TOKEN_RE.source, 'y');
    var pos = 0;
    while (pos < src.length) {
      re.lastIndex = pos;
      var m = re.exec(src);
      if (!m) throw new Error('无法解析的位置:' + src.slice(pos, pos + 12));
      pos = re.lastIndex;
      if (m[1] !== undefined) tokens.push({ t: 'num', v: parseFloat(m[1]) });
      else if (m[2] !== undefined) tokens.push({ t: 'id', v: m[2] });
      else if (m[3] !== undefined) tokens.push({ t: 'op', v: m[3] });
      else throw new Error('不认识的字符:' + m[4]);
    }
    tokens.push({ t: 'eof' });
    return tokens;
  }

  function parse(src) {
    if (!src || !src.trim()) throw new Error('表达式是空的');
    var tokens = tokenize(src);
    var i = 0;

    var peek = function () { return tokens[i]; };
    var isOp = function (v) { var t = tokens[i]; return t.t === 'op' && t.v === v; };
    var eat = function (v) { if (!isOp(v)) throw new Error('缺少 "' + v + '"'); i++; };
    var isNumLike = function (t) { return t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '('); };

    function parseExpr() {
      var node = parseTerm();
      for (;;) {
        if (isOp('+')) { i++; node = { t: 'bin', op: '+', a: node, b: parseTerm() }; }
        else if (isOp('-')) { i++; node = { t: 'bin', op: '-', a: node, b: parseTerm() }; }
        else return node;
      }
    }

    function parseTerm() {
      var node = parseUnary();
      for (;;) {
        if (isOp('*')) { i++; node = { t: 'bin', op: '*', a: node, b: parseUnary() }; }
        else if (isOp('/')) { i++; node = { t: 'bin', op: '/', a: node, b: parseUnary() }; }
        else if (isOp('%')) { i++; node = { t: 'bin', op: '%', a: node, b: parseUnary() }; }
        // 隐式乘法:2x、3sin(x)、2(x+1)、(x+1)(x-1) 都支持
        else if (isNumLike(peek())) node = { t: 'bin', op: '*', a: node, b: parseUnary() };
        else return node;
      }
    }

    function parseUnary() {
      if (isOp('-')) { i++; return { t: 'neg', a: parseUnary() }; }
      if (isOp('+')) { i++; return parseUnary(); }
      return parsePower();
    }

    function parsePower() {
      var base = parsePrimary();
      if (isOp('^')) { i++; return { t: 'bin', op: '^', a: base, b: parseUnary() }; } // 右结合
      return base;
    }

    function parsePrimary() {
      var t = peek();
      if (t.t === 'num') { i++; return { t: 'num', v: t.v }; }
      if (t.t === 'op' && t.v === '(') {
        i++;
        var node = parseExpr();
        if (!isOp(')')) throw new Error('括号没有闭合');
        i++;
        return node;
      }
      if (t.t === 'id') {
        i++;
        var name = t.v;
        if (isOp('(')) {
          i++;
          var args = [];
          if (!isOp(')')) {
            args.push(parseExpr());
            while (isOp(',')) { i++; args.push(parseExpr()); }
          }
          if (!isOp(')')) throw new Error('函数调用缺少 ")"');
          i++;
          return { t: 'call', name: name, args: args };
        }
        return { t: 'var', name: name };
      }
      throw new Error('表达式不完整,位置:' + i);
    }

    var ast = parseExpr();
    if (peek().t !== 'eof') throw new Error('表达式后面有多余内容');
    return ast;
  }

  /** 收集表达式里用到的变量名 */
  function collectVars(node, out) {
    out = out || {};
    if (!node) return out;
    if (node.t === 'var') out[node.name] = true;
    else if (node.t === 'neg') collectVars(node.a, out);
    else if (node.t === 'bin') { collectVars(node.a, out); collectVars(node.b, out); }
    else if (node.t === 'call') node.args.forEach(function (a) { collectVars(a, out); });
    return out;
  }

  function toJS(node) {
    switch (node.t) {
      case 'num': return '(' + node.v + ')';
      case 'var': return 's.' + node.name;
      case 'neg': return '(-' + toJS(node.a) + ')';
      case 'bin':
        // 注意:数学的 ^ 是乘方,不能直接拼成 JS 的 ^(那是按位异或!)
        if (node.op === '^') {
          return 'Math.pow(' + toJS(node.a) + ',' + toJS(node.b) + ')';
        }
        return '(' + toJS(node.a) + ' ' + node.op + ' ' + toJS(node.b) + ')';
      case 'call':
        return 's.' + node.name + '(' + node.args.map(toJS).join(',') + ')';
      default: throw new Error('未知节点:' + node.t);
    }
  }

  /** 表达式里引用到的所有标识符:变量 + 函数名 */
  function collectNames(node, out) {
    out = out || { vars: {}, calls: {} };
    if (!node) return out;
    if (node.t === 'var') out.vars[node.name] = true;
    else if (node.t === 'neg') collectNames(node.a, out);
    else if (node.t === 'bin') { collectNames(node.a, out); collectNames(node.b, out); }
    else if (node.t === 'call') {
      out.calls[node.name] = true;
      node.args.forEach(function (a) { collectNames(a, out); });
    }
    return out;
  }

  /**
   * 编译表达式。
   * allowedVars 之外的符号会被明确报错,而不是悄悄算出 NaN —— 打错一个字母时
   * 那句"未知符号: xx"比一张空图有用得多。函数名同样要校验,
   * 否则错的是 `s.foo is not a function` 这种看不懂的运行时错误。
   */
  function compile(src, allowedVars) {
    var ast = parse(src);
    var names = collectNames(ast);

    Object.keys(names.calls).forEach(function (name) {
      if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) {
        throw new Error('未知函数:"' + name + '"');
      }
    });
    Object.keys(names.vars).forEach(function (name) {
      if (allowedVars && allowedVars.indexOf(name) !== -1) return;
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) return;
      if (Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) return; // 允许 sin 当常量名以外的东西
      throw new Error('未知符号:"' + name + '"(可用变量:' + (allowedVars || []).join(', ') + ')');
    });

    var body = 'return ' + toJS(ast) + ';';
    var fn;
    try {
      fn = new Function('s', body); // 代码串完全由上面的 AST 拼出来,不含用户原始输入
    } catch (e) {
      throw new Error('表达式无法编译:' + e.message);
    }
    return function (scope) {
      var v = fn(scope);
      return typeof v === 'number' ? v : NaN;
    };
  }

  /** 建一个带常量/函数原型的求值作用域(每次求值只改 x/y,避免反复建对象) */
  function makeScope(vars) {
    var scope = Object.create(FUNCTIONS);
    Object.keys(CONSTANTS).forEach(function (k) { scope[k] = CONSTANTS[k]; });
    (vars || []).forEach(function (v) { scope[v] = 0; });
    return scope;
  }

  /* ============================================================
     二、2D:采样
     ============================================================ */

  function compute2D(exprs, opts) {
    opts = opts || {};
    var fns = exprs.map(function (e) { return compile(e, ['x']); });
    var scope = makeScope(['x']);
    var n = opts.samples || 720;
    var x0 = opts.x[0];
    var x1 = opts.x[1];
    var series = fns.map(function (fn) {
      var pts = [];
      for (var i = 0; i <= n; i++) {
        var x = x0 + (x1 - x0) * (i / n);
        scope.x = x;
        var y = fn(scope);
        // 非有限值断开,避免 1/x 这种在 0 附近连出一条竖线
        pts.push(Number.isFinite(y) ? { x: x, y: y } : { x: x, y: null });
      }
      return pts;
    });
    return { exprs: exprs, series: series };
  }

  /* ============================================================
     三、3D:高度场网格
     ============================================================ */

  function buildSurface(expr, opts) {
    opts = opts || {};
    var fn = compile(expr, ['x', 'y']);
    var scope = makeScope(['x', 'y']);
    var n = Math.max(4, Math.min(120, opts.grid || 44));
    var x0 = opts.x[0], x1 = opts.x[1], y0 = opts.y[0], y1 = opts.y[1];

    var verts = [];
    var zmin = Infinity, zmax = -Infinity;

    for (var j = 0; j <= n; j++) {
      var row = [];
      for (var i = 0; i <= n; i++) {
        scope.x = x0 + (x1 - x0) * (i / n);
        scope.y = y0 + (y1 - y0) * (j / n);
        var z = fn(scope);
        if (!Number.isFinite(z)) z = NaN;
        else { if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
        row.push({ x: scope.x, y: scope.y, z: z });
      }
      verts.push(row);
    }

    if (!Number.isFinite(zmin)) { zmin = 0; zmax = 1; }
    if (zmax - zmin < 1e-9) { zmax = zmin + 1; }

    // 作者指定了 z 范围就用指定的(颜色映射更稳定)
    if (opts.z) { zmin = opts.z[0]; zmax = opts.z[1]; }

    // 归一化到 [-1,1] 的立方体里,便于统一投影和缩放
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var cxr = (x1 - x0) / 2 || 1, cyr = (y1 - y0) / 2 || 1;

    function unitZ(z) {
      return ((z - zmin) / (zmax - zmin)) * 2 - 1;
    }

    var grid = verts.map(function (row) {
      return row.map(function (p) {
        return {
          ux: (p.x - cx) / cxr,
          uy: (p.y - cy) / cyr,
          uz: Number.isFinite(p.z) ? unitZ(p.z) : NaN,
          z: p.z,
        };
      });
    });

    return {
      expr: expr, grid: grid, n: n,
      zmin: zmin, zmax: zmax,
      range: { x: [x0, x1], y: [y0, y1] },
    };
  }

  /* ============================================================
     四、3D:投影
     ============================================================ */

  function rotatePoint(p, cam) {
    // 渲染空间约定:x 向右,y 向上,z 指向观察者。
    // 方位角绕"向上"的 y 轴转,仰角再绕水平轴转 ——
    // 顺序不能反,也不要把 y 混进方位角里(那等于让画面原地打滚)。
    var ca = Math.cos(cam.az), sa = Math.sin(cam.az);
    var x1 = p.x * ca + p.z * sa;
    var z1 = -p.x * sa + p.z * ca;

    var ce = Math.cos(cam.el), se = Math.sin(cam.el);
    var y2 = p.y * ce - z1 * se;
    var z2 = p.y * se + z1 * ce;

    return { x: x1, y: y2, z: z2 };
  }

  function project(p, cam, w, h) {
    var r = rotatePoint(p, cam);
    // 相机在 +z 方向距离 cam.dist 处朝 -z 看,r.z 越大离相机越近
    var d = cam.dist - r.z;
    var k = cam.focal / Math.max(d, 0.01);
    var s = Math.min(w, h) * 0.42 * cam.zoom;
    return { x: w / 2 + r.x * k * s, y: h / 2 - r.y * k * s, z: r.z, depth: d };
  }

  /** 生成待排序的四边形(带法线和平均深度) */
  function buildQuads(surface, cam, w, h, opts) {
    opts = opts || {};
    var g = surface.grid;
    var n = surface.n;
    var cx = opts.panX || 0;
    var cy = opts.panY || 0;
    var quads = [];

    var proj = function (p) {
      var q = project({ x: p.ux, y: p.uz, z: p.uy }, cam, w, h);
      // 注意:数学上的 z 映射到屏幕的"上",所以在投影时把 uz 当 y、uy 当 z
      q.x += cx;
      q.y += cy;
      return q;
    };

    for (var j = 0; j < n; j++) {
      for (var i = 0; i < n; i++) {
        var a = g[j][i], b = g[j][i + 1], c = g[j + 1][i + 1], d = g[j + 1][i];
        if (!Number.isFinite(a.uz) || !Number.isFinite(b.uz)
          || !Number.isFinite(c.uz) || !Number.isFinite(d.uz)) continue;

        var pa = proj(a), pb = proj(b), pc = proj(c), pd = proj(d);
        if (pa.depth <= 0.05 || pb.depth <= 0.05 || pc.depth <= 0.05 || pd.depth <= 0.05) continue;

        // 用平行四边形两条边做叉积求法线,给着色用
        var e1 = { x: b.ux - a.ux, y: b.uz - a.uz, z: b.uy - a.uy };
        var e2 = { x: d.ux - a.ux, y: d.uz - a.uz, z: d.uy - a.uy };
        var nx = e1.y * e2.z - e1.z * e2.y;
        var ny = e1.z * e2.x - e1.x * e2.z;
        var nz = e1.x * e2.y - e1.y * e2.x;
        var len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; } // 统一朝上

        var zAvg = (a.uz + b.uz + c.uz + d.uz) / 4;
        quads.push({
          pts: [pa, pb, pc, pd],
          depth: (pa.depth + pb.depth + pc.depth + pd.depth) / 4,
          light: Math.max(0.18, 0.55 * nx - 0.32 * ny + 0.78 * nz),
          t: (zAvg + 1) / 2,
          z: (a.z + b.z + c.z + d.z) / 4,
        });
      }
    }

    // 画家算法:远的先画
    quads.sort(function (p, q) { return q.depth - p.depth; });
    return quads;
  }

  /* ============================================================
     五、配色
     ============================================================ */

  var STOPS = [
    [0.00, [46, 230, 255]],   // cyan
    [0.50, [155, 123, 255]],  // violet
    [1.00, [255, 95, 208]],   // pink
  ];

  function colormap(t, alpha) {
    t = Math.max(0, Math.min(1, t));
    for (var i = 0; i < STOPS.length - 1; i++) {
      var a = STOPS[i], b = STOPS[i + 1];
      if (t <= b[0]) {
        var k = (t - a[0]) / (b[0] - a[0] || 1);
        var r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * k);
        var g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * k);
        var bl = Math.round(a[1][2] + (b[1][2] - a[1][2]) * k);
        return alpha === undefined ? 'rgb(' + r + ',' + g + ',' + bl + ')'
          : 'rgba(' + r + ',' + g + ',' + bl + ',' + alpha + ')';
      }
    }
    return 'rgb(255,95,208)';
  }

  /* ============================================================
     六、绘制
     ============================================================ */

  function niceStep(range, target) {
    var raw = range / Math.max(1, target);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    return step * mag;
  }

  function tickLabel(v) {
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a >= 1e5 || a < 1e-4) return v.toExponential(1).replace('e+', 'e');
    var s = String(Math.round(v * 1e6) / 1e6);
    return s;
  }

  function drawAxes2D(ctx, view, w, h, theme) {
    var x2p = function (x) { return (x - view.x0) / (view.x1 - view.x0) * w; };
    var y2p = function (y) { return h - (y - view.y0) / (view.y1 - view.y0) * h; };

    var stepX = niceStep(view.x1 - view.x0, 8);
    var stepY = niceStep(view.y1 - view.y0, 5);

    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.grid;
    ctx.beginPath();
    for (var x = Math.ceil(view.x0 / stepX) * stepX; x <= view.x1; x += stepX) {
      var px = Math.round(x2p(x)) + 0.5;
      ctx.moveTo(px, 0); ctx.lineTo(px, h);
    }
    for (var y = Math.ceil(view.y0 / stepY) * stepY; y <= view.y1; y += stepY) {
      var py = Math.round(y2p(y)) + 0.5;
      ctx.moveTo(0, py); ctx.lineTo(w, py);
    }
    ctx.stroke();

    // 坐标轴
    ctx.strokeStyle = theme.axis;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    var y0p = y2p(0), x0p = x2p(0);
    if (y0p >= 0 && y0p <= h) { ctx.moveTo(0, y0p); ctx.lineTo(w, y0p); }
    if (x0p >= 0 && x0p <= w) { ctx.moveTo(x0p, 0); ctx.lineTo(x0p, h); }
    ctx.stroke();

    // 刻度数字
    ctx.fillStyle = theme.text;
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var labelY = Math.min(Math.max(y0p, 0), h - 14);
    for (var x2 = Math.ceil(view.x0 / stepX) * stepX; x2 <= view.x1; x2 += stepX) {
      if (Math.abs(x2) < stepX * 1e-6) continue;
      ctx.fillText(tickLabel(x2), x2p(x2), labelY + 4);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    var labelX = Math.min(Math.max(x0p, 26), w - 4);
    for (var y2 = Math.ceil(view.y0 / stepY) * stepY; y2 <= view.y1; y2 += stepY) {
      if (Math.abs(y2) < stepY * 1e-6) continue;
      ctx.fillText(tickLabel(y2), labelX - 6, y2p(y2));
    }
  }

  function render2D(ctx, canvas, state, theme) {
    var w = canvas.width / theme.dpr;
    var h = canvas.height / theme.dpr;
    ctx.setTransform(theme.dpr, 0, 0, theme.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var view = state.view;
    drawAxes2D(ctx, view, w, h, theme);

    var x2p = function (x) { return (x - view.x0) / (view.x1 - view.x0) * w; };
    var y2p = function (y) { return h - (y - view.y0) / (view.y1 - view.y0) * h; };

    state.series.forEach(function (pts, si) {
      var color = state.colors[si % state.colors.length];
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      var started = false;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (p.y === null) { started = false; continue; }
        var px = x2p(p.x), py = y2p(p.y);
        // 纵向出界时截断,避免曲线飞出画布还拖着长线
        if (py < -h * 4 || py > h * 5) { started = false; continue; }
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }

  function render3D(ctx, canvas, state, theme) {
    var w = canvas.width / theme.dpr;
    var h = canvas.height / theme.dpr;
    ctx.setTransform(theme.dpr, 0, 0, theme.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var quads = buildQuads(state.surface, state.cam, w, h, state);

    for (var i = 0; i < quads.length; i++) {
      var q = quads[i];
      var rgb = colormap(q.t).match(/\d+/g);
      var m = q.light;
      // 用四边形法线算出的明暗系数调制颜色,曲面才有立体感
      var r = Math.min(255, Math.round(rgb[0] * m));
      var g = Math.min(255, Math.round(rgb[1] * m));
      var b = Math.min(255, Math.round(rgb[2] * m));

      ctx.beginPath();
      ctx.moveTo(q.pts[0].x, q.pts[0].y);
      ctx.lineTo(q.pts[1].x, q.pts[1].y);
      ctx.lineTo(q.pts[2].x, q.pts[2].y);
      ctx.lineTo(q.pts[3].x, q.pts[3].y);
      ctx.closePath();
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      ctx.fill();
      // 极细的同色边线能压掉相邻四边形之间的白缝
      ctx.strokeStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }

    drawAxes3D(ctx, state, w, h, theme);
  }

  function drawAxes3D(ctx, state, w, h, theme) {
    var cam = state.cam;
    var P = function (x, y, z) {
      var q = project({ x: x, y: y, z: z }, cam, w, h);
      q.x += state.panX || 0;
      q.y += state.panY || 0;
      return q;
    };

    // 立方体左下后角的三条棱 → 坐标轴
    var axes = [
      { to: [1, 0, 0], label: 'x' },
      { to: [0, 0, 1], label: 'y' },
      { to: [0, 1, 0], label: 'z' },
    ];
    var origin = P(-1, -1, -1);

    ctx.lineWidth = 1.6;
    axes.forEach(function (ax) {
      var end = P(-1 + ax.to[0] * 2, -1 + ax.to[1] * 2, -1 + ax.to[2] * 2);
      ctx.strokeStyle = theme.axis;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      ctx.fillStyle = theme.text;
      ctx.font = '600 12px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ax.label, end.x + (end.x - origin.x) * 0.08, end.y + (end.y - origin.y) * 0.08);
    });

    // 立方体其余棱(淡一点),给点空间感
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    var corners = [];
    for (var sx = 0; sx <= 1; sx++) {
      for (var sy = 0; sy <= 1; sy++) {
        for (var sz = 0; sz <= 1; sz++) {
          corners.push(P(sx * 2 - 1, sy * 2 - 1, sz * 2 - 1));
        }
      }
    }
    // 12 条棱
    var edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    edges.forEach(function (e) {
      ctx.moveTo(corners[e[0]].x, corners[e[0]].y);
      ctx.lineTo(corners[e[1]].x, corners[e[1]].y);
    });
    ctx.stroke();
  }

  /* ============================================================
     七、浏览器挂载 + 交互
     ============================================================ */

  var COLORS = ['#2ee6ff', '#ff5fd0', '#a6ff5c', '#ffd166', '#9b7bff'];

  function themeOf(el) {
    var cs = getComputedStyle(el);
    var pick = function (name, fallback) {
      var v = cs.getPropertyValue(name);
      return v && v.trim() ? v.trim() : fallback;
    };
    return {
      grid: pick('--plot-grid', 'rgba(140,150,255,.14)'),
      axis: pick('--plot-axis', 'rgba(160,170,255,.42)'),
      text: pick('--plot-text', 'rgba(169,173,207,.85)'),
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    };
  }

  function setupCanvas(canvas, el) {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(240, Math.round(rect.width));
    var h = Math.round(w * (el.dataset.ratio ? parseFloat(el.dataset.ratio) : (el.dataset.kind === '3d' ? 0.62 : 0.58)));
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    return { w: w, h: h, dpr: dpr };
  }

  function mount(el) {
    var canvas = el.querySelector('canvas');
    var payloadEl = el.querySelector('script[type="application/json"]');
    if (!canvas || !payloadEl) return;

    var payload;
    try {
      payload = JSON.parse(payloadEl.textContent);
    } catch (e) {
      showError(el, '图像参数读取失败:' + e.message);
      return;
    }

    var ctx = canvas.getContext('2d');
    var kind = el.dataset.kind;
    var state = { panX: 0, panY: 0 };

    function fail(msg) {
      showError(el, msg);
    }

    try {
      if (kind === '3d') {
        state.surface = buildSurface(payload.expr, payload.opts);
        state.cam = {
          az: -0.62, el: 0.52, dist: 3.4,
          focal: 3.4, zoom: 1,
        };
      } else {
        state.exprs = payload.exprs;
        state.colors = COLORS;
        var x0 = payload.opts.x[0], x1 = payload.opts.x[1];
        state.view = { x0: x0, x1: x1, y0: -1, y1: 1 };
        state.opts = payload.opts;
      }
    } catch (e) {
      fail(e.message);
      return;
    }

    var size = setupCanvas(canvas, el);

    function resample() {
      if (kind === '3d') return;
      var data = compute2D(state.exprs, {
        x: [state.view.x0, state.view.x1],
        samples: 900,
      });
      state.series = data.series;
    }

    function autoFitY() {
      if (kind === '3d' || state.opts.y) return;
      var lo = Infinity, hi = -Infinity;
      state.series.forEach(function (pts) {
        pts.forEach(function (p) {
          if (p.y === null) return;
          if (p.y < lo) lo = p.y;
          if (p.y > hi) hi = p.y;
        });
      });
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = -1; hi = 1; }
      if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
      var pad = (hi - lo) * 0.12;
      state.view.y0 = lo - pad;
      state.view.y1 = hi + pad;
    }

    function draw() {
      var theme = themeOf(el);
      var s = setupCanvas(canvas, el);
      if (kind === '3d') render3D(ctx, canvas, state, theme);
      else render2D(ctx, canvas, state, theme);
      el.dataset.ready = '1';
    }

    resample();
    autoFitY();
    draw();

    // ---- 交互 ----
    var dragging = false;
    var lastX = 0, lastY = 0;
    var pointers = new Map();
    var pinchStart = 0, pinchZoom = 1;

    function localPos(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function zoomAt(px, py, factor) {
      if (kind === '3d') {
        state.cam.zoom = Math.max(0.25, Math.min(6, state.cam.zoom * factor));
        return;
      }
      var v = state.view;
      var fx = (px / size.w);
      var fy = (py / size.h);
      var xAnchor = v.x0 + (v.x1 - v.x0) * fx;
      var yAnchor = v.y1 - (v.y1 - v.y0) * fy;
      state.view = {
        x0: xAnchor + (v.x0 - xAnchor) / factor,
        x1: xAnchor + (v.x1 - xAnchor) / factor,
        y0: yAnchor + (v.y0 - yAnchor) / factor,
        y1: yAnchor + (v.y1 - yAnchor) / factor,
      };
      resample();
    }

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = localPos(e);
      zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      draw();
    }, { passive: false });

    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, e);
      if (pointers.size === 1) {
        dragging = true;
        lastX = e.clientX; lastY = e.clientY;
      } else if (pointers.size === 2) {
        var pts = [...pointers.values()];
        pinchStart = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
        pinchZoom = kind === '3d' ? state.cam.zoom : 1;
      }
      canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, e);

      if (pointers.size === 2) {
        var pts = [...pointers.values()];
        var d = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
        if (pinchStart > 0) {
          var factor = d / pinchStart;
          if (kind === '3d') state.cam.zoom = Math.max(0.25, Math.min(6, pinchZoom * factor));
          else {
            // 双指缩放:以画布中心为锚点
            state.view = scaleView(state.view, factor);
            resample();
          }
          draw();
        }
        return;
      }

      if (!dragging) return;
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;

      if (kind === '3d') {
        state.cam.az -= dx * 0.008;
        state.cam.el = Math.max(-1.5, Math.min(1.5, state.cam.el + dy * 0.008));
      } else {
        var v = state.view;
        var sx = (v.x1 - v.x0) / size.w;
        var sy = (v.y1 - v.y0) / size.h;
        state.view = { x0: v.x0 - dx * sx, x1: v.x1 - dx * sx, y0: v.y0 + dy * sy, y1: v.y1 + dy * sy };
        resample();
      }
      draw();
    });

    function release(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = 0;
      if (pointers.size === 0) {
        dragging = false;
        canvas.style.cursor = 'grab';
      }
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    function scaleView(v, factor) {
      var cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
      var hw = (v.x1 - v.x0) / 2 / factor, hh = (v.y1 - v.y0) / 2 / factor;
      return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
    }

    canvas.addEventListener('dblclick', function () {
      reset();
    });

    function reset() {
      state.panX = 0; state.panY = 0;
      if (kind === '3d') {
        state.cam.az = -0.62; state.cam.el = 0.52; state.cam.zoom = 1;
      } else {
        state.view.x0 = payload.opts.x[0];
        state.view.x1 = payload.opts.x[1];
        resample();
        autoFitY();
      }
      draw();
    }

    el.querySelectorAll('[data-plot-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var act = btn.dataset.plotAction;
        if (act === 'reset') reset();
        else if (act === 'save') {
          var a = document.createElement('a');
          a.download = (el.dataset.title || 'plot') + '.png';
          a.href = canvas.toDataURL('image/png');
          a.click();
        }
      });
    });

    var ro = window.ResizeObserver ? new ResizeObserver(function () { draw(); }) : null;
    if (ro) ro.observe(el);

    canvas.style.cursor = 'grab';
    el.dataset.mounted = '1';
  }

  function showError(el, msg) {
    el.dataset.error = '1';
    var box = el.querySelector('.plot-error');
    if (!box) {
      box = document.createElement('p');
      box.className = 'plot-error';
      el.appendChild(box);
    }
    box.textContent = '图像无法绘制:' + msg;
    var c = el.querySelector('canvas');
    if (c) c.style.display = 'none';
  }

  function boot() {
    document.querySelectorAll('.plot[data-mount]:not([data-mounted])').forEach(function (el) {
      try { mount(el); } catch (e) { showError(el, e.message); }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    window.addEventListener('load', boot);
  }

  return {
    // 供 Node 侧单测使用
    tokenize: tokenize,
    parse: parse,
    compile: compile,
    makeScope: makeScope,
    collectVars: collectVars,
    collectNames: collectNames,
    compute2D: compute2D,
    buildSurface: buildSurface,
    buildQuads: buildQuads,
    project: project,
    rotatePoint: rotatePoint,
    colormap: colormap,
    niceStep: niceStep,
    mount: mount,
    boot: boot,
  };
}));
