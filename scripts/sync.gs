/** @OnlyCurrentDoc */
// N3 단어 동기화 — 단어장 구글 시트에 붙이는 Apps Script 웹 앱.
// build.py가 src/state.js(합치는 규칙)를 앞에 붙여 dist/sync.gs로 만든다. 붙여 넣을 때는 dist/sync.gs를 쓴다.
//
// 하는 일 (앱이 POST로 {token, state, wordsVer}를 보낼 때마다)
//   1. 보관해 둔 학습 기록과 앱의 기록을 합친다 (mergeState)
//   2. 앱에서 바꾼 학습상태를 단어장 탭의 학습상태 열에 적고, 그 항목은 "시트 따르기"로 바꾼다
//   3. 합친 기록을 숨긴 탭에 저장하고, 단어장이 바뀌었으면 단어장 전체도 같이 돌려준다

const WORDS_SHEET = "N3단어장";   // 단어장 탭 이름 (없으면 첫 번째 탭)
const STATE_SHEET = "_n3sync";    // 학습 기록을 JSON으로 나눠 담는 숨긴 탭
const CHUNK = 40000;              // 한 칸에 50,000자까지 들어가서 그보다 작게 자름

// 처음 한 번 실행: 앱에 넣을 비밀 값을 만들어 실행 로그에 보여 줌
function setup(){
  const p = PropertiesService.getScriptProperties();
  let t = p.getProperty("TOKEN");
  if(!t){ t = Utilities.getUuid().replace(/-/g, ""); p.setProperty("TOKEN", t); }
  Logger.log("앱에 넣을 비밀 값: " + t);
}

function doGet(){ return ContentService.createTextOutput("N3 단어 동기화가 켜져 있어요"); }

function doPost(e){
  const out = x => ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);
  try{
    const req = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty("TOKEN");
    if(!token) return out({ok:false, error:"Apps Script에서 setup을 먼저 실행해 주세요"});
    if(req.token !== token) return out({ok:false, error:"비밀 값이 맞지 않아요"});
    const lock = LockService.getScriptLock(); lock.waitLock(20000);   // 두 기기가 동시에 보내도 하나씩
    try{
      const ss = SpreadsheetApp.getActive();
      const sheet = ss.getSheetByName(WORDS_SHEET) || ss.getSheets()[0];
      const state = mergeState(loadState(ss), req.state);
      const wrote = writeStatus(sheet, state);
      saveState(ss, state);
      const rows = sheet.getDataRange().getDisplayValues();
      const ver = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(rows), Utilities.Charset.UTF_8));
      return out({ok:true, state, wrote, wordsVer:ver, words: ver === req.wordsVer ? null : rows});
    } finally { lock.releaseLock(); }
  } catch(err){ return out({ok:false, error:String(err && err.message || err)}); }
}

// 바꾼 학습상태(s가 null이 아닌 것)를 "1. Pass" 표기로 학습상태 열에 적음. 적은(또는 이미 같던) 항목은 시트 따르기로 바꿈
function writeStatus(sheet, state){
  const values = sheet.getDataRange().getValues();
  const hi = values.findIndex(r => r.map(x => String(x).trim()).includes("번호"));
  if(hi < 0) return 0;
  const H = values[hi].map(x => String(x).trim()), cn = H.indexOf("번호"), cs = H.indexOf("학습상태");
  if(cs < 0) return 0;
  const rowOf = {};
  for(let i = hi + 1; i < values.length; i++) if(/^\d+$/.test(String(values[i][cn]).trim())) rowOf[+values[i][cn]] = i;
  const col = values.map(r => [r[cs]]);
  let wrote = 0;
  Object.keys(state.status).forEach(n => {
    const o = state.status[n], i = rowOf[n];
    if(!o || o.s === null || i == null) return;
    if(normStatus(String(col[i][0])) !== o.s){ col[i][0] = stSheet(o.s); wrote++; }
    state.status[n] = {s:null, at:o.at};
  });
  if(wrote) sheet.getRange(1, cs + 1, col.length, 1).setValues(col);
  return wrote;
}

function loadState(ss){
  const sh = ss.getSheetByName(STATE_SHEET);
  if(!sh || sh.getLastRow() < 1) return emptyState();
  const text = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => r[0]).join("");
  return text ? JSON.parse(text) : emptyState();
}

function saveState(ss, state){
  let sh = ss.getSheetByName(STATE_SHEET);
  if(!sh){ sh = ss.insertSheet(STATE_SHEET); sh.hideSheet(); }
  const text = JSON.stringify(state), parts = [];
  for(let i = 0; i < text.length; i += CHUNK) parts.push([text.slice(i, i + CHUNK)]);
  sh.clearContents();
  sh.getRange(1, 1, parts.length, 1).setNumberFormat("@");   // 조각이 숫자·날짜로 바뀌지 않게 글자 그대로
  sh.getRange(1, 1, parts.length, 1).setValues(parts);
}
