#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CI 引用的每个路径都必须真的在版本控制里。

为什么需要它
------------
`tests/` 在 `.gitignore` 里，但其中十几个文件已被跟踪。于是**在 tests/ 下新建文件
时忘了 `git add -f`，它就不会进仓库**，而 CI 会在 `npm ci` 之后以
`Cannot find module` 失败 —— 本地怎么跑都是绿的，只有推上去才发现。
这个错误真实发生过一次（`typeset.test.js`，2026-10-09）。

按「机械错误就该给确定性检查」的原则，这里把那条曾经写在 AGENTS.md 里的
注意事项换成一个可执行的检查。

⚠️ 交替分支一律「长在前」：(?:json|py|js) 而不是 (?:py|js|json)。
   后者里 `js` 会先把 `package-lock.json` 的前两字符吃掉，匹配出一个
   根本不存在的 `tests/package-lock.js`。本会话在别处已踩过同类坑两次
   （`\\leftrightarrow` 含子串 `\\left`、`$A$ 中文 $B$` 跨段匹配）。

用法：python3 tests/check-tracked.py      退出码 0 = 通过；1 = 有路径未入库
"""
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def tracked() -> set:
    out = subprocess.run(['git', 'ls-files'], cwd=ROOT,
                         capture_output=True, text=True).stdout
    return set(out.split())


def main() -> int:
    refs = set()
    # ① CI 工作流里出现的 tests/... 路径
    ci = os.path.join(ROOT, '.github', 'workflows', 'ci.yml')
    if os.path.exists(ci):
        refs |= set(re.findall(r'(tests/[\w\-.]+\.(?:json|py|js))', open(ci, encoding='utf-8').read()))
    # ② package.json 的 check/test 脚本里出现的
    pkg = os.path.join(ROOT, 'package.json')
    if os.path.exists(pkg):
        refs |= set(re.findall(r'(tests/[\w\-.]+\.(?:json|py|js))', open(pkg, encoding='utf-8').read()))

    have = tracked()
    bad = []
    for r in sorted(refs):
        if not os.path.exists(os.path.join(ROOT, r)):
            bad.append((r, '磁盘上不存在'))
        elif r not in have:
            bad.append((r, '未入库（需 git add -f）'))
    if bad:
        for r, why in bad:
            print('  ✗ %-32s %s' % (r, why))
        print('\n  ✗ %d 个被 CI / npm 引用的路径不在版本控制里' % len(bad))
        print('    tests/ 被 .gitignore 排除，新文件必须 git add -f，否则 CI 会失败。')
        return 1
    print('  ✓ %d 个被 CI / npm 引用的路径均已入库' % len(refs))
    return 0


if __name__ == '__main__':
    sys.exit(main())
