# Panduan App Release & Auto-Updater — PotoHub Booth Client

Dokumen ini menjelaskan cara kerja fitur **App Release** dan **In-Place Auto-Updater (Tauri v2)** pada aplikasi desktop `PotoHub Booth Client`, termasuk cara kerja signature (`.sig`), otomatisasi signing saat build, pencegahan kebocoran key ke GitHub, serta standar format installer Windows (`.msi` vs `.exe`).

---

## 1. Arsitektur Alur Rilis & Auto-Update

Fitur update aplikasi desktop menghubungkan **3 komponen**:

1. **Desktop Client (`dekstop-app`)**
   - Konfigurasi plugin `@tauri-apps/plugin-updater` berada di [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json):
     - `plugins.updater.pubkey`: Kunci publik Minisign (aman disimpan di repo) untuk memverifikasi keaslian paket update sebelum dipasang.
     - `plugins.updater.endpoints`: Mengarah ke `https://potohub.com/api/app/update/{{target}}/{{arch}}/{{current_version}}`.
   - Logika frontend pengecekan & instalasi update ada di [`src/lib/utils/updater.svelte.ts`](../src/lib/utils/updater.svelte.ts) yang memanggil:
     - `GET /api/app/releases/latest` untuk mengambil `version_name` & changelog markdown.
     - `check()` dari `@tauri-apps/plugin-updater` untuk membandingkan versi, memverifikasi `signature`, mengunduh paket dari `url`, lalu me-relaunch aplikasi.
2. **Backend API (`api`)**
   - `GET /api/app/update/{target}/{arch}/{current_version}`: Mengembalikan JSON `{ version, notes, pub_date, signature, url }` (HTTP `200`) jika ada rilis aktif lebih baru, atau `204 No Content` jika sudah versi terbaru.
   - `GET /api/app/releases/latest` & `GET /api/app/releases`: Mengembalikan detail rilis aktif terbaru / daftar seluruh rilis.
   - `POST /api/app/releases`, `PUT /api/app/releases/{id}`, `DELETE /api/app/releases/{id}`, `POST /api/app/releases/upload-url`: Endpoint manajemen CRUD rilis & upload artefak ke Cloudflare R2 (**khusus `SuperAdmin`**).
3. **Admin Dashboard (`admin-dashboard`)**
   - Panel manajemen rilis tersedia untuk **Superadmin** pada menu **Desktop Releases** (`/platform/releases`), mendukung upload paket ke R2, pembacaan file `.sig` langsung dari komputer lokal, pengaturan `is_active`, `is_mandatory`, changelog markdown, dan edit/hapus rilis.

---

## 2. Apakah Harus Menjalankan `tauri signer sign` Setiap Build?

**Tidak harus dijalankan manual setiap kali build.** Ada 2 mode kerja yang bisa dipilih:

### A. Mode Otomatis (Direkomendasikan untuk Build Rutin / CI)
1. Pastikan `createUpdaterArtifacts` diaktifkan pada [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) saat merilis updater:
   ```json
   "bundle": {
     "active": true,
     "createUpdaterArtifacts": true,
     "targets": ["msi"]
   }
   ```
   *(Catatan: Jika `createUpdaterArtifacts: true` diaktifkan, setiap `pnpm tauri build` mewajibkan `TAURI_SIGNING_PRIVATE_KEY` tersedia di environment).*
2. Set environment variable sebelum menjalankan `pnpm tauri build` (atau simpan di **GitHub Actions Secrets**):
   - `TAURI_SIGNING_PRIVATE_KEY` (isi teks private key atau path ke file key di luar repo)
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (jika private key diberi passphrase)
3. Saat `pnpm tauri build` selesai, Tauri **otomatis menghasilkan file installer sekaligus file `.sig`** pasangannya di `src-tauri/target/release/bundle/...` tanpa perlu menjalankan `pnpm tauri signer sign` secara terpisah.

### B. Mode Manual (Jika Build Tanpa Env Signing)
Jika Anda terlanjur melakukan build tanpa menyetel `TAURI_SIGNING_PRIVATE_KEY`, jalankan perintah berikut untuk menghasilkan file `.sig`:
```bash
TAURI_SIGNING_PRIVATE_KEY="path/ke/private.key" pnpm tauri signer sign path/ke/file-installer
```
Perintah ini akan menghasilkan file `<nama-file>.sig` di lokasi yang sama, sekaligus mencetak isi signature yang bisa disalin ke Dashboard Superadmin.

> **Penting:** `pnpm tauri signer generate` cukup dijalankan **SEKALI** saja di awal proyek untuk membuat pasangan *private key* dan *public key* (`pubkey`). Jika Anda mengganti pasangan key (`pubkey` baru di `tauri.conf.json`), aplikasi versi lama yang memakai `pubkey` lama **tidak akan bisa memverifikasi** rilis baru yang ditandatangani dengan key baru.

---

## 3. Keamanan Key & Pencegahan Kebocoran (Leak) di GitHub

- **Yang BOLEH masuk ke GitHub:**
  - `plugins.updater.pubkey` di `src-tauri/tauri.conf.json`. Ini adalah **kunci publik** yang memang didesain untuk ikut dibundle di aplikasi client.
  - File `.sig` atau isi kolom *Signature* di database/dashboard. Ini hanyalah hasil tanda tangan file rilis, bukan kunci rahasia.
