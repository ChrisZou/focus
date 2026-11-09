# Safari live interception investigation — 2026-11-09

Status: **live homepage root cause is still unproven; do not claim recovery.**

## Evidence and exclusions

- Parent's `/Users/chris/lcu-drv/q/focus-safari-accept-20261109/99-RESULT.txt`: after forcing the background loaded, “t1/t5/t15/t20 still YouTube homepage, blockedHint=false”. The installed `background.js` matches `5507b14`, SHA256 `2f490c65b5fcf825ffdbd153897fdb9e52f8dbf73e0d7585e5d6b931f5dbc0a8`. Wrong JS copy and background wake **alone** do not explain the evidence.
- Current source handles `www.youtube.com` using `extractDomain()` and `hostMatches()`. Missing `blockedSites` uses defaults; an explicitly stored empty array intentionally means no blocks. Domain/path allow rules take priority. Daily-limit passes are stored separately in session storage. Existing/new Node tests cover these paths. **The live values have not been read**, so empty rules, a matching allow rule, a daily-limit pass, and event delivery remain open.
- Isolated native tests use WebKit's actual event dispatcher, Promise `chrome.*`, storage, `getURL`, `tabs.update`, settings/confirm/redirect pages and real tab sender identity. Original 5507b14 passed all three native flow groups in the corrected host. Candidate's latest run passed these plus the real diagnostic-message/named-listener check. Success in this host excludes a universal API incompatibility; it does not prove live Safari permissions, rules, event receipt, or successful page replacement.
- Final candidate testing also had one cold-start failure: initial `getBlockedSites` response was undefined before flow tests ran (`TypeError ... response.success`). A fresh isolated invocation passed. No retry was added to hide this. This is an unresolved native-host startup observation, **not proof that background wake explains the live failure**, especially given parent's loaded-background retest.
- A stronger native test initially found `tabs.update` resolving before a provisional navigation failed with `NSURLErrorDomain -1008`. This was a **test-host configuration error**, not proof about Safari: normal HTTP and extension pages require different WebView configurations. Adding WAR to a signed isolated copy did not resolve it. The corrected host follows WebKit's own [test-host configuration switching](https://github.com/WebKit/WebKit/blob/main/Tools/TestWebKitAPI/Helpers/cocoa/WebExtensionUtilities.mm). No WAR change is shipped.
- WebKit [navigation dispatch](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/Extensions/Cocoa/WebExtensionContextCocoa.mm) checks both API and URL permission. Parent's Website Allow UI evidence is preserved; this investigation did not read/modify Safari's private storage to infer any further grant state.

## Changes and demonstrated fix

- Root `background.js` and synchronized Safari resource: bounded temporary diagnostics, and `await` both confirmation `tabs.update()` calls. No change to interception policy, manifest, matching, defaults, user lists, or event lifecycle.
- Proven confirmation error bug: 5507b14 returns `{success: true}` when `tabs.update` rejects, followed by an unhandled rejection. The regression expects failure and fails on the old source (`true !== false`, 0 pass / 1 fail); candidate passes both the limited-site and changed-rule branches. This is **not established as the homepage fault**. Counts/pass are still recorded before navigation as before; this patch does not add transactional quota rollback or prove page-load completion from an API resolution.
- `safari/tests/behavior.test.mjs`: tests diagnostics defaults/empty/allow/error/bounds, no rule mutation, and confirmation rejection.
- `safari/tests/validate-manifest.swift`, `run-webkit.py`: offscreen, isolated actual WebKit HTTP navigation, extension page load completion, confirmation protocol, refresh, exit/return. No simulated `webNavigation` events in native tests. Typed/paste guard remains covered by Node; native tests call the message protocol rather than type through UI.

## Diagnostics for parent LCU

After installing candidate at the existing live path, open its background inspector and run:

```js
JSON.stringify(await chrome.runtime.sendMessage({action: 'getNavigationDiagnostics'}))
```

