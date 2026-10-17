use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "macos")]
mod macos;

pub fn prepare_wallpaper_window(window: &WebviewWindow) -> Result<(), String> {
    let _ = window.set_skip_taskbar(true);
    let _ = window.set_decorations(false);
    let _ = window.set_always_on_bottom(true);
    let _ = window.set_ignore_cursor_events(true);
    let _ = window.set_shadow(false);

    if let Ok(Some(monitor)) = window.primary_monitor() {
        let size = monitor.size();
        let pos = monitor.position();
        let _ = window.set_position(PhysicalPosition::new(pos.x, pos.y));
        let _ = window.set_size(PhysicalSize::new(size.width, size.height));
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            windows::attach_to_desktop(hwnd);
        }
    }

    #[cfg(target_os = "macos")]
    {
        macos::attach_to_desktop(window);
    }

    Ok(())
}

pub fn show_wallpaper(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("wallpaper")
        .ok_or_else(|| "wallpaper window missing".to_string())?;
    prepare_wallpaper_window(&window)?;
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn hide_wallpaper(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("wallpaper") {
        let _ = window.hide();
    }
    Ok(())
}
