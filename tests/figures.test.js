/* 图形回归测试（无头浏览器，只读）
 * ---------------------------------------------------------------------------
 * 守两件"眼睛看不出来但确实错"的事：
 *   ① 每幅图的 verify 断言必须通过
 *      —— plot.js 里 verify(spec) 在构建 SVG **之前**调用（第 433 行），
 *         所以"容器里有 SVG"就等于"verify 通过了"；抛出则不会生成 SVG。
 *   ② 坐标系必须等比（横纵 px/单位 相同）
 *      —— 引擎没有等比选项，全靠作者用 width/height/padding/范围 凑。
 *         凑错时椭圆会被拉变形而静态校验全过（2026-10-19 实踩）。
 *
 * 用法：cd tests && node figures.test.js
 * 依赖：puppeteer-core + 本机 Edge/Chrome（同 render.test.js 的浏览器解析顺序）
 */
import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');

const BROWSERS = [
  process.env.TYPESET_CHROME,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);
const exe = BROWSERS.find(p => { try { return existsSync(p); } catch { return false; } });

if (!exe) {
  console.log('⚠ 未找到无头浏览器，跳过 figures.test.js（本地请装 Edge/Chrome；CI 由 setup-chrome 提供）');
  process.exit(0);
}

const PAGES = ['chapters/ch1.html','chapters/ch2.html','chapters/ch3.html','chapters/ch5.html',
  'chapters/ch6.html','chapters/ch7.html','chapters/ch8.html','chapters/ch9.html','chapters/ch10.html',
  'chapters/ch11.html','chapters/ch12.html','chapters/supp1.html','chapters/la1.html','chapters/la5.html',
  'chapters/la4.html','chapters/la6.html'];

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${name}${extra ? '  → ' + extra : ''}`); }
};

const launchArgs = ['--allow-file-access-from-files'];
if (process.env.CI) launchArgs.push('--no-sandbox', '--disable-dev-shm-usage');

const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', protocolTimeout: 600000, args: launchArgs });

try {
  for (const rel of PAGES) {
    const src = readFileSync(join(SITE, rel), 'utf8');
    if (!src.includes('plot-figure')) continue;

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });

    /* 在 plot.js 赋值 window.Plot 的那一刻就包住 render，
       把每幅图的 spec 记下来——这样不用改页面就能拿到宽高与范围。 */
    await page.evaluateOnNewDocument(() => {
      window.__plotSpecs = [];
      window.__plotErrors = [];
      let _plot;
      Object.defineProperty(window, 'Plot', {
        configurable: true,
        get() { return _plot; },
        set(v) {
          if (v && typeof v.render === 'function') {
            const orig = v.render;
            v.render = function (host, spec) {
              window.__plotSpecs.push({
                id: host && host.id,
                width: spec && spec.width,
                height: spec && spec.height,
                pad: (spec && spec.padding) || {},
                x: spec && spec.x,
                y: spec && spec.y,
                equalScale: !!(spec && spec.equalScale)
              });
              return orig.apply(this, arguments);
            };
          }
          _plot = v;
        }
      });
    });

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + SITE.split('/').map(encodeURIComponent).join('/') + '/' + rel,
      /* 用 'load' 而不是 'networkidle0'：本站是 file:// 页面，没有真正的网络活动，
         networkidle0 只会跟着 load 完成走；而重页（ch1 有 7669 条公式）的 load
         可能超过 puppeteer 默认的 30 秒，于是报一个与图形无关的导航超时
         （2026-10-26 实测）。render.test.js 一直用 'load'，这里与之对齐。 */
      { waitUntil: 'load', timeout: 90000 });
    await new Promise(r => setTimeout(r, 2500));

    const state = await page.evaluate(() => {
      const figs = [...document.querySelectorAll('figure.plot-figure')];
      return {
        figs: figs.map(f => {
          const d = f.querySelector('div[id]');
          const svg = d && d.querySelector('svg');
          return {
            id: d && d.id,
            hasSvg: !!svg,
            prims: svg ? svg.querySelectorAll('rect,line,path,polyline,polygon,circle,text').length : 0
          };
        }),
        specs: window.__plotSpecs || []
      };
    });

    /* ① verify 通过：有 SVG 且有图元 */
    for (const f of state.figs) {
      ok(`${rel} #${f.id} 已渲染（verify 通过）`, f.hasSvg && f.prims > 0,
        f.hasSvg ? `图元 ${f.prims}` : '无 SVG —— verify 抛错了');
    }

    /* ② 等比：横纵 px/单位 必须一致 */
    for (const s of state.specs) {
      /* 只检查作者显式声明 equalScale 的图：曲线类（如 sin(x)/x）本就不需要等比，
         而圆/椭圆/角度/距离这类「形状即含义」的图必须等比，否则图在说谎。 */
      if (!s.equalScale) continue;
      const xr = s.x, yr = s.y;
      if (!Array.isArray(xr) || !Array.isArray(yr) || xr.length !== 2 || yr.length !== 2) continue;
      if (typeof s.width !== 'number' || typeof s.height !== 'number') continue;
      const l = s.pad.l || 0, r = s.pad.r || 0, t = s.pad.t || 0, b = s.pad.b || 0;
      const xw = xr[1] - xr[0], yw = yr[1] - yr[0];
      if (!(xw > 0) || !(yw > 0)) continue;
      const px = (s.width - l - r) / xw;
      const py = (s.height - t - b) / yw;
      const dev = Math.abs(px - py) / Math.max(px, py);
      ok(`${rel} #${s.id} 坐标等比`, dev < 1e-6,
        `横 ${px.toFixed(2)} vs 纵 ${py.toFixed(2)} px/单位（偏差 ${(dev * 100).toFixed(2)}%）`);
    }

    /* ③ 页面不得有脚本错误（含 verify 抛错） */
    ok(`${rel} 无脚本错误`, errors.length === 0, errors.slice(0, 2).join(' | '));

    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`\n图形回归：通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
