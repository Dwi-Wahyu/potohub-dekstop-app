# Implementasi QR Code Scanner dengan Bounding Box Dinamis di Tauri + SvelteKit

Dokumen ini memberikan panduan lengkap untuk mengintegrasikan fitur **pemindaian QR Code** dengan **bounding box (kotak pembatas) yang bergerak secara real-time** pada aplikasi desktop berbasis **Tauri** dengan frontend **SvelteKit**. Bounding box akan mengikuti posisi QR code yang terdeteksi, dengan gaya yang dapat disesuaikan dengan **design system** aplikasi Anda.

---

## 1. Arsitektur & Cara Kerja

### 1.1. Komponen Utama

- **Camera Feed**: Menggunakan `navigator.mediaDevices.getUserMedia()` untuk mengakses kamera perangkat.
- **Video Element**: Menampilkan stream kamera secara langsung.
- **Canvas Overlay**: Ditempatkan tepat di atas video, digunakan untuk menggambar bounding box dan informasi tambahan.
- **Detection Engine**: Menggunakan **BarcodeDetector API** (built‑in browser) jika tersedia, dengan **jsQR** sebagai fallback untuk kompatibilitas lintas browser.
- **Loop Deteksi**: Berjalan secara periodik (misal 30 fps) menggunakan `requestAnimationFrame` atau `setInterval` untuk membaca frame dari video, mendeteksi QR code, dan memperbarui overlay.

### 1.2. Alur Data

1. Pengguna menekan tombol "Start Camera".
2. Stream kamera diaktifkan dan ditampilkan di `<video>`.
3. Deteksi loop dimulai:
   - Setiap frame, gambar video ke **hidden canvas** untuk diambil data pikselnya.
   - Panggil `BarcodeDetector.detect()` atau `jsQR` pada data tersebut.
   - Jika QR code ditemukan, ambil koordinat **corner points** (4 titik sudut).
   - Gambar bounding box di **overlay canvas** menggunakan titik‑titik tersebut.
   - Hasil dekripsi (string) disimpan dan dapat ditampilkan.
4. Jika QR code hilang, bounding box dihapus.
5. Hasil scan dapat dikirim ke backend Rust melalui **Tauri command** untuk diproses atau disimpan.

---

## 2. Persiapan Proyek

### 2.1. Prasyarat

- Node.js (v16+), Rust, dan Tauri CLI sudah terinstal.
- Proyek Tauri dengan frontend SvelteKit sudah dibuat:
  ```bash
  pnpm create tauri-app@latest my-app
  # Pilih: SvelteKit (TypeScript)
  cd my-app
  pnpm install
  ```

### 2.2. Instal Dependensi Tambahan

```bash
pnpm install @tauri-apps/api
pnpm install jsqr        # fallback
pnpm install -D @types/dom-webcodecs   # untuk type support (opsional)
```

---

## 3. Implementasi Frontend (SvelteKit)

Buat komponen scanner di `src/routes/+page.svelte` atau sebagai komponen terpisah.

### 3.1. Struktur HTML & Canvas

```svelte
<div class="scanner-wrapper">
  <video bind:this={videoElement} autoplay playsinline muted></video>
  <canvas bind:this={overlayCanvas} class="overlay"></canvas>
  <canvas bind:this={hiddenCanvas} style="display:none;"></canvas>
</div>
```

- **Hidden canvas** digunakan untuk menangkap frame video dan diumpankan ke detektor.
- **Overlay canvas** digunakan untuk menggambar bounding box; posisinya absolut di atas video.

### 3.2. Mengatur Ukuran Canvas

Saat video siap (`loadedmetadata`), atur lebar dan tinggi kedua canvas agar sesuai dengan resolusi video asli. Ini penting agar koordinat titik sudut yang dikembalikan oleh detektor tepat berada di posisi yang benar.

