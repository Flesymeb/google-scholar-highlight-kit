import re

p = 'E:/AI/scholar-author-highlighter-zen/zen/src/popup/popup.html'
html = open(p, encoding='utf-8').read()

def grab(button_id):
    m = re.search(r'<button id="' + button_id + r'"[^>]*>(\s*<svg.*?</svg>)\s*</button>', html, re.S)
    assert m, button_id + ' svg not found'
    return m.group(1)

arxiv_svg = grab('arxiv-search-button')
gh_svg = grab('github-search-button')
hf_svg = grab('hf-search-button')
gh_repo_svg = grab('github-button')

new = '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Scholar Highlight Kit</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="search-row">
    <input id="search-input" class="search-input" type="text" placeholder="Search papers\u2026" autocomplete="off" autofocus>
    <button id="scholar-button" class="engine-btn primary" type="button" title="Search Google Scholar (Enter)">Scholar</button>
  </div>

  <div id="platform-row" class="platform-row" hidden>
    <span class="platform-hint">preprint \u00b7 code \u00b7 model</span>
    <button id="arxiv-search-button" class="icon-btn btn-arxiv" type="button" disabled title="No arXiv preprint found" aria-label="arXiv preprint">ARXIV_SVG</button>
    <button id="github-search-button" class="icon-btn btn-github" type="button" disabled title="No GitHub repository found" aria-label="GitHub code">GH_SVG</button>
    <button id="hf-search-button" class="icon-btn btn-hf" type="button" disabled title="No Hugging Face model found" aria-label="Hugging Face model">HF_SVG</button>
  </div>

  <div id="results" class="results" aria-live="polite"></div>

  <div class="foot-row">
    <img src="../../assets/icon128.png" alt="" class="logo" id="logo" title="Scholar Highlight Kit">
    <button id="github-button" class="github-icon-btn" type="button" aria-label="GitHub repository" title="GitHub repository">GHREPO_SVG</button>
  </div>

  <script src="popup.js"></script>
</body>
</html>
'''

new = new.replace('ARXIV_SVG', arxiv_svg).replace('GH_SVG', gh_svg).replace('HF_SVG', hf_svg).replace('GHREPO_SVG', gh_repo_svg)
open(p, 'w', encoding='utf-8', newline='\n').write(new)
print('rebuilt, size:', len(new))
