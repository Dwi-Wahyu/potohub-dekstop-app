use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::OsStr;
    use std::mem::{size_of, zeroed};
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::process::CommandExt;
    use std::ptr::{null, null_mut};
    use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
    use std::sync::{Mutex, Once};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use winapi::ctypes::c_void;
    use winapi::shared::guiddef::{GUID, REFIID};
    use winapi::shared::minwindef::{BOOL, DWORD, FALSE, HKEY, LPARAM, LRESULT, TRUE, UINT, WPARAM};
    use winapi::shared::ntdef::HRESULT;
    use winapi::shared::windef::{HHOOK, HWND};
    use winapi::shared::winerror::SUCCEEDED;
    use winapi::shared::wtypes::{PROPERTYKEY, VARIANT_FALSE, VARIANT_TRUE, VT_BOOL};
    use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
    use winapi::um::libloaderapi::GetModuleHandleW;
    use winapi::um::processthreadsapi::{
        CreateProcessW, GetCurrentProcessId, ProcessIdToSessionId, PROCESS_INFORMATION,
        STARTUPINFOW,
    };
    use winapi::um::propidl::PROPVARIANT;
    use winapi::um::propsys::IPropertyStore;
    use winapi::um::sysinfoapi::GetWindowsDirectoryW;
    use winapi::um::tlhelp32::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use winapi::um::winnt::{KEY_SET_VALUE, REG_DWORD, REG_OPTION_NON_VOLATILE};
    use winapi::um::winreg::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE,
    };
    use winapi::um::winuser::{
        CallNextHookEx, DispatchMessageW, EnableWindow, EnumChildWindows, EnumWindows, FindWindowW,
        GetAsyncKeyState, GetClassNameW, GetForegroundWindow, GetMessageW, GetWindow,
        GetWindowThreadProcessId, IsChild, IsWindow, IsWindowVisible, PostMessageW,
        SendMessageTimeoutW, SetForegroundWindow, SetWindowPos, SetWindowsHookExW, ShowWindow,
        TranslateMessage, GW_OWNER, HWND_TOPMOST, KBDLLHOOKSTRUCT, LLKHF_ALTDOWN, MSG,
        SMTO_ABORTIFHUNG, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE,
        SW_SHOW, VK_CONTROL, VK_ESCAPE, VK_F4, VK_LWIN, VK_RWIN, VK_TAB, WH_KEYBOARD_LL,
        WM_CLOSE, WM_KEYDOWN, WM_KEYUP, WM_SETTINGCHANGE, WM_SYSKEYDOWN, WM_SYSKEYUP,
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
    static EXPLORER_STOPPED_BY_US: AtomicBool = AtomicBool::new(false);
    static GUARD_ACTIVE: AtomicBool = AtomicBool::new(false);
    static HOOK_INIT: Once = Once::new();
    static MAIN_HWND_RAW: AtomicIsize = AtomicIsize::new(0);
    static WATCHER_GEN: AtomicU64 = AtomicU64::new(0);
    static LAST_EXPLORER_SPAWN_MS: AtomicU64 = AtomicU64::new(0);
    static SHELL_OP_MUTEX: Mutex<()> = Mutex::new(());

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

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    fn wide_buf_to_string(buf: &[u16]) -> String {
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..len])
    }

    pub fn set_main_hwnd(hwnd_raw: isize) {
        if hwnd_raw != 0 {
            MAIN_HWND_RAW.store(hwnd_raw, Ordering::SeqCst);
        }
    }

    pub fn cancel_explorer_window_cleanup() {
        WATCHER_GEN.fetch_add(1, Ordering::SeqCst);
    }

    pub fn is_kiosk_locked() -> bool {
        KIOSK_LOCKED.load(Ordering::SeqCst)
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

    /// Mengecek apakah proses `explorer.exe` sedang berjalan di session Windows saat ini.
    fn is_explorer_process_running() -> bool {
        unsafe {
            let mut current_session: DWORD = 0;
            let current_pid = GetCurrentProcessId();
            let has_current_session =
                ProcessIdToSessionId(current_pid, &mut current_session) != 0;

            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID_HANDLE_VALUE {
                return false;
            }

            let mut entry: PROCESSENTRY32W = zeroed();
            entry.dwSize = size_of::<PROCESSENTRY32W>() as DWORD;
            let mut found = false;

            if Process32FirstW(snap, &mut entry) != 0 {
                loop {
                    let name = wide_buf_to_string(&entry.szExeFile);
                    if name.eq_ignore_ascii_case("explorer.exe") {
                        if has_current_session {
                            let mut proc_session: DWORD = 0;
                            if ProcessIdToSessionId(entry.th32ProcessID, &mut proc_session) != 0
                                && proc_session == current_session
                            {
                                found = true;
                                break;
                            }
                        } else {
                            found = true;
                            break;
                        }
                    }
                    if Process32NextW(snap, &mut entry) == 0 {
                        break;
                    }
                }
            }

            CloseHandle(snap);
            found
        }
    }

    /// Mengambil nama executable proses pemilik PID tertentu pada session aktif.
    unsafe fn get_process_name_by_pid(target_pid: DWORD) -> Option<String> {
        if target_pid == 0 {
            return None;
        }
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return None;
        }

        let mut entry: PROCESSENTRY32W = zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as DWORD;
        let mut result = None;

        if Process32FirstW(snap, &mut entry) != 0 {
            loop {
                if entry.th32ProcessID == target_pid {
                    result = Some(wide_buf_to_string(&entry.szExeFile));
                    break;
                }
                if Process32NextW(snap, &mut entry) == 0 {
                    break;
                }
            }
        }

        CloseHandle(snap);
        result
    }

    unsafe fn get_window_class_name(hwnd: HWND) -> String {
        let mut buf = [0u16; 256];
        let len = GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if len > 0 {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    }

    struct CabinetEnumState {
        handles: Vec<isize>,
    }

    unsafe extern "system" fn enum_cabinet_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = &mut *(lparam as *mut CabinetEnumState);
        let class_name = get_window_class_name(hwnd);
        if class_name == "CabinetWClass" || class_name == "ExploreWClass" {
            state.handles.push(hwnd as isize);
        }
        TRUE
    }

    fn snapshot_file_explorer_windows() -> Vec<isize> {
        unsafe {
            let mut state = CabinetEnumState {
                handles: Vec::new(),
            };
            EnumWindows(
                Some(enum_cabinet_windows_proc),
                &mut state as *mut CabinetEnumState as LPARAM,
            );
            state.handles
        }
    }

    fn get_explorer_exe_path() -> String {
        unsafe {
            let mut buf = [0u16; 320];
            let len = GetWindowsDirectoryW(buf.as_mut_ptr(), buf.len() as UINT);
            if len > 0 && (len as usize) < buf.len() {
                let win_dir = String::from_utf16_lossy(&buf[..len as usize]);
                let trimmed = win_dir.trim_end_matches(['\\', '/']);
                return format!("{}\\explorer.exe", trimmed);
            }
        }
        "C:\\Windows\\explorer.exe".to_string()
    }

    /// Menghentikan `explorer.exe` selama mode Kiosk Terkunci agar Task View (swipe 3 jari),
    /// Start Screen/Start Menu, Action Center, dan bottom taskbar swipe-up tidak memiliki host untuk tampil.
    pub fn stop_explorer() {
        let _guard = SHELL_OP_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        WATCHER_GEN.fetch_add(1, Ordering::SeqCst);

        if !is_explorer_process_running() {
            return;
        }

        let status = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "explorer.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();

        if let Ok(s) = status {
            if s.success() {
                EXPLORER_STOPPED_BY_US.store(true, Ordering::SeqCst);
                // Tunggu singkat hingga proses explorer.exe benar-benar berhenti agar
                // unlock cepat sesudahnya tidak mengalami race condition.
                for _ in 0..20 {
                    if !is_explorer_process_running() {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
                log::info!("[kiosk] explorer.exe dihentikan untuk mengunci Task View & Start Screen.");
            }
        }
    }

    /// Menyalakan kembali `explorer.exe` sebagai shell Desktop & Taskbar saat operator membuka
    /// kunci (unlock) atau keluar aplikasi — tanpa pernah memunculkan jendela File Manager.
    pub fn start_explorer() {
        let _guard = SHELL_OP_MUTEX.lock().unwrap_or_else(|e| e.into_inner());

        unsafe {
            let tray_class = to_wide("Shell_TrayWnd");
            let hwnd_tray = FindWindowW(tray_class.as_ptr(), null());
            let process_running = is_explorer_process_running();

            // PENTING: Jika explorer.exe sudah berjalan (atau Shell_TrayWnd sudah ada),
            // JANGAN pernah menjalankan explorer.exe lagi karena akan membuka jendela File Manager!
            if !hwnd_tray.is_null() || process_running {
                EXPLORER_STOPPED_BY_US.store(false, Ordering::SeqCst);
                set_taskbar_visible(true);
                log::info!(
                    "[kiosk] Shell explorer.exe sudah aktif (tray={}, proc={}), memulihkan taskbar tanpa spawn baru.",
                    !hwnd_tray.is_null(),
                    process_running
                );
                return;
            }

            EXPLORER_STOPPED_BY_US.store(false, Ordering::SeqCst);

            // Cooldown agar panggilan beruntun dari UI (OperatorAccessControl + GlobalOperatorModal + /settings)
            // tidak pernah meluncurkan dua proses explorer.exe sekaligus.
            let now = now_ms();
            let last = LAST_EXPLORER_SPAWN_MS.load(Ordering::SeqCst);
            if now.saturating_sub(last) < 3000 {
                log::info!("[kiosk] Pemulihan explorer.exe sedang berlangsung (cooldown), melewati spawn ganda.");
                return;
            }
            LAST_EXPLORER_SPAWN_MS.store(now, Ordering::SeqCst);

            let pre_existing_cabinets = snapshot_file_explorer_windows();
            let explorer_path = get_explorer_exe_path();
            let app_wide = to_wide(&explorer_path);

            let mut si: STARTUPINFOW = zeroed();
            si.cb = size_of::<STARTUPINFOW>() as DWORD;
            let mut pi: PROCESS_INFORMATION = zeroed();

            log::info!("[kiosk] Memulihkan desktop shell melalui {} ...", explorer_path);

            // Jalankan dengan lpCommandLine = NULL dan lpCurrentDirectory = NULL
            // agar Windows menginisialisasi Desktop/Taskbar Shell (bukan jendela folder).
            let created = CreateProcessW(
                app_wide.as_ptr(),
                null_mut(),
                null_mut(),
                null_mut(),
                FALSE,
                0,
                null_mut(),
                null_mut(),
                &mut si,
                &mut pi,
            );

            if created != 0 {
                if !pi.hProcess.is_null() {
                    CloseHandle(pi.hProcess);
                }
                if !pi.hThread.is_null() {
                    CloseHandle(pi.hThread);
                }
            } else {
                log::warn!("[kiosk] CreateProcessW explorer.exe gagal, tidak dapat memulihkan shell.");
                return;
            }

            // Beberapa build Windows 11 tetap otomatis membuka jendela CabinetWClass kosong
            // ketika explorer.exe dimulai ulang dari user process. Awasi selama ~2.5 detik dan tutup
            // seketika jendela File Manager nyasar yang muncul saat pemulihan shell ini.
            let gen = WATCHER_GEN.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
            std::thread::spawn(move || {
                let mut tray_restored = false;
                for _ in 0..50 {
                    if WATCHER_GEN.load(Ordering::SeqCst) != gen || KIOSK_LOCKED.load(Ordering::SeqCst)
                    {
                        break;
                    }

                    if !tray_restored {
                        let tray_w = to_wide("Shell_TrayWnd");
                        if !FindWindowW(tray_w.as_ptr(), null()).is_null() {
                            set_taskbar_visible(true);
                            tray_restored = true;
                        }
                    }

                    for hwnd_raw in snapshot_file_explorer_windows() {
                        if !pre_existing_cabinets.contains(&hwnd_raw) {
                            let hwnd = hwnd_raw as HWND;
                            if IsWindow(hwnd) != 0 {
                                ShowWindow(hwnd, SW_HIDE);
                                PostMessageW(hwnd, WM_CLOSE, 0, 0);
                                log::info!(
                                    "[kiosk] Menutup jendela File Manager otomatis pasca-pemulihan shell (hwnd={}).",
                                    hwnd_raw
                                );
                            }
                        }
                    }

                    std::thread::sleep(Duration::from_millis(50));
                }
            });
        }
    }

    unsafe extern "system" fn enum_hide_shell_overlays_proc(hwnd: HWND, _lparam: LPARAM) -> BOOL {
        if IsWindowVisible(hwnd) == 0 {
            return TRUE;
        }
        // Abaikan child/owned window milik aplikasi kita sendiri
        let main_hwnd = MAIN_HWND_RAW.load(Ordering::SeqCst) as HWND;
        if hwnd == main_hwnd || (!main_hwnd.is_null() && GetWindow(hwnd, GW_OWNER) == main_hwnd) {
            return TRUE;
        }

        let class_name = get_window_class_name(hwnd);
        let is_shell_overlay = if class_name == "Shell_TrayWnd"
            || class_name == "Shell_SecondaryTrayWnd"
            || class_name == "XamlExplorerHostWindow"
            || class_name == "MultitaskingViewFrame"
        {
            true
        } else if class_name == "Windows.UI.Core.CoreWindow" {
            let mut pid: DWORD = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if let Some(proc_name) = get_process_name_by_pid(pid) {
                proc_name.eq_ignore_ascii_case("StartMenuExperienceHost.exe")
                    || proc_name.eq_ignore_ascii_case("SearchHost.exe")
                    || proc_name.eq_ignore_ascii_case("SearchApp.exe")
                    || proc_name.eq_ignore_ascii_case("ShellExperienceHost.exe")
            } else {
                false
            }
        } else {
            false
        };

        if is_shell_overlay {
            ShowWindow(hwnd, SW_HIDE);
            if class_name == "Shell_TrayWnd" || class_name == "Shell_SecondaryTrayWnd" {
                EnableWindow(hwnd, FALSE);
            }
        }

        TRUE
    }

    /// Penjaga latar belakang saat mode Kiosk terkunci:
    /// Jika Windows (`AutoRestartShell`) menyalakan ulang `explorer.exe` atau overlay Start Screen /
    /// Task View muncul, segera sembunyikan kembali dan jaga aplikasi kiosk tetap Topmost & Fokus.
    pub fn ensure_kiosk_guard_running() {
        if GUARD_ACTIVE
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }

        std::thread::spawn(|| {
            let tray_class = to_wide("Shell_TrayWnd");
            while KIOSK_LOCKED.load(Ordering::SeqCst) {
                unsafe {
                    let main_raw = MAIN_HWND_RAW.load(Ordering::SeqCst);
                    let main_hwnd = main_raw as HWND;
                    let tray_hwnd = FindWindowW(tray_class.as_ptr(), null());
                    let fg_hwnd = GetForegroundWindow();

                    let tray_visible = !tray_hwnd.is_null() && IsWindowVisible(tray_hwnd) != 0;
                    let lost_focus = !main_hwnd.is_null()
                        && IsWindow(main_hwnd) != 0
                        && !fg_hwnd.is_null()
                        && fg_hwnd != main_hwnd
                        && IsChild(main_hwnd, fg_hwnd) == 0
                        && GetWindow(fg_hwnd, GW_OWNER) != main_hwnd;

                    if tray_visible || lost_focus {
                        EnumWindows(Some(enum_hide_shell_overlays_proc), 0);
                        if !main_hwnd.is_null() && IsWindow(main_hwnd) != 0 {
                            SetWindowPos(
                                main_hwnd,
                                HWND_TOPMOST,
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                            );
                            if lost_focus {
                                SetForegroundWindow(main_hwnd);
                            }
                        }
                    }
                }
                std::thread::sleep(Duration::from_millis(300));
            }
            GUARD_ACTIVE.store(false, Ordering::SeqCst);
        });
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
            let kb = &*(l_param as *const KBDLLHOOKSTRUCT);
            let vk = kb.vkCode as i32;

            if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
                let alt_down = (kb.flags & LLKHF_ALTDOWN) != 0;
                let ctrl_down = (GetAsyncKeyState(VK_CONTROL) as u16 & 0x8000) != 0;
                let win_down = (GetAsyncKeyState(VK_LWIN) as u16 & 0x8000) != 0
                    || (GetAsyncKeyState(VK_RWIN) as u16 & 0x8000) != 0;

                // Blokir:
                // - Tombol Windows Kiri / Kanan & kombinasinya (Start Screen, Win+Tab, Win+E, Win+A, dll)
                // - Ctrl + Esc (membuka Start Menu)
                // - Alt + Tab / Alt + Esc (berpindah jendela)
                // - Alt + F4 (menutup aplikasi paksa)
                let should_block = vk == VK_LWIN
                    || vk == VK_RWIN
                    || win_down
                    || (ctrl_down && vk == VK_ESCAPE)
                    || (alt_down && (vk == VK_TAB || vk == VK_ESCAPE || vk == VK_F4));

                if should_block {
                    return 1;
                }
            } else if (msg == WM_KEYUP || msg == WM_SYSKEYUP) && (vk == VK_LWIN || vk == VK_RWIN) {
                return 1;
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
#[allow(dead_code)]
mod platform {
    pub fn set_main_hwnd(_hwnd_raw: isize) {}
    pub fn cancel_explorer_window_cleanup() {}
    pub fn is_kiosk_locked() -> bool {
        false
    }
    pub fn set_window_edge_gesture_disabled(_hwnd_raw: isize, _disable: bool) {}
    pub fn set_registry_gesture_policies(_allow: bool) {}
    pub fn set_taskbar_visible(_visible: bool) {}
    pub fn stop_explorer() {}
    pub fn start_explorer() {}
    pub fn ensure_kiosk_guard_running() {}
    pub fn set_keyboard_lock(_locked: bool) {}
}

/// Membatalkan watcher penutupan jendela File Explorer otomatis (dipanggil saat operator
/// memang sengaja membuka folder sesi atau log via tombol di Config Dashboard).
pub fn cancel_explorer_window_cleanup() {
    platform::cancel_explorer_window_cleanup();
}

/// Mengatur penguncian sistem kiosk berlapis penuh pada Windows:
/// - Jika `locked = true`:
///   1. Mengaktifkan `System.EdgeGesture.DisableTouchWhenFullscreen` pada HWND utama & child WebView2
///      sehingga swipe 1 jari dari tepi layar sentuh diabaikan oleh OS.
///   2. Mematikan gesture 3/4 jari (Touchscreen & Precision Touchpad) serta EdgeUI via Registry.
///   3. Menyembunyikan Taskbar & menghentikan `explorer.exe` sehingga bottom taskbar swipe-up,
///      Task View (swipe 3 jari), dan Start Screen/Start Menu tidak bisa tampil sama sekali.
///   4. Memblokir pintasan sistem (`Win`, `Win+Tab`, `Ctrl+Esc`, `Alt+Tab`, `Alt+F4`) melalui `WH_KEYBOARD_LL`.
///   5. Memastikan jendela aplikasi Fullscreen, Always On Top (`HWND_TOPMOST`), dan dijaga oleh guard thread.
/// - Jika `locked = false`:
///   1. Melepas blokir keyboard sistem & menghentikan guard thread.
///   2. Memulihkan desktop shell `explorer.exe` dan Taskbar Windows secara aman tanpa membuka jendela File Manager.
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
                let hwnd_raw = hwnd.0 as isize;
                platform::set_main_hwnd(hwnd_raw);
                platform::set_window_edge_gesture_disabled(hwnd_raw, true);

                // Re-apply setelah transisi fullscreen WebView2 selesai agar child HWND baru ikut terkunci
                let app_for_task = app.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                    let app_for_main = app_for_task.clone();
                    let _ = app_for_task.run_on_main_thread(move || {
                        if platform::is_kiosk_locked() {
                            if let Some(win) = app_for_main.get_webview_window("main") {
                                if let Ok(h) = win.hwnd() {
                                    platform::set_window_edge_gesture_disabled(h.0 as isize, true);
                                }
                            }
                        }
                    });
                });
            }
        }

        platform::ensure_kiosk_guard_running();
    } else {
        platform::set_keyboard_lock(false);
        platform::set_registry_gesture_policies(true);
        platform::start_explorer();
        platform::set_taskbar_visible(true);

        if let Some(window) = app.get_webview_window("main") {
            #[cfg(target_os = "windows")]
            if let Ok(hwnd) = window.hwnd() {
                let hwnd_raw = hwnd.0 as isize;
                platform::set_main_hwnd(hwnd_raw);
                platform::set_window_edge_gesture_disabled(hwnd_raw, false);
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
