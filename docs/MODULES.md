# 模块说明

> 每个模块给：**职责 / 依赖 / 被依赖 / 关键文件 / 改动时必须检查 / 禁止改动 / 常见 Bug 入口**。
> 模块名对应的是**实际文件或运行时对象**，不是框架概念。
>
> 版本基准：v0.8.2 ｜ 更新日期：2026-09-19

---

## 一、数据层

### 1.1 COURSE_DATA（唯一数据源）

| 项 | 内容 |
|---|---|
| 职责 | 全站导航、章节顺序、学时、状态、外链的**唯一**来源 |
| 关键文件 | `assets/course-data.json`（人改）→ `assets/js/course-data.js`（生成） |
| 生成脚本 | `tools/gen-course-data.py` |
| 依赖 | 无 |
| 被依赖 | `site.js`（顶栏/侧栏/导航/徽章/进度）、`theme.js`、`index.html`、`exam.html`、`cheatsheet.html` |

**改动时必须检查**
- 改完 json 必须重跑 `python3 tools/gen-course-data.py`（否则 json 与 js 不一致）
- `python3 tools/check-shell.py`（外壳与数据一致性）
- `node tests/site.test.js`（外壳注入断言）

**禁止改动**
- `assets/js/course-data.js` —— 自动生成，手改会被下次生成覆盖
- `chapters[].file` 的路径格式（`chapters/chN.html`），`currentChapter()` 靠它匹配

**常见 Bug → 入口**
- 某页按钮全都不出现 → 该页漏引 `course-data.js` 脚本（见 `CHECKLIST.md` §1）
- 章节顺序错乱 → json 里 `chapters[]` 的数组顺序（不是 `num`）

详见 [`DATA-SCHEMA.md`](DATA-SCHEMA.md) §1。

---

### 1.2 UI_STATE（界面状态）

| 项 | 内容 |
|---|---|
| 职责 | 语言、主题、侧栏宽度/折叠等界面状态的持久化 |
| 关键文件 | `assets/js/site.js`（侧栏）、`assets/js/theme.js`（主题/语言） |
| 存储 | `localStorage`，键名见下表 |
| 依赖 | 无 |
| 被依赖 | `site.js`、`plot.js`（重绘时读主题色） |

| 键 | 用途 |
|---|---|
| `advmath.lang.v1` | 语言（zh / en） |
| `advmath.theme.v1` | 主题（明/暗 + 配色） |
| `advmath.progress.v1` | 每节「已掌握」勾选状态 |
| `advmath.quiz.v1` | 测验成绩 |
| `advmath.sidebar.w.v1` | 侧栏宽度 |
| `advmath.sidebar.hidden.v1` | 侧栏折叠 |

**改动时必须检查**：`node tests/site.test.js`、`node tests/theme.test.js`
**禁止改动**：键名后缀 `.v1`（改了用户进度会丢）
**常见 Bug → 入口**：刷新后进度丢失 → 检查 `getProgress()` / `writeJSON()` 的键名

详见 [`DATA-SCHEMA.md`](DATA-SCHEMA.md) §2。

---

### 1.3 i18n（中英对照）

| 项 | 内容 |
|---|---|
| 职责 | 中英整段对照 + 一键切纯中文 |
| 关键文件 | 各章节 HTML 的 `<p class="zh">` / `<p class="en">` / `<span class="en-inline">`；`assets/css/style.css` 的 `[data-lang]` 规则 |
| 机制 | **不是字典替换**，而是两段并存 + CSS 控制显示 |
| 依赖 | 无 |
| 被依赖 | `site.js`（语言开关）、`theme.js` |

**结构约定**
- `.bi` 容器内：**先全部 `.zh`，再全部 `.en`**，两侧段数**必须相等**
- 行内英文用 `<span class="en-inline"> / English</span>`
- 纯中文块（如「工程联系」）里**不得出现裸英文**

**改动时必须检查**：`python3 tests/check-bilingual.py`（段数、公式逐字一致、中文块英文残留）
**禁止改动**：`.en-inline` 的类名（`site.js` 克隆侧栏目录时依赖它）
**常见 Bug → 入口**：中文模式混进英文 → `check-bilingual.py` 的英文残留检查

详见 [`DATA-SCHEMA.md`](DATA-SCHEMA.md) §3。

---

### 1.4 videos.js（视频映射）

| 项 | 内容 |
|---|---|
| 职责 | 小节 → B 站视频（BV 号、分 P、时长）的映射；生成视频按钮 |
| 关键文件 | `assets/js/videos.js` |
| 依赖 | 页面 `<h2 data-video-map="sN-M" data-video-title="…">`、`<div data-video-entry="sN-M">` 占位 |
| 被依赖 | 各章节页 |

**改动时必须检查**：`node tests/videos.test.js`
**禁止改动**：**ch1–ch7 中标记 `verified: true` 的视频记录**（已逐条核对过）
**常见 Bug → 入口**：视频按钮不出现 → 该节没有 `data-video-entry` 占位，或 id 不匹配

