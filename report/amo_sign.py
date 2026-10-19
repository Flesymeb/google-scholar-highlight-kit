import base64, time, hmac, hashlib, zipfile, io, os, json, urllib.request, urllib.error, shutil

KEY = "user:19838537:856"
SECRET = "3cf2f1310ca9300046e43697d09e6bde5fc6fe16f08b3ea563b6abdf521ca32a"
ADDON = "google-scholar-author-highlighter@dengyule-zen.local"
SRC = "E:/AI/scholar-author-highlighter-zen/zen"
OUT = "E:/AI/scholar-author-highlighter-zen/dist/google-scholar-highlight-kit-1.0.0-zen-SIGNED.xpi"


def jwt():
    header = base64.urlsafe_b64encode(b'{"typ":"JWT","alg":"HS256"}').rstrip(b'=')
    payload = ('{"iss":"%s","jti":"%s","iat":%d,"exp":%d}'
               % (KEY, KEY + ":" + str(int(time.time())), int(time.time()), int(time.time()) + 300))
    claim = base64.urlsafe_b64encode(payload.encode()).rstrip(b'=')
    sig = base64.urlsafe_b64encode(
        hmac.new(SECRET.encode(), header + b'.' + claim, hashlib.sha256).digest()).rstrip(b'=')
    return (header + b'.' + claim + b'.' + sig).decode()


def zip_source():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, _dirs, files in os.walk(SRC):
            for f in files:
                full = os.path.join(root, f)
                rel = os.path.relpath(full, SRC).replace('\\', '/')
                z.write(full, rel)
    return buf.getvalue()


def api(path, method='GET', body=None, headers=None):
    req = urllib.request.Request('https://addons.mozilla.org/api/v5' + path,
                                 method=method,
                                 data=body,
                                 headers=dict({'Authorization': 'JWT ' + jwt()}, **(headers or {})))
    return urllib.request.urlopen(req, timeout=60)


data = zip_source()
print('uploading', len(data), 'bytes...')
boundary = '----WebKitFormBoundary' + str(int(time.time()))
parts = []
parts.append(('--%s\r\nContent-Disposition: form-data; name="upload"; filename="extension.zip"\r\n'
              'Content-Type: application/zip\r\n\r\n' % boundary).encode())
parts.append(data)
parts.append(('\r\n--%s--\r\n' % boundary).encode())
body = b''.join(parts)

req = urllib.request.Request(
    'https://addons.mozilla.org/api/v5/addons/addon/%s/versions/1.0.0/' % urllib.parse.quote(ADDON, safe=''),
    method='PUT', data=body,
    headers={'Authorization': 'JWT ' + jwt(),
             'Content-Type': 'multipart/form-data; boundary=' + boundary})
try:
    resp = urllib.request.urlopen(req, timeout=120)
    detail = json.loads(resp.read().decode())
    print('upload accepted:', detail.get('guid'), detail.get('version'))
except urllib.error.HTTPError as e:
    print('upload HTTP', e.code, e.read()[:500])
    raise SystemExit(1)

# poll validation
for attempt in range(30):
    time.sleep(3)
    try:
        with api('/addons/addon/%s/versions/1.0.0/' % urllib.parse.quote(ADDON, safe='')) as r:
            v = json.loads(r.read().decode())
        f = v.get('file')
        if f and f.get('signed') and f.get('url'):
            print('signed:', f['url'])
            break
        validation = v.get('validation')
        if validation and not validation.get('valid', True):
            print('validation FAILED:', json.dumps(validation.get('messages', []))[:400])
            raise SystemExit(1)
        print('waiting...', attempt)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print('not ready (404), waiting...')
        else:
            raise
else:
    raise SystemExit('timed out waiting for signing')

with api('/addons/addon/%s/versions/1.0.0/downloads/default' % urllib.parse.quote(ADDON, safe='')) as r:
    dl = json.loads(r.read().decode())
file_url = dl.get('url') if isinstance(dl, dict) else None
file_url = file_url or f
req = urllib.request.Request(file_url)
req.set_proxy(None, 'http')
signed = urllib.request.urlopen(req, timeout=120).read()
open(OUT, 'wb').write(signed)
print('saved', OUT, len(signed), 'bytes')
