#!/usr/bin/env python3
"""예전 Chrome 창 버전의 데이터(★·오답·기록·불러온 단어장)를 맥 앱으로 옮긴다.

Chrome 프로필의 localStorage 사본을 headless Chrome으로 읽어
~/Library/Application Support/N3Words/migrate.json 에 쓰고, 앱이 다음 실행 때 한 번 가져간다.
다시 실행하면 그 시점의 Chrome 쪽 데이터로 앱 데이터를 덮어쓴다.

사용법:  python3 scripts/migrate_from_chrome.py
"""
import base64, json, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

DATA = Path.home() / "Library" / "Application Support" / "N3Words"
SRC = DATA / "profile" / "Default" / "Local Storage"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PAGE = """<!doctype html><meta charset="utf-8"><pre id="o"></pre><script>
const d = {}; for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if(k.startsWith("n3v2_")) d[k] = localStorage.getItem(k); }
document.getElementById("o").textContent = "BEGIN" + btoa(unescape(encodeURIComponent(JSON.stringify(d)))) + "END";
</script>"""

def main():
    if not SRC.is_dir():
        sys.exit(f"Chrome 창 버전의 데이터가 없어요: {SRC}")
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        # 실행 중인 창을 건드리지 않도록 사본에서 읽음 (file:// 페이지는 localStorage를 함께 씀)
        shutil.copytree(SRC, tmp / "prof" / "Default" / "Local Storage", ignore=shutil.ignore_patterns("LOCK"))
        (tmp / "dump.html").write_text(PAGE, encoding="utf-8")
        out = tmp / "dom.txt"
        with open(out, "w") as f:
            proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--no-first-run",
                                     f"--user-data-dir={tmp / 'prof'}", "--dump-dom", f"file://{tmp / 'dump.html'}"],
                                    stdout=f, stderr=subprocess.DEVNULL)
            m = None
            for _ in range(60):      # headless Chrome이 스스로 끝나지 않을 때가 있어 결과가 나오면 종료시킴
                time.sleep(0.5)
                m = re.search(r"BEGIN(.*?)END", out.read_text(errors="ignore"))
                if m or proc.poll() is not None:
                    break
            proc.terminate(); proc.wait(timeout=10)
            m = m or re.search(r"BEGIN(.*?)END", out.read_text(errors="ignore"))
        if not m:
            sys.exit("데이터를 읽지 못했어요")
        data = json.loads(base64.b64decode(m.group(1)).decode("utf-8"))
    (DATA / "migrate.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"{len(data)}개 항목을 옮길 준비가 됐어요 → 앱을 (다시) 실행하면 반영돼요")
    for k, v in data.items():
        print(f"  {k[5:]:8} {len(v):>7}자")

if __name__ == "__main__":
    main()
