# Apple API findings

Researched **2026-11-12** using current public Apple documentation over HTTP and the public interfaces in **Xcode 26.6 (17F113), iOS SDK 26.5**. No browser GUI or private API was used. Simulator compilation does not validate Screen Time enforcement.

## Shields and returning to Focus

`ShieldConfiguration` describes the system's shield: icon, title/subtitle, button labels and colors, and background/blur. Since iOS 26.4 it also accepts strings for a secondary-button submenu. `ShieldAction` reports primary/secondary presses and the three submenu-item actions. These are fixed system controls, not an arbitrary SwiftUI surface. There is no documented text field or arbitrary input mechanism for entering a purpose or duration inside this configuration. Focus collects both in its host app. Sources: [ShieldConfiguration](https://developer.apple.com/documentation/managedsettingsui/shieldconfiguration), [ShieldAction](https://developer.apple.com/documentation/managedsettings/shieldaction).

The response capabilities must be described by OS version:

| Response | Documented effect |
| --- | --- |
| `.none` | No further system action for the shield response. |
| `.close` | Ask the system to close the current shielded app or browser. This is not an API for killing another app's process. |
| `.defer` | Defer a response and redraw the shield, allowing its configuration to change. |
| `.openParentalControlsApp` | **iOS 26.5+**: ask the system to open the parental-controls app responsible for the shield. |

