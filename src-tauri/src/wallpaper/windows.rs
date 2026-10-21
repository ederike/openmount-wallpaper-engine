#![cfg(windows)]

use windows::core::w;
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, RECT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowExW, FindWindowW, GetClientRect, GetWindowLongPtrW, SendMessageTimeoutW,
    SetLayeredWindowAttributes, SetParent, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, GWL_STYLE,
    HWND_BOTTOM, LWA_ALPHA, SMTO_NORMAL, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    SWP_SHOWWINDOW, WS_CAPTION, WS_CHILD, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_POPUP, WS_THICKFRAME, WS_VISIBLE,
};

const SPAWN_WORKER: u32 = 0x052C;

struct DesktopHost {
    parent: HWND,
    /// Icons live here. Keep this above the wallpaper child on Win11 24H2.
    def_view: HWND,
}

unsafe extern "system" fn find_classic_worker(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
    unsafe {
        let def = FindWindowExW(Some(hwnd), None, w!("SHELLDLL_DefView"), None).unwrap_or_default();
        if def.is_invalid() {
            return true.into();
        }
        // Win10 / early Win11: wallpaper WorkerW is the next top-level sibling.
        let worker = FindWindowExW(None, Some(hwnd), w!("WorkerW"), None).unwrap_or_default();
        if !worker.is_invalid() {
            *(lparam.0 as *mut HWND) = worker;
            return false.into();
        }
        true.into()
    }
}

fn raise_desktop(progman: HWND) {
    unsafe {
        // Explorer accepts several 0x052C payloads depending on build.
        for (wparam, lparam) in [(0xDusize, 1isize), (0xD, 0), (0, 0)] {
            let mut result = 0usize;
            let _ = SendMessageTimeoutW(
                progman,
                SPAWN_WORKER,
                WPARAM(wparam),
                LPARAM(lparam),
                SMTO_NORMAL,
                1000,
                Some(&mut result),
            );
        }
    }
}

fn find_desktop_host(progman: HWND) -> Option<DesktopHost> {
    unsafe {
        // Win11 24H2: DefView and WorkerW are children of Progman.
        // Parent the wallpaper to Progman and stack it under the icon window.
        let def_view =
            FindWindowExW(Some(progman), None, w!("SHELLDLL_DefView"), None).unwrap_or_default();
        if !def_view.is_invalid() {
            log::info!("desktop host: Progman with layered SHELLDLL_DefView (Win11 24H2 path)");
            return Some(DesktopHost {
                parent: progman,
                def_view,
            });
        }

        let mut worker = HWND::default();
        let _ = EnumWindows(
            Some(find_classic_worker),
            LPARAM(&mut worker as *mut HWND as isize),
        );
        if !worker.is_invalid() {
            log::info!("desktop host: classic top-level WorkerW");
            return Some(DesktopHost {
                parent: worker,
                def_view: HWND::default(),
            });
        }

        let worker_child =
            FindWindowExW(Some(progman), None, w!("WorkerW"), None).unwrap_or_default();
        if !worker_child.is_invalid() {
            log::info!("desktop host: WorkerW child of Progman");
            return Some(DesktopHost {
                parent: worker_child,
                def_view: HWND::default(),
            });
        }
    }
    None
}

fn restyle_as_child(child: HWND) {
    unsafe {
        let style = GetWindowLongPtrW(child, GWL_STYLE) as u32;
        let style =
            (style & !(WS_POPUP.0 | WS_CAPTION.0 | WS_THICKFRAME.0)) | WS_CHILD.0 | WS_VISIBLE.0;
        SetWindowLongPtrW(child, GWL_STYLE, style as isize);

        let ex = GetWindowLongPtrW(child, GWL_EXSTYLE) as u32;
        let ex =
            (ex | WS_EX_LAYERED.0 | WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0 | WS_EX_TRANSPARENT.0)
                & !WS_EX_APPWINDOW.0;
        SetWindowLongPtrW(child, GWL_EXSTYLE, ex as isize);
        let _ = SetLayeredWindowAttributes(child, COLORREF(0), 255, LWA_ALPHA);
    }
}

pub fn attach_to_desktop(child: HWND) -> bool {
    unsafe {
        let progman = FindWindowW(w!("Progman"), None).unwrap_or_default();
        if progman.is_invalid() {
            log::warn!("Progman window not found; wallpaper will use always-on-bottom");
            return false;
        }
        raise_desktop(progman);

        let Some(host) = find_desktop_host(progman) else {
            log::warn!("desktop WorkerW/DefView not found; wallpaper will use always-on-bottom");
            return false;
        };

        restyle_as_child(child);
        if SetParent(child, Some(host.parent)).is_err() {
            log::warn!("SetParent failed; wallpaper will use always-on-bottom");
            return false;
        }

        let mut rc = RECT::default();
        let _ = GetClientRect(host.parent, &mut rc);
        let width = (rc.right - rc.left).max(1);
        let height = (rc.bottom - rc.top).max(1);

        if host.def_view.is_invalid() {
            let _ = SetWindowPos(
                child,
                Some(HWND_BOTTOM),
                0,
                0,
                width,
                height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
            );
        } else {
            // Stack: WorkerW (system wallpaper) < our window < SHELLDLL_DefView (icons).
            let _ = SetWindowPos(
                child,
                Some(host.def_view),
                0,
                0,
                width,
                height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
            );
            let _ = SetWindowPos(
                host.def_view,
                None,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
        log::info!("wallpaper HWND attached behind desktop icons");
        true
    }
}

pub fn detach_from_desktop(child: HWND) {
    unsafe {
        let _ = SetParent(child, None);
    }
}
