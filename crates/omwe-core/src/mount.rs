use crate::error::{AppError, AppResult};
use crate::media::{display_name_of, is_playable, media_kind, resolve_mount_path};
use crate::models::{MountNode, MountNodeView, SortKey, SortSpec};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use uuid::Uuid;
use walkdir::WalkDir;

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn row_to_node(row: &rusqlite::Row<'_>) -> rusqlite::Result<MountNode> {
    Ok(MountNode {
        id: row.get(0)?,
        parent_id: row.get(1)?,
        display_name: row.get(2)?,
        original_path: row.get(3)?,
        is_folder: row.get::<_, i64>(4)? != 0,
        selected: row.get::<_, i64>(5)? != 0,
        continuous_detection: row.get::<_, i64>(6)? != 0,
        detection_locked: row.get::<_, i64>(7)? != 0,
        custom_order: row.get(8)?,
        created_at: row.get(9)?,
    })
}

pub fn get_node(conn: &Connection, id: &str) -> AppResult<Option<MountNode>> {
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, display_name, original_path, is_folder, selected,
                continuous_detection, detection_locked, custom_order, created_at
         FROM mount_nodes WHERE id = ?1",
    )?;
    let node = stmt
        .query_row(params![id], row_to_node)
        .optional()?;
    Ok(node)
}

pub fn list_all(conn: &Connection) -> AppResult<Vec<MountNode>> {
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, display_name, original_path, is_folder, selected,
                continuous_detection, detection_locked, custom_order, created_at
         FROM mount_nodes ORDER BY custom_order, display_name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], row_to_node)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn list_folders(conn: &Connection) -> AppResult<Vec<MountNode>> {
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, display_name, original_path, is_folder, selected,
                continuous_detection, detection_locked, custom_order, created_at
         FROM mount_nodes WHERE is_folder = 1
         ORDER BY custom_order, display_name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], row_to_node)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

fn next_order(conn: &Connection, parent_id: Option<&str>) -> AppResult<i64> {
    let sql = match parent_id {
        Some(_) => "SELECT COALESCE(MAX(custom_order), -1) + 1 FROM mount_nodes WHERE parent_id = ?1",
        None => "SELECT COALESCE(MAX(custom_order), -1) + 1 FROM mount_nodes WHERE parent_id IS NULL",
    };
    let mut stmt = conn.prepare(sql)?;
    let order = if let Some(pid) = parent_id {
        stmt.query_row(params![pid], |r| r.get(0))?
    } else {
        stmt.query_row([], |r| r.get(0))?
    };
    Ok(order)
}

