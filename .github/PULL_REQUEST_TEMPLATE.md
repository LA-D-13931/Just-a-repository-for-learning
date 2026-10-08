## 改了什么

<!-- 一句话说明；若改的是内容（题目/公式/文案），请指出章节与位置 -->

## 自查（提交前请逐项确认）

- [ ] `npm run verify` 通过（页面结构 + 中英对照 + 章节骨架 + 6 个交互套件）
- [ ] 若本地有 `tools/`：额外跑了 `tools/check-latex.py`、`tools/check-math-lint.py`、
      `tools/check-math-verify.py`
- [ ] **没有**改动题目、公式、文案、数据（除非本次任务就是改它们）
- [ ] **没有**在 HTML 里写 Markdown 加粗 `**`
- [ ] **没有**给 `.sec` 加 `content-visibility`，也没有给 `html` 加 `scroll-behavior: smooth`
- [ ] 若改动了页面 `<head>` 里的分片排版调度器：已同步 25 个页面，并检查
      `assets/js/anchor-fix.js` 的 `pageSel()`（它从内联脚本文本里抓 `SEL`）
- [ ] 公式在中文模式下无英文残留、无源码裸露（`$\sqrt{x}$` 这种）

## 截图 / 说明

<!-- 版面或交互改动请附前后对比 -->
