use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn assets_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_cache_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("assets")
}

fn sanitize_key(key: &str) -> String {
    key.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Download URL ke cache dir, return path relatif cache_key (bukan path absolut).
#[tauri::command]
pub async fn download_asset_to_cache(
    app: AppHandle,
    url: String,
    cache_key: String,
) -> Result<String, String> {
    let key = sanitize_key(&cache_key);
    let dir = assets_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&key);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Gagal download aset (HTTP {})", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(key)
}

/// Baca file cache, return data URL (konsisten dengan fetch_image_as_data_url).
#[tauri::command]
pub async fn read_cached_asset(
    app: AppHandle,
    cache_key: String,
) -> Result<Option<String>, String> {
    let key = sanitize_key(&cache_key);
    let path = assets_dir(&app).join(&key);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mime = mime_from_ext(&key);
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(Some(format!("data:{};base64,{}", mime, b64)))
}

fn mime_from_ext(name: &str) -> &'static str {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}
