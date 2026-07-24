mod ccapi;
mod printer;

use ccapi::{CcapiClient, CcapiError, DeviceInfo};
use printer::{PrintOptions, PrinterError, PrinterStatus};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub camera: Mutex<Option<CcapiClient>>,
}

#[tauri::command]
async fn connect_camera(
    state: State<'_, AppState>,
    ip: String,
    port: u16,
) -> Result<DeviceInfo, CcapiError> {
    let client = CcapiClient::new(&ip, port);
    let info = client.device_information().await?;
    *state.camera.lock().unwrap() = Some(client);
    Ok(info)
}

#[tauri::command]
fn disconnect_camera(state: State<'_, AppState>) {
    *state.camera.lock().unwrap() = None;
}

#[tauri::command]
fn is_camera_connected(state: State<'_, AppState>) -> bool {
    state.camera.lock().unwrap().is_some()
}

fn get_client(state: &State<'_, AppState>) -> Result<CcapiClient, CcapiError> {
    state
        .camera
        .lock()
        .unwrap()
        .clone()
        .ok_or(CcapiError::NotConnected)
}

#[tauri::command]
async fn get_camera_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<serde_json::Value, CcapiError> {
    let client = get_client(&state)?;
    client.get_setting(&key).await
}

#[tauri::command]
async fn set_camera_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), CcapiError> {
    let client = get_client(&state)?;
    client.put_setting(&key, &value).await
}

#[tauri::command]
async fn capture_photo(state: State<'_, AppState>) -> Result<(), CcapiError> {
    let client = get_client(&state)?;
    client.capture_photo().await
}

#[tauri::command]
async fn start_liveview(state: State<'_, AppState>) -> Result<(), CcapiError> {
    let client = get_client(&state)?;
    client.start_liveview().await
}

#[tauri::command]
async fn stop_liveview(state: State<'_, AppState>) -> Result<(), CcapiError> {
    let client = get_client(&state)?;
    client.stop_liveview().await
}

/// Dipakai frontend untuk tahu base_url kamera (dibutuhkan untuk <img src> live preview langsung).
#[tauri::command]
fn get_camera_base_url(state: State<'_, AppState>) -> Result<String, CcapiError> {
    let client = get_client(&state)?;
    Ok(client.base_url.clone())
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
        .manage(AppState {
            camera: Mutex::new(None),
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
            get_camera_base_url,
            get_printer_list,
            get_printer_status,
            print_photo,
            print_photo_from_buffer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
