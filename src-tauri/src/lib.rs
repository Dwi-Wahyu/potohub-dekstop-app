pub mod canon_edsdk;
mod cache;
mod gphoto;
mod media;
mod printer;
mod storage;
use tauri_plugin_sql::{Migration, MigrationKind};

use gphoto::{DeviceInfo, GphotoError};
use gphoto2::Camera;
use printer::{PrintOptions, PrinterError, PrinterStatus};
use std::path::PathBuf;
use tauri::{Manager, State};
use tokio::sync::Mutex;

pub struct AppState {
    pub camera: Mutex<Option<Camera>>,
    pub liveview_buffer: Mutex<gphoto::LiveviewBuffer>,
}

#[tauri::command]
async fn connect_camera(state: State<'_, AppState>) -> Result<DeviceInfo, GphotoError> {
    #[cfg(target_os = "windows")]
    {
        if canon_edsdk::platform::is_available() {
            match canon_edsdk::platform::connect().await {
                Ok((model, port)) => {
                    return Ok(DeviceInfo {
                        manufacturer: Some("Canon (EDSDK Native)".into()),
                        productname: Some(format!("{} [{}]", model, port)),
                    });
                }
                Err(e) => {
                    log::warn!("[connect_camera] EDSDK connect info: {}", e);
                    // Jika error spesifik seperti port sibuk atau sesi terpakai, kembalikan langsung ke user
                    if e.contains("digunakan aplikasi lain") || e.contains("sibuk") || e.contains("Gagal membuka sesi") {
                        return Err(GphotoError::Connection(e));
                    }
                    log::info!("[connect_camera] Mencoba fallback gphoto2...");
                }
            }
        }
    }

    let (camera, info) = gphoto::connect().await?;
    *state.camera.lock().await = Some(camera);
    Ok(info)
}

#[tauri::command]
async fn detect_camera() -> Result<Vec<gphoto::DetectedCamera>, GphotoError> {
    #[cfg(target_os = "windows")]
    {
        if canon_edsdk::platform::is_available() {
            if let Ok(canon_cams) = canon_edsdk::platform::detect_cameras().await {
                if !canon_cams.is_empty() {
                    return Ok(canon_cams
                        .into_iter()
                        .map(|c| gphoto::DetectedCamera {
                            model: c.model,
                            port: c.port,
                        })
                        .collect());
                }
            }
        }
    }

    gphoto::detect().await
}

#[tauri::command]
async fn disconnect_camera(state: State<'_, AppState>) -> Result<(), GphotoError> {
    #[cfg(target_os = "windows")]
    {
        let _ = canon_edsdk::platform::disconnect().await;
    }
    *state.camera.lock().await = None;
    Ok(())
}

#[tauri::command]
async fn is_camera_connected(state: State<'_, AppState>) -> Result<bool, GphotoError> {
    #[cfg(target_os = "windows")]
    {
        if canon_edsdk::platform::is_connected().await {
            return Ok(true);
        }
    }
    Ok(state.camera.lock().await.is_some())
}

#[tauri::command]
async fn open_log_dir(app: tauri::AppHandle) -> Result<String, String> {
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let log_file = log_dir.join("potohub.log");
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer.exe")
            .arg(log_dir.to_string_lossy().as_ref())
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(log_dir.to_string_lossy().as_ref())
            .spawn();
    }
    Ok(log_file.to_string_lossy().to_string())
}

#[tauri::command]
async fn is_usbdk_installed() -> bool {
    #[cfg(target_os = "windows")]
    {
        std::path::Path::new("C:\\Windows\\System32\\drivers\\UsbDk.sys").exists()
            || std::path::Path::new("C:\\Windows\\System32\\UsbDkHelper.dll").exists()
    }
    #[cfg(not(target_os = "windows"))]
    {
        true
    }
}

