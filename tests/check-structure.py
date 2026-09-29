#!/usr/bin/env python3
"""结构校验脚本：检查「高等数学学习站」各章节页是否符合写作规范。

与线代站版本的差异（第 1 期改造）：
  1. 章节目录不再写死在 EXPECTED 里，而是从 assets/js/site.js 的 COURSE 数组解析，
     避免「site.js 登记了新节、校验脚本还在查旧的」这类不一致。
  2. 未建的章不报错，只列为「未建」；**未建/待建不影响退出码**，只有真正的内容
     问题才返回非零（分批施工期间校验要能保持绿灯）。
  3. 新增两条第 1 期要求的检查：
     ① 每个小节 h2 的 data-video 非空且格式合法（BV 号 + 可选 :P 段）；
     ② 每道题的英文题干 .q-stem-en 存在且非空、且是 .q-stem 的子元素。
  4. 新增双语等权检查：概念/方法类块里 .zh 与 .en 必须成对出现。
"""
import json
import re
import sys
import os
from collections import Counter, defaultdict

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ALLOWED_TAGS = {
    "html", "head", "meta", "title", "link", "script", "style", "body",
    "header", "nav", "main", "aside", "footer", "div", "span", "a", "button",
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "table",
    "thead", "tbody", "tfoot", "tr", "th", "td", "details", "summary",
    "strong", "em", "b", "i", "u", "s", "code", "pre", "br", "hr", "img",
    "input", "label", "section", "article", "small", "sub", "sup", "mark",
    "blockquote", "figure", "figcaption", "dl", "dt", "dd", "abbr", "time",
}

# 内联 SVG 图解的元素（编排与文风规范 §四：数形结合用手写内联 SVG，零依赖）。
# 不加这个白名单，每一张图都会被上面的"可疑标签"启发式误报成"数学里的 < > 没转义"——
# v0.7.2 实测：s1-1 的两幅图就产生了 122 条假报，把真实问题淹没了。
ALLOWED_SVG_TAGS = {
    "svg", "g", "defs", "title", "desc", "symbol", "use", "marker", "pattern",
    "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
    "text", "tspan", "textPath",
    "linearGradient", "radialGradient", "stop", "clipPath", "mask",
    "filter", "feGaussianBlur", "feOffset", "feBlend", "style",
}
ALLOWED_TAGS |= {t.lower() for t in ALLOWED_SVG_TAGS}

TAG_RE = re.compile(r"<\s*(/?)\s*([a-zA-Z][a-zA-Z0-9]*)")
QUIZ_RE = re.compile(r'<div class="quiz"[^>]*data-quiz-id="([^"]+)"', re.I)
Q_RE = re.compile(r'<div class="q"([^>]*)>')
H2_RE = re.compile(r'<h2([^>]*)id="([^"]+)"([^>]*)>(.*?)</h2>', re.S)

# data-video 的合法值：BV 号，可选地跟 :起P-止P（也可以是单个 P）
VIDEO_RE = re.compile(r'^BV[0-9A-Za-z]{8,12}(:\d+(-\d+)?)?$')

# 概念/方法类块：这些块内部必须 .zh / .en 成对（中英等权）
BI_BOX_CLASSES = ("def-box", "thm-box", "method-box")

# 规范明令「不加英文」的块：
#   · app-box / example —— 概念扩展应用、例题与错题讲解
#   · warn-box / exam-box / link-box / map-note —— 2026-09-16 用户要求：这几部分只要中文
NO_EN_CLASSES = ("app-box", "example", "warn-box", "exam-box", "link-box", "map-note")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def parse_course():
    """从**唯一数据源** assets/course-data.json 解析章节目录，返回 [(n, file, title, [ids])]。

    2026-09-17 改造：COURSE 不再是 site.js 里的字面量数组（已改为由数据源派生），
    因此这里直接读 JSON —— 与 build-shell.py / site.js 同源，不再有第二份课程表。
    解析失败时硬失败退出，宁可不通过，也不要用一份过期目录默默通过。
    """
    path = os.path.join(SITE, "assets", "course-data.json")
    if not os.path.exists(path):
        print("✗ 缺少唯一数据源 assets/course-data.json")
        sys.exit(2)
    data = json.loads(read(path))
    chapters = []
    for c in data.get("chapters", []):
        ids = c.get("sections") or []
        if not ids:
            continue
        title = c["title"]["zh"] if c.get("num") != 101 else (c.get("short") or c["title"])["zh"]
        chapters.append((c["num"], c["file"], title, ids))
    if not chapters:
        print("✗ 数据源里的章节列表为空")
        sys.exit(2)
    return chapters


