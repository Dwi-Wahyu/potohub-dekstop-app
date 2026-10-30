use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::process::CommandExt;
    use std::sync::atomic::{AtomicBool, Ordering};
    use winapi::um::winuser::{EnableWindow, FindWindowW, ShowWindow, SW_HIDE, SW_SHOW};

    // Flag Windows untuk menyembunyikan jendela konsol saat memanggil perintah proses latar belakang
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    static EXPLORER_TERMINATED: AtomicBool = AtomicBool::new(false);

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

    pub fn stop_explorer() {
        // Matikan explorer.exe agar gesture usap tepi (edge swipe up) dari layar sentuh
        // tidak dapat memunculkan taskbar sama sekali.
        let status = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "explorer.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();

        if let Ok(s) = status {
            if s.success() {
                EXPLORER_TERMINATED.store(true, Ordering::SeqCst);
                log::info!("[kiosk] explorer.exe dihentikan untuk hard lockdown kiosk touch screen.");
            }
        }
    }

    pub fn start_explorer() {
        // Pulihkan explorer.exe jika sebelumnya dihentikan oleh kiosk atau jika shell belum aktif
        unsafe {
            let tray_class = to_wide("Shell_TrayWnd");
            let hwnd_tray = FindWindowW(tray_class.as_ptr(), std::ptr::null());
            if hwnd_tray.is_null() || EXPLORER_TERMINATED.swap(false, Ordering::SeqCst) {
                log::info!("[kiosk] Memulihkan explorer.exe (desktop & taskbar)...");
                let _ = std::process::Command::new("explorer.exe")
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn();
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn set_taskbar_visible(_visible: bool) {
        // No-op pada OS non-Windows (Linux / macOS)
    }

    pub fn stop_explorer() {
        // No-op pada non-Windows
    }

    pub fn start_explorer() {
        // No-op pada non-Windows
    }
}

/// Mengatur penguncian sistem kiosk level-2:
/// - Jika locked = true:
///   1. Menyembunyikan dan men-disable window Taskbar Windows (`Shell_TrayWnd` & `Shell_SecondaryTrayWnd`).
///   2. Menghentikan proses `explorer.exe` sehingga usapan/swipe dari bawah layar sentuh (touchscreen)
///      100% diblokir dan tidak ada taskbar yang bisa terpanggil.
///   3. Memastikan jendela aplikasi Fullscreen dan Always On Top (`HWND_TOPMOST`).
/// - Jika locked = false:
///   1. Menyalakan kembali `explorer.exe` dan memulihkan Taskbar Windows.
///   2. Melepas status Always On Top sehingga operator bebas membuka window lain atau tekan Windows + L.
#[tauri::command]
pub async fn set_kiosk_system_lock(app: AppHandle, locked: bool) -> Result<(), String> {
    if locked {
        platform::set_taskbar_visible(false);
        platform::stop_explorer();

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_fullscreen(true);
            let _ = window.set_always_on_top(true);
        }
    } else {
        platform::start_explorer();
        platform::set_taskbar_visible(true);

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_always_on_top(false);
        }
    }

    Ok(())
}

/// Fungsi recovery untuk memastikan explorer & Taskbar selalu dipulihkan saat aplikasi keluar/ditutup
pub fn restore_taskbar() {
    platform::start_explorer();
    platform::set_taskbar_visible(true);
}
