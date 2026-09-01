# Rencana Migrasi Kamera: CCAPI → libgphoto2 (gphoto2-rs) — Photobooth Desktop App (Tauri v2 + SvelteKit)

> **Untuk siapa dokumen ini**: agen CLI yang akan mengeksekusi perubahan pada repo `potohub-dekstop-app`.
> **Kenapa migrasi ini**: implementasi saat ini pakai Canon CCAPI (HTTP over Wi-Fi), tapi belum ada kamera yang mendukung Wi-Fi CCAPI secara fisik untuk testing. `libgphoto2` (via crate `gphoto2`) mendukung Canon **dan** Nikon lewat kabel USB, jadi bisa langsung dites dengan kamera yang ada sekarang.
> **Prinsip kerja**: jalankan per-Phase secara berurutan. Jangan hapus kode CCAPI — **backup dulu (Phase 1)**, baru ganti. Setiap Phase punya "Definition of Done"; jangan lanjut sebelum itu terpenuhi. Kalau nama field/config gphoto2 di dokumen ini ternyata beda dari kondisi real kamera (sangat mungkin, karena config tree gphoto2 berbeda antar model/driver), **ikuti hasil discovery nyata di Phase 0**, bukan asumsi di dokumen ini.

---

## 0. Kondisi Project Saat Ini (baseline)

```
src-tauri/src/
├── ccapi.rs      # HTTP client ke Canon CCAPI (reqwest), dipakai AppState.camera
├── printer.rs    # tidak tersentuh oleh migrasi ini
├── lib.rs        # AppState { camera: Mutex<Option<CcapiClient>> } + semua #[tauri::command]
└── main.rs

src/lib/camera.svelte.ts             # store frontend, connect(ip, port), cameraBaseUrl untuk <img src>
src/routes/camera-config/+page.svelte # form IP/port + dropdown iso/tv/av/exposure
src/routes/session/+page.svelte       # polling <img src="${cameraBaseUrl}/ccapi/.../liveview/flip">
```

**Keputusan desain yang mengikat dokumen ini:**

- Tidak menghapus kode CCAPI — dipindah jadi arsip (Phase 1), supaya gampang dikembalikan begitu ada kamera Wi-Fi CCAPI di masa depan.
- Koneksi kamera baru: **USB**, autodetect via `libgphoto2`, tidak ada lagi input IP/port.
- Kontrak nama command Tauri **dipertahankan sebisa mungkin** (`connect_camera`, `capture_photo`, `get_camera_setting`, dst.) supaya perubahan di frontend minimal. Command yang secara konsep tidak relevan lagi (`get_camera_base_url`) dihapus, dan command baru (`get_liveview_frame`) ditambahkan karena gphoto2 tidak punya endpoint HTTP untuk live preview.
- Live preview & hasil capture: karena tidak ada URL HTTP seperti CCAPI, frame/foto dikirim sebagai `Vec<u8>` lewat IPC lalu di-render di frontend pakai `Blob` + `URL.createObjectURL`.

---

## Phase 0 — Prasyarat Sistem (WAJIB sebelum coding apa pun)

### 0.1 Install `libgphoto2` di sistem development

- **Linux (Debian/Ubuntu)**: `sudo apt install libgphoto2-dev pkg-config`
- **Linux (Arch)**: `sudo pacman -S libgphoto2 pkgconf`
- **macOS**: `brew install libgphoto2 pkg-config`
- **Windows**: tidak ada cara resmi yang sederhana. Perlu **MSYS2** (`pacman -S mingw-w64-x86_64-libgphoto2`) dan pastikan `PKG_CONFIG_PATH` mengarah ke situ saat `cargo build`. Catat ini di README sebagai syarat build Windows.

### 0.2 Cek kamera terdeteksi di level OS SEBELUM sentuh kode Rust

```bash
# Linux/macOS — pastikan gphoto2 CLI (bukan cuma lib) juga terinstal untuk debugging
gphoto2 --auto-detect
gphoto2 --list-config          # simpan output ini, dipakai di Phase 3 untuk cocokkan nama setting
```