fn insert_node(conn: &Connection, node: &MountNode) -> AppResult<()> {
    conn.execute(
        "INSERT INTO mount_nodes(
            id, parent_id, display_name, original_path, is_folder, selected,
            continuous_detection, detection_locked, custom_order, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
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
    Ok(())
}

pub fn would_cycle(conn: &Connection, node_id: &str, new_parent: &str) -> AppResult<bool> {
    if node_id == new_parent {
        return Ok(true);
    }
    let mut current = Some(new_parent.to_string());
    let mut guard = 0;
    while let Some(id) = current {
        if id == node_id {
            return Ok(true);
        }
        guard += 1;
        if guard > 100_000 {
            return Err(AppError::msg("mount tree appears cyclic"));
        }
        current = get_node(conn, &id)?.and_then(|n| n.parent_id);
    }
    Ok(false)
}

fn inherit_detection(conn: &Connection, parent_id: Option<&str>) -> AppResult<bool> {
    if let Some(pid) = parent_id {
        if let Some(parent) = get_node(conn, pid)? {
            return Ok(parent.continuous_detection);
        }
    }
    Ok(false)
}

fn new_node(
    parent_id: Option<String>,
    path: &Path,
    is_folder: bool,
    selected: bool,
    continuous_detection: bool,
    custom_order: i64,
) -> MountNode {
    MountNode {
        id: Uuid::new_v4().to_string(),
        parent_id,
        display_name: display_name_of(path),
        original_path: path.to_string_lossy().into_owned(),
        is_folder,
        selected,
        continuous_detection,
        detection_locked: false,
        custom_order,
        created_at: now_iso(),
    }
}

pub fn mount_path(
    conn: &mut Connection,
    raw_path: &Path,
    parent_id: Option<&str>,
) -> AppResult<MountNode> {
    if let Some(pid) = parent_id {
        if get_node(conn, pid)?.is_none() {
            return Err(AppError::msg("parent mount node does not exist"));
        }
    }

    let resolved = resolve_mount_path(raw_path);
    if !resolved.exists() {
        return Err(AppError::msg(format!(
            "path does not exist: {}",
            raw_path.display()
        )));
    }

    let is_folder = resolved.is_dir();
    if !is_folder && !is_playable(&resolved) {
        return Err(AppError::msg(
            "only folders and playable image/video files can be mounted",
        ));
    }

    let tx = conn.transaction()?;
    let detection = inherit_detection(&tx, parent_id)?;
    let order = next_order(&tx, parent_id)?;
    let root = new_node(
        parent_id.map(|s| s.to_string()),
        &resolved,
        is_folder,
        false,
        detection,
        order,
    );
    insert_node(&tx, &root)?;

    if is_folder {
        scan_folder_into(&tx, &root, detection)?;
    }

    tx.commit()?;
    Ok(root)
}

fn scan_folder_into(conn: &Connection, folder: &MountNode, detection: bool) -> AppResult<()> {
    let root_path = PathBuf::from(&folder.original_path);
    let mut parent_of: HashMap<PathBuf, String> = HashMap::new();
    parent_of.insert(root_path.clone(), folder.id.clone());
    let mut orders: HashMap<String, i64> = HashMap::new();

    let walker = WalkDir::new(&root_path)
        .follow_links(true)
        .into_iter()
        .filter_entry(|e| {
            let p = e.path();
            if p == root_path {
                return true;
            }
            if e.file_type().is_dir() {
                true
            } else {
                is_playable(p)
            }
        });

    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(err) => {
                log::warn!("skip unreadable path during mount: {err}");
                continue;
            }
        };
        let path = entry.path();
        if path == root_path {
            continue;
        }
        let parent_fs = match path.parent() {
            Some(p) => p.to_path_buf(),
            None => continue,
        };
        let parent_id = match parent_of.get(&parent_fs) {
            Some(id) => id.clone(),
            None => continue,
        };
        let is_dir = entry.file_type().is_dir();
        let order = {
            let slot = orders.entry(parent_id.clone()).or_insert(0);
            let current = *slot;
            *slot += 1;
            current
        };
        let node = new_node(
            Some(parent_id),
            path,
            is_dir,
            false,
            detection && is_dir,
            order,
        );
        if is_dir {
            parent_of.insert(path.to_path_buf(), node.id.clone());
        }
        insert_node(conn, &node)?;
    }
    Ok(())
}

pub fn rename_node(conn: &Connection, id: &str, display_name: &str) -> AppResult<MountNode> {
    let name = display_name.trim();
    if name.is_empty() {
        return Err(AppError::msg("display name cannot be empty"));
    }
    conn.execute(
        "UPDATE mount_nodes SET display_name = ?1 WHERE id = ?2",
        params![name, id],
    )?;
    get_node(conn, id)?.ok_or_else(|| AppError::msg("node not found"))
}

pub fn relocate_node(conn: &Connection, id: &str, new_path: &Path) -> AppResult<MountNode> {
    let resolved = resolve_mount_path(new_path);
    if !resolved.exists() {
        return Err(AppError::msg("new path does not exist"));
    }
    let node = get_node(conn, id)?.ok_or_else(|| AppError::msg("node not found"))?;
    if node.is_folder != resolved.is_dir() {
        return Err(AppError::msg(
            "relocated path must be the same kind (file or folder)",
        ));
    }
    if !node.is_folder && !is_playable(&resolved) {
        return Err(AppError::msg("relocated file is not a playable media type"));
    }
    conn.execute(
        "UPDATE mount_nodes SET original_path = ?1 WHERE id = ?2",
        params![resolved.to_string_lossy().as_ref(), id],
    )?;
    get_node(conn, id)?.ok_or_else(|| AppError::msg("node not found"))
}

