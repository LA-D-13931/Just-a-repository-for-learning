# 引擎与格式要求

> 本文档给出每个引擎的**实际版本、入口、格式要求、缓存策略与验证方式**。
> 版本号均为项目内实测值，不是"建议版本"。
>
> 版本基准：v0.8.2 ｜ 更新日期：2026-09-19

---

## 1. 公式引擎：MathJax

### 1.1 版本与位置

| 项 | 值 |
|---|---|
| 引擎 | **MathJax 3.2.2** |
| 文件 | `assets/js/vendor/tex-svg.js`（2,108,580 字节，本地副本） |
| 来源 | jsDelivr 下载后本地化（v0.7.87 起），sha256 前缀 `d4295dc3…` |
| 输出格式 | **SVG**（`tex-svg`） |
| 许可 | Apache License 2.0 |

**禁止**：改这个文件；改回 CDN（会破坏离线能力）。

### 1.2 配置（在每个章节页的 `<head>` 内联）

```js
window.MathJax = {
  options: { skipHtmlTags: ['script','noscript','style','textarea','pre','code'] },
  svg: { fontCache: 'local', overflow: 'scale' },
  startup: { typeset: false, ready: function () { MathJax.startup.defaultReady();
                                               window.__mjxReady = true; } }
};
```

| 配置 | 为什么必须这样 |
|---|---|
| `startup.typeset: false` | 默认会在就绪时**同步排版全页**，实测主线程阻塞 1.7 s（切换章节卡顿的根因） |
| `fontCache: 'local'` | `'global'` 会生成一个隐藏的共享字形缓存（实测宽 5155px），撑出横向滚动条 |
| `svg.overflow: 'scale'` | 允许缩放而非裁切公式 |

### 1.3 分片调度（性能关键）

排版由页面底部的内联脚本驱动（不是 MathJax 自动跑）：

1. 先排**首屏 60 个块**（约 25 ms，主线程立刻可用）
2. 其余块交给 `IntersectionObserver`（`rootMargin: '400px 0px'`），进视口附近才入队
3. 队列按**每批 25 个**排版，批间用 `requestIdleCallback` 让出主线程
4. 队列排空后执行一次**兜底补排**：重扫仍未被处理的 `.example-head`（v0.8.2 新增）

**实测效果**（v0.7.87）：ch3 `load` 2426 → 108 ms，主线程阻塞 1218–1876 → 0 ms。

### 1.4 排版范围（`SEL` 选择器）★ 最易踩的坑

```js
SEL = 'p, li, h2, h3, h4, td, th, figcaption, .box-title, .example-head'
```

**不在这个列表里的元素，里面的 `$…$` 会被当纯文本显示。**

| 时期 | 事故 |
|---|---|
| v0.8.2 之前 | `SEL` 缺 `.example-head` → 例题标题里的 `$\varepsilon$-$N$` 裸露（88 处 / 11 个文件） |
| v0.8.2 | 补上 `.example-head`，并加兜底补排 |

**新增任何"能写公式"的容器时，必须把它的类名加进 `SEL`**（16 个页面同步）。
**验证**：浏览器打开目标页 → 该元素里应出现 `<mjx-container>`，且**可见文本里不再有 `$`**。

### 1.5 横向滚动条（三个已修过的原因）

| 原因 | 修法 |
|---|---|
| 全局字形缓存 | `fontCache: 'local'` |
| MathJax 的 `width="..."` 布局宽度大于视觉宽度 | `svg.overflow: 'scale'` + `mjx-container > svg { max-width:100% }` |
| 残留宽度 | `mjx-container:not([display=true]) { padding-inline:6px; box-sizing:border-box }` |

**验证**：`node tests/check-layout.js`（320 / 768 / 1280 三档，页面级溢出必须为 0）。

### 1.6 缓存策略

无额外缓存层。MathJax 内部对同一公式有布局缓存；页面级依赖浏览器缓存。
`?eager=1` 参数可关闭分片调度、退回一次性全页排版（**仅供校验脚本量最终版面用**）。

---

## 2. 图表引擎：自研 SVG（`plot.js`）

### 2.1 概况

| 项 | 值 |
|---|---|
| 引擎 | **自研**，非 ECharts / D3 / Chart.js |
| 文件 | `assets/js/plot.js`（64,998 字节） |
| 输出 | 内联 `<svg>` |
| 入口 | `Plot.render(hostElement, spec)` |

### 2.2 `spec` 字段

| 字段 | 含义 |
|---|---|
| `width` / `height` / `maxWidth` | 画布尺寸（用户单位） |
| `x` / `y` | 坐标范围 `[min, max]` |
| `axes` | 坐标轴开关/刻度 |
| `panels` | 多面板：`{ x, y, w, h, title, xr, yr, padding }`（`x/y/w/h` 是 0–1 相对值） |
| `elements` | 绘制元素数组，每项带 `type` 与 `panel` 索引 |
| `legend` / `legendPos` / `legendOutside` | 图例 |
| `padding` | 内容与容器边缘的留白，**要求 ≥20px** |
| `verify` | 是否参与视觉自检 |
| `aria` / `role` | 无障碍 |