> 13 个小节**故意留空**（暂无视频）：`s3-8 s6-3 s7-7 s7-8 s8-5 s9-9 s9-10 s10-5 s12-6 s12-7 s12-8 tx1-1 tx1-2`

详见 [`DATA-SCHEMA.md`](DATA-SCHEMA.md) §4。

---

## 二、组件层

> 本项目**没有组件框架**。下列"组件"是 `site.js` / `build-shell.py` 生成的稳定 DOM 结构。

### 2.1 SiteHeader / TopBar

| 项 | 内容 |
|---|---|
| 职责 | 站点标识、主导航、Desmos 外链、语言开关、配色选择、全局进度条 |
| 生成 | `tools/build-shell.py`（写入每页，标记 `<!-- SHELL:HEADER -->`） |
| 依赖 | `COURSE_DATA`、`theme.js` |
| 被依赖 | 全部页面 |

**改动时必须检查**：`python3 tools/check-shell.py`（每页仅一份）、`node tests/theme.test.js`
**禁止改动**：`SHELL:HEADER` 注释标记（重建脚本靠它定位）
**常见 Bug → 入口**：顶栏重复 → 重新跑 `build-shell.py`，不要手删

### 2.2 Sidebar（侧栏 + 目录）

| 项 | 内容 |
|---|---|
| 职责 | 本页目录（拖拽调宽、折叠）+ 全站章节列表 |
| 关键代码 | `site.js: buildTOC / setupSidebar / applySidebar` |
| 依赖 | `COURSE_DATA`、`UI_STATE` |
| 被依赖 | 无 |

**改动时必须检查**：`node tests/site.test.js`
**禁止改动**：`buildTOC()` 里删 `.hours-badge .sec-check` 的克隆逻辑——目录是**克隆** h2 生成的，
若顺序错了会把正文的按钮删掉
**常见 Bug → 入口**：目录里有"⏱ 2 h"字样 → 克隆时未剔除徽章

### 2.3 BottomNav（章节导航）

| 项 | 内容 |
|---|---|
| 职责 | 上一章 / 下一章 |
| 生成 | `tools/build-shell.py` |
| 依赖 | `COURSE_DATA` |

**改动时必须检查**：`python3 tools/check-shell.py`
**常见 Bug → 入口**：出现两个底部导航 → 页面被重复注入，重跑 `order-sections.py` + `build-shell.py`

### 2.4 Modal（弹出层：视频窗口 / 降级面板）

| 项 | 内容 |
|---|---|
| 职责 | 桌面版的视频窗口与加载失败降级面板 |
| 关键文件 | `desktop/player.html`（B 站跳转页）、`desktop/main.js`（窗口创建） |

**禁止改动**：安全三件套 `contextIsolation:true` / `nodeIntegration:false` / `sandbox:true`
**常见 Bug → 入口**：见 [`ENGINES.md`](ENGINES.md) §6

### 2.5 FormulaBlock（公式块）

| 项 | 内容 |
|---|---|
| 职责 | 行内 `$…$` 与块级 `$$…$$` 的渲染 |
| 引擎 | MathJax 3.2.2（本地） |
| 关键文件 | `assets/js/vendor/tex-svg.js`（引擎）、各页内联排版脚本（调度） |

**改动时必须检查**：`python3 tools/check-latex.py`、`python3 tools/check-math-lint.py`、`node tests/check-layout.js`
**禁止改动**：`assets/js/vendor/tex-svg.js`
**常见 Bug → 入口**：源码裸露 → [`ENGINES.md`](ENGINES.md) §1.4

### 2.6 QuestionBlock（题目块）

| 项 | 内容 |
|---|---|
| 职责 | 单选/多选/判断/填空的呈现、判分、讲评、进度回写 |
| 关键代码 | `assets/js/quiz.js` |
| 结构 | `<div class="q" data-type data-level>` + `.q-stem` + `ul.options > li > span.opt-body` + `.q-explain`；填空用 `.q-answer[data-answer]` |
| 被依赖 | `site.js`（进度统计） |

**改动时必须检查**：`node tests/quiz.test.js`、`python3 tools/audit-quiz.py`
**禁止改动**：`data-correct` / `data-answer` 的语义
**常见 Bug → 入口**：知识点名称带出徽章文字 → `quiz.js: pointOf()` 的文本清洗

### 2.7 DataTable（表格）

| 项 | 内容 |
|---|---|
| 职责 | 对照表、术语表等 |
| 约束 | ≤560px 时 `display:block; overflow-x:auto`（避免撑破布局） |

**改动时必须检查**：`node tests/check-layout.js`（320/768/1280 三档无横向滚动条）

### 2.8 ChartBlock（图表块）

| 项 | 内容 |
|---|---|
| 职责 | SVG 图表绘制、文字防重叠、图例自动摆放、窗口缩放重绘 |
| 关键代码 | `assets/js/plot.js` |
| 用法 | `Plot.render(host, spec)` |
| 依赖 | `COURSE_DATA`（无直接依赖）、主题色 |

