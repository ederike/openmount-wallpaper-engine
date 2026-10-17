#![cfg(target_os = "macos")]

use objc2::msg_send;
use objc2::runtime::AnyObject;
use tauri::WebviewWindow;

/// Desktop window level used by macOS (below icons, above wallpaper).
const DESKTOP_WINDOW_LEVEL: i64 = -2147483623;

pub fn attach_to_desktop(window: &WebviewWindow) {
    let Ok(ns_window) = window.ns_window() else {
        return;
    };
    unsafe {
        let ns_window = ns_window as *mut AnyObject;
        if ns_window.is_null() {
            return;
        }
        let _: () = msg_send![ns_window, setLevel: DESKTOP_WINDOW_LEVEL];
        // NSWindowCollectionBehaviorCanJoinAllSpaces | Stationary | IgnoresCycle
        let behavior: u64 = 1 << 0 | 1 << 4 | 1 << 6;
        let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
        let _: () = msg_send![ns_window, setHidesOnDeactivate: false];
        let _: () = msg_send![ns_window, setOpaque: false];
    }
}
