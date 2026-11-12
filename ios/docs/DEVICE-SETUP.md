# Physical-device setup and verification

This is a development prototype. No developer-portal configuration, account change, credential inspection, device installation, or GUI action was performed as part of creating these instructions. A simulator build and pure state/time tests do not establish that Screen Time works on a physical iPhone.

## Target identities and capabilities

Use **Hangzhou Xinyouduzhong Technology Co., Ltd.**, team **`W4SX57U6XB`**, for every target. Keep the IDs consistent across Xcode, the developer portal, entitlements, and provisioning profiles.

| Target | Bundle ID | Family Controls | App Group |
| --- | --- | --- | --- |
| Focus | `com.chris.focus.ios` | Required | `group.com.chris.focus.ios` |
| FocusMonitor | `com.chris.focus.ios.monitor` | Required | `group.com.chris.focus.ios` |
| FocusShieldConfiguration | `com.chris.focus.ios.shield-configuration` | Required | `group.com.chris.focus.ios` |
| FocusShieldAction | `com.chris.focus.ios.shield-action` | Required | `group.com.chris.focus.ios` |

1. Use an iOS **Apple Development** certificate and matching development provisioning profiles for a debug device build. **Developer ID Application is for macOS and must not be used for this iOS app.** Distribution uses an appropriate Apple Distribution identity and profiles for this same team.
2. Register/confirm the four App IDs and enable Family Controls for each. Each target's entitlements must contain `com.apple.developer.family-controls = true`. A local entitlement file alone does not add a capability to a provisioning profile.
3. Register/confirm `group.com.chris.focus.ios` under the same team, add all four App IDs to the group, and include it in every target's App Groups capability and provisioning profile. Keep the shared-state identifier in source consistent with these entitlements. Do not silently substitute a standard defaults suite when the group is inaccessible.
4. Regenerate/download the four development profiles after capability changes, or deliberately allow Xcode automatic signing when the account holder authorizes that account action. These setup instructions are not a claim that such portal actions have been completed.
5. Select a physical iPhone supported by the project's deployment target, enable Developer Mode if required, build the `Focus` scheme, and confirm all three extensions are embedded. Confirm the built app and each `.appex` have the intended bundle ID, team, Family Controls entitlement, App Group entitlement, and provisioning profile.
6. Run Focus, authorize individual Screen Time access on the phone, and select fresh target apps. On-device authorization is separate from signing and from distribution approval.

Apple's [Configuring Family Controls](https://developer.apple.com/documentation/xcode/configuring-family-controls) explains development capability and profiles for both app and extensions. [Configuring app groups](https://developer.apple.com/documentation/xcode/configuring-app-groups) describes registering the shared group and accessing its container.

## Development versus distribution

Family Controls development provisioning is not evidence of approval for TestFlight, the App Store, or other distribution. The Apple Developer Account Holder must request the Family Controls **distribution** entitlement for the app **and each Screen Time extension**. Check the granted capability's supported distribution methods and regenerate appropriate profiles after approval. No distribution request or publication is authorized or performed by this prototype task. Official instructions: [Requesting the Family Controls entitlement](https://developer.apple.com/documentation/familycontrols/requesting-the-family-controls-entitlement).

## Record evidence on the phone

For each test, record the OS/device/build version, intended lease start/end, observed monitor callback time if available, observed re-shield time, and whether the target remained usable after the intended end. Separate a successful settings write from an actually visible shield. Use at least one ordinary target app; do not use Focus itself as the target. Check both a fresh install and a relaunch with persisted state.

Do not mark the following complete from a simulator build or pure model tests:

| Scenario | Verification |
| --- | --- |
| Authorization declined | Focus shows authorization is needed, allows a retry, and does not claim targets are protected. |
| Authorization approved | The native individual authorization flow completes and the picker shows this device's selectable apps. |
| Empty selection | Saving/retaining no targets leaves session start unavailable; no phantom active session appears. |
| Target selection | Selected targets are shielded before any purpose or access session is accepted. Check whether picking categories/sites is accepted or rejected according to the prototype's selection policy. |
| Shield flow | The shield's actions keep the documented behavior. Manually leave it and open Focus; enter the purpose there. No target app is launched from an opaque token. |
| Purpose validation | Whitespace-only and over-limit input fail with concise feedback. Valid Chinese text is accepted. Duration selection follows purpose entry. |
| Scheduled activation | Start a 15-minute session. During the short setup interval, targets remain shielded. If Focus leaves the foreground before activation, it must not silently grant access in the background. |
| Active lease | Successful registration and foreground activation grant access to the selected set. Manually return to a target. Record intended end; locked or unrelated-app time does not pause the wall-clock window. |
| Continuous target use | Remain in the target across the deadline; measure actual callback/shield delay instead of assuming the deadline is exact. |
| Foreground expiry | Keep Focus active across the deadline. Reconciliation ends the lease and attempts re-shielding. This does not prove the background path. |
| Background expiry | Leave Focus running in the background, use a target across the deadline, and observe the monitor extension separately. |
| Locked deadline | Lock before the end and unlock after it. Record when callbacks and shielding actually happen; no execution exactly at a locked deadline is promised. |
| Host force quit | Force quit Focus during a lease and keep using the target. Record whether/when the monitor runs. Reopen Focus: cold-launch reconciliation must cancel any outstanding lease conservatively. |
| Reboot before/after deadline | Reboot during an active lease, test before and after first unlock, and try the target before reopening Focus. Record any access gap. Reopening Focus must cancel outstanding access; no launch-at-boot or first-frame shielding guarantee exists. |
| Clock changes | While active, move the system clock forward/backward. On the next reconciliation, a wall/uptime mismatch must cancel conservatively. Restore normal device time after testing. |
| Timezone, midnight, DST | Exercise a lease crossing midnight and timezone/DST transitions where practical. Compare persisted absolute end to the OS schedule; do not infer correctness from a countdown alone. |
| Cancel scheduled/active | Cancel before and after activation. Shields should be reapplied and the owned schedule stopped. Subsequent callbacks must not resurrect access. |
| Cancel then restart | Cancel one session, immediately start another, and observe a late old end callback if one arrives. Its session-specific identity must prevent it from ending or unshielding the new session. |
| Revoke while active | Revoke Focus's Screen Time access in Settings. On detection, stop the lease, discard invalid tokens, and show authorization required; do not claim continuing protection. |
| Reauthorize | Reauthorize, make a fresh picker selection, and verify shields/session behavior. Old tokens must not be treated as valid after observed revocation. |
| Missed revocation cycle | Revoke and reauthorize while the host is terminated. Record actual token behavior; a cached authorization flag cannot prove tokens are valid. |
| Schedule registration failure | Exercise failure using a dedicated development test configuration or injected adapter failure. The lease must never become active and selected targets must remain shielded. Never ship an unsupported sub-15-minute schedule as a shortcut. |
| Missing monitor/state | In an isolated development build, simulate lost monitor registration, malformed shared state, or inaccessible App Group. Reconciliation must refuse new access and preserve/reapply known shielding where possible. |
| Repeated use | Complete/cancel several sessions; ensure stale callbacks, terminal state, and old schedules do not accumulate into new grants. |
| Accessibility | Verify VoiceOver labels, larger Dynamic Type, keyboard dismissal, and Chinese text layout on a real phone. |

The timing and lifecycle limits are documented in [APPLE-RESEARCH.md](APPLE-RESEARCH.md). A successful prototype check is an observed, recorded loop with its actual latency and failures; it is not proof of exact expiry or tamper-proof enforcement.
