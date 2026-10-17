# Architecture

OpenMount Wallpaper Engine (OMWE) is a local-only desktop app. The control window is a file-manager UI. The wallpaper itself is a second window parked on the desktop.

```
┌──────────────────────┐     invoke / events      ┌─────────────────────┐
│  React control UI    │ ◄──────────────────────► │  Tauri / Rust       │
│  (main window)       │                          │  commands, tray     │
└──────────────────────┘                          └──────────┬──────────┘
                                                             │
                                                             ▼
                                                  ┌─────────────────────┐
                                                  │  omwe-core          │
                                                  │  SQLite mount tree  │
                                                  │  playback pool      │
                                                  └──────────┬──────────┘
                                                             │
                                                             ▼
┌──────────────────────┐                          ┌─────────────────────┐
│  Wallpaper renderer  │ ◄── engine://state ───── │  Wallpaper window   │
│  traditional / scroll│                          │  desktop-attached   │
└──────────────────────┘                          └─────────────────────┘
```

## Persistence

Application data lives in the OS app-data directory as `omwe.sqlite3`.

- `mount_nodes` — virtual tree (paths, selection, detection, custom order)
- `settings` — playback JSON and miscellaneous keys
- `shortcuts` — accelerator bindings

Closing the main window hides it. The wallpaper window and tray keep running.

## Platform wallpaper attachment

- **Windows**: parent the wallpaper HWND to the desktop `WorkerW` created behind icons. Fallback: always-on-bottom click-through window.
- **macOS**: `NSWindow` desktop window level plus `CanJoinAllSpaces`.
- **Linux (dev only)**: always-on-bottom overlay. Not a v1.0 shipping target.

## Media

v1 plays files the system webview can decode (images plus typical `mp4` / `webm` / `mov`). `mkv` / `avi` are mounted and listed; playback quality depends on the OS decoder. FFmpeg integration is the documented extension point in `omwe-core::media`.

## Extension points

- `omwe-core::mount` — mapping rules, refresh, selection
- `omwe-core::playback::build_pool` — what the engine will play
- `src/WallpaperApp.tsx` — how frames are drawn
- `src-tauri/src/wallpaper` — how the window is attached to the desktop