COURSE = parse_course()

# 密钥用「不带扩展名的文件名」（ch1 / supp1），因为 body data-page 就是这个形式；
# 页面路径另存一份。
BY_PAGE = {}          # 'ch1' -> (章号, [ids])
PAGE_PATH = {}        # 'ch1' -> 'chapters/ch1.html'
for _n, _f, _t, _ids in COURSE:
    _page = os.path.splitext(os.path.basename(_f))[0]
    BY_PAGE[_page] = (str(_n), _ids)
    PAGE_PATH[_page] = _f


def find_div_end(html, start):
    """从 start 处的 <div 开始，返回与之匹配的 </div> 之后的位置（按嵌套深度计数）"""
    depth = 0
    for m in re.finditer(r'<(?:div|details)\b|</(?:div|details)>', html[start:]):
        if m.group(0).startswith('</'):
            depth -= 1
            if depth == 0:
                return start + m.end()
        else:
            depth += 1
    return len(html)


def split_sections(html):
    """按 h2 切分成块，返回 [(id, title, attrs, block_html)]"""
    marks = list(H2_RE.finditer(html))
    out = []
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(html)
        attrs = (m.group(1) or "") + " " + (m.group(3) or "")
        title = re.sub(r"<[^>]+>", "", m.group(4)).strip()
        out.append((m.group(2), title, attrs, html[m.start():end]))
    return out


def check_question(html, m, rel, issues, stats):
    """检查单道题：结构、难度、选项、英文题干、中英解析"""
    attrs = m.group(1)
    start = m.start()
    bounds = [html.find(p, start + 1) for p in
              ('<div class="q"', '<div class="quiz"', '<h2')]
    bounds = [b for b in bounds if b != -1]
    end = min(bounds) if bounds else len(html)
    block = html[start:end]
    line = html[:start].count("\n") + 1

    qtype = re.search(r'data-type="([^"]+)"', attrs)
    qtype = qtype.group(1) if qtype else "single"

    # --- 题干：必须是 .q-stem（第 1 期起推荐用 <div> 以容纳英文子块） ---
    stem_m = re.search(r'<(p|div) class="q-stem"', block)
    if not stem_m:
        issues.append(f"[{rel}:{line}] 题目缺少 .q-stem")
    else:
        stem_start = block.find(stem_m.group(0))
        stem_end = block.find(f"</{stem_m.group(1)}>", stem_start)
        stem_html = block[stem_start:stem_end if stem_end != -1 else len(block)]
        if stem_m.group(1) == "p":
            issues.append(f"[{rel}:{line}] .q-stem 用的是 <p> 且内部似乎没有英文块；"
                          f"第 1 期要求英文题干是 .q-stem 的子元素，请改用 <div class=\"q-stem\">")

    # --- 第 1 期检查②：英文题干非空且是 .q-stem 的子元素 ---
    en_m = re.search(r'<p class="q-stem-en"[^>]*>(.*?)</p>', block, re.S)
    if not en_m:
        issues.append(f"[{rel}:{line}] 题目缺少英文题干 .q-stem-en")
    else:
        en_text = re.sub(r"<[^>]*>", "", en_m.group(1))
        en_text = re.sub(r"\\[a-zA-Z]+", "", en_text).strip()
        if len(en_text) < 8:
            issues.append(f"[{rel}:{line}] .q-stem-en 内容过短，疑似占位")
        else:
            stats["stem_en"] += 1
        if stem_m and not (stem_m.start() < en_m.start() < block.find(f"</{stem_m.group(1)}>")):
            issues.append(f"[{rel}:{line}] .q-stem-en 不是 .q-stem 的子元素"
                          f"（必须是子元素，否则会被 .q-head 的 flex 挤成一行）")

    # --- 解析：中文必填；英文按「中英等权」要求填写 ---
    if "q-explain" not in block:
        issues.append(f"[{rel}:{line}] 题目缺少 .q-explain（规范要求每题必有解析）")
    else:
        ex_start = block.find('<div class="q-explain"')
        ex_block = block[ex_start:find_div_end(block, ex_start)]
        if 'class="en"' in ex_block:
            stats["explain_en"] += 1

    lv = re.search(r'data-level="([^"]+)"', attrs)
    if not lv:
        issues.append(f"[{rel}:{line}] 题目缺少 data-level（基础/中等/考研）")
    elif lv.group(1) not in ("基础", "中等", "考研"):
        issues.append(f"[{rel}:{line}] data-level 取值非法：{lv.group(1)}")
    else:
        stats["lv_" + lv.group(1)] += 1

    if qtype == "fill":
        m2 = re.search(r'data-answer="([^"]*)"', block)
        if not m2 or not m2.group(1).strip():
            issues.append(f"[{rel}:{line}] 填空题缺少 data-answer")
    else:
        opts = re.findall(r"<li([^>]*)>", block)
        if len(opts) < 2:
            issues.append(f"[{rel}:{line}] 选择题选项少于 2 个")
        n_correct = sum(1 for o in opts if 'data-correct="true"' in o)
        if n_correct == 0:
            issues.append(f"[{rel}:{line}] 选择题没有任何 data-correct=\"true\"")
        if qtype == "single" and n_correct != 1:
            issues.append(f"[{rel}:{line}] 单选题有 {n_correct} 个正确项，应恰好 1 个")
        if qtype == "judge" and len(opts) != 2:
            issues.append(f"[{rel}:{line}] 判断题选项数 {len(opts)}，应为 2")
        if "opt-body" not in block:
            issues.append(f"[{rel}:{line}] 选项缺少 .opt-body")


