/* ==========================================================================
   plot.js — 函数与几何图形引擎（零依赖）
   --------------------------------------------------------------------------
   为什么自己写：内联 SVG 里用 L 连折线画曲线，在曲率大处会露成折角、
   在间断点处会连出并不存在的竖线（本工程 v0.7.26 就踩过"两支画到一起"）。
   本引擎参考 Desmos 公开的作图思路，做了四件事：

     ① 自适应细分采样：按弦高误差递归二分，曲率大处自动加密；
        并对函数做**极点/间断检测**——跨间断不连线，而是把路径断开。
     ② 数值比例映射：x/y 用各自的比例尺，几何图形不会被拉变形
        （圆仍是圆，切线斜率仍是真斜率）。
     ③ 隐函数曲线用 marching squares 提取等值线（F(x,y)=0），
        不靠枚举 y=f(x)，因此能画 x²+y²=1 这类非函数曲线。
     ④ 参数绑定与实时重绘：spec 里可用 {a: {value, min, max}} 声明参数，
        自动生成滑块；拖动即按 requestAnimationFrame 重绘。

   输出是 SVG（不是 canvas），因此：颜色用 currentColor 自动跟随四套主题、
   图内文字与全站字体一致、可无级缩放不失真、可被静态校验脚本读取。

   用法：
     Plot.render(document.getElementById('fig'), {
       x: [-2, 2], y: [-1.5, 1.5], height: 260,
       axes: { x: {step: 1, label: 'x'}, y: {step: 1, label: 'y'} },
       elements: [
         { type: 'fn', of: 'sin(x)/x', color: 'brand' },
         { type: 'implicit', eq: 'x^2+y^2=1', color: 'accent' },
         { type: 'param', x: 'cos(t)', y: 'sin(t)', t: [0, 6.283], dash: true },
         { type: 'point', at: [1, 1], label: 'P' },
         { type: 'vector', from: [0,0], to: [1,1], label: 'v', color: 'brand' },
         { type: 'region', between: ['0', 'sin(x)'], from: 0, to: 3.14, color: 'brand' },
         { type: 'label', at: [0.2, 1.1], text: 'y = sin x' }
       ],
       params: { a: { value: 1, min: -2, max: 2, step: 0.1, label: 'a' } }
     });

   3D 辅助（第 8 章向量/平面/曲面用）：Plot.project3D / Plot.axes3D
   —— 把 (x,y,z) 按视角投影到二维，再用上面的 2D 原语绘制（画家算法按深度排序）。
   ========================================================================== */