⚠️ **Gotcha yang WAJIB ditangani, khususnya di Linux**: desktop environment (GNOME/KDE) biasanya auto-mount kamera lewat `gvfs-gphoto2-volume-monitor` atau `gvfsd-gphoto2`, yang akan merebut akses USB kamera sebelum aplikasi sempat connect (`gphoto2 --auto-detect` akan kelihatan kamera tapi command lain gagal dengan error "Could not claim the USB device"). Solusi:

```bash
killall gvfs-gphoto2-volume-monitor gvfsd-gphoto2 2>/dev/null
# atau matikan servicenya permanen kalau ini mesin khusus photobooth
systemctl --user mask gvfs-gphoto2-volume-monitor.service 2>/dev/null || true
```

Dokumentasikan langkah ini di README project (mungkin perlu dijalankan tiap boot, atau bikin udev rule / autostart script).

**Windows**: driver default Windows untuk kamera adalah MTP/WIA, dan `libgphoto2` butuh driver **WinUSB** di interface kamera tersebut. Perlu tool **Zadig** untuk replace driver kamera dari MTP ke WinUSB secara manual. Tanpa ini, autodetect akan gagal total di Windows. Catat ini di README sebagai syarat instalasi end-user, bukan cuma dev.

**Definition of Done Phase 0**: `gphoto2 --auto-detect` menampilkan model kamera + port (`usb:xxx,yyy`), dan `gphoto2 --list-config` berhasil dijalankan tanpa error klaim USB. Simpan hasil `--list-config` ke `docs/gphoto2-discovery/list-config-<model>.txt` di repo — ini jadi sumber kebenaran nama setting untuk Phase 3, menggantikan tebakan nama field (`iso`, `shutterspeed`, `aperture`, dst.) kalau ternyata beda per kamera/driver.

```bash
mkdir -p docs/gphoto2-discovery
gphoto2 --list-config > docs/gphoto2-discovery/list-config-$(gphoto2 --auto-detect | tail -1 | awk '{print $1"-"$2}').txt
```

---

## Phase 1 — Backup Implementasi CCAPI (WAJIB sebelum ubah/hapus apapun)

Tujuan: implementasi CCAPI tetap bisa dikembalikan utuh kapan pun tanpa menggali git history, karena akan ada kamera Wi-Fi CCAPI di masa depan.

### 1.1 Checkpoint git (safety net utama)

```bash
git status   # pastikan tidak ada perubahan liar yang belum dicommit sebelumnya
git add -A && git commit -m "chore: checkpoint sebelum migrasi CCAPI -> libgphoto2" || true
git tag ccapi-backup-$(date +%Y%m%d)
```

### 1.2 Salinan fisik yang mudah dibaca (di luar git history)

Buat folder arsip, salin file-file yang akan diubah/dihapus **apa adanya** (jangan diedit saat menyalin):

```bash
mkdir -p docs/legacy-ccapi/src-tauri docs/legacy-ccapi/frontend

cp src-tauri/src/ccapi.rs        docs/legacy-ccapi/src-tauri/ccapi.rs.bak
cp src-tauri/src/lib.rs          docs/legacy-ccapi/src-tauri/lib.rs.bak
cp src-tauri/Cargo.toml          docs/legacy-ccapi/src-tauri/Cargo.toml.bak
cp src/lib/camera.svelte.ts      docs/legacy-ccapi/frontend/camera.svelte.ts.bak
cp src/routes/camera-config/+page.svelte docs/legacy-ccapi/frontend/camera-config+page.svelte.bak
cp src/routes/session/+page.svelte       docs/legacy-ccapi/frontend/session+page.svelte.bak
```

Buat `docs/legacy-ccapi/README.md` berisi:

```markdown
# Arsip Implementasi CCAPI (dinonaktifkan sejak migrasi ke libgphoto2)

File di folder ini adalah salinan implementasi kontrol kamera via Canon CCAPI
(HTTP over Wi-Fi), dinonaktifkan karena belum ada unit kamera yang mendukung
Wi-Fi CCAPI untuk testing. Diganti dengan libgphoto2 (USB, multi-brand).

## Cara mengembalikan implementasi CCAPI

1. Cara cepat: `git checkout ccapi-backup-<tanggal> -- src-tauri/src/ccapi.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src/lib/camera.svelte.ts src/routes/camera-config/+page.svelte src/routes/session/+page.svelte`
2. Atau salin manual dari file `.bak` di folder ini kembali ke path aslinya
   (hapus suffix `.bak`), lalu jalankan ulang `pnpm install` / `cargo build`.
3. Ingat: kalau sudah pernah develop gphoto2 juga, cek dulu apakah ada logika
   baru (misal print flow) yang bergantung ke command gphoto2 sebelum revert total.

Tag git referensi: `ccapi-backup-<tanggal commit>`.
```

