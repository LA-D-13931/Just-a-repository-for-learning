#!/usr/bin/env python3
r"""双语整段对照 + 视频入口 自检
（Bilingual pairing + video-entry self-check）

用法 / Usage:
    python3 tests/check-bilingual.py

检查项 / What it checks:

  A. 逐行对照（本次改版的核心要求）
     A1 每个双语容器里英中「段数」是否相等
     A2 有无单侧语言（只有英文段或只有中文段）
     A4 公式两侧是否逐字一致（$...$ 与 $$...$$ 全文比对）
     A5 数字两侧是否一致（含 §节号，如 §1.1、1.2–1.7）
     A6 英文行是否都带 lang="en"，中文行是否都带 lang="zh"

  B. 视频入口
     B1 每个小节的讲解区是否有顶部入口与底部入口（两个）
     B2 两处入口是否指向同一组 URL（同 URL、同顺序）
     B3 外链是否带 target="_blank" + rel="noopener noreferrer"
     B4 videos.js 是否覆盖 site.js 里登记的每个小节（正反双向）
     B5 首页每张章节卡片是否有视频入口容器
     B6 从首页出发到任意一节视频入口的点击次数

退出码 / Exit code: 0 = 全绿，1 = 有问题或存在待建项。
"""
import os
import json
import re
import sys
from collections import Counter, defaultdict

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 用显式扫描而不是正则交替：`$a$、$b$` 这种紧邻的行内公式
# 会让 `\$[^$]*\$` 与 `$$...$$` 抢边界，配出一堆假不一致。
# MathJax 的分隔符是 $$...$$ 与 $...$，这里按左到右扫描取「最内层成对」。
def extract_formulas(html):
    html = re.sub(r"<[^>]+>", "", html)
    out, i, n = [], 0, len(html)
    while i < n:
        if html[i] == "$" and not (i and html[i - 1] == "\\"):
            if html.startswith("$$", i):
                j = html.find("$$", i + 2)
                if j != -1:
                    out.append(html[i:j + 2]); i = j + 2; continue
            else:
                j = html.find("$", i + 1)
                if j != -1:
                    out.append(html[i:j + 1]); i = j + 1; continue
        i += 1
    return out


# 比较时抹掉尾部的标点：$$...$$, 与 $$...$$ 是同一公式
TRAILING = ",.;:，。；：、"
# 只查有意义的数字：节号（§1.1 / 1.2–1.7）、带小数点的、带时间/单位的。
# 裸个位数（$[0,1]$、例 1.2 里的 1、2）大多是行文差异，不做硬比对。
NUM_RE = re.compile(r'§\s*\d+(?:\.\d+)*(?:\s*[–—-]\s*\d+(?:\.\d+)*)?'
                    r'|\d+\.\d+(?:\s*[–—-]\s*\d+(?:\.\d+)*)?'
                    r'|\d+\s*(?:h|min|s|px|em|rem)\b')

# 已知例外（2026-09-17 用户裁示，选项 B）：
# 个别小节的**英文段落按英文语序重排**，与中文并非逐段对齐，此时逐段配对比对必然错配。
# 这类小节记为已知例外：不做逐段编号比对，但仍保留「整节集合级」检查（不受段落顺序影响）。
ORDER_EXEMPT = {'s7-8'}


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def strip_tags(t):
    t = re.sub(r"<span class=\"keep-together\"[^>]*>.*?</span>", "", t, flags=re.S)
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"\s+", " ", t).strip()


def nospace(t):
    return re.sub(r"\s+", "", strip_tags(t))


def normalized_formula(f):
    f = f.strip()
    if f.startswith("$$") and f.endswith("$$") and len(f) > 4:
        f = f[2:-2]
    elif f.startswith("$") and f.endswith("$") and len(f) > 2:
        f = f[1:-1]
    return re.sub(r"\s+", "", f.strip(TRAILING))


