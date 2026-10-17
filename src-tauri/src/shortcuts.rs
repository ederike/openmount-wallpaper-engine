use crate::AppState;
use omwe_core::export::list_shortcuts;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub fn reregister(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let shortcuts = {
        let db = state.db.lock();
        list_shortcuts(&db).map_err(|e| e.to_string())?
    };
    let manager = app.global_shortcut();
    manager.unregister_all().map_err(|e| e.to_string())?;
    const GLOBAL: &[&str] = &[
        "toggle_window",
        "play_pause",
        "next",
        "prev",
        "scroll_faster",
        "scroll_slower",
    ];
    for binding in shortcuts {
        if !GLOBAL.contains(&binding.action.as_str()) {
            continue;
        }
        let action = binding.action.clone();
        let accelerator = binding.accelerator.clone();
        let err_action = action.clone();
        let err_accel = accelerator.clone();
        manager
            .on_shortcut(accelerator.as_str(), move |app, _shortcut, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }
                handle_action(app, &action);
            })
            .map_err(|e| format!("{} ({}): {e}", err_action, err_accel))?;
    }
    Ok(())
}

pub fn handle_action(app: &AppHandle, action: &str) {
    match action {
        "toggle_window" => {
            let _ = crate::commands::toggle_main_window(app.clone());
        }
        "play_pause" => {
            if let Some(state) = app.try_state::<AppState>() {
                let _ = crate::commands::play_pause(app.clone(), state);
            }
        }
        "next" => {
            if let Some(state) = app.try_state::<AppState>() {
                let _ = crate::commands::next_item(app.clone(), state);
            }
        }
        "prev" => {
            if let Some(state) = app.try_state::<AppState>() {
                let _ = crate::commands::prev_item(app.clone(), state);
            }
        }
        "scroll_faster" => {
            if let Some(state) = app.try_state::<AppState>() {
                let _ = crate::commands::nudge_scroll_speed(app.clone(), state, 1);
            }
        }
        "scroll_slower" => {
            if let Some(state) = app.try_state::<AppState>() {
                let _ = crate::commands::nudge_scroll_speed(app.clone(), state, -1);
            }
        }
        "refresh" => {
            let _ = app.emit("ui://refresh", ());
        }
        "mount" => {
            let _ = app.emit("ui://mount", ());
        }
        "settings" => {
            let _ = app.emit("ui://settings", ());
        }
        "search" => {
            let _ = app.emit("ui://search", ());
        }
        "select_all_playable" => {
            let _ = app.emit("ui://select-all", ());
        }
        "delete" => {
            let _ = app.emit("ui://delete", ());
        }
        _ => {}
    }
}
