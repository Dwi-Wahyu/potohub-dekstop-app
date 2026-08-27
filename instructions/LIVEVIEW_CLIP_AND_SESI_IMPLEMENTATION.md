# Instruksi Implementasi — Live View Clip per Slot + GIF Sesi + Perbaikan Upload Gallery

**Repo target:** `photobooth-dekstop-app` (Tauri v2 + SvelteKit 2 + Svelte 5, mode kamera `usb`/`webcam`/`demo`)
**Untuk siapa dokumen ini:** agen CLI (Claude Code / Gemini CLI) yang akan mengeksekusi perubahan.
**Konteks:** lanjutan dari diskusi sebelumnya — API (`api-context`) sudah lengkap (`MediaType::Photo/Thumbnail/Video/Gif`, endpoint `gallery/upload-url` presign R2, `gallery/upload` register metadata). **Tidak perlu ubah backend Rust API.** Semua pekerjaan di dokumen ini ada di sisi `desktop-app-context`.

---

## 0. Rekap keputusan desain & scope

Dari diskusi sebelumnya, dua aset baru yang mau disimpan per sesi **berbeda sifat, jangan digabung logikanya**:

| Aset                        | Sumber                                                                                                                                                                                                                               | Kompleksitas                                                | MediaType |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------- |
| **GIF sesi**                | Gabungan foto-foto final yang sudah diambil (`boothFlow.photosTaken`) — cukup animasi loop dari frame statis                                                                                                                         | Rendah — tidak butuh rekaman kamera tambahan                | `Gif`     |
| **Live view clip per slot** | Rekaman singkat dari live view kamera **di sekitar momen capture tiap slot**, lalu digabung sesuai layout template jadi satu video (mirip sample `footoo` yang sudah dicek: tiap slot template memutar klip pendek, bukan foto diam) | Tinggi — butuh rolling buffer live view + video compositing | `Video`   |

Window rekaman per slot: **t_capture − 1 s** s/d **t_capture + 1.5 s** (total ±2.5 detik), dikonfigurasi lewat `boothConfig` (§2), bukan hardcode. `t_capture` = saat `capture_photo` benar-benar dipanggil (countdown = 0), **bukan** saat countdown mulai — sudah dibahas & divisualisasikan di sesi sebelumnya.

Kenapa harus rolling buffer (bukan "mulai rekam saat countdown = 2"): kamu tidak bisa mundur waktu untuk ambil beberapa detik **sebelum** trigger tanpa sudah merekam duluan. Live view harus terus mengalir ke buffer memori sejak `startLiveview()`, baru dipotong jadi klip saat capture terjadi.

### Urutan pengerjaan (blocking — jangan lompat)

1. **§1** — Perbaiki alur upload (bug: `V1Complete.svelte` kirim `data:` URL base64 langsung sebagai `file_url`, bukan upload byte asli ke R2). Ini blocker karena semua aset baru (GIF, video, foto mentah) butuh jalur upload yang benar.
2. **§2** — Tambah field config baru.
3. **§3–§5** — Rolling buffer live view per mode kamera (`webcam`, `usb`, `demo`).
4. **§6–§7** — Potong klip per slot saat capture terjadi, simpan di store.
5. **§8** — Assemble GIF (Rust, `image` crate — tidak perlu dependency baru) dan video composite per-template (ffmpeg sidecar — dependency baru).
6. **§9–§10** — Upload semua aset di akhir sesi, wire ke V1/V2/V3.
7. **§11** — Checklist verifikasi.

---

## 1. 🔴 PRIORITAS TERTINGGI — Perbaiki alur upload media

### Masalah

`src/lib/api/boothClient.ts` fungsi `uploadSessionMedia` mengirim `file_url` langsung ke `POST /gallery/upload` — tapi di `V1Complete.svelte` baris 82–89, nilai yang dikirim adalah `compositeUrl`, yaitu **data URL base64 hasil `canvas.toDataURL()`**, bukan URL R2. Endpoint presign (`request_upload_url` di `gallery.rs`) sudah ada di backend dan **sama sekali tidak dipanggil** dari desktop app.

Selain itu, `V2Session.svelte` dan (kemungkinan besar) `V3Session.svelte` **tidak pernah memanggil `uploadSessionMedia` sama sekali** — foto mentah dari `boothFlow.photosTaken` tidak pernah tersimpan ke gallery.

### Perbaikan

**a. Tambah 2 fungsi baru di `src/lib/api/boothClient.ts`**, taruh tepat sebelum `uploadSessionMedia` yang sudah ada:

```ts
export type GalleryFileType = "photo" | "thumbnail" | "video" | "gif";

interface RequestUploadUrlResponse {
  upload_url: string;
  file_url: string;
  object_key: string;
  expires_in: number;
}

export async function requestUploadUrl(
  boothId: string,
  sessionId: string,
  fileType: GalleryFileType,
  fileExtension: string,
  contentType: string,
): Promise<RequestUploadUrlResponse> {
  const res = await fetch(`${API_BASE}/booths/${boothId}/gallery/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      file_type: fileType,
      file_extension: fileExtension,
      content_type: contentType,
    }),
  });
  if (!res.ok) throw new Error("Gagal request presigned upload URL");
  return res.json();
}

/**
 * Upload 1 aset biner (foto/gif/video) ke R2 via presigned PUT, lalu register
 * metadata-nya ke database. Menerima Blob atau data: URL (akan dikonversi ke Blob).
 */
export async function uploadGalleryAsset(
  boothId: string,
  sessionId: string,
  fileType: GalleryFileType,
  blobOrDataUrl: Blob | string,
  fileExtension: string,
  contentType: string,
  width: number,
  height: number,
) {
  const blob =
    typeof blobOrDataUrl === "string"
      ? await (await fetch(blobOrDataUrl)).blob()
      : blobOrDataUrl;

  const { upload_url, file_url } = await requestUploadUrl(
    boothId,
    sessionId,
    fileType,
    fileExtension,
    contentType,
  );

  const putRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!putRes.ok)
    throw new Error(`Gagal PUT ${fileType} ke R2 (status ${putRes.status})`);

  return uploadSessionMedia(
    boothId,
    sessionId,
    file_url,
    fileType,
    width,
    height,
    blob.size,
  );
}
```

`uploadSessionMedia` yang sudah ada **tetap dipertahankan apa adanya** (dipanggil oleh `uploadGalleryAsset` di atas) — dia sudah benar untuk step "register metadata", masalahnya cuma dipanggil dengan `file_url` yang salah.

**b. Ganti pemanggilan di `V1Complete.svelte`** (baris ~81–90): ganti `uploadSessionMedia(...)` untuk composite jadi:

```ts
if (compositeUrl) {
  await uploadGalleryAsset(
    boothId,
    sessId,
    "photo",
    compositeUrl,
    "jpg",
    "image/jpeg",
    selectedTemplate?.width || 1200,
    selectedTemplate?.height || 1800,
  );
}
```

**c. `V2Session.svelte` / `V3Session.svelte` tidak upload apa-apa** — perbaikan lengkap alur upload akhir sesi (foto mentah + composite + gif + video) dipindahkan ke fungsi bersama `saveSessionAssets()` di §9, supaya tidak dobel-implementasi per variant. Untuk sekarang cukup pastikan `import { uploadGalleryAsset, requestUploadUrl }` tersedia; pemanggilan aktual menyusul di §9–§10.

---

## 2. Tambah field konfigurasi booth baru

Edit `src/lib/stores/boothConfig.svelte.ts`:

```ts
export interface BoothCfg {
  // ...field yang sudah ada, jangan dihapus
  liveviewClipPreSecs: number;
  liveviewClipPostSecs: number;
  enableLiveviewVideo: boolean;
  enableSessionGif: boolean;
}

export const DEFAULT_CFG: BoothCfg = {
  // ...field yang sudah ada
  liveviewClipPreSecs: 1.0,
  liveviewClipPostSecs: 1.5,
  enableLiveviewVideo: true,
  enableSessionGif: true,
};
```

Field ini nanti ditampilkan sebagai toggle/slider baru di `V1ConfigDashboard.svelte` (opsional, tidak wajib untuk MVP fitur ini — boleh dikerjakan belakangan).

---

## 3. Rolling buffer live view — mode `webcam`

Mode ini paling mudah karena `this.stream` sudah berupa `MediaStream` asli, bisa langsung dipakai `MediaRecorder`.

Edit `src/lib/camera.svelte.ts`:

```ts
class CameraStore {
  // ...field yang sudah ada
  private recorder: MediaRecorder | null = null;
  private clipChunks: { blob: Blob; timestamp: number }[] = [];
  private readonly RING_BUFFER_MS = 8000; // buang chunk lebih tua dari ini