### 2.3 `elements` 类型

```
fn  poly  param  implicit  point  segment  arrow  vector  polygon  rect
region  label  bars  field  numberline  seq
```

### 2.4 格式要求（硬约束）

| # | 要求 | 原因 |
|---|---|---|
| 1 | `Plot.render` **必须在 `host.appendChild(svg)` 之后**调用 | 否则 `getBBox()` 返回 0×0，图例与防重叠全部失效 |
| 2 | 所有元素坐标必须落在 `x` / `y`（或面板的 `xr` / `yr`）范围内 | 超出会被面板裁剪（v0.8.1 修过：顶点 x=4.6 而范围上界 3.9） |
| 3 | 面板 `padding` 四边 ≥20px | 内容贴边 |
| 4 | 多面板图（`panels.length ≥ 2`）的 `figcaption` 必须**分栏** | 见 §2.6 |

### 2.5 常见 Bug → 入口

| 现象 | 原因 | 入口 |
|---|---|---|
| 图形被右侧裁掉 | 元素坐标超出 `x` 上界 | 该图的 `Plot.render` 的 `x` 与 `panels[].xr` |
| 文字互相压住 | 标注过密 / 避让未生效 | `plot.js: resolveTextOverlaps()`；优先级 轴名(0) < 刻度(1) < 用户标注(2) |
| 图例盖住图形 | 自动摆放失败 | `plot.js` 图例逻辑：6 个候选位（四角 + 左右中），硬否决相交则 `legendOutside:'bottom'` |
| 拖动侧栏后图变形 | 未重绘 | `site.js: resyncPlots()` → `plot.redrawAll()` |
| 导出/打印错位 | `isConnected === false` | 确认元素已插入文档 |

### 2.6 并列小图的解析分栏（v0.8.1）

多面板图的 `<figcaption>` **必须**用已有的三件套：

```html
<figcaption class="has-cols">
  <p class="fc-lead">图　标题…</p>
  <div class="fig-cols" style="grid-template-columns:repeat(2,1fr)">
    <div class="fc">左：…</div>
    <div class="fc">右：…</div>
  </div>
</figcaption>
```

`repeat(2,1fr)` 与图的两个面板**等宽对齐**；三面板图用 `repeat(3,1fr)`。
`≤560px` 时由 CSS 自动堆叠为单列。

**验证**：`python3 tools/check-chart-visual.py`（46 图，含裁剪/重叠/留白检测）。

### 2.7 缓存策略

无缓存。窗口尺寸变化时通过 `redrawAll()` 整体重绘。

---

## 3. 路由引擎

**无路由库。** 多页静态导航：

| 项 | 实现 |
|---|---|
| 路由表 | `COURSE_DATA.chapters[].file` |
| 当前页 | `<body data-page="chN">` |
| 跳转 | 原生 `<a href>`（完整页面加载） |
| 懒加载 | 无 |
| 预加载 | 无 |

**约定**：`data-page` 的值去掉 `.html` 后必须与文件名一致。

---

## 4. 状态管理

**无状态库。** 两层：

| 层 | 内容 |
|---|---|
| 内存 | `site.js` IIFE 内的闭包变量（`COURSE` / `BUILT` / `pageKey` …） |
| 持久 | `localStorage`，6 个键（见 [`DATA-SCHEMA.md`](DATA-SCHEMA.md) §2） |

**跨标签页同步**：监听 `storage` 事件 → `refreshProgressUI()`。

**约定**：键名带 `.v1` 后缀，升版本时应新增 `.v2` 而非改 `.v1` 的语义。

---

## 5. 构建工具

**没有构建步骤**（这是设计目标，不是缺失）。

| 项 | 说明 |
|---|---|
| 打包器 | 无（无 webpack / Vite / Rollup） |
| 环境变量 | 无 |
| "编译" | 仅 `tools/gen-course-data.py`（JSON → JS 全局常量，因 `file://` 下不能 `fetch`） |
| 页面外壳 | `tools/build-shell.py` 写入顶栏/底栏/脚本标签 |

**为什么不用构建**：双击 `index.html` 即可用；引入构建会破坏"零依赖"这一核心目标。

---

## 6. 打包工具：electron-builder（桌面版）

### 6.1 概况

| 项 | 值 |
|---|---|
| 工具 | **electron-builder 25.1.8** |
| 运行时 | **Electron 33.4.11** |
| 配置入口 | `desktop/package.json` 的 `build` 段 |
| 唯一推荐入口 | **`bash desktop/tools/build-all.sh <版本号>`** |
| 输出目录 | `_inbox/高等数学学习站_v0.7.2/高等数学学习站_桌面安装包/`（`macOS/` + `Windows/`） |
| 目标 | macOS: dmg(arm64+universal) / zip；Windows: nsis + portable（x64） |