Expected `build` is `safari-nav-20261109`; `listeners.before` and `.committed` use Safari-supported `hasListener(namedFunction)`. `stored` preserves missing-vs-explicit values; `effective` reports the actual defaults/rules. No writes occur from this message.

Run the message before navigation, then immediately after the >=20-second YouTube attempt. `events` contains at most 32 main-frame stage records in background memory: `before`, `committed`, `allowed`, `no-block-rule`, `matched`, `visit-pass`, `superseded`, `redirect-request`, `redirect-resolved`, `error`. Website records retain the host rather than full URLs. Console debug receives the same trace; a background reload resets the memory ring and changes `startedAt`. No persistent trace, new UI, polling, or external telemetry is added. Remove diagnostics after identifying and fixing the live fault.

- No fresh events despite loaded inspector and active named listeners: investigate live event/permission delivery; rule matching has not run.
- `allowed` / `no-block-rule` / `visit-pass`: inspect the returned effective rules/session behavior; preserve intentional user configuration.
- `matched` then `superseded`: inspect the observed navigation sequence.
- `redirect-request` then `error`: API rejected; record error.
- `redirect-resolved` without an extension-page `committed`: request acceptance did not prove document replacement; collect the actual provisional failure and resulting URL. The native host's -1008 is not evidence that Safari had the same error.

## Parent live acceptance and restoration

1. Save exact current YouTube rule (including absent vs numeric dailyLimit) and all allow rules before any UI edits. Leave existing original entries intact. Install at the already registered path, preserving bundle IDs; verify installed resource hash, signature and pluginkit path. Candidate signing uses the user's configured Developer ID team W4SX57U6XB; existing live package was ad-hoc. No signing account/settings are changed by the build.
2. With current effective rules, open a new `https://www.youtube.com/` tab and observe at 1/5/15/20 seconds. A stable fully loaded `redirect.html` is required for unconditional blocking. Record diagnostics on failure. If existing rules intentionally allow YouTube, preserve them and report the rule outcome rather than resetting defaults or deleting allow rules.
3. Confirmation: if the existing YouTube rule can be edited without removing a conflicting allow rule, record today's used count `U` (absent=0), temporarily set its `dailyLimit` to **U+1**, preserving its name/domain. Open a fresh tab; reject paste, hand-type the displayed phrase, confirm; verify website stays >=20 seconds, same-tab reload/internal navigation consumes no additional visit, leave to `https://example.com/`, then return: it must block at the now-exhausted limit. This deliberately adds one real confirmed visit; do not erase counters to undo the test.
4. If YouTube is intentionally allowlisted, use a new temporary exact blocked rule `{domain: "example.org", name: "Focus accept", dailyLimit: 1}` only if it is absent from both original lists and has zero used visits. If not, choose another known accessible domain absent from the original rules, with quota U+1. Do not remove an original allow rule for testing.
5. Restore the original YouTube dailyLimit through Focus UI (empty field means unconditional block; restore the original number otherwise), or remove only the newly added test rule. Close only parent-created test tabs. Preserve original lists, counters, session and backup. Parent is responsible for applying/restoring UI rules and the live acceptance.

## Validation commands

```sh
node --test safari/tests/*.test.mjs
xcrun swiftc -parse-as-library safari/tests/validate-manifest.swift -o /tmp/focus-validate-manifest
python3 safari/tests/run-webkit.py /tmp/focus-validate-manifest '/path/to/Focus Extension.appex'
```

Node: 30 pass / 0 fail. Corrected-host baseline: 3 flow groups passed plus manifest/API/page smoke. Final candidate: one invocation failed at the initial message; the next passed 4 flow/diagnostic groups plus manifest/API/page smoke. Build and final package paths, signatures, log paths and commit/push result are recorded in the `/tmp` handoff summary after final verification.

No Computer Use, SkyComputerUse, LCU, GUI automation, Safari quit, user storage reset, App Store publish, live package replacement, or backup changes were performed. Offscreen WebKit tests create no NSWindow and use nonpersistent storage plus a loopback-only fixture server.
