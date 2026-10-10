/* ============================================================================
 * 分片公式排版调度器（第 48 节：从 25 个页面内联副本抽取为单一模块）
 * ----------------------------------------------------------------------------
 * 抽取前：同一段逻辑在 25 个页面各有一份内联副本（共 88,343 字节），
 *         只有两个参数不同 —— SEL（参与排版的元素选择器）与扫描策略。
 *         改一处逻辑要动 25 个文件，而且 4 个版本已经悄悄分叉。
 * 抽取后：本文件是唯一的实现；每个页面在自己 <head> 里只声明参数：
 *
 *     window.__TYPESET = { sel: 'p, li, h2, …', sweep: 'bounded' };
 *
 * sweep 两种取值，与抽取前各页的既有行为一一对应：
 *   'example-head' —— 队列排空后只扫一次 .example-head（高数各章原行为）
 *   'bounded'      —— 队列排空后最多重扫 3 轮 SEL（线代各页原行为）
 *
 * 设计约束（抽取时逐条对齐，不得改变）：
 *   ① 首屏同步排 60 块，其余交给 IntersectionObserver（rootMargin 400px），
 *      每批 25 块且批次之间必须真正 yield 给主线程；
 *   ② 元素列表要去掉「有匹配祖先」的项 —— 父子同时入选会让 MathJax 对同一
 *      文本节点排两次，抛 IndexSizeError: splitText（线代第 6 章曾漏 658 块）；
 *   ③ 每批排完回调 window.__anchorSettle()，供 anchor-fix.js 校正锚点；
 *   ④ ?eager=1 时整体让位给 MathJax 的一次性排版（校验脚本量最终版面用）。
 * ========================================================================== */