Sources: [ShieldActionResponse](https://developer.apple.com/documentation/managedsettings/shieldactionresponse), [defer](https://developer.apple.com/documentation/managedsettings/shieldactionresponse/defer), [openParentalControlsApp](https://developer.apple.com/documentation/managedsettings/shieldactionresponse/openparentalcontrolsapp).

It would be incorrect to claim that current iOS has no public host-opening response. However, the new case's documentation does not separately describe its behavior under `.individual` authorization. That behavior has not been tested here on a physical device. **This prototype deliberately uses a manual-return baseline and does not call the new case**: the user leaves the shield, opens Focus, then manually returns to the target app after access starts. There is no token-to-launch conversion, undocumented URL scheme, process termination, notification detour, or private launch API.

## Authorization, selection, and shared state

`AuthorizationCenter.requestAuthorization(for: .individual)` supports users authorizing their own devices starting in iOS 16. Individual authorization allows voluntary self-control; the user can revoke access in Settings or delete the app. It does not provide child-account removal protections. Sources: [requestAuthorization](https://developer.apple.com/documentation/familycontrols/authorizationcenter/requestauthorization(for:)), [WWDC22: What's new in Screen Time API](https://developer.apple.com/videos/play/wwdc2022/110336/).

`FamilyActivityPicker` on an individually authorized device presents that device's applications and websites. It returns opaque selections for Managed Settings and Device Activity rather than a general app launcher. **Revoking authorization invalidates the tokens issued while the app was authorized.** On observed revocation, Focus must discard those tokens and require a fresh selection after reauthorization. A revocation and reauthorization that occurs entirely while Focus and its extensions are not executing may not be observed; token validity cannot be proven from a cached approved flag. Sources: [FamilyActivityPicker](https://developer.apple.com/documentation/familycontrols/familyactivitypicker), [FamilyActivitySelection](https://developer.apple.com/documentation/familycontrols/familyactivityselection), [AuthorizationCenter](https://developer.apple.com/documentation/familycontrols/authorizationcenter).

Named `ManagedSettingsStore` instances are shared between the host and its extensions on iOS 16+. The most restrictive settings across stores take precedence, so removing Focus's own shield cannot override another controller's restrictions. The App Group is for Focus's own selection, session, and reconciliation data, not a prerequisite to sharing the named Managed Settings store. Sources: [WWDC22](https://developer.apple.com/videos/play/wwdc2022/110336/), [Configuring app groups](https://developer.apple.com/documentation/xcode/configuring-app-groups).

## Timing contract

### Minimum schedule and wall-clock lease

Apple explicitly documents a **15-minute minimum monitoring interval** for `DeviceActivityCenter`. Focus therefore offers 15, 30, or 60 minutes, not a hidden or unsupported five-minute wall-clock mode. Sources: [intervalTooShort](https://developer.apple.com/documentation/deviceactivity/deviceactivitycenter/monitoringerror/intervaltooshort), [DeviceActivitySchedule](https://developer.apple.com/documentation/deviceactivity/deviceactivityschedule).

A Focus session is a **wall-clock access window**: leaving the target app or locking the phone does not pause it. Setup briefly remains in a scheduled, shielded state before foreground activation. The intended end is persisted as an absolute date; the monitoring schedule is nonrepeating. A scheduled start is not itself permission to unshield: host activation must verify that the session is still current and registration succeeded.

Apple describes schedule boundaries as the earliest possible callback times. `intervalDidEnd` occurs when the device is first used outside the interval, or when an ongoing monitor is stopped, and is invoked only while the device is in use. `nextInterval` additionally states that callbacks depend on device use during the interval. Consequently, an interval ending while the device is locked or powered off is **not** an exact background alarm. Sources: [intervalDidEnd](https://developer.apple.com/documentation/deviceactivity/deviceactivitymonitor/intervaldidend(for:)), [nextInterval](https://developer.apple.com/documentation/deviceactivity/deviceactivityschedule/nextinterval).

The initializer says registering when the current time is already inside the interval invokes the start callback immediately. This creates a persistence/registration race to handle, not a reason to let the monitor independently grant access. `repeats: false` stops callbacks after the first interval end. Source: [schedule initializer](https://developer.apple.com/documentation/deviceactivity/deviceactivityschedule/init(intervalstart:intervalend:repeats:warningtime:)).

Stopping an ongoing activity can itself cause an end callback. Session-specific activity identities prevent a late callback from a cancelled session from ending a later session. `stopMonitoring` with an empty list stops all monitored activities, so callers must use explicit owned activity names when appropriate. Sources: [intervalDidEnd](https://developer.apple.com/documentation/deviceactivity/deviceactivitymonitor/intervaldidend(for:)), [stopMonitoring](https://developer.apple.com/documentation/deviceactivity/deviceactivitycenter/stopmonitoring(_:)).

### Cumulative usage is different

`DeviceActivityEvent` accumulates the time selected applications, categories, or web domains are frontmost. Its threshold callback concerns that accumulated usage. A five-minute event inside a fifteen-minute schedule would be a usage budget, **not five minutes since temporary access was granted**. Locked time or time spent in unrelated apps is not selected-app usage. Sources: [DeviceActivityEvent](https://developer.apple.com/documentation/deviceactivity/deviceactivityevent), [threshold](https://developer.apple.com/documentation/deviceactivity/deviceactivityevent/threshold), [eventDidReachThreshold](https://developer.apple.com/documentation/deviceactivity/deviceactivitymonitor/eventdidreachthreshold(_:activity:)).

`includesPastActivity` (iOS 17.4+) controls whether use before event registration contributes. When enabled, Apple documents inclusion back to the preceding round hour even if the schedule starts partway through that hour. Focus does not register usage-threshold events: the product's lease is wall-clock time, and substituting usage callbacks would change its meaning. Source: [includesPastActivity](https://developer.apple.com/documentation/deviceactivity/deviceactivityevent/includespastactivity).

### Dates, termination, reboot, and remaining uncertainty

- `nextInterval` is calculated from the supplied date components and calendar using `nextTimePreservingSmallerComponents`; the default calendar is `Calendar.current`. Apple says the end date is based on wall-clock time despite timezone changes during an interval. Focus's persisted dates and schedule still require device tests across midnight, daylight-saving changes, manual date changes, and timezone changes. Source: [nextInterval](https://developer.apple.com/documentation/deviceactivity/deviceactivityschedule/nextinterval).
- Apple presents Device Activity monitor extensions as able to execute without the host app running. That establishes the intended mechanism, not a latency guarantee. The cited current API pages provide **no maximum delivery delay, exact-expiry guarantee, or first-unlock-after-reboot guarantee**. Source: [WWDC21: Meet the Screen Time API](https://developer.apple.com/videos/play/wwdc2021/10123/) (approximately 9:32–10:19), plus the interval documentation above.
- Focus's foreground reconciliation can reapply shields when execution resumes; a foreground timer cannot make background expiry reliable. The monitor attempts re-shielding on a matching end callback. Shield setters themselves are not proof of the target app's observed on-screen state.
- Cold host launch conservatively cancels outstanding leases. A detected wall-clock/uptime mismatch cancels access while code is executing. These policies cannot run at boot or during suspension without an OS execution opportunity. An unshielded window may remain until a callback or host execution; the prototype does not guarantee blocking the first target-app frame after reboot or force quit.
- Persistent/shared state can be unavailable before first unlock after reboot, malformed, or inaccessible because of provisioning. Focus must not grant new access when state or monitoring cannot be established. If selection cannot be recovered, it cannot manufacture opaque tokens to restore a shield; preserve existing settings where possible and surface the failure on next host execution.
- Observed authorization denial/revocation means enforcement is unavailable. No local reconciliation can override a user's revoked authorization.
- Current `.individual` behavior of the iOS 26.5 host-opening case, picker/token edge cases, actual shield propagation, extension delivery, and registration persistence across reboot remain **unvalidated physical-device behavior**.

As secondary evidence rather than a specification, an Apple DTS response acknowledged a usage-threshold callback regression in January 2026. That response does not establish whether a particular later OS build is affected or fixed; this prototype makes no such claim. Source: [Apple Developer Forums, thread 809410](https://developer.apple.com/forums/thread/809410).

No claim of exact five-minute expiry, exact fifteen-minute re-shielding, or guaranteed enforcement while terminated/rebooting is supported by this research or by simulator compilation.
