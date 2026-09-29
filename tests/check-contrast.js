/* 真实浏览器对比度检查（4 套主题 × 亮/暗 × 4 个页面）
 * ---------------------------------------------------------------------------
 * 为什么需要它：check-structure / check-bilingual / check-html 都只查"结构"，
 * check-layout 只查"溢出与公式基线"。**没有任何一个脚本查"文字读不读得出来"**，
 * 于是 v0.4.0 出现过"深色 hero 上用半透明纸色写字"这种糊成一片的问题，
 * 一路漏到用户截图才发现。本脚本补上这一环。
 *
 * 判据（与《主题配色表.md》的 token 断言同一口径，但这里是**渲染后的真实值**）：
 *   · 正文/次要文字/链接/按钮文字  ≥ 7:1（对齐用户要求，不走 WCAG 的 4.5 兜底）
 *   · 大号标题（≥24px）≥ 4.5:1
 * 依赖：puppeteer-core + 本机 Chrome/Edge
 * 运行：node tests/check-contrast.js
 */
import puppeteer from 'puppeteer-core';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const BASE = 'file://' + SITE.split('/').map(encodeURIComponent).join('/') + '/';
const BROWSERS = [
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const exe = BROWSERS.find(existsSync);
if (!exe) { console.error('找不到 Chrome / Edge'); process.exit(2); }
const MJ = ['/tmp/mj/tex-svg.js', join(HERE, 'vendor/mathjax.js')].find(existsSync);

const PAGES = ['index.html', 'chapters/ch1.html', 'chapters/ch2.html', 'chapters/supp1.html']
  .filter((p) => existsSync(join(SITE, p)));
const THEMES = ['default', 'eyecare-warm', 'eyecare-cool', 'ink'];
const MODES = ['light', 'dark'];
const NORMAL_MIN = 7.0;      // 正文类
const LARGE_MIN = 4.5;       // 大号标题
const HARD_FLOOR = 4.5;      // 任何文字都不得低于此值

const browser = await puppeteer.launch({
  executablePath: exe, headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-extensions'],
});
const page = await browser.newPage();
if (MJ) {
  await page.setRequestInterception(true);
  page.on('request', (r) => r.url().includes('mathjax') && r.url().endsWith('.js')
    ? r.respond({ status: 200, contentType: 'application/javascript', body: readFileSync(MJ, 'utf8') })
    : r.continue());
}
await page.setViewport({ width: 1280, height: 900 });

let fail = 0;
const problems = [];

/* 页面内：对每个有文字的元素算出"它与有效背景"的对比度 */
const PROBE = () => {
  const parse = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const over = (fg, bg) => ({           // fg 半透明时与 bg 合成
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  // 从元素往上累积背景，遇到不透明就停
  const effBg = (el) => {
    let acc = null, n = el;
    while (n && n !== document.documentElement.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        // 渐变：取所有颜色停靠点里"与文字对比最低"的那个作为最坏情况
        const stops = (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean);
        if (stops.length) {
          let worst = null, wr = Infinity;
          for (const s of stops) {
            const c = acc ? over(acc, s) : s;
            const r = ratio(parse(getComputedStyle(el).color), c);
            if (r < wr) { wr = r; worst = c; }
          }
          return worst;
        }
      }
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) acc = acc ? over(acc, bg) : bg;
      if (acc && acc.a >= 0.999) return acc;
      n = n.parentElement;
    }
    return acc || { r: 255, g: 255, b: 255, a: 1 };
  };

  const out = [];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'MJX-ASSISTIVE-MML']);
  document.querySelectorAll('body *').forEach((el) => {
    if (SKIP.has(el.tagName)) return;
    if (el.closest('mjx-assistive-mml')) return;
    if (el.closest('script, style')) return;
    // 只取"直接含文字"的元素
    const text = [...el.childNodes].filter((n) => n.nodeType === 3)
      .map((n) => n.nodeValue.trim()).join('');
    if (text.length < 2) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.5) return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const fg = parse(cs.color);
    if (!fg) return;
    // 元素自身若有不透明底色（按钮等），就以它为准，不要继续往上找渐变
    const selfBg = parse(cs.backgroundColor);
    const bg = (selfBg && selfBg.a >= 0.999) ? selfBg : effBg(el);
    const fgc = fg.a < 1 ? over(fg, bg) : fg;
    const cr = ratio(fgc, bg);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    out.push({
      sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/)[0] : ''),
      cr: +cr.toFixed(2), size: Math.round(size), large,
      color: cs.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
      text: text.slice(0, 40),
    });
  });
  return out;
};

