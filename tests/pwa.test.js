const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const path = require("node:path");
const {execFileSync} = require("node:child_process");

// 실제 빌드와 같은 SW/manifest를 검사하며 Swift 컴파일은 필요 없음.
const {SW, MANIFEST} = JSON.parse(execFileSync("python3", ["-c",
  "import json, runpy; d=runpy.run_path('scripts/build.py'); print(json.dumps({k:d[k] for k in ('SW','MANIFEST')}))"
], {cwd:path.join(__dirname, ".."), encoding:"utf8"}));

function worker({installFails = false} = {}){
  const handlers = {}, calls = {deleted:[], fetched:[], added:[], skipped:0, claimed:0};
  const cache = {
    addAll: async requests => { calls.added = requests; if(installFails) throw Error("offline"); },
    match: async key => ({cached:key}), put: async () => {}
  };
  vm.runInNewContext(SW.replace("__HASH__", "test"), {
    URL, Request:class { constructor(url, options){ this.url = url; Object.assign(this, options); } },
    location:{origin:"https://n3.example"},
    self:{registration:{scope:"https://n3.example/"},
      addEventListener:(name, handler) => { handlers[name] = handler; },
      skipWaiting:async () => { calls.skipped++; }, clients:{claim:async () => { calls.claimed++; }}},
    caches:{open:async () => cache, keys:async () => ["n3-old", "n3-test", "other-app"],
      delete:async key => { calls.deleted.push(key); }},
    fetch:async req => { calls.fetched.push(req); return {ok:true}; }
  });
  const lifecycle = name => {
    let work; handlers[name]({waitUntil:p => { work = p; }}); return work;
  };
  const request = (url, {method = "GET", mode = "cors"} = {}) => {
    let response;
    handlers.fetch({request:{url, method, mode}, respondWith:p => { response = p; }});
    return response;
  };
  return {calls, lifecycle, request};
}

test("PWA: 일정한 시작 주소와 범위로 홈 화면 앱 실행", () => {
  assert.equal(MANIFEST.display, "standalone");
  assert.equal(MANIFEST.id, MANIFEST.start_url);
  assert.equal(MANIFEST.scope, "./");
  assert.ok(MANIFEST.icons.some(i => i.sizes === "192x192"));
  assert.ok(MANIFEST.icons.some(i => i.sizes === "512x512"));
});

test("PWA: 로그인 세션으로 앱 파일을 저장한 뒤에만 새 버전을 활성화", async () => {
  const w = worker(); await w.lifecycle("install");
  assert.equal(w.calls.added.length, 6);
  assert.ok(w.calls.added.every(r => r.cache === "reload" && r.credentials === "same-origin"));
  assert.equal(w.calls.skipped, 1);
  const failed = worker({installFails:true});
  await assert.rejects(failed.lifecycle("install"));
  assert.equal(failed.calls.skipped, 0);
});

test("PWA: 캐시 교체는 이 앱의 예전 버전만 지움", async () => {
  const w = worker(); await w.lifecycle("activate");
  assert.deepEqual(w.calls.deleted, ["n3-old"]);
  assert.equal(w.calls.claimed, 1);
});

test("PWA: 오프라인 학습 화면은 캐시로 열고 인증·동기화 요청은 가로채지 않음", async () => {
  const w = worker();
  assert.deepEqual(await w.request("https://n3.example/?source=homescreen", {mode:"navigate"}), {cached:"index.html"});
  assert.equal((await w.request("https://n3.example/icon-192.png")).cached, "https://n3.example/icon-192.png");
  for(const url of ["https://n3.example/signin-with-chatgpt", "https://n3.example/callback?code=test", "https://script.google.com/macros/s/example/exec"]){
    assert.equal(w.request(url), undefined);
  }
  assert.equal(w.request("https://n3.example/", {method:"POST"}), undefined);
  assert.equal(w.calls.fetched.length, 0);
});
