import re

solid = open('E:/AI/scholar-author-highlighter-zen/report/hf-solid.svg', encoding='utf-8').read()
paths = re.findall(r'<path[^>]*/>', solid)
inner = ''.join(p.replace('fill="currentColor"', 'fill="#FFD21E"') for p in paths)
new_hf = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">' + inner + '</svg>'

p = 'E:/AI/scholar-author-highlighter-zen/zen/src/popup/popup.html'
html = open(p, encoding='utf-8').read()
pattern = re.compile(r'(<button id="hf-search-button"[^>]*>)\s*<svg.*?</svg>', re.S)
html2, n = pattern.subn(lambda m: m.group(1) + new_hf, html, count=1)
assert n == 1, 'hf button svg not found'
open(p, 'w', encoding='utf-8', newline='\n').write(html2)
print('hf svg replaced, paths:', len(paths))
