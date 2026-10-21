use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub fn prepare_wallpaper_window(window: &WebviewWindow) -> Result<(), String> {
    let _ = window.set_skip_taskbar(true);
    let _ = window.set_decorations(false);
    let _ = window.set_ignore_cursor_events(true);
    let _ = window.set_shadow(false);
    let _ = window.set_fullscreen(false);
    let _ = window.set_focusable(false);

    if let Ok(Some(monitor)) = window.primary_monitor() {
        let size = monitor.size();
        let pos = monitor.position();
        let _ = window.set_position(PhysicalPosition::new(pos.x, pos.y));
        let _ = window.set_size(PhysicalSize::new(size.width, size.height));
    }

    #[cfg(target_os = "windows")]
    {
        let attached = window
            .hwnd()
            .ok()
            .map(windows::attach_to_desktop)
            .unwrap_or(false);
        if !attached {
            let _ = window.set_always_on_bottom(true);
        }
    }

    #[cfg(target_os = "macos")]
    {
        if !macos::attach_to_desktop(window) {
            let _ = window.set_always_on_bottom(true);
        }
    }

    // Linux (dev only): no desktop WorkerW. Stay under other apps, not under icons.
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = window.set_always_on_bottom(true);
    }

    Ok(())
}

pub fn show_wallpaper(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("wallpaper")
        .ok_or_else(|| "wallpaper window missing".to_string())?;
    let _ = window.set_focusable(false);
    prepare_wallpaper_window(&window)?;
    window.show().map_err(|e| e.to_string())?;
    // show() makeKeyAndOrderFront on macOS; pin behind icons and restore UI focus.
    prepare_wallpaper_window(&window)?;
    #[cfg(target_os = "macos")]
    {
        if let Some(main) = app.get_webview_window("main") {
            if main.is_visible().unwrap_or(false) {
                let _ = main.set_focus();
            }
        }
    }
    Ok(())
}

pub fn hide_wallpaper(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("wallpaper") {
        #[cfg(target_os = "windows")]
        {
            if let Ok(hwnd) = window.hwnd() {
                windows::detach_from_desktop(hwnd);
            }
        }
        let _ = window.hide();
    }
    Ok(())
}

/// Re-apply desktop stacking after app activation, un-minimize, or focus changes.
pub fn repin_if_playing(app: &tauri::AppHandle) {
    let playing = app
        .try_state::<crate::AppState>()
        .map(|s| s.engine.lock().running)
        .unwrap_or(false);
    if !playing {
        return;
    }
    let Some(window) = app.get_webview_window("wallpaper") else {
        return;
    };
    if !window.is_visible().unwrap_or(false) {
        return;
    }
    let _ = prepare_wallpaper_window(&window);
    #[cfg(target_os = "macos")]
    {
        if window.is_focused().unwrap_or(false) {
            if let Some(main) = app.get_webview_window("main") {
                if main.is_visible().unwrap_or(false) {
                    let _ = main.set_focus();
                }
            }
        }
    }
}
