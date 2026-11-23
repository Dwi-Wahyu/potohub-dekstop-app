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
Jika Anda melakukan build tanpa menyetel `TAURI_SIGNING_PRIVATE_KEY` (seperti konfigurasi default `tauri.conf.json` saat ini), jalankan perintah berikut setelah `pnpm tauri build` selesai untuk menghasilkan file `.sig`:

```powershell
pnpm tauri signer sign -f "path\ke\potohub.key" -p "<PASSPHRASE_KEY>" --app-version "<VERSI_SEMVER>" "src-tauri/target/release/bundle/msi/PotoHub Booth Client_<VERSI_SEMVER>_x64_en-US.msi"
```

> **Penting:**
> - `--app-version` **wajib sama persis** dengan versi build dan versi rilis di Admin Dashboard (misalnya `0.1.1`). Pada `tauri-plugin-updater` v2, jika nilai `version:` di `trusted comment` signature berbeda dengan versi yang diumumkan server, update akan ditolak dengan error **`SignedVersionMismatch`**.
> - Setiap kali file `.msi` di-build ulang, **wajib generate ulang `.sig`** dan **upload ulang keduanya** (`.msi` baru + `.sig` / `Public signature` baru) karena signature terikat ke byte `.msi` hasil build tersebut.
> - `pnpm tauri signer generate` cukup dijalankan **SEKALI** saja di awal proyek untuk membuat pasangan *private key* dan *public key* (`pubkey`). Jika Anda mengganti pasangan key (`pubkey` baru di `tauri.conf.json`), aplikasi versi lama yang memakai `pubkey` lama **tidak akan bisa memverifikasi** rilis baru yang ditandatangani dengan key baru.

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

## 5. Workflow Step-by-Step Build & Merilis Versi Baru ke Superadmin Panel

1. **Naikkan versi Semver secara konsisten di 3 file** sebelum build:
   - [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) (`"version"` — **sumber utama** penamaan MSI, `ProductVersion`, `getVersion()`, dan `{{current_version}}` Tauri updater)
   - [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml) (`version`)
   - [`package.json`](../package.json) (`"version"`)
   *(Jika hanya `Cargo.toml` yang dinaikkan sementara `tauri.conf.json` tidak diubah, hasil build `.msi` tetap berversi lama.)*
2. **Pastikan build & type-check aman:**
   ```powershell
   pnpm check
   pnpm tauri build
   ```
   Output installer MSI akan berada di:
   `src-tauri/target/release/bundle/msi/PotoHub Booth Client_<VERSI>_x64_en-US.msi`
   *(Jangan me-rename manual file MSI versi lama menjadi versi baru karena versi internal MSI tetap versi lama.)*
3. **Generate file signature (`.msi.sig`):**
   ```powershell
   pnpm tauri signer sign -f "path\ke\potohub.key" -p "<PASSPHRASE>" --app-version "<VERSI>" "src-tauri/target/release/bundle/msi/PotoHub Booth Client_<VERSI>_x64_en-US.msi"
   ```
   Perintah ini menghasilkan file `.msi.sig` dan mencetak string **Public signature** (base64).
4. **Upload ke Admin Dashboard (Superadmin):**
   - Login sebagai **Superadmin** di Admin Dashboard -> buka menu **Desktop Releases** (`/platform/releases`).
   - Klik **Tambah Rilis Baru** (atau edit rilis):
     - Isi **Versi (Semver)** persis sama dengan versi build & `--app-version` (mis. `0.1.1`).
     - Pilih **Target Platform** (`windows-x86_64`).
     - Upload file `.msi` baru ke R2.
     - Upload file `.msi.sig` baru (atau tempel **Public signature** baru ke field signature).
     - Tulis **Catatan Rilis / Changelog** (format Markdown).
     - Atur toggle **Aktif (Auto-Update)** dan **Wajib Update (Mandatory)** sesuai kebutuhan, lalu simpan.
5. **Verifikasi:** Uji pada aplikasi client versi sebelumnya bahwa dialog update muncul, proses unduh & verifikasi signature berhasil, dan aplikasi restart ke versi baru.

---

## 6. Troubleshooting Error Updater Umum

- **`Invalid encoding in minisign data`:**
  - Terjadi jika `pubkey` yang tertanam di `.exe` terpasang korup/bukan 42-byte Minisign key valid, atau isi kolom `signature` di server terpotong / bukan base64 valid dari file `.sig` 4 baris.
  - Jika penyebabnya adalah binary lama yang membawa `pubkey` lama/korup, perangkat tersebut wajib di-install manual 1x dengan installer `.msi` baru yang sudah membawa `pubkey` valid.
- **`SignedVersionMismatch` (`signed` vs `announced`):**
  - Terjadi jika `--app-version` saat `tauri signer sign` berbeda dengan versi yang diumumkan API `/api/app/update/...` (misalnya sign dengan `--app-version "0.1.0"` untuk rilis `0.1.1`). Generate ulang `.sig` dengan `--app-version` yang tepat dan upload ulang ke server.
- **UI update tampak selesai 100% tapi versi aplikasi tidak berubah setelah restart:**
  - Pastikan tidak ada error native updater yang tertelan di log; sejak versi `0.1.1`, [`updater.svelte.ts`](../src/lib/utils/updater.svelte.ts) dan [`UpdateModal.svelte`](../src/lib/components/shared/UpdateModal.svelte) menghentikan proses dan menampilkan layar **Pembaruan Gagal** apabila `downloadAndInstall()` gagal.
- **DevTools terbuka di build development vs release:**
  - Pada [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json), `app.windows[0].devtools` diset `false` dan [`src-tauri/src/main.rs`](../src-tauri/src/main.rs) membersihkan argumen `--auto-open-devtools-for-tabs` agar DevTools tidak terbuka otomatis saat aplikasi dijalankan. Gunakan file log aplikasi (`potohub.log`) untuk inspeksi diagnostik.