**Definition of Done Phase 1**: `git tag` menampilkan `ccapi-backup-*`, folder `docs/legacy-ccapi/` berisi 6 file `.bak` + `README.md`. Setelah ini, file asli (`ccapi.rs`, dst.) boleh mulai diubah/dihapus di phase-phase berikutnya.

---

## Phase 2 — Setup Dependency

### 2.1 Tambah crate `gphoto2`, hapus `reqwest`

`reqwest` di `Cargo.toml` hanya dipakai oleh `ccapi.rs` (cek dulu dengan `grep -rn reqwest src-tauri/src` — kalau memang tidak dipakai file lain, aman dihapus). `tokio` **tetap dipertahankan** karena akan dipakai untuk `tokio::sync::Mutex` (lihat Phase 3) dan tetap relevan untuk async command Tauri lainnya.

```bash
cd src-tauri
cargo remove reqwest
cargo add gphoto2   # biarkan cargo resolve versi terbaru dari crates.io, jangan hardcode versi lama
```

`Cargo.toml` bagian `[dependencies]` seharusnya jadi kira-kira:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
thiserror = "2"
image = "0.25"
gphoto2 = "3"
```

### 2.2 Verifikasi link-time terhadap `libgphoto2` sistem

```bash
cd src-tauri
cargo check
```

Kalau error terkait `pkg-config` tidak menemukan `libgphoto2`, itu berarti Phase 0.1 belum benar (paket `-dev`/header belum terinstal, atau `PKG_CONFIG_PATH` di Windows/MSYS2 belum diset). **Jangan lanjut ke Phase 3 sebelum `cargo check` bersih.**

**Definition of Done Phase 2**: `cargo check` sukses, `Cargo.toml` sudah tidak menyebut `reqwest`, `gphoto2` muncul di `Cargo.lock`.

---

## Phase 3 — Modul Rust Baru: `src-tauri/src/gphoto.rs`

Ganti nama file (jangan reuse `ccapi.rs` — sudah diarsipkan di Phase 1, hapus file aslinya setelah modul baru ini jalan).

### 3.1 Struktur & error type

```rust
use gphoto2::{Camera, Context};
use gphoto2::widget::WidgetType;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;

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

// gphoto2::Error tidak implement Serialize, jadi konversi ke String di sini.
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
```

### 3.2 Koneksi & info kamera

```rust
pub async fn connect() -> Result<(Camera, DeviceInfo), GphotoError> {
    let context = Context::new().map_err(|e| GphotoError::Connection(e.to_string()))?;
    let camera = context
        .autodetect_camera()
        .await
        .map_err(|e| GphotoError::Connection(e.to_string()))?;

    let summary = camera.summary().await.unwrap_or_default().to_string();
    let abilities = camera.abilities().await;
    let info = DeviceInfo {
        manufacturer: abilities.as_ref().ok().map(|a| a.model().to_string()),
        productname: Some(summary.lines().next().unwrap_or_default().to_string()),
    };
    Ok((camera, info))
}
```

> ⚠️ **Catatan jujur soal API**: signature persis (`.wait()` vs `async/await` langsung, nama method `abilities()`/`summary()`) tergantung versi crate `gphoto2` yang ter-resolve di Phase 2. **Jalankan `cargo doc --open -p gphoto2` (atau buka di docs.rs sesuai versi di `Cargo.lock`) dan cocokkan nama method sebelum copy-paste blok ini mentah-mentah.** Kalau API pakai pola `Task` + `.wait()` (bukan native `async fn`), sesuaikan semua pemanggilan di modul ini ke pola itu secara konsisten.

### 3.3 Mapping nama setting frontend → nama config gphoto2

Nama setting yang dipakai frontend (`iso`, `tv`, `av`, `exposure`) adalah istilah CCAPI, **bukan** nama config path libgphoto2. Buat mapping eksplisit, dan **validasi ulang terhadap file `docs/gphoto2-discovery/list-config-*.txt` dari Phase 0** — nama di bawah ini adalah nama umum tapi bisa beda per driver:

```rust
fn map_setting_key(frontend_key: &str) -> &'static str {
    match frontend_key {
        "iso" => "iso",
        "tv" => "shutterspeed",
        "av" => "aperture",
        "exposure" => "exposurecompensation",
        other => other, // fallback: anggap sudah nama config asli
    }
}
```

### 3.4 Get/set setting (pertahankan bentuk JSON `{ value, ability }` biar frontend tidak perlu berubah)

```rust
pub async fn get_setting(camera: &Camera, frontend_key: &str) -> Result<serde_json::Value, GphotoError> {
    let key = map_setting_key(frontend_key);
    let widget = camera
        .config_key(key)
        .await
        .map_err(|_| GphotoError::UnsupportedSetting(key.to_string()))?;

    let value = widget.value_string().unwrap_or_default();
    let ability: Vec<String> = match widget.widget_type() {
        WidgetType::Radio | WidgetType::Menu => widget
            .choices()
            .map(|c| c.map(|s| s.to_string()).collect())
            .unwrap_or_default(),
        _ => vec![],
    };

    Ok(serde_json::json!({ "value": value, "ability": ability }))
}