#[tauri::command]
async fn install_usbdk(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use tauri::Manager;
        let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
        let msi_path = resource_dir.join("drivers").join("UsbDk_1.0.22_x64.msi");
        let target_msi = if msi_path.exists() {
            msi_path
        } else {
            let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
            let exe_dir = exe_path.parent().unwrap_or(std::path::Path::new("."));
            let candidate1 = exe_dir.join("drivers/UsbDk_1.0.22_x64.msi");
            let candidate2 = exe_dir.join("../drivers/UsbDk_1.0.22_x64.msi");
            let candidate3 = exe_dir.join("../../drivers/UsbDk_1.0.22_x64.msi");
            if candidate1.exists() {
                candidate1
            } else if candidate2.exists() {
                candidate2
            } else if candidate3.exists() {
                candidate3
            } else {
                std::path::PathBuf::from("drivers/UsbDk_1.0.22_x64.msi")
            }
        };

        if !target_msi.exists() {
            return Err("File installer UsbDk_1.0.22_x64.msi tidak ditemukan.".into());
        }

        let output = std::process::Command::new("msiexec.exe")
            .args(&["/i", &target_msi.to_string_lossy(), "/qn", "/norestart"])
            .output()
            .map_err(|e| format!("Gagal menjalankan msiexec: {}", e))?;

        if output.status.success() {
            Ok("UsbDk driver berhasil dipasang secara otomatis.".into())
        } else {
            Err(format!(
                "Pemasangan UsbDk gagal dengan kode exit {}. Pastikan memiliki hak administrator.",
                output.status
            ))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Ok("UsbDk tidak diperlukan pada sistem operasi selain Windows.".into())
    }
}

#[tauri::command]
fn is_development_mode() -> bool {
    let args: Vec<String> = std::env::args().collect();
    let has_dev_flag = args.iter().any(|arg| {
        arg == "--development" || arg == "-d" || arg == "--dev"
    });
    let env_dev = std::env::var("DEVELOPMENT")
        .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
        .unwrap_or(false);
    let env_webcam = std::env::var("VITE_ENABLE_DEV_WEBCAM")
        .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
        .unwrap_or(false);

    has_dev_flag || env_dev || env_webcam
}

#[tauri::command]
async fn get_camera_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<serde_json::Value, GphotoError> {
    #[cfg(target_os = "windows")]
    {
        if canon_edsdk::platform::is_connected().await {
            return Ok(serde_json::json!({
                "value": "auto",
                "ability": ["auto"]
            }));
        }
    }
    let guard = state.camera.lock().await;
    let camera = guard.as_ref().ok_or(GphotoError::NotConnected)?;
    gphoto::get_setting(camera, &key).await
}

#[tauri::command]
async fn set_camera_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), GphotoError> {
    #[cfg(target_os = "windows")]
    {
        if canon_edsdk::platform::is_connected().await {
            return Ok(());
        }
    }
    let guard = state.camera.lock().await;
    let camera = guard.as_ref().ok_or(GphotoError::NotConnected)?;
    gphoto::set_setting(camera, &key, &value).await
}

