# -*- coding: utf-8 -*-
import re

with open(r'd:\Desktop\maic\books\陈阅增普通生物学\ch02_2 生命的化学基础.md', 'r', encoding='utf-8') as f:
    text = f.read()

chinese_chars = len(re.findall(r'[\u4e00-\u9fa5]', text))
english_words = len(re.findall(r'[a-zA-Z0-9_]+', text))
punctuation = len(re.findall(r'[，。、；：？！“”‘’（）《》—…·]', text))

print(f"Chinese characters count: {chinese_chars}")
print(f"English words / terms count: {english_words}")
print(f"Punctuation count: {punctuation}")
print(f"Chinese + English word count (standard): {chinese_chars + english_words}")
print(f"Total characters without spaces: {len(re.sub(r'\s+', '', text))}")

overview = re.search(r'## 章节概述\s*(.*?)\s*## 核心概念与定义', text, re.S).group(1).strip()
print(f"Overview Chinese characters: {len(re.findall(r'[\u4e00-\u9fa5]', overview))}")
print(f"Overview total characters without spaces: {len(re.sub(r'\s+', '', overview))}")