def check_section(sid, title, attrs, block, rel, expected_ids, issues, stats):
    """检查单个小节的内容块完备性与双语覆盖"""
    need = {
        "insight-box": "💡 直观理解",
        "def-box": "📘 定义",
        "thm-box": "📐 定理/判定",
        "method-box": "⚙️ 计算步骤",
        "warn-box": "⚠️ 易错点",
        "exam-box": "🎯 考察要点",
        # .link-box 于 v0.7.2 取消（编排与文风规范 §二：知识关联改为就地融进正文），
        # 故不再列为必备块。历史遗留的 .link-box 仍由 NO_EN_CLASSES 检查"不含英文"。
    }
    for cls, label in need.items():
        if cls not in block:
            issues.append(f"[{rel}] 小节 {sid} 缺少 {label}（.{cls}）")

    n_ex = block.count('class="example"')
    if n_ex < 2:
        issues.append(f"[{rel}] 小节 {sid} 只有 {n_ex} 道例题，规范要求 ≥2")
    if 'class="quiz"' not in block:
        issues.append(f"[{rel}] 小节 {sid} 没有自测题（.quiz）")
    if 'class="q-review"' not in block:
        issues.append(f"[{rel}] 小节 {sid} 的测验缺少讲评（.q-review）")

    stats["examples"] += n_ex
    stats["sections"] += 1

    # --- h2 属性：data-hours 与 data-video（第 1 期检查①）---
    if "data-hours" not in attrs:
        issues.append(f"[{rel}] 小节 {sid} 的 h2 缺少 data-hours")
    else:
        hours = re.search(r'data-hours="([^"]*)"', attrs)
        if not hours or not hours.group(1).strip():
            issues.append(f"[{rel}] 小节 {sid} 的 data-hours 为空")

    # 视频登记：URL 只在 assets/js/videos.js 里，h2 上只放一个引用键。
    # 覆盖一致性（site.js ↔ videos.js 双向）由 tests/check-bilingual.py B4 负责。
    vmap = re.search(r'data-video-map="([^"]*)"', attrs)
    if not vmap:
        issues.append(f"[{rel}] 小节 {sid} 的 h2 缺少 data-video-map"
                      f"（指向 assets/js/videos.js 里的键，不要在这里硬编码 URL）")
    elif vmap.group(1).strip() != sid:
        issues.append(f"[{rel}] 小节 {sid} 的 data-video-map=\"{vmap.group(1)}\" "
                      f"与小节 id 不一致")
    else:
        stats["videos"] += 1
    if not re.search(r'data-video-title="[^"]+"', attrs):
        issues.append(f"[{rel}] 小节 {sid} 的 h2 缺少 data-video-title（合集名）")

    # --- 双语：概念/方法类块内必须有 .bi 容器，且 .en 段组与 .zh 段组都在 ---
    # 形式沿革：v0.1 整段 → v0.2 逐行 .pair（实测太碎，废弃）→ v0.3 整段（当前）。
    # 段数一致性与公式一致性由 tests/check-bilingual.py 做细检，这里只查覆盖。
    for cls in BI_BOX_CLASSES:
        for bm in re.finditer(r'<div class="[^"]*\b%s\b[^"]*"' % cls, block):
            box = block[bm.start():find_div_end(block, bm.start())]
            n_en = len(re.findall(r'class="en"', box))
            n_zh = len(re.findall(r'class="zh"', box))
            inner = re.search(r'class="box-title"[^>]*>(.*?)</div>', box, re.S)
            label = re.sub(r"<[^>]+>", "", inner.group(1)).strip()[:28] if inner else cls
            if n_en == 0 or n_zh == 0:
                issues.append(f"[{rel}] 小节 {sid} 的「{label}」缺少整段对照"
                              f"（.en {n_en} / .zh {n_zh}）——中英权重应相同")
            else:
                stats["bi_boxes"] += 1
                stats["bi_pairs"] += n_en

    # --- 明令不加英文的块：出现英文对照要报错 ---
    for cls in NO_EN_CLASSES:
        for nm in re.finditer(r'<(?:div|details) class="[^"]*\b%s\b[^"]*"' % cls, block):
            nb = block[nm.start():find_div_end(block, nm.start())]
            if re.search(r'class="pair-en"', nb) or re.search(r'class="en"', nb):
                issues.append(f"[{rel}] 小节 {sid} 的 .{cls} 里出现了英文对照"
                              f"——规范规定该处不加英文（概念扩展应用 / 例题 / 易错点 / 考察要点 / "
                              f"知识关联 / 教材映射）")


