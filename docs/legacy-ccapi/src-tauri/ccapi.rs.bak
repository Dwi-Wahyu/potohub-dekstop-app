use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

#[derive(Error, Debug, Serialize)]
pub enum CcapiError {
    #[error("gagal terhubung ke kamera: {0}")]
    Connection(String),
    #[error("kamera membalas error {status}: {body}")]
    CameraResponded { status: u16, body: String },
    #[error("gagal parsing response kamera: {0}")]
    Parse(String),
    #[error("belum terhubung ke kamera")]
    NotConnected,
}

impl From<reqwest::Error> for CcapiError {
    fn from(e: reqwest::Error) -> Self {
        CcapiError::Connection(e.to_string())
    }
}

#[derive(Clone)]
pub struct CcapiClient {
    pub base_url: String, // contoh: http://192.168.1.50:8080
    client: reqwest::Client,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceInfo {
    #[serde(default)]
    pub manufacturer: Option<String>,
    #[serde(default)]
    pub productname: Option<String>,
    #[serde(default)]
    pub serialnumber: Option<String>,
    #[serde(default)]
    pub firmwareversion: Option<String>,
}

impl CcapiClient {
    pub fn new(ip: &str, port: u16) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .build()
            .expect("gagal membuat http client");
        Self {
            base_url: format!("http://{ip}:{port}"),
            client,
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    /// Dipakai untuk test koneksi awal + ambil info device.
    pub async fn device_information(&self) -> Result<DeviceInfo, CcapiError> {
        let resp = self
            .client
            .get(self.url("/ccapi/ver100/deviceinformation"))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(CcapiError::CameraResponded {
                status: resp.status().as_u16(),
                body: resp.text().await.unwrap_or_default(),
            });
        }
        resp.json::<DeviceInfo>()
            .await
            .map_err(|e| CcapiError::Parse(e.to_string()))
    }

    /// Ambil satu setting (iso/tv/av/exposure/wb/afmethod dst).
    /// Bentuk umum response CCAPI: { "value": "...", "ability": [...] }
    pub async fn get_setting(&self, key: &str) -> Result<serde_json::Value, CcapiError> {
        let resp = self
            .client
            .get(self.url(&format!("/ccapi/ver100/shooting/settings/{key}")))
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(CcapiError::CameraResponded {
                status: resp.status().as_u16(),
                body: resp.text().await.unwrap_or_default(),
            });
        }
        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| CcapiError::Parse(e.to_string()))
    }

    /// Set satu setting. Value harus salah satu dari field "ability" hasil get_setting.
    pub async fn put_setting(&self, key: &str, value: &str) -> Result<(), CcapiError> {
        let body = serde_json::json!({ "value": value });
        let resp = self
            .client
            .put(self.url(&format!("/ccapi/ver100/shooting/settings/{key}")))
            .json(&body)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(CcapiError::CameraResponded {
                status: resp.status().as_u16(),
                body: resp.text().await.unwrap_or_default(),
            });
        }
        Ok(())
    }

    /// Trigger autofocus saja (half-press), tanpa jepret.
    pub async fn af_half_press(&self) -> Result<(), CcapiError> {
        self.shutter_manual("half_press").await
    }

    pub async fn af_release(&self) -> Result<(), CcapiError> {
        self.shutter_manual("release_half").await
    }

    /// Full press: fokus + jepret dalam satu aksi (dipakai untuk capture normal).
    pub async fn shutter_full_press(&self) -> Result<(), CcapiError> {
        self.shutter_manual("full_press").await
    }

    pub async fn shutter_release(&self) -> Result<(), CcapiError> {
        self.shutter_manual("release_full").await
    }

    async fn shutter_manual(&self, action: &str) -> Result<(), CcapiError> {
        let body = serde_json::json!({ "action": action });
        let resp = self
            .client
            .post(self.url("/ccapi/ver100/shooting/control/shutterbutton/manual"))
            .json(&body)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(CcapiError::CameraResponded {
                status: resp.status().as_u16(),
                body: resp.text().await.unwrap_or_default(),
            });
        }
        Ok(())
    }

    /// Capture sekali jalan: half-press (AF) -> tunggu -> full-press -> release.
    /// Ini yang paling relevan untuk workflow photobooth ("satu tombol jepret").
    pub async fn capture_photo(&self) -> Result<(), CcapiError> {
        self.af_half_press().await?;
        tokio::time::sleep(Duration::from_millis(300)).await; // beri waktu AF lock
        self.shutter_full_press().await?;
        tokio::time::sleep(Duration::from_millis(150)).await;
        self.shutter_release().await?;
        self.af_release().await?;
        Ok(())
    }

    /// Nyalakan liveview di kamera. Panggil sekali sebelum frontend mulai polling frame.
    pub async fn start_liveview(&self) -> Result<(), CcapiError> {
        let body = serde_json::json!({ "liveviewsize": "medium", "cameradisplay": "on" });
        let resp = self
            .client
            .post(self.url("/ccapi/ver100/shooting/liveview"))
            .json(&body)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(CcapiError::CameraResponded {
                status: resp.status().as_u16(),
                body: resp.text().await.unwrap_or_default(),
            });
        }
        Ok(())
    }

    pub async fn stop_liveview(&self) -> Result<(), CcapiError> {
        let body = serde_json::json!({ "liveviewsize": "off" });
        let resp = self
            .client
            .post(self.url("/ccapi/ver100/shooting/liveview"))
            .json(&body)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(CcapiError::CameraResponded {
                status: resp.status().as_u16(),
                body: resp.text().await.unwrap_or_default(),
            });
        }
        Ok(())
    }
}
