use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn sessions_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("sessions")
}

fn safe_relative(p: &str) -> Result<PathBuf, String> {
    let path = Path::new(p);
    if path.is_absolute() || p.contains("..") {
        return Err("relative_path tidak valid".into());
    }
    Ok(path.to_path_buf())
}

/// Simpan satu file biner hasil sesi ke app_data_dir/sessions/<relative_path>.
#[tauri::command]
pub async fn save_session_file(
    app: AppHandle,
    relative_path: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let rel = safe_relative(&relative_path)?;
    let full = sessions_dir(&app).join(&rel);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&full, &bytes).map_err(|e| e.to_string())?;
    Ok(full.to_string_lossy().to_string())
}

/// Simpan manifest JSON sesi.
#[tauri::command]
pub async fn save_session_manifest(
    app: AppHandle,
    relative_path: String,
    json: String,
) -> Result<String, String> {
    let rel = safe_relative(&relative_path)?;
    let full = sessions_dir(&app).join(&rel);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&full, json).map_err(|e| e.to_string())?;
    Ok(full.to_string_lossy().to_string())
}
