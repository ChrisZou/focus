import ManagedSettings

final class FocusShieldAction: ShieldActionDelegate {
    override func handle(
        action: ShieldAction,
        for application: ApplicationToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        // .none keeps the shield in place. The user navigates home/to Focus.
        // iOS 26.5 adds .openParentalControlsApp, deliberately not required by
        // this iOS 17+ baseline. No URL tricks or another app's process control.
        completionHandler(.none)
    }
}