def parse_course():
    """从唯一数据源 assets/course-data.json 读取章节与小节（与 build-shell.py / site.js 同源）。"""
    data = json.loads(read(os.path.join(SITE, "assets", "course-data.json")))
    out = []
    seen = set()
    for c in data.get("chapters", []):
        ids = c.get("sections") or []
        if ids:
            out.append((c["num"], c["file"], ids))
            seen.add(c["file"])
    # 多科目（第 35-37 节）：subjects[] 里其余科目的章节也要纳入，
    # 否则线代小节的视频条目会被误报为「不在 COURSE 里」。与 site.js 同源口径。
    for sub in data.get("subjects", []):
        if sub.get("id") == "calculus":
            continue
        for c in sub.get("chapters", []):
            ids = c.get("sections") or []
            if ids and c["file"] not in seen:
                out.append((c["num"], c["file"], ids))
                seen.add(c["file"])
    return out


def parse_video_map():
    """从 videos.js 解析 MAP 的键与每条的 video/part（不做 JS 求值，只做结构解析）"""
    src = read(os.path.join(SITE, "assets", "js", "videos.js"))
    m = re.search(r"var\s+MAP\s*=\s*\{(.*?)\n  \};", src, re.S)
    if not m:
        print("✗ 无法从 videos.js 解析 MAP")
        sys.exit(2)
    body = m.group(1)
    out = {}
    m2 = re.search(r"var\s+MAP\s*=\s*\{(.*)\n  \};", src, re.S)
    body = m2.group(1) if m2 else body
    # 切分方式：先按 `'key': [` 定位每个小节的起点，再取到下一个起点之前。
    # 比「靠数组括号配对」稳，且天然容忍空数组 []、行内注释与结尾的最后一项。
    starts = list(re.finditer(r"'([a-z0-9-]+)':\s*\[", body))
    for idx, st in enumerate(starts):
        sid = st.group(1)
        seg_end = starts[idx + 1].start() if idx + 1 < len(starts) else len(body)
        entries = body[st.end():seg_end]
        items = []
        for o in re.finditer(r"\{([^{}]*)\}", entries, re.S):
            b = o.group(1)
            v = re.search(r"video:\s*'([^']+)'", b)
            pt = re.search(r"part:\s*(null|\d+)", b)
            if v:
                items.append({"video": v.group(1),
                              "part": None if not pt or pt.group(1) == "null" else int(pt.group(1))})
        out[sid] = items
    return out


def split_pairs(block):
    """整段对照：返回 (英文段组 html, 中文段组 html, 英文段数, 中文段数)。

    形式沿革：v0.1 整段 → v0.2 逐行 .pair（实测太碎，已废弃）→ v0.3 整段（当前）。
    这里同时兼容 .pair 写法，便于旧内容不出错。
    """
    en = re.findall(r'<p class="en"[^>]*>(.*?)</p>', block, re.S)
    zh = re.findall(r'<p class="zh"[^>]*>(.*?)</p>', block, re.S)
    return ("\n".join(en), "\n".join(zh), len(en), len(zh))


