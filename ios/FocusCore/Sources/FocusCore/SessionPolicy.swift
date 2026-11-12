import Foundation

/// This is a wall-clock access lease, never cumulative app-usage accounting.
public enum SessionPhase: String, Codable, Equatable, Sendable {
    case scheduled
    case active
    case expired
    case cancelled
    case interrupted

    public var isTerminal: Bool {
        switch self {
        case .scheduled, .active: return false
        case .expired, .cancelled, .interrupted: return true
        }
    }
}

public enum InterruptionReason: String, Codable, Equatable, Sendable {
    case authorizationLost
    case emptySelection
    case monitorMissing
    case coldLaunch
    case clockChanged
    case invalidState
    case activationMissed
    case monitorEndedEarly
}

public struct LeaseSession: Codable, Equatable, Sendable {
    public let id: UUID
    public let purpose: String
    public let durationMinutes: Int
    public let requestedAt: Date
    public let startsAt: Date
    public let endsAt: Date
    public let requestedUptime: TimeInterval
    public fileprivate(set) var phase: SessionPhase
    public fileprivate(set) var interruptionReason: InterruptionReason?

    /// A request is still shielded until the foreground host explicitly activates it.
    public var shouldShield: Bool { phase != .active }
}

public enum SessionValidationError: LocalizedError, Equatable, Sendable {
    case emptyPurpose
    case purposeTooLong
    case unsupportedDuration
    case emptySelection
    case unauthorized
    case invalidClock

    public var errorDescription: String? {
        switch self {
        case .emptyPurpose: return "请填写本次用途。"
        case .purposeTooLong: return "用途最多 120 字。"
        case .unsupportedDuration: return "请选择 15、30 或 60 分钟。"
        case .emptySelection: return "请先选择要屏蔽的 App。"
        case .unauthorized: return "请先授权屏幕使用时间。"
        case .invalidClock: return "无法确认系统时间，请重新打开 Focus。"
        }
    }
}

/// All decisions depend only on explicit inputs. No timers, system services or storage.
public enum SessionPolicy {
    public static let minimumInterval: TimeInterval = 15 * 60
    public static let allowedDurationMinutes = [15, 30, 60]
    public static let maximumPurposeLength = 120
    public static let clockTolerance: TimeInterval = 5
    public static let activationTolerance: TimeInterval = 5

    public static func validatedPurpose(_ value: String) throws -> String {
        let purpose = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !purpose.isEmpty else { throw SessionValidationError.emptyPurpose }
        guard purpose.count <= maximumPurposeLength else {
            throw SessionValidationError.purposeTooLong
        }
        return purpose
    }

    public static func create(
        purpose: String,
        durationMinutes: Int,
        selectionCount: Int,
        authorized: Bool,
        now: Date,
        uptime: TimeInterval,
        id: UUID = UUID()
    ) throws -> LeaseSession {
        guard authorized else { throw SessionValidationError.unauthorized }
        guard selectionCount > 0 else { throw SessionValidationError.emptySelection }
        let purpose = try validatedPurpose(purpose)
        guard allowedDurationMinutes.contains(durationMinutes) else {
            throw SessionValidationError.unsupportedDuration
        }
        guard validClock(now: now, uptime: uptime) else {
            throw SessionValidationError.invalidClock
        }

        // Full UTC seconds keep a 15-minute schedule at least 900 seconds long.
        // The short preparation period remains shielded and is not a hidden lease.
        let startsAt = Date(timeIntervalSince1970: ceil(now.timeIntervalSince1970) + 2)
        return LeaseSession(
            id: id,
            purpose: purpose,
            durationMinutes: durationMinutes,
            requestedAt: now,
            startsAt: startsAt,
            endsAt: startsAt.addingTimeInterval(TimeInterval(durationMinutes * 60)),
            requestedUptime: uptime,
            phase: .scheduled,
            interruptionReason: nil
        )
    }

