import Combine
import DeviceActivity
import FamilyControls
import FocusCore
import Foundation

@MainActor
final class FocusModel: ObservableObject {
    @Published private(set) var state = FocusState()
    @Published private(set) var authorization = AuthorizationCenter.shared.authorizationStatus
    @Published private(set) var busy = false
    @Published var errorMessage: String?

    private let repository: FocusRepository?
    private let center = DeviceActivityCenter()
    private var recoveryRequired = false

    init() {
        do {
            repository = try FocusRepository()
        } catch {
            repository = nil
            errorMessage = error.localizedDescription
        }
        refresh(coldLaunch: true)
    }

    var authorized: Bool { authorization == .approved }
    var selectionCount: Int { state.selection.applicationTokens.count }
    var hasOpenSession: Bool {
        state.session?.phase == .active || state.session?.phase == .scheduled
    }
    var ready: Bool { repository != nil && authorized && selectionCount > 0 && !busy && !recoveryRequired }

    func requestAuthorization() async {
        busy = true
        defer { busy = false }
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            errorMessage = nil
        } catch {
            errorMessage = "未获得屏幕使用时间授权。请重新授权。\n" + error.localizedDescription
        }
        refresh()
    }

    func refresh(coldLaunch: Bool = false, allowActivation: Bool = false) {
        authorization = AuthorizationCenter.shared.authorizationStatus
        guard let repository else { return }
        do {
            var stop: DeviceActivityName?
            state = try repository.transaction { transaction in
                let now = Date()
                let uptime = ProcessInfo.processInfo.systemUptime
                let registered = Set(center.activities)
                var value = transaction.state
                if !authorized && value.previouslyAuthorized {
                    // Apple invalidates selection tokens on revocation.
                    value.selection = FamilyActivitySelection(includeEntireCategory: false)
                }
                value.previouslyAuthorized = authorized
                if let session = value.session {
                    value.session = SessionPolicy.reconcile(
                        session, now: now, uptime: uptime,
                        authorized: authorized,
                        hasSelection: !value.selection.applicationTokens.isEmpty,
                        monitorRegistered: registered.contains(FocusIdentity.activity(for: session.id)),
                        coldLaunch: coldLaunch || recoveryRequired, allowActivation: allowActivation
                    )
                    if value.session?.phase != .active && value.session?.phase != .scheduled {
                        stop = FocusIdentity.activity(for: session.id)
                    }
                }
                if value.session?.phase == .active && authorized {
                    // Persist the grant before changing enforcement. A crash between
                    // these writes leaves the selection shielded, never newly open.
                    let activating = transaction.state.session?.phase == .scheduled
                    if value != transaction.state {
                        transaction.state = value
                        try transaction.save()
                    }
                    if activating { FocusShield.allowSelection() }
                } else {
                    FocusShield.apply(value.selection)
                    if value != transaction.state {
                        transaction.state = value
                        try transaction.save()
                    }
                }
                return value
            }
            recoveryRequired = false
            if let stop, center.activities.contains(stop) { center.stopMonitoring([stop]) }
        } catch {
            failClosed(error)
        }
    }

    @discardableResult
    func saveSelection(_ selection: FamilyActivitySelection) -> Bool {
        authorization = AuthorizationCenter.shared.authorizationStatus
        guard authorized, let repository else {
            errorMessage = "无法保存，请检查授权和共享存储配置。"
            return false
        }
        guard selection.categoryTokens.isEmpty && selection.webDomainTokens.isEmpty else {
            errorMessage = "请展开分类，只选择具体 App；暂不支持整类或网站。"
            return false
        }
        do {
            state = try repository.transaction { transaction in
                var value = transaction.state
                if let session = value.session { value.session = SessionPolicy.cancel(session) }
                value.selection = selection
                FocusShield.apply(selection, allowEmpty: true)
                transaction.state = value
                try transaction.save()
                return value
            }
            stopOwnedMonitoring()
            recoveryRequired = false
            errorMessage = nil
            return true
        } catch {
            failClosed(error)
            return false
        }
    }

    func begin(purpose: String, minutes: Int) {
        guard !busy, !recoveryRequired, let repository else { return }
        busy = true
        defer { busy = false }
        var requestPersisted = false
        do {
            authorization = AuthorizationCenter.shared.authorizationStatus
            let session = try repository.transaction { transaction in
                guard transaction.state.session?.phase != .active,
                      transaction.state.session?.phase != .scheduled else {
                    throw StartError.alreadyRunning
                }
                let session = try SessionPolicy.create(
                    purpose: purpose, durationMinutes: minutes,
                    selectionCount: transaction.state.selection.applicationTokens.count,
                    authorized: authorized, now: Date(),
                    uptime: ProcessInfo.processInfo.systemUptime, id: UUID()
                )
                FocusShield.apply(transaction.state.selection)
                transaction.state.session = session
                try transaction.save()
                return session
            }
            requestPersisted = true
            // Invalidate old IDs in shared state BEFORE stopping old schedules:
            // stopMonitoring itself can cause an intervalDidEnd callback.
            stopOwnedMonitoring()
            let schedule = DeviceActivitySchedule(
                intervalStart: SessionPolicy.utcDateComponents(for: session.startsAt),
                intervalEnd: SessionPolicy.utcDateComponents(for: session.endsAt), repeats: false
            )
            guard let interval = schedule.nextInterval,
                  abs(interval.start.timeIntervalSince(session.startsAt)) < 1,
                  abs(interval.end.timeIntervalSince(session.endsAt)) < 1,
                  interval.duration >= SessionPolicy.minimumInterval else {
                throw StartError.invalidSchedule
            }
            try center.startMonitoring(FocusIdentity.activity(for: session.id), during: schedule)
            guard center.activities.contains(FocusIdentity.activity(for: session.id)) else {
                throw StartError.notRegistered
            }
            errorMessage = nil
            refresh(allowActivation: true)
        } catch {
            // Any scheduling/persistence failure preserves or restores shielding.
            if requestPersisted { cancel() }
            else if !(error is SessionValidationError) && !(error is StartError) { failClosed(error) }
            errorMessage = "未开放访问。" + error.localizedDescription
        }
    }

    func cancel() {
        guard let repository else { return }
        do {
            state = try repository.transaction { transaction in
                FocusShield.apply(transaction.state.selection)
                if let session = transaction.state.session {
                    transaction.state.session = SessionPolicy.cancel(session)
                }
                try transaction.save()
                return transaction.state
            }
            stopOwnedMonitoring()
            recoveryRequired = false
            errorMessage = nil
        } catch { failClosed(error) }
    }

    private func failClosed(_ error: Error) {
        // On unreadable storage, only cached tokens can be restored. Never clear
        // the named store in this path or invent a replacement selection.
        if !state.selection.applicationTokens.isEmpty { FocusShield.apply(state.selection) }
        recoveryRequired = true
        if let session = state.session { state.session = SessionPolicy.cancel(session) }
        errorMessage = "状态核对失败，未开放新的访问。\n" + error.localizedDescription
    }

    private func stopOwnedMonitoring() {
        let activities = center.activities.filter { $0.rawValue.hasPrefix(FocusIdentity.activityPrefix) }
        if !activities.isEmpty { center.stopMonitoring(activities) }
    }

    private enum StartError: LocalizedError {
        case alreadyRunning, invalidSchedule, notRegistered
        var errorDescription: String? {
            switch self {
            case .alreadyRunning: "请先结束当前访问。"
            case .invalidSchedule: "系统无法建立至少 15 分钟的监控区间，请重试。"
            case .notRegistered: "系统未登记监控，请检查授权后重试。"
            }
        }
    }
}