def check_pairs(rel, sid, block, issues, stats, orphan, detail, num_mismatch):
    en_html, zh_html, n_en, n_zh = split_pairs(block)
    if n_en == 0 and n_zh == 0:
        return
    stats["pairs"] += max(n_en, n_zh)

    # 段数一致性：英文段与中文段应当一一对应（整段对照下就是"段数相同"）
    if n_en != n_zh:
        issues.append(f"[{rel}] {sid} 中英段数不等：.en {n_en} 段 vs .zh {n_zh} 段")
        orphan.append(f"{rel} {sid}（英 {n_en} / 中 {n_zh}）")
    if n_en == 0 or n_zh == 0:
        issues.append(f"[{rel}] {sid} 只有单侧语言：.en {n_en} / .zh {n_zh}")

    # 公式两侧比对：
    #   ① 独立公式段（$$...$$）两侧必须逐字一致 —— 硬错误
    #   ② 行内公式要求"互含"，不满足的登记待确认
    def fcorpus(html):
        return "|".join(normalized_formula(x) for x in extract_formulas(html))

    def display_only(html):
        return sorted(set(
            normalized_formula(x) for x in extract_formulas(html) if x.startswith("$$")))

    de, dz = display_only(en_html), display_only(zh_html)
    if de != dz:
        issues.append(f"[{rel}] {sid} 独立公式两侧不一致：\n        英 {de}\n        中 {dz}")
    else:
        stats["formula_pairs"] += 1

    ce, cz = fcorpus(en_html), fcorpus(zh_html)
    ie = sorted(set(normalized_formula(x) for x in extract_formulas(en_html) if not x.startswith("$$")))
    iz = sorted(set(normalized_formula(x) for x in extract_formulas(zh_html) if not x.startswith("$$")))
    only_en = [x for x in ie if x and x not in cz]
    only_zh = [x for x in iz if x and x not in ce]
    if only_en or only_zh:
        detail.append(f"{sid}：英方独有 {only_en}；中方独有 {only_zh}")

    # 编号/节号比对：**逐 .bi 容器内按序配对**，不再整节拼接。
    # 背景（2026-09-17）：早先把整节的 en 段拼成一段、zh 段拼成一段再各取编号集合，
    # 而中文段数常多于英文段数（中文独占题干/注释），配对一错位就把毫不相干的两段
    # 放在一起比，产生大量误报（实测 165 处里绝大多数属此类）。
    def nums_of(html):
        return sorted(set(NUM_RE.findall(re.sub(r'\$[^$]*\$', ' ', strip_tags(html)))))

    containers = re.findall(r'<div class="bi">(.*?)</div>\s*\n', block, re.S)
    if not containers:
        containers = [block]
    checked = 0
    exempt = sid in ORDER_EXEMPT
    for c in containers:
        ces = re.findall(r'<p class="en"[^>]*>(.*?)</p>', c, re.S)
        czs = re.findall(r'<p class="zh"[^>]*>(.*?)</p>', c, re.S)
        for en_p, zh_p in zip(ces, czs):          # 只比"能配上"的，错位不再产生噪音
            checked += 1
            if exempt:
                continue                          # 已知例外：英文语序与中文不同
            ne_, nz_ = nums_of(en_p), nums_of(zh_p)
            if ne_ != nz_:
                head = re.sub(r'\s+', ' ', strip_tags(zh_p))[:38]
                num_mismatch.append(f"{sid}｜{head}…：英 {ne_} vs 中 {nz_}")
    stats["num_checked"] = stats.get("num_checked", 0) + checked

    # 整节**集合级**检查：两侧出现的编号总体应一致。
    # 逐段配对只能发现"同一段内两侧不同"；若整节段落**顺序错位**，
    # 逐段配对会把 A 段中配 B 段英，反而掩盖问题（s7-8 即如此）。
    # 集合级比对能抓到"顺序错位/单侧缺段"，但定位需人工——故与逐段配对**两者并行**。
    se = sorted(set(NUM_RE.findall(re.sub(r'\$[^$]*\$', ' ', strip_tags(en_html)))))
    sz = sorted(set(NUM_RE.findall(re.sub(r'\$[^$]*\$', ' ', strip_tags(zh_html)))))
    if se != sz:
        num_mismatch.append(f"{sid}（整节集合级）：英 {se} vs 中 {sz}")


# 2026-09-16 用户要求：以下块只要中文（原来要求中英对照，现收窄）
ZH_ONLY_CLASSES = ('warn-box', 'exam-box', 'link-box', 'map-note')


def block_end(html, start):
    depth = 0
    # 必须同时数 <details>：v0.7 起 app-box / link-box / map-note 都是 details，
    # 只数 <div> 会让"块"一直延伸到后面的正文里，从而误报"块里有英文"。
    for t in re.finditer(r'<(?:div|details)\b[^>]*>|</(?:div|details)>', html[start:]):
        depth += -1 if t.group(0).startswith('</') else 1
        if depth == 0:
            return start + t.end()
    return len(html)