#[tauri::command]
async fn capture_photo(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<u8>, GphotoError> {
    #[cfg(target_os = "windows")]
    {
        if canon_edsdk::platform::is_connected().await {
            let bytes = canon_edsdk::platform::capture_photo().await
                .map_err(|e| GphotoError::Operation(e))?;
            return Ok(bytes);
        }
    }
    let guard = state.camera.lock().await;
    let camera = guard.as_ref().ok_or(GphotoError::NotConnected)?;
    let save_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    gphoto::capture_photo(camera, &save_dir.join("captures")).await
}

#[tauri::command]
async fn start_liveview(state: State<'_, AppState>) -> Result<(), GphotoError> {
    #[cfg(target_os = "windows")]
    {
        if canon_edsdk::platform::is_connected().await {
            canon_edsdk::platform::start_liveview().await
                .map_err(|e| GphotoError::Operation(e))?;
            return Ok(());
        }
    }
    let guard = state.camera.lock().await;
    let camera = guard.as_ref().ok_or(GphotoError::NotConnected)?;
    gphoto::set_viewfinder(camera, true).await
}

#[tauri::command]
async fn stop_liveview(state: State<'_, AppState>) -> Result<(), GphotoError> {
    #[cfg(target_os = "windows")]
    {
        if canon_edsdk::platform::is_connected().await {
            let _ = canon_edsdk::platform::stop_liveview().await;
            return Ok(());
        }
    }
    let guard = state.camera.lock().await;
    let camera = guard.as_ref().ok_or(GphotoError::NotConnected)?;
    gphoto::set_viewfinder(camera, false).await
}

#[tauri::command]
async fn get_liveview_frame(state: State<'_, AppState>) -> Result<Vec<u8>, GphotoError> {
    #[cfg(target_os = "windows")]
    {
        if canon_edsdk::platform::is_connected().await {
            let bytes = canon_edsdk::platform::get_liveview_frame().await
                .map_err(|e| GphotoError::Operation(e))?;
            state.liveview_buffer.lock().await.push(bytes.clone());
            return Ok(bytes);
        }
    }
    let guard = state.camera.lock().await;
    let camera = guard.as_ref().ok_or(GphotoError::NotConnected)?;
    let bytes = gphoto::get_liveview_frame(camera).await?;
    state.liveview_buffer.lock().await.push(bytes.clone());
    Ok(bytes)
}

#[tauri::command]
async fn get_liveview_clip_frames(
    state: State<'_, AppState>,
    capture_ts_ms: u64,
    pre_ms: u64,
    post_ms: u64,
) -> Result<Vec<Vec<u8>>, GphotoError> {
    let buf = state.liveview_buffer.lock().await;
    let total_in_buffer = buf.frames.len();
    let result = buf.extract_window(capture_ts_ms as u128, pre_ms as u128, post_ms as u128);
    println!(
        "get_liveview_clip_frames: total_buffer={} matched_window={} capture_ts={} range=[{}, {}]",
        total_in_buffer,
        result.len(),
        capture_ts_ms,
        (capture_ts_ms as u128).saturating_sub(pre_ms as u128),
        capture_ts_ms as u128 + post_ms as u128
    );
    Ok(result)
}

#[tauri::command]
async fn extract_and_encode_liveview_clip(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    capture_ts_ms: u64,
    pre_ms: u64,
    post_ms: u64,
) -> Result<Vec<u8>, String> {
    let buf = state.liveview_buffer.lock().await;
    let total_in_buffer = buf.frames.len();
    let frames = buf.extract_window(capture_ts_ms as u128, pre_ms as u128, post_ms as u128);
    println!(
        "extract_and_encode_liveview_clip: total_buffer={} matched_window={} capture_ts={}",
        total_in_buffer,
        frames.len(),
        capture_ts_ms
    );
    if frames.is_empty() {
        return Err("Buffer kosong untuk window ini".to_string());
    }
    let fps = if frames.len() <= 12 {
        (frames.len() as u32 / 2).max(4)
    } else {
        8
    };
    drop(buf);
    media::encode_jpeg_frames_to_video_internal(&app, frames, fps).await
}

#[tauri::command]
async fn clear_liveview_buffer(state: State<'_, AppState>) -> Result<(), GphotoError> {
    state.liveview_buffer.lock().await.frames.clear();
    Ok(())
}

// ============================================================================
// PRINTER COMMANDS
// ============================================================================

#[tauri::command]
async fn get_printer_list() -> Result<Vec<String>, PrinterError> {
    printer::get_installed_printers()
}

#[tauri::command]
async fn get_printer_status(printer_name: String) -> Result<PrinterStatus, PrinterError> {
    printer::get_printer_status(&printer_name)
}

#[tauri::command]
async fn open_printer_properties(printer_name: String) -> Result<(), PrinterError> {
    printer::open_printer_properties(&printer_name)
}

#[tauri::command]
async fn print_photo(
    printer_name: String,
    image_path: String,
    copies: u32,
    paper_size: String,
) -> Result<(), PrinterError> {
    let options = PrintOptions {
        copies,
        paper_size,
        ..Default::default()
    };
    printer::print_image(&printer_name, &PathBuf::from(image_path), &options)
}

#[tauri::command]
async fn print_photo_from_buffer(
    printer_name: String,
    image_data: Vec<u8>,
    copies: u32,
    paper_size: String,
) -> Result<(), PrinterError> {
    let options = PrintOptions {
        copies,
        paper_size,
        ..Default::default()
    };
    printer::print_image_from_buffer(&printer_name, &image_data, &options)
}

// ============================================================================
// QR SCAN COMMANDS
// ============================================================================

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct QRCodeData {
    pub content: String,
    pub corner_points: Vec<Point>,
}

#[tauri::command]
async fn save_qr_result(data: QRCodeData) -> Result<String, String> {
    println!(
        "[QR Scanner] QR detected: content={}, corner_points_count={}",
        data.content,
        data.corner_points.len()
    );
    Ok("Saved".to_string())
}

#[cfg(target_os = "windows")]
mod usbdk_hook {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, Ordering};

    type LibusbInitContextFn = unsafe extern "C" fn(*mut *mut c_void, *const c_void, i32) -> i32;
    type LibusbSetOptionFn = unsafe extern "C" fn(*mut c_void, i32) -> i32;

    static mut ORIGINAL_INIT_CONTEXT: Option<LibusbInitContextFn> = None;
    static mut ORIGINAL_SET_OPTION: Option<LibusbSetOptionFn> = None;
    static HOOKED: AtomicBool = AtomicBool::new(false);

    /// Detour fungsi libusb_init.
    /// Ketika iolibs/usb1.dll memanggil libusb_init(&ctx), fungsi ini dieksekusi.
    unsafe extern "C" fn hooked_libusb_init(ctx: *mut *mut c_void) -> i32 {
        let init_ctx = match ORIGINAL_INIT_CONTEXT {
            Some(f) => f,
            None => return -1,
        };

        // 1. Panggil fungsi inisialisasi context asli: libusb_init_context(ctx, NULL, 0)
        let res = init_ctx(ctx, std::ptr::null(), 0);
        if res == 0 && !ctx.is_null() && !(*ctx).is_null() {
            let context_ptr = *ctx;
            // 2. Pada context yang baru dibuat, alihkan backend ke UsbDk:
            // libusb_set_option(*ctx, 1) -> 1 = LIBUSB_OPTION_USE_USBDK
            if let Some(set_option) = ORIGINAL_SET_OPTION {
                let opt_res = set_option(context_ptr, 1);
                if opt_res == 0 {
                    println!(
                        "[gphoto2-usbdk] SUCCESS: libusb context {:p} berhasil dialihkan ke UsbDk backend (Kamera USB terbaca tanpa Zadig)!",
                        context_ptr
                    );
                } else {
                    println!(
                        "[gphoto2-usbdk] Info: libusb_set_option USE_USBDK mengembalikan kode {} pada context {:p}",
                        opt_res, context_ptr
                    );
                }
            }
        }
        res
    }

    /// Pasang 14-byte inline detour pada fungsi libusb_init di libusb-1.0.dll
    pub unsafe fn install_usbdk_hook() {
        if HOOKED.swap(true, Ordering::SeqCst) {
            return;
        }

        extern "system" {
            fn LoadLibraryA(lpLibFileName: *const std::os::raw::c_char) -> *mut c_void;
            fn GetProcAddress(
                hModule: *mut c_void,
                lpProcName: *const std::os::raw::c_char,
            ) -> *mut c_void;
            fn VirtualProtect(
                lpAddress: *mut c_void,
                dwSize: usize,
                flNewProtect: u32,
                lpflOldProtect: *mut u32,
            ) -> i32;
        }

        const PAGE_EXECUTE_READWRITE: u32 = 0x40;

        let dll_name = std::ffi::CString::new("libusb-1.0.dll").unwrap();
        let h_libusb = LoadLibraryA(dll_name.as_ptr());
        if h_libusb.is_null() {
            println!("[gphoto2-usbdk] Warning: Gagal memuat libusb-1.0.dll untuk hook UsbDk");
            return;
        }

        let init_name = std::ffi::CString::new("libusb_init").unwrap();
        let init_ctx_name = std::ffi::CString::new("libusb_init_context").unwrap();
        let set_opt_name = std::ffi::CString::new("libusb_set_option").unwrap();

        let proc_init = GetProcAddress(h_libusb, init_name.as_ptr());
        let proc_init_ctx = GetProcAddress(h_libusb, init_ctx_name.as_ptr());
        let proc_set_opt = GetProcAddress(h_libusb, set_opt_name.as_ptr());

        if proc_init.is_null() || proc_init_ctx.is_null() || proc_set_opt.is_null() {
            println!("[gphoto2-usbdk] Warning: Simbol fungsi libusb tidak lengkap");
            return;
        }

        ORIGINAL_INIT_CONTEXT = Some(std::mem::transmute(proc_init_ctx));
        ORIGINAL_SET_OPTION = Some(std::mem::transmute(proc_set_opt));

        // Struktur jump x64:
        // FF 25 00 00 00 00 [8-byte address] -> jmp qword ptr [rip + 0]
        let target_addr = (hooked_libusb_init as *const () as usize).to_le_bytes();
        let patch: [u8; 14] = [
            0xFF, 0x25, 0x00, 0x00, 0x00, 0x00,
            target_addr[0], target_addr[1], target_addr[2], target_addr[3],
            target_addr[4], target_addr[5], target_addr[6], target_addr[7],
        ];

        let mut old_protect = 0u32;
        if VirtualProtect(proc_init, 14, PAGE_EXECUTE_READWRITE, &mut old_protect) != 0 {
            std::ptr::copy_nonoverlapping(patch.as_ptr(), proc_init as *mut u8, 14);
            VirtualProtect(proc_init, 14, old_protect, &mut old_protect);
            println!("[gphoto2-usbdk] Detour hook pada libusb_init BERHASIL dipasang. UsbDk akan otomatis aktif pada seluruh pemanggilan gphoto2!");
        } else {
            println!("[gphoto2-usbdk] Warning: Gagal mengubah proteksi memori libusb_init");
        }
    }
}