```typescript
videoElement.addEventListener("loadedmetadata", () => {
  const w = videoElement.videoWidth;
  const h = videoElement.videoHeight;
  hiddenCanvas.width = w;
  hiddenCanvas.height = h;
  overlayCanvas.width = w;
  overlayCanvas.height = h;
});
```

### 3.3. Mengaktifkan Kamera

```typescript
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    videoElement.srcObject = stream;
    await videoElement.play();
    isScanning = true;
    scanLoop();
  } catch (err) {
    console.error("Camera error:", err);
  }
}
```

### 3.4. Deteksi Loop

Gunakan `requestAnimationFrame` atau `setInterval` untuk menjalankan deteksi secara periodik. Untuk performa, kita bisa melewatkan beberapa frame (frame skipping) atau membatasi FPS.

```typescript
let frameSkip = 0;
const MAX_SKIP = 2; // proses setiap 3 frame

async function scanLoop() {
  if (!isScanning) return;
  frameSkip = (frameSkip + 1) % (MAX_SKIP + 1);
  if (frameSkip === 0) {
    await detectQRCode();
  }
  requestAnimationFrame(scanLoop);
}
```

### 3.5. Fungsi Deteksi QR

```typescript
async function detectQRCode() {
  const ctx = hiddenCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  // Gambar frame video ke hidden canvas
  ctx.drawImage(videoElement, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
  const imageData = ctx.getImageData(
    0,
    0,
    hiddenCanvas.width,
    hiddenCanvas.height,
  );

  let barcodes = [];
  let detected = false;
  if ("BarcodeDetector" in window) {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    try {
      barcodes = await detector.detect(hiddenCanvas);
    } catch (e) {
      /* fallback ke jsQR */
    }
  }
  if (barcodes.length === 0) {
    // fallback jsQR
    const { default: jsQR } = await import("jsqr");
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    if (code) {
      barcodes = [{ rawValue: code.data, cornerPoints: code.location.points }];
    }
  }

  if (barcodes.length > 0) {
    const qr = barcodes[0];
    scanResult = qr.rawValue;
    cornerPoints = qr.cornerPoints || [];
    drawBoundingBox(cornerPoints);
    // Kirim ke backend jika perlu
    await invoke("save_qr_result", {
      data: { content: qr.rawValue, corner_points: cornerPoints },
    });
  } else {
    cornerPoints = [];
    clearOverlay();
  }
}
```

### 3.6. Menggambar Bounding Box dengan Design System

Fungsi `drawBoundingBox` menerima array titik (4 titik) dan menggambar poligon serta elemen visual tambahan sesuai dengan design system.

#### 3.6.1. Menggunakan CSS Variables untuk Tema

Di `app.html` atau `+layout.svelte` definisikan CSS variables:

```css
:root {
  --qr-box-color: #00ff00; /* warna garis */
  --qr-box-fill: rgba(0, 255, 0, 0.15);
  --qr-box-glow: rgba(0, 255, 0, 0.3);
  --qr-corner-dot-color: #ffffff;
  --qr-text-color: #ffffff;
  --qr-font-family: "Inter", sans-serif;
}
```

#### 3.6.2. Implementasi Gambar