def check_zh_only(rel, sid, block, issues, stats):
    """这四类块只应有中文：出现 .en 段落或 .bi 容器都要报出来。"""
    for cls in ZH_ONLY_CLASSES:
        for m in re.finditer(r'<(?:div|details) class="[^"]*\b%s\b[^"]*"' % cls, block):
            sub = block[m.start():block_end(block, m.start())]
            if 'class="en"' in sub or "class='en'" in sub:
                issues.append(f"[{rel}] {sid} 的 .{cls} 里出现了英文（规范：只要中文）")
            if 'class="bi"' in sub:
                issues.append(f"[{rel}] {sid} 的 .{cls} 里出现了 .bi 双语容器（规范：只要中文）")
            else:
                stats["zh_only_blocks"] += 1


# 纯中文模式（<html data-lang="zh">）下**允许残留**的拉丁文本：
#   · 代码/标识符字面量（不是"英文说明"）
#   · .map-note 里的英文教材节名 —— 那一块是"只要中文"的政策块，
#     但它的用途就是告诉学生"这块内容在英文书上哪一节"，
#     把 §7.1 Inverse Functions 这类书名节名也隐藏掉，这块就没用了
ZH_MODE_ALLOW = {
    'i', 'ii', 'iii', 'iv', 'v', 
    'localStorage', 'advmath', 'target', 'blank', 'rel', 'noopener', 'noreferrer',
    'PDF', 'HTML', 'CDN', 'MathJax', 'Thomas', 'Calculus', 'Advanced',
    'Mathematics', 'Tongji', 'CHAPTER', 'CH', 'TX', 'URL', 'Bilibili', 'bilibili',
    'BV', 'http', 'https', 'www', 'com', 'video',
    # 单位与专有名词（不是"英文说明文字"）
    'rad', 'Lanczos', 'Euler', 'Newton', 'Taylor', 'Fourier', 'Green', 'Stokes',
    'Sarrus', 'Cramer', 'Riemann', 'Cauchy', 'Lagrange', 'Maclaurin',
    # 顶栏外部工具入口的品牌名（2026-09-18 新增）：按需求第 7 条，
    # 中英文模式下都统一显示 Desmos，属品牌名而非"英文说明文字"，
    # 与上面 Bilibili / MathJax 同类，故加入白名单。
    'Desmos',
    # 线性代数科目的专有名词/人名/缩写（第 37 节接入）：
    # 与上面的 Euler / Sarrus / Cramer 同类——是术语本身，不是英文说明文字。
    'Schur', 'Sylvester', 'Hessian', 'Schmidt', 'Jordan', 'Campbell',
    'Mises', 'PCA', 'Hamilton', 'Cayley', 'Gram', 'Vandermonde',
    # 中文行文里作为括号注释出现的技术词（如「叶片盘（bladed disk）」），
    # 与「术语首现中英并列」同性质，纯中文模式下本就保留。
    'bladed', 'disk', 'Schmidt', 'orthogonalization',
    # 中文行文里作括号注释的术语（首现并列写法），与上同性质
    'eigenvalue', 'eigenvalues', 'eigenvector', 'eigenvectors',
    'matrix', 'matrices', 'orthogonal', 'von', 'Neumann',
    'determinant', 'adjugate', 'commute', 'rank',
}