**改动时必须检查**：`node tests/plot.test.js`、`python3 tools/check-chart-visual.py`
**禁止改动**：`Plot.render` 必须在 `host.appendChild(svg)` **之后**调用
（否则 `getBBox()` 返回 0×0）
**常见 Bug → 入口**：见 [`ENGINES.md`](ENGINES.md) §2.5

---

## 三、页面层

| 页面类型 | 文件 | 说明 | 改动后必查 |
|---|---|---|---|
| lesson（章节正文） | `chapters/chN.html` | 每页多节，`.sec` 包裹 | 全部校验 + 浏览器实测 |
| examples（例题） | 章节页内 `.example` | `.example-head` 可含公式 | 公式渲染（`ENGINES.md` §1.4） |
| exercises（自测） | 章节页内 `.quiz` | 章末综合测验 | `node tests/quiz.test.js` |
| selfTest（综合卷） | `exam.html` | 考研数一难度 | `node tests/quiz.test.js` |
| formulaSheet（速查表） | `cheatsheet.html` | 核心公式汇总 | `check-latex` / 布局 |
| 首页（课程地图） | `index.html` | 13 章入口卡片 | `check-shell` |

**所有页面共同的禁止项**：不允许手写导航、不允许改 `<script>` 顺序
（`course-data.js` 必须在 `site.js` **之前**）。

---

## 四、路由层

| 项 | 内容 |
|---|---|
| 实现 | **多页静态导航**，无路由库 |
| "路由表" | `COURSE_DATA.chapters[].file` |
| 当前页判定 | `<body data-page="ch4">` + `site.js: currentChapter()` |
| 上一/下一章 | `tools/build-shell.py` 按 `chapters[]` 顺序生成 |
| 懒加载 | 无（每次跳转都是完整页面加载） |

**禁止改动**：`data-page` 值与文件名必须对应（`data-page="ch4"` ↔ `chapters/ch4.html`）
**常见 Bug → 入口**：页面统计/按钮失效 → 检查 `data-page` 与 `currentChapter()` 的匹配

---

## 五、渲染层

| 模块 | 文件 | 职责 |
|---|---|---|
| 公式渲染 | 各页内联脚本 + `tex-svg.js` | 分片调度排版（首屏优先，其余按需） |
| 图表渲染 | `plot.js` | SVG 生成、坐标变换、防重叠、图例摆放、缩放重绘 |
| 长列表优化 | `style.css`（`.sec { content-visibility:auto }`） | 82 节页面，跳过视口外渲染 |

**禁止改动**：`.sec` 的 `content-visibility`（去掉会让 6 万像素高的页面卡顿）
**常见 Bug → 入口**：切换章节卡顿 → [`ENGINES.md`](ENGINES.md) §1.3

---

## 六、构建层

| 模块 | 文件 | 说明 |
|---|---|---|
| 页面外壳生成 | `tools/build-shell.py` | 注入顶栏/底部导航/脚本标签 |
| 数据编译 | `tools/gen-course-data.py` | JSON → 全局常量 |
| 分节包装 | `tools/wrap-sections.py` | 每节套 `.sec` |
| 分节拼装 | `tools/assemble-sections.py` / `order-sections.py` | 片段 → 章节页 |
| 安全写入 | `tools/safe_edit.py` | `safe_write()`：自动备份 + 长度自检 |
| 桌面打包 | `desktop/tools/build-all.sh` | **唯一推荐的出包入口** |
| 打包配置 | `desktop/package.json` 的 `build` 段 | electron-builder 配置 |

**约定**：所有编辑**必须**走 `tools/safe_edit.py:safe_write()`（自动备份到 `tools/_backup/`）。
**禁止改动**：`build-all.sh` 的步骤顺序（Windows 必须"先 unpacked → 封签 → 再打 exe"）
**常见 Bug → 入口**：安装包启动报「文件已被修改」→ [`ENGINES.md`](ENGINES.md) §6

---

## 七、存储层

| 项 | 内容 |
|---|---|
| 用户进度/成绩/偏好 | `localStorage`（键见 §1.2） |
| 桌面版日志 | `<应用目录>/logs/integrity.log`（保留最近 10 条） |
| 许可证 | **未实现**（本项目不激活、不绑设备、不需要服务器） |
| 备份 | `tools/_backup/`（编辑前快照）、`backups/`（里程碑备份） |

**禁止改动**：`localStorage` 键名（会丢用户进度）
**禁止删除**：`tools/_backup/`、`backups/`、任何 `*.log`

---

## 八、工具层

| 文件 | 职责 |
|---|---|
| `tools/safe_edit.py` | `safe_write(path, text, min_ratio=0.9)`：备份 + 长度自检 + 回读校验 |
| `tools/check-*.py`（9 个） | 结构/编号/公式/样例顺序/引用/文风/图表等静态校验 |
| `tests/check-*.js` / `*.py` | 布局、对比度、结构、双语 |
| `tests/*.test.js`（6 套） | happy-dom 单测：site / quiz / plot / theme / videos / review |

**约定**：`safe_write` 的 90% 长度自检会**拒绝有意的大段删除**——此时传 `min_ratio=None` 并注明理由。
**禁止改动**：`safe_edit.py` 的自检逻辑（它是防误删的最后一道闸）