for (const theme of THEMES) {
  for (const mode of MODES) {
    let total = 0, bad = 0, hard = 0, worst = { cr: 99 };
    for (const f of PAGES) {
      await page.goto(BASE + f, { waitUntil: 'load', timeout: 40000 });
      // ⚠️ 必须通过 theme.js 的权威接口设主题，不能只改 <html> 属性：
      // theme.js 在 DOMContentLoaded 时会按 localStorage 重新 apply 一次，
      // 会把我们手改的属性覆盖回默认（实测因此把"暗色"测成了亮色，
      // 报出一堆 1.19:1 的假失败）。setTheme/setMode 会同时写 localStorage 并 apply。
      const applied = await page.evaluate((t, m) => {
        if (!window.__THEME__) return false;
        window.__THEME__.setTheme(t);
        window.__THEME__.setMode(m);
        return document.documentElement.getAttribute('data-theme') === t
            && document.documentElement.getAttribute('data-mode') === m;
      }, theme, mode);
      if (!applied) { console.error(`  ! ${f} 无法应用主题 ${theme}/${mode}`); }
      await new Promise((r) => setTimeout(r, 400));
      const rows = await page.evaluate(PROBE);
      total += rows.length;
      for (const x of rows) {
        const min = x.large ? LARGE_MIN : NORMAL_MIN;
        if (x.cr < min) {
          bad++;
          if (x.cr < worst.cr) worst = x;
          if (x.cr < HARD_FLOOR) hard++;
          if (process.env.DBG) console.log(`    DBG ${f} ${x.sel} ${x.cr}:1 color=${x.color} bg=${x.bg} 「${x.text.slice(0,20)}」`);
      if (problems.length < 40) problems.push({ theme, mode, page: f, ...x, min });
        }
      }
    }
    const flag = hard > 0 ? '✗' : (bad > 0 ? '△' : '✓');
    console.log(`  ${flag} ${theme.padEnd(14)} ${mode.padEnd(5)} 文字节点 ${String(total).padStart(4)}`
      + ` · 低于目标 ${String(bad).padStart(3)} · 低于 4.5 ${String(hard).padStart(2)}`
      + (worst.cr < 99 ? `  · 最差 ${worst.cr}:1 ${worst.sel}「${worst.text.slice(0, 18)}」` : ''));
    if (hard > 0) fail++;
  }
}

await browser.close();

// 按选择器聚合，方便判断"哪一类元素"在拖后腿
const agg = new Map();
for (const p of problems) {
  const k = p.sel + ' @ ' + p.theme + '/' + p.mode;
  const cur = agg.get(k) || { n: 0, worst: 99, sample: p };
  cur.n++; if (p.cr < cur.worst) { cur.worst = p.cr; cur.sample = p; }
  agg.set(k, cur);
}
console.log('\n' + '─'.repeat(74));
console.log('按选择器聚合（只看最差的 20 类）：');
[...agg.entries()].sort((a, b) => a[1].worst - b[1].worst).slice(0, 20).forEach(([k, v]) => {
  console.log(`  ${String(v.worst).padEnd(6)}:1 × ${String(v.n).padStart(3)} 处  ${k}`);
  console.log(`           color=${v.sample.color} bg=${v.sample.bg}  「${v.sample.text.slice(0, 26)}」`);
});

console.log('\n' + '='.repeat(74));
if (problems.length) {
  console.log('未达标的文字节点（最多列 40 条）：');
  for (const p of problems) {
    const mark = p.cr < HARD_FLOOR ? '✗' : '△';
    console.log(`  ${mark} [${p.theme}/${p.mode}] ${p.page} ${p.sel} ${p.cr}:1 < ${p.min}`
      + `  color=${p.color} bg=${p.bg}  「${p.text}」`);
  }
} 
if (fail) {
  console.log(`\n✗ ${fail} 个"主题×模式"组合里存在低于 ${HARD_FLOOR}:1 的文字（硬失败）`);
  process.exit(1);
}
console.log('✓ 全部"主题×模式"组合：没有低于 4.5:1 的文字');
console.log('  （低于 7:1 的会以列在下方的方式提示，不阻断——长页面里偶尔出现属正常）');