  // panggil di dalam startLiveview(), branch `webcam`, SETELAH `this.stream = stream;`
  private startWebcamRecorder(stream: MediaStream) {
    this.clipChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';
    this.recorder = new MediaRecorder(stream, { mimeType });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.clipChunks.push({ blob: e.data, timestamp: Date.now() });
        const cutoff = Date.now() - this.RING_BUFFER_MS;
        this.clipChunks = this.clipChunks.filter((c) => c.timestamp >= cutoff);
      }
    };
    this.recorder.start(250); // timeslice 250ms -> banyak chunk kecil bertimestamp
  }

  private stopWebcamRecorder() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null;
    this.clipChunks = [];
  }

  /**
   * Dipanggil dari runCaptureSequence() tepat setelah shutter/capture terjadi.
   * Menunggu `postSecs` detik supaya buffer terisi window "setelah" capture,
   * lalu potong chunk yang timestamp-nya masuk window dan gabung jadi 1 Blob webm.
   */
  async extractLiveviewClip(captureTs: number, preSecs: number, postSecs: number): Promise<Blob | null> {
    if (this.cameraMode !== 'webcam') return this.extractLiveviewClipNonWebcam(captureTs, preSecs, postSecs);
    await new Promise((r) => setTimeout(r, postSecs * 1000 + 150)); // tunggu window "post" terisi
    const from = captureTs - preSecs * 1000;
    const to = captureTs + postSecs * 1000;
    const parts = this.clipChunks.filter((c) => c.timestamp >= from && c.timestamp <= to).map((c) => c.blob);
    if (parts.length === 0) return null;
    return new Blob(parts, { type: 'video/webm' });
  }
```

Panggil `this.startWebcamRecorder(stream)` di `startLiveview()` setelah `this.stream = stream` (mode `webcam`), dan `this.stopWebcamRecorder()` di `stopLiveview()`/`disconnect()` sejajar dengan `this.stream.getTracks().forEach(t => t.stop())`.

> Catatan: hasil `extractLiveviewClip` untuk mode webcam berformat **webm**, bukan mp4 — cukup untuk disimpan sebagai `MediaType::Video` apa adanya (browser modern & sebagian besar viewer memutar webm). Kalau butuh mp4 seragam lintas mode, tambahkan transcode via ffmpeg sidecar (§8) sebagai langkah opsional terakhir, bukan requirement MVP.

---

## 4. Rolling buffer live view — mode `usb` (gphoto2, Rust)

gphoto2 tidak expose stream video, cuma `get_liveview_frame()` per JPEG (lihat `gphoto.rs` baris 144–154, dipanggil dari frontend tiap 150ms). Jadi buffer-nya harus di sisi Rust: simpan tiap frame + timestamp di `AppState`, jangan langsung dibuang seperti sekarang (`cleanupLiveviewUrl()` di frontend cuma revoke object URL, bukan menyimpan histori).

### 4.1 `src-tauri/src/gphoto.rs` — tambah struct buffer

```rust
use std::collections::VecDeque;
use std::time::{SystemTime, UNIX_EPOCH};

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
        Self { frames: VecDeque::new(), max_age_ms }
    }

    pub fn push(&mut self, data: Vec<u8>) {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
        self.frames.push_back(LiveviewFrame { data, timestamp_ms: now });
        let cutoff = now.saturating_sub(self.max_age_ms);
        while let Some(front) = self.frames.front() {
            if front.timestamp_ms < cutoff { self.frames.pop_front(); } else { break; }
        }
    }

    /// Ambil semua frame dalam window [capture_ts - pre_ms, capture_ts + post_ms]
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
```

### 4.2 `src-tauri/src/lib.rs` — ubah `AppState`, tambah command

```rust
pub struct AppState {
    pub camera: Mutex<Option<Camera>>,
    pub liveview_buffer: Mutex<gphoto::LiveviewBuffer>, // BARU
}
```

Di `run()`, ganti `.manage(AppState { camera: Mutex::new(None) })` jadi:

```rust
.manage(AppState {
    camera: Mutex::new(None),
    liveview_buffer: Mutex::new(gphoto::LiveviewBuffer::new(8000)), // buffer 8 detik
})
```

Ubah `get_liveview_frame` supaya sekaligus mendorong frame ke buffer (dipanggil tiap 150ms dari frontend, jadi tidak perlu background task terpisah):

```rust
#[tauri::command]
async fn get_liveview_frame(state: State<'_, AppState>) -> Result<Vec<u8>, GphotoError> {
    let guard = state.camera.lock().await;
    let camera = guard.as_ref().ok_or(GphotoError::NotConnected)?;
    let bytes = gphoto::get_liveview_frame(camera).await?;
    state.liveview_buffer.lock().await.push(bytes.clone());
    Ok(bytes)
}
```

Tambah command baru untuk ekstraksi window (return list of JPEG bytes, biar frontend/`capture.ts` yang memutuskan mau diapakan — encode jadi video ditangani terpisah di §8 supaya `get_liveview_clip_frames` tetap ringan):

```rust
#[tauri::command]
async fn get_liveview_clip_frames(
    state: State<'_, AppState>,
    capture_ts_ms: u64,
    pre_ms: u64,
    post_ms: u64,
) -> Result<Vec<Vec<u8>>, GphotoError> {
    let buf = state.liveview_buffer.lock().await;
    Ok(buf.extract_window(capture_ts_ms as u128, pre_ms as u128, post_ms as u128))
}