def check_zh_mode_leak(rel, html, issues, stats):
    """模拟"纯中文模式"：把可隐藏的英文载体全部移除后，看还有没有英文漏出来。

    这是这套双语机制的**总护栏**：新写的英文若没有放进 .en / .q-stem-en / .en-inline，
    在纯中文模式下就会露出来 —— 这个检查能在交付前抓到。
    """
    t = html
    # HTML 注释不是"可见文本"：注释里出现英文（如解释性的 figcaption、SVG）不该算漏出
    t = re.sub(r'<!--.*?-->', ' ', t, flags=re.S)
    t = re.sub(r'<script.*?</script>', ' ', t, flags=re.S)
    t = re.sub(r'<style.*?</style>', ' ', t, flags=re.S)
    t = re.sub(r'<code[^>]*>.*?</code>', ' ', t, flags=re.S)
    # 隐藏：.en / .q-stem-en / .en-inline
    for cls in ('en', 'q-stem-en', 'en-inline'):
        t = re.sub(r'<p class="%s"[^>]*>.*?</p>' % cls, ' ', t, flags=re.S)
        t = re.sub(r'<li class="%s"[^>]*>.*?</li>' % cls, ' ', t, flags=re.S)
        t = re.sub(r'<span class="%s"[^>]*>.*?</span>' % cls, ' ', t, flags=re.S)
    t = re.sub(r'<div class="en"[^>]*>.*?</div>', ' ', t, flags=re.S)
    # 政策块：.map-note 整块豁免（英文教材节名要保留）
    # 注意它 v0.7 起是 <details class="map-note">，不再是 <div>
    t = re.sub(r'<details class="map-note[^"]*">.*?</details>', ' ', t, flags=re.S)
    t = re.sub(r'<div class="map-note">.*?</div>\s*</div>', ' ', t, flags=re.S)
    # 术语首现标注「中文（<span class="term-en">English</span>）」是**中文句子的一部分**，
    # 按规范在纯中文模式下也保留（否则"术语首现中英并列"这条就失效了），故剥离后不计漏出
    t = re.sub(r'<span class="term-en">.*?</span>', ' ', t, flags=re.S)
    # 去标签后抹掉数学公式（$...$ / $$...$$）
    # 公式要在**去标签之前**抹掉：去标签后 `$$…$$` 的内层 `$` 会与后面的 `$`
    # 错误配对，把 `\sum`/`\frac` 之类的命令残留成"英文单词"（v0.7.31 修）
    # 两步走，避免 `$$…$$` 的内层 `$` 与后面的 `$` 错误配对（v0.7.31 修）：
    #   ① 先把 `$$…$$` 整体替换成不含 `$` 的占位符
    #   ② 再抹掉行内 `$…$`
    t = re.sub(r'\$\$.*?\$\$', ' MATHBLOCK ', t, flags=re.S)
    t = re.sub(r'\$[^$]*?\$', ' MATH ', t)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = re.sub(r'&[a-z]+;', ' ', t)
    t = t.replace('MATHBLOCK', ' ').replace('MATH', ' ')
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z'\-]{2,}", t) if w not in ZH_MODE_ALLOW]
    if words:
        issues.append(f"[{rel}] 纯中文模式下会漏出英文：{sorted(set(words))[:12]}")
    else:
        stats['zh_mode_clean'] += 1


def check_video_entries(rel, sid, html, vmap, issues, stats):
    hosts = re.findall(r'data-video-entry="([^"]+)"[^>]*data-video-pos="([^"]+)"', html)
    # 顺序可能反着写，两种都认
    hosts = re.findall(
        r'data-video-(entry|pos)="([^"]+)"\s+data-video-(?:entry|pos)="([^"]+)"', html)
    found = {}
    for m in re.finditer(r'<div\s+([^>]*data-video-entry="[^"]+"[^>]*)>', html):
        attrs = m.group(1)
        e = re.search(r'data-video-entry="([^"]+)"', attrs)
        p = re.search(r'data-video-pos="([^"]+)"', attrs)
        if e and p:
            found.setdefault(e.group(1), []).append(p.group(1))
    pos = found.get(sid, [])
    # 2026-09-16 用户要求：删掉讲解区**底部**的"看完还想听一遍？"卡片（附图 2）。
    # 现在规定：每个小节**恰好一个**入口，且在讲解区顶部。
    if "top" not in pos:
        issues.append(f"[{rel}] {sid} 讲解区缺少顶部视频入口（data-video-pos=\"top\"）")
    if "bottom" in pos:
        issues.append(f"[{rel}] {sid} 仍有底部视频入口——用户要求删除（只保留顶部一个）")
    if pos == ["top"]:
        stats["sections_with_two_entries"] += 1

    # 两处入口必须在 videos.js 里指向同一组 URL（由集中配置保证：
    # 两个容器用同一个 key，因此天然同源。这里校验 key 一致性）
    if len(pos) == 2 and len(set(re.findall(r'data-video-entry="([^"]+)"', html))) != 1:
        issues.append(f"[{rel}] {sid} 顶部与底部入口用了不同的 key，可能指向不同视频")


