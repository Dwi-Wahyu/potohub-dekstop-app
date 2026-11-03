# Laporan Perbaikan: Pemulihan Strip Composite Gambar, Normalisasi Z-Index Layer Template Frame, dan Perbaikan Layout Filter V3

**Target Proyek:** `PotoHub` (`dekstop-app`)  
**Waktu Eksekusi:** 26 September 2026  
**Status Akhir:** ✅ **100% SELESAI & TERVERIFIKASI (`pnpm check`: 0 error, 0 warning)**

---

## 1. Ringkasan Masalah

Setelah pembaruan sebelumnya terkait pengiriman softfile dan liveview video, muncul tiga isu terkait rendering dan compositing:
1. **Kegagalan Pembuatan Strip Composite Gambar Akhir**:
   Pada layar akhir (`V1Complete.svelte`, `V2Download.svelte`, `V3Download.svelte`), strip foto hasil komposit tidak berhasil dibuat dan aplikasi hanya menampilkan 1 foto mentah jepretan kamera (`photos[0]`).
2. **Preview Strip pada Layar Sesi dan Filter Menutupi Frame Overlay**:
   Lapisan foto capture menutupi latar belakang frame `bg_url` (seharusnya frame berada di atas foto sebagai bingkai transparan berlubang), dan pada saat seluruh foto selesai diambil (`allDone`), z-index foto di-elevasi paksa sehingga menutupi dekorasi bingkai frame.
3. **Penyusutan Lebar (Stretch/Distorsi) pada V3Filter**:
   Pada `V3Filter.svelte`, strip preview terlihat mengecil secara horizontal dan tertarik memanjang (terdistorsi tidak proporsional).

---

## 2. Analisis Root Cause

### 2.1 Canvas Tainting (Penyebab Utama Gagal Generate Strip)
- Pada implementasi sebelumnya di `src/lib/utils/templateComposite.ts`, fungsi `loadImage(src)` memanggil `ensureAsset(src)`.
- `ensureAsset` mengonversi path file lokal di disk menjadi URL Tauri Asset Protocol (`convertFileSrc`), yang menghasilkan URL streaming internal seperti `http://asset.localhost/...` pada Linux Tauri v2.
- Pada browser engine WebKitGTK (WebKit Linux yang dipakai Tauri), saat sebuah gambar yang dimuat dari `http://asset.localhost/...` digambar ke elemen `<canvas>` HTML5 2D via `ctx.drawImage()`, origin kanvas dianggap **"tainted"** (terkontaminasi cross-origin tanpa header CORS eksplisit).
- Ketika method ekspor kanvas dipanggil:
  ```ts
  const result = canvas.toDataURL(mimeType, quality);
  ```
  WebKitGTK langsung melemparkan exception keamanan:
  `SecurityError: The operation is insecure.`
- Blok `try ... catch` pada `compositeTemplateImage()` menangkap error ini dan mengeksekusi kode fallback:
  ```ts
  catch (err) {
    console.error('compositeTemplateImage error:', err);
    return photos[0] || '';
  }
  ```
  Inilah penyebab mengapa halaman unduh/selesai hanya menampilkan `photos[0]`.

### 2.2 Urutan Z-Index Layer Template Frame
- Pada data template dari backend / seeder (misalnya template 32101), slot foto memiliki nilai `layer: 2` sedangkan background memiliki `layer: 1`.
- Fungsi `getLayerZIndex()` sebelumnya memprioritaskan `typeof layer.layer === 'number'` terlebih dahulu sebelum mengecek `layer.isBackground`. Hal ini menyebabkan foto kamera memiliki z-index lebih tinggi daripada frame dekorasi PNG.
- Selain itu, pada komponen sesi (`V1Camera`, `V2Session`, `V3Session`), terdapat kode:
  ```svelte
  z-index: {allDone && isPhotoSlot ? 40 + targetIdx : layerZIndex};
  ```
  Hal ini secara paksa menaikkan foto ke z-index 40+ ketika pengambilan foto selesai, menutupi bingkai frame.

### 2.3 Aturan CSS pada `V3Filter.svelte`
- Pada `V3Filter.svelte`, komponen `StickerCanvas` diberi properti inline:
  ```svelte
  containerStyle="width: 240px; position: relative;"
  ```
  Di sisi lain, wrapper luarnya memiliki tinggi `max-h-[60vh]` (~600px). Memaksa lebar tetap 240px pada kontainer dengan rasio template 2:3 (lebar 1200 x tinggi 1800) menyebabkan tampilan terdistorsi menjadi rasio 1:2.5, sehingga strip tampak menyusut kurus ke samping.

---

## 3. Rincian Solusi & Perubahan Kode

