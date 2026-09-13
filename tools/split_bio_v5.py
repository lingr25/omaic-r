# -*- coding: utf-8 -*-
"""
Split 《陈阅增普通生物学（第5版）》 into 41 chapter PDFs according to verified chapter boundaries.
"""
import sys, os, shutil
sys.stdout.reconfigure(encoding='utf-8')
import pymupdf

SRC_PDF = r'D:\Desktop\maic\陈阅增普通生物学（第5版） (主编：赵进东) (z-library.sk, 1lib.sk, z-lib.sk).pdf'
OUT_DIR = r'D:\Desktop\maic\books\陈阅增普通生物学'

# Chapter ranges: (ch_num, chapter_title, start_idx_0_based, end_idx_0_based_exclusive)
CHAPTER_RANGES = [
    (1, '1 绪论：生物界与生物学', 13, 22),
    (2, '2 生命的化学基础', 22, 43),
    (3, '3 细胞结构与物质交换和信息传递', 43, 79),
    (4, '4 细胞代谢', 79, 103),
    (5, '5 细胞分裂和细胞分化', 103, 122),
    (6, '6 性状传递的基本规律', 122, 141),
    (7, '7 基因与基因组', 141, 151),
    (8, '8 遗传物质的突变', 151, 161),
    (9, '9 性状的决定与形成——从基因型到表型', 161, 185),
    (10, '10 DNA技术及生物信息学分析简介', 185, 202),
    (11, '11 演化理论与微演化', 202, 225),
    (12, '12 物种形成和灭绝', 225, 234),
    (13, '13 生命起源与宏演化', 234, 254),
    (14, '14 重构生命之树', 254, 259),
    (15, '15 原核生物多样性', 259, 277),
    (16, '16 病毒', 277, 289),
    (17, '17 真核生物起源与原生生物多样性', 289, 302),
    (18, '18 绿色植物多样性', 302, 313),
    (19, '19 真菌多样性', 313, 321),
    (20, '20 动物多样性', 321, 345),
    (21, '21 人类的演化', 345, 361),
    (22, '22 植物的结构和生殖', 361, 381),
    (23, '23 植物营养', 381, 391),
    (24, '24 植物的调控系统', 391, 402),
    (25, '25 脊椎动物的结构与功能', 402, 413),
    (26, '26 营养与消化', 413, 423),
    (27, '27 血液与循环', 423, 434),
    (28, '28 气体交换与呼吸', 434, 440),
    (29, '29 渗透调节与排泄', 440, 447),
    (30, '30 免疫系统与免疫功能', 447, 459),
    (31, '31 激素与内分泌系统', 459, 467),
    (32, '32 生殖与胚胎发育', 467, 480),
    (33, '33 神经系统与神经调节', 480, 493),
    (34, '34 感觉器官与感觉', 493, 502),
    (35, '35 动物的运动', 502, 511),
    (36, '36 动物的行为', 511, 531),
    (37, '37 生物与环境', 531, 539),
    (38, '38 种群的结构、动态与数量调节', 539, 549),
    (39, '39 群落的结构、类型及演替', 549, 560),
    (40, '40 生态系统及其功能', 560, 575),
    (41, '41 生物多样性与保护生物学', 575, 585),
]

def main():
    print(f'Opening source PDF: {SRC_PDF}')
    src_doc = pymupdf.open(SRC_PDF)
    print(f'Total pages in source: {len(src_doc)}')

    os.makedirs(OUT_DIR, exist_ok=True)
    for f in os.listdir(OUT_DIR):
        if f.endswith('.pdf') and f.startswith('ch'):
            os.remove(os.path.join(OUT_DIR, f))
    print(f'Cleaned old chapter files from {OUT_DIR}')

    print(f'Starting extraction of {len(CHAPTER_RANGES)} chapters...')
    extracted_files = []

    for ch_num, title, start_idx, end_idx in CHAPTER_RANGES:
        fname = f'ch{ch_num:02d}_{title}.pdf'
        out_path = os.path.join(OUT_DIR, fname)
        
        chapter_doc = pymupdf.open()
        chapter_doc.insert_pdf(src_doc, from_page=start_idx, to_page=end_idx - 1)
        chapter_doc.save(out_path, garbage=3, deflate=True)
        num_pages = len(chapter_doc)
        chapter_doc.close()
        
        file_size_mb = os.path.getsize(out_path) / (1024 * 1024)
        print(f'  [OK] ch{ch_num:02d}: {fname} | PDF pages {start_idx+1}-{end_idx} ({num_pages} pages, {file_size_mb:.2f} MB)')
        extracted_files.append((fname, num_pages, file_size_mb))

    src_doc.close()
    print(f'\nAll {len(extracted_files)} chapters extracted successfully!')

if __name__ == '__main__':
    main()