def check_file(name, path, issues, quiz_ids, stats, pending):
    html = read(path)
    rel = os.path.relpath(path, SITE)
    expected = None
    if name in BY_PAGE:
        _num, expected = BY_PAGE[name]

    # --- 未知标签（通常意味着 $a<b$ 未转义） ---
    # ⚠️ 必须排除 <script>/<style> 内部：那里的 `<` 是 JS 运算符（如 i < n），
    # 不是 HTML 标签，也不做实体解析（写成 &lt; 反而会让 JS 语法报错）。
    # 2026-09-18 修：此前未排除，导致页面里加了比较运算的脚本后被误报。
    _scan = re.sub(r"<script\b.*?</script>", "", html, flags=re.S)
    _scan = re.sub(r"<style\b.*?</style>", "", _scan, flags=re.S)
    for m in TAG_RE.finditer(_scan):
        tag = m.group(2).lower()
        if tag not in ALLOWED_TAGS:
            line = html[: m.start()].count("\n") + 1
            issues.append(f"[{rel}:{line}] 可疑标签 <{tag}> —— 多半是数学里的 < > 没写成 &lt; &gt;")

    # --- $ 配对：只看两层标签之间的纯文本节点 ---
    text_only = re.sub(r"<[^>]*>", "\x00", html)
    text_only = re.sub(r"<script.*?</script>", "", text_only, flags=re.S)
    chunks = [c for c in text_only.split("\x00") if "$" in c]
    odd = [c for c in chunks if (c.count("$") - 2 * c.count("$$")) % 2 != 0]
    if odd:
        issues.append(f"[{rel}] 有 {len(odd)} 处文本节点的 $ 数量为奇数，可能有公式未闭合"
                      f"（例：{odd[0].strip()[:50]}）")

    # --- body 属性 ---
    if name in BY_PAGE:
        want_num = BY_PAGE[name][0]
        m = re.search(r'<body[^>]*data-page="([^"]*)"', html)
        if not m or m.group(1) != name:
            issues.append(f"[{rel}] body data-page 应为 {name}，实际 {m.group(1) if m else '缺失'}")
        m = re.search(r'<body[^>]*data-chapter="([^"]*)"', html)
        if not m or m.group(1) != want_num:
            issues.append(f"[{rel}] body data-chapter 应为 {want_num}，实际 {m.group(1) if m else '缺失'}")

    # --- quiz id 唯一性 + 每份测验必须有讲评 ---
    for m in re.finditer(r'<div class="quiz"[^>]*data-quiz-id="([^"]+)"', html):
        qid = m.group(1)
        quiz_ids[qid].append(rel)
        block = html[m.start(): find_div_end(html, m.start())]
        if 'q-review' not in block:
            line = html[: m.start()].count("\n") + 1
            issues.append(f"[{rel}:{line}] 测验 {qid} 缺少讲评（.q-review）")
        else:
            stats["reviews"] += 1

    # --- 每道题 ---
    for m in Q_RE.finditer(html):
        stats["quiz_questions"] += 1
        check_question(html, m, rel, issues, stats)

    # --- 小节结构 ---
    if expected is not None:
        secs = split_sections(html)
        ids = [s[0] for s in secs]
        absent = [w for w in expected if w not in ids]
        # 已建小节在「规定顺序」里的最靠后位置；字符串比较对 s1-9 / s1-10 会出错，
        # 所以一律按 expected 列表里的下标比。
        done_idx = [expected.index(i) for i in ids if i in expected]
        frontier = max(done_idx) if done_idx else -1
        for want in absent:
            if expected.index(want) > frontier:
                pending.append(f"{rel} → {want}")
            else:
                issues.append(f"[{rel}] 缺少规定的小节 id: {want}（夹在已建小节之间，"
                              f"不是「还没写到」，请检查 id 是否拼错）")
        ordered = [s[0] for s in secs if s[0] in expected]
        if ordered != [i for i in expected if i in ordered]:
            issues.append(f"[{rel}] 小节顺序与 site.js 的 COURSE 不一致："
                          f"{ordered} ≠ {[i for i in expected if i in ordered]}")
        for sid, title, attrs, block in secs:
            if sid not in expected:
                continue
            check_section(sid, title, attrs, block, rel, expected, issues, stats)


