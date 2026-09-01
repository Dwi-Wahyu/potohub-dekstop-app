# Photobooth Desktop App (Tauri v2 + SvelteKit + libgphoto2)

Sistem Aplikasi Photobooth Desktop modern yang dibangun menggunakan **Tauri v2**, **SvelteKit 2 (Svelte 5 Runes)**, **Tailwind CSS v4**, serta modul backend Rust berkinerja tinggi untuk pengontrolan kamera digital USB (**libgphoto2**) dan pencetakan langsung (**DNP DS-RX1HS / WinSpool / CUPS**).

---

## 📋 Fitur Utama

- 📷 **Kontrol Kamera USB Multi-Vendor**: Mendukung kamera DSLRs dan Mirrorless (Canon, Nikon, Sony, Fuji, dll.) via USB menggunakan `libgphoto2`.
- 🔴 **Live Preview IPC Stream**: Streaming liveview frame real-time berkecepatan tinggi via Blob URL tanpa memerlukan server HTTP eksternal.
- ⚙️ **Pengaturan Shutter & Exposure**: Pengaturan ISO, Shutter Speed (Tv), Aperture (Av), dan Exposure Compensation secara langsung dari antarmuka antarmuka aplikasi.
- 🖨️ **Integrasi Printer Langsung**: Cetak otomatis/manual ke printer photobooth (DNP DS-RX1HS, DNP DS620, dll.) via buffer memori langsung.
- 🔔 **Peringatan Kertas Menipis (Paper Out Reminder)**: Monitoring sisa kertas printer dan batas alarm lembar kertas.

---

## 📌 Prasyarat Pengembangan & Perangkat (Prerequisites)

Sebelum melakukan installasi dan menjalankan aplikasi ini, pastikan sistem Anda memenuhi prasyarat berikut:

