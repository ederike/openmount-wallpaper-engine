use crate::error::AppResult;
use crate::media::media_kind;
use crate::models::{
    EngineState, PlaybackItem, PlaybackMode, PlaybackSettings, ScrollOrder, TraditionalOrder,
};
use rusqlite::Connection;
use std::path::Path;

pub fn load_settings(conn: &Connection) -> AppResult<PlaybackSettings> {
    match crate::db::get_setting(conn, "playback")? {
        Some(raw) => Ok(serde_json::from_str(&raw).unwrap_or_default()),
        None => Ok(PlaybackSettings::default()),
    }
}

pub fn save_settings(conn: &Connection, settings: &PlaybackSettings) -> AppResult<()> {
    crate::db::set_setting(conn, "playback", &serde_json::to_string(settings)?)
}

/// Build the playback pool from selected, existing, playable leaf nodes.
pub fn build_pool(conn: &Connection, settings: &PlaybackSettings) -> AppResult<Vec<PlaybackItem>> {
    let sibling_by_name =
        settings.mode == PlaybackMode::Scroll && settings.scroll.order == ScrollOrder::FolderName;
    let mut items = Vec::new();
    collect_selected(conn, None, sibling_by_name, &mut items)?;
    match settings.mode {
        PlaybackMode::Traditional => match settings.traditional.order {
            TraditionalOrder::Custom => {}
            TraditionalOrder::NameAsc => items.sort_by(|a, b| {
                a.display_name
                    .to_ascii_lowercase()
                    .cmp(&b.display_name.to_ascii_lowercase())
            }),
            TraditionalOrder::NameDesc => items.sort_by(|a, b| {
                b.display_name
                    .to_ascii_lowercase()
                    .cmp(&a.display_name.to_ascii_lowercase())
            }),
            TraditionalOrder::Random => shuffle(&mut items),
        },
        PlaybackMode::Scroll => match settings.scroll.order {
            ScrollOrder::FolderCustom | ScrollOrder::FolderName => {}
            ScrollOrder::AllNameAsc => items.sort_by(|a, b| {
                a.display_name
                    .to_ascii_lowercase()
                    .cmp(&b.display_name.to_ascii_lowercase())
            }),
            ScrollOrder::AllNameDesc => items.sort_by(|a, b| {
                b.display_name
                    .to_ascii_lowercase()
                    .cmp(&a.display_name.to_ascii_lowercase())
            }),
            ScrollOrder::AllModified => {
                items.sort_by_key(|item| file_mtime(&item.path));
            }
            ScrollOrder::Random => shuffle(&mut items),
        },
    }
    Ok(items)
}

fn file_mtime(path: &str) -> i64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn collect_selected(
    conn: &Connection,
    parent_id: Option<&str>,
    sibling_by_name: bool,
    out: &mut Vec<PlaybackItem>,
) -> AppResult<()> {
    let order_sql = if sibling_by_name {
        "display_name COLLATE NOCASE, custom_order"
    } else {
        "custom_order, display_name COLLATE NOCASE"
    };
    let sql = match parent_id {
        Some(_) => format!(
            "SELECT id, display_name, original_path, is_folder, selected, custom_order
             FROM mount_nodes WHERE parent_id = ?1
             ORDER BY {order_sql}"
        ),
        None => format!(
            "SELECT id, display_name, original_path, is_folder, selected, custom_order
             FROM mount_nodes WHERE parent_id IS NULL
             ORDER BY {order_sql}"
        ),
    };
    let mut stmt = conn.prepare(&sql)?;
    let rows: Vec<(String, String, String, bool, bool)> = if let Some(pid) = parent_id {
        stmt.query_map(rusqlite::params![pid], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get::<_, i64>(3)? != 0,
                r.get::<_, i64>(4)? != 0,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect()
    } else {
        stmt.query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get::<_, i64>(3)? != 0,
                r.get::<_, i64>(4)? != 0,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect()
    };
    drop(stmt);

    for (id, display_name, original_path, is_folder, selected) in rows {
        if is_folder {
            collect_selected(conn, Some(&id), sibling_by_name, out)?;
            continue;
        }
        if !selected {
            continue;
        }
        let path = Path::new(&original_path);
        if !path.exists() {
            continue;
        }
        let Some(kind) = media_kind(path) else {
            continue;
        };
        out.push(PlaybackItem {
            node_id: id,
            path: original_path,
            display_name,
            kind: match kind {
                crate::media::MediaKind::Image => "image".into(),
                crate::media::MediaKind::Video => "video".into(),
            },
        });
    }
    Ok(())
}

fn shuffle<T>(items: &mut [T]) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let mut seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9E3779B97F4A7C15);
    for i in (1..items.len()).rev() {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        let j = (seed as usize) % (i + 1);
        items.swap(i, j);
    }
}

pub fn snapshot(state: &EngineState) -> EngineState {
    state.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::models::ScrollSettings;
    use crate::mount::{mount_path, set_selected};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn pool_includes_duplicates_and_skips_unselected() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("a.png"), b"x").unwrap();
        fs::write(dir.path().join("b.png"), b"y").unwrap();
        let mut conn = db::open_memory().unwrap();
        let first = mount_path(&mut conn, &dir.path().join("a.png"), None).unwrap();
        let _second = mount_path(&mut conn, &dir.path().join("a.png"), None).unwrap();
        let third = mount_path(&mut conn, &dir.path().join("b.png"), None).unwrap();
        set_selected(&conn, &first.id, true).unwrap();
        set_selected(&conn, &third.id, true).unwrap();
        let pool = build_pool(&conn, &PlaybackSettings::default()).unwrap();
        assert_eq!(pool.len(), 2);
        assert_eq!(pool[0].display_name, "a.png");
        assert_eq!(pool[1].display_name, "b.png");
    }

    #[test]
    fn scroll_all_name_sorts_across_folders() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("z")).unwrap();
        fs::create_dir(dir.path().join("a")).unwrap();
        fs::write(dir.path().join("z/b.png"), b"x").unwrap();
        fs::write(dir.path().join("a/c.png"), b"y").unwrap();
        let mut conn = db::open_memory().unwrap();
        let root = mount_path(&mut conn, dir.path(), None).unwrap();
        set_selected(&conn, &root.id, true).unwrap();
        let mut settings = PlaybackSettings::default();
        settings.mode = PlaybackMode::Scroll;
        settings.scroll = ScrollSettings {
            order: ScrollOrder::AllNameAsc,
            ..ScrollSettings::default()
        };
        let pool = build_pool(&conn, &settings).unwrap();
        let names: Vec<_> = pool.iter().map(|i| i.display_name.as_str()).collect();
        assert_eq!(names, vec!["b.png", "c.png"]);
    }
}
