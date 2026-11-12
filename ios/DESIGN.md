# Focus native interface

Mode: **Operate**. The user's explicit flat SwiftUI direction governs this surface; no website identity, decorative card system, or asset generation is introduced. Applied local Impeccable iOS/craft guidance. Scope is the new `ios/` app only.

- System navigation title “Focus”; toolbar icons for selection and timing information.
- One readable column, max width 560 pt, 24 pt horizontal inset; 28–32 pt between functional groups, 8–16 pt within them.
- Semantic `systemBackground`, primary/secondary label colors; system blue for actions and system red for actionable errors. Both appearances follow iOS.
- SF system text styles: title2 for purpose, headline for current enforcement state, body for input, callout/footnote only for necessary limitations/errors. No fixed font point sizes, slogans, eyebrow labels, shadows, gradients, or nested cards.
- Duration follows valid purpose entry; 15/30/60 choices use a segmented control, switching to a native menu at accessibility Dynamic Type sizes. Controls have native large sizing or at least 44 pt bounds. Scrolling and multiline text support larger text and landscape.
- The system picker is a focused sheet with Cancel/Save. Failed saves retain the draft and show the error in that sheet. Normal operations remain on one page.
- Status language distinguishes “已设置屏蔽”, “临时允许”, and “计划结束”; it does not claim verified enforcement or exact expiry. Necessary timing limits remain visible before granting access.
- System interactions only; no custom animated motion requiring a Reduce Motion exception. Icons have accessible labels; loading authorization retains a spoken name.

Independent source review found and prompted fixes to failed-save dismissal and the authorization loading label. No screenshots or rendered accessibility checks were performed, following the user's no-GUI constraint. Small-screen layout, Dark Mode, high contrast, VoiceOver, and large Dynamic Type still need real rendering/device inspection; this document is not visual proof.
