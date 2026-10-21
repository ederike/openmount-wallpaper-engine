#![cfg(target_os = "macos")]

use objc2::msg_send;
use objc2::runtime::AnyObject;
use tauri::WebviewWindow;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGWindowLevelForKey(key: i32) -> i32;
}

/// kCGDesktopWindowLevelKey. Icons sit at kCGDesktopIconWindowLevelKey (18).
const DESKTOP_WINDOW_LEVEL_KEY: i32 = 2;
const NS_WINDOW_BELOW: i64 = -1;
const NS_WINDOW_ANIMATION_NONE: i64 = 2;

fn desktop_window_level() -> isize {
    // +1 sits above the static system wallpaper and still below desktop icons.
    unsafe { CGWindowLevelForKey(DESKTOP_WINDOW_LEVEL_KEY) as isize + 1 }
}

pub fn attach_to_desktop(window: &WebviewWindow) -> bool {
    let Ok(ns_window) = window.ns_window() else {
        return false;
    };
    unsafe {
        let ns_window = ns_window as *mut AnyObject;
        if ns_window.is_null() {
            return false;
        }
        let level = desktop_window_level();
        let _: () = msg_send![ns_window, setLevel: level];
        // CanJoinAllSpaces | Stationary | IgnoresCycle
        let behavior: u64 = 1 << 0 | 1 << 4 | 1 << 6;
        let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
        let _: () = msg_send![ns_window, setHidesOnDeactivate: false];
        let _: () = msg_send![ns_window, setHasShadow: false];
        let _: () = msg_send![ns_window, setIgnoresMouseEvents: true];
        let _: () = msg_send![ns_window, setCanHide: false];
        let _: () = msg_send![ns_window, setOpaque: true];
        let _: () = msg_send![ns_window, setExcludedFromWindowsMenu: true];
        let _: () = msg_send![ns_window, setAnimationBehavior: NS_WINDOW_ANIMATION_NONE];
        let _: () = msg_send![ns_window, orderWindow: NS_WINDOW_BELOW relativeTo: 0isize];
        let _: () = msg_send![ns_window, resignKeyWindow];
        let _: () = msg_send![ns_window, resignMainWindow];
        log::info!("macOS wallpaper pinned at desktop level {level}");
    }
    true
}
