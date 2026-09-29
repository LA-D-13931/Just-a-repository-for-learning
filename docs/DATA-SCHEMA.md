# 数据结构定义

> 所有字段名均为**实测的真实字段**。改任何数据结构前先读本文档，改完跑对应校验。
>
> 版本基准：v0.8.2 ｜ 更新日期：2026-09-19

---

## 1. COURSE_DATA

**源文件** `assets/course-data.json` → **生成** `assets/js/course-data.js`（`window.COURSE_DATA`）

> `file://` 协议下 `fetch()` 不可用，所以 JSON 被编译成全局常量。
> **改 json 后必须重跑** `python3 tools/gen-course-data.py`，否则两者不一致。

### 1.1 顶层

| 字段 | 类型 | 含义 |
|---|---|---|
| `_comment` | string | 维护提示（"禁止在页面里手写导航"） |
| `meta` | object | 站点级元信息 |
| `external` | array | 顶栏外链（目前仅 Desmos） |
| `chapters` | array[13] | **章节数组，数组顺序即导航顺序** |
| `tools` | array[2] | 速查表、自测卷 |
| `sections` | object | 注释占位（节显示名由页面 `h2` 读取） |

### 1.2 `meta`

```json
{
  "site":        { "zh": "高等数学学习站", "en": "Advanced Mathematics" },
  "tagline":     { "zh": "同济八版骨架 · 托马斯映射 · 中英对照", "en": "..." },
  "defaultLang": "zh",
  "totalHours":  136.0,
  "reviewHours": 2
}
```

### 1.3 `chapters[]`（每章）

| 字段 | 类型 | 含义 | 改动须知 |
|---|---|---|---|
| `id` | string | `ch1`…`ch12` / `supp1` | 与 `data-page` 对应 |
| `num` | number | 章号（`supp1` 用 101 表示补充章） | 仅显示用 |
| `file` | string | `chapters/chN.html` | `currentChapter()` 靠它匹配，**路径格式不可改** |
| `status` | string | `built` | 未建章节可省 |
| `hours` | number | 总学时 | 与 `sectionHours` 求和一致 |
| `title` | `{zh,en}` | 章标题 | |
| `sections` | string[] | 节 id 列表（`s1-1` …） | ★ **决定 `.sec-check` 是否注入** |
| `sectionHours` | number[] | 各节学时 | 长度须与 `sections` 相同 |
| `card` | `{desc, topics[]}` | 首页卡片文案 | |
| `thomas` | string | 托马斯对应节次（如 `1–2`） | |

**★ 最重要的约束**：`sections[]` 里的 id 必须与该页 `<h2 id="...">` **逐一对应**。
不在 `sections` 里的 `h2`（例如章末测验的 `id="final"`）**不会**注入「已掌握」按钮——
这是设计如此。反之，若某个 `h2` 本该有按钮却没有，先查这里。

### 1.4 `tools[]`

```json
[{ "id":"cheatsheet", "file":"cheatsheet.html", "status":"built",
   "title": { "zh":"公式速查表", "en":"Formula Sheet" } }, …]
```

### 1.5 `external[]`

```json
[{ "id":"desmos", "url":"https://www.desmos.com/calculator",
   "label": { "zh":"Desmos", "en":"Desmos" },
   "aria":  { "zh":"在新标签页打开 Desmos 计算器", "en":"..." } }]
```

---

## 2. UI_STATE（localStorage）

| 键 | 类型 | 默认 | 含义 |
|---|---|---|---|
| `advmath.lang.v1` | `'zh'` \| `'en'` | `meta.defaultLang` | 语言 |
| `advmath.theme.v1` | string | 主题默认 | 主题/配色 |
| `advmath.progress.v1` | `{ [pageKey#sectionId]: true }` | `{}` | 每节「已掌握」勾选 |
| `advmath.quiz.v1` | `{ [quizKey]: score }` | `{}` | 测验成绩 |
| `advmath.sidebar.w.v1` | number | 侧栏默认宽 | 侧栏宽度（px） |
| `advmath.sidebar.hidden.v1` | `'1'` \| 缺省 | 缺省 | 侧栏是否折叠 |

**`progress` 的键格式**：`<pageKey>#<sectionId>`，例如 `ch1#s1-1`。
`pageKey` = `<body data-page>` 的值。

**禁止**：改键名或去掉 `.v1` 后缀（会让所有用户丢失进度）。

> 注：项目里**没有** `currentChapterId` / `currentPageId` / `activeModal` 这类运行时字段——
> 当前章由 `data-page` 属性推导，弹窗状态是局部变量。本文档不虚构这些字段。

---

## 3. i18n 结构

**不是字典**，而是**双语并存 + CSS 控制显示**：

| 元素 | 用途 |
|---|---|
| `<p class="zh" lang="zh">` | 中文段 |
| `<p class="en" lang="en">` | 英文段 |
| `<span class="en-inline"> / English</span>` | 行内英文（标题、术语） |
| `<div class="bi">` | 双语容器：**先全部 `.zh`，再全部 `.en`** |
| `<html data-lang="zh\|en">` | 由 `theme.js` 写入；CSS 据此显示/隐藏 |

**硬约束**
1. `.bi` 容器内 zh 段数 **必须等于** en 段数
2. 两侧的**独立公式**必须逐字一致
3. 纯中文块内**不得出现裸英文**（术语表允许的除外）

**验证**：`python3 tests/check-bilingual.py`

---

## 4. videos.js 结构

**位置** `assets/js/videos.js`（45,275 字节）。按小节组织，每条记录：

