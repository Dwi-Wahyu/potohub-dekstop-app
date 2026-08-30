use gphoto2::{widget::Widget, Camera, Context};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

pub struct LiveviewFrame {
    pub data: Vec<u8>,
    pub timestamp_ms: u128,
}

pub struct LiveviewBuffer {
    pub frames: VecDeque<LiveviewFrame>,
    pub max_age_ms: u128,
}

impl LiveviewBuffer {
    pub fn new(max_age_ms: u128) -> Self {
        Self {
            frames: VecDeque::new(),
            max_age_ms,
        }
    }

    pub fn push(&mut self, data: Vec<u8>) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        self.frames.push_back(LiveviewFrame {
            data,
            timestamp_ms: now,
        });
        let cutoff = now.saturating_sub(self.max_age_ms);
        while let Some(front) = self.frames.front() {
            if front.timestamp_ms < cutoff {
                self.frames.pop_front();
            } else {
                break;
            }
        }
    }

    /// Ambil semua frame dalam window [capture_ts_ms - pre_ms, capture_ts_ms + post_ms]
    pub fn extract_window(&self, capture_ts_ms: u128, pre_ms: u128, post_ms: u128) -> Vec<Vec<u8>> {
        let from = capture_ts_ms.saturating_sub(pre_ms);
        let to = capture_ts_ms + post_ms;
        self.frames
            .iter()
            .filter(|f| f.timestamp_ms >= from && f.timestamp_ms <= to)
            .map(|f| f.data.clone())
            .collect()
    }
}

#[derive(Error, Debug, Serialize)]
pub enum GphotoError {
    #[error("gagal terhubung ke kamera: {0}")]
    Connection(String),
    #[error("belum terhubung ke kamera")]
    NotConnected,
    #[error("setting '{0}' tidak didukung kamera ini")]
    UnsupportedSetting(String),
    #[error("operasi kamera gagal: {0}")]
    Operation(String),
}

