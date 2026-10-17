use crate::error::AppResult;
use crate::models::{AppSnapshot, PlaybackSettings, ShortcutBinding};
use crate::mount::list_all;
use rusqlite::Connection;
use std::path::Path;

pub fn export_snapshot(conn: &Connection) -> AppResult<AppSnapshot> {
    let nodes = list_all(conn)?;
    let mut settings = serde_json::Map::new();
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    for (k, v) in rows.flatten() {
        if k == "playback" {
            continue;
        }
        settings.insert(k, serde_json::from_str(&v).unwrap_or(serde_json::Value::String(v)));
    }
    let playback = crate::playback::load_settings(conn)?;
    let shortcuts = list_shortcuts(conn)?;
    Ok(AppSnapshot {
        nodes,
        settings: serde_json::Value::Object(settings),
        shortcuts,
        playback,
    })
}

pub fn export_to_file(conn: &Connection, path: &Path) -> AppResult<()> {
    let snap = export_snapshot(conn)?;
    std::fs::write(path, serde_json::to_string_pretty(&snap)?)?;
    Ok(())
}

pub fn import_from_file(conn: &mut Connection, path: &Path) -> AppResult<()> {
    let raw = std::fs::read_to_string(path)?;
    let snap: AppSnapshot = serde_json::from_str(&raw)?;
    import_snapshot(conn, snap)
}

pub fn import_snapshot(conn: &mut Connection, snap: AppSnapshot) -> AppResult<()> {
    let tx = conn.transaction()?;
    tx.execute_batch("DELETE FROM mount_nodes; DELETE FROM shortcuts;")?;
    for node in snap.nodes {
        tx.execute(
            "INSERT INTO mount_nodes(
                id, parent_id, display_name, original_path, is_folder, selected,
                continuous_detection, detection_locked, custom_order, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                node.id,
                node.parent_id,
                node.display_name,
                node.original_path,
                node.is_folder as i64,
                node.selected as i64,
                node.continuous_detection as i64,
                node.detection_locked as i64,
                node.custom_order,
                node.created_at,
            ],
        )?;
    }
    for binding in snap.shortcuts {
        tx.execute(
            "INSERT INTO shortcuts(action, accelerator) VALUES (?1, ?2)
             ON CONFLICT(action) DO UPDATE SET accelerator = excluded.accelerator",
            rusqlite::params![binding.action, binding.accelerator],
        )?;
    }
    crate::playback::save_settings(&tx, &snap.playback)?;
    if let serde_json::Value::Object(map) = snap.settings {
        for (k, v) in map {
            crate::db::set_setting(&tx, &k, &v.to_string())?;
        }
    }
    tx.commit()?;
    Ok(())
}

pub fn list_shortcuts(conn: &Connection) -> AppResult<Vec<ShortcutBinding>> {
    let mut stmt = conn.prepare("SELECT action, accelerator FROM shortcuts ORDER BY action")?;
    let rows = stmt.query_map([], |r| {
        Ok(ShortcutBinding {
            action: r.get(0)?,
            accelerator: r.get(1)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn set_shortcut(conn: &Connection, action: &str, accelerator: &str) -> AppResult<()> {
    let existing = list_shortcuts(conn)?;
    if existing
        .iter()
        .any(|b| b.accelerator == accelerator && b.action != action)
    {
        return Err(crate::error::AppError::msg(format!(
            "shortcut {accelerator} is already bound"
        )));
    }
    conn.execute(
        "INSERT INTO shortcuts(action, accelerator) VALUES (?1, ?2)
         ON CONFLICT(action) DO UPDATE SET accelerator = excluded.accelerator",
        rusqlite::params![action, accelerator],
    )?;
    Ok(())
}

pub fn reset_shortcuts(conn: &Connection) -> AppResult<()> {
    conn.execute("DELETE FROM shortcuts", [])?;
    for binding in crate::models::default_shortcuts() {
        conn.execute(
            "INSERT INTO shortcuts(action, accelerator) VALUES (?1, ?2)",
            rusqlite::params![binding.action, binding.accelerator],
        )?;
    }
    Ok(())
}

pub fn save_playback(conn: &Connection, settings: &PlaybackSettings) -> AppResult<()> {
    crate::playback::save_settings(conn, settings)
}
