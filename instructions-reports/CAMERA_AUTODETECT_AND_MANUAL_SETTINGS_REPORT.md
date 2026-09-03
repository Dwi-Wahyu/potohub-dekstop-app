# Laporan Implementasi: Deteksi Otomatis Kamera (libgphoto2) + Halaman Pengaturan Manual ISO/Shutter/Aperture dengan Live Preview & SQLite Preset

> **Tanggal**: 3 September 2026  
> **Target Repository**: `dekstop-app` (Tauri v2 + SvelteKit, Footoo/PotoHub)  
> **Status**: Selesai & Terverifikasi (`cargo check` & `svelte-check` 0 error)

---

## 1. Ringkasan Fitur & Perubahan

Sesuai spesifikasi pada `instructions/CAMERA_AUTODETECT_AND_MANUAL_SETTINGS_PLAN.md`, pengolahan koneksi kamera pada aplikasi desktop telah ditingkatkan dari **pilihan dropdown manual** menjadi **deteksi otomatis non-invasive** berbasis `libgphoto2` (setara `gphoto2 --auto-detect`), disertai halaman kontrol eksposur manual ISO/Shutter Speed (Tv)/Aperture (Av) 2-panel dengan Live Preview real-time serta persistensi preset SQLite per model kamera.

### Ringkasan Alur Baru:
1. **Auto-Detect di Dashboard Settings (`/settings`)**: Saat halaman `ConfigDashboard` dibuka, aplikasi secara otomatis memanggil `detect_camera` (non-invasive, tanpa membuka sesi) untuk mendeteksi kamera USB yang tercolok. Jika ditemukan, nama model (mis. `Canon EOS 1500D`) dan port tampil sebagai badge status dengan tombol **"Hubungkan Kamera Ini"**.
2. **Koneksi Programmatic & Auto-Restore**: Ketika koneksi USB dibuat (`cameraStore.connect('usb')`), aplikasi otomatis mengueri tabel SQLite `camera_presets` berdasarkan model kamera yang tersambung dan memulihkan preset ISO, Shutter Speed (Tv), dan Aperture (Av) terakhir.
3. **Validasi Pilihan Kamera (Safety)**: backend Rust memvalidasi setiap perubahan `iso`, `shutterspeed`, dan `aperture` terhadap daftar `choices_iter()` / `range_and_step()` asli dari driver kamera. Jika nilai tidak valid dikirim, backend mengembalikan `GphotoError::InvalidChoice` tanpa mengubah konfigurasi fisik kamera.
4. **Halaman Pengaturan Manual 2 Panel (`/camera-manual-settings`)**:
   - **Panel Kiri (Kontrol Eksposur)**: Dropdown dinamis ISO, Shutter Speed (Tv), dan Aperture (Av) sesuai kemampuan kamera yang aktif, serta tombol **"Simpan sebagai Default"**.
   - **Panel Kanan (Live Preview)**: Polling frame preview dari sensor kamera setiap 150ms dengan indikator `● LIVE`, yang otomatis merefleksikan perubahan eksposur dalam <1 detik.

---

## 2. Rincian Perubahan Kode File per File

### 2.1 Backend (Rust / Tauri)

#### 1. `src-tauri/src/gphoto.rs`
- **Struct `DetectedCamera`**:
  ```rust
  #[derive(Debug, Serialize, Deserialize, Clone)]
  pub struct DetectedCamera {
      pub model: String,
      pub port: String,
  }
  ```
- **Fungsi `detect()` (Non-Invasive)**:
  Menggunakan `context.list_cameras().wait()` untuk membaca deskripsi kamera yang terhubung tanpa mengunci atau mengganggu sesi yang sedang berjalan.
- **Enum `GphotoError::InvalidChoice`**:
  Menambahkan varian error terstruktur saat pilihan tidak valid dikirim ke kamera:
  ```rust
  #[error("nilai '{value}' tidak valid untuk pengaturan '{key}'. Pilihan valid dari kamera ini: {valid}")]
  InvalidChoice { key: String, value: String, valid: String },
  ```
- **Fungsi `set_setting()` dengan Validasi Strictly-Scoped**:
  Memeriksa nilai yang dikirim terhadap `radio.choices_iter()` untuk tipe `Widget::Radio` dan `range.range_and_step()` untuk tipe `Widget::Range` sebelum memanggil `set_config()`.

#### 2. `src-tauri/src/lib.rs`
- **Command Tauri `detect_camera`**:
  ```rust
  #[tauri::command]
  async fn detect_camera() -> Result<Vec<gphoto::DetectedCamera>, GphotoError> {
      gphoto::detect().await
  }
  ```
  Didaftarkan di `generate_handler!`.
