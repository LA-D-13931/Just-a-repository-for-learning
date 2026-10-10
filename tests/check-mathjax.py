#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""源码级检查：禁止使用本站 MathJax 构建**无法渲染**的命令。

为什么需要它
------------
本站的 MathJax 是**单文件自包含**的 `assets/js/vendor/tex-svg.js`，没有
`input/tex/extensions/` 目录。某些命令会让 MathJax 去**懒加载**对应的扩展文件，
加载失败后就把该处公式渲染成红色的错误源码（用户看到的是 `\\boldsymbolα_1` 这种）。

2026-10-10 逐条实测（每条单独开页测，避免一条失败中断整批）：
    失败：\\boldsymbol{...}、\\cancel{...}
    可用：\\mathbf{\\alpha} \\bm \\mathbb \\mathcal \\mathfrak \\vec \\mathrm
          \\operatorname \\dfrac \\binom \\overline \\hat \\tilde \\bar \\dot
          \\partial \\nabla \\lVert \\overset \\underset \\xrightarrow …

注意：\\mathbf{\\alpha} 虽然不报错，但**对希腊字母毫无加粗效果**（字形与 \\alpha
逐位相同），所以它也不是「加粗希腊字母」的替代品——本站在向量记号上统一用 \\vec。

用法：python3 tests/check-mathjax.py
退出码：0 = 通过；1 = 发现禁用命令。
"""
import re
import sys
import glob
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# 命令 -> 替代写法
BANNED = {
    r'\boldsymbol': '改用 \\vec{...}（本站向量记号）或去掉加粗；字形反正出不来',
    r'\cancel': '去掉删除线，或改写成等价表达',
    r'\bcancel': '去掉删除线',
    r'\xcancel': '去掉删除线',
    r'\sout': '去掉删除线',
}


def main():
    files = sorted(glob.glob(os.path.join(ROOT, 'chapters', '*.html'))) + \
            sorted(glob.glob(os.path.join(ROOT, '*.html')))
    bad = 0
    scanned = 0
    for f in files:
        s = open(f, encoding='utf-8').read()
        # 跳过 HTML 注释与 <code>/<pre>（那里可能故意展示 LaTeX 源码）
        body = re.sub(r'<!--[\s\S]*?-->', '', s)
        body = re.sub(r'<(code|pre)\b[\s\S]*?</\1>', '', body, flags=re.I)
        scanned += 1
        for cmd, fix in BANNED.items():
            for m in re.finditer(re.escape(cmd) + r'(?![a-zA-Z])', body):
                ln = body[:m.start()].count('\n') + 1
                print('  ✗ [%s:%d] %s —— %s'
                      % (os.path.relpath(f, ROOT), ln, cmd, fix))
                bad += 1
    print('')
    if bad:
        print('  ✗ %d 处使用了本站 MathJax 无法渲染的命令（共扫描 %d 页）' % (bad, scanned))
        print('    这些命令会让公式变成红色错误源码，读者直接看到 LaTeX。')
        return 1
    print('  ✓ %d 页均未使用禁用命令' % scanned)
    return 0


if __name__ == '__main__':
    sys.exit(main())
