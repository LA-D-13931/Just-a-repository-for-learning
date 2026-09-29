#!/usr/bin/env python3
"""HTML 标签配平检查 + 内部链接检查。用法：python3 tests/check-html.py"""
import os, re, glob, sys
from html.parser import HTMLParser

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOID = {"area","base","br","col","embed","hr","img","input","link","meta",
        "param","source","track","wbr"}

class Checker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errors = [], []
    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))
    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f"第 {self.getpos()[0]} 行：多余的 </{tag}>"); return
        if self.stack[-1][0] == tag:
            self.stack.pop(); return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                unclosed = [t for t, _ in self.stack[i + 1:]]
                self.errors.append(
                    f"第 {self.getpos()[0]} 行：</{tag}> 闭合时内部还有未闭合的 {unclosed}")
                del self.stack[i:]
                return
        self.errors.append(f"第 {self.getpos()[0]} 行：</{tag}> 无对应开标签")

def main():
    os.chdir(SITE)
    # chapters/ 下的页面不只 chN.html：托马斯补充章是 suppN.html，
    # 因此用 *.html 而不是 ch*.html（旧写法会把 supp1.html 漏掉）。
    # Chapter pages are not all named chN.html — Thomas supplements use suppN.html.
    # 多科目（第 38 节）：各科目首页也要纳入校验，否则新页不被质检覆盖
    pages = ["index.html", "linear-algebra.html", "exam.html", "cheatsheet.html",
             "linear-algebra-exam.html", "linear-algebra-cheatsheet.html"] \
            + sorted(glob.glob("chapters/*.html"))
    # 第 1 期分批施工：未建的页面不算错误，单列出来，但退出码仍为 1，
    # 以便「全部建完」这件事可被验收。
    # Pages not yet written during phase 1 are listed but not treated as errors;
    # the exit code stays 1 so that "everything is built" remains verifiable.
    missing = [p for p in pages if not os.path.exists(p)]
    pages = [p for p in pages if os.path.exists(p)]
    bad = 0

    print("--- 标签配平 / Tag balance ---")
    for p in pages:
        c = Checker(); c.feed(open(p, encoding="utf-8").read())
        left = [f"{t}(第{l}行)" for t, l in c.stack]
        if c.errors or left:
            bad += 1
            print(f"  ✗ {p}")
            for e in c.errors[:5]: print(f"      {e}")
            if left: print(f"      未闭合: {left[:8]}")
        else:
            print(f"  ✓ {p}")

    print(f"  标签配平：{len(pages) - bad}/{len(pages)} 页通过")
    print("\n--- 内部链接 / Internal links ---")
    total = broken = 0
    for p in pages:
        s = open(p, encoding="utf-8").read()
        base = os.path.dirname(p)
        for href in re.findall(r'(?:href|src)="([^"]+)"', s):
            if href.startswith(("http://", "https://", "#", "mailto:", "data:")):
                continue
            total += 1
            tgt = os.path.normpath(os.path.join(base, href.split("#")[0]))
            if not os.path.exists(tgt):
                print(f"  ✗ {p} → {href}"); broken += 1
    print(f"  检查 {total} 个链接，失效 {broken} 个 / {total} links checked, {broken} broken")

    print("\n--- 内容卫生 / Content hygiene ---")
    # 两条都是"作者容易犯、但结构校验看不出来"的错：
    #   ① HTML 里写了 Markdown 的 **加粗** —— 浏览器会把星号原样显示出来
    #   2. SVG 里写了 $...$ 数学 —— MathJax 不处理 SVG 内部文本，那段字会被吃掉
    #      （v0.7.0 的"定义域叠加图"就这么坏过一次）
    hyg = 0
    for p in pages:
        src = open(p, encoding="utf-8").read()
        body = re.sub(r"<!--.*?-->", "", src, flags=re.S)      # 注释里的不算
        text = re.sub(r"<[^>]+>", " ", body)
        for m in re.finditer(r"\*\*[^*\n]{1,60}\*\*", text):
            print(f"  ✗ {p} → 正文里有 Markdown 加粗：{m.group(0)[:40]}")
            hyg += 1
        for m in re.finditer(r"<svg.*?</svg>", body, re.S):
            for mm in re.finditer(r"\$[^$]{1,40}\$", m.group(0)):
                print(f"  ✗ {p} → SVG 内出现数学 {mm.group(0)[:30]}（MathJax 不处理 SVG 内部文本）")
                hyg += 1
    print(f"  内容卫生：{hyg} 处问题" + ("（Markdown 星号 / SVG 内数学）" if hyg else " ✓"))

    print("\n--- 页内锚点 / In-page anchors ---")
    bad_anchor = 0
    for p in pages:
        s = open(p, encoding="utf-8").read()
        ids = set(re.findall(r'id="([^"]+)"', s))
        for a in re.findall(r'href="#([^"]+)"', s):
            if a not in ids:
                print(f"  ✗ {p} → #{a}"); bad_anchor += 1
    print(f"  失效锚点 {bad_anchor} 个 / {bad_anchor} broken anchors")

    if missing:
        print(f"\n--- 未建页面 {len(missing)} 个（第 1 期完成后应为 0）---")
        for p in missing: print(f"  · {p}")

    ok = bad == 0 and broken == 0 and bad_anchor == 0 and hyg == 0
    print("\n" + (f"✓ 标签配平 {len(pages)}/{len(pages)} · 链接 {total - broken}/{total} · "
                   f"锚点 {bad_anchor} 失效 · 内容卫生 {hyg} 问题 —— 已建页面全部通过"
                   if ok else "✗ 存在问题 / problems found"))
    return 0 if (ok and not missing) else 1

if __name__ == "__main__":
    sys.exit(main())
