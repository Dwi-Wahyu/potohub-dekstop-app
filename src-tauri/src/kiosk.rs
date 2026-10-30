use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::OsStr;
    use std::mem::zeroed;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::process::CommandExt;
    use std::ptr::{null, null_mut};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Once;

    use winapi::ctypes::c_void;
    use winapi::shared::guiddef::{GUID, REFIID};
    use winapi::shared::minwindef::{BOOL, DWORD, FALSE, HKEY, LPARAM, LRESULT, TRUE, UINT, WPARAM};
    use winapi::shared::ntdef::HRESULT;
    use winapi::shared::windef::{HHOOK, HWND};
    use winapi::shared::winerror::SUCCEEDED;
    use winapi::shared::wtypes::{PROPERTYKEY, VARIANT_FALSE, VARIANT_TRUE, VT_BOOL};
    use winapi::um::libloaderapi::GetModuleHandleW;
    use winapi::um::propidl::PROPVARIANT;
    use winapi::um::propsys::IPropertyStore;
    use winapi::um::winnt::{KEY_SET_VALUE, REG_DWORD, REG_OPTION_NON_VOLATILE};
    use winapi::um::winreg::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE,
    };
    use winapi::um::winuser::{
        CallNextHookEx, DispatchMessageW, EnableWindow, EnumChildWindows, FindWindowW,
        GetAsyncKeyState, GetMessageW, SendMessageTimeoutW, SetWindowsHookExW, ShowWindow,
        TranslateMessage, KBDLLHOOKSTRUCT, LLKHF_ALTDOWN, MSG, SMTO_ABORTIFHUNG, SW_HIDE,
        SW_SHOW, VK_CONTROL, VK_ESCAPE, VK_F4, VK_LWIN, VK_RWIN, VK_TAB, WH_KEYBOARD_LL,
        WM_KEYDOWN, WM_SETTINGCHANGE, WM_SYSKEYDOWN,
    };
    use winapi::Interface;

    #[link(name = "shell32")]
    extern "system" {
        fn SHGetPropertyStoreForWindow(
            hwnd: HWND,
            riid: REFIID,
            ppv: *mut *mut c_void,
        ) -> HRESULT;
    }

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    /// Status apakah Kiosk sedang dalam mode terkunci (Locked)
    static KIOSK_LOCKED: AtomicBool = AtomicBool::new(false);
    static EXPLORER_TERMINATED: AtomicBool = AtomicBool::new(false);
    static HOOK_INIT: Once = Once::new();

    /// PKEY_EdgeGesture_DisableTouchWhenFullscreen: {32CE38B2-2C9A-41B1-9BC5-B3784394AA44}, PID 2
    const PKEY_EDGE_GESTURE_DISABLE_TOUCH_WHEN_FULLSCREEN: PROPERTYKEY = PROPERTYKEY {
        fmtid: GUID {
            Data1: 0x32CE38B2,
            Data2: 0x2C9A,
            Data3: 0x41B1,
            Data4: [0x9B, 0xC5, 0xB3, 0x78, 0x43, 0x94, 0xAA, 0x44],
        },
        pid: 2,
    };

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    /// Helper menulis DWORD ke Registry
    unsafe fn write_reg_dword(root: HKEY, subkey_path: &str, name: &str, value: DWORD) {
        let subkey = to_wide(subkey_path);
        let val_name = to_wide(name);
        let mut hkey: HKEY = null_mut();
        let status = RegCreateKeyExW(
            root,
            subkey.as_ptr(),
            0,
            null_mut(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            null_mut(),
            &mut hkey,
            null_mut(),
        );

        if status == 0 && !hkey.is_null() {
            let _ = RegSetValueExW(
                hkey,
                val_name.as_ptr(),
                0,
                REG_DWORD,
                &value as *const DWORD as *const u8,
                std::mem::size_of::<DWORD>() as DWORD,
            );
            RegCloseKey(hkey);
        }
    }

    /// Menerapkan System.EdgeGesture.DisableTouchWhenFullscreen pada satu HWND
    unsafe fn apply_edge_gesture_property(hwnd: HWND, disable: bool) -> bool {
        if hwnd.is_null() {
            return false;
        }

        let mut prop_store_ptr: *mut c_void = null_mut();
        let hr = SHGetPropertyStoreForWindow(
            hwnd,
            &IPropertyStore::uuidof(),
            &mut prop_store_ptr,
        );

        if SUCCEEDED(hr) && !prop_store_ptr.is_null() {
            let prop_store = &*(prop_store_ptr as *mut IPropertyStore);
            let mut prop_var: PROPVARIANT = zeroed();
            prop_var.vt = VT_BOOL as u16;
            *prop_var.data.boolVal_mut() = if disable { VARIANT_TRUE } else { VARIANT_FALSE };

            let set_hr = prop_store.SetValue(
                &PKEY_EDGE_GESTURE_DISABLE_TOUCH_WHEN_FULLSCREEN,
                &prop_var,
            );
            let _ = prop_store.Commit();
            prop_store.Release();
            return SUCCEEDED(set_hr);
        }

        false
    }

    unsafe extern "system" fn enum_child_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let disable = lparam != 0;
        apply_edge_gesture_property(hwnd, disable);
        TRUE
    }

    /// Menonaktifkan atau mengaktifkan kembali Touch Edge Swipe (bottom/top/left/right swipe)
    /// pada jendela utama Tauri beserta seluruh child window WebView2 di dalamnya.
    pub fn set_window_edge_gesture_disabled(hwnd_raw: isize, disable: bool) {
        unsafe {
            let hwnd = hwnd_raw as HWND;
            if hwnd.is_null() {
                return;
            }

            let ok = apply_edge_gesture_property(hwnd, disable);
            // Terapkan juga ke semua child window (misal Chrome_WidgetWin / WebView2 host)
            EnumChildWindows(hwnd, Some(enum_child_proc), if disable { 1 } else { 0 });

            log::info!(
                "[kiosk] System.EdgeGesture.DisableTouchWhenFullscreen(disable={}) -> success={}",
                disable,
                ok
            );
        }
    }

    /// Mengatur policy Registry untuk mematikan:
    /// 1. EdgeUI Swipe (`AllowEdgeSwipe`) di HKCU & HKLM
    /// 2. Multi-finger Touchscreen Gestures 3/4 jari (`TouchGestureSetting`) di HKCU
    /// 3. Precision Touchpad 3/4 jari (`ThreeFingerSlideEnabled`, `FourFingerSlideEnabled`) di HKCU
    pub fn set_registry_gesture_policies(allow: bool) {
        unsafe {
            let val: DWORD = if allow { 1 } else { 0 };

            // 1. EdgeUI (1-finger edge swipe)
            write_reg_dword(
                HKEY_CURRENT_USER,
                "SOFTWARE\\Policies\\Microsoft\\Windows\\EdgeUI",
                "AllowEdgeSwipe",
                val,
            );
            write_reg_dword(
                HKEY_LOCAL_MACHINE,
                "SOFTWARE\\Policies\\Microsoft\\Windows\\EdgeUI",
                "AllowEdgeSwipe",
                val,
            );

            // 2. Touchscreen 3 & 4 finger swipe gestures (Task View / Virtual Desktop)
            write_reg_dword(
                HKEY_CURRENT_USER,
                "Control Panel\\Desktop",
                "TouchGestureSetting",
                val,
            );

            // 3. Precision Touchpad 3 & 4 finger swipe gestures (untuk pengujian di laptop / mini PC ber-touchpad)
            write_reg_dword(
                HKEY_CURRENT_USER,
                "Software\\Microsoft\\Windows\\CurrentVersion\\PrecisionTouchPad",
                "ThreeFingerSlideEnabled",
                val,
            );
            write_reg_dword(
                HKEY_CURRENT_USER,
                "Software\\Microsoft\\Windows\\CurrentVersion\\PrecisionTouchPad",
                "FourFingerSlideEnabled",
                val,
            );

            // Broadcast WM_SETTINGCHANGE agar Windows langsung memuat ulang konfigurasi gesture
            let policy_str = to_wide("Policy");
            let mut result: usize = 0;
            SendMessageTimeoutW(
                0xffff as HWND,
                WM_SETTINGCHANGE,
                0,
                policy_str.as_ptr() as LPARAM,
                SMTO_ABORTIFHUNG,
                100,
                &mut result,
            );
        }
    }

    /// Menyembunyikan atau menampilkan kembali Taskbar Windows
    pub fn set_taskbar_visible(visible: bool) {
        unsafe {
            let tray_class = to_wide("Shell_TrayWnd");
            let hwnd_tray = FindWindowW(tray_class.as_ptr(), null());
            if !hwnd_tray.is_null() {
                ShowWindow(hwnd_tray, if visible { SW_SHOW } else { SW_HIDE });
                EnableWindow(hwnd_tray, if visible { TRUE } else { FALSE });
            }

            let sec_tray_class = to_wide("Shell_SecondaryTrayWnd");
            let hwnd_sec = FindWindowW(sec_tray_class.as_ptr(), null());
            if !hwnd_sec.is_null() {
                ShowWindow(hwnd_sec, if visible { SW_SHOW } else { SW_HIDE });
                EnableWindow(hwnd_sec, if visible { TRUE } else { FALSE });
            }
        }
    }

    /// Menghentikan `explorer.exe` selama mode Kiosk Terkunci agar Task View (swipe 3 jari),
    /// Start Menu, dan Action Center tidak memiliki host proses untuk tampil.
    pub fn stop_explorer() {
        let status = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "explorer.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();

        if let Ok(s) = status {
            if s.success() {
                EXPLORER_TERMINATED.store(true, Ordering::SeqCst);
                log::info!("[kiosk] explorer.exe dihentikan untuk mengunci Task View & Start Menu.");
            }
        }
    }

    /// Menyalakan kembali `explorer.exe` saat operator membuka kunci (unlock) atau keluar aplikasi
    pub fn start_explorer() {
        unsafe {
            let tray_class = to_wide("Shell_TrayWnd");
            let hwnd_tray = FindWindowW(tray_class.as_ptr(), null());
            if hwnd_tray.is_null() || EXPLORER_TERMINATED.swap(false, Ordering::SeqCst) {
                log::info!("[kiosk] Memulihkan explorer.exe (desktop & taskbar)...");
                let _ = std::process::Command::new("explorer.exe")
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn();
            }
        }
    }

    /// Callback Low-Level Keyboard Hook untuk memblokir tombol Windows / Start Menu / Task View
    /// (termasuk sinyal VK_LWIN / Win+Tab sintetis dari driver touchpad/touchscreen) saat mode Kiosk terkunci.
    unsafe extern "system" fn low_level_keyboard_proc(
        n_code: i32,
        w_param: WPARAM,
        l_param: LPARAM,
    ) -> LRESULT {
        if n_code >= 0 && KIOSK_LOCKED.load(Ordering::SeqCst) {
            let msg = w_param as UINT;
            if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
                let kb = &*(l_param as *const KBDLLHOOKSTRUCT);
                let vk = kb.vkCode as i32;
                let alt_down = (kb.flags & LLKHF_ALTDOWN) != 0;
                let ctrl_down = (GetAsyncKeyState(VK_CONTROL) as u16 & 0x8000) != 0;

                // Blokir:
                // - Tombol Windows Kiri / Kanan (Start Menu, Win+Tab Task View, Win+A, dll)
                // - Ctrl + Esc (membuka Start Menu)
                // - Alt + Tab / Alt + Esc (berpindah jendela)
                // - Alt + F4 (menutup aplikasi paksa)
                let should_block = vk == VK_LWIN
                    || vk == VK_RWIN
                    || (ctrl_down && vk == VK_ESCAPE)
                    || (alt_down && (vk == VK_TAB || vk == VK_ESCAPE || vk == VK_F4));

                if should_block {
                    return 1;
                }
            }
        }

        CallNextHookEx(null_mut() as HHOOK, n_code, w_param, l_param)
    }

    /// Mengatur status aktif/tidaknya penguncian input keyboard sistem
    pub fn set_keyboard_lock(locked: bool) {
        KIOSK_LOCKED.store(locked, Ordering::SeqCst);

        if locked {
            HOOK_INIT.call_once(|| {
                std::thread::spawn(|| unsafe {
                    let h_instance = GetModuleHandleW(null());
                    let hook = SetWindowsHookExW(
                        WH_KEYBOARD_LL,
                        Some(low_level_keyboard_proc),
                        h_instance,
                        0,
                    );

                    if !hook.is_null() {
                        log::info!("[kiosk] Low-level keyboard hook (WH_KEYBOARD_LL) aktif.");
                        let mut msg: MSG = zeroed();
                        while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
                            TranslateMessage(&msg);
                            DispatchMessageW(&msg);
                        }
                    } else {
                        log::warn!("[kiosk] Gagal memasang WH_KEYBOARD_LL hook.");
                    }
                });
            });
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn set_window_edge_gesture_disabled(_hwnd_raw: isize, _disable: bool) {}
    pub fn set_registry_gesture_policies(_allow: bool) {}
    pub fn set_taskbar_visible(_visible: bool) {}
    pub fn stop_explorer() {}
    pub fn start_explorer() {}
    pub fn set_keyboard_lock(_locked: bool) {}
}

