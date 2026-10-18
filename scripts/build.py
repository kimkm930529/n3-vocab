#!/usr/bin/env python3
"""data/words.csv → dist/index.html, dist/N3 단어.app, dist/N3_단어_app.zip, dist/web/ (폰용 PWA), dist/sync.gs

사용법:  python3 scripts/build.py
"""
import csv, hashlib, json, re, shutil, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
APP = DIST / "N3 단어.app"

def norm_status(s):
    """시트의 "1. Pass" 같은 값을 Pass / Good / Fail / Not Yet 넷으로 맞춤"""
    for key, name in (("pass", "Pass"), ("good", "Good"), ("fail", "Fail")):
        if re.search(key, s, re.I):
            return name
    return "Not Yet"

def load_words():
    with open(ROOT / "data" / "words.csv", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    hi = next(i for i, r in enumerate(rows) if "번호" in [c.strip() for c in r])
    head = [c.strip() for c in rows[hi]]
    words = []
    for r in rows[hi + 1:]:
        d = dict(zip(head, [c.strip() for c in r]))
        if not d.get("번호", "").isdigit() or not d.get("한자/표기"):
            continue
        words.append(dict(n=int(d["번호"]), s=norm_status(d.get("학습상태", "")), t=d.get("주제", ""),
                          w=d["한자/표기"], k=d.get("히라가나", ""), m=d.get("한국어 뜻", ""),
                          e=d.get("예문", ""), ek=d.get("예문 한글뜻", ""), p=d.get("한글 발음", ""),
                          memo=d.get("학습 메모", ""), d=d.get("다락원", "")))
    return sorted(words, key=lambda w: w["n"])

def main():
    words = load_words()
    data = json.dumps(words, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    state_js = (ROOT / "src" / "state.js").read_text(encoding="utf-8")
    html = (ROOT / "src" / "index.template.html").read_text(encoding="utf-8").replace("/*__STATE_JS__*/", state_js) \
        .replace("__VER__", hashlib.sha1(data.encode()).hexdigest()[:10]).replace("__DATA__", data)

    shutil.rmtree(DIST, ignore_errors=True)
    (APP / "Contents" / "MacOS").mkdir(parents=True)
    (APP / "Contents" / "Resources").mkdir(parents=True)
    (DIST / "index.html").write_text(html, encoding="utf-8")
    (APP / "Contents" / "Resources" / "index.html").write_text(html, encoding="utf-8")
    shutil.copy(ROOT / "macos" / "Info.plist", APP / "Contents" / "Info.plist")
    shutil.copy(ROOT / "macos" / "AppIcon.icns", APP / "Contents" / "Resources" / "AppIcon.icns")
    # WKWebView 창 하나짜리 네이티브 앱으로 컴파일 (Xcode 명령어 도구의 swiftc 필요)
    subprocess.run(["swiftc", "-O", "-swift-version", "5", str(ROOT / "macos" / "main.swift"),
                    "-o", str(APP / "Contents" / "MacOS" / "N3Words")], check=True)
    subprocess.run(["codesign", "--force", "--sign", "-", str(APP)], check=True)
    subprocess.run(["zip", "-qry", "N3_단어_app.zip", APP.name], cwd=DIST, check=True)
    build_web(html)
    # 구글 시트에 붙일 Apps Script: 합치는 규칙(state.js)을 앱과 똑같이 씀
    (DIST / "sync.gs").write_text(state_js + "\n" + (ROOT / "scripts" / "sync.gs").read_text(encoding="utf-8"), encoding="utf-8")
    print(f"단어 {len(words)}개 → {DIST.relative_to(ROOT)}/ (index.html, {APP.name}, N3_단어_app.zip, web/, sync.gs)")

MANIFEST = {
    "name": "N3 단어", "short_name": "N3 단어", "lang": "ko", "start_url": "./", "scope": "./", "display": "standalone",
    "background_color": "#f3f4f6", "theme_color": "#f3f4f6",
    "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
              {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"}],
}
# 처음 열 때 앱 파일을 담아 두고 오프라인에서도 열리게 함. 앱이 바뀌면 CACHE 이름이 바뀌어 새로 받음
SW = """const CACHE = "n3-__HASH__";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if(req.method !== "GET") return;   // 동기화(POST)는 그대로 보냄
  if(url.origin === location.origin){
    e.respondWith(caches.match(req.mode === "navigate" ? "index.html" : req).then(r => r || fetch(req)));
  } else if(/fonts\\.(googleapis|gstatic)\\.com$/.test(url.hostname)){
    // 글꼴은 받은 것을 쓰고 뒤에서 새로 받아 둠
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(r => { if(r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
});
"""

def build_web(html):
    """dist/web/: 정적 호스팅(Cloudflare Pages·Netlify 등)에 그대로 올리는 폰용 PWA"""
    web = DIST / "web"
    web.mkdir(parents=True)
    (web / "index.html").write_text(html, encoding="utf-8")
    (web / "manifest.webmanifest").write_text(json.dumps(MANIFEST, ensure_ascii=False, indent=1), encoding="utf-8")
    (web / "sw.js").write_text(SW.replace("__HASH__", hashlib.sha1(html.encode()).hexdigest()[:10]), encoding="utf-8")
    for size in (180, 192, 512):
        subprocess.run(["sips", "-s", "format", "png", "-z", str(size), str(size), str(ROOT / "macos" / "AppIcon.icns"),
                        "--out", str(web / f"icon-{size}.png")], check=True, stdout=subprocess.DEVNULL)

if __name__ == "__main__":
    main()