```typescript
function drawBoundingBox(points: { x: number; y: number }[]) {
  const ctx = overlayCanvas.getContext("2d");
  if (!ctx || points.length < 4) return;

  // Hapus overlay sebelumnya
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // Ambil warna dari CSS variables
  const styles = getComputedStyle(document.documentElement);
  const boxColor =
    styles.getPropertyValue("--qr-box-color").trim() || "#00FF00";
  const boxFill =
    styles.getPropertyValue("--qr-box-fill").trim() || "rgba(0,255,0,0.15)";
  const glowColor =
    styles.getPropertyValue("--qr-box-glow").trim() || "rgba(0,255,0,0.3)";
  const dotColor =
    styles.getPropertyValue("--qr-corner-dot-color").trim() || "#FFFFFF";
  const textColor =
    styles.getPropertyValue("--qr-text-color").trim() || "#FFFFFF";

  // Gambar poligon
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();

  // Fill
  ctx.fillStyle = boxFill;
  ctx.fill();

  // Stroke dengan efek glow
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 3;
  ctx.strokeStyle = boxColor;
  ctx.stroke();
  ctx.shadowBlur = 0; // reset

  // Titik sudut (corner dots)
  points.forEach((p, idx) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = dotColor;
    ctx.fill();
    ctx.strokeStyle = boxColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label angka sudut (opsional)
    ctx.fillStyle = textColor;
    ctx.font =
      "12px " + styles.getPropertyValue("--qr-font-family").trim() ||
      "monospace";
    ctx.fillText(String(idx + 1), p.x + 8, p.y - 8);
  });

  // Tampilkan hasil di pojok kiri atas
  if (scanResult) {
    const txt =
      scanResult.length > 30 ? scanResult.slice(0, 27) + "…" : scanResult;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.roundRect(12, 12, Math.min(txt.length * 8 + 24, 400), 36, 8); // butuh polyfill roundRect
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.font =
      "14px " + styles.getPropertyValue("--qr-font-family").trim() ||
      "monospace";
    ctx.fillText("📱 " + txt, 20, 36);
  }
}
```

> **Catatan**: `ctx.roundRect` belum tersedia di semua browser; gunakan helper atau tetap pakai `fillRect` jika perlu.

### 3.7. Kontrol & Event

- Tombol **Start/Stop** untuk mengontrol kamera.
- Tombol **Copy** untuk menyalin hasil ke clipboard (gunakan `navigator.clipboard.writeText` atau Tauri API).
- Tampilkan status scanning (detecting / detected / idle).

---

## 4. Integrasi dengan Backend Tauri (Rust)

### 4.1. Command untuk Menyimpan Hasil

Di `src-tauri/src/main.rs`:

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct QRCodeData {
    pub content: String,
    pub corner_points: Vec<Point>,
}
#[derive(Serialize, Deserialize, Clone)]
pub struct Point { pub x: f64, pub y: f64 }

#[tauri::command]
fn save_qr_result(data: QRCodeData) -> Result<String, String> {
    println!("QR Content: {}", data.content);
    // Simpan ke file atau database
    Ok("Saved".to_string())
}
```

Registrasi command di `tauri::Builder`.

### 4.2. Memanggil dari Frontend

```typescript
import { invoke } from "@tauri-apps/api/tauri";
await invoke("save_qr_result", {
  data: { content: scanResult, corner_points: cornerPoints },
});
```

---

## 5. Menyesuaikan dengan Design System

### 5.1. Tokens CSS

Buat file tema (misal `theme.css`) yang mendefinisikan variable untuk:

- Warna utama (primary, secondary)
- Warna status (success, error)
- Font family
- Radius, shadow, dll.

Contoh tema terang:

```css
:root {
  --qr-box-color: #2563eb; /* primary */
  --qr-box-fill: rgba(37, 99, 235, 0.15);
  --qr-box-glow: rgba(37, 99, 235, 0.3);
  --qr-corner-dot-color: #ffffff;
  --qr-text-color: #1f2937;
  --qr-font-family: "Inter", sans-serif;
}
```

### 5.2. Komponen Styled

Bungkus scanner dengan komponen yang menggunakan CSS modules atau Tailwind. Gunakan variable tersebut di dalam fungsi `drawBoundingBox` dengan `getComputedStyle`.

### 5.3. Animasi Halus

Untuk bounding box yang lebih dinamis, tambahkan **CSS transition** atau **animation** pada canvas (misal transisi opacity). Namun karena canvas digambar ulang setiap frame, lebih baik kontrol di level JavaScript dengan interpolasi posisi antar frame (smoothing) jika diperlukan.

---

## 6. Optimasi Performa

- **Frame Skipping**: Lewati beberapa frame untuk mengurangi beban CPU.
- **Region of Interest (ROI)**: Deteksi hanya di area tengah (misal 60% dari frame) untuk meningkatkan kecepatan.
- **Resolusi Rendah**: Turunkan resolusi video jika perlu.
- **Deteksi Asinkron**: Gunakan `Promise` dan `await` agar tidak memblokir UI.
- **Hapus Stream** saat komponen di-unmount untuk membebaskan resource kamera.

---

## 7. Penanganan Error & Aksesibilitas

- Tampilkan pesan error jika kamera tidak diizinkan atau gagal diakses.
- Berikan tombol "Coba Lagi" jika terjadi error.
- Sertakan label dan role ARIA untuk aksesibilitas.
- Pastikan semua interaksi dapat dilakukan melalui keyboard.

---

## 8. Contoh Lengkap Kode Komponen

```svelte
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/tauri';

  let video: HTMLVideoElement;
  let overlayCanvas: HTMLCanvasElement;
  let hiddenCanvas: HTMLCanvasElement;

  let isScanning = false;
  let scanResult = '';
  let cornerPoints: { x: number; y: number }[] = [];
  let status: 'idle' | 'detecting' | 'detected' = 'idle';
  let errorMsg = '';

  // ... fungsi-fungsi di atas ...