### 1. Software & Environment Requirements
- **Node.js**: Versi `18.0.0` atau yang lebih baru (direkomendasikan Node 20 LTS).
- **Package Manager**: `pnpm` (`v8.0` atau yang lebih baru). Install via `npm i -g pnpm`.
- **Rust Toolchain**: Rust compiler (`rustc`) & `cargo` edisi 2021 (v1.75+). Install via [rustup.rs](https://rustup.rs/).
- **C/C++ Build Environment**:
  - **Linux**: `build-essential` / `base-devel`.
  - **Windows**: Visual Studio Build Tools (C++ workload) atau MSYS2 MinGW-w64.
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`).
- **System Native Libraries**:
  - `libgphoto2` (v2.5.10 atau versi terbaru)
  - `pkg-config` / `pkgconf`
  - `libclang` / `llvm` (dibutuhkan oleh crate `bindgen` saat mengompilasi `libgphoto2_sys`)

### 2. Hardware Requirements
- **Kamera Digital**: Kamera DSLR atau Mirrorless (Canon EOS, Nikon, Sony, Fuji, dsb.) yang mendukung protokol PTP over USB / `libgphoto2`.
- **Kabel Data USB**: Kabel USB original/berkualitas tinggi yang stabil untuk koneksi tethering kamera.
- **Printer Photobooth**:
  - Dedicated dye-sublimation printer (seperti **DNP DS-RX1HS**, DNP DS620, HiTi P525L, Citizen, dll.) atau printer desktop standar.
  - Driver printer resmi vendor terinstal di OS (WinSpool pada Windows, CUPS pada Linux/macOS).

---

## 🛠️ Panduan Installasi Dependensi Per-OS

Aplikasi ini menggunakan dependensi native C/C++ (`libgphoto2` dan `libclang`/`bindgen`). Ikuti langkah install prasyarat sesuai Sistem Operasi development/deployment Anda:

### 1. 🐧 Linux (Ubuntu / Debian / Arch)

#### A. Install Package System & Toolchain
```bash
# Ubuntu / Debian
sudo apt update
sudo apt install -y build-essential libgphoto2-dev pkg-config libclang-dev clang gphoto2

# Arch Linux
sudo pacman -S base-devel libgphoto2 pkgconf clang gphoto2
```

#### B. ⚠️ PENANGANAN PENTING: Konflik GVFS (Auto-mount Kamera)
Desktop environment seperti GNOME/KDE di Linux secara otomatis mengklaim kamera USB via `gvfs-gphoto2-volume-monitor`, yang mengakibatkan aplikasi gagal mengambil akses USB (*"Could not claim the USB device"*).

**Solusi Temporary (Jalankan saat testing)**:
```bash
killall gvfs-gphoto2-volume-monitor gvfsd-gphoto2 2>/dev/null || true
```

**Solusi Permanen (Untuk Mesin Kiosk/Photobooth Khusus)**:
```bash
systemctl --user mask gvfs-gphoto2-volume-monitor.service 2>/dev/null || true
```

---

### 2. 🪟 Windows (Windows 10 / 11)

Di Windows, `libgphoto2` membutuhkan driver **WinUSB** pada interface kamera, serta environment compiler MSYS2 / LLVM Clang.

#### A. Install Rust & Node.js
1. Install **Rust Toolchain** via [rustup.rs](https://rustup.rs/) (Pilih MSVC atau GNU toolchain).
2. Install **Node.js (v18+)** & **pnpm**: `npm install -g pnpm`.

#### B. Install `libgphoto2` & `clang` via MSYS2
1. Download & Install [MSYS2](https://www.msys2.org/).
2. Buka terminal **MSYS2 MinGW 64-bit** dan jalankan:
   ```bash
   pacman -S mingw-w64-x86_64-libgphoto2 mingw-w64-x86_64-pkgconf mingw-w64-x86_64-clang
   ```
3. Tambahkan variabel lingkungan (Environment Variables) di Windows System:
   - `PKG_CONFIG_PATH` = `C:\msys64\mingw64\lib\pkgconfig`
   - Tambahkan `C:\msys64\mingw64\bin` ke `PATH` sistem Anda.

#### C. ⚠️ WAJIB: Replace Driver Kamera ke WinUSB menggunakan Zadig
Secara default, Windows mengenali kamera digital sebagai perangkat MTP/WIA. `libgphoto2` **tidak dapat mendeteksi kamera** jika masih menggunakan driver MTP default Windows.

1. Hubungkan kamera ke PC menggunakan kabel USB dan nyalakan kamera.
2. Download tool gratis **[Zadig](https://zadig.akeo.ie/)**.
3. Buka Zadig, klik menu **Options** -> centang **List All Devices**.
4. Di dropdown device, pilih kamera Anda (misal: *Canon Digital Camera* / *Nikon DSC*).
5. Pada kolom Target Driver (sebelah panah), pilih **WinUSB** (atau `libusb-win32`).
6. Klik tombol **Replace Driver** (atau *Install Driver*) dan tunggu hingga sukses.
7. *Catatan*: Setelah diganti ke WinUSB, kamera tidak lagi muncul sebagai drive penyimpanan MTP di Windows Explorer, namun aplikasi photobooth dapat langsung mengontrol kamera.

---

### 3. 🍎 macOS

#### A. Install Via Homebrew
```bash
brew install libgphoto2 pkg-config llvm gphoto2
```
Pastikan `LLVM` / `clang` berada dalam PATH jika `bindgen` membutuhkan `libclang.dylib`:
```bash
export LIBCLANG_PATH="$(brew --prefix llvm)/lib"
```

---

## 🚀 Cara Menjalankan Aplikasi (Development)

1. **Clone repository & Install NPM dependencies**:
   ```bash
   git clone <repo-url>
   cd potohub-dekstop-app
   pnpm install
   ```

2. **Jalankan Aplikasi Mode Dev (Tauri + Vite Dev Server)**:
   ```bash
   pnpm tauri dev
   ```

3. **Verifikasi Diagnostic Code**:
   ```bash
   # Diagnostic Svelte & TypeScript
   pnpm check

   # Diagnostic Backend Rust
   cd src-tauri && cargo check
   ```

4. **Build Aplikasi Production Bundle**:
   ```bash
   pnpm tauri build
   ```

---

## 📖 Struktur Direktori & Dokumentasi

```
potohub-dekstop-app/
├── src/                          # Svelte 5 Frontend
│   ├── lib/
│   │   ├── camera.svelte.ts      # Store status & kontrol kamera (gphoto IPC)
│   │   └── printer.svelte.ts     # Store status & kontrol printer
│   └── routes/
│       ├── camera-config/        # Halaman Konfigurasi Kamera & Printer
│       └── session/              # Halaman Sesi Foto (Liveview & Trigger Capture)
├── src-tauri/                    # Rust Backend (Tauri v2)
│   ├── src/
│   │   ├── gphoto.rs             # Wrapper libgphoto2 (autodetect, config, capture, preview)
│   │   ├── printer.rs            # Wrapper pencetakan native (winspool / lpr)
│   │   └── lib.rs                # AppState (tokio Mutex) & IPC Command Handlers
│   └── Cargo.toml
├── docs/
│   ├── legacy-ccapi/             # Arsip & panduan rollback kode Canon CCAPI lama
│   └── gphoto2-discovery/        # Discovery output list-config kamera
└── instruction-reports/          # Laporan eksekusi task & migrasi sistem
```

---

## 🏷️ Arsip & Rollback CCAPI

Jika ingin mengembalikan implementasi lama menggunakan Canon CCAPI (Wi-Fi HTTP), ikuti panduan pada:
👉 [`docs/legacy-ccapi/README.md`](file:///home/dwiwahyuilahi/Personal/Projects/Photobooth%20App%20System/potohub-dekstop-app/docs/legacy-ccapi/README.md) atau checkout git tag: `ccapi-backup-20260727`.
