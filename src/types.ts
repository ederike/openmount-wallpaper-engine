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
export type ScrollOrder =
  | "folder_custom"
  | "folder_name"
  | "all_name_asc"
  | "all_name_desc"
  | "all_modified"
  | "random";

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
  order: ScrollOrder;
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

export type Locale = "zh" | "en";
