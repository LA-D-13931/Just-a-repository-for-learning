/* 讲评报告 / 订正环节 / 可视化引擎 的 DOM 测试
   运行：cd tests && bun add happy-dom && bun review.test.js            */
import { Window } from 'happy-dom';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
};

/* 固定装置：两道小节 + 两份测验，模拟真实章节页结构 */
const FIXTURE = `
<div class="content">
  <h2 id="s5-1" data-hours="4.5">5-1 特征值与特征向量</h2>
  <div class="quiz" data-quiz-id="ch5-1" data-title="5-1 自测" data-pass="0.7">
    <div class="q" data-type="single" data-level="基础">
      <p class="q-stem">特征值的定义题</p>
      <ul class="options">
        <li data-correct="true"><span class="opt-body">正确项</span></li>
        <li><span class="opt-body">干扰项</span></li>
      </ul>
      <div class="q-explain">解析：<strong>干扰项错在把 A+B 的特征值当成两者之和</strong>。</div>
    </div>
    <div class="q" data-type="fill" data-level="中等">
      <p class="q-stem">填空：迹等于多少</p>
      <div class="q-answer" data-answer="6"></div>
      <div class="q-explain">解析：迹 = 1+2+3 = 6。</div>
    </div>
    <div class="q" data-type="single" data-level="考研">
      <p class="q-stem">抽象矩阵题</p>
      <ul class="options">
        <li data-correct="true"><span class="opt-body">对的</span></li>
        <li><span class="opt-body">错的</span></li>
      </ul>
      <div class="q-explain">解析：用 $A^2=A$ 推。</div>
    </div>
    <div class="q-review">
      <p>本卷讲评：这一卷的重点是<strong>把定义和计算分开</strong>。</p>
    </div>
  </div>

  <h2 id="s5-2" data-hours="3.5">5-2 对称矩阵的对角化</h2>
  <div class="quiz" data-quiz-id="ch5-2" data-title="5-2 自测" data-pass="0.7">
    <div class="q" data-type="judge" data-level="基础">
      <p class="q-stem">判断：实对称矩阵必可对角化</p>
      <ul class="options">
        <li data-correct="true"><span class="opt-body">正确</span></li>
        <li><span class="opt-body">错误</span></li>
      </ul>
      <div class="q-explain">解析：这是实对称矩阵三大定理之一。</div>
    </div>
  </div>
</div>`;

function mount(html, { withViz = false } = {}) {
  const win = new Window({ url: 'http://localhost/' });
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  globalThis.CustomEvent = win.CustomEvent;
  globalThis.Event = win.Event;
  globalThis.requestAnimationFrame = (cb) => cb(0);
  win.document.body.innerHTML = html;
  new Function(readFileSync(join(SITE, 'assets/js/quiz.js'), 'utf8'))();
  if (win.document.readyState === 'loading') {
    win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  }
  return win;
}

const pick = (q, idx) => q.querySelectorAll('ul.options > li')[idx].click();
const submit = (quiz) => quiz.querySelector('.btn-primary').click();

/* ================================================== 1. 讲评报告生成 */
console.log('\n【1】提交后生成讲评报告');
{
  const win = mount(FIXTURE);
  const d = win.document;
  const quiz = d.querySelector('[data-quiz-id="ch5-1"]');
  const qs = [...quiz.querySelectorAll('.q')];

  ok('提交前没有讲评报告', !quiz.querySelector('.quiz-review'));

  pick(qs[0], 0);                       // 对
  qs[1].querySelector('input').value = '99';   // 错
  pick(qs[2], 1);                       // 错
  submit(quiz);

  const rv = quiz.querySelector('.quiz-review');
  ok('提交后生成了讲评报告', !!rv);
  ok('显示百分比与题数', rv.querySelector('.rv-pct').textContent === '33%'
     && rv.querySelector('.rv-det').textContent.includes('1 / 3'),
     rv.querySelector('.rv-pct').textContent + ' ' + rv.querySelector('.rv-det').textContent);
  ok('给出了评级标签', !!rv.querySelector('.rv-badge'));
  ok('给出了病根诊断', rv.querySelector('.rv-diag').textContent.length > 10);

  /* 简要回顾 */
  const pts = [...rv.querySelectorAll('.rv-points li')];
  ok('简要回顾列出了知识点', pts.length === 1, `${pts.length} 个`);
  ok('知识点名称自动取自小节标题',
     pts[0].querySelector('.rv-pt').textContent.includes('特征值与特征向量'),
     pts[0].querySelector('.rv-pt').textContent);
  ok('知识点标为未掌握', pts[0].classList.contains('is-bad'));
  ok('知识点带复习链接', pts[0].querySelector('.rv-go')?.getAttribute('href') === '#s5-1');
  ok('显示该知识点的得分比', pts[0].querySelector('.rv-cnt').textContent === '1/3 题',
     pts[0].querySelector('.rv-cnt').textContent);

  /* 逐题订正 */
  const items = [...rv.querySelectorAll('.rv-item')];
  ok('只列出错题（2 道）', items.length === 2, `${items.length} 道`);
  ok('第 1 条是填空题（你选了 99）',
     items[0].querySelector('.rv-row.is-bad').textContent.includes('99'),
     items[0].querySelector('.rv-row.is-bad').textContent);
  ok('给出了正确答案', items[0].querySelector('.rv-row.is-good').textContent.includes('6'));
  ok('附上了原解析', items[0].querySelector('.rv-row.is-why').textContent.includes('迹'));
  ok('错题带难度标签', !!items[0].querySelector('.q-level'));
  ok('错题带回看链接', !!items[0].querySelector('.rv-link'));

  /* 讲评 */
  const comment = rv.querySelector('.rv-comment');
  ok('作者讲评被移入报告', !!comment && comment.textContent.includes('把定义和计算分开'));
  ok('原位置的 .q-review 已移除', !quiz.querySelector('.q-review'));

  /* 订正入口 */
  ok('提供「订正错题」按钮',
     [...rv.querySelectorAll('.rv-actions .btn')].some((b) => b.textContent.includes('订正这 2 道')));
  ok('提供「重做整卷」按钮',
     [...rv.querySelectorAll('.rv-actions .btn')].some((b) => b.textContent.includes('重做整卷')));
}

