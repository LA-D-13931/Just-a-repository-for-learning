# 架构总览

> 本文档描述**当前真实实现**。凡是项目里没有的东西（Vite、Vue、Pinia、TypeScript、
> 后端服务、数据库）本文档一律不写——本项目是**零构建的纯静态站点**。
>
> 版本基准：v0.8.2 ｜ 更新日期：2026-09-19

---

## 一、项目定位

面向大一新生的**中英双语高等数学学习站**，覆盖同济《高等数学》第八版骨架
（12 章 80 节）与托马斯 14 版独有内容（2 节），共 **82 节 / 136 学时**。

设计目标（按优先级）：

1. **零构建、零依赖**：双击 `index.html` 就能用，不需要 node、不需要服务器。
2. **完全离线**：公式引擎已本地化，断网时页面、公式、图表、测验全部正常。
3. **中英整段对照**：每个内容块中文在前、英文在后，可一键切纯中文。
4. **可打包成桌面应用**：同一份站点源码，外加 Electron 壳分发。

---

## 二、技术栈总览

| 层 | 用什么 | 说明 |
|---|---|---|
| 页面 | **纯 HTML**（每章一个文件） | 无模板引擎、无组件框架 |
| 样式 | **原生 CSS + CSS 变量** | 无 Tailwind / SCSS |
| 脚本 | **原生 ES5 风格 JS**（IIFE 模块） | 无打包器、无 npm 运行时依赖 |
| 公式 | **MathJax 3.2.2**（本地 `assets/js/vendor/tex-svg.js`） | SVG 输出 |
| 图表 | **自研 SVG 绘图引擎**（`assets/js/plot.js`） | 非 ECharts / D3 |
| 数据 | **单一 JSON 源** + 编译为全局常量 | `assets/course-data.json` → `assets/js/course-data.js` |
| 状态 | **localStorage + 内存全局变量** | 无 Vuex / Pinia / Redux |
| 测试 | **happy-dom 单测 + puppeteer-core + Edge 无头** | 见 `tests/` |
| 打包 | **electron-builder 25** | 见 `desktop/` |

> **没有**：构建步骤、模块打包、路由库、状态管理库、ORM、服务端。

---

## 三、目录结构

```
高等数学学习站/
├── index.html              首页（课程地图，13 章入口）
├── exam.html               综合自测卷（考研数一难度）
├── cheatsheet.html         公式速查表
├── chapters/               13 个章节页（ch1–ch12 + supp1），每页 4 万–6 万像素高
├── assets/
│   ├── course-data.json    ★ 唯一数据源（人改这个）
│   ├── course-data.js      自动生成，勿手改（`tools/gen-course-data.py`）
│   ├── css/
│   │   ├── theme-tokens.css  主题变量（明/暗 + 4 套配色）
│   │   └── style.css         全部样式（约 1700 行）
│   └── js/
│       ├── site.js         ★ 页面外壳：顶栏/侧栏/目录/进度/打勾/双语切换
│       ├── plot.js         ★ 图表引擎：SVG 绘制 + 防重叠 + 图例自动摆放
│       ├── quiz.js         ★ 测验引擎：判分/讲评/进度回写
│       ├── theme.js        主题与配色切换
│       ├── videos.js       B 站视频映射（外链）
│       └── vendor/tex-svg.js  MathJax 3.2.2（本地副本，勿改）
├── desktop/                Electron 壳（可选，用于出安装包）
├── tools/                  开发工具：校验脚本 + 生成脚本 + 安全写入
├── tests/                  自动化测试（19 项校验中的大部分）
└── docs/                   ★ 本目录：架构与检查目录
```

**没有 `src/`、`components/`、`pages/`、`router/`、`store/`** —— 这些概念在本项目中
由「章节 HTML 文件」+「assets/js 下的 4 个引擎」+「course-data.json」对应实现。

---

## 四、数据流

```
① 人写 → assets/course-data.json           （唯一数据源：章节、学时、顺序、导航、外链）
              │
              │ tools/gen-course-data.py   （编译：JSON → 全局常量，因 file:// 下不能 fetch）
              ▼
②       assets/js/course-data.js            （window.COURSE_DATA）
              │
              │ site.js 读 COURSE_DATA
              ▼
③   顶栏导航 / 侧栏目录 / 底部章节导航 / 学时徽章 / 进度统计
              │
④   章节页 HTML 里的正文（人写）+ 占位容器（<div id="fig-xxx">、<div class="q">）
              │
              ├── plot.js   读页面里的 Plot.render 调用 → 画 SVG
              ├── quiz.js   读 .q 结构 → 判分、讲评、回写进度
              └── videos.js 读 data-video-map → 注入视频按钮（外链）

⑤ 用户操作 → localStorage（进度/成绩/主题/语言/侧栏宽度）
              │
              └── storage 事件 → 跨标签页同步
```

**关键点**：`course-data.json` 是**唯一的导航与章节元信息来源**。
页面里**禁止手写导航**——顶栏、侧栏、底部导航、学时徽章全部由它生成。

---

## 五、组件层级（实际 DOM 结构）

本项目没有组件框架，但有稳定的**运行时生成结构**：

