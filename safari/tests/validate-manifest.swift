// Native WebKit manifest and runtime checks for the compiled .appex (macOS 15.4+).
import Foundation
import WebKit
import AppKit

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
    @MainActor static func main() async throws {
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
        let context = WKWebExtensionContext(for: webExtension)
        WKWebExtension.MatchPattern.registerCustomURLScheme("safari-web-extension")
        context.baseURL = URL(string: "safari-web-extension://focus-smoke-test/")!
        for permission in webExtension.requestedPermissions {
            context.setPermissionStatus(.grantedExplicitly, for: permission)
        }
        try controller.load(context)
        guard let configuration = context.webViewConfiguration else { fatalError("Missing extension configuration") }
        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 900), configuration: configuration)
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
        precondition(context.errors.isEmpty, "\(context.errors)")
        try controller.unload(context)
        print("WebKit ran the event background, chrome.* Promise messaging/storage, and all four extension pages.")
    }
}
