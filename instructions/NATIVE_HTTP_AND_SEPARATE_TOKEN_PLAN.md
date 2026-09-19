# Rencana Implementasi: Desktop App — Tauri Native HTTP, Persistent Cookie Jar & Pemisahan Token

**Target Repositori:** `dekstop-app` (Tauri v2 + Svelte 5)  
**Tujuan:** Mengintegrasikan Tauri Native HTTP Client untuk mendukung cookie `SameSite=Strict` tanpa terhalang WebView, mengelola persistensi sesi di Rust, memisahkan Booth Token (365 hari) dari User Token (15 menit), dan mempertahankan alur otentikasi PIN lokal bagi operator.

---

## 1. Latar Belakang & Analisis Masalah

1. **Keterbatasan WebView terhadap `SameSite=Strict`**:
   Saat ini, `dekstop-app` menggunakan `window.fetch()` di lingkungan WebView (`tauri://localhost` atau `http://tauri.localhost`). Jika API backend menerapkan `SameSite=Strict`, WebView menganggap request ke `https://potohub.dwiwahyu.my.id/api` sebagai Cross-Site, sehingga cookie `potohub_refresh_token` ditolak.
   **Solusi:** Migrasi ke Tauri Native HTTP Client (`@tauri-apps/plugin-http`) yang dieksekusi di level OS oleh Rust (`reqwest`), kebal terhadap batasan CORS dan SameSite browser.

2. **Masalah Penimpaan Token di `onboarding/+page.svelte`**:
   Saat ini, ketika user/operator melakukan login email & password di [`src/routes/onboarding/+page.svelte`](../src/routes/onboarding/+page.svelte):
   ```typescript
   const data = await loginUser(email.trim(), password);
   if (data.token) {
     await saveActivation({ ...activation, token: data.token });
   }
   ```
   Token operator booth yang berumur 365 hari **tertimpa** oleh user token yang hanya berumur 15 menit. Akibatnya, setelah 15 menit, seluruh request API booth gagal dengan error 401.
   **Solusi:** Pisahkan `booth_token` (kredensial mesin) dan `user_token` (kredensial operator/admin) di SQLite `app.db`.

3. **Kebutuhan Bisnis Operator (PIN Lokal)**:
   Operator cukup melakukan aktivasi booth sekali. Untuk operasional sehari-hari dan membuka menu Settings, operator cukup memasukkan **PIN 4 digit** lokal tanpa perlu mengetik ulang email dan password berulang kali.

---

## 2. Rincian Langkah Implementasi

### Langkah 1: Instalasi & Konfigurasi Tauri Native HTTP Plugin
1. **Tambah dependensi Rust:**
   Pada `src-tauri/Cargo.toml`:
   ```toml
   [dependencies]
   tauri-plugin-http = "2"
   ```
2. **Tambah dependensi NPM:**
   Pada `package.json`:
   ```json
   "@tauri-apps/plugin-http": "^2"
   ```
3. **Daftarkan plugin di Rust:**
   Pada `src-tauri/src/lib.rs`:
   ```rust
   .plugin(tauri_plugin_http::init())
   ```
4. **Berikan izin di capabilities:**
   Pada `src-tauri/capabilities/default.json`:
   Tambahkan izin `"http:default"` atau `"http:allow-fetch"` ke dalam array `"permissions"`.

### Langkah 2: Persistensi Cookie Jar di Level Rust / Native
Untuk memastikan cookie `potohub_refresh_token` (HttpOnly, SameSite=Strict) tetap tersimpan saat aplikasi ditutup dan dibuka kembali:
- Buat modul Rust cookie manager / persisten jar (atau simpan cookie terenkripsi di SQLite `app.db` via Tauri command khusus) yang otomatis memuat ulang cookie saat aplikasi dijalankan kembali.

### Langkah 3: Pemisahan Skema Database di SQLite (`src/lib/db/local.ts`)
1. **Tabel `booth_activation`**:
   Tetap menyimpan `token` sebagai **Booth Token** (365 hari) yang diperoleh saat `POST /api/booths/activate`. Nilai ini TIDAK BOLEH ditimpa oleh login user.
2. **Tabel Baru `user_session`**:
   Tambahkan migrasi SQLite v8:
   ```sql
   CREATE TABLE IF NOT EXISTS user_session (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       user_id TEXT NOT NULL,
       name TEXT NOT NULL,
       email TEXT NOT NULL,
       role TEXT NOT NULL,
       token TEXT NOT NULL,
       expires_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
   );
   ```
3. Sediakan fungsi pendukung di `local.ts`:
   - `getUserSession(): Promise<UserSession | null>`
   - `saveUserSession(session: UserSession): Promise<void>`
   - `clearUserSession(): Promise<void>`

### Langkah 4: Modifikasi Client API & Interceptor di `boothClient.ts`
1. **Ganti `window.fetch` dengan `tauriFetch`**:
   ```typescript
   import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
   ```
2. **Pembedaan Header Autentikasi**:
   - Untuk operasional booth kiosk (transaksi, cetak, unggah galeri, verifikasi tiket): Gunakan `Booth Token` dari `getActivation()`.
   - Untuk endpoint khusus konfigurasi/pengaturan manajemen pengguna: Gunakan `User Token` dari `getUserSession()`.
3. **401 Interceptor dengan Auto-Refresh**:
   Jika request menggunakan User Token menghasilkan 401:
   - Panggil `POST /api/auth/refresh` via `tauriFetch`.
   - Karena request dieksekusi oleh Rust Native HTTP, cookie `potohub_refresh_token` (Strict & HttpOnly) otomatis disertakan.
   - Simpan access token baru ke `user_session` dan retry request asli.

### Langkah 5: Perbaikan Alur di `onboarding/+page.svelte` & `settings`
1. Pada `handleLogin`:
   - Jangan simpan token ke `booth_activation`. Simpan ke `user_session`.
   - Jika booth belum aktif, arahkan ke aktivasi booth.
   - Jika booth sudah aktif, lanjutkan ke `/settings` atau `/?journey=1`.
2. Pada `PinPad`:
   - Tetap validasi PIN lokal (`boothConfig.config.pin`) untuk kemudahan operator mengakses Settings tanpa perlu mengulang kredensial password.

---

## 3. Rencana Verifikasi & Pengujian

1. **Uji Kompilasi Rust (`cargo check` di `src-tauri`)**:
   Memastikan plugin HTTP dan migrasi database terkompilasi bersih.
2. **Uji Panggilan API via `tauriFetch`**:
   - Jalankan request ke `https://potohub.dwiwahyu.my.id/api/...`.
   - Pastikan request berhasil dan cookie `SameSite=Strict` dikirimkan tanpa blokir browser.
3. **Uji Ketahanan Sesi (Session Persistence & Restart)**:
   - Login user di desktop.
   - Tutup aplikasi desktop dan buka kembali.
   - Pastikan sesi berhasil diperbarui via silent refresh menggunakan cookie yang tersimpan.
4. **Uji Independensi Booth Token**:
   - Pastikan aktivasi booth bertahan 365 hari dan transaksi kiosk tetap berjalan normal tanpa terpengaruh kedaluwarsa sesi user di menu Settings.
