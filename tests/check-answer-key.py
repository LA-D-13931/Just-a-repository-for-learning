#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""答案键自洽检查：解析里声明的答案必须与 data-correct 标记一致。

为什么需要它
------------
2026-10-09 用户报障：ch1 某题解析写「…故 a=f(0)=1。选 B。」，而选项上
`data-correct="true"` 却标在 A（$2$）——**解析与答案键互相矛盾**。
这类错误对读者最恶劣：他按解析算对了，界面却判他错。
全站近千道题，靠人眼逐题比对不可行，但机器可以。

检查规则（按解析的实际句式普查结果设计）
------------------------------------------
解析声明答案的主流句式（全站统计）：
    「X 对：…」          210 次   X 是正确项
    「X 错：…」          常见     X 是错误项
    「正确。」/「错误。」 112 次   判断题的结论
    「选 X。」            47 次    结论（注意「选 X 是…」是干扰项说明，必须排除）

判定：
    ① 若解析声明了「正确项集合」，它应与 data-correct 的集合相等；
    ② 若解析把某个被标为正确的项写成「X 错」，那是硬矛盾，必报；
    ③ 判断题把结论句（正确。/错误。）与 data-correct 的位置比对。

用法：
    python3 tests/check-answer-key.py            # 全站，只报问题
    python3 tests/check-answer-key.py ch1        # 只看某一章
