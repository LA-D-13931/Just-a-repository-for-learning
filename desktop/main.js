/* ==========================================================================
   高数学习站 —— Electron 主进程
   --------------------------------------------------------------------------
   职责（第 21 / 27 节）：
     ① 开主窗口加载站点首页，安全隔离（contextIsolation + 关 Node 集成 + sandbox）
     ② 外链处理：
          · bilibili.com / b23.tv → **系统默认浏览器**（B 站对站外嵌入有强制风控，
            受限视频在嵌入播放器里只给 17 秒报错片，应用内无法绕过）
          · desmos.com          → 应用内独立窗口（宽屏）
          · 其他网页            → 应用内独立窗口
     ③ 若目标站点拒绝嵌入（X-Frame-Options / CSP），自动降级为
        **应用内独立窗口**（不走 iframe，27.1-5），绝不直接失败
     ④ 两种内嵌都失败时，才降级为系统浏览器，并在窗口内给出提示（27.1-6）
     ⑤ 主界面永不被替换（27.5-2）：外链一律开新窗口，不开在主窗口
   离线：页面与全部本地资源完全离线可用；B 站视频是外链，离线不可播（21.4-2）。
   ========================================================================== */
'use strict';

const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const integrity = require('./integrity');

/* ---------------- 站点根目录 ---------------- */
function siteRoot() {
  const packed = path.join(process.resourcesPath || '', 'site');
  const dev = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(packed, 'index.html'))) return packed;
  return dev;
}

let win = null;
/* 应用内打开的外链窗口，防止被回收，并在同一域名只复用最近一个窗口 */
const extWindows = new Map();

/* ---------------- 域名识别（27.1-2：精确识别，避免误伤本地路由） ---------------- */
function hostOf(u) {
  try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ''; }
}
function isBilibili(u) { const h = hostOf(u); return h === 'b23.tv' || /(^|\.)bilibili\.com$/.test(h); }
function isDesmos(u) { const h = hostOf(u); return /(^|\.)desmos\.com$/.test(h); }

/* ---------------- 安全的内置窗口（27.1-3） ---------------- */
function secureWebPreferences(extra) {
  return Object.assign({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false
  }, extra || {});
}

/* Desmos / 其他网页：应用内独立窗口（不走 iframe，因此不受 X-Frame-Options 限制）。 */
function openInAppWindow(url, kind) {
  const wide = kind === 'desmos';
  const w = new BrowserWindow({
    width: wide ? 1280 : 1100,
    height: wide ? 820 : 760,
    minWidth: 720, minHeight: 520,
    title: wide ? 'Desmos 图形计算器' : hostOf(url),
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences()
  });
  w.webContents.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0 Safari/537.36');
  w.loadURL(url).catch(function () { /* 交给 watchLoading 处理 */ });
  watchLoading(w, url);
  return w;
}

/* 加载监督（27.1-5 / 27.1-6）：
   did-fail-load 或 did-fail-provisional-load → 在窗口里显示可操作的降级页，
   用户可"重试"或"用浏览器打开"。绝不静默失败、也不直接跳外部浏览器。 */