pub async fn set_setting(camera: &Camera, frontend_key: &str, value: &str) -> Result<(), GphotoError> {
    let key = map_setting_key(frontend_key);
    let mut widget = camera
        .config_key(key)
        .await
        .map_err(|_| GphotoError::UnsupportedSetting(key.to_string()))?;
    widget.set_value_string(value).map_err(|e| GphotoError::Operation(e.to_string()))?;
    camera.set_config(&widget).await.map_err(|e| GphotoError::Operation(e.to_string()))?;
    Ok(())
}
```

> Sesuaikan nama method (`config_key`, `value_string`, `choices`, `set_value_string`, `set_config`) dengan API real di `Cargo.lock` — ini poin yang paling mungkin berbeda antar versi crate, cek dengan `cargo doc`.

### 3.5 Capture foto (return bytes langsung, bukan hanya "OK" seperti CCAPI)

CCAPI lama cuma memicu shutter tanpa mengembalikan file (foto dilihat manual di kamera / lewat liveview URL). Karena gphoto2 wajib download eksplisit, sekalian kembalikan byte JPEG-nya supaya bisa langsung dipakai command `print_photo_from_buffer` yang sudah ada di `printer.rs` — ini port yang wajib, bukan opsional, karena tanpa ini command `capture_photo` gphoto2 tidak berguna buat frontend.

```rust
pub async fn capture_photo(camera: &Camera, save_dir: &std::path::Path) -> Result<Vec<u8>, GphotoError> {
    let file_path = camera.capture_image().await.map_err(|e| GphotoError::Operation(e.to_string()))?;
    let camera_file = camera
        .fs()
        .download(&file_path.folder(), &file_path.name())
        .await
        .map_err(|e| GphotoError::Operation(e.to_string()))?;

    let data = camera_file.get_data(camera).await.map_err(|e| GphotoError::Operation(e.to_string()))?;
    let bytes = data.to_vec();

    // Simpan juga salinan lokal untuk arsip/gallery, best-effort (jangan gagalkan capture kalau save gagal).
    let _ = std::fs::create_dir_all(save_dir);
    let local_path: PathBuf = save_dir.join(file_path.name().to_string());
    let _ = std::fs::write(&local_path, &bytes);

    Ok(bytes)
}
```

### 3.6 Live preview (ganti mekanisme HTTP-poll CCAPI dengan capture_preview per-frame)

```rust
pub async fn get_liveview_frame(camera: &Camera) -> Result<Vec<u8>, GphotoError> {
    let preview = camera.capture_preview().await.map_err(|e| GphotoError::Operation(e.to_string()))?;
    let data = preview.get_data(camera).await.map_err(|e| GphotoError::Operation(e.to_string()))?;
    Ok(data.to_vec())
}

