import Darwin
import DeviceActivity
import FamilyControls
import FocusCore
import Foundation
import ManagedSettings

enum FocusIdentity {
    static let appGroup = "group.com.chris.focus.ios"
    static let activityPrefix = "focus.lease."
    static let settings = ManagedSettingsStore.Name("focus.selection")

    static func activity(for id: UUID) -> DeviceActivityName {
        DeviceActivityName(activityPrefix + id.uuidString)
    }

    static func sessionID(for activity: DeviceActivityName) -> UUID? {
        guard activity.rawValue.hasPrefix(activityPrefix) else { return nil }
        return UUID(uuidString: String(activity.rawValue.dropFirst(activityPrefix.count)))
    }
}

struct FocusState: Codable, Equatable {
    var version = 1
    var selection = FamilyActivitySelection(includeEntireCategory: false)
    var session: LeaseSession?
    var previouslyAuthorized = false
    var lastMonitorEvent: String?
    var lastMonitorDate: Date?
}

enum FocusStorageError: LocalizedError {
    case appGroupUnavailable, lockFailed, unsupportedVersion

    var errorDescription: String? {
        switch self {
        case .appGroupUnavailable: "共享存储不可用，请检查 App Group 签名配置。"
        case .lockFailed: "无法读取共享状态，请重新打开 Focus。"
        case .unsupportedVersion: "状态版本不兼容，请使用匹配版本的 Focus。"
        }
    }
}

/// App and monitor serialize both state transitions and shield writes through one
/// process-shared lock. No UserDefaults cache is used as a synchronization primitive.
final class FocusRepository {
    private let directory: URL

    init() throws {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: FocusIdentity.appGroup
        ) else { throw FocusStorageError.appGroupUnavailable }
        directory = container.appendingPathComponent("Focus", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        // Available after first unlock following reboot; NOT before first unlock.
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: directory.path
        )
    }

    final class Transaction {
        var state: FocusState
        private let url: URL

        fileprivate init(state: FocusState, url: URL) {
            self.state = state
            self.url = url
        }

        func save() throws {
            let data = try JSONEncoder().encode(state)
            try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    func transaction<T>(_ operation: (Transaction) throws -> T) throws -> T {
        let lockURL = directory.appendingPathComponent("state.lock")
        let fd = open(lockURL.path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw FocusStorageError.lockFailed }
        defer { close(fd) }
        guard flock(fd, LOCK_EX) == 0 else { throw FocusStorageError.lockFailed }
        defer { flock(fd, LOCK_UN) }
        let url = directory.appendingPathComponent("state.json")
        let state: FocusState
        if FileManager.default.fileExists(atPath: url.path) {
            state = try JSONDecoder().decode(FocusState.self, from: Data(contentsOf: url))
            guard state.version == 1 else { throw FocusStorageError.unsupportedVersion }
        } else {
            state = FocusState()
        }
        return try operation(Transaction(state: state, url: url))
    }
}

enum FocusShield {
    /// This named store never changes Safari settings or other apps' stores.
    static func apply(_ selection: FamilyActivitySelection, allowEmpty: Bool = false) {
        // An empty/missing recovered state is not evidence that existing shields
        // should be removed. Only an explicit picker save can clear a selection.
        guard !selection.applicationTokens.isEmpty || allowEmpty else { return }
        let store = ManagedSettingsStore(named: FocusIdentity.settings)
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
    }

    static func allowSelection() {
        ManagedSettingsStore(named: FocusIdentity.settings).shield.applications = nil
    }
}
