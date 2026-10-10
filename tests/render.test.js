/* 渲染回归：逐页验证「没有任何 LaTeX 源码裸露、没有 MathJax 报错」。
 * ---------------------------------------------------------------------------
 * 为什么需要它（2026-10-10 新增）：
 *   typeset.test.js 只检查 __TYPESET_SEL 命中的元素里有没有裸公式，
 *   而以下两类问题它**看不见**：
 *     ① 公式在子元素里（如 <li><span class="opt-body">$…$</span></li>）：
 *        hasRawFormula() 只看直接子文本节点 → 被跳过；dropNested() 又丢掉
 *        .opt-body → 两条路都漏，永久不排。ch12 实测 8 处。
 *     ② 带锚点深链接时的并发排版（anchor-fix.js 的 flush 循环 与 typeset.js
 *        的调度器同时跑）→ ch7 实测 49 处公式永久丢失。
 *   本文件改用**不依赖 SEL 的 ground truth**：遍历全文档文本节点（排除
 *   script/style/mjx-container），只要还有 $…$ 就算失败；同时统计 mjx-merror。
 *
 * 运行：cd tests && node render.test.js          （需本机有无头浏览器）
 *       TYPESET_CHROME=<路径> 可指定；CI 里由 setup-chrome 提供并传该变量。
 * ------------------------------------------------------------------------- */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CANDIDATES = [
  process.env.TYPESET_CHROME,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
].filter(Boolean);
const EXE = CANDIDATES.find(p => { try { return fs.existsSync(p); } catch { return false; } });
if (!EXE) {
  console.log('  ⊘ 未找到可用浏览器，跳过本套件');
  console.log('    已尝试：' + CANDIDATES.join(' , '));
  process.exit(0);
}
const IS_CI = !!process.env.CI;
const ARGS = ['--allow-file-access-from-files', '--disable-gpu'];
if (IS_CI) ARGS.push('--no-sandbox', '--disable-dev-shm-usage');

const ROOT = path.resolve(process.cwd(), '..');
const b = await puppeteer.launch({
  executablePath: EXE, headless: process.env.TYPESET_HEADLESS || (IS_CI ? true : 'shell'),
  protocolTimeout: 300000, args: ARGS,
});

/* 全文档级别的判据：任何未被 mjx-container 吸收的 $…$ 都算未渲染 */
const AUDIT = () => {
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']);
  const raw = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const p = n.parentElement;
    if (!p || skip.has(p.tagName)) continue;
    if (p.closest('mjx-container')) continue;          // 已排版（SVG / MathML）
    const t = n.nodeValue || '';
    if (/\$[^$]{1,300}\$/.test(t)) {
      raw.push(t.replace(/\s+/g, ' ').trim().slice(0, 90));
    }
  }
  const errs = [...document.querySelectorAll('mjx-merror')]
    .map(e => (e.getAttribute('data-mjx-error') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80));
  return { raw, errs, containers: document.querySelectorAll('mjx-container').length };
};

const pages = fs.readdirSync(path.join(ROOT, 'chapters')).filter(f => f.endsWith('.html')).map(f => 'chapters/' + f)
  .concat(fs.readdirSync(ROOT).filter(f => f.endsWith('.html')));

/* 抽查带锚点的深链接：那条路径会同时启动 anchor-fix.js 的 flush 循环，
   是 2026-10-10 那批「公式永久丢失」的触发条件，必须留在护栏里。 */
const HASH_SPOT = ['chapters/ch7.html', 'chapters/la3.html', 'chapters/ch12.html'];

let fail = 0, checked = 0;
for (const f of pages) {
  const withHash = HASH_SPOT.includes(f);
  const url = 'file://' + path.join(ROOT, f) + (withHash ? '#s1-1' : '');
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(url, { waitUntil: 'load' });
  /* 滚一遍触发分片排版（步长 800 / 10ms 已足够让调度器把队列排空） */
  await p.evaluate(async () => {
    const H = document.body.scrollHeight;
    for (let y = 0; y < H; y += 800) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 10)); }
    window.scrollTo(0, H);
  });
  /* 展开所有 <details>：折叠内容在闭合态下用户看不见，展开才是它的可见态。
     这一步同时验证 typeset.js 的 toggle 处理（实测 la-exam 有 3 处曾被漏排）。 */
  await p.evaluate(() => { document.querySelectorAll('details').forEach(d => { d.open = true; }); });
  /* 轮询到收敛，不用固定等待：分片排版是异步的，固定等待会把「还没排完」
     误报成「永不排」（实测 la5 那 1 处在多等 1.5 秒后自行消失）。
     数量归零即通过；连续 3 次不再下降即认定收敛；上限 20 秒。 */
  let prev = -1, stable = 0, r = null;
  const deadline = Date.now() + 20000;
  for (;;) {
    r = await p.evaluate(AUDIT);
    const n = r.raw.length + r.errs.length;
    if (n === 0) break;
    if (n >= prev) stable++; else stable = 0;
    if (stable >= 3 || Date.now() > deadline) break;
    prev = n;
    await new Promise(res => setTimeout(res, 600));
  }
  await p.close();
  checked++;
  const bad = r.raw.length + r.errs.length;
  if (bad) {
    fail++;
    console.log(`  ✗ ${f}${withHash ? ' (带锚点)' : ''}  未渲染 ${r.raw.length} / 报错 ${r.errs.length}`);
    r.raw.slice(0, 4).forEach(x => console.log(`       裸公式  ${x}`));
    r.errs.slice(0, 4).forEach(x => console.log(`       MathJax ${x}`));
  }
}

console.log('');
if (fail) {
  console.log(`  ✗ ${fail} / ${checked} 页存在未渲染公式或 MathJax 报错`);
  console.log('    排查方向：该元素是否在 __TYPESET.sel 之外？公式是否藏在子元素里？');
  await b.close();
  process.exit(1);
}
console.log(`  ✓ ${checked} 页全部渲染完成：无源码裸露、无 MathJax 报错`);
await b.close();
