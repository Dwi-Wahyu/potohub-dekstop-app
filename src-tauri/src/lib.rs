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
    let (camera, info) = gphoto::connect().await?;
    *state.camera.lock().await = Some(camera);
    Ok(info)
}

#[tauri::command]
async fn detect_camera() -> Result<Vec<gphoto::DetectedCamera>, GphotoError> {
    gphoto::detect().await
}

#[tauri::command]
async fn disconnect_camera(state: State<'_, AppState>) -> Result<(), GphotoError> {
    *state.camera.lock().await = None;
    Ok(())
}

#[tauri::command]
async fn is_camera_connected(state: State<'_, AppState>) -> Result<bool, GphotoError> {
    Ok(state.camera.lock().await.is_some())
}

#[tauri::command]
async fn get_camera_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<serde_json::Value, GphotoError> {
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
    let guard = state.camera.lock().await;
    let camera = guard.as_ref().ok_or(GphotoError::NotConnected)?;
    gphoto::set_setting(camera, &key, &value).await
}

#[tauri::command]
async fn capture_photo(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<u8>, GphotoError> {
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
    let guard = state.camera.lock().await;
    let camera = guard.as_ref().ok_or(GphotoError::NotConnected)?;
    gphoto::set_viewfinder(camera, true).await
}

#[tauri::command]
async fn stop_liveview(state: State<'_, AppState>) -> Result<(), GphotoError> {
    let guard = state.camera.lock().await;
    let camera = guard.as_ref().ok_or(GphotoError::NotConnected)?;
    gphoto::set_viewfinder(camera, false).await
}

#[tauri::command]
async fn get_liveview_frame(state: State<'_, AppState>) -> Result<Vec<u8>, GphotoError> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
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
        .setup(|app| {
            #[cfg(target_os = "linux")]
            {
                if let Some(window) = app.get_webview_window("main") {
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
                if let Ok(exe_path) = std::env::current_exe() {
                    if let Some(exe_dir) = exe_path.parent() {
                        // Cek lokasi camlibs & iolibs (Production/Installed vs Dev Mode)
                        let (camlibs, iolibs, dll_dir) = if exe_dir.join("camlibs").exists() {
                            (exe_dir.join("camlibs"), exe_dir.join("iolibs"), exe_dir.to_path_buf())
                        } else {
                            // Fallback Dev Mode: cari folder src-tauri/gphoto-libs
                            let dev_gphoto = exe_dir.join("../../gphoto-libs");
                            if dev_gphoto.join("camlibs").exists() {
                                (dev_gphoto.join("camlibs"), dev_gphoto.join("iolibs"), dev_gphoto)
                            } else {
                                let dev_gphoto2 = exe_dir.join("../../../gphoto-libs");
                                if dev_gphoto2.join("camlibs").exists() {
                                    (dev_gphoto2.join("camlibs"), dev_gphoto2.join("iolibs"), dev_gphoto2)
                                } else {
                                    (exe_dir.join("camlibs"), exe_dir.join("iolibs"), exe_dir.to_path_buf())
                                }
                            }
                        };

                        let camlibs_str = camlibs.canonicalize().unwrap_or(camlibs).to_string_lossy().replace('\\', "/");
                        let iolibs_str = iolibs.canonicalize().unwrap_or(iolibs).to_string_lossy().replace('\\', "/");

                        // Clean UNC prefix (e.g. //?/C:/...) if added by canonicalize
                        let camlibs_clean = camlibs_str.trim_start_matches("//?/").trim_start_matches("\\\\?\\").to_string();
                        let iolibs_clean = iolibs_str.trim_start_matches("//?/").trim_start_matches("\\\\?\\").to_string();

                        std::env::set_var("CAMLIBS", &camlibs_clean);
                        std::env::set_var("IOLIBS", &iolibs_clean);

                        if let Some(current_path) = std::env::var_os("PATH") {
                            let mut new_path = dll_dir.into_os_string();
                            new_path.push(";C:\\msys64\\mingw64\\bin;");
                            new_path.push(current_path);
                            std::env::set_var("PATH", new_path);
                        }
                    }
                }
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
            cache::read_cached_asset,
            storage::save_session_file,
            storage::save_session_manifest,
            get_printer_list,
            get_printer_status,
            print_photo,
            print_photo_from_buffer,
            save_qr_result,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
