#![cfg(windows)]

use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowExW, FindWindowW, SendMessageTimeoutW, SetParent, SMTO_NORMAL,
};

const SPAWN_WORKER: u32 = 0x052C;

unsafe extern "system" fn find_worker(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
    unsafe {
        let def = FindWindowExW(Some(hwnd), None, w!("SHELLDLL_DefView"), None).unwrap_or_default();
        if !def.is_invalid() {
            let worker = FindWindowExW(None, Some(hwnd), w!("WorkerW"), None).unwrap_or_default();
            if !worker.is_invalid() {
                *(lparam.0 as *mut HWND) = worker;
                return false.into();
            }
        }
        true.into()
    }
}

pub fn attach_to_desktop(child: HWND) {
    unsafe {
        let progman = FindWindowW(w!("Progman"), None).unwrap_or_default();
        if progman.is_invalid() {
            log::warn!("Progman window not found; wallpaper will use always-on-bottom");
            return;
        }
        let mut result = 0usize;
        let _ = SendMessageTimeoutW(
            progman,
            SPAWN_WORKER,
            WPARAM(0),
            LPARAM(0),
            SMTO_NORMAL,
            1000,
            Some(&mut result),
        );

        let mut worker = HWND::default();
        let _ = EnumWindows(Some(find_worker), LPARAM(&mut worker as *mut HWND as isize));
        if worker.is_invalid() {
            log::warn!("WorkerW window not found; wallpaper will use always-on-bottom");
            return;
        }
        if SetParent(child, Some(worker)).is_err() {
            log::warn!("SetParent failed; wallpaper will use always-on-bottom");
        }
    }
}