/// Best-effort: sebagian body Canon butuh flag viewfinder aktif dulu sebelum capture_preview
/// jalan lancar (mirror-up). Kalau config ini tidak ada di kamera, biarkan saja (bukan error fatal).
pub async fn set_viewfinder(camera: &Camera, active: bool) -> Result<(), GphotoError> {
    if let Ok(mut widget) = camera.config_key("viewfinder").await {
        let _ = widget.set_value(active);
        let _ = camera.set_config(&widget).await;
    }
    Ok(())
}
```

**Definition of Done Phase 3**: `cargo check` sukses untuk modul `gphoto.rs` berdiri sendiri (boleh belum dipanggil dari `lib.rs`). Semua method call sudah dicocokkan manual ke `cargo doc -p gphoto2` — bukan asumsi mentah dari dokumen ini.

---

## Phase 4 — Wiring ke `lib.rs` (AppState & Tauri commands)

### 4.1 Ganti `Mutex` std jadi `tokio::sync::Mutex`

Ini **wajib**, bukan gaya penulisan: `Camera` dari gphoto2 tidak `Clone` murah seperti `CcapiClient` lama, dan command async perlu `.await` sambil state ter-lock — `std::sync::MutexGuard` tidak `Send` sehingga tidak boleh dipegang lintas `.await`. `tokio::sync::Mutex` aman untuk ini.

```rust
mod gphoto;
mod printer;

use gphoto::{DeviceInfo, GphotoError};
use gphoto2::Camera;
use printer::{PrintOptions, PrinterError, PrinterStatus};
use std::path::PathBuf;
use tauri::State;
use tokio::sync::Mutex;

pub struct AppState {
    pub camera: Mutex<Option<Camera>>,
}
```

### 4.2 Command baru (ganti seluruh blok command kamera lama)

```rust
#[tauri::command]
async fn connect_camera(state: State<'_, AppState>) -> Result<DeviceInfo, GphotoError> {
    let (camera, info) = gphoto::connect().await?;
    *state.camera.lock().await = Some(camera);
    Ok(info)
}

#[tauri::command]
async fn disconnect_camera(state: State<'_, AppState>) {
    *state.camera.lock().await = None;
}

#[tauri::command]
async fn is_camera_connected(state: State<'_, AppState>) -> bool {
    state.camera.lock().await.is_some()
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
    let save_dir = app.path_resolver().app_data_dir().unwrap_or(PathBuf::from("."));
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
    gphoto::get_liveview_frame(camera).await
}
```

Hapus command `get_camera_base_url` sepenuhnya (tidak ada padanan konsepnya di gphoto2 — sudah digantikan `get_liveview_frame`).

### 4.3 Update `invoke_handler![...]`

```rust
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
    get_printer_list,
    get_printer_status,
    print_photo,
    print_photo_from_buffer,
])
```

Dan update `.manage(AppState { camera: Mutex::new(None) })` — `Mutex` di sini sekarang `tokio::sync::Mutex`, cukup ganti import-nya, konstruksi tetap sama.

**Definition of Done Phase 4**: `cargo build` (bukan cuma `check`) sukses untuk seluruh `src-tauri`, tidak ada lagi referensi `ccapi`/`CcapiClient` di `lib.rs`. Hapus file `src-tauri/src/ccapi.rs` sekarang (sudah aman, sudah diarsipkan Phase 1).

---

## Phase 5 — Update Frontend

### 5.1 `src/lib/camera.svelte.ts`

- Hapus parameter `ip`, `port` dari `connect()` — jadi `connect()` tanpa argumen.
- Hapus field `cameraBaseUrl`.
- Tambah method `getLiveviewFrame()` yang invoke `get_liveview_frame`, convert `Uint8Array`/`number[]` hasil IPC jadi `Blob` lalu `URL.createObjectURL(blob)`, dan **revoke URL sebelumnya** tiap kali dapat frame baru supaya tidak memory-leak.
- `capture()` sebaiknya mengembalikan `Uint8Array` bytes hasil capture (bukan `void`) supaya caller (session page) bisa langsung dipakai untuk print, gantikan `dummyBuffer` demo yang ada sekarang.

### 5.2 `src/routes/camera-config/+page.svelte`

- Hapus input IP & Port beserta `let ip = $state(...)`, `let port = $state(...)`.
- `handleConnect()` panggil `cameraStore.connect()` tanpa argumen.
- Ganti label section dari "📷 Kamera (CCAPI)" ke "📷 Kamera (USB / libgphoto2)".
- Dropdown ISO/Tv/Av/Exposure **tidak perlu diubah** — bentuk data (`{value, ability}`) dipertahankan sama persis oleh Phase 3.4, jadi kompatibel apa adanya.

### 5.3 `src/routes/session/+page.svelte`

Ganti mekanisme polling liveview dari HTTP `<img src>` jadi Blob URL dari IPC:

```ts
let intervalId: ReturnType<typeof setInterval> | undefined;

