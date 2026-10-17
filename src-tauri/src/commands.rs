use crate::AppState;
use omwe_core::export::{
    export_to_file, import_from_file, list_shortcuts, reset_shortcuts, set_shortcut,
};
use omwe_core::models::{
    EngineState, MountNode, MountNodeView, PlaybackSettings, ShortcutBinding, SortSpec,
};
use omwe_core::mount::{self, RefreshReport};
use omwe_core::playback;
use omwe_core::AppResult;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};

fn emit_engine(app: &AppHandle, state: &EngineState) {
    let _ = app.emit("engine://state", state);
}

fn rebuild_pool(state: &AppState) -> AppResult<EngineState> {
    let db = state.db.lock();
    let settings = playback::load_settings(&db)?;
    let pool = playback::build_pool(&db, &settings)?;
    drop(db);
    let mut engine = state.engine.lock();
    engine.settings = settings.clone();
    engine.mode = settings.mode;
    engine.pool = pool;
    if engine.current_index >= engine.pool.len() {
        engine.current_index = 0;
    }
    Ok(engine.clone())
}

#[tauri::command]
pub fn get_tree(state: State<AppState>) -> AppResult<Vec<MountNode>> {
    let db = state.db.lock();
    mount::list_folders(&db)
}

#[tauri::command]
pub fn list_children(
    state: State<AppState>,
    parent_id: Option<String>,
    sort: SortSpec,
    query: Option<String>,
    selected_only: bool,
    kind_filter: Option<String>,
) -> AppResult<Vec<MountNodeView>> {
    let db = state.db.lock();
    mount::list_children(
        &db,
        parent_id.as_deref(),
        &sort,
        query.as_deref(),
        selected_only,
        kind_filter.as_deref(),
    )
}

#[tauri::command]
pub fn search_nodes(state: State<AppState>, query: String) -> AppResult<Vec<MountNodeView>> {
    let db = state.db.lock();
    mount::search_tree(&db, &query)
}

#[tauri::command]
pub fn mount_path(
    state: State<AppState>,
    path: String,
    parent_id: Option<String>,
) -> AppResult<MountNode> {
    let mut db = state.db.lock();
    mount::mount_path(&mut db, &PathBuf::from(path), parent_id.as_deref())
}

#[tauri::command]
pub fn rename_node(state: State<AppState>, id: String, display_name: String) -> AppResult<MountNode> {
    let db = state.db.lock();
    mount::rename_node(&db, &id, &display_name)
}

#[tauri::command]
pub fn relocate_node(state: State<AppState>, id: String, path: String) -> AppResult<MountNode> {
    let db = state.db.lock();
    mount::relocate_node(&db, &id, &PathBuf::from(path))
}

#[tauri::command]
pub fn reorder_nodes(
    state: State<AppState>,
    parent_id: Option<String>,
    ordered_ids: Vec<String>,
) -> AppResult<()> {
    let db = state.db.lock();
    mount::reorder_siblings(&db, parent_id.as_deref(), &ordered_ids)
}

#[tauri::command]
pub fn set_selected(state: State<AppState>, ids: Vec<String>, selected: bool) -> AppResult<()> {
    let db = state.db.lock();
    mount::set_selected_many(&db, &ids, selected)
}

#[tauri::command]
pub fn set_detection(
    state: State<AppState>,
    id: String,
    enabled: bool,
    lock: bool,
) -> AppResult<()> {
    let db = state.db.lock();
    mount::set_detection(&db, &id, enabled, lock)
}

#[tauri::command]
pub fn delete_nodes(
    state: State<AppState>,
    ids: Vec<String>,
    delete_original: bool,
) -> AppResult<()> {
    let db = state.db.lock();
    mount::delete_nodes(&db, &ids, delete_original)?;
    Ok(())
}

#[tauri::command]
pub fn refresh_mounts(
    state: State<AppState>,
    folder_id: Option<String>,
) -> AppResult<RefreshReport> {
    let mut db = state.db.lock();
    mount::refresh(&mut db, folder_id.as_deref())
}

#[tauri::command]
pub fn get_engine(state: State<AppState>) -> AppResult<EngineState> {
    rebuild_pool(&state)
}

#[tauri::command]
pub fn get_playback_settings(state: State<AppState>) -> AppResult<PlaybackSettings> {
    let db = state.db.lock();
    playback::load_settings(&db)
}

