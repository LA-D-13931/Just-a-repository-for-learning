/* ============================================================
 * 锚点对齐修复
 * ------------------------------------------------------------------
 * 问题：这些页面的 MathJax 是**分片排版**的（typeset: false，由脚本逐批驱动）。
 * 浏览器在解析到 #锚点 时就会跳过去，而那时公式还没排——排版把内容撑高之后,
 * 目标小节会被推出视野，而浏览器不会自动重滚。
 * 实测 la4#la-s4-2 偏出 775px、la4#la-s4-3 偏出 2100px、la5#la-s5-2 偏出 278px。
 *
 * 修法：在内容稳定后**重新对齐一次**。三种时机都覆盖：
 *   ① 首次载入（等 load 事件）
 *   ② 页内点击锚点（hashchange）
 *   ③ MathJax 每批排完之后 —— 由各页排版脚本调用 window.__anchorSettle()
 *
 * 只在目标真的跑出视野时才滚，避免无谓的抖动。
 * ============================================================ */
(function () {
    'use strict';

    /* ------------------------------------------------------------------
     * 为什么需要一个「一次排完」的动作
     * ------------------------------------------------------------------
     * 这些页面的公式是**分片/懒排版**的（首屏立刻排，其余按空闲或进入视野时补排）。
     * 于是深链接进一个靠后的小节时，目标会被不断撑高、越推越远——
     * 实测 ch3#s3-2 偏出 8305px、ch10#s10-2 偏出 7540px。
     *
     * 「每隔一段时间重新对齐」治不了它：排版是**无限**的，追不上。
     * 所以当地址栏带锚点时，先把全页剩余公式一次排完（把移动靶变成静止靶），
     * 再对齐一次即可。
     *
     * 代价：深链接进入时需要多等一两秒才看到最终位置。
     * 这是刻意的取舍——深链接的首要目的是「准确落到那一节」，
     * 而不是「立刻可交互」。直接打开不带锚点的页面时本脚本不做任何事，
     * 仍走原来的分片排版，交互性能不受影响。
     * ------------------------------------------------------------------ */

    var FALLBACK_SEL = 'p, li, h2, h3, h4, td, th, figcaption, .box-title, .example-head';

    /* 公式块的选择器**从页面自身的排版脚本里读**，而不是在这里再抄一份。
       各页的 SEL 并不相同（la* 页多 .model-head / .model-signal 等四项），
       抄一份就会漏排；而且两处维护迟早分叉。 */
    function pageSel() {
        var scripts = document.querySelectorAll('script:not([src])');
        for (var i = 0; i < scripts.length; i++) {
            var m = /SEL\s*=\s*'([^']+)'/.exec(scripts[i].textContent || '');
            if (m) return m[1];
        }
        return FALLBACK_SEL;
    }

    function hashId() {
        try { return decodeURIComponent((location.hash || '').replace(/^#/, '')); }
        catch (err) { return (location.hash || '').replace(/^#/, ''); }
    }

    function hasFormulaText(el) {
        for (var i = 0; i < el.childNodes.length; i++) {
            var n = el.childNodes[i];
            if (n.nodeType === 3 && /\$[^$]{1,400}\$/.test(n.nodeValue || '')) return true;
        }
        return false;
    }

    /* 找出「还没有被 MathJax 处理、且仍含 $ 公式」的块 */
    function untypeset() {
        var all = document.querySelectorAll(pageSel());
        var out = [];
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (el.querySelector && el.querySelector('mjx-container')) continue;
            if (hasFormulaText(el)) out.push(el);
        }
        return out;
    }

    function ready(cb) {
        if (window.MathJax && MathJax.startup && MathJax.startup.document && MathJax.typesetPromise) {
            cb(MathJax);
            return true;
        }
        return false;
    }

    /* 一次排完全部剩余公式，然后对齐。最多尝试若干轮：
       有些块要等前面的排完才会露出源码。 */
    function flushThenAlign(round) {
        round = round || 0;
        if (!ready(function (MJ) {
            var left = untypeset();
            if (!left.length || round >= 12) { align(true); settleLoop(); return; }
            /* 分批，避免一次丢太多块造成长时间卡顿。
               轮数上限要够大：公式密集的章节有数千个块（实测 ch5 有 1434 个块、
               3900+ 个 mjx-container），批次太小或轮数太少会漏排后面那些。 */
            var batch = left.slice(0, 800);
            MJ.typesetPromise(batch).catch(function () {}).then(function () {
                align(false);
                setTimeout(function () { flushThenAlign(round + 1); }, 0);
            });
        })) {
            setTimeout(function () { flushThenAlign(round); }, 120);
        }
    }

    function align(force) {
        var key = hashId();
        if (!key) return;
        var el = document.getElementById(key);
        if (!el) return;
        var top = el.getBoundingClientRect().top;
        if (top >= -60 && top < 80) return;   // 已贴顶就不再动，避免来回抖
          /* behavior:'instant' 显式写出：即使日后有人重新打开 CSS 的
             scroll-behavior:smooth，这里也不会退化成慢速缓动动画
             （跨 15 万 px 的缓动会被下一次校正打断，永远到不了目标）。 */
          el.scrollIntoView({ block: 'start', behavior: 'instant' });
    }

    /* 排版排完之后，再在一个有限窗口内持续校正。
       为什么还需要这一步：目标**下方**的懒加载内容（图片、视频占位）
       会在滚动到之后才撑开，把已经对齐好的目标又推下去。
       实测 ch5#s5-2 在公式全部排完后仍偏出 6987px，就是这个原因。
       窗口取 8 秒，且 align() 有「已在视野内就不动」这道闸，所以不会抖动。 */
    function settleLoop() {
        var deadline = Date.now() + 8000;
        var timer = setInterval(function () {
            align(false);
            if (Date.now() > deadline) clearInterval(timer);
        }, 200);
    }

    /* 供各页排版脚本在每批结束后调用（保留这个接口，行为退化为普通对齐） */
    window.__anchorSettle = function () { align(false); };

    if (!hashId()) return;                    // 没有锚点：什么都不做

    if (document.readyState === 'complete') {
        flushThenAlign(0);
    } else {
        window.addEventListener('load', function () { flushThenAlign(0); });
    }

    window.addEventListener('hashchange', function () { flushThenAlign(0); });
})();
