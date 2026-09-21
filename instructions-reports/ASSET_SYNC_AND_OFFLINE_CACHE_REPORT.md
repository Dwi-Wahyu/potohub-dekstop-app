# Report Implementasi: Sinkronisasi Aset, Cache Disk Lokal & Offline-First Customer Journey

Dokumen ini mencatat hasil audit, perbaikan arsitektural, dan implementasi pada aplikasi desktop **PotoHub Booth Client** (`dekstop-app`) terkait proses sinkronisasi pengaturan, mekanisme pengunduhan aset krusial (background step, promo banner, stiker/emot, tutorial image, frame layer), dan resolusi offline-first agar customer journey tidak bergantung pada blob storage (Cloudflare R2).

---

## 1. Audit Alur Fetch Saat Sinkronisasi (`ConfigDashboard.svelte`)

Ketika fungsi `handleSync()` pada [`ConfigDashboard.svelte`](/dekstop-app/src/lib/components/shared/ConfigDashboard.svelte) dijalankan, proses sinkronisasi memanggil:

1. **`POST /api/booths/{boothId}/settings/sync`** (via `syncBoothSettings`):
   - Memperbarui `last_sync_at` booth di backend.
   - Mengambil konfigurasi operasional JSONB (`general`, `timer`, `softfile`) dan menyimpannya ke store lokal `boothConfig`.
2. **`GET /api/booths/{boothId}/ui-customize/public`** (via `fetchAndCacheUiConfig`):
   - Mengambil konfigurasi UI: varian template (`v1`, `v2`, `v3`, `custom`), tipografi, urutan metode pembayaran, posisi elemen, dan konfigurasi latar belakang per langkah (`step_styles`).
3. **`GET /api/booths/{boothId}/banners`** (via `fetchBanners`):
   - Mengambil daftar promo banner yang sedang aktif/terjadwal untuk booth tersebut, disimpan ke cache SQLite `banners:{boothId}`.
4. **`GET /api/booths/{boothId}/emots`** (via `fetchEmots` — *Baru ditambahkan*):
   - Mengambil daftar stiker unicode dan stiker gambar untuk booth, disimpan ke cache SQLite `emots:{boothId}`.
5. **`GET /api/booths/{boothId}/transactions/active-qr-tickets`**:
   - Mengambil tiket QR aktif untuk verifikasi transaksi voucher saat offline.
6. **Prefetch Aset Fisik ke Disk Lokal** (via `prefetchBoothAssets`):
   - Mengambil master kategori (`/categories`) dan template aktif (`/templates`).
   - Mengumpulkan seluruh URL aset:
     - Background langkah (`stepStyles` bertipe `image`)
     - Gambar tutorial (`uiConfig.config.tutorialImageUrl`)
     - Logo metode pembayaran (`paymentMethods.logoUrl`)
     - Banner kategori (`categories.banner_url`)
     - Frame template, thumbnail preview, dan gambar layer desain (`design_data.imageUrl`)
     - Banner promosi standby (`banners.image_url`)
     - Stiker gambar (`emots.file_url`)
   - Memanggil `ensureAsset(url)` untuk setiap file:
     - Rust (`download_asset_to_cache`) mem-fetch biner file via `reqwest` dan menyimpannya ke filesystem lokal disk `<app_cache_dir>/assets/{hash}.{ext}`.
     - Menyimpan mapping URL remote ke `cache_key` lokal di tabel SQLite `asset_cache`.

---

## 2. Analisis Mekanisme Penyimpanan: File Fisik vs Base64

Mekanisme caching aset di desktop app bekerja secara **Hybrid**:
1. **Download ke Disk Fisik**: File gambar benar-benar diunduh dan disimpan ke disk lokal (`app_cache_dir/assets/`). File ini persisten di filesystem OS dan tidak hilang saat aplikasi ditutup.
2. **Pembacaan ke Base64 (Data URL)**: Saat komponen UI membutuhkan gambar, Rust membaca file fisik dari disk lokal melalui command `read_cached_asset` dan mengonversinya menjadi Base64 Data URL (`data:image/<mime>;base64,...`).
   - *Alasan*: Menghindari blokir Same-Origin Policy / CSP WebKit saat memuat protokol `file:///` absolut pada webview.

---

## 3. Identifikasi Masalah / Gap Sebelumnya

Sebelum perbaikan ini dilakukan:
1. **Background Step**: File gambar background step sudah terunduh di disk lokal saat prefetch, namun method `uiConfig.getStepStyle(step)` tetap mengembalikan string CSS dengan URL remote mentah (`background: url("https://pub-r2.potohub.com/...")`). Akibatnya browser webview tetap melakukan network request ke Cloudflare R2 / blob storage setiap kali layar berganti.
2. **Stiker / Emots**: Endpoint `fetchEmots()` sama sekali tidak dipanggil saat sync dan tidak dimasukkan ke dalam antrean prefetch. Layar edit foto baru mem-fetch emot saat dibuka dan memuat gambar langsung dari internet.
3. **Tutorial Image**: URL `tutorialImageUrl` belum dimasukkan ke antrean prefetch `collectAssetUrls()`.
4. **Canvas Compositing**: Fungsi `loadImage()` pada `templateComposite.ts` memanggil `fetch_image_as_data_url` yang selalu melakukan HTTP request via `reqwest` ke jaringan tanpa mengecek apakah file sudah ada di disk lokal.