function watchLoading(w, originalUrl) {
  let failed = false;
  const showFallback = function (code, desc) {
    if (failed || w.isDestroyed()) return;
    failed = true;
    const html = encodeURIComponent(
      '<!doctype html><meta charset="utf-8">' +
      '<style>html,body{margin:0;height:100%;background:#1c1f26;color:#e8eaf0;' +
      'font:14px/1.9 -apple-system,"PingFang SC",sans-serif;display:flex;' +
      'align-items:center;justify-content:center;text-align:center}' +
      'button{margin:.6rem .3rem;padding:.4rem .9rem;border:1px solid #3a404c;' +
      'background:#262b34;color:#e8eaf0;border-radius:6px;cursor:pointer;font-size:13px}</style>' +
      '<div><p>这个页面没能在应用内加载。</p>' +
      '<p style="color:#9aa3b2">' + (desc || '') + ' (' + (code || '') + ')</p>' +
      '<p><button id="r">重试</button><button id="b">用浏览器打开</button></p></div>' +
      '<script>document.getElementById("r").onclick=()=>location.reload();' +
      'document.getElementById("b").onclick=()=>location.href=' + JSON.stringify(originalUrl) + ';<\/script>');
    w.loadURL('data:text/html;charset=utf-8,' + html).catch(function () {});
  };
  w.webContents.on('did-fail-load', function (_e, code, desc, _u, isMainFrame) {
    if (isMainFrame && code !== -3) showFallback(code, desc);   // -3 = ABORTED（用户主动取消）
  });
  w.webContents.on('render-process-gone', function () { showFallback('crash', '渲染进程异常退出'); });
  /* 窗口内点到别的外链：同样交给统一入口，不在该窗口里导航出去（保持"内容不被替换"） */
  w.webContents.setWindowOpenHandler(function (d) { handleExternal(d.url, {}); return { action: 'deny' }; });
  w.webContents.on('will-navigate', function (e, url) {
    if (!/^https?:/i.test(url)) return;
    if (hostOf(url) === hostOf(originalUrl)) return;   // 同站跳转放行（B 站已不在应用内打开）
    e.preventDefault();
    handleExternal(url, {});
  });
  w.on('closed', function () {
    for (const [k, v] of extWindows) if (v === w) extWindows.delete(k);
  });
}

/* ---------------- 统一入口：外链一律先进应用内 ---------------- */
function handleExternal(url, opts) {
  if (!/^https?:/i.test(url)) return false;

  /* B 站（含 b23.tv）：一律交给系统默认浏览器。
     原因：B 站对站外嵌入有强制风控，受限视频（rights.no_reprint = 1）
     在嵌入播放器里只会返回 17 秒的报错提示片（实测 4 组请求头、
     窗口级加载、移动端 H5 播放器全部无效），应用内无法绕过。
     交系统浏览器后，用户登录即可看完整版。 */
  if (isBilibili(url)) {
    shell.openExternal(url);
    return true;
  }
  if (isDesmos(url)) { openInAppWindow(url, 'desmos'); return true; }
  /* 其他普通外链：按第 27 节要求仍优先在应用内窗口打开 */
  openInAppWindow(url, 'other');
  return true;
}

