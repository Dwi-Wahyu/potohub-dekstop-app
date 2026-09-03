# Rencana Implementasi: Deteksi Otomatis Kamera (libgphoto2) + Halaman Pengaturan Manual ISO/Shutter/Aperture dengan Live Preview

> **Untuk siapa dokumen ini**: agen CLI (Claude Code / Gemini CLI) yang akan mengeksekusi perubahan pada repo `dekstop-app` (Tauri v2 + SvelteKit, Footoo/PotoHub).
> **Kenapa perubahan ini**: saat ini "Mode Hardware Kamera" di `ConfigDashboard.svelte` adalah dropdown manual (`usb` / `webcam` / `demo`) yang harus dipilih user sendiri. Padahal koneksi USB sudah otomatis lewat `libgphoto2` (`context.autodetect_camera()`), persis seperti `gphoto2 --auto-detect` di CLI yang langsung menampilkan nama model kamera (mis. `Canon EOS 1500D`) tanpa perlu input manual. Selain itu, pengaturan ISO/Shutter(Tv)/Aperture(Av) saat ini nempel di ujung `<select>` pada satu halaman kecil — ini dipindah ke halaman baru khusus dengan 2 panel: **panel kiri = kontrol pengaturan**, **panel kanan = live preview** dari kamera yang otomatis menyesuaikan begitu ISO/Tv/Av diubah.
> **Prinsip kerja**: jalankan per-Phase secara berurutan, jangan lompat. Setiap Phase punya "Definition of Done" — jangan lanjut ke Phase berikutnya sebelum itu terpenuhi. Field/command Tauri yang sudah ada (`connect_camera`, `get_camera_setting`, `set_camera_setting`, `start_liveview`, `get_liveview_frame`, dst.) **jangan diubah signature-nya**, karena dipakai di banyak tempat lain (`V1Camera.svelte`, `session`, dll). Kita hanya **menambah** command baru dan mengubah UI.

---

## 0. Kondisi Project Saat Ini (baseline)

```
src-tauri/src/
├── gphoto.rs   # connect() -> autodetect_camera(), get_setting(), set_setting(), get_liveview_frame(), set_viewfinder()
├── lib.rs      # AppState { camera: Mutex<Option<Camera>> } + semua #[tauri::command]

src/lib/camera.svelte.ts               # store frontend: cameraMode 'usb'|'webcam'|'demo', connect(), setSetting(), getSetting(), startLiveview(), getLiveviewFrame()
src/lib/stores/boothConfig.svelte.ts   # BoothCfg.cameraMode: 'usb' | 'webcam' | 'demo' (persisten ke localStorage)
src/lib/components/shared/ConfigDashboard.svelte  # halaman "Pengaturan Mesin" (route /settings), berisi section "Mode Hardware Kamera" (dropdown statis) di baris ~462-493
src/routes/settings/+page.svelte       # membungkus ConfigDashboard dengan onBack/onLogout, pakai SvelteKit goto()
src/routes/camera-config/+page.svelte  # halaman terpisah (dipakai dari /session saat kamera belum connect) — TIDAK disentuh oleh dokumen ini
```

**Fakta penting dari `gphoto.rs` saat ini:**
- `connect()` (dipanggil oleh command `connect_camera`) sudah memakai `context.autodetect_camera()` — ini **membuka sesi** ke kamera (dipakai untuk benar-benar connect, capture, liveview, dsb).
- Crate `gphoto2 = "3.4.1"` juga punya `context.list_cameras().wait()` yang mengembalikan iterator `CameraDescriptor { model, port }` — **ini yang non-invasive**, cuma daftar (model, port) tanpa membuka sesi kamera, persis kolom `Model` & `Port` pada output `gphoto2 --auto-detect`. Ini yang akan kita pakai untuk "menampilkan nama model kamera secara otomatis" tanpa mengganggu koneksi yang mungkin sedang aktif.

**Keputusan desain yang mengikat dokumen ini:**
- "Mode Hardware Kamera" tidak lagi berupa pilihan manual di awal. Alih-alih, halaman otomatis menjalankan deteksi (setara `gphoto2 --auto-detect`) begitu dibuka, lalu menampilkan nama model yang ketemu secara langsung sebagai status (mis. `✅ Terdeteksi: Canon EOS 1500D`).
- Tombol utama menjadi **"Hubungkan Kamera Ini"** (untuk kamera USB yang terdeteksi) — memicu koneksi sesungguhnya (`connect_camera`) secara programmatic, bukan dari pilihan dropdown.
- `webcam` dan `demo` tetap ada sebagai **fallback sekunder** (tombol kecil/link), untuk kondisi tidak ada DSLR terpasang — bukan lagi pilihan default yang sejajar dengan USB.
- `BoothCfg.cameraMode` (tipe data & penyimpanan) **tidak diubah** — tetap `'usb' | 'webcam' | 'demo'` — supaya logika auto-connect di `src/routes/+page.svelte` saat boot tidak perlu diubah.
- Tombol pengaturan ISO/Tv/Av dipindah dari inline (di `ConfigDashboard`) ke halaman baru `/camera-manual-settings`, hanya bisa diakses saat kamera USB sudah `connected`.

---

## Phase 1 — Backend: command deteksi kamera non-invasive (list_cameras)

### 1.1 Tambah struct & fungsi di `src-tauri/src/gphoto.rs`