pub fn reorder_siblings(conn: &Connection, parent_id: Option<&str>, ordered_ids: &[String]) -> AppResult<()> {
    let tx_sql = "UPDATE mount_nodes SET custom_order = ?1 WHERE id = ?2 AND (parent_id IS ?3 OR (parent_id IS NULL AND ?3 IS NULL))";
    for (idx, id) in ordered_ids.iter().enumerate() {
        conn.execute(tx_sql, params![idx as i64, id, parent_id])?;
    }
    Ok(())
}

fn collect_descendants(conn: &Connection, id: &str) -> AppResult<Vec<String>> {
    let mut out = vec![id.to_string()];
    let mut stack = vec![id.to_string()];
    while let Some(current) = stack.pop() {
        let mut stmt = conn.prepare("SELECT id FROM mount_nodes WHERE parent_id = ?1")?;
        let children: Vec<String> = stmt
            .query_map(params![current], |r| r.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        for child in children {
            stack.push(child.clone());
            out.push(child);
        }
    }
    Ok(out)
}

pub fn set_selected(conn: &Connection, id: &str, selected: bool) -> AppResult<()> {
    let ids = collect_descendants(conn, id)?;
    let tx_sql = "UPDATE mount_nodes SET selected = ?1 WHERE id = ?2";
    for nid in ids {
        conn.execute(tx_sql, params![selected as i64, nid])?;
    }
    Ok(())
}

pub fn set_selected_many(conn: &Connection, ids: &[String], selected: bool) -> AppResult<()> {
    for id in ids {
        set_selected(conn, id, selected)?;
    }
    Ok(())
}

pub fn set_detection(conn: &Connection, id: &str, enabled: bool, lock: bool) -> AppResult<()> {
    conn.execute(
        "UPDATE mount_nodes SET continuous_detection = ?1, detection_locked = ?2 WHERE id = ?3",
        params![enabled as i64, lock as i64, id],
    )?;
    if enabled {
        propagate_detection(conn, id, true)?;
    }
    Ok(())
}

fn propagate_detection(conn: &Connection, parent_id: &str, enabled: bool) -> AppResult<()> {
    let mut stmt = conn.prepare(
        "SELECT id, detection_locked FROM mount_nodes WHERE parent_id = ?1 AND is_folder = 1",
    )?;
    let children: Vec<(String, bool)> = stmt
        .query_map(params![parent_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)? != 0))
        })?
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);
    for (cid, locked) in children {
        if locked {
            continue;
        }
        conn.execute(
            "UPDATE mount_nodes SET continuous_detection = ?1 WHERE id = ?2",
            params![enabled as i64, cid],
        )?;
        propagate_detection(conn, &cid, enabled)?;
    }
    Ok(())
}

pub fn delete_nodes(
    conn: &Connection,
    ids: &[String],
    delete_original: bool,
) -> AppResult<Vec<PathBuf>> {
    let mut removed_files = Vec::new();
    let mut seen = HashSet::new();
    for id in ids {
        if let Some(node) = get_node(conn, id)? {
            if seen.contains(&node.id) {
                continue;
            }
            if delete_original {
                collect_originals(conn, &node, &mut removed_files)?;
            }
            conn.execute("DELETE FROM mount_nodes WHERE id = ?1", params![id])?;
            seen.insert(node.id);
        }
    }
    if delete_original {
        for path in &removed_files {
            if path.is_dir() {
                let _ = std::fs::remove_dir_all(path);
            } else {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    Ok(removed_files)
}

fn collect_originals(
    conn: &Connection,
    node: &MountNode,
    out: &mut Vec<PathBuf>,
) -> AppResult<()> {
    out.push(PathBuf::from(&node.original_path));
    let mut stmt = conn.prepare("SELECT id FROM mount_nodes WHERE parent_id = ?1")?;
    let children: Vec<String> = stmt
        .query_map(params![&node.id], |r| r.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);
    for cid in children {
        if let Some(child) = get_node(conn, &cid)? {
            collect_originals(conn, &child, out)?;
        }
    }
    Ok(())
}

pub fn enrich(node: MountNode, child_count: i64) -> MountNodeView {
    let path = PathBuf::from(&node.original_path);
    let meta = std::fs::metadata(&path).ok();
    let exists = meta.is_some();
    let size = meta.as_ref().and_then(|m| {
        if m.is_file() {
            Some(m.len())
        } else {
            None
        }
    });
    let modified_at = meta.as_ref().and_then(|m| {
        m.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
    });
    let kind = media_kind(&path).map(|k| match k {
        crate::media::MediaKind::Image => "image".to_string(),
        crate::media::MediaKind::Video => "video".to_string(),
    });
    MountNodeView {
        id: node.id,
        parent_id: node.parent_id,
        display_name: node.display_name,
        original_path: node.original_path,
        is_folder: node.is_folder,
        selected: node.selected,
        continuous_detection: node.continuous_detection,
        detection_locked: node.detection_locked,
        custom_order: node.custom_order,
        created_at: node.created_at,
        exists,
        size,
        modified_at,
        media_kind: kind,
        child_count,
    }
}

fn child_count_map(conn: &Connection) -> AppResult<HashMap<Option<String>, i64>> {
    let mut stmt =
        conn.prepare("SELECT parent_id, COUNT(*) FROM mount_nodes GROUP BY parent_id")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, Option<String>>(0)?, r.get::<_, i64>(1)?))
    })?;
    let mut map = HashMap::new();
    for row in rows.flatten() {
        map.insert(row.0, row.1);
    }
    Ok(map)
}

