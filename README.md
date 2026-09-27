# N3 단어

JLPT N3 단어장(구글 시트)을 방향키로 넘겨 보고, 범위를 골라 테스트까지 할 수 있는 개인용 학습 앱.
HTML 파일 하나로 동작하고, macOS에서는 Chrome 앱 모드 창으로 띄우는 `.app`으로 감싸서 쓴다.

## 기능
- **학습**: 표제어·히라가나·한글 발음·뜻·예문 카드. `←` `→` 이동, `Space` 뜻 가리기, `F` ★ 표시, `S` 섞기
- **범위 설정**: 번호 범위 / 학습상태 / 주제 / ★만 / 오답 모음만
- **불러오기**: 단어장 CSV를 끌어다 놓으면 목록 교체, 채점표 CSV를 넣으면 X·△ 단어를 오답 모음에 추가
- **테스트**: 발음·뜻 입력 → 자동 O/X 추정(수정 가능) → `test_raw` 형식 CSV 내보내기, 오답 모음 업데이트, 틀린 것만 재시험

★·오답 모음·보던 위치·진행 중인 테스트는 브라우저 localStorage에 저장된다.

## 폴더
```
src/index.template.html   앱 본체 (단어 데이터 자리에 __DATA__)
data/words.csv            기본 단어장 (구글 시트 → 파일 → 다운로드 → CSV)
macos/                    .app 껍데기 (launcher 스크립트, Info.plist, 아이콘)
scripts/build.py          빌드 스크립트
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
실행하면 Chrome(없으면 Edge·Brave, 그것도 없으면 기본 브라우저)이 주소창 없는 창으로 뜬다.
Chrome 프로필과 데이터는 `~/Library/Application Support/N3Words/`에 따로 저장된다.
문제가 있으면 같은 폴더의 `launcher.log`를 확인.

## 단어장 업데이트
1. 구글 시트에서 CSV로 내려받아 `data/words.csv`를 교체
2. `python3 scripts/build.py` → 새 앱 설치
   (앱을 다시 만들지 않고, 실행 중인 앱에 CSV를 끌어다 놓아도 된다)