    public static func reconcile(
        _ session: LeaseSession,
        now: Date,
        uptime: TimeInterval,
        authorized: Bool,
        hasSelection: Bool,
        monitorRegistered: Bool,
        coldLaunch: Bool = false,
        allowActivation: Bool = false
    ) -> LeaseSession {
        guard !session.phase.isTerminal else { return session }
        guard isStructurallyValid(session), validClock(now: now, uptime: uptime) else {
            return interrupt(session, reason: .invalidState)
        }
        if now >= session.endsAt { return finish(session, phase: .expired) }
        if coldLaunch { return interrupt(session, reason: .coldLaunch) }
        if !authorized { return interrupt(session, reason: .authorizationLost) }
        if !hasSelection { return interrupt(session, reason: .emptySelection) }
        if !monitorRegistered { return interrupt(session, reason: .monitorMissing) }

        let wallElapsed = now.timeIntervalSince(session.requestedAt)
        let monotonicElapsed = uptime - session.requestedUptime
        if monotonicElapsed < 0 || abs(wallElapsed - monotonicElapsed) > clockTolerance {
            return interrupt(session, reason: .clockChanged)
        }

        if session.phase == .scheduled {
            // Never grant a materially shorter session because setup or foreground
            // execution was delayed. A new explicit request is required instead.
            if now.timeIntervalSince(session.startsAt) > activationTolerance {
                return interrupt(session, reason: .activationMissed)
            }
            if allowActivation && now >= session.startsAt {
                return finish(session, phase: .active)
            }
        }
        return session
    }

    public static func cancel(_ session: LeaseSession) -> LeaseSession {
        guard !session.phase.isTerminal else { return session }
        return finish(session, phase: .cancelled)
    }

    /// `stopMonitoring` can also cause intervalDidEnd. Only the matching session
    /// may change, and an early callback must shield rather than imply expiry.
    public static func intervalEnded(
        _ session: LeaseSession,
        activitySessionID: UUID,
        now: Date,
        uptime: TimeInterval
    ) -> LeaseSession {
        guard session.id == activitySessionID, !session.phase.isTerminal else {
            return session
        }
        guard isStructurallyValid(session), validClock(now: now, uptime: uptime) else {
            return interrupt(session, reason: .invalidState)
        }
        if now >= session.endsAt { return finish(session, phase: .expired) }
        return interrupt(session, reason: .monitorEndedEarly)
    }

    /// Explicit full UTC dates avoid an accidental daily recurrence at midnight.
    public static func utcDateComponents(for date: Date) -> DateComponents {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar.dateComponents(
            [.calendar, .timeZone, .year, .month, .day, .hour, .minute, .second],
            from: date
        )
    }

    public static func isStructurallyValid(_ session: LeaseSession) -> Bool {
        guard validClock(now: session.requestedAt, uptime: session.requestedUptime),
              session.startsAt.timeIntervalSince1970.isFinite,
              session.endsAt.timeIntervalSince1970.isFinite,
              allowedDurationMinutes.contains(session.durationMinutes),
              (try? validatedPurpose(session.purpose)) == session.purpose,
              session.startsAt.timeIntervalSince1970 == ceil(session.requestedAt.timeIntervalSince1970) + 2,
              session.endsAt.timeIntervalSince(session.startsAt) == TimeInterval(session.durationMinutes * 60)
        else { return false }
        return true
    }

    private static func validClock(now: Date, uptime: TimeInterval) -> Bool {
        now.timeIntervalSince1970.isFinite && uptime.isFinite && uptime >= 0
    }

    private static func interrupt(_ session: LeaseSession, reason: InterruptionReason) -> LeaseSession {
        var result = session
        result.phase = .interrupted
        result.interruptionReason = reason
        return result
    }

    private static func finish(_ session: LeaseSession, phase: SessionPhase) -> LeaseSession {
        var result = session
        result.phase = phase
        result.interruptionReason = nil
        return result
    }
}