pub fn list_children(
    conn: &Connection,
    parent_id: Option<&str>,
    sort: &SortSpec,
    query: Option<&str>,
    selected_only: bool,
    kind_filter: Option<&str>,
) -> AppResult<Vec<MountNodeView>> {
    let sql = match parent_id {
        Some(_) => {
            "SELECT id, parent_id, display_name, original_path, is_folder, selected,
                    continuous_detection, detection_locked, custom_order, created_at
             FROM mount_nodes WHERE parent_id = ?1"
        }
        None => {
            "SELECT id, parent_id, display_name, original_path, is_folder, selected,
                    continuous_detection, detection_locked, custom_order, created_at
             FROM mount_nodes WHERE parent_id IS NULL"
        }
    };
    let mut stmt = conn.prepare(sql)?;
    let nodes: Vec<MountNode> = if let Some(pid) = parent_id {
        stmt.query_map(params![pid], row_to_node)?
            .filter_map(|r| r.ok())
            .collect()
    } else {
        stmt.query_map([], row_to_node)?
            .filter_map(|r| r.ok())
            .collect()
    };

    let counts = child_count_map(conn)?;
    let mut views: Vec<MountNodeView> = nodes
        .into_iter()
        .map(|n| {
            let count = counts.get(&Some(n.id.clone())).copied().unwrap_or(0);
            enrich(n, count)
        })
        .collect();

    if let Some(q) = query.map(|s| s.trim().to_ascii_lowercase()).filter(|s| !s.is_empty()) {
        views.retain(|v| v.display_name.to_ascii_lowercase().contains(&q));
    }
    if selected_only {
        views.retain(|v| v.selected);
    }
    if let Some(kind) = kind_filter {
        match kind {
            "image" | "video" => views.retain(|v| v.media_kind.as_deref() == Some(kind)),
            "folder" => views.retain(|v| v.is_folder),
            "missing" => views.retain(|v| !v.exists),
            "detected" => views.retain(|v| v.continuous_detection),
            _ => {}
        }
    }

    views.sort_by(|a, b| {
        if a.is_folder != b.is_folder {
            return b.is_folder.cmp(&a.is_folder);
        }
        let ord = match sort.key {
            SortKey::Custom => a.custom_order.cmp(&b.custom_order).then(a.display_name.to_ascii_lowercase().cmp(&b.display_name.to_ascii_lowercase())),
            SortKey::Name => a.display_name.to_ascii_lowercase().cmp(&b.display_name.to_ascii_lowercase()),
            SortKey::Modified => a.modified_at.unwrap_or(0).cmp(&b.modified_at.unwrap_or(0)),
            SortKey::Size => a.size.unwrap_or(0).cmp(&b.size.unwrap_or(0)),
            SortKey::Type => a
                .media_kind
                .as_deref()
                .unwrap_or("folder")
                .cmp(b.media_kind.as_deref().unwrap_or("folder")),
        };
        if sort.ascending {
            ord
        } else {
            ord.reverse()
        }
    });
    Ok(views)
}

