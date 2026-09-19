# 文档索引 · 快速检查入口

> 改代码前**先看这里**，按你要动的东西选对应文档。

---

## 一句话入口

| 你要做的事 | 读哪份 | 先跑什么 |
|---|---|---|
| **改数据**（章节 / 学时 / 顺序 / 外链） | [`DATA-SCHEMA.md`](DATA-SCHEMA.md) §1 | `python3 tools/gen-course-data.py` |
| **改组件**（顶栏 / 侧栏 / 测验 / 图表行为） | [`MODULES.md`](MODULES.md) §2 | `node tests/site.test.js` |
| **改公式渲染** | [`ENGINES.md`](ENGINES.md) §1 | `python3 tools/check-latex.py` |
| **改图表** | [`ENGINES.md`](ENGINES.md) §2 | `python3 tools/check-chart-visual.py` |
| **改双语 / 文案** | [`DATA-SCHEMA.md`](DATA-SCHEMA.md) §3 | `python3 tests/check-bilingual.py` |
| **改样式 / 布局** | [`ENGINES.md`](ENGINES.md) §7 | `node tests/check-layout.js` |
| **改测验题目** | [`DATA-SCHEMA.md`](DATA-SCHEMA.md) §5 | `node tests/quiz.test.js` |
| **改视频映射** | [`DATA-SCHEMA.md`](DATA-SCHEMA.md) §4 | `node tests/videos.test.js` |
| **改桌面版 / 出安装包** | [`ENGINES.md`](ENGINES.md) §6 | `bash desktop/tools/build-all.sh <版本>` |
| **新增页面** | [`ARCHITECTURE.md`](ARCHITECTURE.md) §3 + [`MODULES.md`](MODULES.md) §3 | `python3 tools/check-shell.py` |
| **新增功能** | [`MODULES.md`](MODULES.md) + [`CHECKLIST.md`](CHECKLIST.md) | 全量校验 |
| **提交前** | [`CHECKLIST.md`](CHECKLIST.md) §〇 与 §四 | 全量校验 |
| **遇到故障不知道从哪查** | [`ARCHITECTURE.md`](ARCHITECTURE.md) §七 故障对照表 | — |
| **看历史踩过哪些坑** | [`CHANGELOG.md`](CHANGELOG.md) | — |

---

## 六份文档各管什么

| 文档 | 回答的问题 |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 项目是什么？目录怎么组织？数据从哪流到哪？改坏了会出现什么现象、从哪查？ |
| [`MODULES.md`](MODULES.md) | 每个模块干什么、依赖谁、**禁止改什么**、常见 Bug 从哪进？ |
| [`ENGINES.md`](ENGINES.md) | 公式 / 图表 / 打包引擎的**版本、入口、格式硬要求**是什么？ |
| [`DATA-SCHEMA.md`](DATA-SCHEMA.md) | `COURSE_DATA`、`UI_STATE`、`i18n`、题目、图表、封签清单的**字段定义** |
| [`CHECKLIST.md`](CHECKLIST.md) | 动手前 / 改动中 / 改完 / 提交前，**逐项打勾**的清单 |
| [`CHANGELOG.md`](CHANGELOG.md) | 面向模块的历史修复索引（完整日志在根目录 `CHANGELOG.md`） |

---

## 30 秒上手（新人）

```bash
# 1. 打开站点（无需任何安装）
open index.html          # macOS；或直接双击

# 2. 跑一遍全量校验，确认基线是绿的
python3 tools/check-shell.py && python3 tests/check-bilingual.py

# 3. 看当前版本
head -1 当前版本.txt

# 4. 动手前读 CHECKLIST.md §一
```

**四条最容易踩的坑**（务必记住）：

1. **`assets/js/course-data.js` 是生成物**——改 `course-data.json` 后必须重跑 `gen-course-data.py`
2. **能写公式的容器，类名必须加进 16 个页面的排版选择器 `SEL`**——否则公式显示成源码
3. **章节页漏引 `course-data.js`** → 该页按钮、进度、侧栏统计全部失效（单测发现不了，因为单测手动注入了它）
4. **改了 `desktop/` 源码必须重新封签**——否则安装包启动报「文件已被修改」