---

## 4. Perubahan & Implementasi Kode

### A. Resolusi Background Step & Tutorial Image (`src/lib/stores/uiConfig.svelte.ts`)
- Menambahkan state reaktif `resolvedBackgrounds = $state<Record<string, string>>({})`.
- Menambahkan method `resolveCachedAssets()`:
  - Memeriksa tabel SQLite `asset_cache` untuk setiap `stepStyles` bertipe `image` dan `tutorialImageUrl`.
  - Jika file sudah ada di disk lokal, panggil `read_cached_asset` dan isi `resolvedBackgrounds[url] = dataUrl`.
  - Dijalankan otomatis saat `init()`, `load()`, dan `save()`.
- Memperbarui `getStepStyle(step)` agar menggunakan nilai `resolvedBackgrounds[s.bgValue]` (Base64 lokal) jika tersedia, sehingga render latar belakang instan tanpa request ke blob storage.
- Menambahkan helper async `getResolvedStepBackground(step)` dan getter `getTutorialImageUrl()`.
- Memperbarui komponen [`V1Tutorial.svelte`](/dekstop-app/src/lib/components/v1/V1Tutorial.svelte), [`V2Tutorial.svelte`](/dekstop-app/src/lib/components/v2/V2Tutorial.svelte), dan [`V3Tutorial.svelte`](/dekstop-app/src/lib/components/v3/V3Tutorial.svelte) agar memprioritaskan `uiConfig.getTutorialImageUrl()`.

### B. Prefetch Stiker & Gambar Tutorial (`src/lib/api/prefetch.ts`)
- Mengimpor `fetchEmots` dari `boothClient.ts`.
- Menambahkan `fetchEmots(boothId)` ke dalam `Promise.allSettled`.
- Menyimpan hasil emot ke cache API SQLite: `writeApiCache("emots:${boothId}", emots.value)`.
- Memasukkan seluruh `emot.file_url` (untuk `emot_type === 'image'`) dan `uiConfig.config.tutorialImageUrl` ke dalam daftar URL yang diunduh via `ensureAsset()`.
- Mengaitkan hasil Data URL langsung ke store: `uiConfig.setResolvedBackground(url, dataUrl)`.

### C. Sinkronisasi Emoticon (`src/lib/api/boothClient.ts`)
- Menambahkan pemanggilan `fetchEmots(boothId)` dan penyimpanan cache SQLite `writeApiCache("emots:${boothId}", emots)` di dalam fungsi `syncBoothSettings()`.

### D. Optimasi Picker Stiker (`src/lib/components/shared/StickerPicker.svelte`)
- Menggunakan `ensureAsset` secara reaktif di `$effect` untuk mengambil Data URL lokal dari stiker gambar.
- Tombol pemilihan stiker mengirimkan Data URL lokal ke kanvas, sehingga preview stiker dan penempatannya di kanvas tidak mem-fetch URL internet.

### E. Template Compositing Offline-First (`src/lib/utils/templateComposite.ts`)
- Memperbarui fungsi `loadImage(src)` agar memanggil `ensureAsset(src)` terlebih dahulu.
- Jika gambar (frame overlay, background template, stiker) sudah ada di disk lokal, kanvas komposit langsung memuat dari cache lokal tanpa melakukan HTTP fetch baru.

---

## 5. Rencana Lanjutan: Pendekatan 1 (`convertFileSrc` / Tauri Asset Protocol)

Meskipun saat ini seluruh aset sudah offline-first dan tidak lagi melakukan fetch ke blob storage, Data URL Base64 memiliki overhead ukuran memori (+33%) dan beban IPC Rust-to-JS.

**Rekomendasi Tahap Berikutnya**:
1. Mengubah Rust command `download_asset_to_cache` agar mengembalikan path file absolut disk.
2. Menggunakan `convertFileSrc(filePath)` bawaan Tauri di frontend untuk menghasilkan URL protokol streaming native (`asset://` atau `http://asset.localhost/...`).
3. Menggantikan Base64 Data URL dengan Asset URL tersebut untuk efisiensi RAM dan akselerasi GPU.

---

## 6. Hasil Pengujian (Verification)

Pemeriksaan tipe Svelte & TypeScript dijalankan via `pnpm check`:
```bash
$ svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
Loading svelte-check in workspace: /home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app
Getting Svelte diagnostics...

svelte-check found 0 errors and 0 warnings
```
Semua file berhasil dikompilasi tanpa error dan tanpa warning.
