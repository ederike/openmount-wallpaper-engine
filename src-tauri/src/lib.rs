mod commands;
mod shortcuts;
mod wallpaper;

use omwe_core::db;
use omwe_core::models::EngineState;
use parking_lot::Mutex;
use rusqlite::Connection;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};

pub struct AppState {
    pub db: Mutex<Connection>,
    pub engine: Mutex<EngineState>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("omwe.sqlite3");
            let conn = db::open(&db_path)?;
            let state = AppState {
                db: Mutex::new(conn),
                engine: Mutex::new(EngineState::default()),
            };
            if let Err(err) = shortcuts::reregister(app.handle(), &state) {
                log::warn!("failed to register global shortcuts: {err}");
            }
            app.manage(state);

            let show = MenuItem::with_id(app, "show", "Show OpenMount", true, None::<&str>)?;
            let play = MenuItem::with_id(app, "play", "Play / Pause", true, None::<&str>)?;
            let next = MenuItem::with_id(app, "next", "Next", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &play, &next, &quit])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "play" => {
                        if let Some(state) = app.try_state::<AppState>() {
                            let _ = commands::play_pause(app.clone(), state);
                        }
                    }
                    "next" => {
                        if let Some(state) = app.try_state::<AppState>() {
                            let _ = commands::next_item(app.clone(), state);
                        }
                    }
                    "quit" => {
                        let _ = wallpaper::hide_wallpaper(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_tree,
            commands::list_children,
            commands::search_nodes,
            commands::mount_path,
            commands::rename_node,
            commands::relocate_node,
            commands::reorder_nodes,
            commands::set_selected,
            commands::set_detection,
            commands::delete_nodes,
            commands::refresh_mounts,
            commands::get_engine,
            commands::get_playback_settings,
            commands::set_playback_settings,
            commands::start_wallpaper,
            commands::stop_wallpaper,
            commands::play_pause,
            commands::next_item,
            commands::prev_item,
            commands::reset_scroll,
            commands::nudge_scroll_speed,
            commands::get_shortcuts,
            commands::update_shortcut,
            commands::restore_shortcuts,
            commands::export_config,
            commands::import_config,
            commands::toggle_main_window,
            commands::app_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenMount");
}