Tambahkan setelah struct `DeviceInfo`:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetectedCamera {
    pub model: String,
    pub port: String,
}

/// Non-invasive: hanya me-list kamera yang terpasang (setara `gphoto2 --auto-detect`),
/// TIDAK membuka sesi/koneksi ke kamera. Aman dipanggil kapan saja, termasuk saat
/// kamera lain sedang dipakai (mis. tidak akan bentrok dengan AppState.camera yang aktif).
pub async fn detect() -> Result<Vec<DetectedCamera>, GphotoError> {
    let context = Context::new().map_err(|e| GphotoError::Connection(e.to_string()))?;
    let cameras = context
        .list_cameras()
        .wait()
        .map_err(|e| GphotoError::Connection(e.to_string()))?
        .map(|desc| DetectedCamera {
            model: desc.model,
            port: desc.port,
        })
        .collect();
    Ok(cameras)
}
```

> Catatan: cek dulu nama field persis pada `CameraDescriptor` di versi `gphoto2 = "3.4.1"` yang terpasang (`cargo doc --open -p gphoto2` atau `grep -rn "struct CameraDescriptor" ~/.cargo/registry/src/*/gphoto2-3.4.1/src/list.rs`). Field yang dipakai di atas (`model`, `port`) sudah dikonfirmasi ada di versi ini, tapi tetap verifikasi di mesin dev sebelum lanjut, karena breaking change antar minor version pada crate ini pernah terjadi.

### 1.2 Tambah command Tauri di `src-tauri/src/lib.rs`

```rust
#[tauri::command]
async fn detect_camera() -> Result<Vec<gphoto::DetectedCamera>, GphotoError> {
    gphoto::detect().await
}
```

Daftarkan di `invoke_handler(tauri::generate_handler![...])`, taruh berdekatan dengan `connect_camera`:

```rust
.invoke_handler(tauri::generate_handler![
    connect_camera,
    detect_camera,      // <-- BARU
    disconnect_camera,
    is_camera_connected,
    ...
])
```

### 1.3 Definition of Done Phase 1

```bash
cd src-tauri && cargo check
```
Build sukses tanpa error. Command baru `detect_camera` muncul di hasil `cargo tauri dev` tanpa memengaruhi command lain.

---

## Phase 1B — Validasi Nilai ISO / Shutter Speed / Aperture Berdasarkan Kamera yang Sedang Terhubung (WAJIB)

> **Kenapa fase ini penting**: pilihan valid untuk `iso`, `shutterspeed` (Tv), `aperture` (Av) **berbeda per model kamera** — tidak boleh di-hardcode. Ini data nyata dari kamera Canon EOS 1500D milik Wahil (`gphoto2 --get-config <key>`), dipakai sebagai referensi/fixture, **bukan** nilai yang boleh ditempel permanen di kode:
>
> | Key (frontend → gphoto2) | Current | Pilihan valid (persis dari kamera ini) |
> |---|---|---|
> | `iso` → `iso` | `400` | `Auto, 100, 200, 400, 800, 1600, 3200, 6400` |
> | `tv` → `shutterspeed` | `1/50` | `bulb, 30, 25, 20, 15, 13, 10.3, 8, 6.3, 5, 4, 3.2, 2.5, 2, 1.6, 1.3, 1, 0.8, 0.6, 0.5, 0.4, 0.3, 1/4, 1/5, 1/6, 1/8, 1/10, 1/13, 1/15, 1/20, 1/25, 1/30, 1/40, 1/50, 1/60, 1/80, 1/100, 1/125, 1/160, 1/200, 1/250, 1/320, 1/400, 1/500, 1/640, 1/800, 1/1000, 1/1250, 1/1600, 1/2000, 1/2500, 1/3200, 1/4000` |
> | `av` → `aperture` | `5` | `4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29` |
>
> Angka `Choice: N ...` di output `gphoto2 --get-config` cuma nomor urut tampilan CLI, **bukan** value yang dikirim ke kamera — value asli yang dikirim adalah teks di belakangnya (`100`, `1/50`, `8`, dst). Ini sudah otomatis ditangani oleh `radio.choices_iter()` di crate `gphoto2-rs` (mengembalikan string value, bukan index), jadi tidak perlu parsing manual.

### 1B.1 Simpan hasil discovery kamera ini sebagai fixture referensi

```bash
mkdir -p docs/gphoto2-discovery
cat > docs/gphoto2-discovery/canon-eos-1500d-get-config.txt << 'EOF'
$ gphoto2 --get-config iso
Label: ISO Speed
Readonly: 0
Type: RADIO
Current: 400
Choice: 0 Auto
Choice: 1 100
Choice: 2 200
Choice: 3 400
Choice: 4 800
Choice: 5 1600
Choice: 6 3200
Choice: 7 6400
END

$ gphoto2 --get-config shutterspeed
Label: Shutter Speed
Readonly: 0
Type: RADIO
Current: 1/50
Choice: 0 bulb
Choice: 1 30
... (lihat log lengkap yang sudah didapat) ...
Choice: 52 1/4000
END

$ gphoto2 --get-config aperture
Label: Aperture
Readonly: 0
Type: RADIO
Current: 5
Choice: 0 4.5
Choice: 1 5
... (lihat log lengkap yang sudah didapat) ...
Choice: 16 29
END
EOF
```

Tujuan file ini: referensi cepat saat debugging ("apakah error karena bug kode, atau memang kamera ini tidak punya pilihan itu?"), **bukan** sumber kebenaran yang dipakai runtime — runtime selalu ambil `ability` langsung dari kamera yang sedang connect via `get_camera_setting`.

### 1B.2 Tambah varian error baru di `src-tauri/src/gphoto.rs`

Ubah enum `GphotoError`:

```rust
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
    // BARU: dipakai saat frontend mengirim value yang TIDAK ADA di pilihan asli kamera
    #[error("nilai '{value}' tidak valid untuk pengaturan '{key}'. Pilihan valid dari kamera ini: {valid}")]
    InvalidChoice {
        key: String,
        value: String,
        valid: String,
    },
}
```

### 1B.3 Ubah `set_setting()` supaya validasi dulu sebelum mengirim ke kamera

Ganti seluruh isi fungsi `set_setting` di `gphoto.rs` menjadi:

```rust
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
            // WAJIB: cek value terhadap daftar pilihan ASLI kamera yang sedang
            // terhubung sekarang (bukan daftar hardcoded), karena iso/shutterspeed/
            // aperture berbeda-beda per model (lihat tabel Phase 1B).
            let valid_choices: Vec<String> = radio.choices_iter().collect();
            if !valid_choices.iter().any(|c| c == value) {
                return Err(GphotoError::InvalidChoice {
                    key: frontend_key.to_string(),
                    value: value.to_string(),
                    valid: valid_choices.join(", "),
                });
            }
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
            // Best-effort: validasi batas min/max asli kamera untuk widget bertipe
            // Range (mis. exposure compensation di beberapa kamera). Cek dulu
            // signature `range()`/`min()`/`max()` yang tersedia di versi
            // `gphoto2 = "3.4.1"` yang terpasang (`cargo doc -p gphoto2 --open`,
            // cari struct RangeWidget) — sesuaikan nama method bila berbeda dari
            // dugaan di bawah, tapi PRINSIPNYA TETAP: tolak nilai di luar batas
            // asli kamera, jangan hanya percaya parse::<f32>() berhasil.
            let parsed = value
                .parse::<f32>()
                .map_err(|_| GphotoError::Operation(format!("nilai '{value}' bukan angka valid")))?;
            if let Ok((min, max, _increment)) = range.range() {
                if parsed < min || parsed > max {
                    return Err(GphotoError::InvalidChoice {
                        key: frontend_key.to_string(),
                        value: value.to_string(),
                        valid: format!("{min} sampai {max}"),
                    });
                }
            }
            range.set_value(parsed);
            camera
                .set_config(range)
                .wait()
                .map_err(|e| GphotoError::Operation(e.to_string()))?;
        }
        _ => return Err(GphotoError::UnsupportedSetting(key.to_string())),
    }

    Ok(())
}
```

> ⚠️ Kalau `cargo check` gagal karena `range.range()` bukan method yang valid di versi crate ini (nama/return type beda), JANGAN dihapus begitu saja validasinya — cari method yang setara (mis. `range.min()` + `range.max()` terpisah) dan sesuaikan. Kalau benar-benar tidak ada API untuk baca batas Range dari crate ini, minimal biarkan `parsed` tetap dikirim seperti kode lama, tapi catat di komentar bahwa validasi Range belum bisa dilakukan di level ini (beda dengan Radio yang WAJIB divalidasi karena itu satu-satunya tipe widget yang dipakai `iso`/`tv`/`av` di kamera ini).

### 1B.4 Efek ke frontend (tidak perlu ubah `camera.svelte.ts`)

`cameraStore.setSetting()` sudah menangkap error apa pun lewat `catch (err) { this.errorMessage = String(err); }` — begitu backend mengembalikan `GphotoError::InvalidChoice`, pesannya (via `#[error(...)]` di atas) otomatis berisi kalimat human-readable + daftar pilihan valid dari kamera yang sedang connect, langsung tampil di `cameraStore.errorMessage` tanpa kode tambahan di frontend.

### 1B.5 Definition of Done Phase 1B

```bash
cd src-tauri && cargo check
```
Build sukses. Lalu tes manual dengan kamera tercolok:
- Panggil `set_camera_setting` dengan value valid (mis. `iso = "800"`) → sukses, `gphoto2 --get-config iso` di terminal menunjukkan `Current: 800`.
- Panggil `set_camera_setting` dengan value **tidak valid** (mis. `iso = "12800"`, yang tidak ada di daftar kamera Canon EOS 1500D) → command mengembalikan error `InvalidChoice` berisi daftar pilihan valid kamera ini (`Auto, 100, 200, 400, 800, 1600, 3200, 6400`), **dan setting kamera tidak berubah** (`gphoto2 --get-config iso` tetap di nilai sebelumnya).
- Ulangi untuk `tv`/`shutterspeed` dan `av`/`aperture` dengan value di luar daftar masing-masing.

---

## Phase 2 — Frontend store: bungkus `detect_camera` di `src/lib/camera.svelte.ts`

Tambahkan state & method baru pada class `CameraStore` (jangan hapus/ubah method yang sudah ada):

```ts
export type DetectedCamera = { model: string; port: string };

class CameraStore {
  // ...state yang sudah ada tetap dipertahankan...

  detectedCameras = $state<DetectedCamera[]>([]);
  isDetecting = $state(false);
  detectError = $state<string | null>(null);

  /**
   * Deteksi kamera USB yang terpasang (setara `gphoto2 --auto-detect`).
   * Non-invasive — tidak membuka sesi kamera, aman dipanggil berulang (mis. tombol Refresh).
   */
  async detect() {
    this.isDetecting = true;
    this.detectError = null;
    try {
      this.detectedCameras = await invoke<DetectedCamera[]>("detect_camera");
    } catch (err) {
      this.detectError = String(err);
      this.detectedCameras = [];
    } finally {
      this.isDetecting = false;
    }
  }

  // ...method connect(), disconnect(), setSetting(), dst tetap sama persis...
}
```

**Definition of Done Phase 2**: `pnpm check` / `pnpm build` (sesuai script di `package.json`) tidak menghasilkan type error baru.

---

## Phase 3 — Ubah `ConfigDashboard.svelte`: ganti "Mode Hardware Kamera" jadi auto-detect

File: `src/lib/components/shared/ConfigDashboard.svelte`

### 3.1 Tambah import & state

Di bagian `<script>`, tambahkan:

```ts
import { goto } from '$app/navigation';
```

Tambahkan state baru (dekat deklarasi `syncStatus`, dst):

```ts
let fallbackMode = $state<'webcam' | 'demo' | null>(null); // null = mode default (coba USB)
```

Hapus/ubah `onMount` supaya deteksi otomatis jalan begitu halaman dibuka (selain `handleSync` yang sudah ada):

```ts
onMount(() => {
  boothName = uiConfig.config.boothName || boothName;
  void handleSync();
  void cameraStore.detect();       // <-- BARU: auto-detect begitu halaman dibuka
});
```

Tambahkan handler baru, taruh dekat fungsi `update()`:

```ts
async function handleConnectDetected() {
  fallbackMode = null;
  await update('cameraMode', 'usb'); // update() sudah memanggil cameraStore.connect('usb')
}

