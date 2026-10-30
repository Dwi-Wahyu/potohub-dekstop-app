use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use winapi::um::winuser::{FindWindowW, ShowWindow, EnableWindow, SW_HIDE, SW_SHOW};

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    pub fn set_taskbar_visible(visible: bool) {
        unsafe {
            // 1. Primary Windows Taskbar ("Shell_TrayWnd")
            let tray_class = to_wide("Shell_TrayWnd");
            let hwnd_tray = FindWindowW(tray_class.as_ptr(), std::ptr::null());
            if !hwnd_tray.is_null() {
                ShowWindow(hwnd_tray, if visible { SW_SHOW } else { SW_HIDE });
                EnableWindow(hwnd_tray, if visible { 1 } else { 0 });
            }

            // 2. Secondary Taskbars pada konfigurasi multi-monitor ("Shell_SecondaryTrayWnd")
            let sec_tray_class = to_wide("Shell_SecondaryTrayWnd");
            let hwnd_sec = FindWindowW(sec_tray_class.as_ptr(), std::ptr::null());
            if !hwnd_sec.is_null() {
                ShowWindow(hwnd_sec, if visible { SW_SHOW } else { SW_HIDE });
                EnableWindow(hwnd_sec, if visible { 1 } else { 0 });
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn set_taskbar_visible(_visible: bool) {
        // No-op pada OS non-Windows (Linux / macOS)
    }
}

/// Mengatur penguncian sistem kiosk level-2:
/// - Jika locked = true:
///   1. Menyembunyikan dan men-disable window Taskbar Windows (`Shell_TrayWnd` & `Shell_SecondaryTrayWnd`)
///      sehingga usap/swipe dari bawah layar tidak memicu Taskbar keluar.
///   2. Memastikan jendela aplikasi Fullscreen dan Always On Top (`HWND_TOPMOST`).
/// - Jika locked = false:
///   1. Memunculkan dan mengaktifkan kembali Taskbar Windows normal (`SW_SHOW` & `EnableWindow(TRUE)`).
///   2. Melepas status Always On Top sehingga operator bebas membuka window lain atau tekan Windows + L.
#[tauri::command]
pub async fn set_kiosk_system_lock(app: AppHandle, locked: bool) -> Result<(), String> {
    platform::set_taskbar_visible(!locked);

    if let Some(window) = app.get_webview_window("main") {
        if locked {
            let _ = window.set_fullscreen(true);
            let _ = window.set_always_on_top(true);
        } else {
            let _ = window.set_always_on_top(false);
        }
    }

    Ok(())
}

/// Fungsi recovery untuk memastikan Taskbar selalu dipulihkan saat aplikasi keluar/ditutup
pub fn restore_taskbar() {
    platform::set_taskbar_visible(true);
}
