# Rencana Implementasi CCAPI — Photobooth Desktop App (Tauri v2 + SvelteKit)

> **Untuk siapa dokumen ini**: agen CLI yang akan mengeksekusi perubahan pada repo `potohub-dekstop-app`.
> **Prinsip kerja**: jalankan per-Phase secara berurutan, jangan lompat. Setiap Phase punya "Definition of Done" — jangan lanjut ke Phase berikutnya sebelum itu terpenuhi. Kalau ada langkah yang gagal karena field/endpoint CCAPI ternyata beda dari dugaan di dokumen ini, **ikuti hasil discovery nyata dari kamera** (lihat Phase 0), bukan asumsi di dokumen ini.

---

## 0. Kondisi Project Saat Ini (baseline, sudah diverifikasi)

```
potohub-dekstop-app/
├── src/
│   ├── app.html
│   ├── globals.css                 # @import "tailwindcss";
│   └── routes/
│       ├── +layout.svelte          # import '../globals.css'
│       ├── +layout.ts              # export const ssr = false;
│       ├── +page.svelte            # halaman default create-tauri-app
│       └── camera-config/
│           └── +page.svelte        # placeholder <h1>halo</h1>
├── src-tauri/
│   ├── Cargo.toml                  # deps: tauri, tauri-plugin-opener, serde, serde_json
│   ├── capabilities/default.json   # permissions: core:default, opener:default
│   ├── tauri.conf.json             # security.csp = null, devUrl :1420
│   └── src/
│       ├── main.rs
│       └── lib.rs                  # cuma command `greet`
├── package.json                    # svelte 5, sveltekit 2, tailwindcss v4 (vite plugin), adapter-static
└── vite.config.js
```

**Keputusan desain yang mengikat seluruh dokumen ini** (sesuai instruksi Anda):

- Tidak ada database. State cukup di Svelte 5 (`$state`) lokal per sesi aplikasi. API terpisah menyusul nanti — jadi arsitektur harus mudah "dicabut" state-nya ke API eksternal di kemudian hari (gunakan 1 module store, jangan sebar state di banyak komponen).
- Tidak perlu desain UI khusus. Pakai Tailwind utility classes plain, tanpa komponen custom/library UI.
- Fokus: **fungsi utama dulu** — koneksi kamera, shutter, autofocus, kontrol exposure, live preview. Printer (DNP DS-RX1HS) **di luar scope dokumen ini**.
- Arsitektur komunikasi kamera: **Rust backend sebagai proxy CCAPI** (pakai `reqwest`), diekspos ke frontend lewat `#[tauri::command]`. Live preview adalah pengecualian — dijelaskan di Phase 4.

---

## Phase 0 — Discovery Kamera (WAJIB sebelum coding apa pun)

Tujuan: memastikan endpoint & payload CCAPI yang dipakai di dokumen ini benar-benar didukung EOS R100, karena CCAPI berbeda cakupan fiturnya per model kamera (R100 adalah entry-level, kemungkinan tidak semua field manual exposure tersedia).

### Langkah manual (dilakukan oleh user, bukan agen — agen tinggal tunggu hasilnya)

1. Update firmware kamera ke versi terbaru yang mendukung CCAPI (≥1.1.0, idealnya lebih baru).
2. Aktifkan CCAPI lewat **CCAPI Activation Tool** dari Canon (via USB, sekali saja).
3. Di menu Wi-Fi kamera, pilih **Camera Control API**, sambungkan ke jaringan yang sama dengan komputer development.
4. Catat IP address dan port yang ditampilkan di layar kamera (biasanya port `8080`).

### Langkah verifikasi (agen boleh minta user jalankan, atau jalankan sendiri jika komputer development ada di jaringan yang sama)

