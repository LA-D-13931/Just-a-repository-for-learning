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

  /* 只有「直接文本子节点里还含 $」的块才算没排过。
     用 textContent 会把已排好的子元素也算进来，导致重复入队。 */
  function hasRawFormula(el) {
    var n = el.childNodes;
    for (var i = 0; i < n.length; i++) {
      if (n[i].nodeType === 3 && /\$[^$]{1,200}\$/.test(n[i].nodeValue || '')) return true;
    }
    return false;
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
      MJ.typesetPromise(batch).catch(function () {}).then(function () {
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
            .filter(function (el) {
              return !el.querySelector('mjx-container') && /\$[^$]{1,200}\$/.test(el.textContent || '');
            });
          if (left.length) { pending = pending.concat(left); schedule(); }
        } else {
          if (sweepLeft <= 0) return;
          sweepLeft--;
          var rest2 = Array.prototype.slice.call(document.querySelectorAll(SEL))
            .filter(function (el) { return !el.querySelector('mjx-container') && hasRawFormula(el); });
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

  /* 等首帧画完再启动排版：保证 FCP 不被排版阻塞（26.1 首屏 < 100 ms） */
  function boot() {
    if (window.requestAnimationFrame) {
      requestAnimationFrame(function () { requestAnimationFrame(function () { start(); }); });
    } else setTimeout(start, 0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