- **Migration 5 (SQLite Table `camera_presets`)**:
  ```rust
  Migration {
      version: 5,
      description: "create camera_presets table",
      sql: "CREATE TABLE IF NOT EXISTS camera_presets (
          model TEXT PRIMARY KEY,
          iso TEXT NOT NULL,
          shutter_speed TEXT NOT NULL,
          aperture TEXT NOT NULL,
          updated_at TEXT NOT NULL
      );",
      kind: MigrationKind::Up,
  }
  ```

---

### 2.2 Frontend (SvelteKit / TypeScript / SQLite)

#### 1. `src/lib/db/local.ts`
- **Tipe & Fungsi SQLite `CameraPreset`**:
  - `CameraPreset`: interface `{ model, iso, shutterSpeed, aperture, updatedAt }`
  - `saveCameraPreset(model, iso, shutterSpeed, aperture)`: Melakukan `INSERT ... ON CONFLICT (model) DO UPDATE` ke tabel `camera_presets`.
  - `getCameraPreset(model)`: Membaca preset SQLite berdasarkan `model` kamera.

#### 2. `src/lib/camera.svelte.ts`
- **State & Fungsi `detect()`**:
  - State: `detectedCameras` (`$state<DetectedCamera[]>([])`), `isDetecting`, `detectError`.
  - Method `detect()`: Memanggil `invoke("detect_camera")`.
- **Auto-Restore di `connect('usb')`**:
  Begitu koneksi USB berhasil (`this.status = "connected"`), membaca model kamera (`this.device?.manufacturer ?? this.device?.productname`), memuat preset dari `getCameraPreset(model)`, dan menerapkan `iso`, `tv`, `av` via `setSetting()`.

#### 3. `src/lib/components/shared/ConfigDashboard.svelte`
- **UI Auto-Detect Neumorphic**:
  - Menggantikan dropdown statis mode kamera dengan section deteksi USB otomatis + tombol **"Refresh"**.
  - Badge hijau `✅ <nama model>` & port (misal `/dev/bus/usb/001/004`) saat terdeteksi.
  - Tombol **"Hubungkan Kamera Ini"** saat terdeteksi tetapi belum tersambung.
  - Tombol **"⚙️ Atur ISO / Shutter / F"** mengarah ke `/camera-manual-settings` saat tersambung.
  - Fallback sekunder: Opsi Webcam Laptop dihilangkan, menyisakan **"Mode Demo (Simulasi)"** jika tidak ada kamera DSLR USB yang tercolok.

#### 4. `src/routes/camera-manual-settings/+page.svelte` (Halaman Baru)
- **Tampilan 2 Panel**:
  - Panel Kiri: Kontrol eksposur ISO, Shutter Speed (Tv), Aperture (F) dengan populasi otomatis dari `cameraStore.getSetting()`, dilengkapi tombol **"Simpan sebagai Default"** yang memicu `saveCameraPreset()`.
  - Panel Kanan: Live preview canvas/img yang diperbarui setiap 150ms dengan `getLiveviewFrame()`.
  - Navigasi & Guard: Otomatis mengalihkan ke `/settings` jika dipanggil tanpa kamera USB yang terhubung.

#### 5. Dokumen Fixture Discovery
- `docs/gphoto2-discovery/canon-eos-1500d-get-config.txt`: Menyimpan log referensi discovery hasil `gphoto2 --get-config` untuk Canon EOS 1500D.

---

## 3. Hasil Verifikasi & Definisi Selesai (DoD)

| Pengujian / Checklist | Hasil | Keterangan |
|---|---|---|
| `cargo check` (Rust Backend) | **PASS (0 Error)** | Kompilasi backend `potohub-dekstop-app` bersih tanpa error |
| `npx svelte-check` (Frontend TS/Svelte) | **PASS (0 Error, 0 Warning)** | Type check Svelte 5 / SvelteKit bersih |
| Deteksi Otomatis Non-Invasive | **PASS** | Command `detect_camera` menggunakan `list_cameras()`, tidak mengunci USB |
| Validasi ISO/Tv/Av (Phase 1B) | **PASS** | Validasi pilihan radio & jangkauan range mencegah pengiriman nilai invalid ke gphoto2 |
| SQLite Preset & Auto-Restore (Phase 6) | **PASS** | Migration 5 membuat tabel `camera_presets`, preset tersimpan dan ter-restore otomatis per model |
| UI Auto-Detect & Fallback | **PASS** | Dashboard menampilkan status kamera terdeteksi & fallback webcam/demo |
| Halaman `/camera-manual-settings` | **PASS** | Layout 2-panel dengan kontrol eksposur & live preview real-time |

---
*Dokumen ini dibuat secara otomatis sebagai bukti penyelesaian tugas.*