```bash
# Ganti {IP} dan {PORT} sesuai layar kamera
curl -s http://{IP}:{PORT}/ccapi/ | tee /tmp/ccapi-root.json

# Setelah tahu versi tertinggi yang didukung (biasanya ver100 atau ver110), cek daftar endpoint:
curl -s http://{IP}:{PORT}/ccapi/ver100/ | tee /tmp/ccapi-ver100.json

# Cek device info
curl -s http://{IP}:{PORT}/ccapi/ver100/deviceinformation | tee /tmp/ccapi-device.json

# Cek daftar shooting settings yang benar-benar didukung R100
curl -s http://{IP}:{PORT}/ccapi/ver100/shooting/settings | tee /tmp/ccapi-settings.json
```

**Definition of Done Phase 0**: file `/tmp/ccapi-*.json` tersimpan dan dibaca. Simpan salinannya ke `docs/ccapi-discovery/` di repo (buat foldernya) sebagai referensi tim — ini akan jadi sumber kebenaran final untuk field/endpoint, menggantikan asumsi di Phase 2 & 4 kalau ternyata berbeda.

```bash
mkdir -p docs/ccapi-discovery
cp /tmp/ccapi-root.json /tmp/ccapi-ver100.json /tmp/ccapi-device.json /tmp/ccapi-settings.json docs/ccapi-discovery/
```

> ⚠️ **Catatan jujur soal keakuratan endpoint**: pola endpoint di bawah (`/ccapi/ver100/shooting/control/shutterbutton`, `/ccapi/ver100/shooting/liveview`, dst.) berasal dari dokumentasi publik & proyek open-source CCAPI yang sudah saya cross-check, dan formatnya konsisten di banyak sumber. Tapi nama field JSON pastinya (misal apakah `"cameradisplay"` atau `"display"`) **belum saya verifikasi 1:1 untuk EOS R100 spesifik**. Bagian ini WAJIB dicocokkan dengan hasil Phase 0 sebelum hardcode ke Rust struct.

---

## Phase 1 — Setup Dependency & Permission

### 1.1 Tambah dependency Rust

Edit `src-tauri/Cargo.toml`, tambahkan ke `[dependencies]`:

```toml
reqwest = { version = "0.12", features = ["json", "stream"] }
tokio = { version = "1", features = ["full"] }
thiserror = "2"
```

Jalankan build check:

```bash
cd src-tauri && cargo check
```

### 1.2 Tidak perlu ubah `capabilities/default.json`

Karena semua request HTTP ke kamera dilakukan dari **Rust** (bukan lewat `@tauri-apps/plugin-http` di frontend), tidak perlu menambah permission apa pun di capabilities. Ini juga alasan kenapa arsitektur ini dipilih — lebih sedikit permukaan permission yang perlu diatur.

Pengecualian: untuk live preview (Phase 4), frontend akan `fetch`/`<img src>` langsung ke IP kamera. Karena `security.csp` sudah `null` di `tauri.conf.json`, ini tidak perlu perubahan tambahan. **Jangan** aktifkan CSP nanti tanpa menambahkan `connect-src`/`img-src` untuk IP kamera, karena akan mematahkan live preview.

**Definition of Done Phase 1**: `cargo check` sukses tanpa error.

---

## Phase 2 — Rust Backend: CCAPI Client Module

### 2.1 Buat file `src-tauri/src/ccapi.rs`

```rust
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
```

> Catatan: nama action `"half_press"`, `"full_press"`, `"release_half"`, `"release_full"` dan field `"cameradisplay"` HARUS dicocokkan dengan hasil Phase 0. Kalau di `docs/ccapi-discovery/ccapi-ver100.json` ternyata path/field-nya beda, sesuaikan konstanta di file ini — jangan diam-diam skip errornya.

### 2.2 Buat App State + Tauri Commands

Edit `src-tauri/src/lib.rs`:

```rust
mod ccapi;

use ccapi::{CcapiClient, CcapiError, DeviceInfo};
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Hapus command `greet` bawaan template (dan pemanggilannya di `+page.svelte` nanti di Phase 4) karena tidak relevan lagi.

**Definition of Done Phase 2**:

```bash
cd src-tauri && cargo check
```

sukses tanpa error/warning fatal.

---

## Phase 3 — Frontend: Store Svelte 5 (state lokal, tanpa DB)

Buat `src/lib/camera.svelte.ts`. Ini satu-satunya sumber state kamera — nanti kalau ada API eksternal, cukup ganti isi fungsi di file ini, komponen tidak perlu diubah.

```ts
import { invoke } from "@tauri-apps/api/core";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export type DeviceInfo = {
  manufacturer?: string;
  productname?: string;
  serialnumber?: string;
  firmwareversion?: string;
};

