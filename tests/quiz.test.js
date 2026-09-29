import { Window } from 'happy-dom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
globalThis.localStorage = win.localStorage;
globalThis.CustomEvent = win.CustomEvent;
globalThis.Event = win.Event;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
};

// ---------------------------------------------------------------- 固定装置
// 故意把「考研」题排在第一题，检验引擎是否会自动重排
function mount(html) {
  win.document.body.innerHTML = html;
  new Function(readFileSync(`${SITE}/assets/js/quiz.js`, 'utf8'))();
  if (win.document.readyState === 'loading') {
    win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  }
  return win.document.querySelector('.quiz');
}

const FIXTURE = `
<div class="quiz" data-quiz-id="t1" data-title="测试卷" data-pass="0.7">
  <div class="q" data-type="single" data-level="考研">
    <p class="q-stem">考研题</p>
    <ul class="options">
      <li data-correct="true"><span class="opt-body">A对</span></li>
      <li><span class="opt-body">B错</span></li>
    </ul>
    <div class="q-explain">解析：选 A。</div>
  </div>
  <div class="q" data-type="single" data-level="基础">
    <p class="q-stem">基础题</p>
    <ul class="options">
      <li data-correct="true"><span class="opt-body">甲</span></li>
      <li><span class="opt-body">乙</span></li>
    </ul>
    <div class="q-explain">解析：选甲。</div>
  </div>
  <div class="q" data-type="multi" data-level="中等">
    <p class="q-stem">中等多选题</p>
    <ul class="options">
      <li data-correct="true"><span class="opt-body">丙</span></li>
      <li data-correct="true"><span class="opt-body">丁</span></li>
      <li><span class="opt-body">戊</span></li>
    </ul>
    <div class="q-explain">解析：丙丁。</div>
  </div>
  <div class="q" data-type="fill" data-level="基础">
    <p class="q-stem">填空：值为</p>
    <div class="q-answer" data-answer="-2"></div>
    <div class="q-explain">解析：-2。</div>
  </div>
</div>`;

// ============================================================ 1. 自动重排
console.log('\n【1】难度自动重排（HTML 里考研题写在最前）');
{
  const quiz = mount(FIXTURE);
  const qs = [...quiz.querySelectorAll('.q')];
  const order = qs.map((q) => q.dataset.level).join(',');
  ok('顺序被重排为 基础,基础,中等,考研', order === '基础,基础,中等,考研', `实际: ${order}`);
  // 稳定排序：同档题保持原有相对顺序
  const sig = qs.map((q) => q.dataset.level + '/' + q.dataset.type).join(' , ');
  ok('同档内保持原相对顺序（稳定排序）',
     sig === '基础/single , 基础/fill , 中等/multi , 考研/single', `实际: ${sig}`);
  ok('题号按新顺序重编', qs[0].querySelector('.q-no').textContent === '1'
      && qs[3].querySelector('.q-no').textContent === '4');

  const legend = quiz.querySelector('.level-legend');
  ok('渲染出难度分布条', !!legend);
  ok('分布条计数正确 (基础2 中等1 考研1)',
     legend && /基础\s*2/.test(legend.textContent) && /中等\s*1/.test(legend.textContent)
       && /考研\s*1/.test(legend.textContent),
     legend ? legend.textContent.replace(/\s+/g, ' ') : '');

  ok('渲染出标题栏', quiz.querySelector('.quiz-head h3')?.textContent === '测试卷');
  ok('每题都有难度徽章', qs.every((q) => q.querySelector('.q-level')));
}

// ============================================================ 1.5 讲评块位置回归
// 回归测试：重排题目时若用 quiz.appendChild(q)，题目会被搬到 .q-review 之后，
// 结果「讲评」显示在所有题目上方。参考工程实测 28 份测验里有 18 份中招。
console.log('\n【1.5】重排后讲评块必须仍在题目之后');
{
  const withReview = FIXTURE.replace(
    /\n<\/div>$/,
    '\n  <div class="q-review"><p>本卷讲评：仅供回归测试。</p></div>\n</div>');
  const quiz = mount(withReview);
  const kids = [...quiz.children];
  const lastQ = kids.map((e) => e.classList.contains('q')).lastIndexOf(true);
  const review = kids.findIndex((e) => e.classList.contains('q-review'));
  ok('讲评块仍排在最后一道题之后', review > lastQ, `review@${review}, lastQ@${lastQ}`);
  ok('讲评块没有被移到最前', review !== 0);
}