```
<body data-page="ch4" data-chapter="4">
├── <header class="site-header">         ← tools/build-shell.py 注入的公共外壳
│   ├── .brand                    站点标识
│   ├── .header-nav               首页 / 速查表 / 自测卷（COURSE_DATA 生成）
│   ├── .header-ext               Desmos 外链
│   ├── [data-theme-controls]     theme.js 注入：语言开关 + 配色选择
│   └── .global-progress          全局进度条
│
├── <div class="layout">
│   ├── <aside class="sidebar">         site.js 注入
│   │   ├── .toc                  本页目录（由 h2[id] / h3 生成）
│   │   └── 章节列表（COURSE_DATA）
│   └── <main class="content">
│       └── <div class="sec">          ← 每节一个（wrap-sections.py 切开）
│           ├── <h2 id="s4-1" data-hours="2.5">   + .sec-check（已掌握）+ .hours-badge
│           ├── .box.exam-box / 定义 / 定理 …      正文块
│           ├── .example            .example-head + .example-body
│           ├── <figure class="plot-figure">  图表
│           └── .quiz              自测题
│
└── <nav class="chapter-nav">           上一章 / 下一章（build-shell.py 注入）
```

**外壳三件套**（`site-header` / `chapter-nav` / 若干 `<script>`）由
`tools/build-shell.py` 写入每个页面，改外壳必须**批量重跑该脚本**，不要手改单页。

---

## 六、关键约束（改任何东西都要守住）

| # | 约束 | 检查方式 |
|---|---|---|
| 1 | **单一数据源**：导航/章节元信息只来自 `course-data.json` | `python3 tools/check-shell.py` |
| 2 | **外壳唯一**：`site-header` 每页仅一份，章节页必须有 `chapter-nav` | `python3 tools/check-shell.py` |
| 3 | **中文模式零英文残留**：`.zh` 块里不得出现裸英文（专有名词除外） | `python3 tests/check-bilingual.py` |
| 4 | **公式体题干末尾不加句号** | `python3 tools/check-style.py` |
| 5 | **选项末尾不带标点** | `python3 tools/check-style.py` |
| 6 | **无符号体**：不得出现 `$\varepsilon$-$N$` 这类"半源码"裸露 | `python3 tools/check-latex.py` + 浏览器实测 |
| 7 | **无异常横向滚动条**（320 / 768 / 1280 三档） | `node tests/check-layout.js` |
| 8 | **`.bi` 容器中英段数必须相等** | `python3 tests/check-bilingual.py` |
| 9 | **图表内容不得被裁剪**，四周留白 ≥20px | `python3 tools/check-chart-visual.py` |
| 10 | **`course-data.js` 不许手改** | 它是生成物；改 json 后跑 `gen-course-data.py` |

---

## 七、常见故障 → 修复入口

| 现象 | 最可能的原因 | 先看哪里 |
|---|---|---|
| 按钮/进度/侧栏统计不显示 | 页面漏引 `course-data.js`，`window.COURSE_DATA` 为 undefined | 该页面的 `<script>` 列表（必须在 `site.js` **之前**） |
| 「已掌握」按钮缺失 | 同上；或该 `h2` 的 id 不在 `COURSE_DATA.chapters[].sections` 里 | `site.js: setupSectionChecks()` |
| 公式显示成 `$\varepsilon$` 源码 | 该元素不在排版选择器 `SEL` 里 | `页面内联排版脚本的 SEL`，见 `ENGINES.md` §1.4 |
| 图表被右侧裁掉 | 元素坐标超出 `x` 范围 | 该图的 `Plot.render` 的 `x` / `panels[].xr` |
| 图表文字互相压住 | 自动避让未生效或标注过密 | `plot.js: resolveTextOverlaps()` |
| 并列小图与讲解对不上 | 多面板图的 `figcaption` 没分栏 | 用 `.has-cols` / `.fig-cols` / `.fc`，见 `MODULES.md` |
| 页面切换卡顿 | MathJax 全量同步排版 | 分片调度脚本（`ENGINES.md` §1.3） |
| 出现横向滚动条 | 公式 SVG 宽度溢出 | `ENGINES.md` §1.5 |
| 中文模式下混进英文 | `.zh` 块里写了裸英文 | `tests/check-bilingual.py` |
| 桌面版启动报「文件已被修改」 | asar 封签与内容不符（改了源码没重封） | `ENGINES.md` §6 |

---

## 八、快速检查入口

| 你要做的事 | 读哪份 |
|---|---|
| 改数据（章节/学时/顺序/外链） | [`DATA-SCHEMA.md`](DATA-SCHEMA.md) |
| 改组件（顶栏/侧栏/测验/图表行为） | [`MODULES.md`](MODULES.md) |
| 改公式渲染 / 图表规格 / 打包 | [`ENGINES.md`](ENGINES.md) |
| 动手前 / 提交前自检 | [`CHECKLIST.md`](CHECKLIST.md) |
| 新增页面或新功能 | `ARCHITECTURE.md`（本文）+ `MODULES.md` + `CHECKLIST.md` |
| 看历史变更 | [`CHANGELOG.md`](CHANGELOG.md) |
