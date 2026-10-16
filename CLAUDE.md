# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension called "Focus 1.5" (专注助手) that helps users stay focused by blocking distracting websites. The extension redirects users to a focused landing page when they try to access configured blocked sites, while tracking statistics about blocked visits.

## Development Commands

This project has no build system - it's a plain JavaScript Chrome extension. To develop:

1. **Load extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the project directory

2. **Reload after changes**:
   - Click the reload icon in `chrome://extensions/` for the Focus extension
   - Or use `Ctrl+R` (Chrome will prompt to reload the extension)

## Architecture

### Core Components

The extension consists of several key JavaScript files:

- **background.js**: Service worker that handles the core blocking logic
  - Manages blocked sites list (default and user-configured)
  - Intercepts navigation events via `chrome.webNavigation.onBeforeNavigate`
  - Tracks visit statistics
  - Manages user settings through Chrome storage API

- **popup.js/popup.html**: Extension popup interface
  - Shows today's blocked visit count
  - Always shows the green-dot status 正在保持专注
  - Shows remaining daily visits
  - Links to settings page

- **settings.js/settings.html**: Full settings management page
  - Add/remove blocked websites
  - Configure custom focus message
  - View statistics (total sites, blocked visits)
  - Manage blocked sites list with domain validation

- **confirm.js/confirm.html**: Interstitial for daily-limited sites
  - Headline 你确定、一定以及肯定，现在就要访问{site}吗？ plus remaining visits (N 次 / 已用 used / limit)
  - User must manually type 是的，我确定一定以及肯定现在就要访问 {site}; match ignores whitespace, full/half-width (NFKC) and case; 确认进入 stays disabled until it matches
  - Paste, drop, and beforeinput insertFromPaste/insertFromDrop/insertReplacementText are blocked on the input; copy/cut/select/context menu blocked on the shown phrase; IME composition still works
  - Flat single-surface layout (design-taste-frontend style), system fonts only (no remote fonts, MV3 CSP)
  - Sends `confirmVisit` to background.js, which re-checks the limit, counts, and navigates to the target

- **redirect.js/redirect.html**: The focus page users see when redirected
  - Displays custom focus message
  - Shows statistics about blocked visits
  - Receives parameters from background.js about the blocked site

### Data Storage

Uses Chrome's `chrome.storage.local` API to persist:
- `blockedSites`: Array of blocked site objects with {domain, name, dailyLimit?}
- `dailyVisitCounts`: `{ 'YYYY-MM-DD': { domain: count } }` allowed visits under the daily limit (local date; only today is kept)
- `tabVisits` (chrome.storage.session): tabId -> 'date|domain', so in-site navigation in the same tab counts as one visit
- `allowList`: Array of allow rule strings (domain or domain/path prefix)
- `visitStats`: Daily statistics by date and domain
- `customMessage`, `messageSource`, `messageAvatar`: Custom focus message, optional author and avatar URL
- `userId`: Generated UUID for user identification

### Default Blocked Sites

The extension comes with pre-configured blocked sites:
- X (Twitter) - x.com, twitter.com
- YouTube - youtube.com  
- 小红书 - xiaohongshu.com
- B站 - bilibili.com

### Allow List (白名单)

Stored in `chrome.storage.local` under `allowList` (array of strings), managed from the settings page. Default: `creator.xiaohongshu.com`. Rules take two forms:
- Domain only (e.g. `creator.xiaohongshu.com`): matches that host and all its subdomains
- Domain + path prefix (e.g. `space.bilibili.com/12345`): matches that path and everything under it

### Daily Visit Limit (每日访问限额)

A blocked site with `dailyLimit` (positive integer) allows the first N visits per local calendar day, then blocks as usual. Each new visit first goes to `confirm.html` (shows the 你确定…吗？ headline, remaining visits, and requires manually typing the confirmation phrase before 确认进入 enables); only clicking confirm (`confirmVisit` message) counts the visit, writes `tabVisits` for that tab (which also acts as the pass so the follow-up navigation isn't intercepted again) and navigates to the original URL. At 0 remaining the redirect page is shown directly. A visit = entering the site in a tab (navigations within the site in the same tab don't count again; leaving and coming back does). Whitelisted URLs are not counted. Set in the settings page (add form or "修改限额" inline editor); popup shows remaining visits.

Blocked sites match the domain and all subdomains (e.g. `bilibili.com` also blocks `space.bilibili.com`); allow list is checked first.

## Key Features

1. **Website Blocking**: Intercepts navigation to blocked sites and redirects to focus page
2. **Statistics Tracking**: Counts blocked visits
3. **Daily Limits**: Typed confirmation before each allowed visit; inline limit editing
4. **Custom Messages**: Users can set personalized focus reminders
5. **Site Management**: Add/remove blocked sites with domain validation
6. **Real-time Updates**: All components sync via Chrome messaging API

## File Structure

- `manifest.json`: Extension manifest (v3)
- `background.js`: Service worker for core blocking logic
- `popup.html/js`: Extension popup interface
- `settings.html/js`: Settings management page
- `redirect.html/js`: Focus redirection page
- `confirm.html/js`: Typed daily-visit confirmation page
- `styles.css`: Shared colors, typography, controls, focus states, and utilities
- `icons/`: Extension icons in various sizes
- `icon.svg`: Source icon file

## Development Notes

- No build process required - direct JavaScript files
- Uses Chrome Extension Manifest V3
- `styles.css` is the shared design system, based on the approved `sys.css` mockup: warm neutral background, ink rules, accent buttons, green success indicators, system fonts only. All four HTML pages link it; page-specific layouts stay in `<style>` blocks. No inline scripts or event handlers (MV3 CSP).
- Average-time estimates and hours-saved statistics have been removed. Legacy estimate fields are ignored and removed on install/update, along with old pause timestamps; existing lists, daily limits and blocked counts are preserved. Temporary allow has been removed entirely, including its messages, timers and controls. Legacy field names appear only in the storage migration.
- Settings uses two-column sections and inline daily-limit editing: 确定 / Enter saves, 取消 / Escape cancels. Blank or 0 means always blocked; invalid input gets the status toast. Delete still uses `confirm()`.
- Popup shows daily remaining visits and the always-active status; redirect shows the custom headline, optional loaded avatar/source, daily-limit notice, and blocked count. The attempted-site line uses the `domain` URL parameter supplied by the background worker and is hidden when absent.
- Chinese language interface
- Follows Chrome extension security policies
- Uses modern JavaScript features (async/await, arrow functions)
