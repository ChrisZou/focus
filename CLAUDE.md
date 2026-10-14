# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension called "Focus" (专注助手) that helps users stay focused by blocking distracting websites. The extension redirects users to a focused landing page when they try to access configured blocked sites, while tracking statistics about blocked visits and time saved.

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
  - Tracks visit statistics and time saved
  - Handles temporary disable functionality
  - Manages user settings through Chrome storage API

- **popup.js/popup.html**: Extension popup interface
  - Shows today's blocked visit count
  - Provides temporary disable buttons (1 min, 5 min, 1 hour)
  - Displays countdown timer when blocking is disabled
  - Links to settings page

- **settings.js/settings.html**: Full settings management page
  - Add/remove blocked websites
  - Configure custom focus message
  - View statistics (total sites, blocked visits, time saved)
  - Manage blocked sites list with domain validation

- **confirm.js/confirm.html**: Interstitial for daily-limited sites
  - Shows remaining visits today and a 确认进入 button
  - Sends `confirmVisit` to background.js, which re-checks the limit, counts, and navigates to the target

- **redirect.js/redirect.html**: The focus page users see when redirected
  - Displays custom focus message
  - Shows statistics about blocked visits and time saved
  - Receives parameters from background.js about the blocked site

### Data Storage

Uses Chrome's `chrome.storage.local` API to persist:
- `blockedSites`: Array of blocked site objects with {domain, name, avgTime, dailyLimit?}
- `dailyVisitCounts`: `{ 'YYYY-MM-DD': { domain: count } }` allowed visits under the daily limit (local date; only today is kept)
- `tabVisits` (chrome.storage.session): tabId -> 'date|domain', so in-site navigation in the same tab counts as one visit
- `allowList`: Array of allow rule strings (domain or domain/path prefix)
- `visitStats`: Daily statistics by date and domain
- `totalSavedTime`: Cumulative time saved in minutes
- `disableEndTime`: Timestamp when temporary disable expires
- `customMessage`: User's custom focus message
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

A blocked site with `dailyLimit` (positive integer) allows the first N visits per local calendar day, then blocks as usual. Each new visit first goes to `confirm.html` (shows 今天还剩 N 次 + 确认进入); only clicking confirm (`confirmVisit` message) counts the visit, writes `tabVisits` for that tab (which also acts as the pass so the follow-up navigation isn't intercepted again) and navigates to the original URL. At 0 remaining the redirect page is shown directly. A visit = entering the site in a tab (navigations within the site in the same tab don't count again; leaving and coming back does). Whitelisted URLs are not counted. Set in the settings page (add form or "设置限额" button); popup shows remaining visits.

Blocked sites match the domain and all subdomains (e.g. `bilibili.com` also blocks `space.bilibili.com`); allow list is checked first.

## Key Features

1. **Website Blocking**: Intercepts navigation to blocked sites and redirects to focus page
2. **Statistics Tracking**: Counts blocked visits and estimates time saved
3. **Temporary Disable**: Users can pause blocking for 1 min, 5 min, or 1 hour
4. **Custom Messages**: Users can set personalized focus reminders
5. **Site Management**: Add/remove blocked sites with domain validation
6. **Real-time Updates**: All components sync via Chrome messaging API

## File Structure

- `manifest.json`: Extension manifest (v3)
- `background.js`: Service worker for core blocking logic
- `popup.html/js`: Extension popup interface
- `settings.html/js`: Settings management page
- `redirect.html/js`: Focus redirection page
- `icons/`: Extension icons in various sizes
- `icon.svg`: Source icon file

## Development Notes

- No build process required - direct JavaScript files
- Uses Chrome Extension Manifest V3
- All styling is inline CSS (no external stylesheets)
- Chinese language interface
- Follows Chrome extension security policies
- Uses modern JavaScript features (async/await, arrow functions)