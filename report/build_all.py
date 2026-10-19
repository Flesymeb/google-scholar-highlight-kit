import json, os, shutil, zipfile

ROOT = 'E:/AI/scholar-author-highlighter-zen'
SRC = ROOT + '/zen'
DIST = ROOT + '/dist'
RELEASE = ROOT + '/release'

# 1) Chrome variant: copy zen/, patch manifest for Chromium
chrome_dir = ROOT + '/build/chrome'
if os.path.exists(os.path.dirname(chrome_dir)):
    shutil.rmtree(ROOT + '/build', ignore_errors=True)
os.makedirs(chrome_dir)
for root, dirs, files in os.walk(SRC):
    rel = os.path.relpath(root, SRC)
    dest = os.path.join(chrome_dir, rel) if rel != '.' else chrome_dir
    os.makedirs(dest, exist_ok=True)
    for f in files:
        shutil.copy2(os.path.join(root, f), os.path.join(dest, f))

mpath = os.path.join(chrome_dir, 'manifest.json')
m = json.load(open(mpath, encoding='utf-8'))
m['background'] = {'service_worker': 'src/background/background.js'}
m.pop('browser_specific_settings', None)
open(mpath, 'w', encoding='utf-8', newline='\n').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print('chrome manifest patched:', m['version'])

# 2) package three artifacts
os.makedirs(RELEASE, exist_ok=True)

def zipdir(src, out):
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, _dirs, files in os.walk(src):
            for f in files:
                full = os.path.join(root, f)
                z.write(full, os.path.relpath(full, src).replace('\\', '/'))
    return out

chrome_zip = zipdir(chrome_dir, RELEASE + '/scholar-highlight-kit-1.0.0-chrome.zip')

# firefox/zen: unsigned package of the same source (web-ext build output may also exist)
ff_zip = zipdir(SRC, RELEASE + '/scholar-highlight-kit-1.0.0-firefox-zen.zip')
shutil.copyfile(ff_zip, RELEASE + '/scholar-highlight-kit-1.0.0-firefox-zen.xpi')

# copy the signed firefox/zen xpi if it exists (not the case right now)
signed = DIST + '/google-scholar-highlight-kit-1.0.0-zen-SIGNED.xpi'
if os.path.exists(signed):
    shutil.copyfile(signed, RELEASE + '/scholar-highlight-kit-1.0.0-zen-signed.xpi')
    print('signed xpi included')

for f in sorted(os.listdir(RELEASE)):
    print(f, os.path.getsize(os.path.join(RELEASE, f)), 'bytes')