(function () {
  'use strict';

  /* URL 加 ?eager=1 时退回"一次性排版全页"（校验脚本量最终版面用） */
  if (/[?&]eager=1/.test(location.search)) return;

  var CFG = window.__TYPESET || {};
  var SEL = CFG.sel || 'p, li, h2, h3, h4, td, th, figcaption, .box-title, .example-head';
  /* 把选择器挂到全局：anchor-fix.js 的 pageSel() 需要它来找出未排版的块。
     抽取前它是用正则从内联脚本文本里抓 SEL 字符串的，现在直接读这里。 */
  window.__TYPESET_SEL = SEL;
  var SWEEP = CFG.sweep === 'example-head' ? 'example-head' : 'bounded';

  var MJ = null, pending = [], busy = false, started = false, sweepDone = false, sweepLeft = 3;

  function idle(fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 400 });
    else setTimeout(fn, 16);
  }

  /* 「这个块还需要排版吗」。
     ------------------------------------------------------------------------
     ⚠️ 必须看**整棵子树**，不能只看直接子文本节点。
     原实现只看 childNodes 里的文本节点，于是
         <li><span class="opt-body">$\dfrac{\pi^{2}}{6}$</span></li>
     这种「公式在子元素里」的结构被判为"没有公式"而跳过；同时 dropNested()
     又会把 .opt-body 丢掉（它的祖先 li 命中 SEL）→ **两条路都漏，永久不排**，
     读者直接看到 $\dfrac{\pi^{2}}{6}$ 这样的源码。
     2026-10-10 实测：ch12 有 8 处如此（慢滚 8 秒仍在），手动 typesetPromise 立刻好。

     为什么用 textContent 是安全的：MathJax 排完后会把 $…$ 原文从 DOM 里取走，
     只留下 <mjx-container>（SVG）与无障碍用的 MathML —— 都不含 $。
     所以「textContent 里还有 $…$」精确等价于「还有没排的公式」，
     不会因为把已排好的子元素算进来而重复入队。 */
  function hasRawFormula(el) {
    return /\$[^$]{1,4000}\$/.test(el.textContent || '');
  }
  /* 供 anchor-fix.js 复用同一个判据（它在全部页面里都于本文件之后加载） */
  window.__needTypeset = needsWork;

  /* 这个块还需不需要重扫？——两个条件都必须满足：
       ① 里面确实还有没排的公式（hasRawFormula：看整棵子树里还有没有 $…$）；
       ② 它还没有任何排版结果（不含 mjx-container）。
     ⚠️ ② 是**承重**的，不能省。2026-10-10 实测：把 ② 去掉之后，重扫会把
     「已经排好、但内部还夹着个别未排片段」的大块（例如 cheatsheet 的 td/li）
     重新交给 MathJax，结果**把已排好的 369 个容器打回 204 个**——本来正确的
     公式也跟着坏掉。所以宁可漏掉极少数「一半已排一半没排」的块，
     也不能让重排碰到已排内容。 */
  function needsWork(el) {
    return !el.querySelector('mjx-container') && hasRawFormula(el);
  }

  /* 去掉「有匹配祖先」的元素，避免父子重复排版（见文件头约束 ②） */
  function dropNested(list) {
    return list.filter(function (el) {
      var a = el.parentElement;
      while (a && a !== document.body) {
        if (a.matches && a.matches(SEL)) return false;
        a = a.parentElement;
      }
      return true;
    });
  }

  function schedule() {
    if (busy || !pending.length) return;
    busy = true;
    var batch = pending.splice(0, 25);
    idle(function () {
      /* ⚠️ 批次级失败会连坐：只要批里有一个公式有语法错误，MathJax 会让整个
         typesetPromise reject，而 .catch() 一吞，同批其余本来没问题的块就**跟着漏排**。
         2026-10-10 实测：la-exam 有 3 处因此一直不排（手动单独排立刻就好）。
         所以失败时退化为逐块重试 —— 坏的只坏它自己，不再拖累同批。
         只在失败路径上做，正常情况一次都不会走到。 */
      MJ.typesetPromise(batch).catch(function () {
        batch.forEach(function (el) {
          try { MJ.typesetPromise([el]).catch(function () { }); } catch (e) { }
        });
      }).then(function () {
        busy = false;
        /* 一批排完：把锚点重新对齐（MathJax 会撑高页面）。
           anchor-fix.js 内部会在用户自己滚动时让位，这里只管回调。 */
        if (typeof window.__anchorSettle === 'function') window.__anchorSettle();
        if (pending.length) { schedule(); return; }
        /* 兜底补排：仍有含 $ 且未被 MathJax 处理的块时补排一次。
           高数各章只扫 .example-head（原行为）；线代各页最多重扫 3 轮 SEL。 */
        if (SWEEP === 'example-head') {
          if (sweepDone) return;
          sweepDone = true;
          var left = Array.prototype.slice.call(document.querySelectorAll('.example-head'))
            .filter(needsWork);
          if (left.length) { pending = pending.concat(left); schedule(); }
        } else {
          if (sweepLeft <= 0) return;
          sweepLeft--;
          var rest2 = Array.prototype.slice.call(document.querySelectorAll(SEL)).filter(needsWork);
          if (rest2.length) { pending = pending.concat(rest2); schedule(); }
        }
      });
    });
  }

  function start() {
    if (started) return;
    if (!(window.MathJax && MathJax.startup && MathJax.startup.document && MathJax.typesetPromise)) {
      setTimeout(start, 60); return;
    }
    started = true;
    MJ = window.MathJax;
    var all = dropNested(Array.prototype.slice.call(document.querySelectorAll(SEL)));
    var first = all.filter(function (el) {
      var r = el.getBoundingClientRect();
      return r.bottom > -300 && r.top < (window.innerHeight + 300);
    });
    var rest = all.filter(function (el) { return first.indexOf(el) < 0; });

    /* ① 首屏：排最靠近顶端的一批（60 个块，实测约 25 ms）——主线程立刻可用。
       ⚠️ 绝不能把 first 全部丢给一次 typesetPromise：那是原来 1.7 s 卡顿的来源。 */
    MJ.typesetPromise(first.slice(0, 60)).then(function () {
      pending = pending.concat(first.slice(60));
      /* ② 其余：只在进入视口附近时入队，永不整体排队 */
      if (typeof IntersectionObserver !== 'function') {
        pending = pending.concat(rest);          /* 老浏览器：退回补排，保证文字正确 */
        schedule(); return;
      }
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            pending.push(entries[i].target);
            io.unobserve(entries[i].target);
          }
        }
        schedule();
      }, { rootMargin: '400px 0px' });
      rest.forEach(function (el) { io.observe(el); });
      schedule();
    }).catch(function () {});
  }

  /* ── <details> 折叠内容 ──────────────────────────────────────────────────
     闭合的 <details> 内容不在视口内，IntersectionObserver 不会触发；而队列排空时
     那几块早已被滚过（实测 rect 在 y=-9070），于是从未被排。
     2026-10-10 实测：linear-algebra-exam 有 3 处（还有 3 个公式块）在闭合的
     <details class="reveal"> 里一直没排版，用户一展开就看到 $$…$$ 源码。
     用户只在展开后才需要看见它们，所以在**展开的那一刻**入队最省也最准。
     toggle 事件不冒泡，故在捕获阶段监听。 */
  document.addEventListener('toggle', function (ev) {
    var d = ev.target;
    if (!d || d.tagName !== 'DETAILS' || !d.open || !MJ) return;
    /* 延后一拍再入队：toggle 事件触发时，刚展开的内容还没完成布局，
       此时 MathJax 可能判定它不可见而不排（实测 la-exam 有 3 处这样被漏掉）。 */
    setTimeout(function () {
      var els = Array.prototype.slice.call(d.querySelectorAll(SEL)).filter(needsWork);
      if (!els.length) return;
      /* 直接排，**不走调度队列**：实测走队列时这几块始终没被交到 MathJax 手上
         （插桩确认 typesetPromise 从未收到它们），而在这里直接调用立刻就好。
         代价只是展开时多一次排版调用，且只针对本次展开的那个 <details>。 */
      try { MJ.typesetPromise(els).catch(function () { }); } catch (e) { }
    }, 250);
  }, true);

  /* 等首帧画完再启动排版：保证 FCP 不被排版阻塞（26.1 首屏 < 100 ms） */
  function boot() {
    if (window.requestAnimationFrame) {
      requestAnimationFrame(function () { requestAnimationFrame(function () { start(); }); });
    } else setTimeout(start, 0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