pub fn search_tree(conn: &Connection, query: &str) -> AppResult<Vec<MountNodeView>> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let like = format!("%{}%", q);
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, display_name, original_path, is_folder, selected,
                continuous_detection, detection_locked, custom_order, created_at
         FROM mount_nodes WHERE display_name LIKE ?1 COLLATE NOCASE
         ORDER BY is_folder DESC, display_name COLLATE NOCASE LIMIT 500",
    )?;
    let nodes: Vec<MountNode> = stmt
        .query_map(params![like], row_to_node)?
        .filter_map(|r| r.ok())
        .collect();
    let counts = child_count_map(conn)?;
    Ok(nodes
        .into_iter()
        .map(|n| {
            let count = counts.get(&Some(n.id.clone())).copied().unwrap_or(0);
            enrich(n, count)
        })
        .collect())
}

/// Refresh a folder subtree. Detection-on folders sync filesystem; others only mark missing.
pub fn refresh(conn: &mut Connection, folder_id: Option<&str>) -> AppResult<RefreshReport> {
    let targets: Vec<MountNode> = if let Some(id) = folder_id {
        let node = get_node(conn, id)?.ok_or_else(|| AppError::msg("folder not found"))?;
        if !node.is_folder {
            return Err(AppError::msg("refresh applies to folders"));
        }
        vec![node]
    } else {
        list_folders(conn)?
            .into_iter()
            .filter(|n| n.parent_id.is_none())
            .collect()
    };

    let mut report = RefreshReport::default();
    let tx = conn.transaction()?;
    for folder in targets {
        refresh_folder(&tx, &folder, &mut report)?;
    }
    tx.commit()?;
    Ok(report)
}

#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
pub struct RefreshReport {
    pub added: u64,
    pub removed: u64,
    pub missing: u64,
}

fn refresh_folder(conn: &Connection, folder: &MountNode, report: &mut RefreshReport) -> AppResult<()> {
    if folder.continuous_detection {
        sync_detected_folder(conn, folder, report)?;
    } else {
        let children = direct_children(conn, &folder.id)?;
        for child in children {
            if !Path::new(&child.original_path).exists() {
                report.missing += 1;
            }
            if child.is_folder {
                refresh_folder(conn, &child, report)?;
            }
        }
    }
    Ok(())
}

