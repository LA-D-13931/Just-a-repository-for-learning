# 修改检查目录

> 目的：**避免"改了 A 模块坏了 B 模块"**。每项都可勾选，并注明对应模块与文件。
> 用法：动手前把本文档复制到 `待修清单_<主题>.md`，逐项打勾。
>
> 版本基准：v0.8.2 ｜ 更新日期：2026-09-19

---

## 〇、一键全量校验（提交前必跑）

```bash
cd "/Users/a18760/Desktop/高等数学资源站工作区/_inbox/高等数学学习站_v0.7.2/高等数学学习站"

# 静态校验 9 项
python3 tools/check-shell.py && python3 tools/check-numbering.py && \
python3 tools/check-latex.py && python3 tools/check-math-lint.py && \
python3 tools/check-example-order.py && python3 tools/check-refs.py && \
python3 tools/check-style.py && python3 tools/check-figure.py && \
python3 tools/check-chart-visual.py

# 结构与双语 3 项
python3 tests/check-structure.py && python3 tests/check-bilingual.py && python3 tests/check-html.py

# 浏览器相关 4 项
cd tests && node check-layout.js && node check-contrast.js && \
node site.test.js && node quiz.test.js && node plot.test.js && \
node theme.test.js && node videos.test.js && node review.test.js
```

**全部退出码为 0 才算通过。** 任一失败先修再提交。

---

## 一、修改前检查

### 1.1 锁定范围

- [ ] 明确**只改哪个模块**（对照 [`MODULES.md`](MODULES.md)），写在待修清单首行
- [ ] 列出**预期会碰到的文件**，不超过 3 个（超过说明范围不清晰）
- [ ] 确认**不碰**这些：`assets/js/vendor/tex-svg.js`、`assets/js/course-data.js`（生成物）、
      `desktop/node_modules/`、`tools/_backup/`、`backups/`、任何 `*.log`
- [ ] 确认**不删**：日志、开发记录、提示词、需求文档、Bug 记录、审核记录、桌面/程序坞入口

### 1.2 备份

- [ ] 编辑一律走 `tools/safe_edit.py:safe_write()`（自动备份到 `tools/_backup/`）
- [ ] 大范围改动前做里程碑备份：
      `rsync -a --exclude node_modules/ --exclude .git/ <站点>/ backups/update-$(date +%Y%m%d-%H%M%S)/`
- [ ] 记录备份路径到待修清单

### 1.3 Dry-run

- [ ] 先用只读命令确认现状（`grep` / `python3 -c` 统计 / 浏览器实测），**不要凭记忆改**
- [ ] 对"替换型"改动，先打印将影响的**处数**，与预期吻合再动手
- [ ] 涉及 HTML 结构的改动，先确认**该类元素全项目有多少个**（避免漏改或误改）

---

## 二、修改中检查

- [ ] **只改目标模块**——出现"顺手也改一下别处"的念头时，停下，另开一轮
- [ ] 用最小补丁：优先「加一行」「改一个字段」，避免重写整段
- [ ] `safe_write` 报长度自检失败时，**先确认是否真的有意删除**；
      确属有意才传 `min_ratio=None` 并写注释说明理由
- [ ] 改完**立即回读**该文件相关片段确认落盘正确
- [ ] 若改了 `course-data.json` → **立即重跑** `python3 tools/gen-course-data.py`
- [ ] 若改了任何"能写公式"的容器类名 → **同步 16 个页面的排版选择器 `SEL`**
- [ ] 若改了桌面版源码 → 记住**必须重新封签**（见 §3.7）

---

## 三、修改后检查

### 3.1 功能验证（对照你这一轮的目标）

- [ ] 目标现象已消失 / 目标功能已生效——**用浏览器实测，不是靠读代码判断**
- [ ] 用**至少 3 个页面**验证（不要只看你改的那一个）
- [ ] 边界情况：320px 窄屏 / 长页面底部 / 空数据

### 3.2 回归自检（防"改 A 坏 B"）

- [ ] `tools/check-shell.py` —— 外壳唯一性与导航一致性
- [ ] `tools/check-numbering.py` —— 编号连续
- [ ] `tools/check-refs.py` —— 交叉引用可达
- [ ] `tools/check-figure.py` —— 图号与引用
- [ ] `tools/check-example-order.py` —— 例题顺序
- [ ] `python3 tools/check-chart-visual.py` —— 46 图无裁剪/重叠

### 3.3 文字比对（**最容易被忽略**）

- [ ] 与 `tools/_backup/` 里的改前版本做**纯文本字符数比对**：

```bash
python3 - <<'PY'
import re, sys, glob
def txt(p):
    s = open(p, encoding='utf-8').read()
    s = re.sub(r'<script.*?</script>', '', s, flags=re.S)
    s = re.sub(r'<style.*?</style>', '', s, flags=re.S)
    s = re.sub(r'<[^>]+>', '', s)
    return re.sub(r'\s+', '', s)
for f in sorted(glob.glob('chapters/*.html')):
    b = sorted(glob.glob('tools/_backup/%s.*.bak' % f.split('/')[-1]))
    if not b: continue
    a, c = txt(f), txt(b[-1])
    print('%-22s %6d vs %6d  %s' % (f, len(a), len(c), '✓' if a == c else '✗ 文字被改动'))
PY
```

