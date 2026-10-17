use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MountNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub display_name: String,
    pub original_path: String,
    pub is_folder: bool,
    pub selected: bool,
    pub continuous_detection: bool,
    pub detection_locked: bool,
    pub custom_order: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MountNodeView {
    pub id: String,
    pub parent_id: Option<String>,
    pub display_name: String,
    pub original_path: String,
    pub is_folder: bool,
    pub selected: bool,
    pub continuous_detection: bool,
    pub detection_locked: bool,
    pub custom_order: i64,
    pub created_at: String,
    pub exists: bool,
    pub size: Option<u64>,
    pub modified_at: Option<i64>,
    pub media_kind: Option<String>,
    pub child_count: i64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ViewMode {
    #[default]
    List,
    Thumb,
    Tree,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SortKey {
    #[default]
    Custom,
    Name,
    Modified,
    Size,
    Type,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SortSpec {
    pub key: SortKey,
    pub ascending: bool,
}

impl Default for SortSpec {
    fn default() -> Self {
        Self {
            key: SortKey::Custom,
            ascending: true,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum PlaybackMode {
    #[default]
    Traditional,
    Scroll,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TraditionalOrder {
    #[default]
    Custom,
    NameAsc,
    NameDesc,
    Random,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum VideoEndAction {
    #[default]
    Next,
    Loop,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum FillMode {
    #[default]
    Cover,
    Contain,
    Stretch,
    Tile,
    Center,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ScrollDirection {
    #[default]
    Ltr,
    Rtl,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TraditionalSettings {
    pub order: TraditionalOrder,
    pub avoid_consecutive_repeat: bool,
    pub image_dwell_ms: u64,
    pub video_end_action: VideoEndAction,
    pub fade_enabled: bool,
    pub fade_ms: u64,
    pub fill_mode: FillMode,
    pub background_color: String,
}

impl Default for TraditionalSettings {
    fn default() -> Self {
        Self {
            order: TraditionalOrder::Custom,
            avoid_consecutive_repeat: true,
            image_dwell_ms: 8000,
            video_end_action: VideoEndAction::Next,
            fade_enabled: true,
            fade_ms: 600,
            fill_mode: FillMode::Cover,
            background_color: "#0e1116".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScrollSettings {
    pub direction: ScrollDirection,
    pub speed_preset: u8,
    pub speed_px_per_sec: f64,
    pub gap_px: f64,
    pub opacity: f64,
    pub loop_enabled: bool,
    pub preload_seconds: f64,
}

impl Default for ScrollSettings {
    fn default() -> Self {
        Self {
            direction: ScrollDirection::Ltr,
            speed_preset: 4,
            speed_px_per_sec: 40.0,
            gap_px: 2.0,
            opacity: 1.0,
            loop_enabled: true,
            preload_seconds: 2.0,
        }
    }
}

impl ScrollSettings {
    pub fn apply_preset(&mut self, preset: u8) {
        let preset = preset.clamp(1, 10);
        self.speed_preset = preset;
        const SPEEDS: [f64; 10] = [8.0, 16.0, 24.0, 40.0, 64.0, 96.0, 140.0, 200.0, 280.0, 400.0];
        self.speed_px_per_sec = SPEEDS[(preset as usize) - 1];
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlaybackSettings {
    pub mode: PlaybackMode,
    pub traditional: TraditionalSettings,
    pub scroll: ScrollSettings,
}

impl Default for PlaybackSettings {
    fn default() -> Self {
        Self {
            mode: PlaybackMode::Traditional,
            traditional: TraditionalSettings::default(),
            scroll: ScrollSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShortcutBinding {
    pub action: String,
    pub accelerator: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PlaybackItem {
    pub node_id: String,
    pub path: String,
    pub display_name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EngineState {
    pub running: bool,
    pub paused: bool,
    pub mode: PlaybackMode,
    pub pool: Vec<PlaybackItem>,
    pub current_index: usize,
    pub settings: PlaybackSettings,
}

impl Default for EngineState {
    fn default() -> Self {
        Self {
            running: false,
            paused: false,
            mode: PlaybackMode::Traditional,
            pool: Vec::new(),
            current_index: 0,
            settings: PlaybackSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppSnapshot {
    pub nodes: Vec<MountNode>,
    pub settings: serde_json::Value,
    pub shortcuts: Vec<ShortcutBinding>,
    pub playback: PlaybackSettings,
}

pub fn default_shortcuts() -> Vec<ShortcutBinding> {
    vec![
        ShortcutBinding {
            action: "toggle_window".into(),
            accelerator: "CommandOrControl+Shift+W".into(),
        },
        ShortcutBinding {
            action: "play_pause".into(),
            accelerator: "CommandOrControl+P".into(),
        },
        ShortcutBinding {
            action: "next".into(),
            accelerator: "CommandOrControl+Right".into(),
        },
        ShortcutBinding {
            action: "prev".into(),
            accelerator: "CommandOrControl+Left".into(),
        },
        ShortcutBinding {
            action: "scroll_faster".into(),
            accelerator: "CommandOrControl+]".into(),
        },
        ShortcutBinding {
            action: "scroll_slower".into(),
            accelerator: "CommandOrControl+[".into(),
        },
        ShortcutBinding {
            action: "refresh".into(),
            accelerator: "CommandOrControl+R".into(),
        },
        ShortcutBinding {
            action: "mount".into(),
            accelerator: "CommandOrControl+O".into(),
        },
        ShortcutBinding {
            action: "select_all_playable".into(),
            accelerator: "CommandOrControl+A".into(),
        },
        ShortcutBinding {
            action: "search".into(),
            accelerator: "CommandOrControl+F".into(),
        },
        ShortcutBinding {
            action: "settings".into(),
            accelerator: "CommandOrControl+Comma".into(),
        },
        ShortcutBinding {
            action: "delete".into(),
            accelerator: "Delete".into(),
        },
    ]
}
