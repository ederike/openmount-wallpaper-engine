# Playback engine

## Pool

Leaves that are selected, exist on disk, and have a supported media kind enter the pool. Duplicate mounts of one file appear twice if both are selected. Order follows the mount tree’s `custom_order` (drag reorder), then optional name/random sorts in traditional mode.

## Traditional mode

The wallpaper renderer shows the current pool item.

- Images advance after `image_dwell_ms`
- Videos advance on `ended`, or loop when configured
- Optional cross-fade
- Fill modes: cover, contain, stretch, tile, center
- Background color shows through when the frame does not cover the display

## Scroll mode

Every pool item is scaled so its height equals the primary display height, then laid out left-to-right with a configurable gap (default 2px). The canvas translates at `speed_px_per_sec`.

Layout sizes come from image file headers in Rust (parallel, cached by path + mtime), so a pool of 10,000 1K photos does not load every file through the webview. Only items inside the screen plus `preload_seconds * speed` (capped at four screen widths) are decoded. Nearby lookup is a prefix-sum binary search. Images are decoded off-thread at display size and blitted to a viewport canvas; at most two asset-protocol loads run at once, with retries. This keeps macOS WKWebView from hitching on each new file or dropping requests when preload is high.

Order options:

- by folder, custom order inside each folder
- by folder, name order inside each folder
- flatten all files by name, modified time, or random

Only the video with the largest on-screen overlap plays. Up to two nearby videos keep a decoder warm. Other videos release their decoder so adjacent clips do not stutter.

Pause keeps the current offset. Next/previous snaps the leading image so its entering edge aligns with the screen edge, then the canvas continues from there.

## Controls

Play, pause, next, previous, reset scroll, and speed nudges are available from the toolbar, tray, and global shortcuts. Shortcut bindings persist in SQLite and re-register on change.
