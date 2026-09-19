/* ==========================================================================
   quiz.js — 测验引擎
   --------------------------------------------------------------------------
   零依赖。自动扫描页面中的 .quiz 容器并转为可交互测验。

   题目 HTML 写法（作者只需写标记，无需写任何 JS）：

   单选题：
     <div class="q" data-type="single">
       <p class="q-stem">题干，可含 $公式$</p>
       <ul class="options">
         <li data-correct="true"><span class="opt-body">正确选项</span></li>
         <li><span class="opt-body">干扰项</span></li>
       </ul>
       <div class="q-explain">解析（可选）</div>
     </div>

   多选题： data-type="multi" ，给多个 li 加 data-correct="true"

   判断题： data-type="judge" ，两个 li：正确 / 错误，正确项加 data-correct="true"

   填空题：
     <div class="q" data-type="fill">
       <p class="q-stem">题干</p>
       <div class="q-answer" data-answer="答案1|答案2"></div>   <!-- | 分隔多个可接受答案 -->
       <div class="q-explain">解析</div>
     </div>

   整卷容器：
     <div class="quiz" data-quiz-id="ch1-1" data-title="1-1 自测" data-pass="0.7">
       ...题目...
     </div>
   ========================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'advmath.quiz.v1';
  var LETTERS = 'ABCDEFGH';

  /* ---------------- 存储 ---------------- */

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveStore(store) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      /* 隐私模式 / 配额已满：静默降级，不影响做题 */
    }
  }

  /* ---------------- 工具 ---------------- */

  // 归一化填空答案：去空白、全角转半角、统一各种减号、去末尾标点、统一大小写
  function normalize(str) {
    return String(str)
      // 全角 → 半角（！到～ 的连续区间）
      .replace(/[！-～]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
      })
      // 各种"减号"统一：U+2212 数学减号、en/em dash、全角连字符
      .replace(/[−–—―－─]/g, '-')
      .replace(/　/g, '')
      .replace(/\s+/g, '')
      .replace(/[。．.；;，,]$/g, '')
      .toLowerCase();
  }

  function acceptedAnswers(q) {
    var holder = q.querySelector('.q-answer');
    if (!holder) return [];
    var raw = holder.getAttribute('data-answer') || '';
    return raw.split('|').map(normalize).filter(function (s) { return s.length > 0; });
  }

  /* ---------------- 讲评用的元数据 ---------------- */

  // 克隆渲染好的节点（保留 MathJax 排版），并去掉 id 避免重复
  function cloneRich(node) {
    if (!node) return document.createTextNode('');
    var c = node.cloneNode(true);
    if (c.querySelectorAll) {
      Array.prototype.forEach.call(c.querySelectorAll('[id]'), function (n) {
        n.removeAttribute('id');
      });
    }
    return c;
  }

  // 向上回溯，找到本题所属的小节标题（h2[id]）
  function findSection(node) {
    var cur = node;
    while (cur && cur !== document.body) {
      var sib = cur.previousElementSibling;
      while (sib) {
        if (sib.tagName === 'H2' && sib.id) return sib;
        var inner = sib.querySelectorAll ? sib.querySelectorAll('h2[id]') : [];
        if (inner.length) return inner[inner.length - 1];
        sib = sib.previousElementSibling;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  // 知识点名称：优先取作者写的 data-point，否则用小节标题
  function pointOf(q) {
    var p = q.getAttribute('data-point');
    if (p) return p;
    var sec = findSection(q);
    if (sec) {
      return sec.textContent
        .replace(/⏱[^已]*$/, '')               // 去掉学时徽章
        .replace(/已掌握/g, '')
        .replace(/^\s*[\d\-\.]+\s*/, '')
        .trim();
    }
    return '本卷综合';
  }

  // 复习链接：优先 data-ref，否则回到所属小节
  function refOf(q) {
    var r = q.getAttribute('data-ref');
    if (r) return r;
    var sec = findSection(q);
    return sec ? sec.id : '';
  }

  // data-ref 可以是本页锚点（s5-1），也可以是跨页路径（chapters/ch5.html#s5-1）
  function hrefOf(ref) {
    if (!ref) return '';
    return ref.indexOf('.html') !== -1 ? ref : ('#' + ref);
  }

  // 选项的可读文本（保留公式排版）
  function optRich(li) {
    var body = li.querySelector('.opt-body') || li;
    var key = li.querySelector('.key');
    var wrap = document.createElement('span');
    if (key) {
      var k = document.createElement('b');
      k.className = 'rv-key';
      k.textContent = key.textContent + '.';
      wrap.appendChild(k);
    }
    wrap.appendChild(cloneRich(body));
    return wrap;
  }

  function plainOf(node) {
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  /* ---------------- 单题构建 ---------------- */

  function buildQuestion(q, index, quiz) {
    q.dataset.qIndex = String(index);

    var type = (q.getAttribute('data-type') || 'single').toLowerCase();
    var head = document.createElement('div');
    head.className = 'q-head';

    var no = document.createElement('span');
    no.className = 'q-no';
    no.textContent = String(index + 1);

    var stem = q.querySelector('.q-stem');
    if (!stem) {
      stem = document.createElement('div');
      stem.className = 'q-stem';
    }

    var typeLabel = document.createElement('span');
    typeLabel.className = 'q-type';
    typeLabel.textContent = { single: '单选', multi: '多选', judge: '判断', fill: '填空' }[type] || '单选';

    head.appendChild(no);
    q.insertBefore(head, q.firstChild);
    head.appendChild(stem);

    // 难度徽章：由 data-level 驱动（基础 / 中等 / 考研）
    var level = q.getAttribute('data-level');
    if (level) {
      var lv = document.createElement('span');
      lv.className = 'q-level';
      lv.setAttribute('data-level', level);
      lv.textContent = level;
      lv.title = '难度：' + level;
      head.appendChild(lv);
    }

    head.appendChild(typeLabel);

    if (type === 'fill') {
      buildFill(q);
    } else {
      buildChoice(q, type);
    }

    // 解析：把 .q-explain 转成隐藏的反馈块
    var explain = q.querySelector('.q-explain');
    var feedback = document.createElement('div');
    feedback.className = 'q-feedback';
    var fbHead = document.createElement('div');
    fbHead.className = 'fb-head';
    var fbBody = document.createElement('div');
    fbBody.className = 'fb-body';
    if (explain) {
      while (explain.firstChild) fbBody.appendChild(explain.firstChild);
      explain.parentNode.removeChild(explain);
    }
    feedback.appendChild(fbHead);
    feedback.appendChild(fbBody);
    q.appendChild(feedback);
    q._feedback = feedback;
    q._fbHead = fbHead;
    q._type = type;
  }

  function buildChoice(q, type) {
    var list = q.querySelector('ul.options');
    if (!list) return;
    list.setAttribute('role', type === 'multi' ? 'group' : 'radiogroup');

    var items = Array.prototype.slice.call(list.children);
    items.forEach(function (li, i) {
      var key = document.createElement('span');
      key.className = 'key';
      key.textContent = LETTERS[i] || String(i + 1);

      // 若作者未包 .opt-body，则把裸文本包一层，保证样式一致
      var body = li.querySelector('.opt-body');
      if (!body) {
        body = document.createElement('span');
        body.className = 'opt-body';
        while (li.firstChild) body.appendChild(li.firstChild);
        li.appendChild(body);
      }
      li.insertBefore(key, li.firstChild);
      li.setAttribute('role', type === 'multi' ? 'checkbox' : 'radio');
      li.setAttribute('aria-checked', 'false');
      li.setAttribute('tabindex', '0');

      var activate = function () {
        if (q._locked) return;
        if (type === 'multi') {
          li.classList.toggle('is-picked');
        } else {
          items.forEach(function (o) {
            o.classList.remove('is-picked');
            o.setAttribute('aria-checked', 'false');
          });
          li.classList.add('is-picked');
        }
        li.setAttribute('aria-checked', li.classList.contains('is-picked') ? 'true' : 'false');
      };

      li.addEventListener('click', activate);
      li.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          activate();
        }
      });
    });
  }

  function buildFill(q) {
    var holder = q.querySelector('.q-answer');
    var inputs = [];
    var count = 1;
    if (holder) {
      var c = parseInt(holder.getAttribute('data-blanks') || '1', 10);
      if (!isNaN(c) && c > 1) count = c;
    }

    var row = document.createElement('div');
    row.className = 'fill-row';
    for (var i = 0; i < count; i++) {
      var input = document.createElement('input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.placeholder = count > 1 ? '第 ' + (i + 1) + ' 空' : '在此输入答案';
      input.setAttribute('aria-label', '第 ' + (i + 1) + ' 空答案');
      inputs.push(input);
      row.appendChild(input);
    }
    // 提示行（作者可在 .q-answer 里写 data-hint）
    if (holder && holder.getAttribute('data-hint')) {
      var hint = document.createElement('span');
      hint.className = 'fill-hint';
      hint.textContent = '提示：' + holder.getAttribute('data-hint');
      row.appendChild(hint);
    }
    if (holder) holder.style.display = 'none';
    q.appendChild(row);
    q._inputs = inputs;
  }

  /* ---------------- 判分 ---------------- */

  function gradeQuestion(q) {
    var type = q._type;
    if (type === 'fill') {
      var accepted = acceptedAnswers(q);
      var inputs = q._inputs || [];
      var ok = inputs.length > 0;
      var given = [];
      inputs.forEach(function (inp, i) {
        // 多空时：答案按 | 分组对应各空；不足则整体匹配
        var mine;
        if (inputs.length > 1 && accepted.length >= inputs.length) {
          mine = [accepted[i]];
        } else {
          mine = accepted;
        }
        var val = normalize(inp.value);
        var good = val.length > 0 && mine.indexOf(val) !== -1;
        inp.classList.toggle('is-correct', good);
        inp.classList.toggle('is-incorrect', !good);
        inp.disabled = true;
        if (!good) ok = false;
        given.push(inp.value.trim());
      });
      var holder = q.querySelector('.q-answer');
      var rawAns = holder ? (holder.getAttribute('data-answer') || '') : '';
      return {
        correct: ok,
        answered: inputs.some(function (i) { return i.value.trim() !== ''; }),
        picked: given.filter(Boolean).join('，'),
        answer: rawAns.split('|').slice(0, 4).join(' 或 ')
      };
    }

    var items = Array.prototype.slice.call(q.querySelectorAll('ul.options > li'));
    var picked = items.filter(function (li) { return li.classList.contains('is-picked'); });
    var correctSet = items.filter(function (li) { return li.getAttribute('data-correct') === 'true'; });

    items.forEach(function (li) {
      var isCorrect = li.getAttribute('data-correct') === 'true';
      var isPicked = li.classList.contains('is-picked');
      li.classList.remove('is-picked');
      if (isCorrect) li.classList.add('is-correct');
      if (isPicked && !isCorrect) li.classList.add('is-incorrect');
      li.setAttribute('aria-checked', isCorrect ? 'true' : 'false');
    });

    var pickedCorrect = picked.filter(function (li) { return li.getAttribute('data-correct') === 'true'; });
    var allCorrect = pickedCorrect.length === correctSet.length &&
                     picked.length === correctSet.length &&
                     correctSet.length > 0;

    // 讲评需要：学生选了什么、正确答案是什么（保留公式排版）
    q._pickedNodes = picked.map(optRich);
    q._answerNodes = correctSet.map(optRich);

    return {
      correct: allCorrect,
      answered: picked.length > 0,
      picked: picked.map(plainOf).join('；'),
      answer: correctSet.map(plainOf).join('；')
    };
  }

  /* ---------------- 整卷逻辑 ---------------- */

  function initQuiz(quiz) {
    var questions = Array.prototype.slice.call(quiz.querySelectorAll('.q'));
    if (!questions.length) return;

    var id = quiz.getAttribute('data-quiz-id') || ('quiz-' + Math.random().toString(36).slice(2, 9));
    quiz.dataset.quizId = id;
    var passRate = parseFloat(quiz.getAttribute('data-pass') || '0.7');

    // 按难度稳定重排，保证"由浅入深"。
    // 作者在 HTML 里怎么排都不影响最终顺序；加 data-sort="none" 可关闭。
    var LEVELS = { '基础': 1, '中等': 2, '考研': 3 };
    if (quiz.getAttribute('data-sort') !== 'none') {
      var before = questions.slice();
      questions.sort(function (a, b) {
        var la = LEVELS[a.getAttribute('data-level')] || 2;
        var lb = LEVELS[b.getAttribute('data-level')] || 2;
        return la - lb;
      });
      var moved = questions.some(function (q, i) { return q !== before[i]; });
      if (moved) {
        // 重排后必须插回「第一个非题目元素」之前。
        // 本文件原本用的是 quiz.appendChild(q)，但 .quiz 里除题目外还有作者写的
        // .q-review 讲评块，appendChild 会把题目全部搬到它后面 —— 讲评就显示在
        // 题目上面了（参考工程实测 28 份测验里有 18 份被这样排错）。
        // 取第一个不是题目的子元素作锚点；若没有这样的元素，
        // insertBefore(q, null) 等价于 appendChild，行为与原来一致。
        var anchor = null;
        for (var ci = 0; ci < quiz.children.length; ci++) {
          if (questions.indexOf(quiz.children[ci]) === -1) { anchor = quiz.children[ci]; break; }
        }
        questions.forEach(function (q) { quiz.insertBefore(q, anchor); });
      }
    }

    questions.forEach(function (q, i) {
      q._locked = false;
      buildQuestion(q, i, quiz);
    });

    // 标题栏（由 data-title 生成）
    var title = quiz.getAttribute('data-title');
    if (title) {
      var head = document.createElement('div');
      head.className = 'quiz-head';
      var h3 = document.createElement('h3');
      /* 中文模式下标题只显示中文：data-title 形如「1-1 映射与函数 · 自测 / Mappings · Self-Test」，
         把「 / 」之后的英文包进 .en-inline，交给 CSS（[data-lang="zh"] .en-inline{display:none}）隐藏。
         用户在中文模式下会在侧栏与标题栏看到英文残留（2026-09-17 反馈 2/4）。 */
      var cut = title.indexOf(' / ');
      if (cut > 0) {
        h3.appendChild(document.createTextNode(title.slice(0, cut)));
        var enSpan = document.createElement('span');
        enSpan.className = 'en-inline';
        enSpan.textContent = title.slice(cut);
        h3.appendChild(enSpan);
      } else {
        h3.textContent = title;
      }
      var meta = document.createElement('span');
      meta.className = 'quiz-meta';
      meta.textContent = '共 ' + questions.length + ' 题';
      head.appendChild(h3);
      head.appendChild(meta);
      quiz.insertBefore(head, quiz.firstChild);
    }

    // 难度分布条：让"循序渐进"看得见
    var levels = questions.map(function (q) { return q.getAttribute('data-level'); });
    if (levels.some(Boolean)) {
      var counts = { '基础': 0, '中等': 0, '考研': 0 };
      levels.forEach(function (l) { if (l in counts) counts[l]++; });
      var legend = document.createElement('div');
      legend.className = 'level-legend';
      legend.innerHTML =
        '<span class="lg"><i class="dot d1"></i>基础 ' + counts['基础'] + '</span>' +
        '<span class="lg"><i class="dot d2"></i>中等 ' + counts['中等'] + '</span>' +
        '<span class="lg"><i class="dot d3"></i>考研 ' + counts['考研'] + '</span>' +
        '<span class="note">难度由浅入深排列</span>';
      quiz.insertBefore(legend, questions[0]);
    }

    // 操作栏
    var actions = document.createElement('div');
    actions.className = 'quiz-actions';

    var btnSubmit = document.createElement('button');
    btnSubmit.className = 'btn btn-primary';
    btnSubmit.type = 'button';
    btnSubmit.textContent = '提交答案';

    var btnReveal = document.createElement('button');
    btnReveal.className = 'btn';
    btnReveal.type = 'button';
    btnReveal.textContent = '显示答案';

    var btnRetry = document.createElement('button');
    btnRetry.className = 'btn btn-ghost';
    btnRetry.type = 'button';
    btnRetry.textContent = '重做';
    btnRetry.style.display = 'none';

    var score = document.createElement('div');
    score.className = 'quiz-score';
    score.innerHTML = '<span class="pct">—</span> <span class="det"></span>';

    actions.appendChild(btnSubmit);
    actions.appendChild(btnReveal);
    actions.appendChild(btnRetry);
    actions.appendChild(score);
    quiz.appendChild(actions);

    quiz._score = score;
    quiz._btnSubmit = btnSubmit;
    quiz._btnReveal = btnReveal;
    quiz._btnRetry = btnRetry;

    btnSubmit.addEventListener('click', function () { finish(quiz, questions, passRate, false); });
    btnReveal.addEventListener('click', function () { finish(quiz, questions, passRate, true); });
    btnRetry.addEventListener('click', function () { resetQuiz(quiz, questions); });

    // 恢复历史成绩
    var past = loadStore()[id];
    if (past) renderScore(quiz, past.correct, past.total, passRate, true);
  }

  /* ---------------- 讲评报告 ---------------- */

  var BANDS = [
    { min: 0.90, name: '优秀',     tip: '定义、计算、综合应用都过关了，可以放心进入下一节。' },
    { min: 0.80, name: '良好',     tip: '基础扎实，个别综合题还不够熟练，属于正常水平。' },
    { min: 0.70, name: '中等',     tip: '基本概念懂了，但题目一变形就容易卡住——需要再练。' },
    { min: 0.60, name: '及格边缘', tip: '有些定义还没吃透。请回看错题所在小节，别急着往下走。' },
    { min: -1,   name: '需要重学', tip: '不要继续推进了。回读本节的定义与例题，把定义默写一遍再回来。' }
  ];

  // 根据错题的难度档位，给出"病根在哪"的诊断
  function diagnose(questions, results) {
    var f = { '基础': 0, '中等': 0, '考研': 0 };
    var t = { '基础': 0, '中等': 0, '考研': 0 };
    questions.forEach(function (q, i) {
      var lv = q.getAttribute('data-level');
      if (!(lv in f)) return;
      t[lv]++;
      if (!results[i] || !results[i].correct) f[lv]++;
    });
    if (t['基础'] && f['基础'] >= Math.max(2, t['基础'] * 0.5)) {
      return { kind: 'warn', text: '⚠️ <strong>病根在基础上。</strong>基础档错了 ' + f['基础'] +
        ' 题——这不是"难题不会"，而是<strong>定义没记准</strong>。' +
        '请回读本节的定义，把每个词的条件逐字看清楚。' };
    }
    if (f['基础'] === 0 && f['考研'] > 0 && f['中等'] === 0) {
      return { kind: 'ok', text: '✓ <strong>基础与中等档全对</strong>，失分只集中在考研档。' +
        '这是完全正常的——说明概念已经清楚，差的是综合运用与熟练度，' +
        '可以继续往下学，二轮复习时再回来攻这类题。' };
    }
    if (f['基础'] === 0 && f['中等'] > 0) {
      return { kind: '', text: '基础档全对，说明定义掌握了。' +
        '中等档有失分，通常是<strong>计算不够熟</strong>或<strong>条件看漏了</strong>——' +
        '把例题遮住答案自己再写一遍即可。' };
    }
    return { kind: '', text: '错题分布较散，建议按下面的「逐题订正」逐条过一遍，' +
      '重点读每道题解析里<strong>错误选项为什么错</strong>。' };
  }

  function buildReview(quiz, questions, results, passRate) {
    var old = quiz.querySelector('.quiz-review');
    if (old) old.parentNode.removeChild(old);

    var total = questions.length;
    var correct = results.filter(function (r) { return r && r.correct; }).length;
    var rate = total ? correct / total : 0;
    var band = BANDS.filter(function (b) { return rate >= b.min; })[0] || BANDS[BANDS.length - 1];

    var panel = document.createElement('div');
    panel.className = 'quiz-review';

    /* ① 总评 */
    var head = document.createElement('div');
    head.className = 'rv-head';
    head.innerHTML =
      '<div class="rv-head-l"><span class="rv-badge ' + band.cls + '">' + band.name + '</span>' +
      '<span class="rv-title">讲评报告</span></div>' +
      '<div class="rv-head-r"><span class="rv-pct">' + Math.round(rate * 100) + '%</span>' +
      '<span class="rv-det">' + correct + ' / ' + total + ' 题</span></div>';
    panel.appendChild(head);

    var bandTip = document.createElement('p');
    bandTip.className = 'rv-band';
    bandTip.innerHTML = band.tip;
    panel.appendChild(bandTip);

    var diag = diagnose(questions, results);
    var diagEl = document.createElement('div');
    diagEl.className = 'rv-diag' + (diag.kind ? ' is-' + diag.kind : '');
    diagEl.innerHTML = diag.text;
    panel.appendChild(diagEl);

    /* ② 简要回顾：按知识点聚合 */
    var byPoint = {};
    questions.forEach(function (q, i) {
      var p = pointOf(q);
      if (!byPoint[p]) byPoint[p] = { ok: 0, bad: 0, ref: refOf(q) };
      if (results[i] && results[i].correct) byPoint[p].ok++; else byPoint[p].bad++;
    });

    var sec2 = document.createElement('div');
    sec2.className = 'rv-sec';
    sec2.innerHTML = '<h5 class="rv-h5">📋 简要回顾 · 本次考查的知识点</h5>';
    var ul = document.createElement('ul');
    ul.className = 'rv-points';
    Object.keys(byPoint).forEach(function (p) {
      var d = byPoint[p];
      var allOk = d.bad === 0;
      var li = document.createElement('li');
      li.className = allOk ? 'is-ok' : 'is-bad';
      var mark = document.createElement('span');
      mark.className = 'rv-mark';
      mark.textContent = allOk ? '✓' : '✗';
      var name = document.createElement('span');
      name.className = 'rv-pt';
      name.textContent = p;
      var cnt = document.createElement('span');
      cnt.className = 'rv-cnt';
      cnt.textContent = d.ok + '/' + (d.ok + d.bad) + ' 题';
      li.appendChild(mark); li.appendChild(name); li.appendChild(cnt);
      if (!allOk && d.ref) {
        var a = document.createElement('a');
        a.href = hrefOf(d.ref);
        a.className = 'rv-go';
        a.textContent = '回看 →';
        li.appendChild(a);
      }
      ul.appendChild(li);
    });
    sec2.appendChild(ul);
    panel.appendChild(sec2);

    /* ③ 逐题订正 */
    var sec3 = document.createElement('div');
    sec3.className = 'rv-sec';
    sec3.innerHTML = '<h5 class="rv-h5">✍️ 逐题订正 · 你的答案 vs 正确答案</h5>';

    var wrongCount = 0;
    questions.forEach(function (q, i) {
      var r = results[i];
      if (r && r.correct) return;
      wrongCount++;

      var item = document.createElement('div');
      item.className = 'rv-item';

      var ih = document.createElement('div');
      ih.className = 'rv-item-head';
      var lv = q.getAttribute('data-level') || '';
      ih.innerHTML = '<span class="rv-no">第 ' + (i + 1) + ' 题</span>' +
        (lv ? '<span class="q-level" data-level="' + lv + '">' + lv + '</span>' : '') +
        '<span class="rv-pt-name">' + pointOf(q) + '</span>' +
        (r && r.answered ? '' : '<span class="rv-skip">未作答</span>');
      item.appendChild(ih);

      var stem = document.createElement('div');
      stem.className = 'rv-stem';
      var qs = q.querySelector('.q-stem');
      stem.appendChild(cloneRich(qs));
      item.appendChild(stem);

      function row(label, content, cls) {
        var d = document.createElement('div');
        d.className = 'rv-row' + (cls ? ' ' + cls : '');
        var b = document.createElement('b');
        b.textContent = label;
        d.appendChild(b);
        if (typeof content === 'string') {
          var s = document.createElement('span');
          s.textContent = content || '（空）';
          d.appendChild(s);
        } else {
          d.appendChild(content);
        }
        return d;
      }

      var yourNodes = q._pickedNodes && q._pickedNodes.length
        ? q._pickedNodes : [document.createTextNode(r && r.picked ? r.picked : '')];
      var ansNodes = q._answerNodes && q._answerNodes.length
        ? q._answerNodes : [document.createTextNode(r && r.answer ? r.answer : '')];

      var yourWrap = document.createElement('span');
      yourNodes.forEach(function (n) { yourWrap.appendChild(n.cloneNode(true)); });
      var ansWrap = document.createElement('span');
      ansNodes.forEach(function (n) { ansWrap.appendChild(n.cloneNode(true)); });

      item.appendChild(row('你选了', yourWrap, 'is-bad'));
      item.appendChild(row('正确答案', ansWrap, 'is-good'));

      var ex = q.querySelector('.q-feedback .fb-body');
      if (ex && ex.textContent.trim()) {
        item.appendChild(row('解析', cloneRich(ex), 'is-why'));
      }

      var ref = refOf(q);
      if (ref) {
        var lnk = document.createElement('a');
        lnk.className = 'rv-link';
        lnk.href = hrefOf(ref);
        lnk.textContent = '回看「' + pointOf(q) + '」 →';
        item.appendChild(lnk);
      }
      sec3.appendChild(item);
    });

    if (!wrongCount) {
      var perfect = document.createElement('p');
      perfect.className = 'rv-perfect';
      perfect.textContent = '🎉 全对，没有需要订正的题目。';
      sec3.appendChild(perfect);
    }
    panel.appendChild(sec3);

    /* ④ 讲评（作者撰写的部分） */
    var authored = quiz.querySelector('.q-review');
    if (authored) {
      var sec4 = document.createElement('div');
      sec4.className = 'rv-sec';
      sec4.innerHTML = '<h5 class="rv-h5">👨‍🏫 讲评</h5>';
      var body = document.createElement('div');
      body.className = 'rv-comment';
      while (authored.firstChild) body.appendChild(authored.firstChild);
      sec4.appendChild(body);
      panel.appendChild(sec4);
      authored.parentNode.removeChild(authored);
    }

    /* ⑤ 操作 */
    var acts = document.createElement('div');
    acts.className = 'rv-actions';
    if (wrongCount) {
      var fix = document.createElement('button');
      fix.type = 'button';
      fix.className = 'btn btn-primary';
      fix.textContent = '✍️ 订正这 ' + wrongCount + ' 道错题';
      fix.addEventListener('click', function () { enterCorrection(quiz, questions); });
      acts.appendChild(fix);
    }
    var again = document.createElement('button');
    again.type = 'button';
    again.className = 'btn';
    again.textContent = '重做整卷';
    again.addEventListener('click', function () { quiz._btnRetry.click(); });
    acts.appendChild(again);
    panel.appendChild(acts);

    quiz.appendChild(panel);
    quiz._review = panel;
  }

  /* ---------------- 订正模式：只解锁错题重做 ---------------- */

  function enterCorrection(quiz, questions) {
    var wrong = questions.filter(function (q) { return q._result && !q._result.correct; });
    if (!wrong.length) return;

    wrong.forEach(function (q) {
      q._locked = false;
      q.classList.remove('is-right', 'is-wrong');
      q.classList.add('is-correcting');
      q._feedback.classList.remove('is-shown', 'is-right', 'is-wrong');
      if (q._type === 'fill') {
        (q._inputs || []).forEach(function (inp) {
          inp.value = ''; inp.disabled = false;
          inp.classList.remove('is-correct', 'is-incorrect');
        });
      } else {
        Array.prototype.slice.call(q.querySelectorAll('ul.options > li')).forEach(function (li) {
          li.classList.remove('is-picked', 'is-correct', 'is-incorrect');
          li.setAttribute('aria-checked', 'false');
        });
      }
    });

    quiz.classList.remove('is-locked');
    quiz._btnSubmit.disabled = false;
    quiz._btnSubmit.textContent = '提交订正（' + wrong.length + ' 题）';
    quiz._btnReveal.disabled = true;

    if (quiz._review) quiz._review.classList.add('is-stale');
    var first = wrong[0];
    if (first.scrollIntoView) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function finish(quiz, questions, passRate, revealMode) {
    var correct = 0;
    var unanswered = 0;
    var results = [];

    questions.forEach(function (q) {
      var res;
      if (q._locked) {
        res = q._result;
        if (res && res.correct) correct++;
        results.push(res);
        return;
      }
      res = gradeQuestion(q);
      q._result = res;
      q._locked = true;
      q.classList.remove('is-correcting');
      if (!res.answered) unanswered++;
      if (res.correct) correct++;
      results.push(res);

      q.classList.toggle('is-right', res.correct);
      q.classList.toggle('is-wrong', !res.correct);

      var fb = q._feedback;
      fb.classList.add('is-shown');
      fb.classList.toggle('is-right', res.correct);
      fb.classList.toggle('is-wrong', !res.correct);
      q._fbHead.textContent = res.correct
        ? '✓ 正确'
        : (res.answered ? (revealMode ? '答案' : '✗ 错误') : '未作答');
    });

    quiz.classList.add('is-locked');
    quiz._btnSubmit.disabled = true;
    quiz._btnSubmit.textContent = '已提交';
    quiz._btnReveal.disabled = true;
    quiz._btnRetry.style.display = '';

    var total = questions.length;
    renderScore(quiz, correct, total, passRate, false);

    var store = loadStore();
    store[quiz.dataset.quizId] = {
      correct: correct,
      total: total,
      ts: new Date().toISOString().slice(0, 10)
    };
    saveStore(store);

    // 生成讲评报告（含简要回顾、逐题订正、作者讲评、订正入口）
    buildReview(quiz, questions, results, passRate);

    // 通知外部（site.js 用它刷新总进度）
    document.dispatchEvent(new CustomEvent('quiz:finished', {
      detail: {
        quizId: quiz.dataset.quizId,
        correct: correct,
        total: total,
        unanswered: unanswered,
        rate: total ? correct / total : 0,
        passed: total ? correct / total >= passRate : false
      }
    }));
  }

  function renderScore(quiz, correct, total, passRate, isPast) {
    var pct = total ? Math.round((correct / total) * 100) : 0;
    var el = quiz._score;
    el.querySelector('.pct').textContent = pct + '%';
    el.querySelector('.det').textContent =
      '(' + correct + '/' + total + (isPast ? ' · 上次成绩' : '') + ')';
    el.classList.toggle('is-pass', total > 0 && correct / total >= passRate);
    el.classList.toggle('is-fail', total > 0 && correct / total < passRate);
  }

  function resetQuiz(quiz, questions) {
    if (quiz._review && quiz._review.parentNode) {
      quiz._review.parentNode.removeChild(quiz._review);
    }
    quiz._review = null;

    questions.forEach(function (q) {
      q._locked = false;
      q._result = null;
      q._pickedNodes = null;
      q._answerNodes = null;
      q.classList.remove('is-right', 'is-wrong', 'is-correcting');
      q._feedback.classList.remove('is-shown', 'is-right', 'is-wrong');

      if (q._type === 'fill') {
        (q._inputs || []).forEach(function (inp) {
          inp.value = '';
          inp.disabled = false;
          inp.classList.remove('is-correct', 'is-incorrect');
        });
      } else {
        Array.prototype.slice.call(q.querySelectorAll('ul.options > li')).forEach(function (li) {
          li.classList.remove('is-picked', 'is-correct', 'is-incorrect');
          li.setAttribute('aria-checked', 'false');
        });
      }
    });
    quiz.classList.remove('is-locked');
    quiz._btnSubmit.disabled = false;
    quiz._btnSubmit.textContent = '提交答案';
    quiz._btnReveal.disabled = false;
    quiz._btnRetry.style.display = 'none';
    quiz._score.querySelector('.pct').textContent = '—';
    quiz._score.querySelector('.det').textContent = '';
    quiz._score.classList.remove('is-pass', 'is-fail');
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    Array.prototype.slice.call(document.querySelectorAll('.quiz')).forEach(initQuiz);
    document.documentElement.classList.add('quiz-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.LinAlgQuiz = { loadStore: loadStore, saveStore: saveStore, STORE_KEY: STORE_KEY };
})();