#[tauri::command]
async fn clear_liveview_buffer(state: State<'_, AppState>) -> Result<(), GphotoError> {
    state.liveview_buffer.lock().await.frames.clear();
    Ok(())
}
```

Daftarkan keduanya di `tauri::generate_handler![...]` (sejajar dengan `get_liveview_frame`).

> Kenapa `capture_ts_ms` dikirim dari frontend, bukan diambil sendiri oleh Rust: momen "capture" ditentukan oleh alur UI (`runCaptureSequence` di `capture.ts`, saat countdown = 0), Rust tidak tahu kapan itu terjadi kecuali dikasih tahu.

### 4.3 `src/lib/camera.svelte.ts` — wrapper untuk mode `usb`

Tambahkan branch di `extractLiveviewClipNonWebcam` (fungsi baru yang dipanggil dari §3 untuk mode selain webcam):

```ts
private async extractLiveviewClipNonWebcam(
  captureTs: number,
  preSecs: number,
  postSecs: number
): Promise<Blob | null> {
  if (this.cameraMode === 'usb') {
    await new Promise((r) => setTimeout(r, postSecs * 1000 + 150));
    const frames = await invoke<number[][]>('get_liveview_clip_frames', {
      captureTsMs: captureTs,
      preMs: Math.round(preSecs * 1000),
      postMs: Math.round(postSecs * 1000),
    });
    if (!frames.length) return null;
    // Kirim raw JPEG frames ke Rust untuk di-encode jadi mp4 via ffmpeg sidecar (§8),
    // bukan digabung di sini — encoding video bukan pekerjaan main thread JS.
    const encoded = await invoke<number[]>('encode_jpeg_frames_to_video', {
      frames,
      fps: 8,
    });
    return new Blob([new Uint8Array(encoded)], { type: 'video/mp4' });
  }
  if (this.cameraMode === 'demo') {
    return this.extractDemoLiveviewClip();
  }
  return null;
}
```

(Command `encode_jpeg_frames_to_video` didefinisikan di §8.3.)

---

## 5. Mode `demo` — stub sederhana

Tidak perlu buffer sungguhan, cukup generate klip pendek dari canvas (mirip `getDemoLiveviewFrame` yang sudah ada) supaya UI & upload pipeline bisa ditest tanpa kamera fisik:

```ts
private async extractDemoLiveviewClip(): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 480;
  const ctx = canvas.getContext('2d')!;
  const stream = canvas.captureStream(10);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });
  recorder.start();
  const start = Date.now();
  const draw = () => {
    ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = '#3b82f6';
    const t = Date.now() * 0.005;
    ctx.beginPath(); ctx.arc(320 + Math.sin(t) * 80, 240, 30, 0, Math.PI * 2); ctx.fill();
    if (Date.now() - start < 2500) requestAnimationFrame(draw); else recorder.stop();
  };
  draw();
  return done;
}
```

---

## 6. `capture.ts` — potong klip per slot saat capture terjadi

Edit `src/lib/utils/capture.ts`, panggil ekstraksi klip **tanpa `await` blocking urutan foto berikutnya** (biar sesi tidak lambat 2.5 detik per slot) — tapi tetap tunggu semua promise sebelum lanjut ke slot berikutnya via `Promise.allSettled` di akhir, supaya urutan `photosTaken[i]` <-> `liveviewClips[i]` tetap sinkron per index:

```ts
import { boothConfig } from "$lib/stores/boothConfig.svelte";