// ============================================================ 2. 全对判分
console.log('\n【2】全部答对的判分');
{
  const quiz = mount(FIXTURE);
  const s = quiz.querySelector('.q[data-type="single"][data-level="基础"]');
  const m = quiz.querySelector('.q[data-type="multi"]');
  const f = quiz.querySelector('.q[data-type="fill"]');
  const sQ = m.querySelectorAll('ul.options > li');

  s.querySelectorAll('ul.options > li')[0].click();            // 基础单选 → 甲
  sQ[0].click(); sQ[1].click();                                // 中等多选 → 丙丁
  f.querySelector('input').value = '−2';                       // U+2212 数学减号，不是 ASCII
  quiz.querySelector('.q[data-type="single"][data-level="考研"]')
      .querySelectorAll('ul.options > li')[0].click();
  quiz.querySelector('.btn-primary').click();

  const pct = quiz.querySelector('.quiz-score .pct').textContent;
  ok('得分 100%', pct === '100%', `实际 ${pct}`);
  ok('填空的 U+2212 减号被正确识别',
     f.querySelector('input').classList.contains('is-correct'));
  ok('多选题两个正确项都被标绿',
     sQ[0].classList.contains('is-correct') && sQ[1].classList.contains('is-correct'));
  ok('未选的干扰项未被标红', !sQ[2].classList.contains('is-incorrect'));
  ok('提交后按钮禁用', quiz.querySelector('.btn-primary').disabled);
  ok('测验进入锁定态', quiz.classList.contains('is-locked'));
}

// ============================================================ 3. 全错判分
console.log('\n【3】答错时的判分与解析');
{
  const quiz = mount(FIXTURE);
  const s = quiz.querySelector('.q[data-type="single"][data-level="基础"]');
  const m = quiz.querySelector('.q[data-type="multi"]');
  const f = quiz.querySelector('.q[data-type="fill"]');
  const li = m.querySelectorAll('ul.options > li');

  s.querySelectorAll('ul.options > li')[1].click();            // 选错
  li[0].click(); li[1].click(); li[2].click();                 // 多选：多选了一个干扰项
  f.querySelector('input').value = '999';                      // 填空错
  quiz.querySelector('.btn-primary').click();

  const pct = quiz.querySelector('.quiz-score .pct').textContent;
  ok('得分 0%', pct === '0%', `实际 ${pct}`);
  ok('多选的干扰项被标红', li[2].classList.contains('is-incorrect'));
  ok('正确项同时标绿以便对照', li[0].classList.contains('is-correct'));
  ok('解析框已展开', s.querySelector('.q-feedback').classList.contains('is-shown'));
  ok('解析框标记为错误', s.querySelector('.q-feedback').classList.contains('is-wrong'));
  ok('填空题输入框标红', f.querySelector('input').classList.contains('is-incorrect'));
  ok('填空题内容保留未泄露答案',
     !!f.querySelector('.q-answer')?.style.display);
}

// ============================================================ 4. 重做
console.log('\n【4】重做功能');
{
  const quiz = mount(FIXTURE);
  const qs = [...quiz.querySelectorAll('.q')];
  qs[0].querySelectorAll('ul.options > li')[0].click();
  quiz.querySelector('.btn-primary').click();
  quiz.querySelector('.btn-ghost').click();                    // 「重做」

  ok('重做后解锁', !quiz.classList.contains('is-locked'));
  ok('重做后按钮恢复', !quiz.querySelector('.btn-primary').disabled);
  ok('重做后清空选择', !qs[0].querySelector('li').classList.contains('is-picked'));
  ok('重做后收起解析',
     !qs[0].querySelector('.q-feedback').classList.contains('is-shown'));
  ok('重做后分数清空', quiz.querySelector('.quiz-score .pct').textContent === '—');
}

// ============================================================ 5. 成绩持久化
console.log('\n【5】成绩写入 localStorage');
{
  win.localStorage.clear();
  const quiz = mount(FIXTURE);
  quiz.querySelectorAll('.q').forEach((q) => {
    if (q.dataset.type === 'fill') { q.querySelector('input').value = '-2'; }
    else {
      q.querySelectorAll('ul.options > li').forEach((li) => {
        if (li.dataset.correct === 'true') li.click();
      });
    }
  });
  quiz.querySelector('.btn-primary').click();
  const saved = JSON.parse(win.localStorage.getItem('advmath.quiz.v1') || '{}');
  ok('成绩已落盘', !!saved['t1'], JSON.stringify(saved));
  ok('落盘数据正确 (4/4)', saved['t1']?.correct === 4 && saved['t1']?.total === 4,
     JSON.stringify(saved['t1']));
}

// ============================================================ 6. 填空归一化
console.log('\n【6】填空答案归一化');
{
  const norm = (s) => String(s)
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[−–—―－─]/g, '-')
    .replace(/　/g, '').replace(/\s+/g, '')
    .replace(/[。．.；;，,]$/g, '').toLowerCase();

  ok('U+2212 数学减号 → -', norm('−2') === '-2');
  ok('全角负号 －2 → -2', norm('－2') === '-2');
  ok('en-dash –2 → -2', norm('–2') === '-2');
  ok('带空格 " - 2 " → -2', norm(' - 2 ') === '-2');
  ok('全角空格被去除', norm('1　6') === '16');
  ok('末尾句号被去除', norm('16.') === '16');
  ok('N-R 大小写归一', norm('N-R') === 'n-r');
}

console.log(`\n${'='.repeat(50)}`);
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
console.log('='.repeat(50));
process.exit(fail ? 1 : 0);
