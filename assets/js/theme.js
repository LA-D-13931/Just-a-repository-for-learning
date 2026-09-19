/* ==========================================================================
   theme.js — 显示偏好：配色主题 / 亮暗模式 / 中英语言
   （三样都是"显示偏好"，共用一套 localStorage + 顶栏控件，故放在同一个文件里）
   --------------------------------------------------------------------------
   4 套主题 × 亮/暗两模式，色板在 assets/css/theme-tokens.css（由
   tools/gen-themes.py 生成）。
   状态保存在 localStorage 的 advmath.theme.v1 / advmath.mode.v1，
   与线代站互不干扰。
   不写 data-mode 时跟随系统 prefers-color-scheme。
   ========================================================================== */
(function () {
  'use strict';

  var THEME_KEY = 'advmath.theme.v1';
  var MODE_KEY = 'advmath.mode.v1';
  var LANG_KEY = 'advmath.lang.v1';      // 'both' = 中英对照（默认）· 'zh' = 纯中文

  var THEMES = [
    { id: 'default', name: '霜蓝', desc: '中性偏冷 · 默认' },
    { id: 'eyecare-warm', name: '暖沙', desc: '护眼 · 偏暖米黄' },
    { id: 'eyecare-cool', name: '竹青', desc: '护眼 · 偏冷灰绿' },
    { id: 'ink', name: '墨檀', desc: '高对比 · 暖墨色' },
  ];

  function read(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* 降级 */ }
  }

  // 重绘语言按钮的函数句柄（由 buildControls 赋值；提前声明以便 setLang 调用）
  var repaintLang = null;
  function paintLangIfAny() { if (repaintLang) repaintLang(); }

  function currentTheme() {
    var t = read(THEME_KEY, 'default');
    return THEMES.some(function (x) { return x.id === t; }) ? t : 'default';
  }
  function currentMode() { return read(MODE_KEY, 'auto'); }
  function currentLang() { return read(LANG_KEY, 'both') === 'zh' ? 'zh' : 'both'; }

  var curLang = 'both';
  function apply(theme, mode, lang) {
    var el = document.documentElement;
    el.setAttribute('data-theme', theme);
    if (mode === 'auto') el.removeAttribute('data-mode');
    else el.setAttribute('data-mode', mode);
    // 语言只用 data-lang="zh" 表示纯中文；中英对照时不写属性（默认态）
    curLang = lang || curLang;
    if (curLang === 'zh') el.setAttribute('data-lang', 'zh');
    else el.removeAttribute('data-lang');
  }

  function setTheme(id) { write(THEME_KEY, id); apply(id, currentMode(), currentLang()); }
  function setMode(m) { write(MODE_KEY, m); apply(currentTheme(), m, currentLang()); }
  function setLang(l) {
    write(LANG_KEY, l);
    apply(currentTheme(), currentMode(), l);
    // 通过接口（而非点按钮）切换时也要重绘顶栏按钮与窄屏菜单的高亮，
    // 否则按钮文案会与实际状态不一致（测试抓到过）
    paintLangIfAny();
  }
  // 三态循环：跟随系统 → 亮色 → 暗色 → 跟随系统
  // （用户要求"加一个跟随系统的设置"；原来 auto 只能靠"不点它"隐式得到，
  //   一旦点过就再也回不到跟随系统）
  var MODE_ORDER = ['auto', 'light', 'dark'];
  function toggleMode() {
    var cur = currentMode();
    var i = MODE_ORDER.indexOf(cur);
    setMode(MODE_ORDER[(i + 1) % MODE_ORDER.length]);
  }

  function isDarkNow(m) {
    if (m === 'dark') return true;
    if (m === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function modeLabel(m) {
    return m === 'auto' ? '跟随系统' : (m === 'dark' ? '暗色' : '亮色');
  }

  /* ---------------- 顶栏控件 ---------------- */
  function buildControls() {
    var header = document.querySelector('.site-header');
    if (!header || header.querySelector('.theme-ctl')) return;

    var wrap = document.createElement('div');
    wrap.className = 'theme-ctl';

    var sel = document.createElement('select');
    sel.className = 'theme-select';
    sel.setAttribute('aria-label', '切换配色主题 / Theme');
    THEMES.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.name + '（' + t.desc + '）';
      sel.appendChild(o);
    });
    sel.value = currentTheme();
    sel.addEventListener('change', function () { setTheme(sel.value); });

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mode-toggle';
    btn.title = '切换亮色 / 暗色（当前：跟随系统）';
    var paint = function () {
      var m = currentMode();
      var dark = isDarkNow(m);
      // auto 态用一个额外的圆点标记，让"跟随系统"可见（不是一个看不见的隐藏状态）
      btn.textContent = (dark ? '☀' : '☾') + (m === 'auto' ? '·' : '');
      btn.setAttribute('aria-label', '亮色 / 暗色 / 跟随系统（当前：' + modeLabel(m) + '）');
      btn.title = '点击循环切换：跟随系统 → 亮色 → 暗色（当前：' + modeLabel(m) + '）';
      btn.classList.toggle('is-auto', m === 'auto');
    };
    paint();
    btn.addEventListener('click', function () { toggleMode(); paint(); });

    // 语言开关：中英对照 ⇄ 纯中文
    var langBtn = document.createElement('button');
    langBtn.type = 'button';
    langBtn.className = 'lang-toggle';
    var paintLang = function () {
      var l = currentLang();
      langBtn.textContent = l === 'zh' ? '中' : '中英';
      langBtn.setAttribute('aria-label',
        '中英对照 / 纯中文（当前：' + (l === 'zh' ? '纯中文' : '中英对照') + '）');
      langBtn.title = '点击切换：中英对照 ⇄ 纯中文（当前：'
                    + (l === 'zh' ? '纯中文' : '中英对照') + '）';
      langBtn.classList.toggle('is-zh', l === 'zh');
    };
    paintLang();
    repaintLang = paintLang;
    langBtn.addEventListener('click', function () {
      setLang(currentLang() === 'zh' ? 'both' : 'zh');
      paintLang();
    });

    wrap.appendChild(langBtn);
    wrap.appendChild(sel);
    wrap.appendChild(btn);
    header.appendChild(wrap);

    // ⚠️ 窄屏（≤1000px）顶栏塞不下「品牌 + 主题下拉 + 亮暗按钮 + ☰」四样东西：
    //    实测 320px 下控件右边界超出视口 142px，把整页顶宽。
    //    所以窄屏隐藏下拉，把主题选择做成 ☰ 菜单里的一行按钮 ——
    //    既不溢出，也不牺牲可发现性（用户点开菜单就能选）。
    var nav = header.querySelector('.header-nav');
    if (!nav || nav.querySelector('.theme-ctl-mobile')) return;
    // 窄屏菜单里再加一行"语言"，与主题行并列（顶栏只放得下一个小按钮）
    var lmob = document.createElement('div');
    lmob.className = 'lang-ctl-mobile';
    var llbl = document.createElement('span');
    llbl.className = 'tcm-label';
    llbl.textContent = '语言';
    lmob.appendChild(llbl);
    [['both', '中英对照'], ['zh', '纯中文']].forEach(function (pair) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tcm-btn';
      b.setAttribute('data-lang-id', pair[0]);
      b.textContent = pair[1];
      if (pair[0] === currentLang()) b.classList.add('is-active');
      b.addEventListener('click', function () {
        setLang(pair[0]);
        Array.prototype.slice.call(lmob.querySelectorAll('.tcm-btn')).forEach(function (x) {
          x.classList.toggle('is-active', x.getAttribute('data-lang-id') === pair[0]);
        });
        paintLangIfAny();
      });
      lmob.appendChild(b);
    });
    nav.appendChild(lmob);
    var mob = document.createElement('div');
    mob.className = 'theme-ctl-mobile';
    var lbl = document.createElement('span');
    lbl.className = 'tcm-label';
    lbl.textContent = '配色主题';
    mob.appendChild(lbl);
    THEMES.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tcm-btn';
      b.setAttribute('data-theme-id', t.id);
      b.textContent = t.name;
      b.title = t.desc;
      if (t.id === currentTheme()) b.classList.add('is-active');
      b.addEventListener('click', function () {
        setTheme(t.id);
        Array.prototype.slice.call(mob.querySelectorAll('.tcm-btn')).forEach(function (x) {
          x.classList.toggle('is-active', x.getAttribute('data-theme-id') === t.id);
        });
      });
      mob.appendChild(b);
    });
    nav.appendChild(mob);
  }

  /* ---------------- 启动 ---------------- */
  // 尽早应用，避免"先亮后暗"的闪一下
  apply(currentTheme(), currentMode(), currentLang());

  // 处于「跟随系统」时，系统切换亮暗要实时跟随
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSys = function () {
      if (currentMode() === 'auto') apply(currentTheme(), 'auto');
    };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
    else if (mq.addListener) mq.addListener(onSys);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildControls);
  } else {
    buildControls();
  }

  window.__THEME__ = {
    THEMES: THEMES, currentTheme: currentTheme, currentMode: currentMode,
    setTheme: setTheme, setMode: setMode, toggleMode: toggleMode, apply: apply,
    currentLang: currentLang, setLang: setLang,
  };
})();
