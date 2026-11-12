import DeviceActivity
import FamilyControls
import FocusCore
import Foundation
import os

final class FocusMonitorExtension: DeviceActivityMonitor {
    private let logger = Logger(subsystem: "com.chris.focus.ios", category: "monitor")

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        reconcile(activity, ended: false)
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        reconcile(activity, ended: true)
    }

    private func reconcile(_ activity: DeviceActivityName, ended: Bool) {
        guard let id = FocusIdentity.sessionID(for: activity) else { return }
        do {
            let repository = try FocusRepository()
            try repository.transaction { transaction in
                guard let session = transaction.state.session, session.id == id else { return }
                let now = Date()
                let uptime = ProcessInfo.processInfo.systemUptime
                let authorized = AuthorizationCenter.shared.authorizationStatus == .approved
                var updated = SessionPolicy.reconcile(
                    session, now: now, uptime: uptime, authorized: authorized,
                    hasSelection: !transaction.state.selection.applicationTokens.isEmpty,
                    monitorRegistered: true, allowActivation: false
                )
                if ended {
                    updated = SessionPolicy.intervalEnded(updated, activitySessionID: id, now: now, uptime: uptime)
                }
                if !authorized && transaction.state.previouslyAuthorized {
                    transaction.state.selection = FamilyActivitySelection(includeEntireCategory: false)
                    transaction.state.previouslyAuthorized = false
                }
                // An extension may close access, but NEVER grants access. A delayed
                // start callback must not undo an expired/cancelled session.
                if updated.phase != .active { FocusShield.apply(transaction.state.selection) }
                transaction.state.session = updated
                transaction.state.lastMonitorEvent = ended ? "intervalDidEnd" : "intervalDidStart"
                transaction.state.lastMonitorDate = now
                try transaction.save()
            }
        } catch {
            // No token cache is safe to invent when protected storage is inaccessible.
            // Preserve current ManagedSettings; report only the failure, no purpose/tokens.
            logger.error("Monitor reconciliation failed: \(String(describing: type(of: error)), privacy: .public)")
        }
    }
}