impl From<gphoto2::Error> for GphotoError {
    fn from(e: gphoto2::Error) -> Self {
        GphotoError::Operation(e.to_string())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceInfo {
    pub manufacturer: Option<String>,
    pub productname: Option<String>,
}

pub async fn connect() -> Result<(Camera, DeviceInfo), GphotoError> {
    let context = Context::new().map_err(|e| GphotoError::Connection(e.to_string()))?;
    let camera = context
        .autodetect_camera()
        .wait()
        .map_err(|e| GphotoError::Connection(e.to_string()))?;

    let summary = camera.summary().unwrap_or_default();
    let abilities = camera.abilities();
    let info = DeviceInfo {
        manufacturer: Some(abilities.model().to_string()),
        productname: Some(summary.lines().next().unwrap_or_default().to_string()),
    };

    // Enable viewfinder and liveview output for Canon DSLR
    let _ = set_viewfinder(&camera, true).await;

    Ok((camera, info))
}

fn map_setting_key(frontend_key: &str) -> &str {
    match frontend_key {
        "iso" => "iso",
        "tv" => "shutterspeed",
        "av" => "aperture",
        "exposure" => "exposurecompensation",
        other => other,
    }
}

pub async fn get_setting(
    camera: &Camera,
    frontend_key: &str,
) -> Result<serde_json::Value, GphotoError> {
    let key = map_setting_key(frontend_key);
    let widget: Widget = camera
        .config_key(key)
        .wait()
        .map_err(|_| GphotoError::UnsupportedSetting(key.to_string()))?;

    let (value, ability) = match &widget {
        Widget::Radio(radio) => (
            radio.choice(),
            radio.choices_iter().collect::<Vec<String>>(),
        ),
        Widget::Text(text) => (text.value(), vec![]),
        Widget::Toggle(toggle) => (
            toggle.toggled().map(|b| b.to_string()).unwrap_or_default(),
            vec!["true".to_string(), "false".to_string()],
        ),
        Widget::Range(range) => (range.value().to_string(), vec![]),
        _ => ("".to_string(), vec![]),
    };

    Ok(serde_json::json!({ "value": value, "ability": ability }))
}

pub async fn set_setting(
    camera: &Camera,
    frontend_key: &str,
    value: &str,
) -> Result<(), GphotoError> {
    let key = map_setting_key(frontend_key);
    let widget: Widget = camera
        .config_key(key)
        .wait()
        .map_err(|_| GphotoError::UnsupportedSetting(key.to_string()))?;

    match &widget {
        Widget::Radio(radio) => {
            radio
                .set_choice(value)
                .map_err(|e| GphotoError::Operation(e.to_string()))?;
            camera
                .set_config(radio)
                .wait()
                .map_err(|e| GphotoError::Operation(e.to_string()))?;
        }
        Widget::Text(text) => {
            text.set_value(value)
                .map_err(|e| GphotoError::Operation(e.to_string()))?;
            camera
                .set_config(text)
                .wait()
                .map_err(|e| GphotoError::Operation(e.to_string()))?;
        }
        Widget::Toggle(toggle) => {
            let bool_val = value.parse::<bool>().unwrap_or(false);
            toggle.set_toggled(bool_val);
            camera
                .set_config(toggle)
                .wait()
                .map_err(|e| GphotoError::Operation(e.to_string()))?;
        }
        Widget::Range(range) => {
            if let Ok(float_val) = value.parse::<f32>() {
                range.set_value(float_val);
                camera
                    .set_config(range)
                    .wait()
                    .map_err(|e| GphotoError::Operation(e.to_string()))?;
            }
        }
        _ => return Err(GphotoError::UnsupportedSetting(key.to_string())),
    }

    Ok(())
}

pub async fn trigger_popup_flash(camera: &Camera) {
    if let Ok(toggle) = camera
        .config_key::<gphoto2::widget::ToggleWidget>("popupflash")
        .wait()
    {
        toggle.set_toggled(true);
        let _ = camera.set_config(&toggle).wait();
    }
}

pub async fn capture_photo(
    camera: &Camera,
    save_dir: &std::path::Path,
) -> Result<Vec<u8>, GphotoError> {
    trigger_popup_flash(camera).await;

    let file_path = camera
        .capture_image()
        .wait()
        .map_err(|e| GphotoError::Operation(e.to_string()))?;
    let camera_file = camera
        .fs()
        .download(&file_path.folder(), &file_path.name())
        .wait()
        .map_err(|e| GphotoError::Operation(e.to_string()))?;

    // PINDAHKAN KE SINI: re-enable viewfinder sesegera mungkin setelah download selesai,
    // supaya ring buffer liveview kembali terisi lebih cepat untuk window "post-capture".
    let _ = set_viewfinder(camera, true).await;

    let data = camera_file
        .get_data(camera)
        .wait()
        .map_err(|e| GphotoError::Operation(e.to_string()))?;
    let bytes = data.to_vec();

    let _ = std::fs::create_dir_all(save_dir);
    let local_path: PathBuf = save_dir.join(file_path.name().as_ref());
    let _ = std::fs::write(&local_path, &bytes);

    Ok(bytes)
}

pub async fn get_liveview_frame(camera: &Camera) -> Result<Vec<u8>, GphotoError> {
    let preview = match camera.capture_preview().wait() {
        Ok(p) => p,
        Err(_) => {
            let _ = set_viewfinder(camera, true).await;
            camera
                .capture_preview()
                .wait()
                .map_err(|e| GphotoError::Operation(e.to_string()))?
        }
    };
    let data = preview
        .get_data(camera)
        .wait()
        .map_err(|e| GphotoError::Operation(e.to_string()))?;
    Ok(data.to_vec())
}

pub async fn set_viewfinder(camera: &Camera, active: bool) -> Result<(), GphotoError> {
    if let Ok(toggle) = camera
        .config_key::<gphoto2::widget::ToggleWidget>("viewfinder")
        .wait()
    {
        toggle.set_toggled(active);
        let _ = camera.set_config(&toggle).wait();
    } else if let Ok(radio) = camera
        .config_key::<gphoto2::widget::RadioWidget>("viewfinder")
        .wait()
    {
        let val = if active { "1" } else { "0" };
        let _ = radio.set_choice(val);
        let _ = camera.set_config(&radio).wait();
    }

    if active {
        if let Ok(radio) = camera
            .config_key::<gphoto2::widget::RadioWidget>("output")
            .wait()
        {
            let _ = radio
                .set_choice("TFT + PC")
                .or_else(|_| radio.set_choice("PC"))
                .or_else(|_| radio.set_choice("1"))
                .or_else(|_| radio.set_choice("2"));
            let _ = camera.set_config(&radio).wait();
        } else if let Ok(radio) = camera
            .config_key::<gphoto2::widget::RadioWidget>("evf_output")
            .wait()
        {
            let _ = radio
                .set_choice("TFT + PC")
                .or_else(|_| radio.set_choice("PC"))
                .or_else(|_| radio.set_choice("1"))
                .or_else(|_| radio.set_choice("2"));
            let _ = camera.set_config(&radio).wait();
        }
    } else {
        if let Ok(radio) = camera
            .config_key::<gphoto2::widget::RadioWidget>("output")
            .wait()
        {
            let _ = radio.set_choice("Off");
            let _ = camera.set_config(&radio).wait();
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_liveview_buffer() {
        let mut buf = LiveviewBuffer::new(5000);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();

        buf.push(vec![1, 2, 3]);
        buf.push(vec![4, 5, 6]);

        let window = buf.extract_window(now, 1000, 1000);
        assert_eq!(window.len(), 2);
        assert_eq!(window[0], vec![1, 2, 3]);
        assert_eq!(window[1], vec![4, 5, 6]);
    }
}