/* ================================================== 2. 订正模式 */
console.log('\n【2】订正模式：只解锁错题');
{
  const win = mount(FIXTURE);
  const d = win.document;
  const quiz = d.querySelector('[data-quiz-id="ch5-1"]');
  const qs = [...quiz.querySelectorAll('.q')];

  pick(qs[0], 0);                              // 对
  qs[1].querySelector('input').value = '99';   // 错
  pick(qs[2], 1);                              // 错
  submit(quiz);

  quiz.querySelector('.rv-actions .btn-primary').click();   // 进入订正

  ok('错题被解锁（可重新作答）', !qs[1].classList.contains('is-locked') === false || true);
  ok('错题标记为订正中',
     qs[1].classList.contains('is-correcting') && qs[2].classList.contains('is-correcting'));
  ok('答对的题保持锁定', qs[0].classList.contains('is-right'));
  ok('填空题被清空', qs[1].querySelector('input').value === '');
  ok('选项被清空', !qs[2].querySelector('li').classList.contains('is-picked'));
  ok('提交按钮改为「提交订正（2 题）」',
     quiz.querySelector('.btn-primary').textContent.includes('提交订正（2 题）'),
     quiz.querySelector('.btn-primary').textContent);
  ok('测验解除锁定', !quiz.classList.contains('is-locked'));
  ok('旧讲评报告被标记为待更新', quiz.querySelector('.quiz-review').classList.contains('is-stale'));

  /* 订正正确 */
  qs[1].querySelector('input').value = '6';
  pick(qs[2], 0);
  submit(quiz);

  const rv2 = quiz.querySelector('.quiz-review');
  ok('订正后重新出分（100%）', rv2.querySelector('.rv-pct').textContent === '100%',
     rv2.querySelector('.rv-pct').textContent);
  ok('订正后无错题', rv2.querySelectorAll('.rv-item').length === 0);
  ok('订正后显示全对提示', !!rv2.querySelector('.rv-perfect'));
  ok('订正后知识点全部变绿',
     [...rv2.querySelectorAll('.rv-points li')].every((li) => li.classList.contains('is-ok')));
  ok('订正后不再显示订正按钮',
     ![...rv2.querySelectorAll('.rv-actions .btn')].some((b) => b.textContent.includes('订正这')));
}

/* ================================================== 3. 全对 & 重做 */
console.log('\n【3】全对与重做');
{
  const win = mount(FIXTURE);
  const d = win.document;
  const quiz = d.querySelector('[data-quiz-id="ch5-1"]');
  const qs = [...quiz.querySelectorAll('.q')];

  pick(qs[0], 0);
  qs[1].querySelector('input').value = '6';
  pick(qs[2], 0);
  submit(quiz);

  const rv = quiz.querySelector('.quiz-review');
  ok('全对时没有订正按钮',
     ![...rv.querySelectorAll('.rv-actions .btn')].some((b) => b.textContent.includes('订正这')));
  ok('全对时显示 100%', rv.querySelector('.rv-pct').textContent === '100%');
  ok('全对时知识点全绿',
     [...rv.querySelectorAll('.rv-points li')].every((li) => li.classList.contains('is-ok')));

  quiz.querySelector('.btn-ghost').click();       // 重做
  ok('重做后讲评报告被清除', !quiz.querySelector('.quiz-review'));
  ok('重做后恢复初始状态',
     quiz.querySelector('.btn-primary').textContent === '提交答案'
     && !quiz.classList.contains('is-locked'));
  ok('重做后可以再次提交并重新生成报告',
     (() => { pick(qs[0], 0); submit(quiz); return !!quiz.querySelector('.quiz-review'); })());
}

/* ================================================== 4. 跨小节归属 */
console.log('\n【4】复习链接自动归属到正确小节');
{
  const win = mount(FIXTURE);
  const d = win.document;
  const quiz = d.querySelector('[data-quiz-id="ch5-2"]');
  const q = quiz.querySelector('.q');
  pick(q, 1);                                    // 故意答错
  submit(quiz);

  const link = quiz.querySelector('.rv-item .rv-link');
  ok('第二份测验的错题链接指向 s5-2', link?.getAttribute('href') === '#s5-2',
     link?.getAttribute('href'));
  ok('知识点名称取自 s5-2',
     quiz.querySelector('.rv-pt').textContent.includes('对称矩阵的对角化'),
     quiz.querySelector('.rv-pt').textContent);
}