(function (global) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------------
     1. 表达式求值：递归下降解析，不使用 eval / new Function
     ------------------------------------------------------------------ */
  var FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    cot: function (x) { return 1 / Math.tan(x); },
    sec: function (x) { return 1 / Math.cos(x); },
    csc: function (x) { return 1 / Math.sin(x); },
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    ln: Math.log, log: Math.log10, lg: Math.log10, exp: Math.exp,
    sqrt: Math.sqrt, abs: Math.abs, sign: Math.sign,
    floor: Math.floor, ceil: Math.ceil, round: Math.round,
    max: Math.max, min: Math.min, pow: Math.pow,
    atan2: Math.atan2, hypot: Math.hypot
  };
  var CONSTS = { pi: Math.PI, PI: Math.PI, e: Math.E, tau: 2 * Math.PI };

  function tokenize(src) {
    var i = 0, out = [];
    var isDigit = function (c) { return c >= '0' && c <= '9'; };
    var isAlpha = function (c) { return /[A-Za-z_]/.test(c); };
    while (i < src.length) {
      var c = src[i];
      if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
      if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
        var j = i;
        while (j < src.length && (isDigit(src[j]) || src[j] === '.')) j++;
        // 科学计数法 1e-3
        if (src[j] === 'e' || src[j] === 'E') {
          var k = j + 1;
          if (src[k] === '+' || src[k] === '-') k++;
          if (isDigit(src[k])) { while (k < src.length && isDigit(src[k])) k++; j = k; }
        }
        out.push({ t: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue;
      }
      if (isAlpha(c)) {
        var m = i;
        while (m < src.length && /[A-Za-z0-9_]/.test(src[m])) m++;
        out.push({ t: 'name', v: src.slice(i, m) }); i = m; continue;
      }
      if ('+-*/^(),'.indexOf(c) >= 0) { out.push({ t: c }); i++; continue; }
      if (c === '=') { out.push({ t: '=' }); i++; continue; }
      throw new Error('plot.js: 无法识别的字符「' + c + '」');
    }
    return out;
  }

  /* 递归下降：expr → term → unary → power → atom */
  function parse(tokens) {
    var p = 0;
    function peek() { return tokens[p]; }
    function eat(t) {
      var tok = tokens[p];
      if (!tok || (t && tok.t !== t)) throw new Error('plot.js: 表达式语法有误');
      p++; return tok;
    }
    function parseExpr() {
      var node = parseTerm();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        var op = eat().t;
        node = { op: op, a: node, b: parseTerm() };
      }
      return node;
    }
    function parseTerm() {
      var node = parseUnary();
      while (peek() && (peek().t === '*' || peek().t === '/')) {
        var op = eat().t;
        node = { op: op, a: node, b: parseUnary() };
      }
      return node;
    }
    function parseUnary() {
      if (peek() && (peek().t === '-' || peek().t === '+')) {
        var op = eat().t;
        return { op: 'u' + op, a: parseUnary() };
      }
      return parsePower();
    }
    function parsePower() {
      var base = parseAtom();
      if (peek() && peek().t === '^') { eat('^'); return { op: '^', a: base, b: parseUnary() }; }
      return base;
    }
    function parseAtom() {
      var tok = eat();
      if (tok.t === 'num') return { num: tok.v };
      if (tok.t === '(') { var e = parseExpr(); eat(')'); return e; }
      if (tok.t === 'name') {
        if (peek() && peek().t === '(') {
          eat('(');
          var args = [];
          if (peek() && peek().t !== ')') {
            args.push(parseExpr());
            while (peek() && peek().t === ',') { eat(','); args.push(parseExpr()); }
          }
          eat(')');
          return { call: tok.v, args: args };
        }
        return { name: tok.v };
      }
      throw new Error('plot.js: 表达式语法有误');
    }
    var ast = parseExpr();
    if (p !== tokens.length) throw new Error('plot.js: 表达式尾部有多余内容');
    return ast;
  }

  var cache = {};
  function compile(expr) {
    if (typeof expr === 'function') return expr;
    var key = String(expr);
    if (cache[key]) return cache[key];
    var ast = parse(tokenize(key));
    var f = function (scope) { return evalNode(ast, scope); };
    f.src = key;
    cache[key] = f;
    return f;
  }
  function evalNode(n, s) {
    if (n.num !== undefined) return n.num;
    if (n.name !== undefined) {
      if (s && Object.prototype.hasOwnProperty.call(s, n.name)) return s[n.name];
      if (CONSTS[n.name] !== undefined) return CONSTS[n.name];
      throw new Error('plot.js: 未知变量「' + n.name + '」');
    }
    if (n.call !== undefined) {
      var f = FUNCS[n.call];
      if (!f) throw new Error('plot.js: 未知函数「' + n.call + '」');
      var a = n.args.map(function (x) { return evalNode(x, s); });
      return f.apply(null, a);
    }
    var A = function () { return evalNode(n.a, s); };
    switch (n.op) {
      case '+': return A() + evalNode(n.b, s);
      case '-': return A() - evalNode(n.b, s);
      case '*': return A() * evalNode(n.b, s);
      case '/': return A() / evalNode(n.b, s);
      case '^': return Math.pow(A(), evalNode(n.b, s));
      case 'u-': return -A();
      case 'u+': return A();
    }
    throw new Error('plot.js: 未知运算符');
  }

  /* ------------------------------------------------------------------
     2. 自适应细分采样
     —— 按弦高（曲线中点到弦的距离）判断是否需要再分；
        跨间断/极点时不连线，而是断开成两段。
     ------------------------------------------------------------------ */
  function sample(f, t0, t1, opt) {
    var range = (opt && opt.range) || 1e6;   // y 超出此范围视为跑出画面
    var N = (opt && opt.steps) || 1400;      // 基础步数（之后按曲率加密）
    var maxDepth = (opt && opt.maxDepth) || 6;
    var segs = [], cur = [];

    function evalAt(t) {
      try { var v = f(t); return (typeof v === 'number' && isFinite(v)) ? v : NaN; }
      catch (e) { return NaN; }
    }
    function ok(v) { return isFinite(v) && Math.abs(v) <= range; }
    function flush() { if (cur.length > 1) segs.push(cur); cur = []; }

    /* 在 [a,b] 之间按弦高递归加密；两端都必须有效 */
    function refine(a, fa, b, fb, depth) {
      var m = (a + b) / 2, fm = evalAt(m);
      if (!ok(fm)) return;                       // 中点不可用：不加密
      var dev = Math.abs(fm - (fa + fb) / 2);
      if (depth < maxDepth && dev > 0.25) {
        refine(a, fa, m, fm, depth + 1);
        cur.push([m, fm]);
        refine(m, fm, b, fb, depth + 1);
      }
    }

    var prevT = null, prevV = null, suppress = false;
    for (var i = 0; i <= N; i++) {
      var t = t0 + (t1 - t0) * i / N;
      var v = evalAt(t);
      if (!ok(v)) {                              // 不可用 → 断开
        flush(); prevT = prevV = null; suppress = false; continue;
      }
      if (prevT === null) { cur.push([t, v]); prevT = t; prevV = v; continue; }
      // 相邻两点跨度极大 → 判为极点/间断：断开，不在中间连线
      var jump = Math.abs(v - prevV) > 0.35 * range;
      if (jump) {
        flush();
        cur.push([t, v]); prevT = t; prevV = v; suppress = false;
        continue;
      }
      refine(prevT, prevV, t, v, 0);
      cur.push([t, v]);
      prevT = t; prevV = v;
    }
    flush();
    return segs;
  }

  /* ------------------------------------------------------------------
     3. 隐函数：marching squares 提取 F(x,y)=0 的等值线
     ------------------------------------------------------------------ */
  function marchingSquares(F, x0, x1, y0, y1, nx, ny) {
    var segs = [], i, j;
    var gx = [], gy = [], V = [];
    for (i = 0; i <= nx; i++) gx.push(x0 + (x1 - x0) * i / nx);
    for (j = 0; j <= ny; j++) gy.push(y0 + (y1 - y0) * j / ny);
    for (j = 0; j <= ny; j++) {
      V[j] = [];
      for (i = 0; i <= nx; i++) {
        var v = F(gx[i], gy[j]);
        V[j][i] = (typeof v === 'number' && isFinite(v)) ? v : NaN;
      }
    }
    function mix(a, b, va, vb) {
      if (!isFinite(va) || !isFinite(vb) || va === vb) return (a + b) / 2;
      return a + (b - a) * (0 - va) / (vb - va);
    }
    for (j = 0; j < ny; j++) {
      for (i = 0; i < nx; i++) {
        var v00 = V[j][i], v10 = V[j][i + 1], v01 = V[j + 1][i], v11 = V[j + 1][i + 1];
        if (!isFinite(v00) || !isFinite(v10) || !isFinite(v01) || !isFinite(v11)) continue;
        var idx = (v00 > 0 ? 1 : 0) | (v10 > 0 ? 2 : 0) | (v11 > 0 ? 4 : 0) | (v01 > 0 ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        var px0 = gx[i], px1 = gx[i + 1], py0 = gy[j], py1 = gy[j + 1];
        var eB = [mix(px0, px1, v00, v10), py0];
        var eR = [px1, mix(py0, py1, v10, v11)];
        var eT = [mix(px0, px1, v01, v11), py1];
        var eL = [px0, mix(py0, py1, v00, v01)];
        var pairs = {
          1: [eL, eB], 2: [eB, eR], 3: [eL, eR], 4: [eR, eT],
          5: [eL, eT, eB, eR], 6: [eB, eT], 7: [eL, eT], 8: [eT, eL],
          9: [eB, eT], 10: [eB, eR, eT, eL], 11: [eR, eT], 12: [eR, eL],
          13: [eB, eR], 14: [eL, eB]
        }[idx] || [];
        for (var k = 0; k + 1 < pairs.length; k += 2) segs.push([pairs[k], pairs[k + 1]]);
      }
    }
    return segs;
  }

  /* ------------------------------------------------------------------
     4. SVG 组装
     ------------------------------------------------------------------ */
  /* 只用 theme-tokens.css 里**确实存在**的变量（曾误用 --accent，该变量不存在，
     导致颜色回退成黑色）。 */
  var COLORS = {
    brand: 'var(--brand)',      // 主色（深蓝）
    deep: 'var(--brand-deep)',  // 更深
    accent: 'var(--method)',    // 强调（青绿）
    method: 'var(--method)',
    thm: 'var(--thm)',
    ok: 'var(--ok)',
    warn: 'var(--warn)',
    exam: 'var(--exam)',
    ink: 'var(--ink)',
    soft: 'var(--ink-soft)'
  };
  function col(c) { return c ? (COLORS[c] || c) : 'currentColor'; }
  /* 第三个参数是文本内容——早先版本漏了这个参数，导致轴刻度与图内标签全渲染成空文本。 */
  function el(name, attrs, text) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (text !== undefined && text !== null) n.textContent = stripMath(String(text));
    return n;
  }

  /* 可读性底衬：给图内文字加一圈"描边"（paint-order 先描边后填充），
     这样文字压在网格线或曲线上也读得清。用于元素标签，不用于刻度。 */
  var LABEL_ATTRS = {
    'paint-order': 'stroke', stroke: 'var(--bg-elev)', 'stroke-width': 3.2,
    'stroke-linejoin': 'round', 'font-weight': 600
  };
  function labelAttrs(fs, color) {
    var a = {};
    for (var k in LABEL_ATTRS) a[k] = LABEL_ATTRS[k];
    a['font-size'] = fs;
    a.fill = color || 'var(--ink)';
    return a;
  }

  var renderCache = new WeakMap();   // host → { key, svg, spec }
  /* 已渲染的容器集合。WeakMap 不可迭代，无法用它做"全部重绘"，
     因此另存一份 Set（值就是 DOM 节点，节点被移除后不会阻止回收，
     但要靠 isConnected 过滤已脱离文档的节点，见 redrawAll）。 */
  var plotHosts = new Set();
  function specKey(spec, w) {
    try { return w + '|' + JSON.stringify(spec, function (k, v) {
      return (typeof v === 'function') ? String(v) : v; }) + '|' + document.documentElement.getAttribute('data-theme') + document.documentElement.getAttribute('data-mode'); }
    catch (e) { return null; }
  }

  function render(host, spec) {
    spec = spec || {};
    /* 响应式：宽度优先取容器可用宽度（主题区 max-width 由 CSS 控制），
       不足时退回 spec.width；高度按 spec.height / spec.width 的**同一比例**缩放，
       因此几何比例不变、字号随图放大而放大（可读性要求）。 */
    var baseW = spec.width || 560, baseH = spec.height || 280;
    var avail = 0;
    try {
      var cs = getComputedStyle(host);
      avail = Math.round(host.clientWidth
        - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0));
    } catch (e) { avail = 0; }
    if (!avail || avail < 240) avail = baseW;
    if (spec.maxWidth && avail > spec.maxWidth) avail = spec.maxWidth;
    var W = avail, H = Math.round(baseH * avail / baseW);
    /* 文字倍率：随图放大但限幅。子图（spec.__sub）不放大——否则子图文字比父图还大。 */
    var grow = spec.__sub ? 1 : Math.min(1.35, Math.max(1, avail / baseW));
    var TS = (spec.textScale || 1) * grow;

    var pad = spec.padding || { l: 34, r: 14, t: 14, b: 24 };
    var xr = spec.x || [-5, 5], yr = spec.y || [-3, 3];
    /* 图例外置（spec.legendOutside='bottom'）：在画布底部预留一条独立区域放图例。
       用途：像螺旋线那种"图形铺满四角"的图，图例放哪儿都压线（实测），
       放到绘图区之外是唯一稳妥的做法（第 23.2.5 节允许"外置"）。 */
    var legendOutside = (spec.legendOutside === 'bottom') && spec.legend && spec.legend.length;
    var legendBand = legendOutside ? Math.round((spec.legend.length * 15 * TS) + 20 * TS) : 0;
    if (legendBand) H += legendBand;
    var innerW = W - pad.l - pad.r, innerH = H - legendBand - pad.t - pad.b;
    // 数值比例映射：x/y 各自比例尺（几何不变形）
    var sx = innerW / (xr[1] - xr[0]), sy = innerH / (yr[1] - yr[0]);
    var X = function (x) { return pad.l + (x - xr[0]) * sx; };
    var Y = function (y) { return pad.t + (yr[1] - y) * sy; };

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      preserveAspectRatio: 'xMidYMid meet', draggable: 'false',
      'aria-label': spec.aria || '函数图形', class: 'plot' });

    // 背景与网格
    var ax = spec.axes === false ? null : (spec.axes || {});
    if (ax) {
      var noGrid = (ax.x === false) || (ax.y === false);
      var g = el('g', { class: 'plot-grid' + (noGrid ? ' is-off' : ''), stroke: 'currentColor', 'stroke-width': 1, opacity: .16 });
      var stepX = (ax.x && ax.x.step) || niceStep(xr), stepY = (ax.y && ax.y.step) || niceStep(yr);
      var showX = ax.x !== false && ax.x !== undefined ? true : (ax.x !== false);
      var showY = ax.y !== false && ax.y !== undefined ? true : (ax.y !== false);
      if (!noGrid) {
        for (var gx = Math.ceil(xr[0] / stepX) * stepX; gx <= xr[1] + 1e-9; gx += stepX) {
          g.appendChild(el('line', { x1: X(gx), y1: pad.t, x2: X(gx), y2: pad.t + innerH }));
        }
        for (var gy = Math.ceil(yr[0] / stepY) * stepY; gy <= yr[1] + 1e-9; gy += stepY) {
          g.appendChild(el('line', { x1: pad.l, y1: Y(gy), x2: pad.l + innerW, y2: Y(gy) }));
        }
        svg.appendChild(g);
      }
      // 坐标轴：0 在范围内就贴 0 画，否则贴左/下边；两轴重合在角上时只画一条
      var yZeroIn = (ax.y !== false) && yr[0] <= 0 && yr[1] >= 0;
      var xZeroIn = (ax.x !== false) && xr[0] <= 0 && xr[1] >= 0;
      var axisY = yZeroIn ? Y(0) : pad.t + innerH;
      var axisX = xZeroIn ? X(0) : pad.l;
      var corner = Math.abs(axisY - (pad.t + innerH)) < 1 && Math.abs(axisX - pad.l) < 1;
      var a = el('g', { class: 'plot-axis', stroke: 'currentColor', 'stroke-width': 1.4 });
      if (!corner || yZeroIn) a.appendChild(el('line', { x1: pad.l, y1: axisY, x2: pad.l + innerW, y2: axisY }));
      if (!corner || xZeroIn) a.appendChild(el('line', { x1: axisX, y1: pad.t, x2: axisX, y2: pad.t + innerH }));
      svg.appendChild(a);

      // 刻度（**文字始终显示**；轴线贴 0 时数字排在轴的远离数据一侧，避免被轴线穿过）
      var tk = el('g', { class: 'plot-ticks', fill: 'var(--ink-soft)', 'font-size': (10 * TS).toFixed(1), opacity: .9 });
      var tickBelow = yZeroIn ? (Y(0) > pad.t + innerH * 0.62) : true;   // 轴太靠下就把数字放轴上方
      for (gx = (ax.x === false ? Infinity : Math.ceil(xr[0] / stepX) * stepX); gx <= xr[1] + 1e-9; gx += stepX) {
        if (Math.abs(gx) < 1e-9) continue;
        if (xZeroIn && Math.abs(X(gx) - axisX) < 14) continue;           // 太靠近纵轴就不标，避免叠字
        var ty = yZeroIn ? (tickBelow ? Y(0) + 12 : Y(0) - 5) : pad.t + innerH + 12;
        tk.appendChild(el('text', { x: Math.min(Math.max(X(gx), pad.l + 8), pad.l + innerW - 8), y: Math.min(ty, pad.t + innerH + 13), 'text-anchor': 'middle' }, fmt(gx)));
      }
      for (gy = (ax.y === false ? Infinity : Math.ceil(yr[0] / stepY) * stepY); gy <= yr[1] + 1e-9; gy += stepY) {
        if (Math.abs(gy) < 1e-9) continue;
        if (yZeroIn && Math.abs(Y(gy) - axisY) < 12) continue;
        var tx = xZeroIn ? Math.max(X(0) - 9, pad.l + 4) : pad.l - 4;
        tk.appendChild(el('text', { x: tx, y: Y(gy) + 3.5, 'text-anchor': 'end' }, fmt(gy)));
      }
      svg.appendChild(tk);
      // 轴名：避开刻度数字（x 名贴右下角外侧，y 名贴左上角上方）
      if (ax.x && ax.x.label) svg.appendChild(el('text',
        { x: pad.l + innerW - 2, y: pad.t + innerH + 24, fill: 'var(--ink-faint)',
          'font-size': (11.5 * TS).toFixed(1), 'font-style': 'italic', 'font-weight': 600,
          'text-anchor': 'end', class: 'plot-axis-name' }, ax.x.label));
      if (ax.y && ax.y.label) svg.appendChild(el('text',
        { x: Math.max(pad.l + 6, (xZeroIn ? X(0) : pad.l) + 8), y: pad.t + 8, fill: 'var(--ink-faint)',
          'font-size': (11.5 * TS).toFixed(1), 'font-style': 'italic', 'font-weight': 600,
          class: 'plot-axis-name' }, ax.y.label));
    }

    // 参数作用域
    var scope = {};
    var params = spec.params || {};
    for (var k in params) scope[k] = (params[k] && params[k].value !== undefined) ? params[k].value : params[k];

    if (spec.verify !== false) verify(spec);   // 准确性校验（默认开启）

    /* 渲染缓存：同一容器 + 同一 spec + 同一宽度 + 同一主题 → 不重算。
       拖动侧栏或窗口缩放时会反复触发 render，没有这层缓存会明显卡顿。 */
    var key = specKey(spec, avail);
    var cached = renderCache.get(host);
    if (key && cached && cached.key === key && host.contains(cached.svg)) return cached.svg;

    /* z 层级：参考线/区域在下，曲线在中，标记与文字在上。
       这样虚线永远不会盖住主曲线，主次一眼可分。 */
    var LAYERS = { region: 0, guide: 1, curve: 2, mark: 3, label: 4 };
    var layerOf = function (e) {
      if (e.z !== undefined) return e.z;                     // 允许 spec 覆盖
      switch (e.type) {
        case 'region': case 'rect': case 'polygon': return LAYERS.region;
        case 'fn': case 'param': case 'implicit':
          return (e.dash || e.role === 'guide') ? LAYERS.guide : LAYERS.curve;
        case 'point': case 'vector': case 'segment':
          return (e.role === 'guide') ? LAYERS.guide : LAYERS.mark;
        case 'label': return LAYERS.label;
      }
      return LAYERS.curve;
    };
    /* 图例（可选）：spec.legend = [{c:'brand', t:'y=f(x)'}, {c:'method', t:'参考线', dash:true}]
       解决"图里两条线、两个标注分不清谁是谁"的问题；文字仍用底衬保证可读。 */
    /* 图例（第 23.2.5 节：图例不得遮挡曲线与关键标注）。
       旧实现把图例固定在右下角，实测多幅图里它正好压住曲线（如 fig-helix 压住投影虚线）。
       现在改为**自动选位**：把绘图区四角各当作候选位，按"该角内已绘制内容最少"来选。
       内容密度用一个离屏 canvas 对已画好的 svg 采样统计——不引入任何视觉副作用。
       可用 spec.legendPos = 'tl'|'tr'|'bl'|'br' 强制指定。 */
    // 子图模式下父级只作布局容器，不画元素。**用局部变量控制，绝不改写 spec**
    // （曾经写 spec.elements = []，导致 ResizeObserver 重绘时 elements 已空、
    //   子图整幅变白——2026-09-17 排查到的真 bug）。
    var drawParents = !(spec.panels && spec.panels.length);
    // e.panel 只在**父级有 panels 时**用于分配子图；普通渲染一律画全部元素
    var order = (drawParents ? (spec.elements || []) : [])
      .map(function (e, i) { return { e: e, i: i, z: layerOf(e) }; })
      .sort(function (a, b) { return a.z - b.z || a.i - b.i; });
    var drawnBoxes = [];    /* 供图例自动选位统计"哪里已经被画过" */
    order.forEach(function (o) {
      var before = svg.childNodes.length;
      drawElement(svg, o.e, { X: X, Y: Y, xr: xr, yr: yr, W: W, H: H, pad: pad,
        innerW: innerW, innerH: innerH, scope: scope, sx: sx, sy: sy, spec: spec, TS: TS,
        x0: xr[0], x1: xr[1], y0: yr[0], y1: yr[1] });
      /* 取这次新增节点的并集包围盒（userSpace 坐标，与 pad/innerW 同一坐标系） */
      var bb = null;
      for (var ci = before; ci < svg.childNodes.length; ci++) {
        var nd = svg.childNodes[ci];
        if (!nd.getBBox) continue;
        try {
          var r = nd.getBBox();
          if (!r || (r.width === 0 && r.height === 0)) continue;
          bb = bb ? { x: Math.min(bb.x, r.x), y: Math.min(bb.y, r.y),
                      x2: Math.max(bb.x2, r.x + r.width), y2: Math.max(bb.y2, r.y + r.height) }
                  : { x: r.x, y: r.y, x2: r.x + r.width, y2: r.y + r.height };
        } catch (e) { /* 某些节点量不到，跳过 */ }
      }
      if (bb) drawnBoxes.push({ x: bb.x, y: bb.y, w: bb.x2 - bb.x, h: bb.y2 - bb.y });
    });
    spec.__drawnBoxes = drawnBoxes;   /* 传给下面的图例选位（局部变量跨不过去） */

    if (spec.legend && spec.legend.length) {
      var lgPad = 8 * TS, lineH = 15 * TS;
      var maxW = 0;
      spec.legend.forEach(function (it) {
        var w = String(it.t).length * 11.5 * TS + 26 * TS;
        if (w > maxW) maxW = w;
      });
      var boxW = maxW + lgPad, boxH = spec.legend.length * lineH + lgPad;
      var pos = spec.legendOutside === 'bottom' ? 'outside' : spec.legendPos;
      var lx, ly;
      if (pos === 'outside') {
        lx = pad.l + 4;
        ly = H - legendBand + Math.round(6 * TS);
      } else if (!pos) {
        /* 四角候选：按内容密度（非背景像素比例）挑最空的一角 */
        /* 候选位：四角 + 左侧中部 + 右侧中部。
           只给四角时，像螺旋线这种"上下两个穹顶、中间空"的图，
           四个角都被弧线占着，图例放哪儿都压线（实测 fig-helix）；
           加中部两个候选后可选到真正空的那块。 */
        var midY = pad.t + (innerH - boxH) / 2;
        var cand = [
          { k: 'tl', x: pad.l + 4, y: pad.t + 4 },
          { k: 'tr', x: pad.l + innerW - boxW - 4, y: pad.t + 4 },
          { k: 'bl', x: pad.l + 4, y: pad.t + innerH - boxH - 4 },
          { k: 'br', x: pad.l + innerW - boxW - 4, y: pad.t + innerH - boxH - 4 },
          { k: 'ml', x: pad.l + 4, y: midY },
          { k: 'mr', x: pad.l + innerW - boxW - 4, y: midY }
        ];
        var dens = drawnBoxes;
        var tboxes = [];
        svg.querySelectorAll('text').forEach(function (t) {
          if ((t.getAttribute('class') || '').indexOf('plot-axis-name') >= 0) return;
          /* ⚠️ 必须排除图例自身的文字与底衬：选位前图例已经挂在 svg 上，
             不排除就会"自己挡自己"，每个候选位都被判为占用（实测 13 处假重叠）。 */
          if (t.closest && t.closest('.plot-legend')) return;
          try {
            var r = t.getBBox();
            if (r.width || r.height) tboxes.push({ x: r.x, y: r.y, w: r.width, h: r.height });
          } catch (e) { /* 量不到就跳过 */ }
        });
        var best = null, bestV = Infinity;
        cand.forEach(function (c) {
          /* 压到任何文字（刻度或标注）的候选位重罚——
             文字与图例都不能移动，只能换位置；曲线被压虽不理想，
             但比"字压字"轻得多（第 23.2 节把文字重叠列为最严重项）。 */
          var v = occupancy(dens, c.x, c.y, boxW, boxH)
                + 4 * occupancy(tboxes, c.x, c.y, boxW, boxH);
          if (v < bestV) { bestV = v; best = c; }
        });
        /* 只有找到"完全空白"的位置才落在绘图区内。
           否则（图形铺满，如螺旋线、泰勒逼近）图例和标注都会压线：
           图例与标注两者都不能移动，包围盒判据又过于保守，
           此时把图例放到绘图区之外最稳妥（第 23.2.5 节允许外置）。 */
        if (bestV <= 0.001) {
          pos = best.k;
        } else {
          legendOutside = 'bottom';
          legendBand = Math.round((spec.legend.length * 15 * TS) + 20 * TS);
          H += legendBand;
          innerH = H - legendBand - pad.t - pad.b;
          spec.__heightChanged = H;
          pos = 'outside';
        }
      }
      if (pos !== 'outside') {
        var right = (pos === 'tr' || pos === 'br' || pos === 'mr');
        var bottom = (pos === 'bl' || pos === 'br');
        var middle = (pos === 'ml' || pos === 'mr');
        lx = right ? pad.l + innerW - maxW - lgPad : pad.l + lgPad;
        ly = middle ? pad.t + (innerH - spec.legend.length * lineH) / 2
             : bottom ? pad.t + innerH - spec.legend.length * lineH - lgPad
             : pad.t + lgPad;
      }
      var lg = el('g', { class: 'plot-legend' });
      lg.appendChild(el('rect', { x: lx - lgPad / 2, y: ly - lgPad / 2,
        width: maxW + lgPad, height: spec.legend.length * lineH + lgPad,
        rx: 4, fill: 'var(--bg-elev)', opacity: .92, stroke: 'var(--line)', 'stroke-width': 1 }));
      spec.legend.forEach(function (it, k) {
        var y = ly + k * lineH + lineH * .62;
        lg.appendChild(el('line', { x1: lx, y1: y, x2: lx + 18 * TS, y2: y,
          stroke: col(it.c), 'stroke-width': it.dash ? 1.4 : 2.2,
          'stroke-dasharray': it.dash ? '4 3' : null, 'stroke-linecap': 'round' }));
        var ta = labelAttrs((11.5 * TS).toFixed(1), 'var(--ink)');
        ta.x = lx + 24 * TS; ta.y = y + 4 * TS;
        ta.stroke = 'none';
        lg.appendChild(el('text', ta, it.t));
      });
      svg.appendChild(lg);
    }


    host.innerHTML = '';
    host.appendChild(svg);
    if (spec.params && Object.keys(spec.params).length) buildControls(host, spec, svg, params);

    /* 文字防重叠（第 23.2 节）。
       ⚠️ 必须放在 host.appendChild(svg) **之后**：元素未挂载时
       getBoundingClientRect() 全返回 0，碰撞检测会一个都测不到（第一版就踩了这个坑）。
       再用 rAF 等一帧布局，尺寸才真实。子图模式由父级统一处理。 */
    if (!spec.__sub && spec.overlapFix !== false) {
      var _svg = svg;
      window.requestAnimationFrame(function () {
        try { resolveTextOverlaps(_svg); } catch (err) { /* 忽略测量失败 */ }
      });
    }

    /* 容器宽度变化（浏览器缩放、侧栏拖动、旋转屏幕）时按新宽度重绘，
       保证文字随图放大、几何比例不变。用 rAF 合并连续触发。 */
    /* 子图：spec.panels = [{x, y, title, spec}]，每个子图继承父 spec 的参数与主题，
       在自己的矩形区域内独立映射坐标。服务"四类间断点""最值/介值"这类并排图。 */
    if (spec.panels && spec.panels.length) {
      // 子图共用父级的 elements。**先把父级元素取出备份**——
      // 曾经在循环里清空 spec.elements，导致第二个子图拿不到元素、画成空白。
      var sharedElements = spec.elements || [];
      spec.panels.forEach(function (pn, pnIndex) {
        pn = Object.assign({}, pn, { index: pnIndex });
        /* 子图几何：**先按父图的实际尺寸算出子图矩形**，再把这个矩形作为子 spec 的
           width/height 传下去。宿主是游离 div，clientWidth 为 0，render 会回退到
           spec.width —— 若传的是"已减半"的值，会被再减半一次（曾经画成空白）。 */
        var pw = Math.max(80, (pn.w || 0.5) * W);
        var ph = Math.max(60, (pn.h || 0.5) * H);
        var px = pn.x * W, py = pn.y * H;
        var sub = Object.assign({}, spec, {
          panels: null, legend: null, width: pw, height: ph, maxWidth: null,
          elements: pn.elements || sharedElements.filter(function (e) {
            return e.panel === undefined || e.panel === pn.index; }),
          x: pn.xr || spec.x, y: pn.yr || spec.y,
          padding: pn.padding || { l: 30, r: 22, t: 24, b: 22 },
          __sub: true
        });
        var subSvg = render(document.createElement('div'), sub);
        /* 子图内容**不平移**：clipPath 用 userSpaceOnUse，坐标必须是父级坐标系，
           所以把子图内容放进一个 translate 到 (px,py) 的组；裁剪矩形则用
           相对该组的 0..pw / 0..ph。（曾经两处都用父坐标，导致裁剪整体偏移失效。） */
        var gx = el('g', { transform: 'translate(' + px.toFixed(1) + ',' + py.toFixed(1) + ')' });
        while (subSvg.firstChild) gx.appendChild(subSvg.firstChild);
        /* 用**子图自身的 viewBox**做裁剪窗口：新建一个同尺寸的 svg 承载子图内容，
           天然裁掉溢出部分。早先按父图尺寸手算 inset，把子图整个裁没了。 */
        /* 用 <g> + clipPath 裁剪（不用嵌套 <svg>：headless 下嵌套 svg 不参与渲染，
           排查时表现为"曲线在 DOM 里但看不见"）。 */
        /* id 必须全局唯一（同页多幅图会撞名），并用 setAttributeNS 显式设 SVG 命名空间。
           早先用 setAttribute 设 id，clipPath 在 DOM 里却**不生效**，表现为
           子图内容（坐标轴、刻度）溢出到相邻子图上。 */
        var clipId = 'plotclip-' + (window.__plotSeq = (window.__plotSeq || 0) + 1);
        var cp = el('clipPath', {});
        cp.setAttributeNS(null, 'id', clipId);
        cp.setAttributeNS(null, 'clipPathUnits', 'userSpaceOnUse');
        cp.appendChild(el('rect', { x: px.toFixed(1), y: py.toFixed(1),
          width: pw.toFixed(1), height: ph.toFixed(1) }));
        // 说明：clipPath 是 userSpaceOnUse（父坐标），gx 已平移到 (px,py)，
        // 故矩形的 (px,py,pw,ph) 恰好覆盖该子图区域。
        var defs = svg.querySelector('defs');
        if (!defs) { defs = el('defs', {}); svg.insertBefore(defs, svg.firstChild); }
        defs.appendChild(cp);
        var g6 = el('g', { class: 'plot-subpanel' });
        g6.setAttributeNS(null, 'clip-path', 'url(#' + clipId + ')');
        /* 兜底遮罩：先铺一层与页面底色相同的矩形，把相邻子图溢出的线条盖住。
           clipPath 在部分渲染器上不稳定，这一层保证视觉上互不干扰。 */
        g6.appendChild(el('rect', { x: px.toFixed(1), y: py.toFixed(1),
          width: pw.toFixed(1), height: ph.toFixed(1), fill: 'var(--bg-elev)' }));
        g6.appendChild(gx);
        g6.appendChild(el('rect', { x: px.toFixed(1), y: py.toFixed(1), width: pw.toFixed(1),
          height: ph.toFixed(1), fill: 'none', stroke: 'var(--line)', 'stroke-width': 1, rx: 4 }));
        svg.appendChild(g6);
        // 标题画在**父级**：若画在 g6 内会被 clipPath 裁掉（右图标题曾经被切一半）
        if (pn.title) {
          var ta3 = labelAttrs((11.5 * TS).toFixed(1), 'var(--ink)');
          ta3.x = px + 10; ta3.y = py + 14; ta3.stroke = 'none';
          svg.appendChild(el('text', ta3, pn.title));
        }
      });
    }

    renderCache.set(host, { key: key, svg: svg, spec: spec });
    plotHosts.add(host);
    if (!host.__plotResize && typeof ResizeObserver === 'function') {
      var last = W, timer = null;
      host.__plotResize = new ResizeObserver(function () {
        /* 侧栏拖动期间一律跳过：此时宽度每帧都在变，重绘既看不见（图表被压扁）
           又极耗 CPU（本页可能有 9 幅图，每幅都要重建 SVG 与上千个 MathJax 公式节点）。
           松手后由 Plot.redrawAll() 统一重绘一次。 */
        if (resizePaused) return;
        var w = Math.round(host.clientWidth);
        if (!w || Math.abs(w - last) < 6) return;
        last = w;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { render(host, spec); }, 120);
      });
      host.__plotResize.observe(host);
    }
    return svg;
  }

  /* 图例选位用的"内容占用"统计。
     做法：把每个已绘制元素的包围盒换算成屏幕坐标，统计它与候选图例框的重叠面积占比。
     ⚠️ 不要用"栅格化 svg 再采样像素"的做法：Image 解码是异步的，
     首次渲染时 img.complete 还是 false，统计恒为 0，等于没做选位（第一版就踩了这个坑）。 */
  function occupancy(boxes, x, y, w, h) {
    if (!boxes || !boxes.length) return 0;
    var area = w * h, hit = 0;
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var ox = Math.min(x + w, b.x + b.w) - Math.max(x, b.x);
      var oy = Math.min(y + h, b.y + b.h) - Math.max(y, b.y);
      if (ox > 0 && oy > 0) hit += ox * oy;
    }
    return Math.min(1, hit / area);
  }

  /* 文字防重叠（第 23.2 节要求）。
     整幅图画完后统一做一次碰撞消解，避免"数字压数字、轴名压刻度"。
     优先级：用户标注(2) > 刻度(1) > 坐标轴名(0)；让优先级低的一方沿 y 让位。
     ⚠️ 位置判定必须用 getBoundingClientRect（屏幕绝对坐标）：
     刻度在 <g class="plot-ticks"> 里、标注是 svg 的直接子节点，
     用 getBBox 会拿到各自坐标系里的值，互相比较毫无意义（第一版就踩了这个坑）。
     只改文字位置，不动任何图形、数值与文案。 */
  function resolveTextOverlaps(svg) {
    var all = [];
    Array.prototype.forEach.call(svg.querySelectorAll('text'), function (t) {
      var txt = (t.textContent || '').trim();
      if (!txt) return;
      var inTicks = !!(t.parentNode && t.parentNode.getAttribute &&
                       (t.parentNode.getAttribute('class') || '').indexOf('plot-ticks') >= 0);
      var isName = (t.getAttribute('class') || '').indexOf('plot-axis-name') >= 0;
      /* 三类文字都参与碰撞检测，优先级不同：
           轴名(0) < 刻度(1) < 用户标注(2，只当障碍、不让位)。
         第一版把用户标注排除在检测之外，于是"标注压刻度"永远测不出来（实测漏掉 16 处）。 */
      var r = t.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      var pr = isName ? 0 : (inTicks ? 1 : 2);
      all.push({ el: t, pr: pr, movable: pr < 2, base: r, txt: txt });
    });
    if (all.length < 2) return;
    function cur(n) {
      var r = n.el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    }
    function hit(a, b) {
      return a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
    }
    var moved = 0;
    /* 让位搜索：0 → 向下 8/16/…/64 → 向上 8/16/…/64（单位 px）。
       刻度/轴名数量不多，逐个试到不撞为止；试完仍撞就保持原样。
       第一版只试 6 步 ×4px，范围不够，仍留下 16 处碰撞（实测）。 */
    var OFFS = [0];
    for (var s1 = 1; s1 <= 8; s1++) OFFS.push(s1 * 8);
    for (var s2 = 1; s2 <= 8; s2++) OFFS.push(-s2 * 8);
    function tryOffsets(low, hi) {
      var y0 = parseFloat(low.el.getAttribute('y') || '0');
      for (var t = 0; t < OFFS.length; t++) {
        low.el.setAttribute('y', y0 + OFFS[t]);
        if (!hit(cur(low), cur(hi))) return true;
      }
      low.el.setAttribute('y', y0);
      return false;
    }
    for (var i2 = 0; i2 < all.length; i2++) {
      for (var j2 = i2 + 1; j2 < all.length; j2++) {
        var A = all[i2], B = all[j2];
        if (!hit(cur(A), cur(B))) continue;
        var low = A.pr <= B.pr ? A : B;         // pr 小的让位（刻度让标注、轴名让刻度）
        var hi = low === A ? B : A;
        if (!low.movable) continue;             // 标注不让位（两个标注相撞保持原样）
        if (tryOffsets(low, hi)) moved++;
      }
    }
    return moved;
  }

  function drawElement(svg, e, ctx) {
    var X = ctx.X, Y = ctx.Y, color = col(e.color), TS = ctx.TS || 1;
    var g, i;
    if (e.type === 'fn') {
      var f = compile(e.of);
      // 默认铺满整个 x 轴（原来靠手填 from/to，容易停在半路、对不齐边框）
      var lo = (e.from !== undefined) ? e.from : ctx.xr[0];
      var hi = (e.to !== undefined) ? e.to : ctx.xr[1];
      var yTop = Math.max(Math.abs(ctx.yr[0]), Math.abs(ctx.yr[1]));
      var fEval = function (x) { return f(Object.assign({}, ctx.scope, { x: x })); };
      var raw;
      if (e.logSample) {
        /* 奇点振荡（如 sin(1/x)）：沿 x **均匀**采样必然混叠成竖线团，
           而几何采样又极易取错方向、把点全挤到一处（已踩）。
           稳妥做法：**显式取两组点**——一组均匀覆盖全区间（保证两端波形清楚），
           一组在奇点近旁按 1/k 的零点节奏取样（保证中心振荡有形态而不是一团黑）。 */
        var sing = (e.singularAt === undefined) ? 0 : e.singularAt;
        var N = e.samples || 1200;
        var acc = [];
        // ① 均匀覆盖
        for (var i3 = 0; i3 <= N; i3++) {
          var x1 = lo + (hi - lo) * i3 / N;
          var y1 = fEval(x1);
          if (typeof y1 === 'number' && isFinite(y1)) acc.push([x1, y1]);
        }
        // ② 奇点近旁：按 sin(1/x) 的零点 x = ±1/(kπ/2) 取样，k 从大到小
        var kmax = e.oscK || 60;
        for (var k2 = kmax; k2 >= 1; k2--) {
          [1, -1].forEach(function (sgn) {
            var xk = sing + sgn / (k2 * Math.PI / 2);
            if (xk < Math.min(lo, hi) || xk > Math.max(lo, hi)) return;
            var yk = fEval(xk);
            if (typeof yk === 'number' && isFinite(yk)) acc.push([xk, yk]);
          });
        }
        acc.sort(function (p4, q4) { return p4[0] - q4[0]; });
        raw = [acc];
      } else {
        raw = sample(fEval, lo, hi, { range: Math.max(50, yTop * 20) });
      }
      // 按 y 的可见范围裁剪：超出的段丢掉，跨越边界的按弦切到边界上
      var yLo = ctx.yr[0], yHi = ctx.yr[1], segs = [];
      raw.forEach(function (s) {
        var cur = [];
        for (var i = 0; i < s.length; i++) {
          var x = s[i][0], y = s[i][1];
          var inside = y >= yLo && y <= yHi;
          if (inside) { cur.push([x, y]); continue; }
          if (cur.length) {
            var p = s[i - 1], t = (yHi - p[1]) / ((y - p[1]) || 1e-9);
            t = Math.max(0, Math.min(1, t));
            cur.push([p[0] + (x - p[0]) * t, p[1] + (y - p[1]) * t]);
            if (cur.length > 1) segs.push(cur);
            cur = [];
          }
        }
        if (cur.length > 1) segs.push(cur);
      });
      g = el('g', { class: 'plot-fn' });
      segs.forEach(function (s) {
        var d = s.map(function (p, k) { return (k ? 'L' : 'M') + X(p[0]).toFixed(2) + ' ' + Y(p[1]).toFixed(2); }).join(' ');
        var w = e.width || ((e.dash || e.role === 'guide') ? 1.2 : 2.2);
        g.appendChild(el('path', { d: d, fill: 'none', stroke: color, 'stroke-width': w,
          'stroke-dasharray': e.dash ? '4 3' : null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      });
      svg.appendChild(g);
      return;
    }
    if (e.type === 'poly') {
      /* 显式点序列折线：e.pts 是**数据坐标**的点数组（可用 to2() 把三维投影点填进来）。
         服务参数曲线、投影圆、任意散点折线——这些用 fn 或 param 表达式都写不出来。
         与 seq 的区别：seq 是一元函数取样，poly 是完全自由的点列。 */
      var gp = el('g', { class: 'plot-poly' });
      var d5 = (e.pts || []).map(function (p, k) {
        return (k ? 'L' : 'M') + X(p[0]).toFixed(2) + ' ' + Y(p[1]).toFixed(2);
      }).join(' ');
      if (e.closed) d5 += ' Z';
      gp.appendChild(el('path', { d: d5, fill: e.fill || 'none', stroke: e.strokeColor || color,
        'stroke-width': e.width || (e.dash ? 1.2 : 2.2),
        'stroke-dasharray': e.dash ? '4 3' : null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      svg.appendChild(gp);
      return;
    }
    if (e.type === 'param') {
      var fx = compile(e.x), fy = compile(e.y);
      var t0 = (e.t && e.t[0]) || 0, t1 = (e.t && e.t[1]) || 1;
      var pts = [], N = e.samples || 220;
      for (i = 0; i <= N; i++) {
        var t = t0 + (t1 - t0) * i / N;
        var sc = Object.assign({}, ctx.scope, { t: t });
        var px = fx(sc), py = fy(sc);
        if (isFinite(px) && isFinite(py)) pts.push([px, py]);
      }
      g = el('g', { class: 'plot-param' });
      g.appendChild(el('path', { d: pts.map(function (p, k) { return (k ? 'L' : 'M') + X(p[0]).toFixed(2) + ' ' + Y(p[1]).toFixed(2); }).join(' '),
        fill: e.fill || 'none', stroke: color, 'stroke-width': e.width || ((e.dash) ? 1.2 : 2.2), 'stroke-dasharray': e.dash ? '4 3' : null }));
      svg.appendChild(g);
      return;
    }
    if (e.type === 'implicit') {
      var F = compile(e.eq.indexOf('=') >= 0 ? eqToZero(e.eq) : e.eq);
      var sc0 = Object.assign({}, ctx.scope, e.scope || {});
      var nx = e.nx || 160, ny = e.ny || 120;
      var segs2 = marchingSquares(function (x, y) {
        var sc = Object.assign({}, sc0, { x: x, y: y });
        try { return F(sc); } catch (err) { return NaN; }
      }, ctx.xr[0], ctx.xr[1], ctx.yr[0], ctx.yr[1], nx, ny);
      g = el('g', { class: 'plot-implicit' });
      var d2 = segs2.map(function (s) {
        return 'M' + X(s[0][0]).toFixed(2) + ' ' + Y(s[0][1]).toFixed(2) + 'L' + X(s[1][0]).toFixed(2) + ' ' + Y(s[1][1]).toFixed(2);
      }).join(' ');
      g.appendChild(el('path', { d: d2, fill: 'none', stroke: color, 'stroke-width': e.width || 2,
        'stroke-dasharray': e.dash ? '5 4' : null, 'stroke-linecap': 'round' }));
      svg.appendChild(g);
      return;
    }
    if (e.type === 'region') {
      var fa = compile(e.between[0]), fb = compile(e.between[1]);
      var r0 = e.from !== undefined ? e.from : ctx.xr[0], r1 = e.to !== undefined ? e.to : ctx.xr[1];
      var N2 = 200, top = [], bot = [];
      for (i = 0; i <= N2; i++) {
        var xx = r0 + (r1 - r0) * i / N2;
        var s2 = Object.assign({}, ctx.scope, { x: xx });
        top.push([xx, fb(s2)]); bot.push([xx, fa(s2)]);
      }
      var d3 = 'M' + top.map(function (p) { return X(p[0]).toFixed(2) + ' ' + Y(p[1]).toFixed(2); }).join('L')
        + 'L' + bot.reverse().map(function (p) { return X(p[0]).toFixed(2) + ' ' + Y(p[1]).toFixed(2); }).join('L') + 'Z';
      svg.appendChild(el('path', { d: d3, fill: color, opacity: e.opacity || .14, stroke: 'none', class: 'plot-region' }));
      return;
    }
    if (e.type === 'seq') {
      /* 数列散点：由表达式自动算坐标，避免手填（手填出过"该单调递减却出现回升"的错）。 */
      var seqLink = [];                    // 需要连线的点，最后统一画成一条 path
      var fq = compile(e.of);
      var n0 = (e.n && e.n[0]) || 1, n1 = (e.n && e.n[1]) || 10;
      var g2 = el('g', { class: 'plot-seq' });
      for (var k = n0; k <= n1; k++) {
        var sck = Object.assign({}, ctx.scope, { n: k, i: k });
        var yv = fq(sck);
        if (!isFinite(yv)) continue;
        // 若声明了 y，则把数列值当作**相对基准线的高度偏移**（用于"点落在数轴上"的图）
        if (e.y !== undefined) {
          var by = e.y + (e.scale === undefined ? 1 : e.scale) * yv;
          g2.appendChild(el('circle', { cx: X(k), cy: Y(by), r: e.r || 4,
            fill: col2, stroke: col2, 'stroke-width': 1.4 }));
          continue;
        }
        var inside = yv >= ctx.yr[0] && yv <= ctx.yr[1];
        if (!inside) continue;
        var col2 = e.colorAt ? col(e.colorAt(k)) : color;
        if (e.link) seqLink.push([k, yv]);
        g2.appendChild(el('circle', { cx: X(k), cy: Y(yv), r: e.r || 4, fill: col2, stroke: col2, 'stroke-width': 1.4 }));
      }
      /* 连线用**一条 path** 而不是逐点 line：振荡密集处 line 段会糊成实心块；
         path 更细、更连续，观感接近真实曲线。 */
      if (seqLink.length > 1) {
        g2.appendChild(el('path', { d: seqLink.map(function (p2, i2) {
            return (i2 ? 'L' : 'M') + X(p2[0]).toFixed(2) + ' ' + Y(p2[1]).toFixed(2);
          }).join(' '), fill: 'none', stroke: color, 'stroke-width': e.linkWidth || 1.2,
          opacity: e.linkOpacity === undefined ? 0.5 : e.linkOpacity, 'stroke-linejoin': 'round' }));
      }
      svg.appendChild(g2);
      return;
    }
    if (e.type === 'numberline') {
      /* 数轴：一行刻度 + 可选的"限制区间"高亮条。
         服务第 1 章的"四行数轴""数列点落在数轴上"这类图（原先靠手算坐标拼 path）。 */
      var y = Y(e.at === undefined ? 0 : e.at);
      var a = (e.from === undefined) ? ctx.xr[0] : e.from;
      var b = (e.to === undefined) ? ctx.xr[1] : e.to;
      var g3 = el('g', { class: 'plot-numberline' });
      g3.appendChild(el('line', { x1: X(a), y1: y, x2: X(b), y2: y,
        stroke: 'var(--ink)', 'stroke-width': 1.3 }));
      // 端点箭头
      [[a, -1], [b, 1]].forEach(function (p) {
        g3.appendChild(el('path', { d: 'M' + X(p[0]) + ' ' + y + 'l' + (6 * p[1]) + ' -3.2' +
          'M' + X(p[0]) + ' ' + y + 'l' + (6 * p[1]) + ' 3.2',
          fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.3 }));
      });
      // 区间高亮条（限制区间）
      (e.bands || []).forEach(function (bd) {
        var c = col(bd.color || 'method');
        g3.appendChild(el('rect', { x: X(bd.from), y: y - 5, width: X(bd.to) - X(bd.from), height: 10,
          fill: c, opacity: bd.opacity === undefined ? 0.22 : bd.opacity, rx: 2 }));
        if (bd.label) {
          var la2 = labelAttrs((11 * TS).toFixed(1), c);
          la2.x = (X(bd.from) + X(bd.to)) / 2; la2.y = y - 10;
          la2['text-anchor'] = 'middle';
          g3.appendChild(el('text', la2, bd.label));
        }
      });
      // 刻度
      ((e.ticks === undefined) ? [] : e.ticks).forEach(function (t) {
        g3.appendChild(el('line', { x1: X(t), y1: y - 4, x2: X(t), y2: y + 4,
          stroke: 'var(--ink)', 'stroke-width': 1.2 }));
        var ta2 = { x: X(t), y: y + 15, fill: 'var(--ink-soft)', 'font-size': (10.5 * TS).toFixed(1),
          'text-anchor': 'middle' };
        g3.appendChild(el('text', ta2, (typeof t === 'number') ? fmt(t) : t));
      });
      // 挖掉的点（空心圆）
      (e.holes || []).forEach(function (h) {
        g3.appendChild(el('circle', { cx: X(h), cy: y, r: 3.6, fill: 'var(--bg-elev)',
          stroke: e.holeColor ? col(e.holeColor) : color, 'stroke-width': 1.8 }));
      });
      svg.appendChild(g3);
      return;
    }
    if (e.type === 'arrow') {
      /* 映射箭头：从 (ax, ay) 到 (bx, by)。x/y 用各自的比例尺，
         不要求是函数关系，因此映射示意图、对应关系图都能画。 */
      var A2 = e.from, B2 = e.to, c2 = col(e.color || 'soft');
      var x1 = X(A2[0]), y1 = Y(A2[1]), x2 = X(B2[0]), y2 = Y(B2[1]);
      var g4 = el('g', { class: 'plot-arrow' });
      g4.appendChild(el('line', { x1: x1, y1: y1, x2: x2, y2: y2,
        stroke: c2, 'stroke-width': e.width || 1.4, 'stroke-dasharray': e.dash ? '4 3' : null }));
      var ang2 = Math.atan2(y2 - y1, x2 - x1), L2 = e.head || 7;
      g4.appendChild(el('path', { d: 'M' + (x2 - L2 * Math.cos(ang2 - 0.4)).toFixed(1) + ' ' +
        (y2 - L2 * Math.sin(ang2 - 0.4)).toFixed(1) + 'L' + x2.toFixed(1) + ' ' + y2.toFixed(1) +
        'L' + (x2 - L2 * Math.cos(ang2 + 0.4)).toFixed(1) + ' ' + (y2 - L2 * Math.sin(ang2 + 0.4)).toFixed(1),
        fill: 'none', stroke: c2, 'stroke-width': e.width || 1.4 }));
      svg.appendChild(g4);
      return;
    }
    if (e.type === 'bars') {
      /* 黎曼和矩形：在 [from,to] 上分 n 份，第 i 个矩形的高取 sampleAt
         （'right' 右端点 / 'left' 左端点 / 'mid' 中点）。服务定积分定义、
         元素法这类"以直代曲"的图。 */
      var fa = compile(e.of);
      var b0 = (e.from === undefined) ? ctx.xr[0] : e.from;
      var b1 = (e.to === undefined) ? ctx.xr[1] : e.to;
      var nb = e.n || 4;
      var at = e.sampleAt || 'right';
      var gb = el('g', { class: 'plot-bars' });
      for (var bi = 0; bi < nb; bi++) {
        var xa = b0 + (b1 - b0) * bi / nb;
        var xb = b0 + (b1 - b0) * (bi + 1) / nb;
        var xs = at === 'left' ? xa : at === 'mid' ? (xa + xb) / 2 : xb;
        var hb = fa(Object.assign({}, ctx.scope, { x: xs }));
        if (typeof hb !== 'number' || !isFinite(hb)) continue;
        gb.appendChild(el('rect', { x: X(xa), y: Y(Math.max(hb, 0)), width: Math.max(0, X(xb) - X(xa)),
          height: Math.abs(Y(hb) - Y(0)), fill: color,
          opacity: e.opacity === undefined ? 0.22 : e.opacity,
          stroke: col(e.strokeColor || e.color), 'stroke-width': 1 }));
      }
      svg.appendChild(gb);
      return;
    }
    if (e.type === 'field') {
      /* 方向场（斜率场）：在网格点上画一小段斜率为 f(x,y) 的线段。
         服务 §7.1 微分方程的基本概念——解曲线"顺着场走"这件事文字最难讲清。 */
      var ff = compile(e.of);
      var nx = e.nx || 15, ny = e.ny || 11;
      var len = e.len === undefined ? 0.42 : e.len;
      var gf = el('g', { class: 'plot-field', stroke: color, 'stroke-width': e.width || 1.1,
        'stroke-linecap': 'round', opacity: e.opacity === undefined ? 0.42 : e.opacity });
      for (var fi = 0; fi <= nx; fi++) {
        var fx = ctx.xr[0] + (ctx.xr[1] - ctx.xr[0]) * fi / nx;
        for (var fj = 0; fj <= ny; fj++) {
          var fy = ctx.yr[0] + (ctx.yr[1] - ctx.yr[0]) * fj / ny;
          var sl = ff(Object.assign({}, ctx.scope, { x: fx, y: fy }));
          if (typeof sl !== 'number' || !isFinite(sl)) continue;
          var ang = Math.atan(sl);
          var hx = Math.cos(ang) * len / 2, hy = Math.sin(ang) * len / 2;
          gf.appendChild(el('line', {
            x1: X(fx - hx), y1: Y(fy - hy), x2: X(fx + hx), y2: Y(fy + hy) }));
        }
      }
      svg.appendChild(gf);
      return;
    }
    if (e.type === 'point') {
      var p = e.at;
      g = el('g', { class: 'plot-point' });
      var hollow = e.hollow;
      g.appendChild(el('circle', { cx: X(p[0]), cy: Y(p[1]), r: e.r || 4,
        fill: hollow ? 'var(--bg-elev)' : color, stroke: color, 'stroke-width': 1.6 }));
      if (e.label) g.appendChild(el('text', { x: X(p[0]) + (e.dx === undefined ? 7 : e.dx), y: Y(p[1]) + (e.dy === undefined ? -7 : e.dy),
        fill: 'currentColor', 'font-size': 11.5 }, e.label));
      svg.appendChild(g);
      return;
    }
    if (e.type === 'vector' || e.type === 'segment') {
      var A = e.from, B = e.to;
      var arrow = e.type === 'vector' || e.arrow;
      var x1 = X(A[0]), y1 = Y(A[1]), x2 = X(B[0]), y2 = Y(B[1]);
      g = el('g', { class: 'plot-vector' });
      var lw = e.width || ((e.dash || e.role === 'guide') ? 1.2 : 2);
      g.appendChild(el('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: color, 'stroke-width': lw,
        'stroke-dasharray': e.dash ? '4 3' : null, 'stroke-linecap': 'round' }));
      if (arrow) {
        var ang = Math.atan2(y2 - y1, x2 - x1), L = e.head || 9;
        var hx = x2 - L * Math.cos(ang - 0.42), hy = y2 - L * Math.sin(ang - 0.42);
        var hx2 = x2 - L * Math.cos(ang + 0.42), hy2 = y2 - L * Math.sin(ang + 0.42);
        g.appendChild(el('path', { d: 'M' + hx.toFixed(1) + ' ' + hy.toFixed(1) + 'L' + x2.toFixed(1) + ' ' + y2.toFixed(1)
          + 'L' + hx2.toFixed(1) + ' ' + hy2.toFixed(1), fill: 'none', stroke: color, 'stroke-width': e.width || 2, 'stroke-linecap': 'round' }));
      }
      if (e.label) g.appendChild(el('text', { x: (x1 + x2) / 2 + (e.dx || 6), y: (y1 + y2) / 2 + (e.dy || -6), fill: 'currentColor', 'font-size': (11.5 * TS).toFixed(1) }, e.label));
      svg.appendChild(g);
      return;
    }
    if (e.type === 'polygon') {
      var d4 = 'M' + e.at.map(function (p) { return X(p[0]).toFixed(2) + ' ' + Y(p[1]).toFixed(2); }).join('L') + 'Z';
      svg.appendChild(el('path', { d: d4, fill: color, opacity: e.opacity === undefined ? .14 : e.opacity,
        stroke: e.stroke === false ? 'none' : color, 'stroke-width': e.stroke === false ? 0 : 1.4, class: 'plot-polygon' }));
      return;
    }
    if (e.type === 'label') {
      var la = labelAttrs(((e.size || 12) * TS).toFixed(1), e.color ? col(e.color) : 'var(--ink)');
      la.x = X(e.at[0]); la.y = Y(e.at[1]); la['text-anchor'] = e.anchor || 'start';
      svg.appendChild(el('text', la, e.text));
      return;
    }
    if (e.type === 'rect') {
      var x = X(e.at[0]), y = Y(e.at[1] + (e.h || 0));
      svg.appendChild(el('rect', { x: x, y: y, width: (e.w || 0) * ctx.sx, height: (e.h || 0) * ctx.sy,
        fill: color, opacity: e.opacity || .14, stroke: e.stroke === false ? 'none' : color, 'stroke-width': 1.4, class: 'plot-rect' }));
      return;
    }
  }

  /* 参数滑块：拖动即重绘（rAF 合并） */
  function buildControls(host, spec, svg, params) {
    var bar = document.createElement('div');
    bar.className = 'plot-params';
    var pending = false;
    var keys = Object.keys(spec.params);
    keys.forEach(function (k) {
      var cfg = spec.params[k];
      if (!cfg || cfg.value === undefined) return;
      var wrap = document.createElement('label');
      wrap.className = 'plot-param';
      var name = document.createElement('span');
      name.className = 'plot-param-name';
      var val = document.createElement('span');
      val.className = 'plot-param-val';
      var rng = document.createElement('input');
      rng.type = 'range';
      rng.min = cfg.min; rng.max = cfg.max; rng.step = cfg.step || 0.01; rng.value = cfg.value;
      var show = function () { val.textContent = (cfg.label || k) + ' = ' + Number(rng.value).toFixed(2); };
      show();
      rng.addEventListener('input', function () {
        params[k].value = parseFloat(rng.value);
        show();
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () { pending = false; redraw(svg, spec, host, params); });
      });
      name.textContent = cfg.label || k;
      wrap.appendChild(name); wrap.appendChild(rng); wrap.appendChild(val);
      bar.appendChild(wrap);
    });
    host.appendChild(bar);
  }

  /* 参数变化后只重画 SVG，不重建滑块（否则拖动时滑块会被替换掉）。
     做法：把 params 临时置空调一次 render，再把原引用放回去。 */
  function redraw(svg, spec, host, params) {
    var keep = spec.params;
    spec.params = null;
    var holder = document.createElement('div');
    var next = render(holder, spec);
    spec.params = keep;
    svg.parentNode.replaceChild(next, svg);
  }

  /* ------------------------------------------------------------------
     5. 3D 辅助（第 8 章：向量、平面、曲面）
     把 (x,y,z) 按视角投影到二维；调用方按深度排序后再画（画家算法）。
     ------------------------------------------------------------------ */
  function makeProjection(opt) {
    /* (x,y,z) → [screenX, screenY, depth]，斜投影（cabinet-like）。
       做法：先绕竖直轴 yaw 旋转，得到屏幕横向 X = x·cos + y·sin 与纵深 D = y·cos − x·sin；
       再把纵深 D 按 pitch 投影到屏幕：横向位移 D·cos(pitch)、竖直位移 D·sin(pitch)；
       z 直接作为屏幕竖直方向。
       ⚠️ 历史：曾把 screenY 写成只依赖 x、y 的 Z1，导致 xy 平面被压成一条线
       （面积因子恒为 0），表现为"3D 图里画不出平行四边形"（2026-09-18 修）。 */
    opt = opt || {};
    var yaw = (opt.yaw === undefined ? -1.05 : opt.yaw);
    var pitch = (opt.pitch === undefined ? 0.55 : opt.pitch);
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    return function (p) {
      var x = p[0], y = p[1], z = p[2];
      var X = x * cy + y * sy;
      var D = y * cy - x * sy;
      return [X - D * cp, -(z - D * sp), D];
    };
  }

  /* ------------------------------------------------------------------
     6. 小工具
     ------------------------------------------------------------------ */
  function niceStep(r) {
    var span = Math.abs(r[1] - r[0]) || 1;
    var raw = span / 8, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / mag;
    var s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return s * mag;
  }
  function fmt(v) {
    if (Math.abs(v) < 1e-9) return '0';
    var s = Math.abs(v) >= 1000 ? v.toExponential(0) : String(parseFloat(v.toPrecision(4)));
    return s;
  }
  function eqToZero(eq) {
    var parts = String(eq).split('=');
    return '(' + parts[0] + ')-(' + parts[1] + ')';
  }

  /* ------------------------------------------------------------------
     4.5 准确性校验（渲染前执行；不通过就抛错，不产出"看着没问题"的错图）
     用户要求："图表内容克制，最重要的要求是画图准确。"
     ------------------------------------------------------------------ */
  function verify(spec) {
    var errs = [];
    var scope = {};
    var params = spec.params || {};
    for (var k in params) scope[k] = (params[k] && params[k].value !== undefined) ? params[k].value : params[k];
    var num = function (v) { return typeof v === 'number' && isFinite(v); };


    (spec.elements || []).forEach(function (e, idx) {
      var tag = '第 ' + (idx + 1) + ' 个元素（' + e.type + '）';
      // ① 点必须真在曲线上：声明了 onCurve 就把 x 代进去反算，与声明 y 比对
      if (e.type === 'point' && e.onCurve) {
        var f = compile(e.onCurve);
        var x = e.at[0];
        var y = f(Object.assign({}, scope, { x: x }));
        if (!num(y)) errs.push(tag + '：onCurve 表达式在 x=' + x + ' 处无定义');
        // 校验容差**设上限**：曾用 tol:0.01 让偏离曲线 0.997 的点"通过"，
        // 等于自己放水绕过校验。这里强制不超过 1e-3。
        else if (Math.abs(y - e.at[1]) > Math.min(e.tol || 1e-6, 1e-3)) {
          errs.push(tag + '：声明点 (' + e.at[0] + ',' + e.at[1] + ') 不在曲线 ' + e.onCurve +
                    ' 上（曲线值为 ' + y.toFixed(6) + '）');
        }
      }
      // ② 序列单调性：声明 monotone 就必须真单调
      if (e.type === 'seq' && e.monotone) {
        var fq = compile(e.of);
        var n0 = (e.n && e.n[0]) || 1, n1 = (e.n && e.n[1]) || 10;
        var prev = null;
        for (var n = n0; n <= n1; n++) {
          var v = fq(Object.assign({}, scope, { n: n, i: n }));
          if (!num(v)) continue;
          if (prev !== null) {
            var up = v - prev;
            if (e.monotone === 'down' && up > 1e-9) errs.push(tag + '：声明单调递减，但 n=' + n + ' 处比前项大');
            if (e.monotone === 'up' && up < -1e-9) errs.push(tag + '：声明单调递增，但 n=' + n + ' 处比前项小');
            if (e.monotone === 'constant' && Math.abs(up) > 1e-9) errs.push(tag + '：声明为常数列，但 n=' + n + ' 处有变化');
          }
          prev = v;
        }
      }
      // ③ 水平参考线的高度必须等于声明值
      if (e.type === 'fn' && e.role === 'guide' && e.level !== undefined) {
        var fl = compile(e.of);
        var lv = fl(Object.assign({}, scope, { x: (spec.x ? spec.x[0] : 0) }));
        if (!num(lv) || Math.abs(lv - e.level) > Math.min(e.tol || 1e-6, 1e-3)) {
          errs.push(tag + '：声明为高度 ' + e.level + ' 的水平参考线，实际 y=' + lv);
        }
      }
      // ④ 声明了交点数量就必须数得上
      if (e.crossings !== undefined && e.crossingsWith) {
        var fa = compile(e.of), fb = compile(e.crossingsWith);
        var x0 = (spec.x ? spec.x[0] : -10), x1 = (spec.x ? spec.x[1] : 10);
        var hits = 0, prevSign = null, M = 4000;
        for (var i2 = 0; i2 <= M; i2++) {
          var xx = x0 + (x1 - x0) * i2 / M;
          var va = fa(Object.assign({}, scope, { x: xx })), vb = fb(Object.assign({}, scope, { x: xx }));
          if (!num(va) || !num(vb)) { prevSign = null; continue; }
          var sg = Math.sign(va - vb);
          if (prevSign !== null && sg !== 0 && sg !== prevSign) hits++;
          prevSign = sg;
        }
        if (hits !== e.crossings) errs.push(tag + '：声明交点 ' + e.crossings + ' 个，实际数到 ' + hits + ' 个');
      }
    });

    if (errs.length) {
      var msg = 'plot.js 准确性校验未通过：\n  - ' + errs.join('\n  - ');
      throw new Error(msg);
    }
    return true;
  }

  /* 自检：SVG 内的文本不能含 `$…$`（MathJax 不处理 SVG 内部文本，
     会原样显示成字面美元号）。渲染前统一剥掉，避免这类低级错误。 */
  function stripMath(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\$([^$]*)\$/g, '$1');
  }

  /* 侧栏拖动等"连续改宽"场景的全局开关（2026-09-18 加）。
     resizePaused 为真时所有图表的 ResizeObserver 都不重绘；
     redrawAll() 按当前宽度把所有图表重绘一遍（松手后调用一次）。 */
  var resizePaused = false;

  function setResizePaused(v) { resizePaused = !!v; }

  function redrawAll() {
    plotHosts.forEach(function (host) {
      if (!host || !host.isConnected) { plotHosts.delete(host); return; }
      var rec = renderCache.get(host);
      if (rec && rec.spec) render(host, rec.spec);
    });
  }

  global.Plot = {
    verify: verify,
    render: render, sample: sample, marchingSquares: marchingSquares,
    makeProjection: makeProjection, compile: compile, colors: COLORS,
    setResizePaused: setResizePaused, redrawAll: redrawAll
  };
})(window);
