# Laporan Perbaikan Bug Pengiriman File, Liveview Video, dan Mirror Foto

Dokumen ini merangkum perbaikan bug yang telah diimplementasikan pada **PotoHub**:

---

## 1. Perbaikan Redundant Thumbnail di Cloudflare R2 Bucket
### Masalah:
- Sebelumnya, pada sebuah frame dengan $N$ slot foto (misalnya 5 slot), fungsi pengiriman file mengunggah file strip composite, lalu mengunggah file `thumbnail_*.jpg`, dan mengunggah kembali $N$ file foto mentah (`photo_*.jpg`).
- Hal ini menyebabkan foto pertama diunggah dua kali ke bucket Cloudflare R2 (sebagai thumbnail dan sebagai foto mentah), menghasilkan total $1 + 1 + 5 = 7$ file gambar di bucket.

### Solusi & Implementasi:
- **`dekstop-app/src/lib/utils/sessionAssets.ts`**:
  - Dihapus pemanggilan `uploadGalleryAsset(..., 'thumbnail', ...)` yang melakukan request presigned URL dan PUT file binary duplikat ke Cloudflare R2.
  - Setelah foto mentah slot pertama selesai diunggah ke R2 via `uploadGalleryAsset(..., 'photo', ...)`, URL publik file tersebut (`firstUploadedMedia.file_url`) langsung didaftarkan ke metadata database menggunakan `uploadSessionMedia(..., 'thumbnail', ...)` beserta `blurBase64`.
  - **Hasil**: Tidak ada lagi file `thumbnail_*.jpg` yang bertambah di Cloudflare R2 bucket. Database PostgreSQL mencatat foto pertama sebagai thumbnail sesi tanpa biaya penyimpanan dan bandwidth ganda.

---

## 2. Perbaikan Video Liveview Composite Sesuai Layout Template Frame
### Masalah:
- Video composite live view per slot tidak menyerupai hasil strip composite (`compositeTemplateImage`).
- Latar belakang template frame diletakkan di bagian paling dasar (`[base]`) dalam filter ffmpeg, sehingga klip video diletakkan di atas frame dan menutupi border, dekorasi, logo, serta ornamen frame.
- Urutan slot foto belum diurutkan menggunakan `getSortedPhotoSlots`, sehingga penempatan klip video berpotensi tertukar dengan urutan slot template.
- Elemen QR code dan stiker yang dipilih pelanggan tidak disertakan pada video liveview.

### Solusi & Implementasi:
- **`dekstop-app/src/lib/utils/templateComposite.ts`**:
  - Ditambahkan fungsi baru `compositeTemplateVideoOverlay(template, qrCodeText, stickers)`.
  - Fungsi ini merender canvas transparan seukuran template dengan urutan layer z-index yang identik dengan `compositeTemplateImage`. Area slot foto dibiarkan transparan sebagai jendela cut-out, sedangkan background frame PNG, QR code, dan stiker dirender di atasnya.
- **`dekstop-app/src-tauri/src/media.rs`**:
  - Diperbarui pipeline ffmpeg `compose_template_video`:
    1. Base canvas dibuat dengan warna putih bersih: `color=c=white:s={canvas_w}x{canvas_h}[base]`.
    2. Setiap klip video liveview di-scale, dicrop proporsional (cover crop), dan di-overlay pada base sesuai koordinat slot `(x, y, w, h)`.
    3. File overlay template PNG diletakkan **di atas** seluruh klip video (`[last_label][overlay_scaled]overlay=0:0:shortest=1[final]`).
    4. Format deteksi ekstensi klip (WebM atau MP4) ditangani secara otomatis melalui magic bytes header.
- **`dekstop-app/src/lib/utils/sessionAssets.ts`**, **`V1Complete.svelte`**, **`V2Download.svelte`**, **`V3Download.svelte`**:
  - Slot rects kini diurutkan secara konsisten menggunakan `getSortedPhotoSlots(getTemplateLayers(template))`.
  - Parameter `selectedTemplate` dan `softfileUrl` diteruskan ke `saveSessionAssets`.
  - **Hasil**: Output video liveview kini identik dengan strip composite foto, lengkap dengan bingkai frame di lapisan atas, jendela foto yang pas, QR code, dan stiker.

---

## 3. Perbaikan Pilihan Mirror Foto Pelanggan
### Masalah:
- Pilihan mirror pelanggan (`mirrorOn` true/false) dihormati pada strip composite, video liveview, dan GIF, namun file foto mentah (`photosTaken`) yang diunggah ke bucket Cloudflare dan disimpan ke disk lokal masih berupa hasil tangkapan kamera asli tanpa mirror.
- Pada kamera webcam laptop (`camera.svelte.ts`), fungsi `captureWebcamFrame` sebelumnya meng-hardcode `ctx.scale(-1, 1)` sehingga foto webcam selalu terbalik secara tidak sengaja.

### Solusi & Implementasi:
- **`dekstop-app/src/lib/camera.svelte.ts`**:
  - Dihapus transformasi hardcoded `scale(-1, 1)` pada `captureWebcamFrame`. Kamera webcam kini menangkap frame mentah murni, setara dengan USB DSLR camera.
