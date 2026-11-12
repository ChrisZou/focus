# Validation record · 2026-11-12

## Scope and baseline

- Repository `/Users/chris/code/ai/focus`; starting commit `c60d7de24f893f8c2c1c10c6839357a6f5141342` on `safari-macos`, already 4 commits ahead of its remote.
- No tracked staged/unstaged changes. Existing untracked `store/permissions-justification.md` and `store/store-description-update.md` were left untouched. There was no pre-existing `ios/` code.
- New branch: `feature/focus-ios-20261112-163308`. All new repository files are under `ios/`. No existing extension code, settings or installed apps were changed. No push or PR.
- The configured default model/reasoning was unchanged, including delegated research, pure-policy work and independent source reviews.

## Environment and executed commands

Xcode **26.6 (17F113)**, Swift **6.3.3**, iPhoneOS/Simulator SDK **26.5**, XcodeGen **2.46.0**. Available destination used: **iPhone 17 Pro, iOS 26.5**, UUID `3DC5A860-013F-4C93-A857-9160F6209B79`.

Detailed logs and result bundles are outside the repository at `/tmp/focus-ios-20261112.mJfcRc/` (temporary, not durable artifacts):

```sh
xcodegen generate --spec ios/project.yml
swift test --package-path ios/FocusCore
xcodebuild -project ios/Focus.xcodeproj -scheme Focus -configuration Debug \
  -destination 'platform=iOS Simulator,id=3DC5A860-013F-4C93-A857-9160F6209B79' \
  -derivedDataPath /tmp/focus-ios-20261112.mJfcRc/DerivedData \
  CODE_SIGNING_ALLOWED=NO build
xcodebuild -project ios/Focus.xcodeproj -scheme Focus -configuration Debug \
  -destination 'platform=iOS Simulator,id=3DC5A860-013F-4C93-A857-9160F6209B79' \
  -derivedDataPath /tmp/focus-ios-20261112.mJfcRc/DerivedData \
  -resultBundlePath /tmp/focus-ios-20261112.mJfcRc/FocusTests-final.xcresult \
  CODE_SIGNING_ALLOWED=NO test
xcodebuild -project ios/Focus.xcodeproj -scheme Focus -configuration Debug \
  -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/focus-ios-20261112.mJfcRc/DeviceDerivedData \
  CODE_SIGNING_ALLOWED=NO build
```

| Check | Actual result / evidence |
| --- | --- |
| Project generation | Passed; `xcodegen.log`; generated project and shared scheme committed |
| Pure Swift tests on macOS | **26 passed, 0 failed**; `core-tests-final.log` |
| Simulator build, app plus three extensions | **BUILD SUCCEEDED**; `simulator-build-final.log` |
| Hostless XCTest on iOS Simulator | **26 passed, 0 failed**; `simulator-tests-final.log`, `FocusTests-final.xcresult` |
| Unsigned iPhoneOS arm64 build | **BUILD SUCCEEDED**; `device-build-final.log` |
| Plists and embedded products | All 8 source XML plists parse; all four Family Controls/App Group entitlement sets match; built app contains three extension executables with correct bundle IDs |
| Source hygiene | `git diff --check`; local package `.build/` correctly ignored; no build/log products staged |
| Independent implementation review | Grant ordering, lock/UUID handling, revocation, empty-state preservation and recovery reviewed; findings addressed |
| Independent native UI review | Two findings fixed: failed picker saves retain draft; busy authorization has accessible label. Source-only re-review resolved both |

The first simulator compile found a name collision between persisted `FocusState` and SwiftUI's property wrapper; fixed with `@SwiftUI.FocusState`. The initial unsigned device build warned about incomplete orientation declarations; all orientations are now declared. Apple build tooling emits the informational “Metadata extraction skipped. No AppIntents.framework dependency found” warning; this app has no App Intents. Initial attempts are retained in the temporary logs rather than hidden.

## Coverage and limits

Tests exercise validation, only-supported durations, preparation/activation boundaries, exact **pure-model** expiry comparison, cancellation, terminal-state immutability, stale/early/late callbacks, cold launch, missing monitor, authorization/selection loss, wall/uptime changes, malformed Codable state, and UTC midnight/year rollover. Exact pure-model comparisons do **not** establish exact OS enforcement timing.

No GUI was opened or driven; no screenshots or UI tests were taken. CLI `xcodebuild test` ran the hostless test bundle in the simulator; it did not drive Focus's UI or validate Screen Time. No existing installed app was updated and no physical-device install was attempted. No private APIs, dynamic token launches, undocumented URL schemes, process killing, credential reads, account changes, publication, or new build-tool installation were used.

Device signing/provisioning was deliberately not attempted: certificates and account state were not inspected. Whether the team's four App IDs, App Group, profiles and Family Controls distribution approvals exist is **unknown**, not a claimed setup failure or success. A correctly provisioned physical iPhone is required for authorization/picker/shield/monitor tests. Background/force-quit/reboot behavior, propagation latency, accessibility/rendered layout and `.individual` behavior of the newer host-opening API remain unvalidated. See [DEVICE-SETUP.md](DEVICE-SETUP.md) and [APPLE-RESEARCH.md](APPLE-RESEARCH.md).