退出码：0 = 一致；1 = 发现不一致。
"""
import re
import sys
import glob
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

LETTERS = 'ABCD'


def strip_html(s):
    s = re.sub(r'<[^>]+>', '', s)
    return s


def split_questions(html):
    """按 <div class="q" ...> 切块，返回 (行号, 块文本)。"""
    out = []
    starts = [m.start() for m in re.finditer(r'<div class="q"[\s>]', html)]
    starts.append(len(html))
    for a, b in zip(starts, starts[1:]):
        out.append((html[:a].count('\n') + 1, html[a:b]))
    return out


def marked(block):
    """返回 (data_type, [被标为正确的选项序号], [全部选项序号], [选项文本])

    选项文本也要返回：判断题的选项顺序**不固定**（实测全站 118 题是「正/错」、
    22 题是「错/正」），按序号硬编码会把这 22 题全部误判，
    必须按文本（含「正确」还是「错误」）来定位该选哪一项。
    """
    t = re.search(r'data-type="([^"]*)"', block)
    t = t.group(1) if t else ''
    opts = re.findall(r'<li([^>]*)>(.*?)</li>', block, re.S)
    correct, allidx, texts = [], [], []
    for i, (attrs, body) in enumerate(opts):
        allidx.append(i)
        texts.append(strip_html(re.search(r'<span class="opt-body">(.*?)</span>', body, re.S).group(1)
                                if 'opt-body' in body else body).strip())
        if 'data-correct="true"' in attrs:
            correct.append(i)
    return t, correct, allidx, texts


def claims(block):
    """从解析里抽出「声明为正确」与「声明为错误」的字母集合。"""
    m = re.search(r'<div class="q-explain">([\s\S]*?)</div>\s*</div>', block)
    if not m:
        m = re.search(r'<div class="q-explain">([\s\S]*)', block)
    if not m:
        return set(), set(), None, None
    ex = strip_html(m.group(1))

    right, wrong = set(), set()

    # ① 字母组 + 对/错/正确/错误，例如
    #       「A 对：…」「D 错：…」「A、B、C 正确。」「B、D 错误。」
    #    判定为"结论"的充要条件：字母组与 对/错 之后紧跟标点或空白。
    #    这一条同时排除两类实测假阳性：
    #       ch1:2805「D 对应的极限是…」（对→应）
    #       la4:1247「D 对非零向量组显然荒谬」（对→非，是「就…而言」）
    for mm in re.finditer(r'([A-D](?:\s*[、,，]\s*[A-D])*)\s*(对|错|正确|错误)(?=[：:。，,；;、\s])', ex):
        tgt = right if mm.group(2) in ('对', '正确') else wrong
        for L in re.findall(r'[A-D]', mm.group(1)):
            tgt.add(L)

    # ② 结论句「选 X、Y。」——字母后紧跟句读；「选 X 是…」是干扰项说明，排除
    for mm in re.finditer(r'选\s*([A-D](?:\s*[、,，]\s*[A-D])*)\s*[。；]', ex):
        for L in re.findall(r'[A-D]', mm.group(1)):
            right.add(L)

    # 判断题结论
    judge = None
    mm = re.search(r'^\s*(正确|错误)[。：]', ex.strip())
    if mm:
        judge = (mm.group(1) == '正确')

    return right, wrong, judge, ex


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    files = sorted(glob.glob(os.path.join(ROOT, 'chapters', '*.html'))) + \
            sorted(glob.glob(os.path.join(ROOT, '*.html')))
    bad = 0
    checked = 0
    for f in files:
        rel = os.path.relpath(f, ROOT)
        if only and only not in rel:
            continue
        html = open(f, encoding='utf-8').read()
        for line, block in split_questions(html):
            t, correct, allidx, texts = marked(block)
            if not allidx:
                continue                      # 填空题没有选项
            checked += 1
            right, wrong, judge, ex = claims(block)
            msgs = []

            # ③ 判断题：按**选项文本**定位该选哪一项，不能按序号
            if t == 'judge' and judge is not None:
                want_text = '正确' if judge else '错误'
                hit = [i for i, tx in enumerate(texts) if want_text in tx]
                if hit and correct != hit:
                    msgs.append('判断题解析结论是「%s」，答案键却标在「%s」'
                                % (want_text,
                                   texts[correct[0]] if correct else '（无）'))
            else:
                # ② 硬矛盾：被标正确的项，解析说它错
                for i in correct:
                    if i < len(LETTERS) and LETTERS[i] in wrong:
                        msgs.append('解析说 %s 错，答案键却标 %s 正确' % (LETTERS[i], LETTERS[i]))
                # ① 解析声明的正确集合 ≠ 答案键集合
                if right:
                    marked_set = {LETTERS[i] for i in correct if i < len(LETTERS)}
                    if marked_set != right:
                        msgs.append('解析声明正确项 {%s}，答案键标 {%s}'
                                    % (','.join(sorted(right)), ','.join(sorted(marked_set)) or '无'))
            if msgs:
                bad += 1
                for msg in msgs:
                    print('  ✗ [%s:%d] %s' % (rel, line, msg))
    print('')
    print('  已检查 %d 道带选项的题，%d 道答案键与解析不一致' % (checked, bad))
    if bad:
        print('  ✗ 请逐题核对：以解析的数学推导为准修正 data-correct 的位置')
        return 1
    print('  ✓ 答案键与解析一致')

    fb = check_fill_blanks()
    if fb:
        print()
        print(f'  ✗ 有 {len(fb)} 道填空题的多空答案写不全（用户填对也会被判错）：')
        for x in fb:
            print('    ·', x)
        print('    修法：把全部空的答案写成一个完整分支，如 data-answer="0.02;0.0201;0.0001"')
        return 1
    print('  ✓ 填空题多空答案完整')
    return 0



# ---------------------------------------------------------------------------
# 填空题多空答案的完整性（2026-10-25 补）
#
# 判分器（quiz.js acceptedAnswers）是 raw.split('|') 后**整串比对**：
# 没有 data-blanks 时必须把全部空的答案写成一整串才算对。
# 踩过的坑：ch2 的「dy、Δy、|Δy-dy|」三空题，data-answer 只写了
#   0.02|0.02;0.0201|0.0201;0.0001|0.0001|1e-4
# 四个分支里没有一个是完整三空形式，用户填 "0.02;0.0201;0.0001"（完全正确）
# 却被判错。本检查要求：中文题干有 n≥2 个空时，至少有一个 | 分支能拆成 n 段
# （分隔符认 ; , 、 或空格）。
# ---------------------------------------------------------------------------
def check_fill_blanks():
    import glob as _glob, re as _re
    bad = []
    for f in sorted(_glob.glob(os.path.join(ROOT, 'chapters', '*.html'))) + \
             sorted(_glob.glob(os.path.join(ROOT, '*.html'))):
        s = open(f, encoding='utf-8').read()
        for m in _re.finditer(r'<div class="q" data-type="fill"([\s\S]*?)<div class="q-answer"([^>]*)>', s):
            body, attrs = m.group(1), m.group(2)
            if 'data-blanks' in attrs:      # 每空独立输入框，不适用整串比对
                continue
            am = _re.search(r'data-answer="([^"]*)"', attrs)
            if not am:
                continue
            zm = _re.search(r'<div class="q-stem">([\s\S]*?)</div>', body)
            if not zm:
                continue
            pm = _re.search(r'<p>(?!<p class="q-stem-en")[\s\S]*?</p>', zm.group(1))
            zh = pm.group(0) if pm else zm.group(1)
            nb = len(_re.findall(r'_{5,}', zh))
            if nb < 2:
                continue
            best = 0
            for part in am.group(1).split('|'):
                n = len([x for x in _re.split(r'[;,、]|\s+', part) if x])
                if n > best:
                    best = n
            if best < nb:
                line = s[:m.start()].count("\n") + 1
                bad.append("%s:%d 题干 %d 空，但 data-answer 最长分支只有 %d 段" %
                           (os.path.relpath(f, ROOT), line, nb, best))
    return bad


if __name__ == '__main__':
    sys.exit(main())
