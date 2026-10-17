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

A video starts when its left edge enters the visible region and pauses when its right edge leaves.

## Controls

Play, pause, next, previous, reset scroll, and speed nudges are available from the toolbar, tray, and global shortcuts. Shortcut bindings persist in SQLite and re-register on change.
