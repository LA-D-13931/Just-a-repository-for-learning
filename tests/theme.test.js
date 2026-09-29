/* 主题切换引擎测试（theme.js + theme-tokens.css）
   验证：4 套主题 × 亮/暗都能挂上、变量真的换、亮暗不混淆、
         非 HEX 覆盖层不参与、数学公式不被正文字体污染。
   运行：node tests/theme.test.js                                        */
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

/* ---------- 直接从 CSS 文本解析每套主题的变量表 ---------- */
const css = readFileSync(`${SITE}/assets/css/theme-tokens.css`, 'utf8');

function varsOf(selector) {
  const i = css.indexOf(selector + ' {');
  if (i === -1) return null;
  const j = css.indexOf('}', i);
  const body = css.slice(i + selector.length + 2, j);
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const THEMES = ['default', 'eyecare-warm', 'eyecare-cool', 'ink'];

console.log('\n【1】4 套主题 × 亮/暗：变量表都存在且完整');
{
  for (const t of THEMES) {
    const light = varsOf(t === 'default' ? ':root, [data-theme="default"]' : `[data-theme="${t}"]`);
    const dark = varsOf(`[data-theme="${t}"][data-mode="dark"]`);
    ok(`${t} 亮色变量表存在`, !!light && Object.keys(light).length > 40,
       light ? Object.keys(light).length + ' 个' : '缺失');
    ok(`${t} 暗色变量表存在`, !!dark && Object.keys(dark).length > 40,
       dark ? Object.keys(dark).length + ' 个' : '缺失');
    if (!light || !dark) continue;
    const missing = Object.keys(light).filter((k) => !(k in dark));
    ok(`${t} 亮暗变量名完全一致（换模式只换取值）`, missing.length === 0,
       missing.slice(0, 5).join(', '));
    // 亮暗必须真的不同（不能复制粘贴漏改）
    const same = Object.keys(light).filter((k) => light[k] === dark[k]);
    ok(`${t} 亮暗取值不同（不是复制漏改）`, same.length <= 4,
       `相同 ${same.length} 个：${same.slice(0, 6).join(', ')}`);
  }
}

console.log('\n【2】关键语义 token 在 4 套主题里都齐备');
{
  const need = ['bg', 'bg-elev', 'bg-sunken', 'ink', 'ink-soft', 'ink-faint', 'on-brand',
                'line', 'line-soft', 'brand', 'brand-soft', 'brand-border',
                'btn-secondary', 'btn-secondary-border', 'btn-secondary-ink',
                'def', 'def-soft', 'thm', 'thm-soft', 'method', 'method-soft',
                'warn', 'warn-soft', 'warn-text', 'exam', 'exam-soft', 'exam-text',
                'app', 'app-soft', 'link', 'link-soft', 'ok', 'ok-soft', 'ok-text',
                'no', 'no-soft', 'no-text', 'lv1', 'lv2', 'lv3',
                'header-bg', 'on-brand-soft', 'shadow-color-005'];
  for (const t of THEMES) {
    const light = varsOf(t === 'default' ? ':root, [data-theme="default"]' : `[data-theme="${t}"]`);
    const miss = need.filter((k) => !(k in light));
    ok(`${t} 语义 token 齐备（${need.length} 个）`, miss.length === 0, miss.join(', '));
  }
}

console.log('\n【3】运行时切换：theme.js 真的改到 <html> 上');
{
  const win = new Window({ url: 'http://localhost/' });
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  win.matchMedia = win.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
  win.document.write(readFileSync(`${SITE}/chapters/ch1.html`, 'utf8'));
  new Function(readFileSync(`${SITE}/assets/js/theme.js`, 'utf8'))();
  if (win.document.readyState === 'loading') {
    win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  }
  const d = win.document;
  const T = win.__THEME__;
  ok('theme.js 暴露了 __THEME__', !!T);
  ok('顶栏挂上了主题控件', !!d.querySelector('.theme-ctl'));
  ok('主题下拉有 4 个选项', d.querySelectorAll('.theme-select option').length === 4,
     d.querySelectorAll('.theme-select option').length);
  ok('亮暗按钮已渲染', !!d.querySelector('.mode-toggle'));

  for (const t of THEMES) {
    T.setTheme(t);
    ok(`切到 ${t} → <html data-theme> 已更新`,
       d.documentElement.getAttribute('data-theme') === t,
       d.documentElement.getAttribute('data-theme'));
    ok(`切到 ${t} → 落盘 localStorage`, win.localStorage.getItem('advmath.theme.v1') === t);
  }
  T.setTheme('default');
  T.setMode('dark');
  ok('切暗色 → data-mode="dark"', d.documentElement.getAttribute('data-mode') === 'dark');
  T.setMode('auto');
  ok('切回跟随系统 → 移除 data-mode', !d.documentElement.hasAttribute('data-mode'));
  ok('模式也落盘', win.localStorage.getItem('advmath.mode.v1') === 'auto');
  // 三态循环：跟随系统 → 亮色 → 暗色 → 跟随系统
  T.setMode('auto');
  T.toggleMode();
  ok('三态循环 1/3：跟随系统 → 亮色', d.documentElement.getAttribute('data-mode') === 'light',
     d.documentElement.getAttribute('data-mode'));
  T.toggleMode();
  ok('三态循环 2/3：亮色 → 暗色', d.documentElement.getAttribute('data-mode') === 'dark');
  T.toggleMode();
  ok('三态循环 3/3：暗色 → 跟随系统（移除 data-mode）',
     !d.documentElement.hasAttribute('data-mode'));
  ok('「跟随系统」态在按钮上有可见标记（is-auto 类）',
     d.querySelector('.mode-toggle').classList.contains('is-auto'));
  ok('自动态按钮 title 写明当前是跟随系统',
     /跟随系统/.test(d.querySelector('.mode-toggle').getAttribute('title') || ''));
  ok('默认主题是霜蓝（default）', T.THEMES[0].id === 'default' && T.THEMES[0].name === '霜蓝');
}

console.log('\n【3b】中英语言开关：中英对照 ⇄ 纯中文');
{
  const win = new Window({ url: 'http://localhost/' });
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  win.document.write(readFileSync(`${SITE}/chapters/ch1.html`, 'utf8'));
  new Function(readFileSync(`${SITE}/assets/js/theme.js`, 'utf8'))();
  if (win.document.readyState === 'loading') {
    win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  }
  const d = win.document;
  const T = win.__THEME__;

  ok('默认是中英对照（不写 data-lang）', T.currentLang() === 'both');
  ok('顶栏有语言按钮', !!d.querySelector('.lang-toggle'));
  ok('中英对照态按钮显示「中英」', d.querySelector('.lang-toggle').textContent === '中英',
     d.querySelector('.lang-toggle').textContent);

  T.setLang('zh');
  ok('切纯中文 → <html data-lang="zh">',
     d.documentElement.getAttribute('data-lang') === 'zh');
  ok('切纯中文 → 落盘 localStorage',
     win.localStorage.getItem('advmath.lang.v1') === 'zh');
  ok('纯中文态按钮显示「中」', d.querySelector('.lang-toggle').textContent === '中');
  ok('纯中文态按钮带 is-zh 标记', d.querySelector('.lang-toggle').classList.contains('is-zh'));

  T.setLang('both');
  ok('切回中英对照 → 移除 data-lang', !d.documentElement.hasAttribute('data-lang'));
  ok('窄屏菜单里有语言行（中英对照 / 纯中文两个按钮）',
     d.querySelectorAll('.lang-ctl-mobile .tcm-btn').length === 2);

  // CSS：三条隐藏规则必须都在，否则纯中文会漏出英文
  const css = readFileSync(`${SITE}/assets/css/style.css`, 'utf8');
  ['\\.en', '\\.q-stem-en', '\\.en-inline'].forEach((sel) => {
    const re = new RegExp('\\[data-lang="zh"\\][^{]*' + sel + '[^{]*\\{[^}]*display:\\s*none');
    ok(`CSS 有 [data-lang="zh"] ${sel.replace(/\\\\/g, '')} { display:none }`, re.test(css));
  });
}

console.log('\n【4】英文字体独立指定，公式不被污染');
{
  const s = readFileSync(`${SITE}/assets/css/style.css`, 'utf8');
  ok('定义了 --font-en 变量', /--font-en:/.test(s));
  const stack = (s.match(/--font-en:\s*([^;]+);/) || [])[1] || '';
  ok('英文字体栈以衬线系打头（Source Serif 4 / Charter / Georgia）',
     /Source Serif|Charter|Georgia/.test(stack), stack.slice(0, 60));
  ok('英文字体栈末尾回退到系统默认（含 serif 兜底）', /serif\s*$/.test(stack.trim()),
     stack.trim().slice(-40));
  ok('.en 使用 --font-en（不跟随中文栈）',
     /\.en\s*\{[^}]*font-family:\s*var\(--font-en\)/s.test(s));
  ok('.zh 使用中文栈', /\.zh\s*\{[^}]*font-family:\s*var\(--font\)/s.test(s));
  ok('英文行行高大于中文行',
     parseFloat((s.match(/\.en\s*\{[^}]*line-height:\s*([\d.]+)/s) || [])[1]) >
     parseFloat((s.match(/\.zh\s*\{[^}]*line-height:\s*([\d.]+)/s) || [])[1]));
  ok('英文长单词可断行（hyphens / overflow-wrap）',
     /\.en\s*\{[^}]*(hyphens:\s*auto|overflow-wrap)/s.test(s));
  ok('没有给 mjx-container 指定正文字体族',
     !/mjx-container\s*\{[^}]*font-family:\s*var\(--font/.test(s));
}

console.log('\n【5】顺序：所有双语容器都是中文在前');
{
  const OPEN = /<div\b[^>]*>|<\/div>/g;
  const BI = /<div class="bi">/g;
  let checked = 0, wrong = [];
  // ⚠️ 必须包含 index.html：v0.4.0 首页的 hero 是"英文在前"，而且整页没有 .bi 容器，
  // 于是它既没被翻转过、也躲过了所有检查，直到用户截图才发现。
  for (const page of ['index.html', 'chapters/ch1.html', 'chapters/ch2.html', 'chapters/supp1.html']) {
    const src = readFileSync(`${SITE}/${page}`, 'utf8');
    let m;
    BI.lastIndex = 0;
    while ((m = BI.exec(src))) {
      // 括号配平找结尾
      OPEN.lastIndex = m.index;
      let depth = 0, end = null, t;
      while ((t = OPEN.exec(src))) {
        depth += t[0].startsWith('</') ? -1 : 1;
        if (depth === 0) { end = t.index + t[0].length; break; }
      }
      const inner = src.slice(m.index + m[0].length, end);
      const order = [...inner.matchAll(/<p class="(zh|en)"/g)].map((x) => x[1]);
      checked++;
      if (order.length && order[0] !== 'zh') wrong.push(`${page}: ${order.slice(0, 3)}`);
      if (order.filter((x) => x === 'zh').length !== order.filter((x) => x === 'en').length) {
        wrong.push(`${page}: 中英段数不等`);
      }
    }
  }
  ok(`检查了 ${checked} 个双语容器，全部中文在前、中英段数相等`,
     wrong.length === 0 && checked > 0, wrong.slice(0, 3).join(' / '));
}

console.log(`\n${'='.repeat(50)}`);
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
console.log('='.repeat(50));
process.exit(fail ? 1 : 0);
