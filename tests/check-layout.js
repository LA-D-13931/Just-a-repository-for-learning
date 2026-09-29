/* 真实浏览器布局检查：横向溢出 + 边距
 * ---------------------------------------------------------------------------
 * 依赖：puppeteer-core + 本机已装的 Chrome/Edge
 *   cd tests && bun add puppeteer-core && bun check-layout.js
 *
 * 为什么需要它：happy-dom 不做布局，站点集成测试查不出"长公式把页面顶宽"
 * 这类问题。这个脚本用真实浏览器渲染，才能测出 320px 下的横向溢出。
 *
 * MathJax：优先用本地副本（tests/vendor/mathjax.js 或 /tmp/mj/tex-svg.js）做
 * 请求拦截，保证测量可复现；没有本地副本时回退到 CDN，并在网络不可用时明确报错
 * 而不是给出"未渲染页面"的假数据。
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
if (!exe) { console.error('找不到 Chrome / Edge，无法做布局检查'); process.exit(2); }

const MJ_LOCAL = ['/tmp/mj/tex-svg.js', join(HERE, 'vendor/mathjax.js')].find(existsSync);
const MJ = MJ_LOCAL ? readFileSync(MJ_LOCAL, 'utf8') : null;

const WANTED = ['chapters/ch1.html', 'chapters/ch2.html', 'chapters/supp1.html',
                'index.html', 'exam.html', 'cheatsheet.html'];
// 第 1 期分批施工：只测已建成的页面，未建的单列出来（退出码仍反映它们的存在）。
// Phase 1 is built in batches: measure only pages that exist, but still report the rest.
const PAGES = WANTED.filter(p => existsSync(join(SITE, p)));
const NOT_BUILT = WANTED.filter(p => !existsSync(join(SITE, p)));
const WIDTHS = [320, 768, 1280];
const MIN_GAP = 8;          // 文字/公式到边框的最小间距（px）

let fail = 0;
const bad = (m) => { fail++; console.log('  ✗ ' + m); };

const browser = await puppeteer.launch({
  executablePath: exe, headless: 'shell',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-extensions'],
});
const page = await browser.newPage();
if (MJ) {
  await page.setRequestInterception(true);
  page.on('request', r =>
    r.url().includes('mathjax') && r.url().endsWith('.js')
      ? r.respond({ status: 200, contentType: 'application/javascript', body: MJ })
      : r.continue());
}
console.log(MJ ? `MathJax：本地副本（${MJ_LOCAL}）` : 'MathJax：CDN（可能不稳定）');

for (const w of WIDTHS) {
  console.log(`\n${'='.repeat(58)}\n视口 ${w}px\n${'='.repeat(58)}`);
  await page.setViewport({ width: w, height: 900 });

  for (const f of PAGES) {
    await page.goto(BASE + f, { waitUntil: 'domcontentloaded', timeout: 40000 });
    // 页面上根本没有 $...$ 时不必等 MathJax（占位页、纯说明页属于这种），
    // 否则会把"没有公式"误报成"公式没渲染"。
    // Pages without any math must not be reported as "MathJax failed".
    // 判"本页有没有公式"不能靠 document.body.innerText：视口刚切换时
    // innerText 可能还没算出来（实测 320px 一档误判为"无公式"，
    // 于是跳过等待、把 703 个公式全漏掉）。改为读页面源码里的 $ 定界符。
    const hasMath = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const t = n.nodeValue || '';
        if (t.indexOf('$') === -1) continue;
        if (n.parentElement && n.parentElement.closest('script, style, pre, code')) continue;
        // $$...$$ 或 $...$ 成对即可
        if (/\$\$[^]*?\$\$/.test(t) || /\$[^$]+\$/.test(t)) return true;
      }
      return false;
    });
    // 等 MathJax 排完。不要 await MathJax.startup.promise——它在启动阶段报错时
    // 会一直挂起（我们曾因此把 ch3 误判为"未渲染"）。改为等公式数量连续稳定。
    if (hasMath) {
      await page.waitForFunction('document.querySelectorAll("mjx-container").length > 0',
        { timeout: 30000 }).catch(() => {});
    }
    let prev = -1, stable = 0;
    for (let i = 0; i < 40 && stable < 3; i++) {
      const n = await page.evaluate(() => document.querySelectorAll('mjx-container').length);
      if (n === prev && n > 0) stable++; else stable = 0;
      prev = n;
      await new Promise(r => setTimeout(r, 200));
    }
    const rendered = prev > 0;
    const mathOK = !hasMath || rendered;

    const r = await page.evaluate((minGap) => {
      const de = document.documentElement;
      const over = de.scrollWidth - de.clientWidth;

      // 找出真正顶宽视口的元素（排除 MathJax 的隐藏辅助层与自带滚动的容器）
      const culprits = [];
      if (over > 0) {
        document.querySelectorAll('body *').forEach(el => {
          if (el.closest('mjx-assistive-mml')) return;
          const cs = getComputedStyle(el);
          if (['auto', 'scroll', 'hidden'].includes(cs.overflowX)) return;
          if (el.getBoundingClientRect().right <= de.clientWidth + 0.5) return;
          const cls = (el.className && el.className.baseVal !== undefined
                       ? el.className.baseVal : el.className) || '';
          culprits.push(el.tagName.toLowerCase() +
                        (String(cls).trim() ? '.' + String(cls).trim().split(/\s+/)[0] : ''));
        });
      }

      // 元素级外溢：documentElement.scrollWidth 查不出「被祖先裁掉的溢出」
      // （元素右边界超出视口、但祖先设了 overflow:hidden/auto，就不会计入
      //  scrollWidth）。这正是 v0.2.0 把页头副标题多写两个字后踩到的坑：
      //  溢出 5px 而 scrollWidth 只多 5，罪魁 nav-toggle 在列表里根本看不出因果。
      //  所以这里单独把「右边界超出视口 且 未被祖先裁剪」的元素列出来。
      //  MathJax 的 <svg> 图元不算——它们由 mjx-container 自己滚动。
      const spill = [];
      document.querySelectorAll('body *').forEach(el => {
        if (el.closest('mjx-assistive-mml')) return;
        if (el.ownerSVGElement || el.tagName.toLowerCase() === 'svg') return;
        if (el.closest('mjx-container')) return;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return;
        if (b.right <= de.clientWidth + 0.5) return;
        // 祖先里有裁剪/滚动容器 → 这个溢出不会顶宽页面
        let clipped = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (['hidden', 'auto', 'scroll', 'clip'].includes(cs.overflowX)) { clipped = true; break; }
        }
        if (clipped) return;
        const cls = (el.className && el.className.baseVal !== undefined
                     ? el.className.baseVal : el.className) || '';
        spill.push(el.tagName.toLowerCase() +
                   (String(cls).trim() ? '.' + String(cls).trim().split(/\s+/)[0] : '') +
                   '@' + Math.round(b.right - de.clientWidth) + 'px');
      });

      // 边距：正文/选项框到卡片边框
      const gaps = [];
      const q = document.querySelector('.quiz');
      if (q) {
        const probe = (sel, label) => {
          const el = q.querySelector(sel);
          if (!el) return;
          const a = el.getBoundingClientRect(), o = q.getBoundingClientRect();
          gaps.push({ label, l: Math.round(a.left - o.left), r: Math.round(o.right - a.right) });
        };
        probe('.options li', '选项框');
        probe('.q-stem', '题干');
        probe('.quiz-review', '讲评');
      }
      return { over, culprits: [...new Set(culprits)].slice(0, 4),
               spill: [...new Set(spill)].slice(0, 6), gaps };
    }, MIN_GAP);

    const status = r.over <= 0 ? '✓' : `✗ 溢出 ${r.over}px`;
    const mjNote = !hasMath ? '  ·  本页无公式' : (rendered ? '' : '  ⚠ MathJax 未渲染，结果不可信');
    console.log(`  ${f.padEnd(20)} ${status}${mjNote}`);
    if (r.over > 0) {
      bad(`${f} @${w}px 横向溢出 ${r.over}px`);
      r.culprits.forEach(c => console.log(`       ↳ ${c}`));
    }
    if (!mathOK) bad(`${f} @${w}px MathJax 未渲染`);
    if (r.spill.length) {
      bad(`${f} @${w}px 有元素右边界超出视口且未被祖先裁剪（会顶宽页面）`);
      r.spill.forEach(c => console.log(`       ↳ ${c}`));
    }

    // 暗色模式：换的是变量取值，理论上不影响布局；但暗色下"安全色"变浅、
    // 界面元素会重新排版，所以 320px 这一档要真跑一次，不能靠推理。
    if (w === 320) {
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'eyecare-warm');
        document.documentElement.setAttribute('data-mode', 'dark');
      });
      await new Promise(r => setTimeout(r, 200));
      const rd = await page.evaluate(() => {
        const de = document.documentElement;
        const bg = getComputedStyle(document.body).backgroundColor;
        return { over: de.scrollWidth - de.clientWidth, bg };
      });
      const darkOk = rd.over <= 0;
      console.log(`    ${'↳ 暗色（暖沙）'.padEnd(18)} ${darkOk ? '✓' : `✗ 溢出 ${rd.over}px`}  bg=${rd.bg}`);
      if (!darkOk) bad(`${f} @${w}px 暗色模式横向溢出 ${rd.over}px`);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'default');
        document.documentElement.removeAttribute('data-mode');
      });
    }

    if (w === 1280) {
      r.gaps.forEach(g => {
        const ok = g.l >= MIN_GAP && g.r >= MIN_GAP;
        if (!ok) bad(`${f} ${g.label}距边框 ${g.l}/${g.r}px < ${MIN_GAP}px`);
      });
    }
  }
}

/* ---------------------------------------------------------------- 行内公式基线
 * 回归检查：mjx-container 一旦丢了 `line-height: 0`，它会从 body 继承 1.78 的行高，
 * 行盒比公式本身高约 10px，把公式基线顶离容器底边 —— 表现是公式在中文里明显偏高。
 * 实测：丢了这一条时有 1344/1870 个公式异常，最大偏高 20px。
 *
 * 判据是"容器高 − 内部 svg 高"。阈值取 5px 而非 0：极少数下标很深的公式
 * （如 |A*+2E|）即使 line-height 归零，行盒仍需为大角度下沉让出约 3.7px，
 * 属可接受的残留，不是回归。
 */
