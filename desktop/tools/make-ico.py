#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 1024×1024 PNG 生成真正的多尺寸 Windows ICO。
   ICO 格式简单，无需 Pillow/ImageMagick：
     0..5    ICONDIR：reserved=0, type=1, count=N
     每项 16 字节 ICONDIRENTRY：w,h,colors,reserved,planes,bpp,size,offset
     图像数据为**整段 PNG**（Vista+ 支持 PNG 压缩的 ICO 条目；32bpp 亦可）
   用法：python3 tools/make-ico.py <源PNG> <输出ICO>
"""
import os, struct, subprocess, sys, tempfile

SIZES = [16, 24, 32, 48, 64, 128, 256]

def main():
    src, dst = sys.argv[1], sys.argv[2]
    tmp = tempfile.mkdtemp(prefix='ico-')
    pngs = []
    for s in SIZES:
        out = os.path.join(tmp, 'i%d.png' % s)
        subprocess.run(['sips', '-z', str(s), str(s), src, '--out', out],
                       capture_output=True, check=True)
        pngs.append((s, out))
    entries, blobs = [], []
    offset = 6 + 16 * len(pngs)
    for s, p in pngs:
        data = open(p, 'rb').read()
        entries.append(struct.pack('<BBBBHHII',
            0 if s == 256 else s,      # 256 用 0 表示
            0 if s == 256 else s,
            0, 0, 1, 32, len(data), offset))
        blobs.append(data)
        offset += len(data)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<HHH', 0, 1, len(pngs)))
        for e in entries: f.write(e)
        for b in blobs: f.write(b)
    print('  ✓ %s  (%d 字节, %d 个尺寸: %s)'
          % (dst, os.path.getsize(dst), len(pngs), ', '.join('%d' % s for s, _ in pngs)))

if __name__ == '__main__':
    main()