#[tauri::command]
pub fn set_playback_settings(
    app: AppHandle,
    state: State<AppState>,
    settings: PlaybackSettings,
) -> AppResult<EngineState> {
    {
        let db = state.db.lock();
        playback::save_settings(&db, &settings)?;
    }
    let snapshot = rebuild_pool(&state)?;
    emit_engine(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn start_wallpaper(app: AppHandle, state: State<AppState>) -> AppResult<EngineState> {
    let mut snapshot = rebuild_pool(&state)?;
    snapshot.running = true;
    snapshot.paused = false;
    *state.engine.lock() = snapshot.clone();
    crate::wallpaper::show_wallpaper(&app).map_err(omwe_core::AppError::msg)?;
    emit_engine(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn stop_wallpaper(app: AppHandle, state: State<AppState>) -> AppResult<EngineState> {
    crate::wallpaper::hide_wallpaper(&app).map_err(omwe_core::AppError::msg)?;
    let mut engine = state.engine.lock();
    engine.running = false;
    engine.paused = false;
    let snapshot = engine.clone();
    drop(engine);
    emit_engine(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn play_pause(app: AppHandle, state: State<AppState>) -> AppResult<EngineState> {
    let mut engine = state.engine.lock();
    if !engine.running {
        drop(engine);
        return start_wallpaper(app, state);
    }
    engine.paused = !engine.paused;
    let snapshot = engine.clone();
    drop(engine);
    emit_engine(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn next_item(app: AppHandle, state: State<AppState>) -> AppResult<EngineState> {
    let mut engine = state.engine.lock();
    if !engine.pool.is_empty() {
        engine.current_index = (engine.current_index + 1) % engine.pool.len();
    }
    let snapshot = engine.clone();
    drop(engine);
    emit_engine(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn prev_item(app: AppHandle, state: State<AppState>) -> AppResult<EngineState> {
    let mut engine = state.engine.lock();
    if !engine.pool.is_empty() {
        engine.current_index = if engine.current_index == 0 {
            engine.pool.len() - 1
        } else {
            engine.current_index - 1
        };
    }
    let snapshot = engine.clone();
    drop(engine);
    emit_engine(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn reset_scroll(app: AppHandle, state: State<AppState>) -> AppResult<EngineState> {
    let snapshot = state.engine.lock().clone();
    let _ = app.emit("engine://reset-scroll", ());
    emit_engine(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn nudge_scroll_speed(
    app: AppHandle,
    state: State<AppState>,
    delta_preset: i8,
) -> AppResult<EngineState> {
    let mut settings = {
        let db = state.db.lock();
        playback::load_settings(&db)?
    };
    let next = (settings.scroll.speed_preset as i8 + delta_preset).clamp(1, 10) as u8;
    settings.scroll.apply_preset(next);
    {
        let db = state.db.lock();
        playback::save_settings(&db, &settings)?;
    }
    let snapshot = rebuild_pool(&state)?;
    emit_engine(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn get_shortcuts(state: State<AppState>) -> AppResult<Vec<ShortcutBinding>> {
    let db = state.db.lock();
    list_shortcuts(&db)
}

#[tauri::command]
pub fn update_shortcut(
    app: AppHandle,
    state: State<AppState>,
    action: String,
    accelerator: String,
) -> AppResult<Vec<ShortcutBinding>> {
    {
        let db = state.db.lock();
        set_shortcut(&db, &action, &accelerator)?;
    }
    crate::shortcuts::reregister(&app, &state).map_err(omwe_core::AppError::msg)?;
    let db = state.db.lock();
    list_shortcuts(&db)
}

#[tauri::command]
pub fn restore_shortcuts(
    app: AppHandle,
    state: State<AppState>,
) -> AppResult<Vec<ShortcutBinding>> {
    {
        let db = state.db.lock();
        reset_shortcuts(&db)?;
    }
    crate::shortcuts::reregister(&app, &state).map_err(omwe_core::AppError::msg)?;
    let db = state.db.lock();
    list_shortcuts(&db)
}

#[tauri::command]
pub fn export_config(state: State<AppState>, path: String) -> AppResult<()> {
    let db = state.db.lock();
    export_to_file(&db, &PathBuf::from(path))
}

#[tauri::command]
pub fn import_config(state: State<AppState>, path: String) -> AppResult<()> {
    let mut db = state.db.lock();
    import_from_file(&mut db, &PathBuf::from(path))
}

#[tauri::command]
pub fn toggle_main_window(app: AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(true) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn app_info() -> serde_json::Value {
    serde_json::json!({
        "name": "OpenMount Wallpaper Engine",
        "version": env!("CARGO_PKG_VERSION"),
        "platforms": ["windows", "macos"],
        "license": "MIT"
    })
}
