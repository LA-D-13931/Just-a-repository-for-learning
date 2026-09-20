/* ==========================================================================
   site.js — 站点主控
   目录自动生成 / 滚动高亮 / 小节完成打勾 / 学习进度统计 / 移动端菜单
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------- 课程清单 ----------------
     骨架：同济《高等数学》第八版 12 章 / 80 节（对齐宋浩同济版课程）
     补充：托马斯 14 版独有内容 34 节（n ≥ 101 表示「托马斯补充」章）
     第 1 期只登记已建成的章节；后续每期新增章节时在此追加。
     ⚠️ 增删小节后必须同步改这里，否则首页进度统计会错。
     ------------------------------------------------------------------ */
  /* 课程数据来自唯一数据源 assets/course-data.json（编译成 window.COURSE_DATA）。
     此处只做一次字段映射：n / file / title / ids / hours —— 不再手写课程表。 */
  var CD = (typeof window !== 'undefined' && window.COURSE_DATA) || { chapters: [] };
  var DESC = {
    ch1: '映射与函数、数列与函数的极限、无穷小的比较、函数的连续性——整门课的地基。',
    ch2: '导数定义与几何意义、求导法则、高阶导数、隐函数与参数方程求导、函数的微分。',
    ch3: '中值定理、洛必达法则、泰勒公式、单调性与凹凸性、极值与最值、曲率。',
    ch4: '原函数与基本积分表、第一与第二换元积分法、分部积分法、有理函数的积分。',
    ch5: '定积分的定义与性质、微积分基本定理、换元与分部、反常积分。',
    ch6: '元素法、平面图形的面积、旋转体与已知截面立体的体积、平面曲线的弧长。',
    ch7: '一阶方程、可降阶的高阶方程、二阶常系数线性方程。',
    ch8: '向量及其运算、平面与直线、曲面与曲线。',
    ch9: '偏导数与全微分、复合函数求导、极值与最值、泰勒公式、最小二乘法。',
    ch10: '二重积分、三重积分、重积分的应用。',
    ch11: '两类曲线积分与曲面积分、格林公式、高斯公式、斯托克斯公式。',
    ch12: '常数项级数、幂级数、傅里叶级数。',
    supp1: '同济体系未单列、而托马斯 14 版独立成节的内容：软件绘图与作为变化率的导数。'
  };
  /* 科目感知（第 37 节）：页面上若标了 data-subject，就用该科目的章节表；
     否则回退顶层 chapters（= 高等数学）。这样 site.js 的其余部分（进度统计、
     侧栏、当前章判定）**无需再改**，自动跟随科目。
     ⚠️ 顶层 chapters 与 subjects[calculus].chapters 是同一份数据。 */
  function courseOf(sel) {
    var subs = CD.subjects || [];
    if (sel) {
      for (var i = 0; i < subs.length; i++) if (subs[i].id === sel) return subs[i].chapters || [];
    }
    return CD.chapters || [];
  }
  var PAGE_SUBJECT = (typeof document !== 'undefined' && document.body)
    ? document.body.getAttribute('data-subject') : null;
  var COURSE_SRC = courseOf(PAGE_SUBJECT);

  var COURSE = COURSE_SRC.map(function (c) {
    var n = (c.num === 101) ? 101 : c.num;
    return {
      n: n,
      file: c.file,
      // title 同时是进度存储的 pageKey —— 必须与历史一致（纯章名，不带「第 N 章」前缀）
      title: (c.num === 101 ? (c.short || c.title).zh : c.title.zh),
      desc: DESC[c.id] || '',
      built: c.status === 'built',
      ids: c.sections,
      hours: c.sectionHours
    };
  }).filter(function (c) { return c.ids && c.ids.length; });

  /* 分母只统计**已建成**的章节：未建章节不参与进度，否则进度永远到不了 100% */
  var BUILT = COURSE.filter(function (c) { return c.built !== false && c.ids.length; });
  var TOTAL_SECTIONS = BUILT.reduce(function (a, c) { return a + c.ids.length; }, 0);
  var REVIEW_HOURS = (CD.meta && CD.meta.reviewHours) || 2;   // 综合自测与复习（数据源）
  var TOTAL_HOURS = BUILT.reduce(function (a, c) {
    return a + c.hours.reduce(function (x, y) { return x + y; }, 0);
  }, REVIEW_HOURS);

  var PROG_KEY = 'advmath.progress.v1';
  var SUBJ_KEY = 'advmath.subject.v1';   // 当前科目（第 36 节）
  var QUIZ_KEY = 'advmath.quiz.v1';

  /* ---------------- 存储 ---------------- */

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 降级 */ }
  }

  function getProgress() { return readJSON(PROG_KEY, {}); }
  function getQuizScores() { return readJSON(QUIZ_KEY, {}); }

  /* ---------------- 目录 ---------------- */

  function slugify(text) {
    return 'sec-' + text.trim().replace(/\s+/g, '-').replace(/[^\w一-龥-]/g, '').slice(0, 40);
  }

  function buildTOC() {
    var toc = document.querySelector('[data-toc]');
    var content = document.querySelector('.content');
    if (!toc || !content) return;

    var heads = Array.prototype.slice.call(content.querySelectorAll('h2, h3'));
    if (!heads.length) { toc.innerHTML = ''; return; }

    var frag = document.createDocumentFragment();
    var currentGroup = null;
    var groupList = null;

    // 目录标签的中英口径（用户 2026-09-16 明确要求）：
    //   · **小节主标题（H2）要带上英文** —— h2 里写成
    //     `1-1 映射与函数<span class="en-inline"> / Mappings and Functions</span>`，
    //     所以直接读 textContent 即可。
    //   · **其余条目（H3，实际都是各份测验的标题）只留中文** ——
    //     否则侧栏会出现"主标题只有中文、下面缩进项却带英文"的错位观感。
    function zhLabel(h) {
      if (h.tagName === 'H2') return h.textContent;
      var clone = h.cloneNode(true);
      Array.prototype.slice.call(clone.querySelectorAll('.en-inline'))
        .forEach(function (n) { n.parentNode.removeChild(n); });
      return clone.textContent;
    }

    heads.forEach(function (h) {
      if (!h.id) h.id = slugify(zhLabel(h));

      if (h.tagName === 'H2') {
        currentGroup = document.createElement('div');
        currentGroup.className = 'toc-group';
        frag.appendChild(currentGroup);
        groupList = null;
      }

      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.className = h.tagName === 'H2' ? 'toc-h2' : 'toc-h3';
      a.dataset.target = h.id;
      if (h.tagName === 'H2') {
        // H2 用**克隆子节点**而不是 textContent：这样行内英文的 <span class="en-inline">
        // 会被保留下来，可以单独排版（小一号、淡一点），而且能跟着顶栏的
        // 中英语言开关自动隐藏（CSS: [data-lang="zh"] .en-inline{display:none}）。
        var clone = h.cloneNode(true);
        Array.prototype.slice.call(clone.querySelectorAll('.hours-badge, .sec-check'))
          .forEach(function (n) { n.parentNode.removeChild(n); });
        // 去掉开头的"1-1 "编号（侧栏里不需要重复编号）
        var first = clone.firstChild;
        while (first && first.nodeType === 3 && !first.nodeValue.trim()) {
          var nx = first.nextSibling; clone.removeChild(first); first = nx;
        }
        if (first && first.nodeType === 3) {
          first.nodeValue = first.nodeValue.replace(/^\s*\d+[\.\-]\d+\s*/, '');
        }
        while (clone.firstChild) a.appendChild(clone.firstChild);
        a.normalize();
      } else {
        a.textContent = zhLabel(h).replace(/^\s*\d+[\.\-]\d+\s*/, '').trim();
      }

      if (h.tagName === 'H2') {
        currentGroup.appendChild(a);
      } else {
        if (!groupList) {
          groupList = document.createElement('div');
          groupList.className = 'toc-sub';
          currentGroup.appendChild(groupList);
        }
        groupList.appendChild(a);
      }
    });

    toc.innerHTML = '';
    toc.appendChild(frag);
  }

  function scrollSpy() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.toc a[data-target]'));
    if (!links.length) return;

    var map = {};
    links.forEach(function (a) { map[a.dataset.target] = a; });

    var targets = links.map(function (a) { return document.getElementById(a.dataset.target); })
                       .filter(Boolean);
    if (!targets.length) return;

    var ticking = false;

    function update() {
      ticking = false;
      var line = 120; // 距视口顶部多少像素算"当前"
      var active = targets[0];
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].getBoundingClientRect().top <= line) active = targets[i];
      }
      links.forEach(function (a) { a.classList.remove('is-active'); });
      if (active && map[active.id]) {
        var a = map[active.id];
        a.classList.add('is-active');
        // 同步高亮所属章节
        var grp = a.closest('.toc-group');
        if (grp) {
          var head = grp.querySelector('.toc-h2');
          if (head) head.classList.add('is-active');
        }
        // 侧栏内自动滚动
        var sb = document.querySelector('.sidebar');
        if (sb && sb.scrollHeight > sb.clientHeight + 20) {
          var r = a.getBoundingClientRect(), sr = sb.getBoundingClientRect();
          if (r.top < sr.top || r.bottom > sr.bottom) {
            sb.scrollTop += r.top - sr.top - sr.height / 2;
          }
        }
      }
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---------------- 小节完成打勾 ---------------- */

  // 当前页对应课程清单里的哪一章；不是章节页则返回 null
  function currentChapter() {
    var pageKey = document.body.getAttribute('data-page') || '';
    for (var i = 0; i < COURSE.length; i++) {
      if (COURSE[i].file.indexOf(pageKey + '.html') !== -1) return COURSE[i];
    }
    return null;
  }

  function setupSectionChecks() {
    var content = document.querySelector('.content');
    if (!content) return;
    var ch = currentChapter();
    if (!ch) return;                       // 只有章节页才有"小节进度"
    var progress = getProgress();
    var pageKey = document.body.getAttribute('data-page');

    var heads = Array.prototype.slice.call(content.querySelectorAll('h2[id]'));

    heads.forEach(function (h) {
      var id = h.id;
      // 只处理清单里登记的真小节——章末综合测验等不计入小节进度
      if (ch.ids.indexOf(id) === -1) return;
      if (h.querySelector('.sec-check')) return;

      var label = document.createElement('label');
      label.className = 'sec-check';
      label.setAttribute('title', '学完这一节后打勾');

      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!progress[pageKey + '#' + id];

      var txt = document.createElement('span');
      txt.textContent = '已掌握';

      label.appendChild(box);
      label.appendChild(txt);

      if (box.checked) label.classList.add('is-done');

      box.addEventListener('change', function () {
        var p = getProgress();
        var k = pageKey + '#' + id;
        if (box.checked) { p[k] = true; } else { delete p[k]; }
        writeJSON(PROG_KEY, p);
        label.classList.toggle('is-done', box.checked);
        refreshProgressUI();
      });

      h.appendChild(label);
    });
  }

  /* ---------------- 进度统计 ---------------- */

  function chapterStats(ch) {
    var progress = getProgress();
    var key = ch.file.replace('chapters/', '').replace('.html', '');
    var done = 0, hoursDone = 0;
    var hoursTotal = ch.hours.reduce(function (a, b) { return a + b; }, 0);
    ch.ids.forEach(function (id, i) {
      if (progress[key + '#' + id]) {
        done++;
        hoursDone += ch.hours[i] || 0;
      }
    });
    return {
      done: done, total: ch.ids.length,
      rate: ch.ids.length ? done / ch.ids.length : 0,
      hoursDone: hoursDone, hoursTotal: hoursTotal
    };
  }

  function overallStats() {
    var done = 0, hoursDone = 0;
    COURSE.forEach(function (ch) {
      var s = chapterStats(ch);
      done += s.done;
      hoursDone += s.hoursDone;
    });

    var scores = getQuizScores();
    var vals = Object.keys(scores).map(function (k) {
      var s = scores[k];
      return s && s.total ? s.correct / s.total : null;
    }).filter(function (v) { return v !== null; });

    var avg = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
    var chaptersDone = COURSE.filter(function (ch) { return chapterStats(ch).rate === 1; }).length;

    return {
      done: done,
      total: TOTAL_SECTIONS,
      rate: TOTAL_SECTIONS ? done / TOTAL_SECTIONS : 0,
      hoursDone: hoursDone,
      hoursTotal: TOTAL_HOURS,
      hoursRate: TOTAL_HOURS ? hoursDone / TOTAL_HOURS : 0,
      quizCount: vals.length,
      quizAvg: avg,
      chaptersDone: chaptersDone
    };
  }

  /* ---------------- 学时徽章 ---------------- */
  // 注意：必须在 setupSectionChecks 之后调用，
  // 因为两者都是 float:right，DOM 顺序决定谁在最右（已掌握在最右）。
  function setupHoursBadges() {
    var content = document.querySelector('.content');
    if (!content) return;
    var ch = currentChapter();
    Array.prototype.slice.call(content.querySelectorAll('h2[data-hours]')).forEach(function (h) {
      // 同样只认清单里的小节，避免章末测验的学时和清单对不上
      if (ch && ch.ids.indexOf(h.id) === -1) return;
      if (h.querySelector('.hours-badge')) return;
      var b = document.createElement('span');
      b.className = 'hours-badge';
      b.textContent = '⏱ ' + h.getAttribute('data-hours') + ' h';
      b.setAttribute('title', '建议学时');
      h.appendChild(b);
    });
  }

  function refreshProgressUI() {
    var st = overallStats();

    // 顶栏进度条
    var bar = document.querySelector('.global-progress');
    if (bar) bar.style.width = (st.rate * 100).toFixed(1) + '%';

    // 首页统计卡片
    var elSections = document.querySelector('[data-stat="sections"]');
    if (elSections) {
      elSections.querySelector('.stat-value').textContent = st.done + ' / ' + st.total;
      elSections.querySelector('.stat-sub').textContent = '已完成小节 · ' + Math.round(st.rate * 100) + '%';
    }
    var elQuiz = document.querySelector('[data-stat="quiz"]');
    if (elQuiz) {
      elQuiz.querySelector('.stat-value').textContent =
        st.quizAvg === null ? '—' : Math.round(st.quizAvg * 100) + '%';
      elQuiz.querySelector('.stat-sub').textContent =
        st.quizAvg === null ? '还没做过测验' : st.quizCount + ' 份测验的平均正确率';
    }
    var elCh = document.querySelector('[data-stat="chapters"]');
    if (elCh) {
      elCh.querySelector('.stat-value').textContent = st.chaptersDone + ' / ' + COURSE.length;
      elCh.querySelector('.stat-sub').textContent = '整章完成';
    }
    var elHours = document.querySelector('[data-stat="hours"]');
    if (elHours) {
      elHours.querySelector('.stat-value').textContent =
        st.hoursDone + ' / ' + st.hoursTotal + ' h';
      elHours.querySelector('.stat-sub').textContent =
        '已投入学时 · ' + Math.round(st.hoursRate * 100) + '%';
    }

    // 章节卡片进度
    COURSE.forEach(function (ch) {
      var card = document.querySelector('.chapter-card[data-chapter="' + ch.n + '"]');
      if (!card) return;
      var s = chapterStats(ch);
      var fill = card.querySelector('.bar > i');
      if (fill) fill.style.width = (s.rate * 100).toFixed(1) + '%';
      card.querySelector('.bar').classList.toggle('is-done', s.rate === 1);
      var lbl = card.querySelector('.card-progress .done');
      if (lbl) lbl.textContent = s.done + '/' + s.total + (s.rate === 1 ? ' ✓' : '');
    });
  }

  /* ---------------- 移动端菜单 ---------------- */

  function setupMobileNav() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.querySelector('.header-nav');
    var sidebar = document.querySelector('.sidebar');

    if (toggle) {
      toggle.addEventListener('click', function () {
        if (nav) nav.classList.toggle('is-open');
        if (sidebar) sidebar.classList.toggle('is-open');
      });
    }
    if (nav) {
      nav.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') nav.classList.remove('is-open');
      });
    }
  }

  /* ---------------- 回到顶部 ---------------- */

  function setupTopButton() {
    if (document.querySelector('.to-top')) return;
    var btn = document.createElement('button');
    btn.className = 'btn to-top';
    btn.type = 'button';
    btn.textContent = '↑';
    btn.setAttribute('aria-label', '回到顶部');
    btn.style.cssText = 'position:fixed;right:1.4rem;bottom:1.4rem;z-index:40;' +
      'width:40px;height:40px;justify-content:center;border-radius:50%;' +
      'box-shadow:0 4px 16px rgba(26,32,51,.16);display:none;font-size:1rem;';
    document.body.appendChild(btn);
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    window.addEventListener('scroll', function () {
      btn.style.display = window.scrollY > 600 ? 'flex' : 'none';
    }, { passive: true });
  }

  /* ---------------- 数学公式降级提示 ---------------- */

  function setupMathFallback() {
    window.setTimeout(function () {
      var hasMath = document.querySelector('mjx-container');
      var text = document.querySelector('.content') ? document.querySelector('.content').textContent : '';
      var suspicious = /\$[^$\n]{2,}\$|\\\(|\\frac|\\begin\{/.test(text);
      if (!hasMath && suspicious) {
        document.body.classList.add('math-failed');
        var note = document.createElement('div');
        note.className = 'math-fallback-note';
        note.innerHTML = '⚠️ <strong>公式未能渲染。</strong>本站公式依赖 MathJax CDN。' +
          '请确认已联网后刷新页面；若长期离线使用，可把 MathJax 下载到 ' +
          '<code>assets/vendor/</code> 并修改页面中的 script 地址。';
        var head = document.querySelector('.page-head');
        if (head && head.parentNode) head.parentNode.insertBefore(note, head.nextSibling);
        else document.body.insertBefore(note, document.body.firstChild);
      }
    }, 2600);
  }

  /* ------------------------------------------------------------------
     行内公式后的标点不得换行
     ------------------------------------------------------------------
     问题：公式被 MathJax 渲染成 mjx-container（inline-block + overflow-x:auto）。
     当公式后紧跟句号/逗号时，浏览器会把这个**行内块整体**挪到下一行，
     标点于是独自留在新行行首——中文排版不允许。
     （用户 2026-09-16 截图指出 `$|x_n-a|<\varepsilon$。` 这一句；全章实测 4 处。）

     试过但**无效**的办法（留档，别再试）：
       · 在 `$` 与标点之间插 U+2060 WORD JOINER —— 实测该行行宽仍 16px，无效；
       · CSS `text-wrap: pretty` —— 只能从 4 处压到 3 处，不根治；
       · CSS `mjx-container { word-break: keep-all }` —— 完全无效。
     有效的做法：把「公式 + 紧跟的标点」包进一个 white-space:nowrap 的行内单元，
     浏览器便把它当成不可拆分的整体换行（实测行宽 16px → 102px，标点回到公式行）。

     做成运行时处理，新增小节自动生效，正文不必手写标记。
  */
  var PUNCT_AFTER_MATH = '。，、；：？！）》」』”…';

  function bindPunctToFormula() {
    if (!window.MathJax) return false;
    var containers = document.querySelectorAll('mjx-container');
    if (!containers.length) return false;
    Array.prototype.forEach.call(containers, function (el) {
      if (el.closest('figure')) return;                       // 图注里的公式不处理
      if (el.parentNode && el.parentNode.className === 'nb-math') return;
      var nxt = el.nextSibling;
      if (!nxt || nxt.nodeType !== 3) return;                 // 后面必须紧跟文本节点
      var text = nxt.nodeValue || '';
      if (PUNCT_AFTER_MATH.indexOf(text.charAt(0)) === -1) return;
      var wrap = document.createElement('span');
      wrap.className = 'nb-math';
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
      nxt.nodeValue = text.slice(1);
      wrap.appendChild(document.createTextNode(text.charAt(0)));
    });
    return true;
  }

  function schedulePunctBind() {
    if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
      MathJax.startup.promise.then(function () { bindPunctToFormula(); })
        .catch(function () { /* MathJax 失败时由数学降级提示接管 */ });
    } else {
      // MathJax 是 async 脚本，此刻可能还没就绪：轮询几次，拿到渲染结果再处理
      var tries = 0;
      var timer = setInterval(function () {
        tries += 1;
        if (bindPunctToFormula() || tries > 40) clearInterval(timer);
      }, 250);
    }
  }

  /* ---------------- 启动 ---------------- */

  /* ---------------- 科目切换（第 36 节） ----------------
     顶部品牌区可点击，弹出科目菜单。数据来自 COURSE_DATA.subjects，不硬编码。
     · 只有一个科目时不弹菜单，给出提示
     · 科目标 ready:false 的（页面尚未并入）给出说明，不做无效跳转
     · 选择后写 localStorage，并跳到该科目"上次访问的章节"，无记录则第一章
     · 语言 / 侧栏宽度 / 收起状态等全局状态不重置（它们各有独立的存储键）
     ---------------------------------------------------------- */
  var SUBJECTS = (CD.subjects || []).slice().sort(function (a, b) {
    var o = (CD.meta && CD.meta.subjectsOrder) || [];
    return o.indexOf(a.id) - o.indexOf(b.id);
  });

  function subjectOf(rel) {
    for (var i = 0; i < SUBJECTS.length; i++) {
      var list = SUBJECTS[i].chapters || [];
      for (var j = 0; j < list.length; j++) {
        if (rel.indexOf(list[j].file) !== -1) return SUBJECTS[i];
      }
    }
    return null;
  }
  function getSubject() {
    var id = readJSON(SUBJ_KEY, null);
    for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i].id === id) return SUBJECTS[i];
    var dep = SUBJECTS.filter(function (x) { return x.id === ((CD.meta && CD.meta.defaultSubject) || 'calculus'); })[0];
    return dep || SUBJECTS[0] || null;
  }
  /* 科目里"上次访问的章节"：从 progress 的键反查（键形如 ch7#s7-1） */
  function lastChapterOf(sub) {
    if (!sub) return null;
    var list = sub.chapters || [];
    var p = getProgress();
    var files = {};
    Object.keys(p).forEach(function (k) {
      var pageKey = k.split('#')[0];
      files[pageKey] = 1;
    });
    var hit = list.filter(function (c) {
      var key = c.file.replace('chapters/', '').replace('.html', '');
      return files[key];
    });
    return (hit.length ? hit[hit.length - 1] : list[0]) || null;
  }
  function gotoChapter(ch) {
    if (!ch) return;
    var here = document.body.getAttribute('data-page') || '';
    var key = ch.file.replace('chapters/', '').replace('.html', '');
    if (here !== key) location.href = prefix(ch.file);
  }
  /* 相对本站根的前缀：章节页在 chapters/ 下，需要上一级 */
  function prefix(file) {
    var inChapters = (document.body.getAttribute('data-page') || '') !== 'index' &&
                     !!document.querySelector('link[href^="../"]');
    return inChapters ? ('../' + file) : file;
  }

  function setupSubjectSwitcher() {
    var brand = document.querySelector('.site-header .brand');
    if (!brand) return;
    var cur = getSubject();
    // 品牌文字换成当前科目名（语言切换由 theme.js 负责全局文案，这里只动科目名）
    var nameEl = brand.querySelector('span:not(.brand-mark)');
    if (nameEl && cur) {
      var label = (cur.title && (cur.title.zh || cur.title)) || '';
      /* 只保留主标题：不再拼回 <small> 副标题（用户反馈品牌区只留「高等数学」/「线性代数」）。
         数据源里的 tagline 字段保留不动，仅在此渲染层屏蔽。 */
      nameEl.textContent = label;
    }

    /* 顶栏是 position:sticky(top:0)，若把下拉菜单直接挂进 header，
       绝对定位会以 header 为基准、跑到窗口最顶端，与 macOS 系统菜单栏打架。
       这里给品牌套一层 position:relative 的定位锚点，菜单以它为基准向下展开。 */
    var anchor = document.createElement('span');
    anchor.className = 'brand-anchor';
    brand.parentNode.insertBefore(anchor, brand);
    anchor.appendChild(brand);
    if (SUBJECTS.length <= 1) {
      brand.addEventListener('click', function (e) {
        e.preventDefault();
        alert('暂无其他科目。');
      });
      return;
    }

    var menu = null, items = [], idx = 0, opener = brand;

    function close() {
      if (!menu) return;
      menu.parentNode.removeChild(menu);
      menu = null; items = [];
      brand.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onDoc, true);
    }
    function choose(sub) {
      var note = sub.readyNote && sub.readyNote.zh;
      if (sub.ready === false) {
        if (note) alert(note);
        close();
        return;
      }
      writeJSON(SUBJ_KEY, sub.id);
      close();
      gotoChapter(lastChapterOf(sub));
    }
    function highlight() {
      items.forEach(function (el, i) { el.classList.toggle('is-active', i === idx); });
      if (items[idx] && items[idx].scrollIntoView) {
        items[idx].scrollIntoView({ block: 'nearest' });
      }
    }
    function onKey(e) {
      if (!menu) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % items.length; highlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; highlight(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[idx]) items[idx].click(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); brand.focus(); }
    }
    function onDoc(e) {
      if (menu && !menu.contains(e.target) && e.target !== brand && !brand.contains(e.target)) close();
    }
    function open() {
      menu = document.createElement('div');
      menu.className = 'subject-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', '切换科目');
      idx = 0;
      SUBJECTS.forEach(function (sub, i) {
        var a = document.createElement('button');
        a.type = 'button';
        a.className = 'subject-item' + (cur && sub.id === cur.id ? ' is-active' : '');
        a.setAttribute('role', 'menuitem');
        a.setAttribute('data-subject', sub.id);
        var t = (sub.title && (sub.title.zh || sub.title)) || sub.id;
        var n = (sub.chapters || []).length;
        a.innerHTML = '<span class="subject-name"></span><span class="subject-meta"></span>';
        a.querySelector('.subject-name').textContent = t;
        a.querySelector('.subject-meta').textContent =
          (sub.ready === false) ? '待并入' : (n + ' 章');
        if (sub.ready === false) a.classList.add('is-pending');
        if (cur && sub.id === cur.id) idx = i;
        a.addEventListener('click', function (ev) { ev.stopPropagation(); choose(sub); });
        menu.appendChild(a);
        items.push(a);
      });
      anchor.appendChild(menu);   /* 挂在定位锚点内，而不是 header 上 */
      brand.setAttribute('aria-expanded', 'true');
      highlight();
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('click', onDoc, true);
    }
    brand.setAttribute('role', 'button');
    brand.setAttribute('tabindex', '0');
    brand.setAttribute('aria-haspopup', 'menu');
    brand.setAttribute('aria-expanded', 'false');
    brand.setAttribute('title', '点击切换科目');
    brand.addEventListener('click', function (e) {
      e.preventDefault();
      if (menu) { close(); } else { open(); }
    });
    brand.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (menu) close(); else open(); }
    });
  }

  function boot() {
    buildTOC();
    scrollSpy();
    setupSectionChecks();   // 先注入「已掌握」勾选框
    setupHoursBadges();     // 再注入学时徽章，保证它排在勾选框左侧
    setupMobileNav();
    setupTopButton();
    setupSubjectSwitcher();   // 品牌区可点击切换科目（第 36 节）
    refreshProgressUI();
    setupMathFallback();
    schedulePunctBind();     // 公式渲染完后，把紧跟公式的标点绑成不可换行单元

    // 测验完成后立刻刷新进度
    document.addEventListener('quiz:finished', function (e) {
      refreshProgressUI();
      var d = e.detail;
      if (d.passed) {
        var card = document.querySelector('[data-quiz-result]');
        if (card) {
          card.textContent = '本次正确率 ' + Math.round(d.rate * 100) + '%';
        }
      }
    });

    // 跨标签页同步
    window.addEventListener('storage', function (e) {
      if (e.key === PROG_KEY || e.key === QUIZ_KEY) refreshProgressUI();
      if (e.key === SIDE_W_KEY || e.key === SIDE_HIDDEN_KEY) applySidebar();
    });

    setupSidebar();
  }

  /* ---------------- 侧栏：可拖动宽度 + 可收起（参考 DeepSeek Harness 的侧栏设计） ----------------
     限位：最小 190px（保证"课程导航"文字不折行）、最大 420px（保证主内容区仍有足够宽度）。
     状态存 localStorage，刷新后保持。 */
  var SIDE_W_KEY = 'advmath.sidebar.w.v1';
  var SIDE_HIDDEN_KEY = 'advmath.sidebar.hidden.v1';
  var SIDE_MIN = 190, SIDE_MAX = 420;

  function sideWidth() {
    var v = parseInt(readJSON(SIDE_W_KEY, 0), 10);
    if (!v || isNaN(v)) v = 274;
    return Math.max(SIDE_MIN, Math.min(SIDE_MAX, v));
  }
  function sideHidden() { return readJSON(SIDE_HIDDEN_KEY, false) === true; }

  function applySidebar() {
    var root = document.documentElement;
    root.style.setProperty('--sidebar-w', sideWidth() + 'px');
    root.setAttribute('data-sidebar', sideHidden() ? 'hidden' : 'shown');
  }

  function setupSidebar() {
    var layout = document.querySelector('.layout');
    var side = document.querySelector('.sidebar');
    if (!layout || !side) return;
    applySidebar();

    // 收起按钮
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-toggle';
    btn.setAttribute('aria-label', '收起课程导航');
    btn.title = '收起课程导航';
    btn.textContent = '⟨';
    btn.addEventListener('click', function () {
      writeJSON(SIDE_HIDDEN_KEY, !sideHidden());
      applySidebar();
    });
    side.insertBefore(btn, side.firstChild);

    // 收起后重新展开的细条
    var strip = document.createElement('button');
    strip.type = 'button';
    strip.className = 'sidebar-open';
    strip.setAttribute('aria-label', '展开课程导航');
    strip.title = '展开课程导航';
    strip.textContent = '⟩';
    strip.addEventListener('click', function () {
      writeJSON(SIDE_HIDDEN_KEY, false);
      applySidebar();
    });
    layout.insertBefore(strip, layout.firstChild);

    // 拖动改宽
    var grip = document.createElement('div');
    grip.className = 'sidebar-grip';
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-label', '拖动调整课程导航宽度');
    grip.title = '拖动调整宽度（双击恢复默认）';
    layout.insertBefore(grip, layout.firstChild);
    /* 拖动改宽。
       ⚠️ 性能要点（2026-09-18 用户报告"拖动卡顿"后重写）：
       ① 旧实现每次 mousemove 都调 layout.getBoundingClientRect()——拖动中布局正在变，
          该调用强制同步重排（layout thrashing），是卡顿的主要来源。改为 mousedown 时
          缓存一次左边界，拖动中不再读布局。
       ② 旧实现每次 mousemove 都直接写 --sidebar-w，一帧内可能写多次，每次都触发重排。
          改为 rAF 节流：一帧最多写一次，并存下最新值。
       ③ 拖动期间置 Plot 的暂停标记，抑制所有图表的 ResizeObserver 重绘；
          松手后统一重绘一次，避免"每移动一像素重画一遍插图"（本页有 9 幅图时尤甚）。 */
    var dragging = false, dragLeft = 0, pendingW = null, rafId = 0;

    function flushWidth() {
      rafId = 0;
      if (pendingW === null) return;
      document.documentElement.style.setProperty('--sidebar-w', pendingW + 'px');
      pendingW = null;
    }

    grip.addEventListener('mousedown', function (e) {
      if (window.innerWidth <= 1000) return;   // 窄屏侧栏是抽屉，不拖动
      dragging = true; e.preventDefault();
      dragLeft = layout.getBoundingClientRect().left;   // 只读一次
      document.body.classList.add('is-resizing');
      if (window.Plot && window.Plot.setResizePaused) window.Plot.setResizePaused(true);
    });
    grip.addEventListener('dblclick', function () {
      writeJSON(SIDE_W_KEY, 274); applySidebar(); resyncPlots();
    });

    /* 拖动中的视觉反馈用 transform 而不是逐帧改 --sidebar-w。
       原因是改网格列宽会触发内容区整体重排（ch1 曾 138 ms/次）；
       而 transform 只影响合成层，不触发重排（第 24.2 节方案三）。
       松手时才把最终宽度提交给 --sidebar-w 并移除 transform。 */
    var contentEl = null, contentLeft = 0, contentBaseW = 0;
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var w = Math.round(e.clientX - dragLeft);
      pendingW = Math.max(SIDE_MIN, Math.min(SIDE_MAX, w));
      // 首次移动时量一次内容区基准（之后不再读布局，避免强制同步重排）
      if (!contentEl) {
        contentEl = document.querySelector('.content') || document.querySelector('.main');
        if (contentEl) {
          var r = contentEl.getBoundingClientRect();
          contentLeft = r.left; contentBaseW = r.width;
        }
      }
      if (contentEl && contentBaseW > 0) {
        var targetW = contentBaseW - (pendingW - parseInt(
          getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10) || 0);
        var scale = Math.max(0.5, targetW / contentBaseW);
        contentEl.style.transformOrigin = contentLeft + 'px top';
        contentEl.style.transform = 'scaleX(' + scale.toFixed(4) + ')';
        return;                       // 拖动期间不写 --sidebar-w
      }
      if (!rafId) rafId = window.requestAnimationFrame(flushWidth);
    });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
      flushWidth();
      // 提交最终宽度：移除 transform，改由网格列宽真正生效
      if (contentEl) { contentEl.style.transform = ''; contentEl.style.transformOrigin = ''; }
      contentEl = null; contentBaseW = 0;
      document.body.classList.remove('is-resizing');
      if (window.Plot && window.Plot.setResizePaused) window.Plot.setResizePaused(false);
      var w = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10);
      if (w) writeJSON(SIDE_W_KEY, w);
      resyncPlots();   // 松手后一次性重绘所有图表
    }
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('blur', endDrag);          // 切窗口时也要收尾
    window.addEventListener('pointercancel', endDrag);  // 触控/笔输入的中断

    /* 拖动结束后让所有图表按新宽度重绘一次。用 rAF 再等一帧，
       确保 grid 已完成重排、图表容器的 clientWidth 已是最终值。 */
    function resyncPlots() {
      if (!window.Plot || !window.Plot.redrawAll) return;
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () { window.Plot.redrawAll(); });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.LinAlg = { COURSE: COURSE, chapterStats: chapterStats, overallStats: overallStats };
})();
