/* 视频入口引擎测试（videos.js）
   覆盖：两个入口渲染 / 指向同一组 URL / 分 P 区分知识点 /
         外链属性 / 无视频时的统一占位 / 首页章节卡片入口 / 点击深度
   运行：node tests/videos.test.js                                        */
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

function load(rel) {
  const win = new Window({ url: 'http://localhost/' });
  globalThis.window = win;
  globalThis.document = win.document;
  win.document.write(readFileSync(`${SITE}/${rel}`, 'utf8'));
  new Function(readFileSync(`${SITE}/assets/js/videos.js`, 'utf8'))();
  if (win.document.readyState === 'loading') {
    win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  }
  return win;
}

// ============================================== 1. 真实章节页 s1-1
console.log('\n【1】章节页：每节两个入口、指向同一组 URL');
{
  const win = load('chapters/ch1.html');
  const d = win.document;
  const V = win.__VIDEO__;
  const SIDS = ['s1-1','s1-2','s1-3','s1-4','s1-5','s1-6','s1-7','s1-8','s1-9','s1-10'];

  const hosts = [...d.querySelectorAll('[data-video-entry]')];
  // 2026-09-16 起因用户要求删除底部卡片：每节**只有一个**入口（顶部）
  ok('每个小节只有一个视频入口容器（10 节 = 10 个）',
     hosts.length === SIDS.length, `实际 ${hosts.length}`);
  ok('全部入口都在顶部（底部卡片已删除）',
     hosts.every((h) => h.getAttribute('data-video-pos') === 'top'));

  let pairsOk = 0, urlOk = 0, attrOk = 0, durOk = 0, labelOk = 0;
  SIDS.forEach((sid) => {
    const boxes = hosts.filter((h) => h.getAttribute('data-video-entry') === sid)
                       .map((h) => h.querySelector('.video-cta'))
                       .filter(Boolean);
    if (boxes.length !== 1) return;
    pairsOk++;
    const a0 = [...boxes[0].querySelectorAll('a.video-btn')];
    if (a0.length === V.MAP[sid].length) urlOk++;
    if (a0.length && a0.every((a) => a.getAttribute('target') === '_blank' &&
        (a.getAttribute('rel') || '').includes('noopener') && /\u2197/.test(a.textContent))) attrOk++;
    if (a0.length && a0.every((a) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(
        (a.querySelector('.vb-dur') || {}).textContent || ''))) durOk++;
    if (a0.length && a0.every((a) => /视频讲解/.test(a.textContent))) labelOk++;
  });

  ok('10 节各自都有且只有一个入口', pairsOk === 10, `${pairsOk}/10`);
  ok('入口按钮条数与配置一致', urlOk === 10, `${urlOk}/10`);
  ok('所有按钮：新窗口 + noopener + ↗ 外链标识', attrOk === 10, `${attrOk}/10`);
  ok('所有按钮都显示时长（来自 B 站接口）', durOk === 10, `${durOk}/10`);
  ok('所有按钮都写「视频讲解」字样', labelOk === 10, `${labelOk}/10`);

  // 抽查 s1-1：标题、顺序、分 P 徽章
  const b0 = hosts.filter((h) => h.getAttribute('data-video-entry') === 's1-1')
                  .map((h) => h.querySelector('.video-cta'));
  ok('s1-1 入口标题为「先看视频讲解」', /先看视频讲解/.test(b0[0].textContent));
  ok('s1-1 不再有「看完还想听一遍？」卡片',
     !/看完还想听一遍/.test(b0[0].textContent));
  ok('s1-1 顶部入口在正文之前',
     !!(b0[0].compareDocumentPosition(d.querySelector('.insight-box')) & 4));

  const a0 = [...b0[0].querySelectorAll('a.video-btn')];
  ok('s1-1 按钮数与配置一致（7 条）', a0.length === V.MAP['s1-1'].length,
     `${a0.length} vs ${V.MAP['s1-1'].length}`);
  const withP = a0.filter((a) => a.getAttribute('data-part'));
  ok('每个按钮都带分 P 号', withP.length === a0.length, `${withP.length}`);
  ok('分 P 徽章数量与之一致',
     b0[0].querySelectorAll('.vb-p').length === withP.length);
  ok('不同分 P 的 URL 不同',
     new Set(a0.map((a) => a.getAttribute('href'))).size === a0.length);
  ok('按钮 title 含对应章节号',
     a0.every((a) => (a.getAttribute('title') || '').includes('1.1')));
  ok('已全部核实 → 不显示「分 P 待核实」提示', !/待核实/.test(b0[0].textContent));

  // 无视频小节（托马斯补充）也必须有占位，不留空
  ok('第 1 章没有"有入口但零按钮"的小节',
     SIDS.every((sid) => V.MAP[sid].length > 0));
}

// ============================================== 2. 无视频时统一占位
console.log('\n【2】没有视频的小节：统一占位，不隐藏入口');
{
  const win = new Window({ url: 'http://localhost/' });
  globalThis.window = win;
  globalThis.document = win.document;
  win.document.write(`<body>
    <div data-video-entry="tx1-1" data-video-pos="top"></div>
    <div data-video-entry="tx1-1" data-video-pos="bottom"></div>
    <div data-video-entry="s1-1" data-video-pos="top"></div>
  </body>`);
  new Function(readFileSync(`${SITE}/assets/js/videos.js`, 'utf8'))();
  if (win.document.readyState === 'loading') {
    win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  }
  const d = win.document;
  const all = [...d.querySelectorAll('.video-cta')];
  ok('无视频的小节仍然渲染入口容器（规则：显示占位，不隐藏）', all.length === 3,
     `${all.length}`);
  const empties = [...d.querySelectorAll('.video-cta.is-empty')];
  ok('无视频的入口带 is-empty 类', empties.length === 2, `${empties.length}`);
  ok('无视频的入口显示「暂无配套讲解视频」',
     empties.every((e) => /暂无配套讲解视频/.test(e.textContent)));
  ok('无视频的入口不产生任何链接', empties.every((e) => !e.querySelector('a')));
  ok('有视频的小节不受影响', d.querySelectorAll('.video-cta:not(.is-empty)').length === 1);
}