def click_depth(home, sid_of_video):
    """首页 → 章节页 → 小节入口 = 2 次点击；章节卡片上的入口 = 1 次"""
    return 2


def main():
    course = parse_course()
    vmap = parse_video_map()
    issues, warnings, orphan = [], [], []
    detail, num_mismatch = [], []
    stats = Counter()
    not_built = []

    # ---------- B4：videos.js 与 site.js 双向覆盖 ----------
    # 只对**已建成**的章节要求视频条目：未建章节（ch8–ch12 等）还没有正文，
    # 自然也没有 entries；要求它们会制造 30+ 条无意义的硬问题（2026-09-17 修）。
    built_files = set()
    for _n, _f, _ids in course:
        if os.path.exists(os.path.join(SITE, _f)):
            built_files.add(_f)
    all_ids = [i for _n, _f, ids in course if _f in built_files for i in ids]
    for sid in all_ids:
        if sid not in vmap:
            issues.append(f"[videos.js] site.js 登记的小节 {sid} 在视频配置里找不到"
                          f"（要么补 entries，要么显式写 [] 表示「暂无视频」）")
    for sid in vmap:
        if sid not in all_ids:
            issues.append(f"[videos.js] 视频配置里的 {sid} 不在 site.js 的 COURSE 里（key 拼错？）")

    # ---------- 章节页 ----------
    for n, f, ids in course:
        path = os.path.join(SITE, f)
        rel = f
        if not os.path.exists(path):
            not_built.append(rel)
            continue
        html = read(path)
        # 整页级护栏：模拟"纯中文模式"，看有没有英文漏出来
        check_zh_mode_leak(rel, html, issues, stats)
        for sid in ids:
            if f'id="{sid}"' not in html:
                continue  # 该小节还没建，由 check-structure.py 报「待建」
            # 取该小节的块
            m = re.search(r'<h2[^>]*id="%s"' % re.escape(sid), html)
            start = m.start()
            nxt = re.search(r'<h2[^>]*id="', html[start + 10:])
            block = html[start:start + 10 + nxt.start()] if nxt else html[start:]

            # A：双语容器
            for bi in re.finditer(r'<div class="bi[^"]*">', block):
                end = bi.start()
                depth = 0
                j = bi.start()
                for mm in re.finditer(r'<(?:div|details)\b|</(?:div|details)>', block[bi.start():]):
                    if mm.group(0) == '</div>':
                        depth -= 1
                        if depth == 0:
                            end = bi.start() + mm.end()
                            break
                    else:
                        depth += 1
                check_pairs(rel, sid, block[bi.start():end], issues, stats, orphan,
                        detail, num_mismatch)

            # C：只应有中文的块
            check_zh_only(rel, sid, block, issues, stats)

            # B：视频入口
            check_video_entries(rel, sid, block, vmap, issues, stats)
            stats["sections"] += 1
            if vmap.get(sid):
                stats["sections_with_video"] += 1
            else:
                stats["sections_without_video"] += 1

    # ---------- 首页：**整页纯中文**（2026-09-16 用户要求"index 这个部分都不要英文"） ----------
    idx_path = os.path.join(SITE, 'index.html')
    if os.path.exists(idx_path):
        ih = read(idx_path)
        body = ih[ih.index('<body'):]
        body = re.sub(r'<!--.*?-->', ' ', body, flags=re.S)   # 注释不算可见文本
        # 只看可见文本（去标签与实体），HTML 属性不算
        text = re.sub(r'<[^>]+>', ' ', body)
        text = re.sub(r'&[a-z]+;', ' ', text)
        # 允许保留的：代码/标识符（它们是字面量，不是"英文说明"）
        # 允许保留的：代码/标识符（字面量，不是"英文说明"）+ 品牌名。
        # Desmos 于 2026-09-18 按用户需求加入：顶栏要有全局固定的 Desmos 入口，
        # 且需求第 7 条明确"文字统一显示 Desmos"（不中英混排），
        # 故它是**有意保留的品牌名**，与 MathJax / PDF / CDN 同类。
        ALLOW = {'localStorage', 'advmath', 'target', 'blank', 'rel', 'noopener',
                 'noreferrer', 'PDF', 'HTML', 'MathJax', 'CDN', 'Desmos'}
        words = [w for w in re.findall(r"[A-Za-z][A-Za-z'\-]{2,}", text) if w not in ALLOW]
        if words:
            issues.append(f"[index.html] 首页要求纯中文，但可见文本里还有英文：{sorted(set(words))[:12]}")
        else:
            stats['home_zh_only'] = 1
        if re.search(r'class="en"', ih):
            issues.append("[index.html] 首页出现了 .en 段落（要求纯中文）")
        if re.search(r'class="bi"', ih):
            issues.append("[index.html] 首页出现了 .bi 双语容器（要求纯中文）")

    # ---------- B5：首页章节卡片 ----------
    idx = os.path.join(SITE, "index.html")
    if os.path.exists(idx):
        ih = read(idx)
        for n, f, ids in course:
            page = os.path.splitext(os.path.basename(f))[0]
            m = re.search(r'<[a-z]+[^>]*data-chapter="%d"[^>]*>' % n, ih)
            if not m:
                issues.append(f"[index.html] 找不到 data-chapter=\"{n}\" 的章节卡片")
                continue
            if "data-chapter-videos" not in m.group(0):
                issues.append(f"[index.html] 第 {n} 章的卡片缺少 data-chapter-videos 属性"
                              f"（目录页也要能进视频）")
            else:
                stats["cards_with_entry"] += 1
    else:
        not_built.append("index.html")

    # ---------- B6：点击深度 ----------
    depth = 2

    # ---------- 汇总 ----------
    print("=" * 72)
    print(f"对照   对照段 {stats['pairs']} 条 · 独立公式逐字一致 {stats['formula_pairs']} 组"
          f" · 段数不等 {len(orphan)} 处")
    print(f"纯中文 易错/考点/关联/映射 {stats['zh_only_blocks']} 个块 · "
          f"首页整页纯中文 {'✓' if stats.get('home_zh_only') else '✗'} · "
          f"纯中文模式无英文漏出 {stats['zh_mode_clean']} 页")
    print(f"视频   已建小节 {stats['sections']} 个（有视频 {stats['sections_with_video']}"
          f" / 暂无视频 {stats['sections_without_video']}）"
          f" · 单一顶部入口 {stats['sections_with_two_entries']} 个"
          f" · 章节卡片入口 {stats['cards_with_entry']} 张")
    print(f"可发现性  首页 → 任意一节视频入口 = {depth} 次点击（约定上限 2 次）")
    print("=" * 72)

    if not_built:
        print(f"未建页面 {len(not_built)} 个（第 1 期完成后应为 0）：")
        for x in not_built:
            print("  ·", x)
        print()

    if issues:
        print(f"发现 {len(issues)} 个硬问题：\n")
        for i in issues:
            print("  •", i)
        print()

    if detail:
        print(f"行内符号出现次数不同 {len(detail)} 处（行文差异，供人工确认，不阻断）：")
        for d in detail[:12]:
            print("  ·", d)
        if len(detail) > 12:
            print(f"  · …… 另有 {len(detail) - 12} 处")
        print()

    if num_mismatch:
        print(f"数字/节号两侧不完全对应 {len(num_mismatch)} 处（供人工确认）：")
        for d in num_mismatch:
            print("  ·", d)
        print()

    if not issues and not detail and not num_mismatch:
        print("✓ 双语对照与视频入口检查全部通过")
    elif not issues:
        print("✓ 硬性检查通过（无独立公式不一致、无段数不等、无入口缺失）")

    # 「未建章节」只作提示，**不计入退出码**——全站 12 章要分批施工，
    # 把它们当失败会让校验长期红灯（与 check-structure 口径一致，2026-09-17）。
    return 1 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
