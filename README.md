# OpenMount Wallpaper Engine (OMWE)

A local, open-source wallpaper engine for **Windows 10/11** and **macOS 12+** (x86_64 and ARM64). Libraries are **mounted as mappings** — files are never copied — then played as a traditional slideshow or a horizontal **scroll canvas**.

中文说明见下方。

## Why this exists

Typical wallpaper tools point at a folder and play everything in it. OMWE treats the library like a file manager:

- Mount files or folders into a virtual tree
- Tick only the leaves you want in the playback pool
- Mount the same original file in more than one place
- Refresh folders that have **continuous detection** so new media appears without remounting
- Play a classic slideshow **or** stitch every selected item to display height and scroll it as a long reel

Original files stay put. Delete in OMWE removes the mapping unless you explicitly confirm deleting the original.

## Features (v0.1)

- File-manager UI: tree, list, thumbnails, search, sort, drag reorder
- Recursive selection checkboxes (pool is leaf-driven)
- Continuous detection + subtree refresh
- Traditional mode: name/custom/random order, dwell, fade, fill modes
- Scroll mode: height-normalized strip, speed presets, video enter/exit
- Global shortcuts, tray, config export/import
- Main window can close while wallpaper keeps running

Product rules: [`OpenMount_Wallpaper_Engine_PRD.md`](./OpenMount_Wallpaper_Engine_PRD.md)

## Screenshot of the idea

The control surface is a three-pane library. The wallpaper is a separate desktop-attached window driven by the same playback pool.

## Install

Official installers will be attached to GitHub Releases:

- Windows: `.msi` / `.exe` for x86_64 (ARM64 when the runner is available)
- macOS: `.dmg` (Apple Silicon; universal build on tagged releases)

## Develop

Prerequisites: Rust 1.90+, Node 20+, [Tauri 2 system deps](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
cargo test -p omwe-core
npm run tauri dev
```

Build a bundle:

```bash
npm run tauri build
```

## Architecture

See [`docs/architecture.md`](docs/architecture.md), [`docs/mount-system.md`](docs/mount-system.md), and [`docs/playback-engine.md`](docs/playback-engine.md).

Core crate `omwe-core` is GUI-free so mount/playback rules can be tested on any host.

## License

OpenMount Wallpaper Engine is free software licensed under [GPL-3.0-or-later](./LICENSE).

---

## 中文

OpenMount Wallpaper Engine 用「映射挂载」管理壁纸，而不是简单指定一个文件夹。

- 挂载只记录路径，不复制、不移动原始文件
- 勾选框决定播放池；文件夹勾选会递归选中子项
- 同一文件可以挂载多次，各自独立选择与排序
- 持续内容检测 + 刷新：同步原目录新增/删除
- 传统幻灯片与卷轴模式（等高横向拼接滚动）
- 关闭主窗口后壁纸仍可通过托盘运行

默认删除只移除映射。删除原始文件必须二次确认。
