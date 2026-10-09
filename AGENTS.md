# AGENTS.md — 给 AI coding agent 的进场说明

## 这是什么

一个**无构建步骤的纯静态双语（中文/英文）高等数学学习站**：一个 HTML 文件就是一章，
双击 `index.html` 即可打开。用 `file://` 协议运行，没有打包、没有 SPA 路由、没有服务端。

- 25 个页面：高数 13 章（ch1 到 ch12，加 supp1）、线代 6 章（la1 到 la6）、
  `index.html`、`linear-algebra.html`、`cheatsheet.html`、`exam.html`、
  `linear-algebra-cheatsheet.html`、`linear-algebra-exam.html`
- 共享运行时 `assets/js/`：`assets/js/site.js`（页壳 / 目录 / 科目切换 / 侧栏拖拽）、`assets/js/quiz.js`、`assets/js/plot.js`（自建 SVG 图表引擎）、
  `assets/js/videos.js`、`assets/js/theme.js`、`assets/js/anchor-fix.js`、`assets/js/course-data.js`（**生成物，勿手改**）
- 样式 `assets/css/style.css` + `assets/css/theme-tokens.css`；数据源 `assets/course-data.json`
- 桌面版打包工程 `desktop/`（Electron + 封签脚本，2026-10-09 起已入库，仅 `node_modules` 除外）：
  主进程 `desktop/main.js`、预加载 `desktop/preload.js`、运行时完整性校验 `desktop/integrity.js`，
  出包工具链在 `desktop/tools/`（`build-all.sh` 一键出包 · `seal.js` 封签 · `sync-site.sh` 同步进已装 app）。
  **它不属于站点内容**：改站点不必动它，但改完站点后要让桌面版跟上（见下）。

## 改完必须跑什么

**只需要 python3 与 node，无需安装依赖**（`tests/node_modules` 本地已存在；CI 里由 `npm ci` 准备）：

```bash
python3 tests/check-html.py        # 25 页链接与结构
python3 tests/check-bilingual.py   # 中英对照完整性（中文模式零英文残留）
python3 tests/check-structure.py   # 章节骨架
python3 tests/check-answer-key.py  # 答案键与解析一致（解析说 X 对，data-correct 就得在 X 上）
node tests/site.test.js            # 页壳 / 目录 / 科目切换
node tests/quiz.test.js            # 自测判分
node tests/plot.test.js            # 图表引擎
node tests/theme.test.js           # 明暗与语言
node tests/videos.test.js          # 视频映射
node tests/review.test.js          # 复习卷
```

这 9 项是**仓库内自带**的全部自动化检查，CI（`.github/workflows/ci.yml`）跑的就是它们。

> ⚠️ **`tests/` 在 `.gitignore` 里，但其中 14 个文件已被跟踪**（2026-10-09 清理掉 7 个未引用的探针后）。
> 在 `tests/` 下**新建任何被 CI 或 `npm run verify` 引用的文件，必须用 `git add -f`**，
> 否则它不会进仓库、CI 会以 `Cannot find module` 失败（`typeset.test.js` 就这样漏过一次）。
> 排查方法：把 CI 引用的路径与 `git ls-files` 对一遍。

> 本地另有 `tools/` 目录（11 个更细的校验器，含用 sympy 复算讲解数值等式的
> `tools/check-math-verify.py`）。它被 `.gitignore` 排除在公开仓库之外，**CI 中不可用**。
> 若你本地有这个目录，建议在提交前一并运行：
> ```bash
> python3 tools/check-latex.py && python3 tools/check-math-lint.py && python3 tools/check-math-verify.py
> ```

## 关键约定（改动前必读）

1. **中文优先**。`.en` / `.en-inline` 是英文对照；纯中文模式（`[data-lang="zh"]`）下英文必须隐藏，
   `tests/check-bilingual.py` 会守住这条。
2. **公式体题干末尾不加句号**；题干里出现"则/求/设"后不要直接跟句号。
3. **不要在 HTML 里写 Markdown 加粗 `**`** —— `tests/check-html.py` 会判为残留。
4. **`assets/js/course-data.js` 是 `assets/course-data.json` 的生成物**。改数据请改 json，再跑生成器；
   直接改 js 会在下次生成时被覆盖。
5. **公式排版是分片进行的**，不是 `MathJax.typeset()` 一把梭。调度器在 `assets/js/typeset.js`（唯一实现）：
   首屏同步排 60 块 → `IntersectionObserver`（预取 400px）观察其余 → 每批 25 块用 `requestIdleCallback` 排，
   批次之间必须真正 yield 给主线程。队列排空后按参数做有界重扫（最多 3 轮）。
   每批排完回调 `window.__anchorSettle()`，由 `assets/js/anchor-fix.js` 校正锚点。
   页面只需在 `<head>` 声明参数：`window.__TYPESET = { sel: '…', sweep: 'bounded' }`。
6. **不要给 `.sec` 加 `content-visibility: auto`**（试过，破坏锚点跳转，实测跳转 8 秒不收敛）；
   **不要给 `html` 加 `scroll-behavior: smooth`**（章节页高达 15 万 px，缓动跳转会卡死）。
7. **调度逻辑只有一份**（`assets/js/typeset.js`，第 48 节从 25 份内联副本抽取）。页面差异只体现在
   `window.__TYPESET.sel`（参与排版的元素选择器）上；`sweep` 目前全部为 `'bounded'`。
   改调度逻辑只改这一个文件。`assets/js/anchor-fix.js` 通过 `window.__TYPESET_SEL` 读同一个选择器
   （它已不再需要从内联脚本文本里正则抓取）。

## 常见坑（都是真踩过的）

| 现象 | 原因 |
|---|---|
| 公式源码裸露成 `$\sqrt{x}$` | 该元素不在 `SEL` 里，或扫描策略太弱（`tests/typeset.test.js` 会逐页守住这条） |
| `IndexSizeError: splitText` | 父子元素都在 `SEL` 里被重复排版；入口列表要过滤掉有匹配祖先的元素 |
| 滚动时被反复拽回锚点 | `__anchorSettle` 无条件 `scrollIntoView`；用户一动滚轮就该让位 |
| 侧栏拖拽中途被抢 | 起点用 `mousedown` 却监听 `pointercancel` 且未 `setPointerCapture` |
| 侧栏高亮闪动/重叠 | 活动项与其所属小节同时画了背景胶囊 |
| 高亮与小节对不上 | `scrollSpy` 的判据线写死 120px，没跟站点头部高度走 |
| **解析算对了却判你错** | 多选题漏标一个 `data-correct`，或单选题标记标错位（`tests/check-answer-key.py` 会守住） |

## 不要改的东西

- `chapters/**` 的**题目、公式、文案、数据**（这是内容，不是代码）
- `assets/js/vendor/tex-svg.js`（MathJax 3.2.2 本地副本）
- 已通过的校验器与测试所在目录结构
