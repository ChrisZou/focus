// Native WebKit manifest and runtime checks for the compiled .appex (macOS 15.4+).
import Foundation
import WebKit
import AppKit

// Protocol models only: no NSWindow, Safari, UI events, or user profile.
@MainActor
final class TestTab: NSObject, WKWebExtensionTab, WKNavigationDelegate {
    var view: WKWebView
    var usesExtensionView = false
    let normalConfiguration: WKWebViewConfiguration
    init(_ configuration: WKWebViewConfiguration) {
        normalConfiguration = configuration
        view = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        view.navigationDelegate = self
    }
    func webView(for context: WKWebExtensionContext) -> WKWebView? { view }
    func url(for context: WKWebExtensionContext) -> URL? { view.url }
    func loadURL(_ url: URL, for context: WKWebExtensionContext, completionHandler: @escaping (Error?) -> Void) {
        // Like WebKit's TestWebExtensionTab, use an extension-aware view for an
        // extension main frame, and an ordinary view for HTTP. Reusing a plain
        // HTTP view for an extension page yields host error -1008 even with WAR.
        let isExtension = url.scheme == context.baseURL.scheme
        if isExtension != usesExtensionView {
            view = WKWebView(frame: .zero, configuration: isExtension ? context.webViewConfiguration! : normalConfiguration)
            view.navigationDelegate = self
            usesExtensionView = isExtension
        }
        view.load(URLRequest(url: url))
        completionHandler(nil)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("Test tab provisional navigation failed: \(error)")
    }
}

@MainActor
final class TestWindow: NSObject, WKWebExtensionWindow, WKWebExtensionControllerDelegate {
    var testTabs: [TestTab] = []
    func tabs(for context: WKWebExtensionContext) -> [any WKWebExtensionTab] { testTabs }
    func activeTab(for context: WKWebExtensionContext) -> (any WKWebExtensionTab)? { testTabs.first }
    func webExtensionController(_ controller: WKWebExtensionController, openWindowsFor context: WKWebExtensionContext) -> [any WKWebExtensionWindow] { [self] }
}

@MainActor
final class PageLoader: NSObject, WKNavigationDelegate {
    var continuation: CheckedContinuation<Void, Error>?

    func load(_ url: URL, in webView: WKWebView) async throws {
        webView.navigationDelegate = self
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            webView.load(URLRequest(url: url))
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        continuation?.resume()
        continuation = nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }
}

@main
struct ValidateManifest {
    @MainActor static var diagnosticView: WKWebView?
    @MainActor static func waitFor(_ tab: TestTab, _ predicate: (URL) -> Bool) async throws {
        for _ in 0..<100 {
            if let url = tab.view.url, predicate(url), !tab.view.isLoading { return }
            try await Task.sleep(for: .milliseconds(100))
        }
        if let diagnosticView {
            let diagnostic = try? await diagnosticView.callAsyncJavaScript("return JSON.stringify(await chrome.runtime.sendMessage({action: 'getNavigationDiagnostics'}));", contentWorld: .page)
            print("Navigation diagnostics: \(String(describing: diagnostic))")
        }
        fatalError("Navigation timed out: \(String(describing: tab.view.url))")
    }

