use crate::error::AppResult;
use crate::models::{default_shortcuts, PlaybackSettings};
use rusqlite::{params, Connection};

pub fn open(path: &std::path::Path) -> AppResult<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn open_memory() -> AppResult<Connection> {
    let conn = Connection::open_in_memory()?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS mount_nodes (
            id TEXT PRIMARY KEY,
            parent_id TEXT,
            display_name TEXT NOT NULL,
            original_path TEXT NOT NULL,
            is_folder INTEGER NOT NULL,
            selected INTEGER NOT NULL DEFAULT 0,
            continuous_detection INTEGER NOT NULL DEFAULT 0,
            detection_locked INTEGER NOT NULL DEFAULT 0,
            custom_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY(parent_id) REFERENCES mount_nodes(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_mount_parent ON mount_nodes(parent_id);
        CREATE INDEX IF NOT EXISTS idx_mount_order ON mount_nodes(parent_id, custom_order);

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS shortcuts (
            action TEXT PRIMARY KEY,
            accelerator TEXT NOT NULL
        );
        "#,
    )?;

    seed_shortcuts(conn)?;
    if get_setting(conn, "playback")?.is_none() {
        set_setting(
            conn,
            "playback",
            &serde_json::to_string(&PlaybackSettings::default())?,
        )?;
    }
    Ok(())
}

fn seed_shortcuts(conn: &Connection) -> AppResult<()> {
    for binding in default_shortcuts() {
        conn.execute(
            "INSERT OR IGNORE INTO shortcuts(action, accelerator) VALUES (?1, ?2)",
            params![binding.action, binding.accelerator],
        )?;
    }
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}
