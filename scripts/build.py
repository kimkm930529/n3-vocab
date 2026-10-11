#!/usr/bin/env python3
"""data/words.csv → dist/index.html, dist/N3 단어.app, dist/N3_단어_app.zip

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
    html = (ROOT / "src" / "index.template.html").read_text(encoding="utf-8").replace("__VER__", hashlib.sha1(data.encode()).hexdigest()[:10]).replace("__DATA__", data)

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
    print(f"단어 {len(words)}개 → {DIST.relative_to(ROOT)}/ (index.html, {APP.name}, N3_단어_app.zip)")

if __name__ == "__main__":
    main()
