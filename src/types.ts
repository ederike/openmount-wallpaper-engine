export type MediaKind = "image" | "video";

export interface MountNode {
  id: string;
  parent_id: string | null;
  display_name: string;
  original_path: string;
  is_folder: boolean;
  selected: boolean;
  continuous_detection: boolean;
  detection_locked: boolean;
  custom_order: number;
  created_at: string;
}

export interface MountNodeView extends MountNode {
  exists: boolean;
  size: number | null;
  modified_at: number | null;
  media_kind: MediaKind | null;
  child_count: number;
}

export type ViewMode = "list" | "thumb" | "tree";
export type SortKey = "custom" | "name" | "modified" | "size" | "type";
export type KindFilter = "all" | "image" | "video" | "folder" | "missing" | "detected";

export interface SortSpec {
  key: SortKey;
  ascending: boolean;
}

export type PlaybackMode = "traditional" | "scroll";
export type TraditionalOrder = "custom" | "name_asc" | "name_desc" | "random";
export type VideoEndAction = "next" | "loop";
export type FillMode = "cover" | "contain" | "stretch" | "tile" | "center";
export type ScrollDirection = "ltr" | "rtl";

export interface TraditionalSettings {
  order: TraditionalOrder;
  avoid_consecutive_repeat: boolean;
  image_dwell_ms: number;
  video_end_action: VideoEndAction;
  fade_enabled: boolean;
  fade_ms: number;
  fill_mode: FillMode;
  background_color: string;
}

export interface ScrollSettings {
  direction: ScrollDirection;
  speed_preset: number;
  speed_px_per_sec: number;
  gap_px: number;
  opacity: number;
  loop_enabled: boolean;
  preload_seconds: number;
}

export interface PlaybackSettings {
  mode: PlaybackMode;
  traditional: TraditionalSettings;
  scroll: ScrollSettings;
}

export interface PlaybackItem {
  node_id: string;
  path: string;
  display_name: string;
  kind: MediaKind | string;
}

export interface EngineState {
  running: boolean;
  paused: boolean;
  mode: PlaybackMode;
  pool: PlaybackItem[];
  current_index: number;
  settings: PlaybackSettings;
}

export interface ShortcutBinding {
  action: string;
  accelerator: string;
}

export interface RefreshReport {
  added: number;
  removed: number;
  missing: number;
}

export const ACTION_LABELS: Record<string, string> = {
  toggle_window: "Show / hide main window",
  play_pause: "Play / pause wallpaper",
  next: "Next item",
  prev: "Previous item",
  scroll_faster: "Increase scroll speed",
  scroll_slower: "Decrease scroll speed",
  refresh: "Refresh current folder",
  mount: "Mount files or folder",
  select_all_playable: "Select all in view for playback",
  search: "Focus search",
  settings: "Open settings",
  delete: "Remove selected mounts",
};