class CameraStore {
  status = $state<ConnectionStatus>("idle");
  errorMessage = $state<string | null>(null);
  device = $state<DeviceInfo | null>(null);
  cameraBaseUrl = $state<string | null>(null);

  isCapturing = $state(false);
  isLiveviewActive = $state(false);

  async connect(ip: string, port: number) {
    this.status = "connecting";
    this.errorMessage = null;
    try {
      this.device = await invoke<DeviceInfo>("connect_camera", { ip, port });
      this.cameraBaseUrl = await invoke<string>("get_camera_base_url");
      this.status = "connected";
    } catch (err) {
      this.status = "error";
      this.errorMessage = String(err);
    }
  }

  async disconnect() {
    await invoke("disconnect_camera");
    this.status = "idle";
    this.device = null;
    this.cameraBaseUrl = null;
    this.isLiveviewActive = false;
  }

  async capture() {
    if (this.status !== "connected" || this.isCapturing) return;
    this.isCapturing = true;
    this.errorMessage = null;
    try {
      await invoke("capture_photo");
    } catch (err) {
      this.errorMessage = String(err);
    } finally {
      this.isCapturing = false;
    }
  }

  async setSetting(key: string, value: string) {
    try {
      await invoke("set_camera_setting", { key, value });
    } catch (err) {
      this.errorMessage = String(err);
    }
  }

  async getSetting(key: string) {
    return invoke<{ value: string; ability: string[] }>("get_camera_setting", {
      key,
    });
  }

  async startLiveview() {
    if (this.status !== "connected") return;
    try {
      await invoke("start_liveview");
      this.isLiveviewActive = true;
    } catch (err) {
      this.errorMessage = String(err);
    }
  }

  async stopLiveview() {
    try {
      await invoke("stop_liveview");
    } finally {
      this.isLiveviewActive = false;
    }
  }
}

export const cameraStore = new CameraStore();
```

**Definition of Done Phase 3**:

```bash
pnpm check
```

tidak menghasilkan error TypeScript.

---

## Phase 4 — UI: Halaman Koneksi + Kontrol + Live Preview

### 4.1 Bersihkan `src/routes/+page.svelte`

Ganti seluruh isi (hapus boilerplate greet/logo Tauri) jadi landing sederhana:

```svelte
<script lang="ts">
  import { cameraStore } from "$lib/camera.svelte";
</script>

<main class="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center gap-4">
  <h1 class="text-2xl font-semibold">Photobooth</h1>
  <p class="text-neutral-400">
    Status kamera: <span class="font-mono">{cameraStore.status}</span>
  </p>
  <a href="/camera-config" class="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500">
    Pengaturan Kamera
  </a>
  <a
    href="/session"
    class="px-4 py-2 bg-neutral-800 rounded hover:bg-neutral-700"
  >
    Mulai Sesi Foto
  </a>
</main>
```

### 4.2 Isi `src/routes/camera-config/+page.svelte` — koneksi + exposure controls

```svelte
<script lang="ts">
  import { cameraStore } from "$lib/camera.svelte";

  let ip = $state("192.168.1.50");
  let port = $state(8080);

  let isoOptions = $state<string[]>([]);
  let currentIso = $state("");

  async function handleConnect() {
    await cameraStore.connect(ip, port);
    if (cameraStore.status === "connected") {
      const iso = await cameraStore.getSetting("iso");
      isoOptions = iso.ability ?? [];
      currentIso = iso.value ?? "";
    }
  }

  async function handleIsoChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    await cameraStore.setSetting("iso", value);
    currentIso = value;
  }
</script>

