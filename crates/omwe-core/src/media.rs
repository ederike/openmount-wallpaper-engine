use std::path::{Path, PathBuf};

const IMAGE_EXT: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff", "tif"];
const VIDEO_EXT: &[&str] = &["mp4", "mkv", "mov", "webm", "avi"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Image,
    Video,
}

pub fn extension_lower(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
}

pub fn media_kind(path: &Path) -> Option<MediaKind> {
    let ext = extension_lower(path)?;
    if IMAGE_EXT.iter().any(|e| *e == ext) {
        Some(MediaKind::Image)
    } else if VIDEO_EXT.iter().any(|e| *e == ext) {
        Some(MediaKind::Video)
    } else {
        None
    }
}

pub fn is_playable(path: &Path) -> bool {
    media_kind(path).is_some()
}

/// Resolve a user-supplied path, following a single symlink hop when present.
pub fn resolve_mount_path(path: &Path) -> PathBuf {
    match std::fs::canonicalize(path) {
        Ok(resolved) => resolved,
        Err(_) => path.to_path_buf(),
    }
}

pub fn display_name_of(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_supported_formats() {
        assert_eq!(media_kind(Path::new("a.PNG")), Some(MediaKind::Image));
        assert_eq!(media_kind(Path::new("clip.WebM")), Some(MediaKind::Video));
        assert!(media_kind(Path::new("notes.txt")).is_none());
        assert!(media_kind(Path::new("archive.zip")).is_none());
    }
}