async function handleUseFallback(mode: 'webcam' | 'demo') {
  fallbackMode = mode;
  await update('cameraMode', mode);
}

function handleOpenManualSettings() {
  goto('/camera-manual-settings');
}
```

### 3.2 Hapus konstanta `CAMERA_MODES` (tidak dipakai lagi sebagai dropdown utama)

Boleh dihapus sepenuhnya, atau dipertahankan hanya untuk label fallback (opsional — lihat markup di bawah, label ditulis inline supaya lebih sederhana).

### 3.3 Ganti markup section "Mode Hardware Kamera" (baris ~462-493)

**Cari blok ini** (persis, termasuk komentar `<!-- Mode Kamera Baru (§1 Poin 3) -->`):

```svelte
            <!-- Mode Kamera Baru (§1 Poin 3) -->
            <div style="display: flex; flex-direction: column; gap: 5px;">
              <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em;">
                Mode Hardware Kamera
              </h1>
              <div style="position: relative;">
                <select
                  value={boothConfig.config.cameraMode}
                  onchange={(e) => update('cameraMode', e.currentTarget.value as 'usb' | 'webcam' | 'demo')}
                  style="
                    width: 100%;
                    appearance: none;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.inset};
                    border-radius: 12px;
                    padding: 10px 36px 10px 14px;
                    border: none;
                    outline: none;
                    font-size: 12px;
                    font-weight: 600;
                    color: #2a2873;
                    font-family: 'Poppins',sans-serif;
                    cursor: pointer;
                  "
                >
                  {#each CAMERA_MODES as m}
                    <option value={m.value}>{m.label}</option>
                  {/each}
                </select>
                <ChevronDown size={14} color="#94a3b8" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none;" />
              </div>
            </div>
```

**Ganti dengan blok ini:**

```svelte
            <!-- Mode Kamera: auto-detect via libgphoto2, bukan pilihan manual -->
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em; margin: 0;">
                  Kamera Terdeteksi (USB / libgphoto2)
                </h1>
                <button
                  type="button"
                  onclick={() => cameraStore.detect()}
                  disabled={cameraStore.isDetecting}
                  style="
                    font-size: 10px;
                    font-weight: 600;
                    color: #2a2873;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.btnSm};
                    border: none;
                    border-radius: 8px;
                    padding: 4px 10px;
                    cursor: pointer;
                  "
                >
                  {cameraStore.isDetecting ? 'Mendeteksi...' : 'Refresh'}
                </button>
              </div>

              {#if cameraStore.detectedCameras.length > 0}
                <!-- Kamera USB ketemu: tampilkan nama model langsung, seperti `gphoto2 --auto-detect` -->
                <div style="background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 12px; padding: 10px 14px; display: flex; flex-direction: column; gap: 4px;">
                  <span style="font-size: 12px; font-weight: 700; color: #16a34a;">
                    ✅ {cameraStore.detectedCameras[0].model}
                  </span>
                  <span style="font-size: 10px; color: #94a3b8; font-family: monospace;">
                    {cameraStore.detectedCameras[0].port}
                  </span>
                </div>

                {#if boothConfig.config.cameraMode === 'usb' && cameraStore.status === 'connected'}
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 11px; color: #16a34a; font-weight: 600; flex: 1;">Kamera aktif & terhubung</span>
                    <button
                      type="button"
                      onclick={handleOpenManualSettings}
                      style="
                        font-size: 11px; font-weight: 700; color: white;
                        background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY});
                        border: none; border-radius: 10px; padding: 8px 14px; cursor: pointer;
                      "
                    >
                      ⚙️ Atur ISO / Shutter / F
                    </button>
                  </div>
                {:else}
                  <button
                    type="button"
                    onclick={handleConnectDetected}
                    disabled={cameraStore.status === 'connecting'}
                    style="
                      font-size: 12px; font-weight: 700; color: white;
                      background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY});
                      border: none; border-radius: 12px; padding: 10px 14px; cursor: pointer;
                    "
                  >
                    {cameraStore.status === 'connecting' ? 'Menghubungkan...' : 'Hubungkan Kamera Ini'}
                  </button>
                {/if}
              {:else}
                <!-- Tidak ada DSLR terdeteksi via USB -->
                <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                  {cameraStore.isDetecting ? 'Mencari kamera via USB…' : 'Tidak ada kamera DSLR terdeteksi via USB.'}
                </p>
                {#if cameraStore.detectError}
                  <p style="font-size: 10px; color: #dc2626; margin: 0;">{cameraStore.detectError}</p>
                {/if}
                <div style="display: flex; gap: 8px;">
                  <button
                    type="button"
                    onclick={() => handleUseFallback('webcam')}
                    style="
                      flex: 1; font-size: 11px; font-weight: 600;
                      color: {boothConfig.config.cameraMode === 'webcam' ? '#2a2873' : '#64748b'};
                      background: {NEU_BG};
                      box-shadow: {boothConfig.config.cameraMode === 'webcam' ? neuCfg.inset : neuCfg.btnSm};
                      border: none; border-radius: 10px; padding: 8px 10px; cursor: pointer;
                    "
                  >
                    Gunakan Webcam Laptop
                  </button>
                  <button
                    type="button"
                    onclick={() => handleUseFallback('demo')}
                    style="
                      flex: 1; font-size: 11px; font-weight: 600;
                      color: {boothConfig.config.cameraMode === 'demo' ? '#2a2873' : '#64748b'};
                      background: {NEU_BG};
                      box-shadow: {boothConfig.config.cameraMode === 'demo' ? neuCfg.inset : neuCfg.btnSm};
                      border: none; border-radius: 10px; padding: 8px 10px; cursor: pointer;
                    "
                  >
                    Mode Demo
                  </button>
                </div>
              {/if}
            </div>
```

> Catatan gaya: blok di atas sengaja memakai pola style inline yang sama dengan sisa file ini (neumorphic `NEU_BG` / `neuCfg`) supaya konsisten secara visual. Jangan campur dengan Tailwind class di file ini.

**Definition of Done Phase 3**: Buka `/settings` → begitu halaman dimuat, badge "✅ <nama model>" muncul otomatis kalau kamera USB tercolok (tanpa klik apa pun), sama seperti hasil `gphoto2 --auto-detect` di terminal. Kalau kamera dicabut lalu klik "Refresh", badge hilang dan muncul fallback webcam/demo.

---

## Phase 4 — Halaman baru: `/camera-manual-settings` (2 panel: pengaturan + live preview)

### 4.1 Buat file `src/routes/camera-manual-settings/+page.svelte`

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { cameraStore } from '$lib/camera.svelte';

  let isoOptions = $state<string[]>([]);
  let currentIso = $state('');
  let tvOptions = $state<string[]>([]);
  let currentTv = $state('');
  let avOptions = $state<string[]>([]);
  let currentAv = $state('');

  let frameSrc = $state('');
  let liveviewInterval: ReturnType<typeof setInterval> | null = null;
  let loadError = $state<string | null>(null);

  onMount(async () => {
    // Halaman ini cuma valid kalau kamera USB sudah terhubung.
    // Kalau belum, lempar balik ke /settings supaya user connect dulu.
    if (cameraStore.status !== 'connected' || cameraStore.cameraMode !== 'usb') {
      goto('/settings');
      return;
    }

    try {
      const iso = await cameraStore.getSetting('iso');
      isoOptions = iso.ability ?? [];
      currentIso = iso.value ?? '';
    } catch (e) { loadError = String(e); }

    try {
      const tv = await cameraStore.getSetting('tv');
      tvOptions = tv.ability ?? [];
      currentTv = tv.value ?? '';
    } catch (e) { loadError = String(e); }

    try {
      const av = await cameraStore.getSetting('av');
      avOptions = av.ability ?? [];
      currentAv = av.value ?? '';
    } catch (e) { loadError = String(e); }

    await cameraStore.startLiveview();
    liveviewInterval = setInterval(async () => {
      const url = await cameraStore.getLiveviewFrame();
      if (url) frameSrc = url;
    }, 150);
  });

  onDestroy(() => {
    if (liveviewInterval) clearInterval(liveviewInterval);
    cameraStore.stopLiveview();
  });

  async function handleIsoChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    await cameraStore.setSetting('iso', value);
    currentIso = value;
  }

  async function handleTvChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    await cameraStore.setSetting('tv', value);
    currentTv = value;
  }

  async function handleAvChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    await cameraStore.setSetting('av', value);
    currentAv = value;
  }

  function handleBack() {
    goto('/settings');
  }
</script>

<div class="w-screen h-screen bg-neutral-950 text-white flex flex-col overflow-hidden">
  <div class="flex items-center gap-4 px-6 h-14 flex-shrink-0 border-b border-neutral-800">
    <button onclick={handleBack} class="text-sm text-neutral-400 hover:text-white">&larr; Kembali ke Pengaturan</button>
    <h1 class="text-sm font-semibold flex-1 text-center">
      Pengaturan Manual Kamera — {cameraStore.device?.manufacturer || cameraStore.device?.productname || 'DSLR'}
    </h1>
    <div class="w-32"></div>
  </div>

  {#if loadError}
    <p class="text-red-400 text-xs px-6 py-2">{loadError}</p>
  {/if}

  <!-- 2 Panel: kiri = kontrol, kanan = live preview -->
  <div class="flex-1 min-h-0 flex gap-4 p-4">
    <!-- Panel Kiri: Pengaturan -->
    <div class="w-80 flex-shrink-0 bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-5 overflow-y-auto">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-neutral-400">Pengaturan Eksposur</h2>

      {#if isoOptions.length > 0}
        <div class="flex flex-col gap-1">
          <label class="text-xs text-neutral-400" for="iso">ISO</label>
          <select id="iso" class="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm" value={currentIso} onchange={handleIsoChange}>
            {#each isoOptions as opt}<option value={opt}>{opt}</option>{/each}
          </select>
        </div>
      {/if}

      {#if tvOptions.length > 0}
        <div class="flex flex-col gap-1">
          <label class="text-xs text-neutral-400" for="tv">Shutter Speed (Tv)</label>
          <select id="tv" class="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm" value={currentTv} onchange={handleTvChange}>
            {#each tvOptions as opt}<option value={opt}>{opt}</option>{/each}
          </select>
        </div>
      {/if}

      {#if avOptions.length > 0}
        <div class="flex flex-col gap-1">
          <label class="text-xs text-neutral-400" for="av">Aperture (F)</label>
          <select id="av" class="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm" value={currentAv} onchange={handleAvChange}>
            {#each avOptions as opt}<option value={opt}>{opt}</option>{/each}
          </select>
        </div>
      {/if}

      {#if isoOptions.length === 0 && tvOptions.length === 0 && avOptions.length === 0 && !loadError}
        <p class="text-xs text-neutral-500">Memuat kemampuan kamera...</p>
      {/if}

      <p class="text-[10px] text-neutral-500 mt-auto">
        Perubahan diterapkan langsung ke kamera. Live preview di panel kanan otomatis
        menyesuaikan dalam &lt;1 detik setelah setiap perubahan.
      </p>
    </div>

    <!-- Panel Kanan: Live Preview -->
    <div class="flex-1 bg-black border border-neutral-800 rounded-xl flex items-center justify-center overflow-hidden relative">
      {#if frameSrc}
        <img src={frameSrc} alt="Live preview kamera" class="max-w-full max-h-full object-contain" />
      {:else}
        <p class="text-neutral-600 text-sm">Menunggu frame liveview...</p>
      {/if}
      <div class="absolute top-3 left-3 bg-black/60 text-[10px] px-2 py-1 rounded text-red-400 font-semibold tracking-wide">
        ● LIVE
      </div>
    </div>
  </div>
</div>
```

### 4.2 Kenapa live preview otomatis menyesuaikan tanpa kode tambahan

`setSetting()` langsung mengirim nilai baru ke kamera lewat `set_camera_setting` (Rust). Karena `liveviewInterval` sudah polling `get_liveview_frame` tiap 150ms secara terus-menerus (pola yang sama dipakai `V1Camera.svelte`), frame preview berikutnya yang diambil dari sensor otomatis sudah memakai ISO/Tv/Av yang baru — **tidak perlu logika refresh manual terpisah**.

### 4.3 Definition of Done Phase 4

1. Dari `/settings`, dengan kamera USB terhubung, klik "⚙️ Atur ISO / Shutter / F" → masuk ke `/camera-manual-settings`.
2. Panel kanan menampilkan gambar live dari sensor kamera (bukan gambar statis), update terus-menerus.
3. Ubah ISO/Tv/Av di panel kiri → dalam waktu singkat (maksimal ~1 detik, tergantung kecepatan kamera merespons `set_config`), preview di panel kanan terlihat berubah terang/gelap sesuai exposure baru.
4. Klik "Kembali ke Pengaturan" → liveview berhenti (`stopLiveview()` terpanggil, cek tidak ada request liveview yang masih jalan di background/log Rust) dan kembali ke `/settings` tanpa error.
5. Coba akses langsung URL `/camera-manual-settings` tanpa kamera terhubung → otomatis dilempar balik ke `/settings` (bukan crash/blank page).

---

## Phase 5 — Pengujian End-to-End

```bash
# 1. Pastikan kamera terdeteksi di level OS (baseline, sama seperti sebelumnya)
gphoto2 --auto-detect

# 2. Jalankan app dalam mode dev
pnpm tauri dev
```

Checklist manual:
- [ ] Buka `/settings` tanpa kamera tercolok → tampil "Tidak ada kamera DSLR terdeteksi via USB" + 2 tombol fallback (Webcam/Demo).
- [ ] Colok kamera, klik "Refresh" → badge model muncul sesuai persis nama yang tampil di `gphoto2 --auto-detect` (mis. `Canon EOS 1500D`).
- [ ] Klik "Hubungkan Kamera Ini" → status berubah jadi terhubung, tombol berganti jadi "⚙️ Atur ISO / Shutter / F".
- [ ] Buka halaman pengaturan manual, ubah ketiga parameter (ISO, Tv, Av) satu per satu, verifikasi preview berubah.
- [ ] Coba kirim value tidak valid langsung lewat `invoke('set_camera_setting', { key: 'iso', value: '12800' })` dari DevTools console (atau sementara ubah UI untuk mengetik bebas) → harus ditolak dengan pesan `InvalidChoice` berisi daftar pilihan valid kamera yang sedang connect, dan nilai ISO di kamera fisik tidak ikut berubah.
- [ ] Ulangi tes value tidak valid untuk `tv` (mis. `"1/9999"`) dan `av` (mis. `"f/1.0"` kalau kamera tidak punya bukaan itu).
- [ ] Pastikan `boothConfig.config.cameraMode` tetap tersimpan benar di localStorage (`booth_settings_<boothId>`) setelah pilih USB/webcam/demo, supaya auto-connect saat boot (`src/routes/+page.svelte`) tidak rusak.
- [ ] Regresi: pastikan flow capture foto normal (`V1Camera.svelte`, `runCaptureSequence`) masih berfungsi seperti biasa — Phase ini tidak boleh mengubah command `capture_photo`, `start_liveview`, `get_liveview_frame` yang sudah ada.

**Definition of Done keseluruhan**: semua checklist di atas centang, `cargo check` dan `pnpm check` bersih, dan halaman `/camera-config` (dipakai dari `/session`) tidak ikut berubah/rusak karena dokumen ini sengaja tidak menyentuhnya.

---

## Phase 6 — Simpan & Auto-Restore Preset ISO/Tv/Av per Model Kamera ke SQLite

> **Kenapa di-key per `model`, bukan satu baris global**: Phase 1B sudah menetapkan bahwa pilihan valid ISO/Tv/Av **berbeda per model kamera**. Kalau preset disimpan sebagai satu baris global (`id = 1`), ganti body kamera akan diam-diam menimpa preset kamera lain. Dengan `model` sebagai primary key, tiap kamera yang pernah dipakai punya presetnya sendiri, dan validasi Phase 1B tetap jadi jaring pengaman kalau preset lama kebetulan tidak valid lagi di kamera yang sekarang tersambung (mis. lensa/body beda).
>
> **Kenapa TIDAK pakai command Rust baru**: project ini sudah punya pola baku akses SQLite langsung dari frontend lewat `@tauri-apps/plugin-sql` (lihat `src/lib/db/local.ts` — `Database.load("sqlite:app.db")` + `conn.execute()`/`conn.select()`). Semua tabel lain (`booth_activation`, `api_cache`, `asset_cache`) diakses dengan pola ini, **tanpa** `#[tauri::command]` perantara. Ikuti pola yang sama supaya konsisten — jangan bikin command Rust baru untuk sekadar CRUD SQL.

### 6.1 Tambah migration baru di `src-tauri/src/lib.rs`

**Jangan** ubah migration versi 1-4 yang sudah ada. Tambahkan sebagai **versi 5** di akhir vector `migrations`:

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
},
```

`model` dipakai sebagai `PRIMARY KEY` (bukan `id INTEGER` auto increment) — satu baris per model kamera, di-upsert tiap kali user simpan preset untuk model itu.

### 6.2 Tambah fungsi akses DB di `src/lib/db/local.ts` (pola sama seperti `saveActivation`/`getActivation`)

Tambahkan di akhir file, jangan bikin file terpisah supaya semua akses `db()` (koneksi yang sama, sudah di-cache lewat `dbPromise`) tetap satu titik:

```ts
// ============================================================================
// CAMERA PRESET (SQLite `camera_presets`) — ISO/Tv/Av tersimpan per model kamera
// ============================================================================