#[cfg(target_os = "windows")]
pub fn init_gphoto_environment() {
    extern "C" {
        fn _putenv(envstring: *const std::os::raw::c_char) -> std::os::raw::c_int;
    }

    fn set_c_and_win_env(key: &str, value: &str) {
        std::env::set_var(key, value);
        if let Ok(c) = std::ffi::CString::new(format!("{}={}", key, value)) {
            unsafe {
                _putenv(c.as_ptr());
            }
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let dev_gphoto_dir = exe_dir.join("../../gphoto-libs");
            let dev_gphoto_dir_alt = exe_dir.join("../../../gphoto-libs");

            let has_dlls = |dir: &std::path::Path| -> bool {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    entries.filter_map(|e| e.ok()).any(|e| {
                        e.path().extension().map_or(false, |ext| ext.eq_ignore_ascii_case("dll"))
                    })
                } else {
                    false
                }
            };

            let msys_camlibs_glob = std::path::PathBuf::from("C:/msys64/mingw64/lib/libgphoto2");
            let msys_iolibs_glob = std::path::PathBuf::from("C:/msys64/mingw64/lib/libgphoto2_port");
            let find_msys_subfolder = |base: &std::path::Path| -> Option<std::path::PathBuf> {
                if let Ok(entries) = std::fs::read_dir(base) {
                    for entry in entries.flatten() {
                        if entry.path().is_dir() {
                            return Some(entry.path());
                        }
                    }
                }
                None
            };

            let (camlibs_path, iolibs_path, gphoto_root) = if has_dlls(&dev_gphoto_dir.join("camlibs")) {
                (dev_gphoto_dir.join("camlibs"), dev_gphoto_dir.join("iolibs"), dev_gphoto_dir)
            } else if has_dlls(&dev_gphoto_dir_alt.join("camlibs")) {
                (dev_gphoto_dir_alt.join("camlibs"), dev_gphoto_dir_alt.join("iolibs"), dev_gphoto_dir_alt)
            } else if has_dlls(&exe_dir.join("camlibs")) {
                (exe_dir.join("camlibs"), exe_dir.join("iolibs"), exe_dir.to_path_buf())
            } else if let (Some(c), Some(i)) = (find_msys_subfolder(&msys_camlibs_glob), find_msys_subfolder(&msys_iolibs_glob)) {
                (c, i, std::path::PathBuf::from("C:/msys64/mingw64/bin"))
            } else {
                (exe_dir.join("camlibs"), exe_dir.join("iolibs"), exe_dir.to_path_buf())
            };

            let clean_path = |p: std::path::PathBuf| -> String {
                let resolved = p.canonicalize().unwrap_or(p);
                let s = resolved.to_string_lossy().to_string();
                s.trim_start_matches("//?/").trim_start_matches("\\\\?\\").replace('\\', "/")
            };

            let camlibs_str = clean_path(camlibs_path);
            let iolibs_str = clean_path(iolibs_path);
            let gphoto_root_str = clean_path(gphoto_root);

            // Crucial: Set BOTH Win32 environment AND C Runtime (_putenv) environment!
            // Without _putenv, libgphoto2 C code's getenv("IOLIBS") returns NULL and falls back to a hardcoded non-existent path.
            set_c_and_win_env("CAMLIBS", &camlibs_str);
            set_c_and_win_env("IOLIBS", &iolibs_str);
            set_c_and_win_env("CAMLIBDIR", &camlibs_str);
            set_c_and_win_env("IOLIBDIR", &iolibs_str);
            set_c_and_win_env("LTDL_LIBRARY_PATH", &format!("{};{}", iolibs_str, camlibs_str));

            if let Some(current_path) = std::env::var_os("PATH") {
                let msys_bin = "C:\\msys64\\mingw64\\bin";
                let gphoto_win = gphoto_root_str.replace('/', "\\");
                let camlibs_win = camlibs_str.replace('/', "\\");
                let iolibs_win = iolibs_str.replace('/', "\\");
                let new_path = format!("{};{};{};{};{}", gphoto_win, camlibs_win, iolibs_win, msys_bin, current_path.to_string_lossy());
                set_c_and_win_env("PATH", &new_path);
            }

            use std::os::windows::ffi::OsStrExt;
            let wide_root: Vec<u16> = std::path::PathBuf::from(&gphoto_root_str.replace('/', "\\"))
                .as_os_str()
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            unsafe {
                extern "system" {
                    fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
                }
                SetDllDirectoryW(wide_root.as_ptr());
            }

            // Workaround 1 (UsbDk): Aktifkan backend UsbDk pada libusb secara otomatis jika UsbDk terpasang.
            // Memungkinkan libgphoto2 mengakses kamera secara low-level tanpa perlu mengganti driver USB via Zadig.
            unsafe {
                usbdk_hook::install_usbdk_hook();
            }

            println!("[gphoto2-setup] CAMLIBS = {}", camlibs_str);
            println!("[gphoto2-setup] IOLIBS  = {}", iolibs_str);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    init_gphoto_environment();

    let migrations = vec![
        Migration {
            version: 1,
            description: "create booth_activation table",
            sql: "CREATE TABLE IF NOT EXISTS booth_activation (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                booth_id TEXT NOT NULL,
                activation_code TEXT NOT NULL,
                booth_name TEXT NOT NULL,
                organization_id TEXT,
                template_variant TEXT NOT NULL DEFAULT 'v1',
                activated_at TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create api_cache table",
            sql: "CREATE TABLE IF NOT EXISTS api_cache (
                cache_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                fetched_at INTEGER NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create asset_cache table",
            sql: "CREATE TABLE IF NOT EXISTS asset_cache (
                url TEXT PRIMARY KEY,
                cache_key TEXT NOT NULL,
                mime TEXT,
                size INTEGER NOT NULL DEFAULT 0,
                fetched_at INTEGER NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add token column to booth_activation",
            sql: "ALTER TABLE booth_activation ADD COLUMN token TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create camera_presets table",
            sql: "CREATE TABLE IF NOT EXISTS camera_presets (
                model TEXT PRIMARY KEY,
                iso TEXT NOT NULL,
                shutter_speed TEXT NOT NULL,
                aperture TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create qr_ticket_cache table for offline ticket verification",
            sql: "CREATE TABLE IF NOT EXISTS qr_ticket_cache (
                token TEXT PRIMARY KEY,
                booth_id TEXT NOT NULL,
                category_id TEXT,
                ticket_type TEXT,
                bundle_label TEXT,
                qty INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'active',
                used INTEGER NOT NULL DEFAULT 0,
                used_offline INTEGER NOT NULL DEFAULT 0,
                expires_at TEXT NOT NULL,
                cached_at INTEGER NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create offline_outbox table for deferred sync jobs",
            sql: "CREATE TABLE IF NOT EXISTS offline_outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_type TEXT NOT NULL,
                local_ref TEXT,
                payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create user_session table for operator user token",
            sql: "CREATE TABLE IF NOT EXISTS user_session (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT NOT NULL,
                token TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "create device_identity table and add device_id to booth_activation",
            sql: "CREATE TABLE IF NOT EXISTS device_identity (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                device_id TEXT NOT NULL,
                device_name TEXT,
                created_at INTEGER NOT NULL
            );
            ALTER TABLE booth_activation ADD COLUMN device_id TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "create print_queue table for offline-resilient auto printing",
            sql: "CREATE TABLE IF NOT EXISTS print_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_code TEXT NOT NULL,
                image_path TEXT NOT NULL,
                copies INTEGER NOT NULL DEFAULT 1,
                paper_size TEXT NOT NULL DEFAULT '4x6',
                status TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add use_secondary column to print_queue",
            sql: "ALTER TABLE print_queue ADD COLUMN use_secondary INTEGER NOT NULL DEFAULT 0;",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("potohub.log".into()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .level(log::LevelFilter::Debug)
                .max_file_size(10_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:app.db",
                    migrations
                )
                .build(),
        )
        .manage(AppState {
            camera: Mutex::new(None),
            liveview_buffer: Mutex::new(gphoto::LiveviewBuffer::new(12000)),
        })
        .setup(|_app| {
            #[cfg(target_os = "linux")]
            {
                if let Some(window) = _app.get_webview_window("main") {
                    let _ = window.with_webview(|webview| {
                        use webkit2gtk::{PermissionRequestExt, WebViewExt};
                        let gtk_webview = webview.inner();
                        gtk_webview.connect_permission_request(|_wv, req| {
                            req.allow();
                            true
                        });
                    });
                }
            }

            #[cfg(target_os = "windows")]
            {
                init_gphoto_environment();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect_camera,
            detect_camera,
            disconnect_camera,
            is_camera_connected,
            get_camera_setting,
            set_camera_setting,
            capture_photo,
            start_liveview,
            stop_liveview,
            get_liveview_frame,
            get_liveview_clip_frames,
            extract_and_encode_liveview_clip,
            clear_liveview_buffer,
            media::fetch_image_as_data_url,
            media::encode_photos_to_gif,
            media::encode_jpeg_frames_to_video,
            media::compose_template_video,
            cache::download_asset_to_cache,
            cache::get_cached_asset_path,
            cache::read_cached_asset,
            storage::save_session_file,
            storage::save_session_manifest,
            storage::read_session_file,
            get_printer_list,
            get_printer_status,
            open_printer_properties,
            print_photo,
            print_photo_from_buffer,
            save_qr_result,
            is_development_mode,
            is_usbdk_installed,
            install_usbdk,
            open_log_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