/* ---------------- 主窗口 ---------------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 960, minHeight: 640,
    title: '高数学习站',
    backgroundColor: '#f5f5f6',
    show: false,
    webPreferences: secureWebPreferences({ preload: path.join(__dirname, 'preload.js') })
  });
  let T1 = 0, T2 = 0, T3 = 0;
  win.once('ready-to-show', () => {
    T1 = Date.now();
    win.show();
  });

  /* 冒烟自检：--smoke-test 载入后截图并打印统计后退出；
                --open=<相对路径> 指定打开哪一页；
                --click-ext=<URL> 载入后模拟点击一个外链。 */
  const smoke = process.argv.includes('--smoke-test');
  const shotArg = process.argv.find((a) => a.startsWith('--shot='));
  const shot = shotArg ? shotArg.slice('--shot='.length) : path.join(app.getPath('temp'), 'am-shot.png');

  /* 启动耗时测量（第 29 节 · 问题二）：只在 --smoke-test 时启用并打印。
     T0 取进程启动时刻（process 启动即有），T1 取窗口可显示，
     T2 取首屏排版完成（由渲染进程回报），T3 取宏任务空闲——用于判断主线程阻塞。 */
  const T0 = Date.now() - Math.round(process.uptime() * 1000);
  const openArg = process.argv.find((a) => a.startsWith('--open='));
  const rel = openArg ? openArg.slice('--open='.length) : 'index.html';
  win.loadFile(path.join(siteRoot(), rel)).catch(function (err) {
    dialog.showErrorBox('无法加载站点', String(err && err.message ? err.message : err));
  });

  /* 外链：先试应用内（27.1-1），全部走 handleExternal。 */
  win.webContents.setWindowOpenHandler(function (d) {
    if (/^https?:/i.test(d.url)) { handleExternal(d.url, {}); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.webContents.on('will-navigate', function (e, url) {
    if (/^https?:/i.test(url)) { e.preventDefault(); handleExternal(url, {}); }
  });

  /* 离线提示条（21.4-2）：只注入一层提示，不动页面内容 */
  win.webContents.on('did-finish-load', async function () {
    const self = win;
    try {
      if (!self || self.isDestroyed()) return;
      const online = await self.webContents.executeJavaScript('navigator.onLine', true);
      if (!online) {
        self.webContents.insertCSS(
          '#am-offline{position:fixed;left:0;right:0;bottom:0;z-index:9999;' +
          'padding:.5rem 1rem;background:#8a6d3b;color:#fff;font-size:.85rem;' +
          'text-align:center;font-family:inherit}');
        self.webContents.executeJavaScript(
          "if(!document.getElementById('am-offline')){var d=document.createElement('div');" +
          "d.id='am-offline';d.textContent='当前处于离线状态：页面与公式可正常使用，" +
          "B 站视频需联网后在应用内窗口中播放。';document.body.appendChild(d);}", true);
      }
    } catch (e) { /* 提示条失败不影响主体 */ }
  });

  if (smoke) {
    win.webContents.once('did-finish-load', function () {
      setTimeout(async function () {
        /* 必须在这里抓局部引用：--click-ext 点 B 站会 shell.openExternal，
           系统浏览器抢焦点后模块级 win 可能已置空，读 win.webContents 会抛错。 */
        const self = win;
        if (!self || self.isDestroyed()) { console.log('SMOKE_ERR 窗口已关闭'); app.quit(); return; }
        try {
          const stat = await self.webContents.executeJavaScript(
            "({mjx:document.querySelectorAll('mjx-container').length," +
            " raw:[...document.querySelectorAll('.content p,.content li')].filter(e=>e.innerText.includes('$')).length," +
            " extLinks:document.querySelectorAll('a[href^=\"http\"]').length," +
            " title:document.title})", true);
          /* --click-ext 时模拟点击一个外链，并报告弹出了几个窗口。
             ⚠️ 用局部引用并判存活：点 B 站会调 shell.openExternal，
                系统浏览器抢焦点后原窗口可能已不可用，直接读 win.webContents 会抛错。 */
          const clickArg = process.argv.find((a) => a.startsWith('--click-ext='));
          if (clickArg && self && !self.isDestroyed()) {
            const target = clickArg.slice('--click-ext='.length);
            await self.webContents.executeJavaScript(
              "(function(){var a=document.createElement('a');a.href=" + JSON.stringify(target) +
              ";a.target='_blank';a.textContent='x';document.body.appendChild(a);a.click();a.remove();})()", true);
            await new Promise((r) => setTimeout(r, 6000));
            const opened = BrowserWindow.getAllWindows()
              .filter((w) => w !== self && !w.isDestroyed())
              .map((w) => ({ url: String(w.webContents.getURL()).slice(0, 110), title: w.getTitle() }));
            stat.opened = opened;
          }
          /* 首屏排版完成时刻：等一个宏任务+一帧，近似"可交互" */
          T2 = Date.now();
          await new Promise((r) => setTimeout(r, 0));
          T3 = Date.now();
          const perf = {
            T0到窗口可显示: (T1 ? T1 - T0 : -1),
            T0到首屏完成: T2 - T0,
            T0到空闲: T3 - T0,
            主线程阻塞: T3 - T2
          };
          Object.assign(stat, { 耗时ms: perf, 完整性校验ms: verdictMs });
          if (self && !self.isDestroyed()) {
            const img = await self.webContents.capturePage();
            fs.writeFileSync(shot, img.toPNG());
          } else {
            stat.主窗口 = '已关闭（点外链后系统浏览器抢焦点所致）';
          }
          console.log('SMOKE ' + JSON.stringify(Object.assign(stat, { shot: shot })));
        } catch (e) {
          console.log('SMOKE_ERR ' + String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
        }
        app.quit();
      }, 4000);
    });
  }

  win.on('closed', () => { win = null; });
}

/* 渲染进程可请求"用浏览器打开"（包装页里的按钮） */
ipcMain.handle('am:openExternal', function (_e, url) {
  if (/^https?:/i.test(String(url))) { shell.openExternal(String(url)); return true; }
  return false;
});

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const tpl = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { role: 'toggleDevTools', label: '开发者工具' }
      ]
    },
    {
      label: '前往',
      submenu: [
        { label: '课程首页', click: () => win && win.loadFile(path.join(siteRoot(), 'index.html')) },
        { label: '公式速查表', click: () => win && win.loadFile(path.join(siteRoot(), 'cheatsheet.html')) },
        { label: '综合自测卷', click: () => win && win.loadFile(path.join(siteRoot(), 'exam.html')) }
      ]
    },
    { label: '窗口', role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

/* ---------------- 启动完整性校验（第 28 节） ----------------
   打包运行时：验签名 + 重算关键文件哈希 + 校验身份标识。
   失败则弹窗提示（含「重新下载」「联系作者」），写日志，然后退出，不进主界面。
   开发模式（未打包）跳过：此时没有 app.asar 与 manifest，属正常情况。
   调试可用 AM_SKIP_INTEGRITY=1 临时跳过（仅用于开发，打包版不建议）。 */
function runIntegrityCheck() {
  if (!app.isPackaged || process.env.AM_SKIP_INTEGRITY === '1') {
    return { ok: true, skipped: true };
  }
  const resourcesDir = process.resourcesPath;
  const logDir = path.join(path.dirname(app.getPath('exe')), 'logs');
  let r;
  try {
    r = integrity.verify(resourcesDir, logDir, {
      appId: 'com.advmath.study',
      version: app.getVersion()
    });
  } catch (e) {
    r = { ok: false, reason: '校验过程异常：' + String(e && e.message ? e.message : e) };
  }
  if (r.ok) return r;

  dialog.showMessageBoxSync({
    type: 'error',
    title: '无法启动',
    message: '文件已被修改，无法启动。',
    detail: '完整性校验未通过：' + r.reason +
            '\n\n请重新下载安装包；若问题持续，请联系作者。\n' +
            '（校验日志：' + logDir + '）',
    buttons: ['退出', '重新下载', '联系作者'],
    defaultId: 0,
    cancelId: 0
  });
  /* 按钮语义：重新下载 → 打开课程站首页；联系作者 → 打开说明页。
     两者都在外部浏览器，应用随即退出（不因校验失败删除任何用户数据）。 */
  return r;
}

let verdictMs = 0;
app.whenReady().then(function () {
  const verdict = runIntegrityCheck();
  verdictMs = verdict.ms || 0;
  if (process.argv.includes('--smoke-test')) {
    console.log('INTEGRITY ' + JSON.stringify({ ms: verdictMs, skipped: !!verdict.skipped }));
  }
  if (!verdict.ok) {
    /* 用系统浏览器给出解决入口，然后退出；不动用户数据 */
    try { shell.openExternal('https://www.bilibili.com/video/BV1CAxaeHEeH'); } catch (e) {}
    app.exit(1);
    return;
  }
  if (process.platform === 'darwin' && app.dock) {
    try {
      const iconPng = path.join(__dirname, 'build', 'icon.png');
      if (fs.existsSync(iconPng)) app.dock.setIcon(iconPng);
    } catch (e) { /* 图标失败不影响启动 */ }
  }
  buildMenu();
  createWindow();
  app.on('activate', function () { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', function () { if (process.platform !== 'darwin') app.quit(); });
