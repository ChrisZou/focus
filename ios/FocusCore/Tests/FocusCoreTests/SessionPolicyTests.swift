import Foundation
import XCTest
@testable import FocusCore

final class SessionPolicyTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000.25)
    private let uptime: TimeInterval = 1_000
    private let id = UUID(uuidString: "9FBE6540-631F-4E30-A694-C8E4B1E47D63")!

    private func make(minutes: Int = 15, purpose: String = "查找资料") throws -> LeaseSession {
        try SessionPolicy.create(
            purpose: purpose, durationMinutes: minutes, selectionCount: 1,
            authorized: true, now: now, uptime: uptime, id: id
        )
    }

    private func advance(
        _ session: LeaseSession,
        by seconds: TimeInterval,
        allowActivation: Bool = false,
        authorized: Bool = true,
        hasSelection: Bool = true,
        monitorRegistered: Bool = true,
        coldLaunch: Bool = false
    ) -> LeaseSession {
        SessionPolicy.reconcile(
            session, now: now.addingTimeInterval(seconds), uptime: uptime + seconds,
            authorized: authorized, hasSelection: hasSelection,
            monitorRegistered: monitorRegistered, coldLaunch: coldLaunch,
            allowActivation: allowActivation
        )
    }

    private func active() throws -> LeaseSession {
        let session = try make()
        return advance(session, by: session.startsAt.timeIntervalSince(now), allowActivation: true)
    }

    func testPurposeIsTrimmedAndPreparationStaysShielded() throws {
        let session = try make(purpose: " \n 查找资料 \t")
        XCTAssertEqual(session.purpose, "查找资料")
        XCTAssertEqual(session.id, id)
        XCTAssertEqual(session.phase, .scheduled)
        XCTAssertTrue(session.shouldShield)
        XCTAssertEqual(session.startsAt.timeIntervalSince1970, 1_800_000_003)
        XCTAssertEqual(session.endsAt.timeIntervalSince(session.startsAt), 900)
        XCTAssertGreaterThan(session.startsAt, now)
    }

    func testBlankPurposeRejected() {
        for purpose in ["", " \t\n", "\u{3000}\n"] {
            XCTAssertThrowsError(try make(purpose: purpose)) {
                XCTAssertEqual($0 as? SessionValidationError, .emptyPurpose)
            }
        }
    }

    func testPurposeLimitCountsCharactersNotUTF8Bytes() throws {
        let atLimit = String(repeating: "👨‍👩‍👦", count: 120)
        XCTAssertEqual(try make(purpose: atLimit).purpose.count, 120)
        XCTAssertThrowsError(try make(purpose: atLimit + "字")) {
            XCTAssertEqual($0 as? SessionValidationError, .purposeTooLong)
        }
    }

    func testUnsupportedShortAndArbitraryDurationsRejected() {
        for minutes in [-1, 0, 1, 5, 14, 16, 90] {
            XCTAssertThrowsError(try make(minutes: minutes)) {
                XCTAssertEqual($0 as? SessionValidationError, .unsupportedDuration)
            }
        }
    }

    func testAllSupportedDurationsHaveHonestScheduleLength() throws {
        XCTAssertEqual(SessionPolicy.minimumInterval, 900)
        for minutes in SessionPolicy.allowedDurationMinutes {
            let session = try make(minutes: minutes)
            XCTAssertEqual(session.endsAt.timeIntervalSince(session.startsAt), Double(minutes * 60))
            XCTAssertGreaterThanOrEqual(session.endsAt.timeIntervalSince(session.startsAt), SessionPolicy.minimumInterval)
        }
    }

    func testAuthorizationAndNonemptySelectionRequired() {
        XCTAssertThrowsError(try SessionPolicy.create(
            purpose: "资料", durationMinutes: 15, selectionCount: 1,
            authorized: false, now: now, uptime: uptime
        )) { XCTAssertEqual($0 as? SessionValidationError, .unauthorized) }
        for count in [-1, 0] {
            XCTAssertThrowsError(try SessionPolicy.create(
                purpose: "资料", durationMinutes: 15, selectionCount: count,
                authorized: true, now: now, uptime: uptime
            )) { XCTAssertEqual($0 as? SessionValidationError, .emptySelection) }
        }
    }

    func testInvalidClocksCannotCreateLease() {
        for badUptime in [-1.0, .infinity, .nan] {
            XCTAssertThrowsError(try SessionPolicy.create(
                purpose: "资料", durationMinutes: 15, selectionCount: 1,
                authorized: true, now: now, uptime: badUptime
            )) { XCTAssertEqual($0 as? SessionValidationError, .invalidClock) }
        }
        XCTAssertThrowsError(try SessionPolicy.create(
            purpose: "资料", durationMinutes: 15, selectionCount: 1,
            authorized: true, now: Date(timeIntervalSince1970: .infinity), uptime: uptime
        )) { XCTAssertEqual($0 as? SessionValidationError, .invalidClock) }
    }

    func testCannotActivateBeforeStartOrWithoutForegroundPermission() throws {
        let session = try make()
        let startsIn = session.startsAt.timeIntervalSince(now)
        XCTAssertEqual(advance(session, by: startsIn - 0.001, allowActivation: true).phase, .scheduled)
        XCTAssertEqual(advance(session, by: startsIn).phase, .scheduled)
        XCTAssertEqual(advance(session, by: startsIn, allowActivation: true).phase, .active)
    }

    func testActivationMissCannotCreateHiddenShortSession() throws {
        let session = try make()
        let start = session.startsAt.timeIntervalSince(now)
        XCTAssertEqual(advance(session, by: start + 5, allowActivation: true).phase, .active)
        let missed = advance(session, by: start + 5.001, allowActivation: true)
        XCTAssertEqual(missed.phase, .interrupted)
        XCTAssertEqual(missed.interruptionReason, .activationMissed)
        XCTAssertTrue(missed.shouldShield)
    }

    func testExactExpiryBoundary() throws {
        let session = try active()
        let end = session.endsAt.timeIntervalSince(now)
        XCTAssertEqual(advance(session, by: end - 0.001).phase, .active)
        let expired = advance(session, by: end)
        XCTAssertEqual(expired.phase, .expired)
        XCTAssertTrue(expired.shouldShield)
        XCTAssertEqual(advance(session, by: end + 900).phase, .expired)
    }

    func testIdleWallTimeStillConsumesLease() throws {
        // There is intentionally no usage-count input. Time in any app or idle
        // time counts against this wall-clock policy equally.
        let session = try active()
        XCTAssertEqual(advance(session, by: 500).phase, .active)
        XCTAssertEqual(advance(session, by: 903).phase, .expired)
    }

    func testCancellationIsTerminalAndIdempotent() throws {
        let session = try active()
        let cancelled = SessionPolicy.cancel(session)
        XCTAssertEqual(cancelled.phase, .cancelled)
        XCTAssertTrue(cancelled.shouldShield)
        XCTAssertEqual(SessionPolicy.cancel(cancelled), cancelled)
        XCTAssertEqual(advance(cancelled, by: 10, allowActivation: true), cancelled)
        XCTAssertEqual(advance(cancelled, by: 2_000), cancelled)
    }

    func testTerminalResultsNeverReactivateOrChangeDueToCancellation() throws {
        let session = try active()
        let outcomes = [
            advance(session, by: 903),
            advance(session, by: 10, authorized: false),
            SessionPolicy.cancel(session)
        ]
        for outcome in outcomes {
            XCTAssertTrue(outcome.phase.isTerminal)
            XCTAssertEqual(advance(outcome, by: 4, allowActivation: true), outcome)
            XCTAssertEqual(SessionPolicy.cancel(outcome), outcome)
        }
    }

    func testRevocationEmptySelectionAndLostMonitorInterrupt() throws {
        let session = try active()
        let cases: [(LeaseSession, InterruptionReason)] = [
            (advance(session, by: 10, authorized: false), .authorizationLost),
            (advance(session, by: 10, hasSelection: false), .emptySelection),
            (advance(session, by: 10, monitorRegistered: false), .monitorMissing)
        ]
        for (result, reason) in cases {
            XCTAssertEqual(result.phase, .interrupted)
            XCTAssertEqual(result.interruptionReason, reason)
            XCTAssertTrue(result.shouldShield)
        }
    }

    func testColdLaunchCancelsScheduledAndActiveAccess() throws {
        for session in [try make(), try active()] {
            let result = advance(session, by: 4, allowActivation: true, coldLaunch: true)
            XCTAssertEqual(result.phase, .interrupted)
            XCTAssertEqual(result.interruptionReason, .coldLaunch)
        }
    }

    func testRelaunchAfterDeadlineReportsExpired() throws {
        let result = advance(try active(), by: 903, coldLaunch: true)
        XCTAssertEqual(result.phase, .expired)
    }

    func testRebootLowerUptimeInterrupts() throws {
        let result = SessionPolicy.reconcile(
            try active(), now: now.addingTimeInterval(30), uptime: 3,
            authorized: true, hasSelection: true, monitorRegistered: true
        )
        XCTAssertEqual(result.phase, .interrupted)
        XCTAssertEqual(result.interruptionReason, .clockChanged)
    }

    func testRebootOrClockChangeWithHigherUptimeStillInterrupts() throws {
        // A simple uptime<savedUptime check would miss this discontinuity.
        let result = SessionPolicy.reconcile(
            try active(), now: now.addingTimeInterval(300), uptime: uptime + 20,
            authorized: true, hasSelection: true, monitorRegistered: true
        )
        XCTAssertEqual(result.interruptionReason, .clockChanged)
    }

    func testClockMovesBackwardInterrupts() throws {
        let result = SessionPolicy.reconcile(
            try active(), now: now.addingTimeInterval(-60), uptime: uptime + 30,
            authorized: true, hasSelection: true, monitorRegistered: true
        )
        XCTAssertEqual(result.phase, .interrupted)
        XCTAssertEqual(result.interruptionReason, .clockChanged)
    }

    func testClockToleranceBoundary() throws {
        let session = try active()
        func result(drift: Double) -> LeaseSession {
            SessionPolicy.reconcile(
                session, now: now.addingTimeInterval(10 + drift), uptime: uptime + 10,
                authorized: true, hasSelection: true, monitorRegistered: true
            )
        }
        XCTAssertEqual(result(drift: 5).phase, .active)
        XCTAssertEqual(result(drift: 5.001).interruptionReason, .clockChanged)
    }

    func testStaleIntervalEndCannotChangeNewSession() throws {
        let session = try active()
        XCTAssertEqual(SessionPolicy.intervalEnded(
            session, activitySessionID: UUID(), now: session.endsAt.addingTimeInterval(60),
            uptime: uptime + 1_000
        ), session)
    }

    func testEarlyIntervalEndFailsClosedRatherThanClaimingExpiry() throws {
        let session = try active()
        let result = SessionPolicy.intervalEnded(
            session, activitySessionID: id, now: now.addingTimeInterval(20), uptime: uptime + 20
        )
        XCTAssertEqual(result.phase, .interrupted)
        XCTAssertEqual(result.interruptionReason, .monitorEndedEarly)
        XCTAssertTrue(result.shouldShield)
    }

    func testLateIntervalEndExpiresAndNeverGrantsAccess() throws {
        let session = try active()
        let result = SessionPolicy.intervalEnded(
            session, activitySessionID: id, now: session.endsAt.addingTimeInterval(300),
            uptime: uptime + 1_203
        )
        XCTAssertEqual(result.phase, .expired)
        XCTAssertTrue(result.shouldShield)
    }

    func testCodableRoundTripRetainsLeaseAndTerminalReason() throws {
        let session = advance(try active(), by: 10, authorized: false)
        let data = try JSONEncoder().encode(session)
        XCTAssertEqual(try JSONDecoder().decode(LeaseSession.self, from: data), session)
    }

    func testCorruptPersistentDeadlineCannotGrantAccess() throws {
        let session = try active()
        let encoded = try JSONEncoder().encode(session)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        object["durationMinutes"] = 5
        let data = try JSONSerialization.data(withJSONObject: object)
        let corrupted = try JSONDecoder().decode(LeaseSession.self, from: data)
        XCTAssertFalse(SessionPolicy.isStructurallyValid(corrupted))
        let result = advance(corrupted, by: 5, allowActivation: true)
        XCTAssertEqual(result.interruptionReason, .invalidState)
        XCTAssertTrue(result.shouldShield)
    }

    func testUTCComponentsCrossMidnightAndYearWithoutRecurrence() throws {
        let formatter = ISO8601DateFormatter()
        let start = try XCTUnwrap(formatter.date(from: "2026-12-31T23:55:00Z"))
        let session = try SessionPolicy.create(
            purpose: "资料", durationMinutes: 15, selectionCount: 1,
            authorized: true, now: start, uptime: uptime
        )
        let from = SessionPolicy.utcDateComponents(for: session.startsAt)
        let to = SessionPolicy.utcDateComponents(for: session.endsAt)
        XCTAssertEqual(from.year, 2026)
        XCTAssertEqual(from.month, 12)
        XCTAssertEqual(from.day, 31)
        XCTAssertEqual(to.year, 2027)
        XCTAssertEqual(to.month, 1)
        XCTAssertEqual(to.day, 1)
        XCTAssertEqual(to.hour, 0)
        XCTAssertEqual(to.minute, 10)
        XCTAssertEqual(to.second, 2)
        XCTAssertEqual(from.timeZone?.secondsFromGMT(), 0)
        XCTAssertEqual(to.calendar?.date(from: to), session.endsAt)
        XCTAssertEqual(from.calendar?.date(from: from), session.startsAt)
    }
}
