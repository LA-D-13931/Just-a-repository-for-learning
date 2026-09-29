/* 图形引擎自测（happy-dom，无浏览器）
 * 覆盖：表达式解析、自适应采样与间断处理、marching squares、3D 投影。
 * 这些是"画得对不对"的机器判据——肉眼能看出来的（圆要圆、间断要断）
 * 尽量在这里变成断言，避免 v0.7.26 那类"图看着不对但校验全过"的问题。
 * 用法：cd tests && node plot.test.js
 */
import { Window } from 'happy-dom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

new Function(readFileSync(`${SITE}/assets/js/plot.js`, 'utf8'))();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  → ' + extra : ''}`); }
}

console.log('\n【图形引擎 plot.js】');
{
  const P = window.Plot;
  ok('引擎已挂载', !!P && typeof P.render === 'function');

  /* ① 表达式解析与求值 */
  ok('幂与优先级：-2^2 = -4', P.compile('-2^2')({}) === -4, String(P.compile('-2^2')({})));
  ok('括号：(-2)^2 = 4', P.compile('(-2)^2')({}) === 4);
  ok('常量 pi', Math.abs(P.compile('pi')({}) - Math.PI) < 1e-12);
  ok('函数 sin', Math.abs(P.compile('sin(0)')({}) - 0) < 1e-12);
  ok('变量代入 x', P.compile('x^2+1')({ x: 3 }) === 10);
  ok('多参数 a,b', P.compile('a*x+b')({ a: 2, b: 1, x: 3 }) === 7);
  ok('多参函数 atan2', Math.abs(P.compile('atan2(1,1)')({}) - Math.PI / 4) < 1e-12);
  ok('不使用 eval：表达式里塞 JS 会报错', (() => {
    try { P.compile('alert(1)')({}); return false; } catch (e) { return true; }
  })());
  ok('未知变量会报错', (() => {
    try { P.compile('q+1')({}); return false; } catch (e) { return true; }
  })());

  /* ② 自适应采样与间断 */
  const f = P.compile('x^2');
  const segs = P.sample((x) => f({ x }), -1, 1, { range: 1e6 });
  const pts = segs.reduce((n, s) => n + s.length, 0);
  ok('抛物线：单段、点数充足', segs.length === 1 && pts > 1000, `段 ${segs.length} 点 ${pts}`);
  ok('抛物线：右端点落在曲线 y=1', (() => {
    const last = segs[0][segs[0].length - 1];
    return Math.abs(last[0] - 1) < 1e-9 && Math.abs(last[1] - 1) < 1e-6;
  })());
  ok('抛物线：加密有效（采样点远多于基础步数）', pts > 1400, `${pts}`);

  // tan x 在 ±π/2 处必须断开，而不是连出一条几乎垂直的线
  const g = P.compile('tan(x)');
  const tsegs = P.sample((x) => g({ x }), -3.1, 3.1, { range: 60 });
  ok('tan x：被断成多段（间断不连线）', tsegs.length >= 3, `段数 ${tsegs.length}`);
  const maxJump = tsegs.reduce((m, s) => {
    let mx = 0;
    for (let i = 1; i < s.length; i++) mx = Math.max(mx, Math.abs(s[i][1] - s[i - 1][1]));
    return Math.max(m, mx);
  }, 0);
  ok('tan x：段内不出现大幅跳变', maxJump < 60 * 0.4, `最大跳变 ${maxJump.toFixed(2)}`);

  // sin(x)/x 在 x=0 处是 0/0：应跳过该点并在两侧各留一段
  const h = P.compile('sin(x)/x');
  const hsegs = P.sample((x) => h({ x }), -6, 6, { range: 100 });
  ok('sin(x)/x：跨 0 处仍能画出（不因端点为 NaN 放弃整段）', hsegs.length >= 2, `段数 ${hsegs.length}`);
  ok('sin(x)/x：所有采样值有限', hsegs.every((s) => s.every((p) => isFinite(p[1]))));

  /* ③ marching squares（隐函数） */
  const circle = P.marchingSquares((x, y) => x * x + y * y - 1, -1.5, 1.5, -1.5, 1.5, 120, 120);
  ok('单位圆：提取出等值线段', circle.length > 100, `段 ${circle.length}`);
  const onCircle = circle.every(([a, b]) =>
    Math.abs(a[0] * a[0] + a[1] * a[1] - 1) < 0.02 && Math.abs(b[0] * b[0] + b[1] * b[1] - 1) < 0.02);
  ok('单位圆：每个交点都落在圆上（误差 <0.02）', onCircle);
  const maxR = Math.max(...circle.flat().map(([x, y]) => Math.hypot(x, y)));
  const minR = Math.min(...circle.flat().map(([x, y]) => Math.hypot(x, y)));
  ok('单位圆：交点半径在 [0.98,1.02]', minR > 0.98 && maxR < 1.02, `[${minR.toFixed(3)},${maxR.toFixed(3)}]`);
  const noCircle = P.marchingSquares((x, y) => x * x + y * y - 100, -1.5, 1.5, -1.5, 1.5, 60, 60);
  ok('视野内无曲线时返回空集', noCircle.length === 0, `${noCircle.length}`);

  /* ④ 3D 投影 */
  const proj = P.makeProjection({ yaw: -0.62, pitch: 0.42 });
  const p0 = proj([0, 0, 0]), pz = proj([0, 0, 1]), px = proj([1, 0, 0]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  ok('投影：原点映射为有限坐标', p0.every(isFinite));
  ok('投影：三个轴方向互不重合', dist(p0, pz) > 0.3 && dist(p0, px) > 0.3 && dist(px, pz) > 0.3);
  ok('投影：z 轴正方向在屏幕上向上（y 更小）', pz[1] < p0[1], `${pz[1]} vs ${p0[1]}`);
  ok('投影：返回三元组（含深度）', p0.length === 3 && isFinite(p0[2]));

  /* ⑤ render 输出结构（happy-dom 无布局，只查结构） */
  const host = document.createElement('div');
  document.body.appendChild(host);
  P.render(host, {
    aria: '测试图', x: [-2, 2], y: [-1, 1],
    elements: [{ type: 'fn', of: 'sin(x)', color: 'brand' },
               { type: 'point', at: [1, 1], label: 'P' },
               { type: 'vector', from: [0, 0], to: [1, 1], label: 'v' }]
  });
  const svg = host.querySelector('svg.plot');
  ok('render：产出 svg.plot', !!svg);
  ok('render：带 aria-label', svg && svg.getAttribute('aria-label') === '测试图');
  ok('render：函数曲线有 path 且不含 NaN', (() => {
    const p = svg && svg.querySelector('.plot-fn path');
    return !!p && !/NaN/.test(p.getAttribute('d'));
  })());
  ok('render：点与向量都画出来了', !!svg.querySelector('.plot-point circle') && !!svg.querySelector('.plot-vector'));

  /* ⑥ 参数滑块 */
  const host2 = document.createElement('div');
  document.body.appendChild(host2);
  P.render(host2, { x: [-3, 3], y: [-3, 3], params: { a: { value: 1, min: 0, max: 3, step: 0.1, label: 'a' } },
    elements: [{ type: 'fn', of: 'a*x' }] });
  ok('参数：生成滑块', !!host2.querySelector('.plot-param input[type="range"]'));
  ok('参数：滑块初值与显示一致', /a = 1\.00/.test(host2.querySelector('.plot-param-val').textContent),
    host2.querySelector('.plot-param-val').textContent);
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
