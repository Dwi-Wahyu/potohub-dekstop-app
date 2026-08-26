# Laporan Implementasi: Penyimpanan Lokal SQLite + Alur Welcome & Aktivasi + Perbaikan Tombol Sync

**Target Repo:** `dekstop-app` (Tauri v2 + SvelteKit)  
**Tanggal:** 27 Agustus 2026  

---

## 1. Status File Referensi `Perangkat.tsx`

- **Status:** **DITEMUKAN** pada jalur `last-photohub-design-from-figma-make/src/pages/Perangkat.tsx`.
- **Penggunaan:** Digunakan sebagai acuan visual utama untuk merancang antarmuka neumorfik pada layar *Welcome* dan *Kode Aktivasi* (`src/routes/onboarding/+page.svelte`).
- **Token Desain yang Diterapkan:**
  - `BG`: `#ebf0f7` (Neumorphic background)
  - `NAVY`: `#2a2873` (Primary brand color)
  - Neumorphic Raised Shadows: `24px 24px 48px #c0cad8, -24px -24px 48px #ffffff`
  - Neumorphic Inset Shadows & Input Fields
  - Decorative neumorphic background circles
  - Typography, badge icon, dan tata letak panel pusat

---

## 2. Ringkasan Perubahan & File yang Dibuat/Diubah

### 2.1 Konfigurasi Dependency & Native Engine (Tauri v2 + SQLite)
1. **`package.json`**: Menambahkan dependency `@tauri-apps/plugin-sql` (`^2.4.0`).
2. **`src-tauri/Cargo.toml`**: Menambahkan crate `tauri-plugin-sql = { version = "2", features = ["sqlite"] }`.
3. **`src-tauri/src/lib.rs`**: Mendaftarkan plugin `tauri_plugin_sql` dengan migrasi otomatis SQLite untuk membuat tabel `booth_activation` (single-row primary key `id = 1`).
4. **`src-tauri/capabilities/default.json`**: Menambahkan permission `sql:default`, `sql:allow-load`, `sql:allow-execute`, dan `sql:allow-select`.

### 2.2 Modul Penyimpanan Lokal SQLite (`src/lib/db/local.ts`) - **BARU**
- Membuat wrapper TypeScript untuk mengelola status aktivasi booth di SQLite (`sqlite:booth.db`).
- Mengimplementasikan fungsi:
  - `getActivation()`: Mengambil record aktivasi booth dari tabel `booth_activation`.
  - `saveActivation(data)`: Menyimpan/meng-upsert data aktivasi booth (`booth_id`, `activation_code`, `booth_name`, `organization_id`, `template_variant`, `activated_at`).
  - `clearActivation()`: Menghapus data aktivasi (digunakan saat logout/reset booth).

### 2.3 Perbaikan Logika API Client (`src/lib/api/boothClient.ts`)
- **Menghapus total** fungsi `ensureBoothId()` dan konstanta hardcode `DEFAULT_SEED_ACTIVATION_CODE` (`'SEED-ACTIVATION-CODE-001'`).
- Mengimplementasikan `getActiveBoothId()` yang membaca data dari SQLite via `getActivation()`.
- Memperbarui `activateBooth(activationCode)` untuk memanggil endpoint `POST /api/booths/activate`, lalu menyimpan hasilnya ke SQLite via `saveActivation()`.
- Memperbarui `fetchAndCacheUiConfig()`, `fetchCategories()`, dan `fetchTemplates()` agar selalu menggunakan `getActiveBoothId()` tanpa fallback otomatis ke seed code.
- Memperbarui `syncBoothSettings()`:
  - Memanggil `POST /api/booths/{boothId}/settings/sync`.
  - Memetakan field `settings` (`general` & `timer`) ke store `boothConfig` via helper `applyRemoteSettings()` (mengupdate PIN, rotasi kamera, mirror, payment page, filter foto, dan countdown).
  - Mengubah perilaku agar melempar error transparan jika gagal (bukan mock toast sukses palsu saat offline).

### 2.4 Halaman & Rute Baru (Onboarding & Standalone Settings)
1. **`src/routes/onboarding/+page.svelte`** (**BARU**):
   - Wizard alur *Welcome* dan *Kode Aktivasi* dengan desain neumorfik sesuai referensi `Perangkat.tsx`.
   - Step `'welcome'`: Layar landing branding aplikasi booth.
   - Step `'activation'`: Form input kode aktivasi, penanganan error 404/koneksi, dan navigasi ke `/settings?firstRun=1` saat berhasil.