### 3.1 Dual-Path Asset Management (`offlineCache.ts`)
Kami mempertahankan Tauri Asset Protocol (`convertFileSrc`) untuk seluruh elemen DOM, dan menambahkan fungsi khusus untuk operasi kanvas agar tetap *origin-clean*:
- **`src/lib/utils/offlineCache.ts`**:
  - Menambahkan fungsi `ensureAssetDataUrl(url: string): Promise<string>`.
  - Fungsi ini memeriksa cache lokal disk menggunakan `get_cached_asset_path`.
  - Jika file sudah ada di disk, membacanya langsung menggunakan Rust command `read_cached_asset`, yang mengembalikan Base64 Data URL (`data:image/png;base64,...`).
  - Jika file belum ada di disk, mengunduhnya via `download_asset_to_cache` lalu membacanya via `read_cached_asset`.
  - Jika terjadi kendala, terdapat fallback ke `fetch_image_as_data_url` di level Rust.
  - Karena gambar dimuat dari Data URL Base64 yang se-origin dengan dokumen, kanvas HTML5 **tidak pernah tainted**, dan `canvas.toDataURL()` selalu berhasil diekspor.

### 3.2 Pembaruan `templateComposite.ts`
- **`loadImage(src)`**:
  - Memanggil `ensureAssetDataUrl(src)` alih-alih `ensureAsset(src)`.
  - Mengonfigurasi `img.crossOrigin = 'anonymous'` sebelum menyetel `img.src`.
- **`getLayerZIndex()`**:
  - Memperbaiki hierarki penumpukan layer secara matematis:
    1. Slot foto kamera mendapatkan z-index terendah (1 s.d. $N$).
    2. Layer background / frame overlay (`layer.isBackground`) selalu ditempatkan **di atas seluruh slot foto**: `maxPhotoLayer + 1` (default 20).
    3. Layer QR Code ditempatkan di lapisan paling atas: `maxPhotoLayer + 2` (default 30).
  - Dengan demikian, transparent cutout pada frame PNG akan selalu memperlihatkan foto di bawahnya secara presisi.

### 3.3 Penyesuaian Komponen Sesi & Pemilihan Frame (`V1Camera`, `V2Session`, `V3Session`, `V1CategoryFrame`, `V2Frame`)
- **Penghapusan Elevasi Z-Index Paksa**: Menghapus elevasi z-index kondisional `allDone && isPhotoSlot ? 40 + targetIdx : layerZIndex`. Nilai z-index kini murni mengikuti `getLayerZIndex(layer, templateLayers)` sehingga background frame overlay selalu berada di atas slot foto.
- **Interaksi Tembus Pandang**: Menggunakan `pointer-events: none` pada layer background frame agar tombol interaksi (seperti tombol retake/search foto) pada slot foto di bawah cutout transparan tetap dapat diklik pengguna tanpa hambatan.
- **Standardisasi Layer Rendering**: Menstandarkan loop render layer menggunakan `getTemplateLayers(selectedTemplate)` dan `getLayerZIndex(layer, templateLayers)` baik pada preview kamera liveview maupun thumbnail grid pada `V1CategoryFrame.svelte` dan `V2Frame.svelte`.

### 3.4 Perbaikan Layout Responsif `V3Filter.svelte`
- Menghapus `width: 240px` statis pada `StickerCanvas`.
- Menyetel styling proporsional:
  ```svelte
  class="relative h-full max-w-full overflow-hidden rounded-xl shadow-2xl border-2 border-gray-200"
  containerStyle="aspect-ratio: {tWidth} / {tHeight};"
  ```
- Dengan aturan ini, kanvas secara dinamis mempertahankan rasio aspek template (misal 2:3 atau 4:6) tanpa memaksakan lebar piksel statis, sehingga strip tidak lagi tertarik atau mengecil kurus.

---

## 4. Hasil Verifikasi

### 4.1 Pemeriksaan Svelte & TypeScript
Menjalankan `svelte-check` melalui `pnpm check`:
```bash
$ pnpm check
$ svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
Loading svelte-check in workspace: /home/potohub/Projects/PotoHub/source-code/dekstop-app
Getting Svelte diagnostics...

svelte-check found 0 errors and 0 warnings
```
Semua file komponen dan utilitas yang dimodifikasi lolos verifikasi kompilasi 100% tanpa error maupun warning.

### 4.2 Verifikasi Alur Aplikasi
1. **Pemilihan Frame (`V1CategoryFrame`, `V2Frame`)**: Preview liveview kamera dari webcam/DSLR kini berada di bawah cutout transparan frame `bg_url`, menampilkan mockup bingkai frame yang tepat sebelum pelanggan mengambil foto.
2. **Sesi Capture & Liveview**: Slot foto tersusun rapi di bawah frame cutout transparan; tombol retake pada foto tetap responsif.
3. **Filter & Stiker (V1, V2, V3)**: Preview frame berdimensi proporsional sesuai rasio aspek template; frame overlay berada di atas foto.
4. **Generasi Strip Composite Akhir**: `compositeTemplateImage()` berhasil merender seluruh lapisan foto, bingkai frame, stiker, dan QR code tanpa exception `SecurityError`, menghasilkan Data URL strip composite resolusi tinggi untuk layar unduh dan pengiriman softfile.