export interface CameraPreset {
  model: string;
  iso: string;
  shutterSpeed: string;
  aperture: string;
  updatedAt: string;
}

export async function saveCameraPreset(
  model: string,
  iso: string,
  shutterSpeed: string,
  aperture: string,
): Promise<void> {
  const conn = await db();
  await conn.execute(
    `INSERT INTO camera_presets (model, iso, shutter_speed, aperture, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (model) DO UPDATE SET
       iso = $2, shutter_speed = $3, aperture = $4, updated_at = $5`,
    [model, iso, shutterSpeed, aperture, new Date().toISOString()],
  );
}

export async function getCameraPreset(model: string): Promise<CameraPreset | null> {
  try {
    const conn = await db();
    const rows = await conn.select<any[]>(
      "SELECT * FROM camera_presets WHERE model = $1",
      [model],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      model: r.model,
      iso: r.iso,
      shutterSpeed: r.shutter_speed,
      aperture: r.aperture,
      updatedAt: r.updated_at,
    };
  } catch (e) {
    console.warn("Gagal membaca camera_presets:", e);
    return null;
  }
}
```

> Catatan: `model` yang dipakai sebagai key harus konsisten dengan nilai yang tampil di badge deteksi Phase 3 (`cameraStore.detectedCameras[0].model`, hasil `list_cameras()`), **bukan** `cameraStore.device?.manufacturer` (field itu diisi dari `abilities.model()` di `gphoto::connect()` — nilainya *seharusnya* sama, tapi verifikasi langsung di mesin dev dengan `console.log` sebelum dipakai sebagai key, karena representasi string dari dua sumber ini kadang beda spasi/kapitalisasi tergantung driver).

### 6.3 Auto-restore: taruh di `cameraStore.connect()`, BUKAN di `ConfigDashboard.svelte`

Ini satu-satunya cara restore konsisten jalan dari semua jalur koneksi (boot otomatis di `src/routes/+page.svelte`, tombol di `ConfigDashboard`, maupun link dari `/camera-config`). Ubah method `connect()` di `src/lib/camera.svelte.ts`:

```ts
import { getCameraPreset } from "$lib/db/local";

