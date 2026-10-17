# Contributing to OpenMount Wallpaper Engine

## Development setup

- Rust 1.90+
- Node.js 20+
- Platform webview deps (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

```bash
npm install
cargo test -p omwe-core
npm run tauri dev
```

## Layout

| Path | Role |
|------|------|
| `crates/omwe-core` | Mount tree, SQLite, playback pool. No GUI. |
| `src-tauri` | Tauri commands, tray, global shortcuts, desktop wallpaper window |
| `src` | React control surface and wallpaper renderer |

Keep original-file mutations opt-in. Mapping delete is the default.

## Tests

`omwe-core` is the required test target for pull requests:

```bash
cargo test -p omwe-core
npx tsc --noEmit
```

## Pull requests

1. One concern per PR.
2. Update `docs/` when you change mount or playback rules.
3. Do not add network calls that upload user media.
