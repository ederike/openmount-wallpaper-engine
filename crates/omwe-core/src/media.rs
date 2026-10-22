use crate::models::PlaybackItem;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::{Instant, UNIX_EPOCH};

const IMAGE_EXT: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "gif", "tiff", "tif", "heic", "heif", "avif"];
const VIDEO_EXT: &[&str] = &["mp4", "mkv", "mov", "webm", "avi"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MediaSize {
    pub node_id: String,
    pub width: u32,
    pub height: u32,
}

struct CachedSize {
    len: u64,
    mtime: i64,
    width: u32,
    height: u32,
}

static SIZE_CACHE: LazyLock<Mutex<HashMap<String, CachedSize>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

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

fn file_stamp(path: &Path) -> Option<(u64, i64)> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    Some((meta.len(), mtime))
}

fn cache_lock() -> std::sync::MutexGuard<'static, HashMap<String, CachedSize>> {
    SIZE_CACHE.lock().unwrap_or_else(|err| err.into_inner())
}

fn probe_image_header(path: &Path) -> Option<(u32, u32)> {
    if let Ok(size) = imagesize::size(path) {
        if size.width > 0 && size.height > 0 {
            return Some((size.width as u32, size.height as u32));
        }
    }
    probe_bmff_ispe(path)
}

/// Walk ISO-BMFF boxes (HEIC/HEIF/AVIF) looking for an `ispe` spatial extent.
fn probe_bmff_ispe(path: &Path) -> Option<(u32, u32)> {
    let mut file = File::open(path).ok()?;
    let end = file.metadata().ok()?.len();
    walk_bmff(&mut file, 0, end, 0)
}

fn walk_bmff(file: &mut File, start: u64, end: u64, depth: u8) -> Option<(u32, u32)> {
    if depth > 14 || start + 8 > end {
        return None;
    }
    let mut pos = start;
    while pos + 8 <= end {
        file.seek(SeekFrom::Start(pos)).ok()?;
        let mut hdr = [0u8; 8];
        file.read_exact(&mut hdr).ok()?;
        let mut size = u32::from_be_bytes([hdr[0], hdr[1], hdr[2], hdr[3]]) as u64;
        let kind = [hdr[4], hdr[5], hdr[6], hdr[7]];
        let mut header_len = 8u64;
        if size == 1 {
            let mut ext = [0u8; 8];
            file.read_exact(&mut ext).ok()?;
            size = u64::from_be_bytes(ext);
            header_len = 16;
        } else if size == 0 {
            size = end.saturating_sub(pos);
        }
        if size < header_len {
            break;
        }
        let box_end = pos.saturating_add(size).min(end);
        if &kind == b"ispe" {
            let mut body = [0u8; 12];
            file.read_exact(&mut body).ok()?;
            let width = u32::from_be_bytes([body[4], body[5], body[6], body[7]]);
            let height = u32::from_be_bytes([body[8], body[9], body[10], body[11]]);
            if width > 0 && height > 0 {
                return Some((width, height));
            }
        } else if matches!(
            &kind,
            b"moov" | b"trak" | b"mdia" | b"minf" | b"stbl" | b"meta" | b"iprp" | b"ipco"
        ) {
            let extra = if &kind == b"meta" { 4 } else { 0 };
            let child = pos + header_len + extra;
            if child < box_end {
                if let Some(size) = walk_bmff(file, child, box_end, depth + 1) {
                    return Some(size);
                }
            }
        }
        pos = box_end;
    }
    None
}

fn probe_one(kind: &str, path: &str) -> (u32, u32) {
    if kind != "image" {
        return (0, 0);
    }
    let stamp = file_stamp(Path::new(path));
    if let Some((len, mtime)) = stamp {
        let cache = cache_lock();
        if let Some(hit) = cache.get(path) {
            if hit.len == len && hit.mtime == mtime {
                return (hit.width, hit.height);
            }
        }
    }
    let (width, height) = probe_image_header(Path::new(path)).unwrap_or((16, 9));
    if let Some((len, mtime)) = stamp {
        cache_lock().insert(
            path.to_string(),
            CachedSize {
                len,
                mtime,
                width,
                height,
            },
        );
    }
    (width, height)
}

/// Header-only size probe for a playback pool. Images are parallelized; videos
/// return 0×0 so the renderer can fetch metadata only for those few items.
pub fn probe_item_sizes(items: &[PlaybackItem]) -> Vec<MediaSize> {
    if items.is_empty() {
        return Vec::new();
    }
    let started = Instant::now();
    let thread_count = 8.min(items.len()).max(1);
    let chunk_size = items.len().div_ceil(thread_count);
    let sizes = std::thread::scope(|scope| {
        let joins: Vec<_> = items
            .chunks(chunk_size)
            .map(|chunk| {
                scope.spawn(move || {
                    chunk
                        .iter()
                        .map(|item| {
                            let (width, height) = probe_one(&item.kind, &item.path);
                            MediaSize {
                                node_id: item.node_id.clone(),
                                width,
                                height,
                            }
                        })
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        joins
            .into_iter()
            .flat_map(|join| join.join().unwrap_or_default())
            .collect::<Vec<_>>()
    });
    log::info!(
        "probed {} media headers in {:?}",
        sizes.len(),
        started.elapsed()
    );
    sizes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::PlaybackItem;
    use std::fs;
    use tempfile::tempdir;

    const PNG_1X1: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];

    #[test]
    fn classifies_supported_formats() {
        assert_eq!(media_kind(Path::new("a.PNG")), Some(MediaKind::Image));
        assert_eq!(media_kind(Path::new("clip.WebM")), Some(MediaKind::Video));
        assert_eq!(media_kind(Path::new("shot.HEIC")), Some(MediaKind::Image));
        assert!(media_kind(Path::new("notes.txt")).is_none());
        assert!(media_kind(Path::new("archive.zip")).is_none());
    }

    #[test]
    fn reads_png_size_from_header() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("one.png");
        fs::write(&path, PNG_1X1).unwrap();
        assert_eq!(probe_image_header(&path), Some((1, 1)));
        let items = vec![PlaybackItem {
            node_id: "n1".into(),
            path: path.to_string_lossy().into_owned(),
            display_name: "one.png".into(),
            kind: "image".into(),
        }];
        let sizes = probe_item_sizes(&items);
        assert_eq!(sizes.first().map(|s| (s.width, s.height)), Some((1, 1)));
    }

    #[test]
    fn videos_skip_header_probe() {
        let items = vec![PlaybackItem {
            node_id: "v1".into(),
            path: "/tmp/missing.mp4".into(),
            display_name: "missing.mp4".into(),
            kind: "video".into(),
        }];
        let sizes = probe_item_sizes(&items);
        assert_eq!(sizes.first().map(|s| (s.width, s.height)), Some((0, 0)));
    }
}
