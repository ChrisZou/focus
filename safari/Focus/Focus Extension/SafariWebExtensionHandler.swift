import SafariServices

// Focus uses runtime.sendMessage entirely within the web extension.
// No native messaging or native access to browsing data is needed.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        context.completeRequest(returningItems: [], completionHandler: nil)
    }
}
