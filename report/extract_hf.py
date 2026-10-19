import re

s = open('E:/AI/scholar-author-highlighter-zen/report/hf-color.js', encoding='utf-8').read()
pairs = re.findall(r'd:\s*"((?:[^"\\]|\\.)*)"\s*,\s*fill:\s*"([^"]+)"', s)
if not pairs:
    pairs = [(m.group(1), '') for m in re.finditer(r'd:\s*"((?:[^"\\]|\\.)*)"', s)]
print('pairs:', len(pairs))
svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
for d, fill in pairs:
    svg += '<path d="' + d + '"' + (' fill="' + fill + '"' if fill else ' fill="currentColor"') + '/>'
svg += '</svg>'
open('E:/AI/scholar-author-highlighter-zen/report/hf-solid.svg', 'w', encoding='utf-8').write(svg)
print('written hf-solid.svg', len(svg), 'chars; fills:', [p[1] for p in pairs])