- **Yang DILARANG KERAS masuk ke GitHub:**
  - **Private Key Signing** (`TAURI_SIGNING_PRIVATE_KEY`, file `.key`, `.pem`, `.minisign`, folder `.tauri/`).
  - **Passphrase Private Key** (`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
  - **Token & Env lokal** (`.env`, `.env.local`, `GITHUB_TOKEN`, kredensial R2/API).

### Checklist Keamanan Repositori Ini
- File `.env` dan `.env.*` (kecuali `.env.example`) sudah di-ignore oleh `.gitignore`.
- Pola `*.key`, `*.pem`, `*.p12`, `*.pfx`, `*.minisign`, dan `.tauri/` juga di-ignore di `.gitignore` agar private key tidak pernah ter-commit secara tidak sengaja.
- Simpan `TAURI_SIGNING_PRIVATE_KEY` dan `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` **hanya** di:
  - **GitHub Repository -> Settings -> Secrets and variables -> Actions** (untuk CI/CD), dan/atau
  - Password manager / penyimpanan terenkripsi tim dev di luar folder repositori (misalnya `~/.tauri/potohub.key`).
- Di workflow CI (`.github/workflows/build-release.yml` / `build-windows.yml`), teruskan via `${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}`, jangan pernah hardcode di YAML.

---

## 4. Konsistensi Format Installer Windows: `.msi` vs `.exe` (NSIS)

### Apa yang Terjadi Jika Instalasi Awal & Update Berbeda Format?
Di Windows, Tauri mendukung dua format installer utama: **WiX (`.msi`)** dan **NSIS (`-setup.exe`)**. Keduanya menggunakan mekanisme *Windows Installer / Uninstall Registry* yang berbeda:

- Jika perangkat booth awalnya diinstal menggunakan **`.msi`**, lalu server mengirimkan paket update **`.exe` (NSIS)** (atau sebaliknya):
  - Windows **tidak menganggap keduanya sebagai aplikasi yang sama untuk in-place upgrade**.
  - Akibatnya dapat terjadi **instalasi ganda** (muncul 2 entri *PotoHub Booth Client* di *Apps & Features*), shortcut desktop/Start Menu masih mengarah ke instalasi lama, atau proses update gagal menggantikan executable yang sedang berjalan dengan bersih.
- Selain itu, endpoint backend `/api/app/update/{target}/{arch}/{current_version}` mengirimkan **satu** URL untuk target `windows-x86_64` tanpa membedakan apakah perangkat sebelumnya diinstal via `.msi` atau `.exe`.

### Rekomendasi Standar: Seragamkan 1 Format Tetap
Ya — **seragamkan dan kunci pada 1 format saja** mulai dari instalasi awal hingga seluruh rilis auto-update ke depan:

- **Opsi 1 — Fix menggunakan `.msi` (Disarankan jika perangkat di lapangan saat ini sudah terinstal via `.msi`)**
  - Seluruh booth client yang sudah terpasang via `.msi` akan ter-upgrade secara *in-place* dengan rapi tanpa instalasi ganda.
  - Set `bundle.targets` di `src-tauri/tauri.conf.json` menjadi `["msi"]`.
  - Di panel **Desktop Releases** (`/platform/releases`), selalu upload file `.msi` + signature dari `.msi.sig`.
  - Di halaman **Download App** (`/download-app`), arahkan installer Windows ke `.msi`.
- **Opsi 2 — Fix menggunakan `-setup.exe` (NSIS)**
  - Cocok jika mayoritas booth memakai `-setup.exe` (NSIS), karena NSIS juga memakai custom hook `windows/hooks.nsh` dan instalasi lebih cepat tanpa ketergantungan WiX Toolset.
  - Set `bundle.targets` menjadi `["nsis"]`.
  - Di panel **Desktop Releases**, selalu upload `*-setup.exe` (atau `.nsis.zip` jika mode `v1Compatible`) + `.sig` pasangannya.

> **Catatan Migrasi Jika di Lapangan Ada Campuran `.msi` dan `.exe`:**
> Sebelum menyeragamkan auto-update ke satu format (misalnya `.msi`), lakukan **1 kali uninstall versi lama** pada perangkat yang sebelumnya memakai format berbeda (`.exe`), lalu install ulang menggunakan format standar (`.msi`). Setelah seragam, seluruh pembaruan berikutnya via *One-Click Sync Update* akan berjalan konsisten dan aman. *(Data SQLite lokal di `%APPDATA%` tidak hilang saat uninstall-reinstall standar, namun tetap disarankan backup konfigurasi bila diperlukan).*

---

## 5. Checklist Merilis Versi Baru ke Superadmin Panel

1. Naikkan versi di `dekstop-app/src-tauri/tauri.conf.json`, `dekstop-app/package.json`, dan `dekstop-app/src-tauri/Cargo.toml` (mis. `0.2.0` — gunakan format Semver yang valid).
2. Build aplikasi dengan signing aktif (`TAURI_SIGNING_PRIVATE_KEY` terpasang).
3. Siapkan 2 file hasil build untuk platform target (misal `.msi` dan `.msi.sig`).
4. Login sebagai **Superadmin** di Admin Dashboard -> buka menu **Desktop Releases** (`/platform/releases`).
5. Klik **Tambah Rilis Baru**:
   - Isi **Versi (Semver)** (harus sama persis dengan versi build, mis. `0.2.0`).
   - Pilih **Target Platform** (`windows-x86_64`).
   - Klik **Upload ke R2** untuk mengunggah file installer (atau tempel URL R2).
   - Klik **Muat file .sig** dan pilih file `.sig` pendampingnya.
   - Tulis **Catatan Rilis / Changelog** (format Markdown).
   - Atur toggle **Aktif (Auto-Update)** dan **Wajib Update (Mandatory)** sesuai kebutuhan, lalu simpan.
6. Verifikasi pada salah satu unit booth client bahwa popup update muncul, proses unduh & verifikasi signature berhasil, dan aplikasi restart ke versi baru.
