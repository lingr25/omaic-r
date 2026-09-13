# -*- coding: utf-8 -*-
"""Split scanned textbooks into chapter PDFs using their bookmark outlines."""
import re, sys, glob, os
from pypdf import PdfReader, PdfWriter

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

OUT_ROOT = r'D:\Desktop\maic\books'
ILLEGAL = re.compile(r'[\\/:*?"<>|]')
FRONT = re.compile(r'^(封面|书名|版权|前言|序|目录|内容简介|出版说明)')
TRAILING = re.compile(r'^(附录|索引|参考文献|后记|习题答案|部分习题)')
SECTION = re.compile(r'^\d+\.\d')                     # 1.1 这类小节
CHAPTER = re.compile(r'^(第[0-9一二三四五六七八九十百]+章|\d+\s+\S)')  # 第N章 / N 标题

def flatten(outlines, rows):
    for item in outlines:
        if isinstance(item, list):
            flatten(item, rows)
        else:
            try:
                rows.append((item.title.strip(), reader.get_destination_page_number(item)))
            except Exception:
                pass
    return rows

def clean(t):
    return ILLEGAL.sub('_', t).strip()[:40]

for f in glob.glob(r'D:\Desktop\maic\*.pdf'):
    book = f.split('\\')[-1]
    short = 'chem' if '化学' in book else 'bio'
    outdir = os.path.join(OUT_ROOT, '无机及分析化学' if short == 'chem' else '陈阅增普通生物学')
    os.makedirs(outdir, exist_ok=True)

    reader = PdfReader(f)
    npages = len(reader.pages)
    rows = flatten(reader.outline, [])

    chapters, end_at = [], npages
    for title, page in rows:
        if FRONT.match(title) or page is None:
            continue
        if TRAILING.match(title) and page > npages * 0.5:
            end_at = min(end_at, page)
            continue
        if SECTION.match(title):
            continue
        if CHAPTER.match(title) and 3 < page < npages - 3:
            if not chapters or page > chapters[-1][1]:  # 去重/防乱序
                chapters.append((title, page))

    print(f'\n=== {book[:40]} | {npages} pages | {len(chapters)} chapters | trailing cut at {end_at} ===')
    for i, (title, start) in enumerate(chapters):
        end = chapters[i + 1][1] if i + 1 < len(chapters) else end_at
        print(f'  ch{i+1:02d}  p{start+1}-{end} ({end-start}p)  {title}')
        writer = PdfWriter()
        for p in range(start, end):
            writer.add_page(reader.pages[p])
        path = os.path.join(outdir, f'ch{i+1:02d}_{clean(title)}.pdf')
        with open(path, 'wb') as fh:
            writer.write(fh)
    reader.close()
print('\nDONE')
