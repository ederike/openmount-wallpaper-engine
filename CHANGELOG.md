# Changelog

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
