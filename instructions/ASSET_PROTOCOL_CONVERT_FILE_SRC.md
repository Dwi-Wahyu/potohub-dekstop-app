# Instruksi Rencana Implementasi: Migrasi ke Tauri Asset Protocol (`convertFileSrc`)

**Target Repositori**: `dekstop-app` (Tauri v2 + SvelteKit + Svelte 5)  
**Tujuan**: Menggantikan pengiriman data Base64 (`data:image/...;base64,...`) antar Rust IPC dan WebView dengan **Tauri Asset Protocol native streaming** (`convertFileSrc`) agar rendering gambar (background step, frame template, stiker, dan promo banner) hemat memori, bebas lag IPC, dan memanfaatkan akselerasi decoding hardware GPU.

---

## 1. Latar Belakang & Masalah Base64

Saat ini, mekanisme caching offline bekerja dengan mengunduh file gambar ke disk (`<app_cache_dir>/assets/<cache_key>`), lalu Rust membaca file tersebut dan meng-encode seluruh biner menjadi string **Base64 Data URL** sebelum dikirim ke frontend melalui IPC Tauri (`read_cached_asset`).

### Kelemahan Base64 pada Photobooth Desktop App:
1. **Overhead Memori (+33%)**: String Base64 membutuhkan memori sepertiga lebih besar dari biner aslinya. Untuk template cetak 300 DPI / resolusi 4K (misal file PNG 10MB), string Base64 di JavaScript memakan ~13.5MB.
2. **Beban IPC & Serialisasi JSON**: Tauri IPC mentransfer payload melalui JSON bridge. Mengirim jutaan karakter Base64 bolak-balik antara proses Rust dan WebView menyebabkan *CPU spike*, alokasi heap V8 besar, dan *Garbage Collection pause* (pemicu lag/stuttering saat pergantian layar customer journey).
3. **DOM & Inline CSS Bloat**: Menempelkan string raksasa pada atribut `style="background: url('data:image/png;base64,...')"` membebani rendering engine WebKit/Blink.

---

## 2. Solusi Target: Tauri Asset Protocol (`convertFileSrc`)

Tauri 2 memiliki protokol internal yang aman (`asset://` pada Linux/macOS atau `http://asset.localhost/` pada Windows) yang secara langsung melakukan *streaming* file lokal dari disk ke WebView tanpa melewati bridge JSON IPC.

### Arsitektur Alur:
```
[Cloudflare R2 / S3 Storage]
       │
       ▼ (download via reqwest saat sync/prefetch)
[Local Disk: <app_cache_dir>/assets/<hash>.<ext>]
       │
       ▼ (Rust get_cached_asset_path -> return path string absolut "/home/.../assets/abc.png")
[Frontend convertFileSrc(absPath)]
       │
       ▼ (menghasilkan URL streaming native: "http://asset.localhost/home/.../abc.png")
[WebView <img> / CSS background: url(...)] (Direct GPU Streaming from Disk)
```

---

## 3. Rencana Perubahan Detail

### A. Konfigurasi Keamanan Tauri (`src-tauri/tauri.conf.json`)
Menambahkan izin `assetProtocol` pada objek `app.security` dengan cakupan (*scope*) direktori cache dan app data:
```json
{
  "app": {
    "security": {
      "csp": null,
      "assetProtocol": {
        "enable": true,
        "scope": [
          "$APPCACHE/**/*",
          "$APPDATA/**/*"
        ]
      }
    }
  }
}
```

### B. Backend Rust (`src-tauri/src/cache.rs` & `src-tauri/src/lib.rs`)
1. **Command Baru `get_cached_asset_path`**:
   - Menerima `cache_key: String`.
   - Mengembalikan path absolut `PathBuf` sebagai string jika file ada di direktori `assets_dir(&app)`.
   - Return `Ok(Some(path_string))` atau `Ok(None)` jika belum ada.
2. **Update Command `download_asset_to_cache`**:
   - Setelah menulis file ke disk, kembalikan path absolut dari file yang tersimpan (bukan hanya key relatif).
3. **Registrasi Handler di `src-tauri/src/lib.rs`**:
   - Mendaftarkan command baru `cache::get_cached_asset_path` ke dalam `tauri::generate_handler!`.

### C. Helper Caching Frontend (`src/lib/utils/offlineCache.ts`)
1. Mengimpor `convertFileSrc` dari `@tauri-apps/api/core`.
2. Memperbarui fungsi `ensureAsset(url: string)`:
   - Jika URL sudah diawali `http://asset.localhost`, `asset:`, atau `data:`, langsung kembalikan.
   - Cek SQLite `asset_cache` untuk mendapatkan `cache_key`.
   - Panggil `get_cached_asset_path(cache_key)` ke Rust:
     - Jika path fisik ditemukan, ubah menjadi streaming URL dengan `convertFileSrc(absPath)`.
   - Jika belum ada di disk:
     - Panggil `download_asset_to_cache`, dapatkan path absolutnya.
     - Simpan metadata ke SQLite `setAssetCacheMeta`.
     - Kembalikan `convertFileSrc(absPath)`.
   - Tetap sediakan fallback ke `read_cached_asset` (Data URL) atau `fetch_image_as_data_url` jika terjadi kesalahan runtime protokol.

### D. Store UI Config (`src/lib/stores/uiConfig.svelte.ts`)
1. Memperbarui `resolveCachedAssets()`:
   - Alih-alih memanggil `read_cached_asset` yang menghasilkan Base64, panggil `get_cached_asset_path` lalu konversikan dengan `convertFileSrc(absPath)`.
   - Simpan URL protokol aset native ke dalam `resolvedBackgrounds[url]`.
2. Pada `getStepStyle(step)`:
   - Nilai `val` akan berupa `http://asset.localhost/...` yang langsung dikenali dan di-render oleh CSS `background: url("${val}") center / cover no-repeat`.

### E. Template Compositing & Printing (`src/lib/utils/templateComposite.ts`)
1. `loadImage(src)`:
   - Jika `ensureAsset(src)` mengembalikan `http://asset.localhost/...` atau `asset://`, objek `new Image()` browser secara native dapat memuat gambar tersebut secara instan via streaming disk tanpa tainted canvas (karena diizinkan oleh Tauri webview).

---

## 4. Rencana Langkah Eksekusi

1. **Step 1**: Edit `src-tauri/tauri.conf.json` untuk mengaktifkan `assetProtocol`.
2. **Step 2**: Edit `src-tauri/src/cache.rs` dan `src-tauri/src/lib.rs` untuk menambahkan `get_cached_asset_path` dan update `download_asset_to_cache`.
3. **Step 3**: Jalankan `cargo check` untuk memvalidasi kompilasi Rust.
4. **Step 4**: Edit `src/lib/utils/offlineCache.ts` untuk mengintegrasikan `convertFileSrc`.
5. **Step 5**: Edit `src/lib/stores/uiConfig.svelte.ts` agar `resolveCachedAssets` menggunakan `convertFileSrc`.
6. **Step 6**: Jalankan `pnpm check` (`svelte-check`) untuk memastikan integritas tipe frontend.
7. **Step 7**: Tulis laporan hasil implementasi di `instructions-reports/`.