<main class="min-h-screen bg-neutral-950 text-white p-8 flex flex-col gap-6 max-w-md mx-auto">
  <a href="/" class="text-sm text-neutral-400 hover:text-white">&larr; Kembali</a>
  <h1 class="text-xl font-semibold">Konfigurasi Kamera</h1>

  <div class="flex flex-col gap-2">
    <label class="text-sm text-neutral-400" for="ip">IP Kamera</label>
    <input id="ip" class="bg-neutral-900 border border-neutral-700 rounded px-3 py-2" bind:value={ip} />

    <label class="text-sm text-neutral-400" for="port">Port</label>
    <input id="port" type="number" class="bg-neutral-900 border border-neutral-700 rounded px-3 py-2" bind:value={port} />

    <button
      class="mt-2 bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 disabled:opacity-50"
      onclick={handleConnect}
      disabled={cameraStore.status === "connecting"}
    >
      {cameraStore.status === "connecting" ? "Menghubungkan..." : "Hubungkan"}
    </button>

    {#if cameraStore.errorMessage}
      <p class="text-red-400 text-sm">{cameraStore.errorMessage}</p>
    {/if}
  </div>

  {#if cameraStore.status === "connected"}
    <div class="border-t border-neutral-800 pt-4 flex flex-col gap-2">
      <p class="text-sm text-neutral-400">Kamera terhubung:</p>
      <p class="font-mono text-sm">{cameraStore.device?.productname} ({cameraStore.device?.serialnumber})</p>

      <label class="text-sm text-neutral-400 mt-3" for="iso">ISO</label>
      <select id="iso" class="bg-neutral-900 border border-neutral-700 rounded px-3 py-2" value={currentIso} onchange={handleIsoChange}>
        {#each isoOptions as opt}
          <option value={opt}>{opt}</option>
        {/each}
      </select>

      <button class="mt-4 bg-neutral-800 hover:bg-neutral-700 rounded px-4 py-2" onclick={() => cameraStore.disconnect()}>
        Putuskan Koneksi
      </button>
    </div>
  {/if}
</main>
```

> Ini contoh minimal untuk ISO saja. Ulangi pola yang sama (`getSetting` / `setSetting`) untuk `tv` (shutter speed), `av` (aperture — **cek Phase 0 dulu, R100 mungkin tidak expose kontrol aperture manual lewat CCAPI**), dan `exposure` (kompensasi EV), sesuai kebutuhan.

### 4.3 Buat `src/routes/session/+page.svelte` — live preview + capture

Live preview **tidak** lewat Rust/invoke, tapi langsung `<img>` ke endpoint kamera, supaya tidak ada overhead serialisasi base64 lewat IPC tiap frame:

```svelte
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { cameraStore } from "$lib/camera.svelte";

  let frameSrc = $state("");
  let intervalId: ReturnType<typeof setInterval> | undefined;

  onMount(async () => {
    if (cameraStore.status !== "connected") return;
    await cameraStore.startLiveview();
    intervalId = setInterval(() => {
      if (!cameraStore.cameraBaseUrl) return;
      // cache-buster supaya browser tidak nge-cache frame lama
      frameSrc = `${cameraStore.cameraBaseUrl}/ccapi/ver100/shooting/liveview/flip?_=${Date.now()}`;
    }, 150); // ~6-7 fps, sesuaikan setelah tes nyata di kamera
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
    cameraStore.stopLiveview();
  });
</script>

<main class="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-6">
  {#if cameraStore.status !== "connected"}
    <p class="text-neutral-400">Kamera belum terhubung. Kembali ke <a class="underline" href="/camera-config">Konfigurasi Kamera</a>.</p>
  {:else}
    <div class="w-full max-w-2xl aspect-video bg-neutral-900 rounded overflow-hidden flex items-center justify-center">
      {#if frameSrc}
        <img src={frameSrc} alt="Live preview kamera" class="w-full h-full object-contain" />
      {:else}
        <p class="text-neutral-500">Menunggu live view...</p>
      {/if}
    </div>

    <button
      class="w-20 h-20 rounded-full bg-white disabled:opacity-40"
      onclick={() => cameraStore.capture()}
      disabled={cameraStore.isCapturing}
      aria-label="Ambil foto"
    ></button>
  {/if}
</main>
```

> **Catatan penting soal live preview**: endpoint `GET /ccapi/ver100/shooting/liveview/flip` yang dipakai di sini adalah pola polling per-frame yang paling umum didokumentasikan untuk CCAPI. Kalau saat Phase 0 ternyata `docs/ccapi-discovery/ccapi-ver100.json` menunjukkan path lain (mis. ada `url` field yang dikembalikan dari `POST liveview` yang harus dipakai langsung sebagai stream MJPEG), **pakai itu**, dan ganti polling interval jadi `<img src={streamUrl}>` sekali set saja tanpa `setInterval` (karena kalau kamera mendukung stream `multipart/x-mixed-replace`, browser akan otomatis update frame-nya sendiri, lebih smooth daripada polling).

**Definition of Done Phase 4**:

```bash
pnpm tauri dev
```

Aplikasi jalan, halaman `/`, `/camera-config`, `/session` bisa dinavigasi tanpa error di console.

---

## Phase 5 — Uji Terintegrasi dengan Kamera Fisik

Checklist manual (dilakukan bersama user, kamera harus menyala & terhubung ke jaringan yang sama):

- [ ] `Hubungkan` di `/camera-config` berhasil, `device.productname` muncul dan sesuai (EOS R100)
- [ ] Dropdown ISO menampilkan pilihan yang masuk akal, ganti ISO benar-benar berubah di layar kamera
- [ ] `/session` menampilkan live preview yang update (bukan gambar statis/beku)
- [ ] Tombol shutter di `/session` benar-benar memicu kamera jepret (dengar bunyi shutter / lihat lampu)
- [ ] Setelah capture, foto tersimpan di SD card kamera (cek lewat `GET /ccapi/ver100/contents/...` atau langsung di kamera)
- [ ] Autofocus benar-benar mengunci fokus sebelum shutter (foto tidak blur dibanding kalau tanpa AF)
- [ ] Disconnect lalu reconnect tidak membuat aplikasi crash/stuck

Kalau ada langkah yang gagal, jangan tambal dengan `try/catch` yang menelan error — catat response body error dari kamera (`CcapiError::CameraResponded { status, body }` sudah didesain untuk expose ini ke frontend lewat `errorMessage`), lalu sesuaikan field/endpoint di `ccapi.rs` berdasarkan body error tsb.

---

## Eksplisit Di Luar Scope Dokumen Ini

- Integrasi printer DNP DS-RX1HS
- Penyimpanan riwayat sesi / database
- Auto-download & tampilkan hasil foto akhir (setelah capture) ke UI — bisa jadi fase lanjutan setelah shutter berfungsi, pakai event polling `GET /ccapi/ver100/event/polling` untuk tahu file baru lalu `GET` isi filenya
- Multi-kamera / ganti kamera saat runtime tanpa restart state
- Packaging/build production (`tauri build`) & code signing Windows

---

## Ringkasan Endpoint CCAPI yang Dipakai (rekap, verifikasi ulang di Phase 0)

| Fungsi                    | Method | Path                                                  |
| ------------------------- | ------ | ----------------------------------------------------- |
| Info device               | GET    | `/ccapi/ver100/deviceinformation`                     |
| Baca setting              | GET    | `/ccapi/ver100/shooting/settings/{key}`               |
| Ubah setting              | PUT    | `/ccapi/ver100/shooting/settings/{key}`               |
| Shutter manual            | POST   | `/ccapi/ver100/shooting/control/shutterbutton/manual` |
| Start/stop liveview       | POST   | `/ccapi/ver100/shooting/liveview`                     |
| Ambil frame liveview      | GET    | `/ccapi/ver100/shooting/liveview/flip`                |
| Event polling (file baru) | GET    | `/ccapi/ver100/event/polling`                         |
