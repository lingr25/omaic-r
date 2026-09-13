# -*- coding: utf-8 -*-
import sys
from pypdf import PdfReader
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

pdf = r'D:\Desktop\maic\books\陈阅增普通生物学\ch02_2 生命的化学基础.pdf'
reader = PdfReader(pdf)
print(f'chapter pages: {len(reader.pages)}')
# 第1页(章首) 和 含表2-1/图2.1的页
for idx in [0, 1]:
    page = reader.pages[idx]
    imgs = page.images
    print(f'page {idx+1}: {len(imgs)} embedded images')
    for j, im in enumerate(imgs):
        out = rf'D:\Desktop\maic\books\_verify_p{idx+1}_{j}.png'
        with open(out, 'wb') as f:
            f.write(im.data)
        print('  saved', out)
