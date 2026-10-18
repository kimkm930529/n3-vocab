// N3 단어 — index.html을 WKWebView 창 하나로 띄우는 맥 앱 껍데기
import Cocoa
import WebKit

// 고정된 주소(n3words://app/)로 띄워야 localStorage(★·오답·기록)가 앱을 새로 깔아도 유지됨
let scheme = "n3words"
let dataDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("N3Words")
// AI 채점 폴더: 앱이 outbox에 채점용 CSV를 쓰고, inbox에 들어온 채점 CSV를 읽어 반영한 뒤 done으로 옮김
let gradeDir = dataDir.appendingPathComponent("grading")

final class AppDelegate: NSObject, NSApplicationDelegate, WKURLSchemeHandler, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!
    var inboxSeen = [String: Date]()   // 이미 페이지에 넘긴 inbox 파일(이름: 수정 시각). 못 읽은 파일을 매번 다시 알리지 않으려고
    var pageReady = false

    func applicationDidFinishLaunching(_ note: Notification) {
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(self, forURLScheme: scheme)
        cfg.userContentController.add(self, name: "n3save")
        cfg.userContentController.add(self, name: "n3log")
        cfg.userContentController.add(self, name: "n3grade")
        cfg.userContentController.add(self, name: "n3backup")
        if let js = migrationScript() {
            cfg.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        web = WKWebView(frame: .zero, configuration: cfg)
        web.uiDelegate = self

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 900, height: 780),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "N3 단어"
        window.minSize = NSSize(width: 380, height: 480)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("main")
        window.makeKeyAndOrderFront(nil)

        NSApp.mainMenu = makeMenu()
        NSApp.activate(ignoringOtherApps: true)
        web.load(URLRequest(url: URL(string: "\(scheme)://app/index.html")!))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationDidBecomeActive(_ note: Notification) { if pageReady { scanInbox() } }

    // MARK: AI 채점 폴더
    func gradeSub(_ name: String) -> URL {
        let dir = gradeDir.appendingPathComponent(name)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
    // inbox의 CSV를 페이지의 gradeInbox()에 넘김. 반영에 성공한 파일은 페이지가 done이라고 알려 오면 옮김
    func scanInbox() {
        let fm = FileManager.default
        let files = ((try? fm.contentsOfDirectory(at: gradeSub("inbox"), includingPropertiesForKeys: [.contentModificationDateKey])) ?? [])
            .filter { $0.pathExtension.lowercased() == "csv" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
        var list = [[String: String]]()
        for f in files {
            let name = f.lastPathComponent
            guard let date = (try? f.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate, inboxSeen[name] != date else { continue }
            inboxSeen[name] = date
            // 글자로 읽을 수 없는 파일도 빈 내용으로 넘겨, 페이지가 이름을 알려 주게 함
            list.append(["name": name, "text": (try? String(contentsOf: f, encoding: .utf8)) ?? ""])
        }
        guard !list.isEmpty, let data = try? JSONSerialization.data(withJSONObject: list), let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("gradeInbox(\(json))")
    }
    func handleGrade(_ body: [String: Any]) {
        let fm = FileManager.default
        let name = ((body["name"] as? String ?? "") as NSString).lastPathComponent
        switch body["op"] as? String {
        case "out":
            if let text = body["text"] as? String, !name.isEmpty { try? text.write(to: gradeSub("outbox").appendingPathComponent(name), atomically: true, encoding: .utf8) }
        case "scan":   // 페이지가 (다시) 떴을 때
            pageReady = true; inboxSeen = [:]; _ = gradeSub("outbox"); _ = gradeSub("done"); scanInbox()
        case "done":
            guard !name.isEmpty else { return }
            let to = gradeSub("done").appendingPathComponent(name)
            try? fm.removeItem(at: to)
            try? fm.moveItem(at: gradeSub("inbox").appendingPathComponent(name), to: to)
            inboxSeen[name] = nil
        case "open":
            _ = gradeSub("outbox"); _ = gradeSub("inbox"); _ = gradeSub("done")
            NSWorkspace.shared.open(gradeDir)
        default: break
        }
    }

    // 학습 기록 자동 백업: backups/n3words_<날짜>.json 하나를 그날 계속 덮어쓰고, 최근 14일 치만 남김
    func saveBackup(_ text: String, day: String) {
        guard day.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return }
        let fm = FileManager.default, dir = dataDir.appendingPathComponent("backups")
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        try? text.write(to: dir.appendingPathComponent("n3words_\(day).json"), atomically: true, encoding: .utf8)
        let old = ((try? fm.contentsOfDirectory(atPath: dir.path)) ?? []).filter { $0.hasPrefix("n3words_") && $0.hasSuffix(".json") }.sorted().dropLast(14)
        old.forEach { try? fm.removeItem(at: dir.appendingPathComponent($0)) }
    }

    // 예전 Chrome 창 버전의 데이터를 옮김 (scripts/migrate_from_chrome.py가 만든 N3Words/migrate.json).
    // 파일의 수정 시각을 표시로 남겨 같은 파일은 한 번만 적용함
    func migrationScript() -> String? {
        let file = dataDir.appendingPathComponent("migrate.json")
        guard let data = try? Data(contentsOf: file),
              (try? JSONSerialization.jsonObject(with: data)) is [String: String],
              let json = String(data: data, encoding: .utf8),
              let date = (try? FileManager.default.attributesOfItem(atPath: file.path))?[.modificationDate] as? Date else { return nil }
        let stamp = String(Int(date.timeIntervalSince1970))
        return "(function(){try{if(localStorage.getItem('n3v2_migrated')==='\(stamp)')return;var d=\(json);for(var k in d)localStorage.setItem(k,d[k]);localStorage.setItem('n3v2_migrated','\(stamp)');}catch(e){}})();"
    }

    // MARK: 페이지 제공
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let html = Bundle.main.url(forResource: "index", withExtension: "html").flatMap { try? Data(contentsOf: $0) } ?? Data()
        let resp = HTTPURLResponse(url: task.request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
                                   headerFields: ["Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"])!
        task.didReceive(resp); task.didReceive(html); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    // MARK: CSV 불러오기(파일 선택) / 내보내기(저장 창)
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { r in completionHandler(r == .OK ? panel.urls : nil) }
    }
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        if message.name == "n3grade" { handleGrade(body); return }
        guard let text = body["text"] as? String else { return }
        if message.name == "n3log" {   // 일별 학습 기록은 묻지 않고 정해진 자리에 덮어씀
            try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
            try? text.write(to: dataDir.appendingPathComponent("daily_log.csv"), atomically: true, encoding: .utf8)
            return
        }
        if message.name == "n3backup" { saveBackup(text, day: body["name"] as? String ?? ""); return }
        guard let name = body["name"] as? String else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        panel.beginSheetModal(for: window) { r in
            guard r == .OK, let url = panel.url else { return }
            let ok = (try? text.write(to: url, atomically: true, encoding: .utf8)) != nil
            self.web.evaluateJavaScript("toast(\(ok ? "'저장했어요'" : "'저장하지 못했어요'"))")
        }
    }

    // MARK: 메뉴
    func makeMenu() -> NSMenu {
        let main = NSMenu()
        func add(_ title: String, _ items: [NSMenuItem]) {
            let m = NSMenu(title: title); items.forEach { m.addItem($0) }
            let top = NSMenuItem(); top.submenu = m; main.addItem(top)
        }
        func item(_ title: String, _ action: Selector?, _ key: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key); i.keyEquivalentModifierMask = mods; return i
        }
        let reload = item("새로 고침", #selector(WKWebView.reload(_:)), "r"); reload.target = web
        add("N3 단어", [item("N3 단어 가리기", #selector(NSApplication.hide(_:)), "h"),
                       item("기타 가리기", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
                       .separator(), item("N3 단어 종료", #selector(NSApplication.terminate(_:)), "q")])
        add("편집", [item("실행 취소", Selector(("undo:")), "z"), item("실행 복귀", Selector(("redo:")), "z", [.command, .shift]), .separator(),
                    item("오려두기", #selector(NSText.cut(_:)), "x"), item("복사", #selector(NSText.copy(_:)), "c"),
                    item("붙여넣기", #selector(NSText.paste(_:)), "v"), item("전체 선택", #selector(NSText.selectAll(_:)), "a")])
        add("보기", [reload, item("전체 화면", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control])])
        add("윈도우", [item("최소화", #selector(NSWindow.performMiniaturize(_:)), "m"), item("닫기", #selector(NSWindow.performClose(_:)), "w")])
        return main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