/// Mengatur penguncian sistem kiosk berlapis penuh pada Windows:
/// - Jika `locked = true`:
///   1. Mengaktifkan `System.EdgeGesture.DisableTouchWhenFullscreen` pada HWND utama & child WebView2
///      sehingga swipe 1 jari dari tepi layar sentuh diabaikan oleh OS.
///   2. Mematikan gesture 3/4 jari (Touchscreen & Precision Touchpad) serta EdgeUI via Registry.
///   3. Menyembunyikan Taskbar & menghentikan `explorer.exe` sehingga Task View (daftar aplikasi berjalan
///      saat swipe 3 jari) dan Start Menu tidak bisa tampil sama sekali.
///   4. Memblokir pintasan sistem (`Win`, `Win+Tab`, `Ctrl+Esc`, `Alt+Tab`, `Alt+F4`) melalui `WH_KEYBOARD_LL`.
///   5. Memastikan jendela aplikasi Fullscreen dan Always On Top (`HWND_TOPMOST`).
/// - Jika `locked = false`:
///   1. Melepas blokir keyboard sistem (operator bebas menekan `Windows + L` atau `Alt + Tab`).
///   2. Menyalakan kembali `explorer.exe` dan memulihkan Taskbar Windows.
///   3. Mengembalikan properti EdgeGesture dan melepas status Always On Top.
#[tauri::command]
pub async fn set_kiosk_system_lock(app: AppHandle, locked: bool) -> Result<(), String> {
    if locked {
        platform::set_registry_gesture_policies(false);
        platform::set_taskbar_visible(false);
        platform::stop_explorer();
        platform::set_keyboard_lock(true);

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_decorations(false);
            let _ = window.set_fullscreen(true);
            let _ = window.set_always_on_top(true);
            let _ = window.set_focus();

            #[cfg(target_os = "windows")]
            if let Ok(hwnd) = window.hwnd() {
                platform::set_window_edge_gesture_disabled(hwnd.0 as isize, true);
            }
        }
    } else {
        platform::set_keyboard_lock(false);
        platform::set_registry_gesture_policies(true);
        platform::start_explorer();
        platform::set_taskbar_visible(true);

        if let Some(window) = app.get_webview_window("main") {
            #[cfg(target_os = "windows")]
            if let Ok(hwnd) = window.hwnd() {
                platform::set_window_edge_gesture_disabled(hwnd.0 as isize, false);
            }

            let _ = window.set_always_on_top(false);
        }
    }

    Ok(())
}

/// Fungsi recovery untuk memastikan explorer, Taskbar & input dipulihkan saat aplikasi keluar/ditutup
pub fn restore_taskbar() {
    platform::set_keyboard_lock(false);
    platform::set_registry_gesture_policies(true);
    platform::start_explorer();
    platform::set_taskbar_visible(true);
}