- **`dekstop-app/src/lib/utils/sessionAssets.ts`**:
  - Ditambahkan fungsi utilitas `applyPhotoOrientation(photoUrl, mirrorOn, flipVertical)`.
  - Sebelum foto diunggah ke Cloudflare bucket atau disimpan ke local storage, setiap foto diproses dengan orientasi sesuai pilihan customer (`boothConfig.config.mirrorOn` dan `boothConfig.config.flipVertical`).
  - Pembuatan GIF (`buildSessionGif`) menggunakan foto yang sudah diproses orientasinya dengan `mirrorHorizontal = false` agar tidak terjadi flipping ganda.
  - **Hasil**: Foto individu yang diunggah ke bucket dan disimpan lokal kini 100% konsisten dan menghormati pilihan pelanggan apakah mirror atau tidak.

---

## 4. Penyesuaian Label pada Halaman Softfile Customer
### Implementasi:
- **`admin-dashboard/src/pages/SoftfilePage.svelte`**:
  - Label foto pertama diperbarui menjadi `Strip Foto` (karena merupakan strip composite), dan foto-foto selanjutnya diberi label `Foto 1`, `Foto 2`, dst. sesuai slot capture.

---

## 5. Thumbnail Kotak Statis untuk GIF dan Video Liveview di Halaman Softfile
### Masalah:
- Di bagian thumbnail carousel/track bawah pada SoftfilePage, file GIF di-render langsung menggunakan tag `<img>` yang menjalankan animasi GIF, dan file video di-render menggunakan tag `<video>` yang memuat buffer metadata/video.
- Hal ini menyebabkan kotak GIF dan Liveview beranimasi dan memakan bandwidth serta rendering berlebih saat pengguna hanya ingin memilih file.

### Solusi & Implementasi:
- **`admin-dashboard/src/pages/SoftfilePage.svelte`**:
  - Pada track thumbnail (`.thumb-track`), elemen `<img>` untuk GIF dan `<video>` untuk Liveview dihilangkan.
  - Sebagai gantinya, tombol thumbnail untuk GIF dan LIVE kini menggunakan kotak statis berdesain modern (`.thumb-box .gif-box` dan `.thumb-box .video-box`) dengan ikon yang jelas (Sparkles untuk GIF, Clapperboard untuk LIVE) dan teks badge tanpa preview animasi. Preview animasi atau pemutaran video hanya ditampilkan pada stage viewer utama saat item tersebut aktif dipilih.

---

## 6. Pemulihan Strip Composite Foto, Normalisasi Z-Index Layer, dan Layout Filter V3
### Masalah:
1. Strip gambar hasil komposit tidak berhasil dibuat pada tampilan akhir (`V1Complete.svelte`, `V2Download.svelte`, `V3Download.svelte`) dan hanya menampilkan 1 foto jepretan kamera (`photos[0]`).
   - **Penyebab**: Penggunaan Tauri Asset Protocol (`convertFileSrc`, misal `http://asset.localhost/...`) pada `loadImage` kanvas menyebabkan canvas HTML5 menjadi *tainted* di browser engine WebKitGTK (Linux). Saat `canvas.toDataURL()` dieksekusi, WebKit melempar `SecurityError: The operation is insecure`, sehingga masuk ke blok `catch` dan jatuh ke fallback `photos[0]`.
2. Preview template pada layar live capture dan filter tidak menghormati lapisan `bg_url` (frame overlay tertutup oleh foto kamera, dan elevasi paksa z-index saat `allDone` menutupi frame).
3. Pada `V3Filter.svelte`, strip preview mengalami distorsi (lebarnya mengecil kurus / tertarik memanjang) akibat properti `width: 240px` statis berkonflik dengan tinggi fleksibel kontainer.

### Solusi & Implementasi:
- **`dekstop-app/src/lib/utils/offlineCache.ts`**:
  - Menambahkan fungsi `ensureAssetDataUrl(url)` yang membaca file cache disk via Rust command `read_cached_asset` (Base64 Data URL) khusus untuk keperluan ekspor kanvas, sehingga kanvas selalu *clean* dan bebas dari *SecurityError*.
  - Tetap mempertahankan `convertFileSrc` untuk rendering elemen DOM (`<img>` dan background CSS) agar hemat memori RAM dan akselerasi GPU.
- **`dekstop-app/src/lib/utils/templateComposite.ts`**:
  - `loadImage` diperbarui memanggil `ensureAssetDataUrl(src)`.
  - Fungsi `getLayerZIndex()` dinormalisasi: lapisan foto berada di lapisan bawah, layer background/frame overlay (`isBackground`) selalu di atas seluruh slot foto (`maxPhotoLayer + 1`), dan QR code di lapisan teratas (`maxPhotoLayer + 2`).
- **`V1Camera.svelte`**, **`V2Session.svelte`**, **`V3Session.svelte`**:
  - Menghapus elevasi z-index paksa `allDone && isPhotoSlot ? 40 + targetIdx : layerZIndex`.
  - Menambahkan `pointer-events: none` pada layer background frame agar klik tombol retake foto pada area transparan tetap dapat diakses pengguna.
- **`V3Filter.svelte`**:
  - Menghapus `width: 240px` statis dan menerapkan `aspect-ratio: {tWidth} / {tHeight}` pada kontainer `StickerCanvas`. Strip kini tampil proporsional tanpa distorsi rasio aspek.


