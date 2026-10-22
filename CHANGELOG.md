# Changelog

## 0.2.3 — 2026-10-22

- Scroll mode pre-decodes nearby images off the main thread and paints them on a viewport canvas, so new frames no longer hitch the reel on macOS
- `preload_seconds` now actually warms the next media; loads are capped at 2 concurrent asset requests with retries so a high preload value no longer floods WKWebView and fails images
- Scroll layout reads image headers in Rust (cached) instead of decoding the whole 10k+ pool in the webview; visible items are found with a prefix-sum binary search
- Windows: a single tray icon (app icon + menu). Config and code used to each create one, so minimize showed a real icon and a blank icon that owned the menu

## 0.2.2 — 2026-10-21

- Windows 11 24H2: embed the wallpaper under desktop icons (`Progman` / `SHELLDLL_DefView`) instead of covering shortcuts like a fullscreen window
- macOS: pin the wallpaper at desktop window level and re-pin after un-minimize / dock reopen so it cannot cover Finder icons or the settings window
- Scroll canvas relayouts to the live window height so it fills the screen instead of leaving a black band
- Shortcut settings capture a key combination on click instead of typed accelerator text

## 0.2.1 — 2026-10-20

- Status bar stays a 28px footer instead of covering the main window when no update banner is shown

## 0.2.0 — 2026-10-17

- Chinese UI with a language switch, plus English
- Scroll mode is continuous: pause/resume keeps the current offset
- Scroll next/prev snaps the leading image to the screen edge instead of jumping to the first item
- In-app version check and updater
- Settings unified into Config + Shortcuts, with a mode selector
- Thumbnails for images and videos, with adjustable preview size
- App icon replaced with the project mark
- Delete confirmation layout no longer overlaps
- Only one scroll-mode video decoder is active at a time

## 0.1.0 — 2026-10-17

Initial public implementation of OpenMount Wallpaper Engine against the v1.0 PRD.
Licensed under GPL-3.0-or-later.

- Virtual mount tree with duplicate mounts, recursive selection, and continuous detection
- Traditional slideshow and scroll-canvas wallpaper renderer
- SQLite persistence, config export/import, tray, and global playback shortcuts
- Windows desktop WorkerW attachment and macOS desktop window level
