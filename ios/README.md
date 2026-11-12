# Focus · iOS prototype

Native SwiftUI for Chris, Chinese UI, iPhone, iOS 17+. Everything here is independent of the repository's browser/Safari extensions. This is a testable Screen Time prototype, **not a guarantee of exact background expiry**.

## User flow

1. Authorize individual Screen Time access, then use the system picker to select specific apps. Saving applies Focus's shield immediately. Whole categories and websites are rejected, with the draft retained for correction.
2. Opening a selected app shows the system shield. Leave it manually and open Focus. The shield's “知道了” button keeps the shield in place; it does not launch anything or kill a process.
3. Enter a nonblank purpose, at most 120 characters. Then choose **15, 30, or 60 minutes**. One request temporarily allows **all selected apps**, as the button explicitly states. There is no inferred target-app identity or per-app launch.
4. Remain in Focus during the roughly 2–3 second preparation. The app persists a scheduled session and registers a nonrepeating Device Activity interval before granting access. If registration fails, it does not grant access. Leaving Focus during preparation cancels the request; activation more than 5 seconds late is rejected.
5. Once active, manually switch to a target. The UI shows the **planned end**, not a guaranteed expiry time. This is wall-clock time: time in other apps and locked time do not pause the lease. The interval is at least 900 seconds; foreground activation can lag its start by up to 5 seconds, so actual usable time is not guaranteed to be a full 15 minutes.
6. The monitor attempts to restore shielding when its matching interval ends. Focus also reconciles whenever foregrounded and while an active session is visible. “结束并屏蔽” restores shielding and cancels monitoring immediately from the host. The system may delay enforcement or callbacks.

Authorization denial/revocation is shown explicitly. Observed revocation discards invalid picker tokens; authorize and select again. Empty selection cannot start a lease. Relaunch conservatively ends outstanding access. Reboot, termination, missing callbacks, and inaccessible state can leave an access gap until the OS runs the monitor or Focus is reopened. See [Apple findings and remaining uncertainty](docs/APPLE-RESEARCH.md).

## Architecture and ordering

| Path / target | Responsibility |
| --- | --- |
| `FocusApp/` · Focus | SwiftUI page, individual authorization, picker, host-only grant, reconciliation |
| `FocusCore/` · Swift package | Foundation-only deterministic validation, state/time policy, 26 XCTest cases |
| `Shared/` | Codable selection/session, App Group atomic file persistence, cross-process `flock`, named settings store |
| `Extensions/Monitor/` · FocusMonitor | Match session UUID, reconcile, re-shield; never grants access |
| `Extensions/ShieldConfiguration/` | System shield appearance and manual-return instruction |
| `Extensions/ShieldAction/` | Public `.none` response; no launch/process APIs |
| `Configuration/`, `project.yml`, `Focus.xcodeproj/` | Four target IDs, entitlements, plists, reproducible XcodeGen project and shared scheme |

State transitions are `scheduled → active → expired`, with `cancelled` and `interrupted` terminal alternatives. Denied authorization and empty selection are prerequisites rather than fake sessions. Terminal sessions never reactivate. The app stores only the current/last session, not a history.

Grant order: shield → persist scheduled UUID → stop old owned monitors → register/verify schedule → foreground reconcile → persist active → remove Focus's own shield. Cancellation/expiry order: restore shielding → persist terminal state → stop owned monitor. A lock serializes shared-state decisions and shield writes across processes. UUID activity names make callbacks from previous sessions harmless, including callbacks caused by `stopMonitoring` itself. Empty automatic recovery does not clear existing shields; only explicit picker removal can clear an empty selection.

Full Gregorian UTC date components prevent accidental daily recurrence and handle midnight. An observed wall-clock/uptime discrepancy greater than 5 seconds interrupts access conservatively. This is a recovery heuristic, not a secure clock or an execution-at-boot mechanism. `ProcessInfo.systemUptime` behavior across sleep must be checked on hardware; an unexpected discrepancy may end a session early. No reconciliation runs without an execution opportunity.

Shared data uses the App Group `group.com.chris.focus.ios`, atomic replacement and protection until first unlock after reboot. Missing/malformed/unavailable storage prevents new grants; if tokens are unavailable, the prototype cannot manufacture them to restore a previously removed shield. It preserves existing settings and restores cached tokens where possible. Errors disable new grants until successful recovery. No purpose, app token, or usage data is sent over a network or written to logs. The configuration/action extensions do not need to read session data, though all four targets are provisioned consistently with the same group.

## Build and test without signing

The generated project is committed; XcodeGen is needed only after changing `project.yml`. There are no external package dependencies. From repository root:

```sh
xcodegen generate --spec ios/project.yml
swift test --package-path ios/FocusCore
xcodebuild -project ios/Focus.xcodeproj -scheme Focus \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/focus-build CODE_SIGNING_ALLOWED=NO build
xcrun simctl list devices available
xcodebuild -project ios/Focus.xcodeproj -scheme Focus \
  -destination 'platform=iOS Simulator,id=YOUR_AVAILABLE_SIMULATOR_UUID' \
  -derivedDataPath /tmp/focus-tests \
  -resultBundlePath /tmp/focus-tests.xcresult CODE_SIGNING_ALLOWED=NO test
```

The Xcode test target is a **hostless logic-test bundle**. It runs the same pure tests without launching Focus's UI or exercising Screen Time. No UI tests or screenshots were run because GUI use was prohibited. Compilation and these tests do not validate entitlement provisioning, authorization, picker behavior, extension delivery, or visible enforcement. Actual outcomes and command logs are recorded in [VALIDATION.md](docs/VALIDATION.md).

Use the [physical-device setup and verification checklist](docs/DEVICE-SETUP.md) before treating this as working enforcement. It specifies team **W4SX57U6XB**, all four bundle IDs, App Group, Apple Development signing, and separate Family Controls distribution approvals. No certificate/account inspection, portal changes, signing, physical-device installation, or publication was performed.