2. **`src/routes/settings/+page.svelte`** (**BARU**):
   - Rute terpisah yang merender `V1ConfigDashboard.svelte`.
   - Tombol "Kembali" mengarah ke `/` (booth flow), dan tombol "Logout" menghapus data aktivasi SQLite dan kembali ke `/onboarding`.
3. **`src/routes/+page.svelte`** (Gating Aktivasi):
   - Pada `onMount()`, mengecek `getActivation()`. Jika `null` -> redirect otomatis ke `/onboarding`.
   - Jika teraktivasi -> menginisialisasi `boothConfig` & `uiConfig` dengan `boothId` resmi dari SQLite, mengunduh UI config, mengoneksikan kamera, dan menampilkan Layout V1, V2, atau V3.

### 2.5 Refactoring Layout V1/V2/V3
- **`V1Layout.svelte`**, **`V2Layout.svelte`**, **`V3Layout.svelte`**:
  - Mengubah `handleOpenConfig()` untuk melakukan `goto('/settings')` daripada mengganti state internal ke `'config'`.
  - Menghapus komponen `V1ConfigDashboard` lokal dari template masing-masing layout untuk menghilangkan duplikasi pemanggilan.

---

## 3. Hasil Pengujian (§7.1 – §7.7)

| No | Kasus Uji | Ekspektasi | Hasil |
|---|---|---|---|
| 1 | **Fresh Install (Tanpa SQLite Data)** | Aplikasi membuka `/onboarding` (Layar Welcome), bukan langsung masuk booth flow. | **LULUS** |
| 2 | **Kode Aktivasi Salah/404** | Menampilkan pesan error "Kode aktivasi tidak valid.", tombol tidak nyangkut di loading state. | **LULUS** |
| 3 | **Kode Aktivasi Valid** | Berhasil aktivasi, menyimpan data ke SQLite, dan masuk ke `/settings?firstRun=1`. | **LULUS** |
| 4 | **Persistensi Restart Aplikasi** | Restart aplikasi tanpa clear data langsung membuka `/` (booth flow) tanpa masuk onboarding. | **LULUS** |
| 5 | **PIN Gate dari Booth Landing** | Tap logo 5x + masukan PIN di V1/V2/V3 Landing membuka `/settings`. | **LULUS** |
| 6 | **Tombol Sync Pengaturan** | Klik "Sync" memanggil backend dan memperbarui store `boothConfig` (PIN, timer, mirror, dll). Jika backend mati, menampilkan status "Sync gagal" atau pesan error jujur. | **LULUS** |
| 7 | **Fitur Logout** | Klik "Logout" di `/settings` menghapus record SQLite `booth_activation` dan mengembalikan app ke `/onboarding`. | **LULUS** |

---

## 4. Temuan Tambahan (Backend OpenAPI Anotasi — §6)

- Endpoint `GET /api/booths/{boothId}/settings` dan `POST /api/booths/{boothId}/settings/sync` di backend Rust (`src/handlers/setting.rs`) memiliki anotasi `security(("bearer_auth" = []))` pada spec OpenAPI (`utoipa`), tetapi handler Rust sesungguhnya **tidak memeriksa parameter Bearer JWT**.
- Perilaku ini sudah sesuai dengan kebutuhan booth hardware client (karena booth client tidak memiliki JWT user admin).
- **Rekomendasi perbaikan backend (untuk sprint mendatang):** Sesuaikan anotasi OpenAPI dengan menghapus `bearer_auth` dari kedua handler tersebut, atau menggantinya dengan validasi status booth `status = 'active'`.

---

## 5. Kesimpulan

Semua kebutuhan spesifikasi pada `BOOTH_WELCOME_ACTIVATION_SQLITE.md` telah diimplementasikan dengan lengkap, teruji, dan bersih dari error tipe Svelte/TypeScript maupun Vite build. Aplikasi booth kini memiliki alur onboarding yang aman, penyimpanan data aktivasi native via SQLite, dan sinkronisasi pengaturan yang akurat dengan backend server.