// ...

async connect(mode: "usb" | "webcam" | "demo" = "usb") {
  this.status = "connecting";
  this.errorMessage = null;
  this.cameraMode = mode;

  if (mode === "usb") {
    try {
      this.device = await invoke<DeviceInfo>("connect_camera");
      this.status = "connected";

      // Auto-restore preset ISO/Tv/Av terakhir untuk model kamera INI SAJA.
      // setSetting() sudah menangkap error apa pun secara diam-diam (lihat
      // implementasinya di bawah) — kalau preset lama tidak valid lagi
      // (mis. lensa beda), Phase 1B (InvalidChoice) akan menolaknya dan
      // kamera tetap di nilai bawaannya sendiri, tidak crash.
      const model = this.device?.manufacturer ?? this.device?.productname;
      if (model) {
        const preset = await getCameraPreset(model);
        if (preset) {
          await this.setSetting("iso", preset.iso);
          await this.setSetting("tv", preset.shutterSpeed);
          await this.setSetting("av", preset.aperture);
        }
      }
    } catch (err) {
      this.status = "error";
      this.errorMessage = String(err);
    }
  } else if (mode === "webcam") {
    // ...tidak berubah...
```

Tidak perlu try/catch tambahan di sekitar tiga `setSetting()` di atas — method itu sudah menelan error-nya sendiri (`catch (err) { this.errorMessage = String(err); }`) dan tidak melempar ulang. Yang perlu disadari: kalau ketiganya gagal berurutan, `errorMessage` cuma akan berisi pesan dari kegagalan yang **terakhir** (yang sebelumnya tertimpa). Ini cukup untuk fase ini — jangan dulu bikin array error terpisah untuk hal sekecil ini kecuali user memang butuh detail tiap parameter.

### 6.4 Tombol "Simpan sebagai Default" di `/camera-manual-settings/+page.svelte`

Tambahkan di bagian bawah panel kiri (menggantikan paragraf catatan yang sudah ada di Phase 4, atau taruh di atasnya):

```ts
import { saveCameraPreset } from '$lib/db/local';

let saveStatus = $state<string | null>(null); // pola sama seperti syncStatus di ConfigDashboard

async function handleSaveAsDefault() {
  const model = cameraStore.device?.manufacturer ?? cameraStore.device?.productname;
  if (!model) return;
  try {
    await saveCameraPreset(model, currentIso, currentTv, currentAv);
    saveStatus = 'Tersimpan sebagai default untuk ' + model;
  } catch (e) {
    saveStatus = 'Gagal menyimpan: ' + String(e);
  }
  setTimeout(() => { saveStatus = null; }, 3000);
}
```

```svelte
<button
  onclick={handleSaveAsDefault}
  class="mt-2 bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 text-xs font-medium transition"
>
  Simpan sebagai Default
</button>
{#if saveStatus}
  <p class="text-[10px] text-neutral-400">{saveStatus}</p>
{/if}
```

Pola pesan sementara (`saveStatus` + `setTimeout` 3 detik) sengaja meniru `syncStatus` yang sudah ada di `ConfigDashboard.svelte` — **jangan** menambah library toast baru, project ini belum punya satu pun dan tidak butuh dependency tambahan untuk kasus sesederhana ini.

### 6.5 Definition of Done Phase 6

- [ ] `cargo check` sukses, `sqlite:app.db` punya tabel baru `camera_presets` setelah `pnpm tauri dev` pertama kali dijalankan (migration versi 5 otomatis jalan).
- [ ] Set ISO=800, Tv=1/125, Av=8 di `/camera-manual-settings`, klik "Simpan sebagai Default" → baris baru/ter-update muncul di `camera_presets` dengan `model` sesuai kamera yang tersambung (cek lewat `sqlite3 app.db "select * from camera_presets;"` di lokasi app data dir).
- [ ] Disconnect kamera (cabut USB / klik "Putuskan Koneksi"), colok ulang, klik "Hubungkan Kamera Ini" dari `/settings` → ISO/Tv/Av otomatis kembali ke 800/1/125/8 **tanpa** buka halaman manual settings dulu (cek lewat `gphoto2 --get-config iso` dkk di terminal, harus menunjukkan `Current: 800` dst).
- [ ] Matikan & nyalakan ulang aplikasi (`pnpm tauri dev` lagi), colok kamera yang sama → preset tetap ter-restore (bukti data persisten di SQLite, bukan cuma di memory `$state`).
- [ ] Simulasikan preset "basi": simpan preset dengan `iso = "6400"`, lalu edit baris di DB langsung jadi `iso = "999999"` (nilai yang pasti tidak valid), sambungkan ulang kamera → Phase 1B (`InvalidChoice`) menolak nilai itu, kamera tetap di ISO bawaannya sendiri, **aplikasi tidak crash**, `cameraStore.errorMessage` terisi pesan yang jelas.
- [ ] Regresi: alur boot normal (`src/routes/+page.svelte` → `cameraStore.connect(boothConfig.config.cameraMode)`) tetap jalan seperti biasa untuk mode `webcam`/`demo` (tidak ikut coba baca preset, karena blok restore cuma ada di cabang `mode === "usb"`).