export async function runCaptureSequence(
  slotCount: number,
  countdownSecs: number,
  onCapturePhoto?: (photoUrl: string) => void,
) {
  const clipPromises: Promise<void>[] = [];

  for (let i = 0; i < slotCount; i++) {
    for (let c = countdownSecs; c > 0; c--) {
      boothFlow.countdown = c;
      await new Promise((r) => setTimeout(r, 1000));
    }
    boothFlow.countdown = null;
    const captureTs = Date.now(); // t=0 untuk window klip — SEBELUM shutter, seakurat mungkin

    boothFlow.isFlashActive = true;
    setTimeout(() => {
      boothFlow.isFlashActive = false;
    }, 300);

    try {
      const bytes = await cameraStore.capture();
      const slotIndex = i;
      if (bytes) {
        const blob = new Blob([bytes], { type: "image/jpeg" });
        const photoUrl = URL.createObjectURL(blob);
        boothFlow.photosTaken = [...boothFlow.photosTaken, photoUrl];
        if (onCapturePhoto) onCapturePhoto(photoUrl);
      } else {
        // ...fallback canvas yang sudah ada, tidak berubah
      }

      if (boothConfig.config.enableLiveviewVideo) {
        clipPromises.push(
          cameraStore
            .extractLiveviewClip(
              captureTs,
              boothConfig.config.liveviewClipPreSecs,
              boothConfig.config.liveviewClipPostSecs,
            )
            .then((clipBlob) => {
              const clipUrl = clipBlob ? URL.createObjectURL(clipBlob) : null;
              const next = [...boothFlow.liveviewClips];
              next[slotIndex] = clipUrl;
              boothFlow.liveviewClips = next;
            })
            .catch((err) =>
              console.error("Gagal ekstrak liveview clip slot", slotIndex, err),
            ),
        );
      }
    } catch (err) {
      console.error("Capture error:", err);
    }
  }

  // Tunggu semua ekstraksi klip selesai sebelum sesi dianggap "selesai foto"
  await Promise.allSettled(clipPromises);
}
```

> Penting: `boothFlow.liveviewClips[i]` diisi lewat index eksplisit (`next[slotIndex] = ...`), bukan `push`, karena ekstraksi klip berjalan async di background sementara slot berikutnya mungkin sudah mulai — tanpa ini urutan array bisa kacau kalau ada klip yang gagal/telat.

---

## 7. `booth.svelte.ts` — tambah state baru

```ts
class BoothFlowStore {
  // ...field yang sudah ada
  liveviewClips = $state<(string | null)[]>([]); // blob URL video per slot, index selaras photosTaken

  reset() {
    // ...reset field yang sudah ada
    this.liveviewClips = [];
  }
}
```

---

## 8. Assemble aset akhir sesi: GIF & Video composite

### 8.1 GIF sesi — cukup gabungan foto, TIDAK butuh ffmpeg

Karena `Cargo.toml` sudah punya dependency `image = "0.25"`, pakai `image::codecs::gif::GifEncoder` — tidak perlu tambah dependency baru untuk fitur ini.

Tambah command baru di `src-tauri/src/lib.rs` (atau file baru `src-tauri/src/media.rs` kalau mau dipisah — rekomendasi: file baru, supaya `lib.rs` tidak makin gemuk):

```rust
// src-tauri/src/media.rs
use image::codecs::gif::GifEncoder;
use image::{Frame, ImageBuffer, Rgba};
use std::io::Cursor;

#[tauri::command]
pub async fn encode_photos_to_gif(
    photos: Vec<Vec<u8>>, // tiap elemen: bytes JPEG satu foto, urutan = urutan slot
    frame_delay_ms: u32,
) -> Result<Vec<u8>, String> {
    let mut buf: Vec<u8> = Vec::new();
    {
        let mut encoder = GifEncoder::new(Cursor::new(&mut buf));
        for jpeg_bytes in photos {
            let img = image::load_from_memory(&jpeg_bytes).map_err(|e| e.to_string())?;
            let resized = img.resize(480, 720, image::imageops::FilterType::Lanczos3); // kecilkan supaya file GIF tidak raksasa
            let rgba: ImageBuffer<Rgba<u8>, Vec<u8>> = resized.to_rgba8();
            let frame = Frame::from_parts(rgba, 0, 0, image::Delay::from_saturating_duration(
                std::time::Duration::from_millis(frame_delay_ms as u64),
            ));
            encoder.encode_frame(frame).map_err(|e| e.to_string())?;
        }
    }
    Ok(buf)
}
```

Daftarkan di `mod media;` + `media::encode_photos_to_gif` pada `invoke_handler`.

Frontend, `src/lib/utils/gif.ts` (baru):

```ts
import { invoke } from "@tauri-apps/api/core";