onMount(async () => {
  if (cameraStore.status !== "connected") return;
  await cameraStore.startLiveview();
  intervalId = setInterval(async () => {
    frameSrc = await cameraStore.getLiveviewFrame(); // sudah berupa blob: URL
  }, 150); // sesuaikan lagi setelah tes real — capture_preview biasanya lebih lambat dari CCAPI flip endpoint
});
```

Ganti `handleCapture()` supaya pakai bytes asli dari `capture_photo` (bukan `dummyBuffer`):

```ts
async function handleCapture() {
  const bytes = await cameraStore.capture(); // Uint8Array hasil JPEG asli
  lastCaptured = true;
  if (autoPrint && printerStore.selectedPrinter) {
    await printerStore.printFromBuffer(bytes, { copies: printCopies, paper_size: paperSize });
  }
}
```

**Definition of Done Phase 5**: `pnpm build` sukses, tidak ada lagi referensi `ip`, `port`, atau `cameraBaseUrl` di codebase frontend (`grep -rn "cameraBaseUrl\|get_camera_base_url" src/` kosong).

---

## Phase 6 — Testing Manual dengan Kamera Real

1. Colokkan kamera via USB, pastikan Phase 0.2 (kill gvfs / driver WinUSB) sudah dilakukan di mesin testing.
2. `pnpm tauri dev`, buka halaman `/camera-config`, klik "Hubungkan Kamera" → harus dapat `DeviceInfo` tanpa error klaim USB.
3. Cek dropdown ISO/Tv/Av/Exposure terisi — kalau ada yang kosong/error `UnsupportedSetting`, buka `docs/gphoto2-discovery/list-config-*.txt` dan perbaiki mapping di `map_setting_key` (Phase 3.3) sesuai nama config asli kamera tsb.
4. Buka `/session`, pastikan live preview jalan (frame berganti, bukan gambar diam/error).
5. Tekan capture → foto tersimpan di `app_data_dir()/captures/` dan (kalau printer terhubung) terkirim ke `print_photo_from_buffer` dengan data asli.
6. Uji ulang langkah 1–5 dengan kamera **merek kedua** (Canon lalu Nikon, atau sebaliknya) untuk memastikan tidak ada asumsi yang ke-hardcode ke satu vendor.

---

## Phase 7 — Rollback (kalau migrasi perlu dibatalkan)

Ikuti instruksi di `docs/legacy-ccapi/README.md` (dibuat di Phase 1.2): checkout file-file dari tag `ccapi-backup-<tanggal>`, lalu `cargo add reqwest` kembali dan `cargo remove gphoto2` kalau memang mau full-revert.

---

## Ringkasan File yang Berubah

| File | Aksi |
|---|---|
| `src-tauri/src/ccapi.rs` | Diarsipkan ke `docs/legacy-ccapi/`, lalu dihapus dari `src-tauri/src/` |
| `src-tauri/src/gphoto.rs` | **Baru** — modul libgphoto2 |
| `src-tauri/src/lib.rs` | `AppState` pakai `tokio::sync::Mutex<Option<Camera>>`, command kamera diganti total, `get_camera_base_url` dihapus, `get_liveview_frame` ditambah |
| `src-tauri/Cargo.toml` | `-reqwest`, `+gphoto2` |
| `src/lib/camera.svelte.ts` | `connect()` tanpa ip/port, `cameraBaseUrl` dihapus, `getLiveviewFrame()` ditambah, `capture()` return bytes |
| `src/routes/camera-config/+page.svelte` | Hapus input IP/port |
| `src/routes/session/+page.svelte` | Liveview via blob URL, capture pakai bytes asli |
| `docs/legacy-ccapi/**` | **Baru** — arsip implementasi CCAPI |
| `docs/gphoto2-discovery/**` | **Baru** — hasil discovery config real kamera |