| 字段 | 含义 |
|---|---|
| `sectionId` | 节 id（`s1-1`） |
| `status` | 记录状态 |
| `primary` | 主视频（`{ bvid, p, duration, title }`） |
| `backups` | 备用视频 |
| `source` | 来源（宋浩老师官方） |
| `note` | 备注 |
| `verified` | 是否已用 B 站 API 核对可达 |

**页面侧的挂钩**
```html
<h2 id="s1-1" data-video-map="s1-1" data-video-title="…">…</h2>
<div data-video-entry="s1-1" data-video-pos="top"></div>
```

**禁止改动**：`verified: true` 的记录（已逐条核对）
**故意留空**：`s3-8 s6-3 s7-7 s7-8 s8-5 s9-9 s9-10 s10-5 s12-6 s12-7 s12-8 tx1-1 tx1-2`

**验证**：`node tests/videos.test.js`

---

## 5. 题目模型（QuestionBlock）

**HTML 即数据**（无独立题库文件）：

```html
<div class="q" data-type="single" data-level="基础">
  <p class="q-stem">题干，可含 $公式$</p>
  <ul class="options">
    <li data-correct="true"><span class="opt-body">正确选项</span></li>
    <li><span class="opt-body">干扰项</span></li>
  </ul>
  <div class="q-explain">解析（可选）</div>
</div>
```

| 字段 | 取值 | 说明 |
|---|---|---|
| `data-type` | `single` / `multi` / `judge` / `fill` | 题型 |
| `data-level` | `基础` / `中等` / `考研` | 难度 |
| `data-correct` | `"true"` | 多选题给多个 `li` 加 |
| `data-point` | string | 知识点名（缺省时由所在 `h2` 推导） |
| `data-ref` | string | 复习链接目标（缺省时指向所在节） |
| `.q-answer[data-answer]` | string | **填空题**的答案 |

**格式约定**（`tools/check-style.py` 强制）
- **选项末尾不带标点**
- 题干里的填空用全角 `（　）`

**验证**：`node tests/quiz.test.js`、`python3 tools/audit-quiz.py`

---

## 6. 图表模型（ChartBlock）

`Plot.render(host, spec)`，`spec` 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `width` / `height` | number | 画布尺寸 |
| `maxWidth` | number | 最大展示宽 |
| `x` / `y` | `[min,max]` | 坐标范围 |
| `axes` | object | 轴与刻度配置 |
| `panels` | array | `{ x, y, w, h, title, xr, yr, padding }`（`x/y/w/h` 为 0–1 相对值） |
| `elements` | array | 绘制元素，见下 |
| `legend` / `legendPos` / `legendOutside` | — | 图例 |
| `padding` | `{l,r,t,b}` | **四边 ≥20px** |
| `verify` | boolean | 是否参与视觉自检 |
| `aria` / `role` | string | 无障碍 |

**`elements[]` 类型**：`fn` `poly` `param` `implicit` `point` `segment` `arrow` `vector`
`polygon` `rect` `region` `label` `bars` `field` `numberline` `seq`

**每条元素可带**：`type`、`panel`（面板索引）、`color`、`width`、`dash`、`role`、`anchor`、`opacity`、`stroke`

**验证**：`node tests/plot.test.js`、`python3 tools/check-chart-visual.py`

---

## 7. 许可证结构

**未实现。**

本项目不做激活、不绑定设备、不需要服务器；`desktop/` 里只有完整性校验（防篡改），
不涉及授权。若日后要加，建议字段：`key` / `machineId` / `issuedAt` / `expiresAt` / `edition`
——但**当前代码里不存在这些字段**，本文档不虚构。

---

## 8. 桌面版完整性清单（manifest.json）

由 `desktop/tools/seal-asars.js` 生成，**存放在 `app.asar` 内部**：

```json
{
  "schema": 2,
  "appId": "com.advmath.study",
  "productName": "高数学习站",
  "version": "0.8.1",
  "builtAt": "2026-09-19T…Z",
  "files": [
    { "path": "main.js",      "sha256": "…", "size": 15348 },
    { "path": "player.html",  "sha256": "…", "size": 2670 },
    { "path": "preload.js",   "sha256": "…", "size": 640 },
    { "path": "integrity.js", "sha256": "…", "size": 7079 },
    { "path": "package.json", "sha256": "…", "size": 281 }
  ]
}
```

配套 `manifest.sig`（Ed25519 签名，base64），公钥内置在 `desktop/integrity.js`。

**注意**：清单**不覆盖** `Contents/Resources/site/` 目录 —— 所以更新站点内容
（打补丁）不会触发完整性校验失败；只有改动上面 5 个文件才会。

---

## 9. 改动数据结构时的检查入口

| 你改了什么 | 必须跑 |
|---|---|
| `course-data.json` | `python3 tools/gen-course-data.py` → `tools/check-shell.py` → `node tests/site.test.js` |
| 新增/删除小节 | 同步 `sections[]` + `sectionHours[]` + 页面 `h2[id]` + `data-hours` |
| `localStorage` 键 | 不要改；要改则升 `.v2` |
| 题目结构 | `node tests/quiz.test.js` + `python3 tools/audit-quiz.py` |
| 图表 spec | `node tests/plot.test.js` + `python3 tools/check-chart-visual.py` |
| 双语结构 | `python3 tests/check-bilingual.py` |
| 视频映射 | `node tests/videos.test.js` |
| 封签清单 | `bash desktop/tools/build-all.sh <版本>`（会重新封签） |