export async function buildSessionGif(
  photoUrls: string[],
  frameDelayMs = 500,
): Promise<Blob> {
  const photoBytes: number[][] = [];
  for (const url of photoUrls) {
    const buf = await (await fetch(url)).arrayBuffer();
    photoBytes.push(Array.from(new Uint8Array(buf)));
  }
  const gifBytes = await invoke<number[]>("encode_photos_to_gif", {
    photos: photoBytes,
    frameDelayMs,
  });
  return new Blob([new Uint8Array(gifBytes)], { type: "image/gif" });
}
```

### 8.2 Video composite per-template — butuh ffmpeg sidecar

Ini bagian yang menghasilkan output setara sample `footoo` (tiap slot memutar klip pendek pada posisi & ukuran sesuai `design_data`, digabung jadi satu mp4, loop).

**a. Tambah ffmpeg sebagai Tauri sidecar** (tidak ada di project saat ini — perlu ditambahkan):

- Download binary ffmpeg static per-platform (Windows/Linux/macOS), taruh di `src-tauri/binaries/ffmpeg-<target-triple>` mengikuti [konvensi sidecar Tauri v2](https://tauri.app/develop/sidecar/) (nama file harus persis `ffmpeg-x86_64-pc-windows-msvc.exe`, `ffmpeg-x86_64-unknown-linux-gnu`, dst — cek target triple aktual dengan `rustc -Vv` di masing-masing mesin build).
- Tambah plugin: `cargo add tauri-plugin-shell` dan `pnpm add @tauri-apps/plugin-shell`.
- `src-tauri/tauri.conf.json`, tambah di dalam `"bundle"`:
  ```json
  "bundle": {
    "active": true,
    "targets": "all",
    "externalBin": ["binaries/ffmpeg"],
    "icon": [ /* ...tidak berubah... */ ]
  }
  ```
- `src-tauri/capabilities/default.json`, tambah permission `shell:allow-execute` untuk sidecar `ffmpeg` (ikuti format capabilities Tauri v2 yang sudah dipakai untuk `tauri-plugin-sql` di file yang sama).
- `src-tauri/src/lib.rs`, tambah `.plugin(tauri_plugin_shell::init())` di builder chain.

**b. Command `encode_jpeg_frames_to_video`** (dipakai §4.3, mode `usb` — gabungkan sequence JPEG frame liveview jadi 1 klip mp4 pendek per slot):

```rust
// src-tauri/src/media.rs
use tauri_plugin_shell::ShellExt;
use std::io::Write;

