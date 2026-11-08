use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn sessions_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("sessions")
}

fn safe_relative(p: &str) -> Result<PathBuf, String> {
    let clean = p.trim_start_matches(|c| c == '/' || c == '\\').replace('\\', "/");
    let path = Path::new(&clean);
    if path.is_absolute() || clean.contains("..") {
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

/// Hapus file hasil sesi lokal (mis. checkpoint sementara saat sesi selesai).
#[tauri::command]
pub async fn delete_session_file(app: AppHandle, relative_path: String) -> Result<(), String> {
    let rel = safe_relative(&relative_path)?;
    let full = sessions_dir(&app).join(&rel);
    if full.exists() {
        std::fs::remove_file(&full).map_err(|e| e.to_string())?;
    }
    Ok(())
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

/// Buka direktori penyimpanan sesi (atau folder sesi spesifik customer) di File Explorer OS
#[tauri::command]
pub async fn open_sessions_dir(
    app: AppHandle,
    relative_path: Option<String>,
    session_code: Option<String>,
) -> Result<(), String> {
    let base_sessions = sessions_dir(&app);
    let mut target = base_sessions.clone();
    let mut found_specific_session = false;

    // 1. Coba navigasi dari relative_path jika diberikan (mis. "2026-11-01/sesi-123_booth/composite/print_strip.jpg")
    if let Some(rel) = relative_path {
        let clean = rel.trim_start_matches(|c| c == '/' || c == '\\').replace('\\', "/");
        if !clean.is_empty() {
            let candidate = base_sessions.join(&clean);
            if candidate.exists() {
                if candidate.is_file() {
                    if let Some(p) = candidate.parent() {
                        let parent_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        // Jika berada di dalam subfolder 'composite', 'raw', 'gif', atau 'video',
                        // naikkan 1 tingkat ke folder root sesi customer agar semua file foto terlihat
                        if ["composite", "raw", "gif", "video"].contains(&parent_name) {
                            if let Some(session_root) = p.parent() {
                                target = session_root.to_path_buf();
                            } else {
                                target = p.to_path_buf();
                            }
                        } else {
                            target = p.to_path_buf();
                        }
                        found_specific_session = true;
                    }
                } else {
                    let dir_name = candidate.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    if ["composite", "raw", "gif", "video"].contains(&dir_name) {
                        if let Some(session_root) = candidate.parent() {
                            target = session_root.to_path_buf();
                        } else {
                            target = candidate;
                        }
                    } else {
                        target = candidate;
                    }
                    found_specific_session = true;
                }
            } else {
                // Jika path file persisnya tidak ditemukan (misal nama file strip berbeda),
                // coba cari folder induk sesi dari path (misal "2026-11-01/S-123_booth")
                let parts: Vec<&str> = clean.split('/').filter(|s| !s.is_empty()).collect();
                if parts.len() >= 2 {
                    let session_folder_candidate = base_sessions.join(parts[0]).join(parts[1]);
                    if session_folder_candidate.exists() && session_folder_candidate.is_dir() {
                        target = session_folder_candidate;
                        found_specific_session = true;
                    }
                }
            }
        }
    }

    // 2. Jika belum ditemukan dan session_code diberikan, cari direktori yang memuat session_code
    if !found_specific_session {
        if let Some(code) = session_code {
            let code_clean = code.trim();
            if !code_clean.is_empty() && base_sessions.exists() {
                // Telusuri folder tanggal (<sessions_dir>/<YYYY-MM-DD>/<sessionCode>_*)
                if let Ok(entries) = std::fs::read_dir(&base_sessions) {
                    'search_date: for date_entry in entries.flatten() {
                        let date_path = date_entry.path();
                        if date_path.is_dir() {
                            if let Ok(sub_entries) = std::fs::read_dir(&date_path) {
                                for sub in sub_entries.flatten() {
                                    let sub_path = sub.path();
                                    if sub_path.is_dir() {
                                        let name = sub_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                                        if name.starts_with(code_clean) || name.contains(code_clean) {
                                            target = sub_path;
                                            break 'search_date;
                                        }
                                    }
                                }
                            }
                        } else {
                            // Cek jika sesi disimpan langsung di root sessions/
                            let name = date_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                            if name.starts_with(code_clean) || name.contains(code_clean) {
                                target = date_path;
                                break 'search_date;
                            }
                        }
                    }
                }
            }
        }
    }

    if !target.exists() {
        let _ = std::fs::create_dir_all(&target);
    }

    #[cfg(target_os = "windows")]
    {
        let path_str = target.to_string_lossy().replace('/', "\\");
        let path_clean = path_str.trim_start_matches(r"\\?\").to_string();
        std::process::Command::new("explorer.exe")
            .arg(&path_clean)
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
