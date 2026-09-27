#!/usr/bin/env python3
"""data/words.csv → dist/index.html, dist/N3 단어.app, dist/N3_단어_app.zip

사용법:  python3 scripts/build.py
"""
import csv, json, os, shutil, stat, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
APP = DIST / "N3 단어.app"

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
        words.append(dict(n=int(d["번호"]), s=d.get("학습상태") or "Not Yet", t=d.get("주제", ""),
                          w=d["한자/표기"], k=d.get("히라가나", ""), m=d.get("한국어 뜻", ""),
                          e=d.get("예문", ""), ek=d.get("예문 한글뜻", ""), p=d.get("한글 발음", ""),
                          memo=d.get("학습 메모", "")))
    return sorted(words, key=lambda w: w["n"])

def main():
    words = load_words()
    data = json.dumps(words, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = (ROOT / "src" / "index.template.html").read_text(encoding="utf-8").replace("__DATA__", data)

    shutil.rmtree(DIST, ignore_errors=True)
    (APP / "Contents" / "MacOS").mkdir(parents=True)
    (APP / "Contents" / "Resources").mkdir(parents=True)
    (DIST / "index.html").write_text(html, encoding="utf-8")
    (APP / "Contents" / "Resources" / "index.html").write_text(html, encoding="utf-8")
    shutil.copy(ROOT / "macos" / "Info.plist", APP / "Contents" / "Info.plist")
    shutil.copy(ROOT / "macos" / "AppIcon.icns", APP / "Contents" / "Resources" / "AppIcon.icns")
    launcher = APP / "Contents" / "MacOS" / "launcher"
    shutil.copy(ROOT / "macos" / "launcher", launcher)
    launcher.chmod(launcher.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    subprocess.run(["zip", "-qry", "N3_단어_app.zip", APP.name], cwd=DIST, check=True)
    print(f"단어 {len(words)}개 → {DIST.relative_to(ROOT)}/ (index.html, {APP.name}, N3_단어_app.zip)")

if __name__ == "__main__":
    main()