console.log(`\n${'='.repeat(58)}\n行内公式基线\n${'='.repeat(58)}`);
await page.setViewport({ width: 1280, height: 900 });
for (const f of ['chapters/ch1.html', 'chapters/ch2.html', 'chapters/supp1.html', 'exam.html']
                   .filter(p => existsSync(join(SITE, p)))) {
  await page.goto(BASE + f, { waitUntil: 'domcontentloaded', timeout: 40000 });
  const hasMath = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue || '';
      if (t.indexOf('$') === -1) continue;
      if (n.parentElement && n.parentElement.closest('script, style, pre, code')) continue;
      if (/\$\$[^]*?\$\$/.test(t) || /\$[^$]+\$/.test(t)) return true;
    }
    return false;
  });
  if (!hasMath) {
    console.log(`  ${f.padEnd(20)} 本页无公式，跳过基线检查`);
    continue;
  }
  await page.waitForFunction('document.querySelectorAll("mjx-container").length > 0',
    { timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1200));
  const r = await page.evaluate(() => {
    const out = { n: 0, bad: [], max: 0 };
    document.querySelectorAll('mjx-container').forEach(m => {
      if (m.getAttribute('display') === 'true') return;      // 只查行内公式
      const svg = m.querySelector(':scope > svg');
      if (!svg) return;
      out.n++;
      const d = m.getBoundingClientRect().height - svg.getBoundingClientRect().height;
      if (d > out.max) out.max = d;
      if (d > 5) out.bad.push(+d.toFixed(1));
    });
    return out;
  });
  const okRow = r.bad.length === 0;
  console.log(`  ${f.padEnd(20)} 行内公式 ${String(r.n).padStart(4)} 个` +
              `  容器与公式最大高度差 ${r.max.toFixed(1)}px  ${okRow ? '✓' : '✗'}`);
  if (!okRow) {
    bad(`${f} 有 ${r.bad.length} 个行内公式基线异常（最大超出 ${Math.max(...r.bad)}px）` +
        '—— 检查 style.css 中 mjx-container 的 line-height:0 是否丢失');
  }
}

console.log(`\n${'='.repeat(58)}`);
if (NOT_BUILT.length) {
  console.log(`未建页面 ${NOT_BUILT.length} 个（第 1 期完成后应为 0）：${NOT_BUILT.join('、')}`);
}
console.log(fail ? `✗ ${fail} 项未通过` : '✓ 全部通过：三档宽度无横向溢出，边距与公式基线均达标');
console.log('='.repeat(58));
await browser.close();
process.exit(fail || NOT_BUILT.length ? 1 : 0);
