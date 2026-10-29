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

/// Baca kembali file hasil sesi yang sudah disimpan lokal (utk re-upload saat online).
#[tauri::command]
pub async fn read_session_file(app: AppHandle, relative_path: String) -> Result<Vec<u8>, String> {
    let rel = safe_relative(&relative_path)?;
    let full = sessions_dir(&app).join(&rel);
    std::fs::read(&full).map_err(|e| e.to_string())
}

/// Dapatkan path absolut dari direktori penyimpanan sesi lokal
#[tauri::command]
pub async fn get_sessions_dir(app: AppHandle) -> Result<String, String> {
    let dir = sessions_dir(&app);
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    Ok(dir.to_string_lossy().to_string())
}

/// Buka direktori penyimpanan sesi (atau subdirektori sesi tertentu) di File Explorer OS
#[tauri::command]
pub async fn open_sessions_dir(app: AppHandle, relative_path: Option<String>) -> Result<(), String> {
    let mut target = sessions_dir(&app);
    if let Some(rel) = relative_path {
        if let Ok(safe_rel) = safe_relative(&rel) {
            let candidate = target.join(safe_rel);
            if candidate.exists() {
                if candidate.is_file() {
                    if let Some(p) = candidate.parent() {
                        target = p.to_path_buf();
                    }
                } else {
                    target = candidate;
                }
            }
        }
    }

    if !target.exists() {
        let _ = std::fs::create_dir_all(&target);
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("Gagal membuka Windows Explorer: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("Gagal membuka file manager: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&target)
            .spawn()
            .map_err(|e| format!("Gagal membuka Finder: {}", e))?;
    }

    Ok(())
}
