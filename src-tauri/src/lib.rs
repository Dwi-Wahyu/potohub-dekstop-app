mod gphoto;
mod media;
mod printer;

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
async fn disconnect_camera(state: State<'_, AppState>) -> Result<(), GphotoError> {
    *state.camera.lock().await = None;
    Ok(())
}

#[tauri::command]
async fn is_camera_connected(state: State<'_, AppState>) -> Result<bool, GphotoError> {
    Ok(state.camera.lock().await.is_some())
}

#[tauri::command]
async fn get_camera_setting(state: State<'_, AppState>, key: String) -> Result<serde_json::Value, GphotoError> {
    let guard = state.camera.lock().await;
    let camera = guard.as_ref().ok_or(GphotoError::NotConnected)?;
    gphoto::get_setting(camera, &key).await
}

#[tauri::command]
async fn set_camera_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), GphotoError> {
    let guard = state.camera.lock().await;
    let camera = guard.as_ref().ok_or(GphotoError::NotConnected)?;
    gphoto::set_setting(camera, &key, &value).await
}

#[tauri::command]
async fn capture_photo(state: State<'_, AppState>, app: tauri::AppHandle) -> Result<Vec<u8>, GphotoError> {
    let guard = state.camera.lock().await;
    let camera = guard.as_ref().ok_or(GphotoError::NotConnected)?;
    let save_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
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
    Ok(buf.extract_window(capture_ts_ms as u128, pre_ms as u128, post_ms as u128))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:booth.db",
                    vec![tauri_plugin_sql::Migration {
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
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    }],
                )
                .build(),
        )
        .manage(AppState {
            camera: Mutex::new(None),
            liveview_buffer: Mutex::new(gphoto::LiveviewBuffer::new(8000)),
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect_camera,
            disconnect_camera,
            is_camera_connected,
            get_camera_setting,
            set_camera_setting,
            capture_photo,
            start_liveview,
            stop_liveview,
            get_liveview_frame,
            get_liveview_clip_frames,
            clear_liveview_buffer,
            media::fetch_image_as_data_url,
            media::encode_photos_to_gif,
            media::encode_jpeg_frames_to_video,
            media::compose_template_video,
            get_printer_list,
            get_printer_status,
            print_photo,
            print_photo_from_buffer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
