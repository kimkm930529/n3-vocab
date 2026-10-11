# N3 단어

JLPT N3 단어장(구글 시트)을 방향키로 넘겨 보고, 범위를 골라 테스트까지 할 수 있는 개인용 학습 앱.
HTML 파일 하나로 동작하고, macOS에서는 WKWebView 창 하나짜리 네이티브 `.app`으로 감싸서 쓴다.

## 기능
- **학습**: 표제어·히라가나·한글 발음·뜻·예문 카드. `←` `→` 이동, `Space` 뜻 가리기, `F` ★ 표시, `S` 섞기, `P` 일본어로 듣기(예문은 눌러서 듣기)
- **글자 크기**: 보통/크게/아주 크게 (`+` `−`). 긴 단어는 카드 폭에 맞게 자동으로 줄어든다
- **목록**: 범위 안 단어를 표로 보고 한자·히라가나·뜻·발음·번호로 검색(`/`), 정답률·기출 순 정렬. 줄을 누르면 그 목록 순서로 학습 카드로 이동
- **범위 설정**: 번호 범위(이전/다음 묶음 이동) / 주제(여러 개) / 학습상태(Pass·Good·Fail·Not Yet) / 다락원 day / 기출(기출만·2회 이상·최근 3년·기출 아님) / 표기(한자·가나) / ★만 / 오답 모음만 / 테스트 기록(안 본 단어·취약·발음만 틀림·뜻만 틀림·N일 이상 지남)
- **단어별 기록**: 테스트를 끝내면 단어마다 최근 10회의 발음·뜻 O/X와 날짜를 저장하고 카드 아래에 표시
- **불러오기**: 단어장 CSV를 끌어다 놓으면 목록 교체, 채점표 CSV를 넣으면 X·△ 단어를 오답 모음에 추가
- **테스트**: 출제 방향 6가지 — 단어→발음·뜻 쓰기, 뜻→단어 쓰기, 단어→뜻 고르기, 뜻→단어 고르기, 한자→읽기 고르기, 예문 빈칸→단어 고르기. 쓰기는 발음만·뜻만 묻기, 5개씩 한 화면에 놓고 `Tab`으로 넘기기를 고를 수 있고 자동 O/X 추정(수정 가능). 고르기는 `1`–`4` 키. 오답 모음 업데이트, 틀린 것만 재시험, 발음·뜻 쓰기는 `test_raw` 형식 CSV 내보내기
- **기록**: 날짜별로 학습 카드로 본 단어 수, 테스트 횟수·문항·정답을 쌓아 보여 주고 CSV로 내보내기. 맥 앱은 `~/Library/Application Support/N3Words/daily_log.csv`에도 자동 저장

★·오답 모음·테스트 기록·일별 기록·보던 위치·진행 중인 테스트는 localStorage에 저장된다 (맥 앱은 `~/Library/WebKit/local.kevin.n3words/`).

## 폴더
```
src/index.template.html   앱 본체 (단어 데이터 자리에 __DATA__)
data/words.csv            기본 단어장 (구글 시트 → 파일 → 다운로드 → CSV)
macos/                    .app 껍데기 (main.swift, Info.plist, 아이콘)
scripts/build.py          빌드 스크립트 (swiftc 필요: `xcode-select --install`)
scripts/migrate_from_chrome.py   예전 Chrome 창 버전의 데이터를 맥 앱으로 옮기기
results/                  테스트 원본 / 채점표 기록
```

## 빌드
```bash
python3 scripts/build.py
```
`dist/`에 `index.html`(브라우저로 바로 열기), `N3 단어.app`, `N3_단어_app.zip`이 생긴다.

## 설치 (macOS)
```bash
cp -R "dist/N3 단어.app" /Applications/
xattr -dr com.apple.quarantine "/Applications/N3 단어.app"   # 다운로드한 zip일 때만 필요
```
독에 자체 아이콘으로 뜨는 일반 맥 앱이고, 창 크기와 위치를 기억한다.

예전 Chrome 창 버전에서 쓰던 데이터는 `python3 scripts/migrate_from_chrome.py`를 실행한 뒤 앱을 다시 열면 넘어온다.

## 단어장 업데이트
1. 구글 시트 `N3단어장` 탭을 CSV로 내려받아 `data/words.csv`를 교체 (열: 번호·학습상태·주제·한자/표기·히라가나·한국어 뜻·예문·예문 한글뜻·한글 발음·학습 메모·다락원)
2. `python3 scripts/build.py` → 새 앱 설치
   (앱을 다시 만들지 않고, 실행 중인 앱에 CSV를 끌어다 놓아도 된다)

학습상태는 `1. Pass`처럼 적혀 있어도 Pass / Good / Fail / Not Yet 넷으로 맞춰 읽는다.
내장 단어장이 바뀐 새 빌드를 설치하면, 앱에 끌어다 놓았던 예전 CSV 대신 내장 단어장을 쓴다.