#[tauri::command]
pub async fn encode_jpeg_frames_to_video(
    app: tauri::AppHandle,
    frames: Vec<Vec<u8>>,
    fps: u32,
) -> Result<Vec<u8>, String> {
    let tmp_dir = std::env::temp_dir().join(format!("liveview_clip_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    for (i, frame) in frames.iter().enumerate() {
        let path = tmp_dir.join(format!("f_{:04}.jpg", i));
        std::fs::File::create(&path).and_then(|mut f| f.write_all(frame)).map_err(|e| e.to_string())?;
    }
    let out_path = tmp_dir.join("clip.mp4");

    let sidecar = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?;
    let output = sidecar
        .args([
            "-y", "-framerate", &fps.to_string(),
            "-i", tmp_dir.join("f_%04d.jpg").to_str().unwrap(),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            out_path.to_str().unwrap(),
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let bytes = std::fs::read(&out_path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&tmp_dir);
    Ok(bytes)
}
```

**c. Command `compose_template_video`** — gabungkan klip per-slot (webm dari webcam, atau mp4 dari usb, hasil §3/§4) ke posisi masing-masing sesuai `design_data`, output 1 video final:

```rust
#[tauri::command]
pub async fn compose_template_video(
    app: tauri::AppHandle,
    clips: Vec<Vec<u8>>, // urutan = urutan slot template
    slot_rects: Vec<(f64, f64, f64, f64)>, // (x, y, w, h) dalam px canvas template, urutan sama
    canvas_width: u32,
    canvas_height: u32,
    background_jpeg: Option<Vec<u8>>, // frame background/frame PNG template (opsional)
) -> Result<Vec<u8>, String> {
    let tmp_dir = std::env::temp_dir().join(format!("compose_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;

    let mut input_args: Vec<String> = Vec::new();
    for (i, clip) in clips.iter().enumerate() {
        let p = tmp_dir.join(format!("clip_{}.mp4", i));
        std::fs::write(&p, clip).map_err(|e| e.to_string())?;
        input_args.push("-i".into());
        input_args.push(p.to_str().unwrap().into());
    }

    // filter_complex: scale tiap input ke ukuran slot, lalu overlay berurutan di atas base canvas hitam
    let mut filter = format!("color=c=black:s={}x{}[base];", canvas_width, canvas_height);
    let mut last_label = "base".to_string();
    for (i, (x, y, w, h)) in slot_rects.iter().enumerate() {
        filter.push_str(&format!(
            "[{i}:v]scale={w}:{h},setpts=PTS-STARTPTS[v{i}];",
            i = i, w = *w as i32, h = *h as i32
        ));
        let next_label = format!("tmp{}", i);
        filter.push_str(&format!(
            "[{prev}][v{i}]overlay={x}:{y}:shortest=0[{next}];",
            prev = last_label, i = i, x = *x as i32, y = *y as i32, next = next_label
        ));
        last_label = next_label;
    }
    filter.push_str(&format!("[{}]loop=loop=2:size=1:start=0[outv]", last_label));

    let out_path = tmp_dir.join("final.mp4");
    let sidecar = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?;
    let mut args: Vec<String> = input_args;
    args.extend(["-filter_complex".into(), filter, "-map".into(), "[outv]".into(),
        "-c:v".into(), "libx264".into(), "-pix_fmt".into(), "yuv420p".into(),
        "-movflags".into(), "+faststart".into(), out_path.to_str().unwrap().into()]);

    let output = sidecar.args(args).output().await.map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let bytes = std::fs::read(&out_path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&tmp_dir);
    Ok(bytes)
}
```

> Catatan implementasi: filter di atas ditulis untuk kejelasan alur, bukan drop-in tervalidasi — **agen CLI wajib test manual dengan `ffmpeg` CLI langsung dulu** (siapkan 2–3 klip contoh, jalankan command yang dihasilkan, cek visual outputnya) sebelum menyambungkannya ke Tauri command, karena sintaks `filter_complex` gampang salah step (urutan label, tipe overlay `shortest`, dst) dan error-nya baru ketahuan di runtime lewat stderr ffmpeg.

`background_jpeg` (opsional) belum dipakai di command di atas — kalau frame/border template mau ikut ter-render di video (bukan cuma area foto), tambahkan sebagai input pertama dan overlay video slot-slot di atasnya (`background` jadi `[0:v]` alih-alih `color=...`). Untuk MVP boleh dilewati dulu — video cinemagraph tanpa border, border ditambahkan manual di UI galeri/download page kalau perlu.

Daftarkan `encode_jpeg_frames_to_video` dan `compose_template_video` di `invoke_handler` (`lib.rs`), tambah `tauri-plugin-shell` sebagai builder plugin, tambah `uuid` ke `Cargo.toml` kalau belum ada (`cargo add uuid --features v4`).

---

## 9. Fungsi bersama: rangkai & upload semua aset di akhir sesi

Buat file baru `src/lib/utils/sessionAssets.ts` — dipanggil dari V1/V2/V3 complete flow (§10), supaya logikanya tidak diduplikasi 3x:

```ts
import { invoke } from "@tauri-apps/api/core";
import { boothFlow } from "$lib/stores/booth.svelte";
import { boothConfig } from "$lib/stores/boothConfig.svelte";
import { uploadGalleryAsset } from "$lib/api/boothClient";
import { buildSessionGif } from "./gif";

export async function saveSessionAssets(
  boothId: string,
  sessionId: string,
  compositeUrl: string | null,
  templateWidth: number,
  templateHeight: number,
  slotRects: { x: number; y: number; w: number; h: number }[],
) {
  const tasks: Promise<unknown>[] = [];

  // 1. Foto mentah tiap slot
  boothFlow.photosTaken.forEach((photoUrl, i) => {
    tasks.push(
      uploadGalleryAsset(
        boothId,
        sessionId,
        "photo",
        photoUrl,
        "jpg",
        "image/jpeg",
        1200,
        1800,
      ).catch((e) => console.error(`Gagal upload foto mentah slot ${i}:`, e)),
    );
  });

  // 2. Composite (hasil template)
  if (compositeUrl) {
    tasks.push(
      uploadGalleryAsset(
        boothId,
        sessionId,
        "photo",
        compositeUrl,
        "jpg",
        "image/jpeg",
        templateWidth,
        templateHeight,
      ).catch((e) => console.error("Gagal upload composite:", e)),
    );
  }

  // 3. GIF gabungan foto
  if (boothConfig.config.enableSessionGif && boothFlow.photosTaken.length > 0) {
    tasks.push(
      buildSessionGif(boothFlow.photosTaken)
        .then((gifBlob) =>
          uploadGalleryAsset(
            boothId,
            sessionId,
            "gif",
            gifBlob,
            "gif",
            "image/gif",
            480,
            720,
          ),
        )
        .catch((e) => console.error("Gagal buat/upload GIF sesi:", e)),
    );
  }

  // 4. Video composite live view per slot
  const validClips = boothFlow.liveviewClips.filter((c): c is string => !!c);
  if (
    boothConfig.config.enableLiveviewVideo &&
    validClips.length === boothFlow.photosTaken.length &&
    validClips.length > 0
  ) {
    tasks.push(
      (async () => {
        const clipBytes = await Promise.all(
          validClips.map(async (url) =>
            Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())),
          ),
        );
        const videoBytes = await invoke<number[]>("compose_template_video", {
          clips: clipBytes,
          slotRects: slotRects.map((r) => [r.x, r.y, r.w, r.h]),
          canvasWidth: templateWidth,
          canvasHeight: templateHeight,
          backgroundJpeg: null,
        });
        const videoBlob = new Blob([new Uint8Array(videoBytes)], {
          type: "video/mp4",
        });
        return uploadGalleryAsset(
          boothId,
          sessionId,
          "video",
          videoBlob,
          "mp4",
          "video/mp4",
          templateWidth,
          templateHeight,
        );
      })().catch((e) => console.error("Gagal buat/upload video liveview:", e)),
    );
  }

  await Promise.allSettled(tasks);
}
```

`slotRects` didapat dari `selectedTemplate.design_data.filter(l => !l.isBackground && !l.isQr)` (pola yang sama dipakai `templateComposite.ts`) — mapping `{x, y, w, h}` per slot, urutan harus **identik** dengan urutan yang dipakai saat compositing foto (`photoSlots.findIndex(...)` di `compositeTemplateImage`), supaya video dan foto tidak tertukar posisi.

---

## 10. Wiring ke V1 / V2 / V3

**V1Complete.svelte** — di blok `try` step "2. Create session..." (baris ~64–90), setelah composite & `createTransactionSession` sukses, ganti bagian upload manual jadi:

```ts
await saveSessionAssets(
  boothId,
  sessId,
  compositeUrl,
  selectedTemplate?.width || 1200,
  selectedTemplate?.height || 1800,
  (selectedTemplate?.design_data || []).filter(
    (l) => !l.isBackground && !l.isQr,
  ),
);
```

**V2Session.svelte / V3Session.svelte** — komponen ini cuma capture foto lalu panggil `onComplete(boothFlow.photosTaken)`; komposit + create session + upload terjadi di komponen berikutnya (kemungkinan besar `V2Download.svelte`/`V3Download.svelte`, pola serupa `V1Complete`). **Agen CLI harus:**

1. Baca `V2Download.svelte` dan `V3Download.svelte` penuh (belum tercakup di eksplorasi sesi ini) untuk konfirmasi di mana composite & create-session terjadi di alur v2/v3.
2. Terapkan pola yang sama seperti V1Complete: panggil `compositeTemplateImage` → `createTransactionSession` → `saveSessionAssets(...)` dengan `slotRects` dari template yang aktif di variant tersebut.
3. Pastikan `boothFlow.liveviewClips` di-reset di awal tiap sesi baru (`boothFlow.reset()` sudah mencakup ini per §7) supaya sesi berikutnya tidak kebawa klip sesi lama.

---

## 11. Checklist verifikasi sebelum dianggap selesai

- [ ] `pnpm check` (svelte-check) & `cargo check` di `src-tauri` — 0 error.
- [ ] Mode `demo`: jalankan sesi penuh, cek di gallery API (`GET /booths/{id}/gallery/{sessionId}`) ada 4 jenis: `photo` (mentah × slotCount), `photo` (composite), `gif`, `video`.
- [ ] Mode `webcam`: cek `liveviewClips[i]` berisi blob URL valid (`video/webm`) yang bisa diputar di `<video>` tag sebelum di-upload.
- [ ] Mode `usb` (butuh kamera fisik gphoto2): cek `get_liveview_clip_frames` mengembalikan >0 frame untuk window ±(pre+post) detik — kalau kosong, kemungkinan `RING_BUFFER_MS`/`max_age_ms` di §4.1 lebih kecil dari `pre_secs + post_secs`, naikkan buffer.
- [ ] Video hasil `compose_template_video` dibuka manual — posisi tiap slot video sesuai posisi foto pada composite (bandingkan visual side-by-side dengan hasil `compositeTemplateImage` untuk template yang sama).
- [ ] GIF hasil `encode_photos_to_gif` looping dengan urutan foto benar dan ukuran file wajar (bukan puluhan MB — kalau kegedean, turunkan resolusi resize di §8.1 atau kurangi `frame_delay_ms`/jumlah warna palet GIF).
- [ ] Upload gagal (matikan network sengaja) tidak nge-crash flow `onNewSession()` — semua `tasks` di `saveSessionAssets` sudah dibungkus `.catch()` per aset, jadi 1 aset gagal tidak menggagalkan aset lain maupun sesi booth berikutnya.
- [ ] `ffmpeg` sidecar ke-bundle dengan benar di build production (`pnpm tauri build`) — cek ukuran installer naik signifikan (ffmpeg static ~40–80MB) dan binary sidecar benar-benar tereksekusi (bukan cuma jalan di `pnpm tauri dev` karena kebetulan ffmpeg ada di PATH sistem developer).