- [ ] 若**确实**改了文字（如修错别字），逐处列出 diff 并确认是预期的

### 3.4 公式渲染

- [ ] 目标页所有**例题标题**（`.example-head`）里的公式已渲染
- [ ] 页面里**看不到** `$…$` 裸露（浏览器实测，看渲染后的可见文本）
- [ ] `python3 tools/check-latex.py` + `tools/check-math-lint.py` 通过
- [ ] 若新增了能放公式的容器 → 类名已加入 `SEL`

### 3.5 图表渲染

- [ ] 图形**没有被容器裁掉**（四边留白 ≥20px）
- [ ] 文字不互相压住，图例不盖住图形
- [ ] 并列多面板图的解析**已分栏**（`.has-cols` / `.fig-cols` / `.fc`）
- [ ] 拖动侧栏后图表正确重绘
- [ ] `node tests/plot.test.js` + `tools/check-chart-visual.py` 通过

### 3.6 布局与外观

- [ ] `node tests/check-layout.js` —— **320 / 768 / 1280 三档均无横向滚动条**
- [ ] `node tests/check-contrast.js` —— 对比度达标
- [ ] 中文模式下**零英文残留**：`python3 tests/check-bilingual.py`
- [ ] 暗色主题下也可读（切主题看一眼）

### 3.7 桌面版（仅在改了 `desktop/` 时）

- [ ] 重新出包：`bash desktop/tools/build-all.sh <版本号>`
- [ ] 顺序正确：**Windows 先 unpacked → 封签 → 再打 exe**
- [ ] 打包后**删掉未打包的中间产物**（`mac*/`、`win-*unpacked/`），否则启动台/聚焦会多出图标
- [ ] 挂载 DMG 实测启动，确认日志出现 `OK 校验通过`
- [ ] 篡改一个 asar 内文件，确认应用**拒绝启动**

### 3.8 Git 仓库

- [ ] 修复内容已提交；`git status` 干净
- [ ] 未提交敏感信息：`.keys/`（仓库外）、`*.pem` / `*.p12` / `*.key` 均被 `.gitignore` 覆盖
- [ ] 未提交 `node_modules/`、未打包的 `.app`、安装包成品

---

## 四、提交前检查

- [ ] **全量校验**（本文档 §〇）全部退出码 0
- [ ] **文字比对**（§3.3）通过，或已逐条说明差异
- [ ] 提交信息写清：**现象 → 根因 → 修法 → 验证**（参考 `CHANGELOG.md` 的条目风格）
- [ ] 提交**只包含本轮相关文件**（`git add <具体文件>`，避免 `git add -A` 误带）
- [ ] 敏感信息扫描：`git ls-files | grep -iE '\.pem$|\.p12$|\.key$|secret|\.env'` 应为空
- [ ] 若改动了站点内容 → 评估**是否需要重新出安装包**（否则安装包里是旧版）
- [ ] 若改了 `assets/` 下文件 → 本机已装软件的 `Contents/Resources/site/` **需要同步更新**

---

## 五、桌面版专用检查（改站点后同步到本机应用）

> 完整性清单**不覆盖** `site/` 目录，所以直接替换站点文件即可，不会触发校验失败。

- [ ] 退出运行中的实例：`osascript -e 'quit app "高数学习站"' && pkill -f 高数学习站`
- [ ] 备份旧站点：`mv ~/Applications/高数学习站.app/Contents/Resources/site <备份目录>/site-old`
- [ ] 复制（**排除开发目录**）：
      `rsync -a --exclude 'desktop/' --exclude 'tools/' --exclude 'tests/' --exclude '.git/' \
       --exclude 'node_modules/' --exclude '.backup/' <站点>/ \
       ~/Applications/高数学习站.app/Contents/Resources/site/`
- [ ] 确认**用户数据未被删除**：`~/Library/Application Support/advmath-desktop/` 仍在
- [ ] 启动实测，日志出现 `OK 校验通过`

---

## 六、常见陷阱速查

| 陷阱 | 症状 | 规避 |
|---|---|---|
| 漏引 `course-data.js` | 按钮/进度/侧栏统计全无 | 脚本顺序：`plot → videos → quiz → course-data → site → theme` |
| 公式容器不在 `SEL` 里 | `$…$` 裸露 | 新容器必须加进 16 个页面的 `SEL` |
| `as -maxdepth` 不够 | 找漏文件 | 用 `find ... -name` 不加深度限制 |
| 用 `npx asar` 读外部路径 | 静默失败 | 改用 `node -e "require('@electron/asar')"` |
| `asar extract-file` 落到 cwd | **覆盖工程文件** | 先 `cd` 到临时目录再解包 |
| 备份放进工作区 | 启动台/聚焦多出图标 | 含 `.app` 的备份要压成 zip 或移出工作区 |
| 改了源码没重封签 | 安装包启动报「文件已被修改」 | 重跑 `build-all.sh` |
| 用 `?eager=1` 做日常验证 | 结论不准 | 日常用默认（分片）路径实测 |
| 无头浏览器快速滚动 | 误判"公式没渲染" | 慢速滚动 + 等待，或直接在真实浏览器看 |
