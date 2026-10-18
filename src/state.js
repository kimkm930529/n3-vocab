/* 학습 기록 상태를 합치는 순수 함수들. 앱(index.html)과 Apps Script(sync.gs)에 똑같이 들어가고, tests/에서 node로 검사한다.

상태 모양 (v:1)
  stars, wrong   {번호: [1|0, 바꾼 시각 ms]}       끈 것도 남겨 두어야 다른 기기와 합칠 때 되살아나지 않음
  hist           {번호: [[테스트ID, "OX", 고친 시각], ...]}   테스트ID = 시작 시각 ms, 단어별 최근 10회
  histClearedAt  테스트 기록을 지운 시각. 이때까지의 기록은 합칠 때 버림
  days           {"YYYY-MM-DD": {s:[학습 카드로 본 번호], t:{테스트ID: [문항, 정답, 고친 시각]}}}
  status         {번호: {s:"Pass"|"Good"|"Fail"|"Not Yet"|null, at}}   null은 시트 값을 따름
*/
const STATUSES = ["Pass","Good","Fail","Not Yet"];
const normStatus = s => /pass/i.test(s) ? "Pass" : /good/i.test(s) ? "Good" : /fail/i.test(s) ? "Fail" : "Not Yet";   // "1. Pass" → "Pass"
const stSheet = s => `${STATUSES.indexOf(s) + 1}. ${s}`;   // "Pass" → "1. Pass" (시트 표기)
const HIST_MAX = 10;

function emptyState(){ return {v:1, stars:{}, wrong:{}, hist:{}, histClearedAt:0, days:{}, status:{}}; }

// 예전 형식(★·오답이 번호 배열, 기록에 고친 시각 없음)도 받아서 v1 모양으로 맞춤
function normState(x){
  const o = emptyState(); if(!x) return o;
  const flags = v => Array.isArray(v) ? Object.fromEntries(v.map(n => [n, [1, 0]])) : Object.assign({}, v);
  o.stars = flags(x.stars || {}); o.wrong = flags(x.wrong || {});
  o.hist = x.hist || {}; o.histClearedAt = x.histClearedAt || 0;
  o.days = x.days || {}; o.status = x.status || {};
  return o;
}

const editedAt = e => e[2] || e[0];   // 기록 한 줄을 마지막으로 고친 시각 (예전 기록은 테스트ID)
// 같은 항목이면 나중에 고친 쪽. 시각이 같으면 어느 기기에서 합쳐도 같은 결과가 나오게 정해진 쪽을 고름
function pickFlag(a, b){ return !a ? b : !b ? a : b[1] > a[1] || (b[1] === a[1] && b[0] > a[0]) ? b : a; }
function pickHist(a, b){ return !a ? b : !b ? a : editedAt(b) > editedAt(a) || (editedAt(b) === editedAt(a) && b[1] > a[1]) ? b : a; }
function pickTest(a, b){ return !a ? b : !b ? a : (b[2] || 0) > (a[2] || 0) || ((b[2] || 0) === (a[2] || 0) && b[1] > a[1]) ? b : a; }
// 시트 값 따르기(null)와 바꾼 값이 같은 시각이면 null: 시트가 그 값으로 따라온 뒤 정리한 것이므로
function pickStatus(a, b){ return !a ? b : !b ? a : b.at > a.at || (b.at === a.at && (b.s === null || (a.s !== null && b.s > a.s))) ? b : a; }

function mergeMap(a, b, pick){
  const o = {};
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => o[k] = pick(a[k], b[k]));
  return o;
}

function mergeState(x, y){
  const a = normState(x), b = normState(y), o = emptyState();
  o.stars = mergeMap(a.stars, b.stars, pickFlag);
  o.wrong = mergeMap(a.wrong, b.wrong, pickFlag);
  o.status = mergeMap(a.status, b.status, pickStatus);
  o.histClearedAt = Math.max(a.histClearedAt, b.histClearedAt);
  new Set([...Object.keys(a.hist), ...Object.keys(b.hist)]).forEach(n => {
    const byId = {};
    [...(a.hist[n] || []), ...(b.hist[n] || [])].forEach(e => byId[e[0]] = pickHist(byId[e[0]], e));
    const h = Object.values(byId).filter(e => Math.max(e[0], editedAt(e)) > o.histClearedAt).sort((p, q) => p[0] - q[0]).slice(-HIST_MAX);
    if(h.length) o.hist[n] = h;
  });
  new Set([...Object.keys(a.days), ...Object.keys(b.days)]).forEach(k => {
    const p = a.days[k] || {}, q = b.days[k] || {};
    o.days[k] = {s:[...new Set([...(p.s || []), ...(q.s || [])])].sort((m, n) => m - n), t:mergeMap(p.t || {}, q.t || {}, pickTest)};
  });
  return o;
}

if(typeof module !== "undefined") module.exports = {STATUSES, normStatus, stSheet, HIST_MAX, emptyState, normState, mergeState};