</script>

<div class="scanner-container">
  <div class="video-wrapper">
    <video bind:this={video} autoplay playsinline muted></video>
    <canvas bind:this={overlayCanvas} class="overlay-canvas"></canvas>
    <canvas bind:this={hiddenCanvas} style="display:none;"></canvas>
    <div class="status-badge" class:detected={status === 'detected'}>
      {status === 'idle' && '⏸️ Siap'}
      {status === 'detecting' && '🔍 Mendeteksi...'}
      {status === 'detected' && '✅ QR Terdeteksi!'}
    </div>
  </div>

  <div class="controls">
    <button on:click={startCamera} disabled={isScanning}>📷 Mulai</button>
    <button on:click={stopCamera} disabled={!isScanning}>⏹ Henti</button>
    <button on:click={copyResult} disabled={!scanResult}>📋 Salin</button>
  </div>

  {#if scanResult}
    <div class="result">
      <h3>Hasil Scan</h3>
      <p>{scanResult}</p>
    </div>
  {/if}

  {#if errorMsg}
    <div class="error">{errorMsg}</div>
  {/if}
</div>

<style>
  .scanner-container {
    max-width: 640px;
    margin: 0 auto;
  }
  .video-wrapper {
    position: relative;
    background: #000;
    border-radius: 12px;
    overflow: hidden;
    aspect-ratio: 4/3;
  }
  video, .overlay-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }
  video { object-fit: cover; }
  .overlay-canvas {
    pointer-events: none;
    transform: scaleX(-1); /* mirror agar sesuai dengan video jika perlu */
  }
  .status-badge {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.7);
    color: #fff;
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 14px;
    backdrop-filter: blur(4px);
  }
  .status-badge.detected {
    background: rgba(0, 200, 0, 0.9);
    box-shadow: 0 0 20px rgba(0,255,0,0.3);
  }
  /* ... style lainnya ... */
</style>
```

---

## 9. Referensi Tambahan

- [Tauri API](https://tauri.app/v1/api/js/)
- [BarcodeDetector MDN](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector)
- [jsQR GitHub](https://github.com/cozmo/jsQR)

Dengan mengikuti panduan ini, Anda akan memiliki fitur QR scanner dengan bounding box dinamis yang dapat disesuaikan dengan design system aplikasi Anda. Silakan tambahkan spesifikasi lebih lanjut seperti perilaku khusus, efek visual tambahan, atau integrasi dengan modul lain sesuai kebutuhan. Selamat mengkoding! 🚀