### 6.2 防篡改链路（顺序不可乱）

```
① electron-builder 出 unpacked
② seal.js 把 manifest.json + manifest.sig 写进 app.asar 内部
③ 把 asar 头哈希写回宿主（mac: Info.plist / win: PE 的 INTEGRITY 资源）
④ mac 重签外层封装；win 用 --prepackaged 再打成 exe
```

| 铁律 | 违反后果 |
|---|---|
| Windows 必须"**先 unpacked → 封签 → 再打 exe**" | exe 里是未封签 asar → 启动报「文件已被修改」 |
| 封签必须在**所有构建之后** | 再跑一次构建会覆盖封签 |
| 改完可执行文件必须**重签 .app 外层封装** | 签封失效，进程无输出即退出 |
| 私钥放仓库外 `../.keys/` | 泄漏签名能力 |

### 6.3 格式要求

| 项 | 要求 |
|---|---|
| macOS DMG | **必须 `-fs HFS+`**（本机 `hdiutil` 用 APFS 会失败） |
| Windows 图标 | `build/icon.ico`，**必须是真 ICO 且含 16/24/32/48/64/128/256 七档** |
| 压缩 | `compression: maximum` |
| `extraResources.filter` | 必须排除 `.git/**`、`.backup/**`、`node_modules/**`、`desktop/**`、`tools/**`、`tests/**` |
| 安全隔离 | `contextIsolation:true` / `nodeIntegration:false` / `sandbox:true`（禁止改） |

### 6.4 校验和与验证

- 分发包各带 `.sha256`：`tools/release-checksums.sh`
- 用户验证：macOS `shasum -a 256 <文件>`；Windows `certutil -hashfile <文件> SHA256`
- 应用内自校验：`desktop/integrity.js`（验签 → 重算关键文件哈希 → 校验 appId/productName/版本）

**未做**：代码签名（无证书）、公证。脚本已备在 `desktop/tools/`。

---

## 7. 样式方案

| 项 | 说明 |
|---|---|
| 方案 | **原生 CSS + CSS 变量**（无 Tailwind / SCSS / CSS-in-JS） |
| 变量文件 | `assets/css/theme-tokens.css`（`--bg` `--ink` `--brand` `--line` …） |
| 主样式 | `assets/css/style.css`（约 1700 行，分节注释） |
| 命名 | BEM 风格的短横线类名：`.example-head` / `.sec-check` / `.fig-cols` |
| 主题 | 明/暗 + 4 套配色，由 `theme.js` 写 `data-theme` / `data-lang` 到 `<html>` |
| 语言 | `[data-lang="zh"] .en-inline { display: none }` |

**禁止改动**：`.sec { content-visibility: auto }`（去掉会让长页面卡顿）

---

## 8. 数据格式

| 格式 | 用途 | 要求 |
|---|---|---|
| **JSON** | `assets/course-data.json` | 唯一数据源；UTF-8；改后必须重新生成 `.js` |
| **HTML** | 章节页 | 手写正文 + 占位容器；不要手写导航 |
| **LaTeX** | 公式 | 行内 `$…$`，块级 `$$…$$`；容器类名必须在 `SEL` 里 |
| **i18n** | 中英对照 | `.bi` 内先 zh 后 en，段数相等；行内英文用 `.en-inline` |
| **Markdown** | 根目录规范文档 | 保留原位，不要移到 `docs/`（会破坏既有引用约定） |

---

## 9. 日志格式

| 项 | 值 |
|---|---|
| 文件 | 桌面版：`<应用目录>/logs/integrity.log` |
| 时间格式 | ISO 8601（`new Date().toISOString()`） |
| 行格式 | `<时间>  OK\|FAIL  <说明>  (耗时 Nms)` |
| 保留 | **最近 10 条**（超出自动截断） |
| 内容 | 不记录密钥、不记录用户数据 |

**禁止删除任何日志文件。**

---

## 10. 备份格式

| 类型 | 位置 | 命名 | 说明 |
|---|---|---|---|
| 编辑前快照 | `tools/_backup/` | `<文件名>.<YYYYMMDD-HHMMSS>.bak` | `safe_write()` 自动生成，**禁止删除** |
| 里程碑备份 | `backups/` | `备份_<说明>_<YYYYMMDD-HHMMSS>/` | 完整站点副本（排除 node_modules） |
| 桌面安装包暂存 | `backups/桌面安装包-<版本>/` | — | 旧版安装包 |
| 图标清理备份 | `backups/icon-cleanup-<时间>/` | 含 `README-备份说明.txt` | 中间产物压成 zip |

**压缩格式**：`ditto -c -k --sequesterRsrc --keepParent`（保留 macOS 扩展属性）。
**保留策略**：不自动清理；磁盘充足时一律保留。