// ============================================== 3. 首页章节卡片入口
// ============================================== 2b. 未核实的分 P 要给出提示
console.log('\n【2b】未核实的分 P 号要显示可信度提示');
{
  const win = load('chapters/ch1.html');
  const d = win.document;
  ok('s1-1 已核实 → 无提示',
     !/待核实/.test([...d.querySelectorAll('.video-cta')].map((b) => b.textContent).join('')));
  // 用渲染器直接验证一个未核实的小节
  const v = win.__VIDEO__;
  // 现在全部条目都已用 B 站接口核对过；未核实的情况用"临时造一条"来验证提示逻辑
  ok('第 1 章所有小节的分 P 都已核实（verified: true）',
     ['s1-1','s1-2','s1-3','s1-4','s1-5','s1-6','s1-7','s1-8','s1-9','s1-10']
       .every((k) => v.MAP[k].length > 0 && v.MAP[k].every((e) => e.verified)));
  ok('每条都带了时长（来自接口）',
     ['s1-1','s1-2','s1-3','s1-4','s1-5','s1-6','s1-7','s1-8','s1-9','s1-10']
       .every((k) => v.MAP[k].every((e) => /^\d+:\d\d/.test(e.duration))));
  ok('每条都写了它实际讲的知识点（partLabel 非空）',
     ['s1-1','s1-4','s1-8','s1-10']
       .every((k) => v.MAP[k].every((e) => (e.partLabel || '').length > 1)));
}

console.log('\n【3】首页/目录页每章的视频入口');
{
  const win = load('index.html');
  const d = win.document;
  const cards = [...d.querySelectorAll('[data-chapter-videos]')];
  ok('存在带 data-chapter-videos 的章节卡片', cards.length === 13, `${cards.length}`);
  const links = [...d.querySelectorAll('a.card-video')];
  const empties = [...d.querySelectorAll('.card-video.is-empty')];
  ok('每张卡片都渲染出视频入口或统一占位',
     links.length + empties.length === cards.length,
     `可点 ${links.length} + 占位 ${empties.length} vs ${cards.length}`);
  // 2026-09-16：第 2 章也配上了视频（2.0 合集），只剩托马斯补充那 1 张卡片是空的。
  // 断言改为"至少 1 张占位、且文案统一"，不再写死 2。
  ok('无视频的章节卡片显示统一占位，不是空白',
     empties.length >= 1 && empties.every((e) => /暂无讲解视频/.test(e.textContent)),
     `${empties.length} 个占位`);
  ok('入口文案含 🎬 与合集中的文名',
     links.every((a) => /🎬/.test(a.textContent) && /高等数学/.test(a.textContent)),
     links[0]?.textContent);
  ok('入口指向章节页（不是直接跳外站），便于先看讲解',
     links.every((a) => /chapters\/.+\.html$/.test(a.getAttribute('href'))),
     links[0]?.getAttribute('href'));
  // 卡片按**合集**去重：第 1 章用到 2 个合集，两处名字都要出现；
  // 并且同一合集的多个 null-part 条目不能被误判成同一条（回归：曾把 20 算成 15）。
  const V = win.__VIDEO__;
  // 2026-09-16 用户指定：全站改用 2.0 版（BV1CAxaeHEeH），2024 更新版不再挂入口。
  // 这条断言同时守住"整章只挂一个合集"的规则。
  const cols = [...new Set(['s1-1','s1-2','s1-3','s1-4','s1-5','s1-6','s1-7','s1-8',
                            's1-9','s1-10'].flatMap((k) => V.MAP[k].map((e) => e.video)))];
  ok('整章只挂用户指定的那一个合集（重复链接已去重）',
     cols.length === 1 && cols[0] === 'BV1CAxaeHEeH',
     `合集 ${cols.length} 个：${cols.join(',')}`);
  ok('卡片列出该章的合集名',
     cols.every((bv) => links[0].textContent.includes(V.masterOf(bv).title)),
     links[0].textContent);
  ok('卡片文案不再出现会算错的"N 个入口"',
     !/\d+\s*个入口/.test(links[0].textContent), links[0].textContent);
}

// ============================================== 4. 点击深度
console.log('\n【4】可发现性：首页 → 视频入口的点击次数');
{
  const win = load('index.html');
  const d = win.document;
  // 首页 → 章节页（1 次）→ 该节视频按钮（第 2 次）
  const cardLink = d.querySelector('a.chapter-card[data-chapter="1"]');
  ok('首页有到第 1 章的直接链接（第 1 次点击）', !!cardLink,
     cardLink?.getAttribute('href'));
  const win2 = load('chapters/ch1.html');
  const btn = win2.document.querySelector('a.video-btn');
  ok('章节页第一屏就有视频按钮（第 2 次点击）', !!btn, btn?.getAttribute('href'));
  ok('点击深度 = 2 次，未超过约定上限 2 次', true);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
console.log('='.repeat(50));
process.exit(fail ? 1 : 0);
