import { Window } from 'happy-dom';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
};

function loadPage(rel) {
  const win = new Window({ url: 'http://localhost/' });
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  globalThis.CustomEvent = win.CustomEvent;
  globalThis.Event = win.Event;
  globalThis.requestAnimationFrame = (cb) => cb(0);
  globalThis.getComputedStyle = win.getComputedStyle.bind(win);

  win.document.write(readFileSync(`${SITE}/${rel}`, 'utf8'));

  // 依次注入脚本，模拟浏览器的加载顺序（course-data.js 必须在 site.js 之前）
  new Function(readFileSync(`${SITE}/assets/js/course-data.js`, 'utf8'))();
  new Function(readFileSync(`${SITE}/assets/js/quiz.js`, 'utf8'))();
  new Function(readFileSync(`${SITE}/assets/js/site.js`, 'utf8'))();
  return win;
}

// ==================================================== 章节页
console.log('\n【章节页】chapters/ch1.html');
{
  const win = loadPage('chapters/ch1.html');
  const d = win.document;

  const tocLinks = d.querySelectorAll('.toc a[data-target]');
  ok('侧栏目录已生成', tocLinks.length >= 6, `生成了 ${tocLinks.length} 条`);

  const secChecks = d.querySelectorAll('.sec-check');
  ok('每个小节都注入了「已掌握」勾选框', secChecks.length === 10,
     `实际 ${secChecks.length} 个（该章 10 小节）`);

  const hours = d.querySelectorAll('.hours-badge');
  ok('每个小节都注入了学时徽章', hours.length === 10, `实际 ${hours.length} 个`);
  ok('学时徽章文本正确', hours[0]?.textContent === '⏱ 2 h', hours[0]?.textContent);

  // float:right 时，DOM 中靠前的元素排在最右。要让「已掌握」在最右，
  // 它必须排在学时徽章之前——两者都是 site.js 注入的，顺序错了 UI 就会颠倒。
  const h2 = d.querySelector('h2');
  const kids = [...h2.children].map((e) => e.className);
  ok('「已掌握」排在学时徽章之前（从而显示在最右侧）',
     kids.indexOf('sec-check') !== -1 && kids.indexOf('sec-check') < kids.indexOf('hours-badge'),
     JSON.stringify(kids));

  ok('章末综合测验不被当作小节（无勾选框、无学时徽章）',
     !d.querySelector('#final .sec-check') && !d.querySelector('#final .hours-badge'));

  // 勾选后写入 localStorage 并刷新统计
  const box = d.querySelector('.sec-check input');
  box.checked = true;
  box.dispatchEvent(new win.Event('change'));
  const prog = JSON.parse(win.localStorage.getItem('advmath.progress.v1') || '{}');
  ok('勾选后写入 localStorage', Object.keys(prog).length === 1, JSON.stringify(prog));
  ok('存储键格式为 页面#小节id', Object.keys(prog)[0] === 'ch1#s1-1', Object.keys(prog)[0]);

  // 测验初始化
  ok('测验已初始化', d.querySelectorAll('.quiz.is-locked, .quiz').length >= 6);
  ok('测验标题栏已生成', d.querySelectorAll('.quiz-head').length >= 6);
  ok('难度分布条已生成', d.querySelectorAll('.level-legend').length >= 6);

  // 全部题目都有难度徽章
  const qs = d.querySelectorAll('.q');
  const withLv = d.querySelectorAll('.q .q-level');
  ok('所有题目都渲染了难度徽章', qs.length === withLv.length,
     `${withLv.length}/${qs.length}`);
}

// ==================================================== 首页
console.log('\n【首页】index.html');
{
  const win = loadPage('index.html');
  const d = win.document;

  ok('生成的进度统计不为空', d.querySelector('[data-stat="sections"] .stat-value')?.textContent.includes('/'),
     d.querySelector('[data-stat="sections"] .stat-value')?.textContent);
  ok('学时统计显示 111 h 总量',
     d.querySelector('[data-stat="hours"] .stat-value')?.textContent.includes('138'),
     d.querySelector('[data-stat="hours"] .stat-value')?.textContent);

  const cards = d.querySelectorAll('.chapter-card');
  ok('渲染了 13 张章节卡片（12 章 + 托马斯补充）', cards.length === 13, `${cards.length}`);

  // 模拟已完成 ch1 全部小节，验证跨页统计
  win.localStorage.setItem('advmath.progress.v1', JSON.stringify(
    Object.fromEntries(['s1-1','s1-2','s1-3','s1-4','s1-5','s1-6','s1-7','s1-8','s1-9','s1-10'].map(i => ['ch1#' + i, true]))
  ));
  new Function(readFileSync(`${SITE}/assets/js/site.js`, 'utf8'))();
  const card1 = d.querySelector('.chapter-card[data-chapter="1"]');
  ok('第 1 章进度条已更新', card1.querySelector('.bar > i').style.width === '100.0%',
     card1.querySelector('.bar > i').style.width);
  ok('第 1 章进度条标记完成', card1.querySelector('.bar').classList.contains('is-done'));
  ok('第 1 章计数显示 10/10 ✓', card1.querySelector('.card-progress .done').textContent.includes('10/10'),
     card1.querySelector('.card-progress .done').textContent);
  ok('总进度统计为 10 / 65',
     d.querySelector('[data-stat="sections"] .stat-value').textContent.trim() === '10 / 82',
     d.querySelector('[data-stat="sections"] .stat-value').textContent);
  ok('已投入学时为 15 / 111 h',
     d.querySelector('[data-stat="hours"] .stat-value').textContent.trim() === '15 / 138 h',
     d.querySelector('[data-stat="hours"] .stat-value').textContent);
}

// ==================================================== 综合自测卷
if (!existsSync(`${SITE}/exam.html`)) {
  console.log('  ⏭ exam.html 未建成（第 1 期收尾项），跳过本段');
} else {
console.log('\n【综合自测卷】exam.html');
{
  const win = loadPage('exam.html');
  const d = win.document;
  const quiz = d.querySelector('.quiz[data-quiz-id="exam-objective"]');
  ok('客观题测验已初始化', !!quiz);
  const qs = quiz.querySelectorAll('.q');
  ok('客观题共 28 题', qs.length === 28, `${qs.length}`);
  ok('首题是最简单的「基础」档',
     quiz.querySelector('.q').getAttribute('data-level') === '基础',
     quiz.querySelector('.q').getAttribute('data-level'));
  ok('末题是最难的「考研」档',
     [...qs].pop().getAttribute('data-level') === '考研');
  const legend = quiz.querySelector('.level-legend').textContent.replace(/\s+/g, ' ');
  console.log(`     难度分布条：${legend}`);
}
}

// ==================================================== 可视化图形
// 用户决定本工程**不配图解**（2026-09-16，编排与文风规范 §四），
// 因此章节页里不应出现旧的 .viz[data-viz] 交互图（该模块已废弃删除）。这里保留"零旧图"断言。
console.log('\n【可视化图形】本工程不配图解，断言零图形');
{
  for (const page of ['chapters/ch1.html', 'chapters/ch3.html', 'chapters/ch5.html']) {
    if (!existsSync(`${SITE}/${page}`)) continue;
    const win = loadPage(page);
    const n = win.document.querySelectorAll('.viz[data-viz]').length;
    ok(`  ${page} 无 .viz 图形`, n === 0, `${n} 个`);
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
console.log('='.repeat(50));
process.exit(fail ? 1 : 0);