def main():
    issues, quiz_ids = [], defaultdict(list)
    stats = Counter()
    missing, pending = [], []

    pages = []
    for n, f, title, ids in COURSE:
        pages.append((os.path.splitext(os.path.basename(f))[0], os.path.join(SITE, f)))
    for name in ["index", "exam", "cheatsheet"]:
        pages.append((name, os.path.join(SITE, f"{name}.html")))

    for name, p in pages:
        if not os.path.exists(p):
            if name in BY_PAGE:
                missing.append(f"{PAGE_PATH[name]}（第 {BY_PAGE[name][0]} 章，"
                               f"{len(BY_PAGE[name][1])} 节）")
            continue
        check_file(name, p, issues, quiz_ids, stats, pending)

    for qid, files in quiz_ids.items():
        if len(files) > 1:
            issues.append(f"测验 id 重复：{qid} 出现在 {', '.join(files)}")

    lv1, lv2, lv3 = stats["lv_基础"], stats["lv_中等"], stats["lv_考研"]
    tot = lv1 + lv2 + lv3
    pct = lambda n: f"{round(n / tot * 100)}%" if tot else "—"

    print("=" * 72)
    print(f"小节 {stats['sections']} · 例题 {stats['examples']} · 测验卷 {len(quiz_ids)}"
          f" · 测验题 {stats['quiz_questions']} · 讲评 {stats['reviews']}")
    print(f"难度分布  基础 {lv1} ({pct(lv1)}) · 中等 {lv2} ({pct(lv2)}) · 考研 {lv3} ({pct(lv3)})")
    print(f"双语     概念/方法块 {stats['bi_boxes']} 个 · 对照段 {stats['bi_pairs']} 条"
          f" · 英文题干 {stats['stem_en']} 条 · 英文解析 {stats['explain_en']} 条"
          f" · 视频登记 {stats['videos']} 条")
    print("=" * 72)

    if missing:
        print(f"未建章节 {len(missing)} 个（第 1 期完成后应为 0）：")
        for x in missing:
            print("  ·", x)
        print()
    if pending:
        print(f"待建小节 {len(pending)} 个（已建小节之后的部分，分批施工的正常状态）：")
        for x in pending:
            print("  ·", x)
        print()

    if not issues:
        print("✓ 已建内容全部检查通过")
    else:
        print(f"发现 {len(issues)} 个问题：\n")
        for i in issues:
            print("  •", i)
    # 「未建章节」与「待建小节」只作提示，不算失败——
    # 全站 12 章要分批施工，把它们当失败会让校验长期红灯（2026-09-17 修正）。
    # 只有真正的内容问题（issues）才返回非零。
    return 1 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