    @MainActor static func main() async throws {
        setbuf(stdout, nil)
        guard CommandLine.arguments.count == 2,
              let bundle = Bundle(path: CommandLine.arguments[1]) else {
            fatalError("Usage: validate-manifest /path/to/Focus Extension.appex")
        }
        let webExtension = try await WKWebExtension(appExtensionBundle: bundle)
        precondition(webExtension.manifestVersion == 3)
        precondition(webExtension.hasBackgroundContent)
        precondition(!webExtension.hasPersistentBackgroundContent)
        precondition(webExtension.hasOptionsPage)
        precondition(webExtension.requestedPermissionMatchPatterns.count == 2)
        precondition(webExtension.errors.isEmpty, "\(webExtension.errors)")
        print("WebKit accepted bundled MV3 manifest, nonpersistent background, settings and website permissions.")

        // Isolated WebKit host, never the user's Safari storage or permissions.
        _ = NSApplication.shared
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
            fputs("WebKit runtime smoke test timed out\n", stderr)
            exit(1)
        }
        let controller = WKWebExtensionController(configuration: .nonPersistent())
        let testWindow = TestWindow()
        controller.delegate = testWindow
        let context = WKWebExtensionContext(for: webExtension)
        WKWebExtension.MatchPattern.registerCustomURLScheme("safari-web-extension")
        context.baseURL = URL(string: "safari-web-extension://focus-smoke-test/")!
        for permission in webExtension.requestedPermissions {
            context.setPermissionStatus(.grantedExplicitly, for: permission)
        }
        for pattern in webExtension.requestedPermissionMatchPatterns {
            context.setPermissionStatus(.grantedExplicitly, for: pattern)
        }
        try controller.load(context)
        guard let configuration = context.webViewConfiguration else { fatalError("Missing extension configuration") }
        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 900), configuration: configuration)
        diagnosticView = webView
        let loader = PageLoader()
        try await loader.load(context.baseURL.appendingPathComponent("popup.html"), in: webView)
        let result = try await webView.callAsyncJavaScript("""
            const response = await chrome.runtime.sendMessage({ action: 'getBlockedSites' });
            if (!response.success || !response.sites.some(site => site.domain === 'youtube.com')) throw new Error('Background messaging failed');
            await chrome.storage.session.set({ smoke: 42 });
            if ((await chrome.storage.session.get(['smoke'])).smoke !== 42) throw new Error('Session storage failed');
            await chrome.storage.local.set({ customMessage: '测试专注' });
            return chrome.runtime.getURL('confirm.html');
            """, contentWorld: .page)
        precondition(result as? String == "safari-web-extension://focus-smoke-test/confirm.html")
        for page in ["settings.html", "confirm.html", "redirect.html"] {
            try await loader.load(context.baseURL.appendingPathComponent(page), in: webView)
            let ready = try await webView.evaluateJavaScript("document.readyState === 'complete' && document.documentElement.lang === 'zh-CN'")
            precondition(ready as? Bool == true, "Failed to load \(page)")
        }
        // Optional loopback fixture exercises real WebKit navigation and tabs.update,
        // unlike Node tests which inject webNavigation events directly.
        if let fixture = ProcessInfo.processInfo.environment["FOCUS_NAVIGATION_FIXTURE"], let fixtureURL = URL(string: fixture) {
            let tabConfiguration = WKWebViewConfiguration()
            tabConfiguration.websiteDataStore = .nonPersistent()
            tabConfiguration.webExtensionController = controller
            let tab = TestTab(tabConfiguration)
            testWindow.testTabs = [tab]
            controller.didOpenTab(tab)
            let seed = """
                await chrome.storage.local.set({blockedSites: [{domain: '127.0.0.1', name: 'Fixture'}], allowList: []});
                return true;
                """
            _ = try await webView.callAsyncJavaScript(seed, contentWorld: .page)
            tab.view.load(URLRequest(url: fixtureURL))
            try await waitFor(tab) { $0.path == "/redirect.html" }
            print("WebKit real navigation -> redirect.html passed (no synthetic webNavigation event).")
            _ = try await webView.callAsyncJavaScript("""
                await chrome.storage.local.set({blockedSites: [{domain: '127.0.0.1', name: 'Fixture', dailyLimit: 1}]});
                return true;
                """, contentWorld: .page)
            tab.loadURL(fixtureURL, for: context) { _ in }
            try await waitFor(tab) { $0.path == "/confirm.html" }
            // This calls the background protocol, not the UI input guard (covered
            // in Node). The sender must be a real registered extension tab.
            _ = try? await tab.view.callAsyncJavaScript("""
                return await chrome.runtime.sendMessage({action: 'confirmVisit', domain: '127.0.0.1', target: \(String(data: try JSONSerialization.data(withJSONObject: fixture, options: .fragmentsAllowed), encoding: .utf8)!)});
                """, contentWorld: .page)
            try await waitFor(tab) { $0 == fixtureURL }
            tab.view.reload()
            try await waitFor(tab) { $0 == fixtureURL }
            print("WebKit confirm message -> website and same-tab reload passed.")
            var exitURL = URLComponents(url: fixtureURL, resolvingAgainstBaseURL: false)!
            exitURL.host = "localhost"
            tab.loadURL(exitURL.url!, for: context) { _ in }
            try await waitFor(tab) { $0.host == "localhost" }
            tab.loadURL(fixtureURL, for: context) { _ in }
            try await waitFor(tab) { $0.path == "/redirect.html" }
            print("WebKit leave/return -> exhausted block passed.")
            if ProcessInfo.processInfo.environment["FOCUS_EXPECT_DIAGNOSTICS"] == "1" {
                _ = try await webView.callAsyncJavaScript("""
                    const result = await chrome.runtime.sendMessage({action: 'getNavigationDiagnostics'});
                    if (!result.success || !result.listeners.before || !result.listeners.committed) throw new Error('Diagnostic listener check failed');
                    if (!result.events.some(event => event.stage === 'redirect-resolved')) throw new Error('Diagnostic navigation trace missing');
                    return true;
                    """, contentWorld: .page)
                print("WebKit read-only diagnostic message and named-listener checks passed.")
            }
        }
        precondition(context.errors.isEmpty, "\(context.errors)")
        try controller.unload(context)
        print("WebKit ran the event background, chrome.* Promise messaging/storage, and all four extension pages.")
    }
}
