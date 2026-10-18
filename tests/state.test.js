// node --test tests/   (Node 18 이상)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {normStatus, stSheet, normState, mergeState, HIST_MAX} = require("../src/state.js");

test("학습상태 표기 맞추기", () => {
  assert.equal(normStatus("1. Pass"), "Pass");
  assert.equal(normStatus("3. fail"), "Fail");
  assert.equal(normStatus(""), "Not Yet");
  assert.equal(stSheet("Good"), "2. Good");
});

test("예전 형식(번호 배열)의 ★·오답을 읽음", () => {
  const s = normState({stars:[3, 5], wrong:[7]});
  assert.deepEqual(s.stars, {3:[1, 0], 5:[1, 0]});
  assert.deepEqual(s.wrong, {7:[1, 0]});
});

test("★: 나중에 바꾼 쪽을 따르고, 끈 것이 되살아나지 않음", () => {
  const a = {stars:{1:[1, 100], 2:[0, 300]}}, b = {stars:{1:[0, 200], 2:[1, 250], 3:[1, 10]}};
  const m = mergeState(a, b);
  assert.deepEqual(m.stars, {1:[0, 200], 2:[0, 300], 3:[1, 10]});
  assert.deepEqual(mergeState(b, a).stars, m.stars);   // 어느 쪽에서 합쳐도 같음
});

test("테스트 기록: 테스트ID로 합치고, 고친 시각이 나중인 값, 최근 10회만", () => {
  const a = {hist:{5:[[1000, "OX", 1000], [2000, "OO", 2000]]}};
  const b = {hist:{5:[[1000, "OO", 1500], [3000, "XX", 3000]]}};
  const m = mergeState(a, b);
  assert.deepEqual(m.hist[5], [[1000, "OO", 1500], [2000, "OO", 2000], [3000, "XX", 3000]]);
  const many = {hist:{9:Array.from({length:15}, (_, i) => [i + 1, "OO"])}};
  assert.equal(mergeState(many, {}).hist[9].length, HIST_MAX);
  assert.equal(mergeState(many, {}).hist[9][0][0], 6);
});

test("테스트 기록 지우기는 다른 기기의 예전 기록도 버림", () => {
  const phone = {hist:{5:[[1000, "OX"]], 6:[[5000, "OO", 5000]]}};
  const mac = {hist:{}, histClearedAt:2000};
  const m = mergeState(phone, mac);
  assert.equal(m.histClearedAt, 2000);
  assert.equal(m.hist[5], undefined);
  assert.deepEqual(m.hist[6], [[5000, "OO", 5000]]);
});

test("일별 기록: 본 단어는 합집합, 테스트는 나중에 고친 값", () => {
  const a = {days:{"2026-10-18":{s:[3, 1], t:{100:[10, 7, 100]}}}};
  const b = {days:{"2026-10-18":{s:[2, 3], t:{100:[10, 8, 200], 300:[5, 5, 300]}}, "2026-10-17":{s:[9], t:{}}}};
  const m = mergeState(a, b);
  assert.deepEqual(m.days["2026-10-18"], {s:[1, 2, 3], t:{100:[10, 8, 200], 300:[5, 5, 300]}});
  assert.deepEqual(m.days["2026-10-17"], {s:[9], t:{}});
});

test("학습상태: 나중 값, 같은 시각이면 시트 따르기(null)", () => {
  const a = {status:{1:{s:"Pass", at:100}, 2:{s:"Fail", at:100}}};
  const b = {status:{1:{s:null, at:100}, 2:{s:"Good", at:200}}};
  assert.deepEqual(mergeState(a, b).status, {1:{s:null, at:100}, 2:{s:"Good", at:200}});
  assert.deepEqual(mergeState(b, a).status, mergeState(a, b).status);
});

test("앱 스크립트가 문법 오류 없이 만들어짐", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "src/index.template.html"), "utf8")
    .replace("/*__STATE_JS__*/", fs.readFileSync(path.join(root, "src/state.js"), "utf8"))
    .replace("__DATA__", "[]").replace("__VER__", "test");
  const code = html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(code));
  const gs = fs.readFileSync(path.join(root, "src/state.js"), "utf8") + fs.readFileSync(path.join(root, "scripts/sync.gs"), "utf8");
  assert.doesNotThrow(() => new vm.Script(gs));
});