fn direct_children(conn: &Connection, parent_id: &str) -> AppResult<Vec<MountNode>> {
    let mut stmt = conn.prepare(
        "SELECT id, parent_id, display_name, original_path, is_folder, selected,
                continuous_detection, detection_locked, custom_order, created_at
         FROM mount_nodes WHERE parent_id = ?1",
    )?;
    let rows = stmt.query_map(params![parent_id], row_to_node)?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

fn sync_detected_folder(
    conn: &Connection,
    folder: &MountNode,
    report: &mut RefreshReport,
) -> AppResult<()> {
    let fs_path = PathBuf::from(&folder.original_path);
    if !fs_path.exists() {
        report.missing += 1;
        return Ok(());
    }

    let children = direct_children(conn, &folder.id)?;
    let mut by_path: HashMap<String, MountNode> = HashMap::new();
    for child in children {
        by_path.insert(child.original_path.clone(), child);
    }

    let mut seen = HashSet::new();
    let entries = match std::fs::read_dir(&fs_path) {
        Ok(rd) => rd,
        Err(err) => {
            log::warn!("permission error scanning {}: {err}", fs_path.display());
            return Ok(());
        }
    };

    let detection_for_new = folder.continuous_detection;
    for entry in entries.flatten() {
        let path = resolve_mount_path(&entry.path());
        let is_dir = path.is_dir();
        if !is_dir && !is_playable(&path) {
            continue;
        }
        let key = path.to_string_lossy().into_owned();
        seen.insert(key.clone());
        if let Some(existing) = by_path.get(&key) {
            if is_dir {
                let mut child = existing.clone();
                if !child.detection_locked {
                    child.continuous_detection = detection_for_new;
                    conn.execute(
                        "UPDATE mount_nodes SET continuous_detection = ?1 WHERE id = ?2",
                        params![detection_for_new as i64, child.id],
                    )?;
                }
                sync_detected_folder(conn, &child, report)?;
            }
        } else {
            let order = next_order(conn, Some(&folder.id))?;
            let node = new_node(
                Some(folder.id.clone()),
                &path,
                is_dir,
                folder.selected,
                detection_for_new && is_dir,
                order,
            );
            insert_node(conn, &node)?;
            report.added += 1;
            if is_dir {
                scan_folder_into(conn, &node, detection_for_new)?;
            }
        }
    }

    for (path, child) in by_path {
        if !seen.contains(&path) {
            conn.execute("DELETE FROM mount_nodes WHERE id = ?1", params![child.id])?;
            report.removed += 1;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use std::fs;
    use tempfile::tempdir;

    fn setup() -> (tempfile::TempDir, Connection) {
        let dir = tempdir().unwrap();
        let conn = db::open_memory().unwrap();
        (dir, conn)
    }

    #[test]
    fn mounts_folder_and_filters_non_media() {
        let (dir, mut conn) = setup();
        fs::write(dir.path().join("keep.png"), b"x").unwrap();
        fs::write(dir.path().join("skip.txt"), b"nope").unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join("sub/clip.mp4"), b"v").unwrap();

        let root = mount_path(&mut conn, dir.path(), None).unwrap();
        let all = list_all(&conn).unwrap();
        assert!(all.iter().any(|n| n.display_name == "keep.png"));
        assert!(all.iter().any(|n| n.display_name == "clip.mp4"));
        assert!(!all.iter().any(|n| n.display_name == "skip.txt"));
        assert!(all.iter().any(|n| n.id == root.id && n.is_folder));
    }

    #[test]
    fn allows_duplicate_mounts() {
        let (dir, mut conn) = setup();
        fs::write(dir.path().join("a.png"), b"x").unwrap();
        mount_path(&mut conn, &dir.path().join("a.png"), None).unwrap();
        mount_path(&mut conn, &dir.path().join("a.png"), None).unwrap();
        assert_eq!(list_all(&conn).unwrap().len(), 2);
    }

    #[test]
    fn recursive_selection() {
        let (dir, mut conn) = setup();
        fs::create_dir(dir.path().join("nested")).unwrap();
        fs::write(dir.path().join("nested/a.jpg"), b"x").unwrap();
        let root = mount_path(&mut conn, dir.path(), None).unwrap();
        set_selected(&conn, &root.id, true).unwrap();
        assert!(list_all(&conn).unwrap().iter().all(|n| n.selected));
        set_selected(&conn, &root.id, false).unwrap();
        assert!(list_all(&conn).unwrap().iter().all(|n| !n.selected));
    }

    #[test]
    fn detection_refresh_adds_and_removes() {
        let (dir, mut conn) = setup();
        fs::write(dir.path().join("one.png"), b"x").unwrap();
        let root = mount_path(&mut conn, dir.path(), None).unwrap();
        set_detection(&conn, &root.id, true, false).unwrap();
        fs::write(dir.path().join("two.png"), b"y").unwrap();
        let report = refresh(&mut conn, Some(&root.id)).unwrap();
        assert_eq!(report.added, 1);
        fs::remove_file(dir.path().join("one.png")).unwrap();
        let report = refresh(&mut conn, Some(&root.id)).unwrap();
        assert_eq!(report.removed, 1);
        let names: Vec<_> = list_all(&conn)
            .unwrap()
            .into_iter()
            .map(|n| n.display_name)
            .collect();
        assert!(names.iter().any(|n| n == "two.png"));
        assert!(!names.iter().any(|n| n == "one.png"));
    }

    #[test]
    fn delete_mapping_keeps_original() {
        let (dir, mut conn) = setup();
        let file = dir.path().join("keep.webp");
        fs::write(&file, b"x").unwrap();
        let node = mount_path(&mut conn, &file, None).unwrap();
        delete_nodes(&conn, &[node.id], false).unwrap();
        assert!(file.exists());
        assert!(list_all(&conn).unwrap().is_empty());
    }
}
