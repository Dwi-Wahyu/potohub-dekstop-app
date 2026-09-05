# Dokumentasi & Panduan Integrasi libgphoto2 pada Windows (Development & Production Desktop App)

> **Dokumen**: `instructions-reports/WINDOWS_GPHOTO2_SETUP_AND_BUILD_DOCUMENTATION.md`  
> **Aplikasi**: PotoHub Booth Client (`dekstop-app` - Tauri v2 + Rust + SvelteKit)  
> **Target OS**: Windows 10 / Windows 11 (x86_64)  
> **Status**: Terverifikasi Berhasil (Auto-Detect, Koneksi, Liveview, Capture, & Build Installer)

---

## 1. Latar Belakang & Tujuan Dokumen

Aplikasi PotoHub Booth Client menggunakan pustaka **`libgphoto2`** (melalui crate Rust `gphoto2` v3.4.1 dan `libgphoto2_sys` v1.2.3) untuk mengontrol kamera DSLR/Mirrorless (khususnya Canon EOS 1500D) melalui koneksi kabel USB.

Pada sistem operasi Windows, `libgphoto2` bukanlah pustaka bawaan (native Win32), melainkan pustaka open-source POSIX/C yang dikompilasi menggunakan toolchain MinGW-w64. Hal ini menimbulkan tantangan khusus dalam:
1. Pemuatan driver dinamis (`camlibs` dan `iolibs`).
2. Sinkronisasi environment variable antara proses Rust dan C Runtime (`msvcrt.dll`).
3. Driver level kernel USB Windows (WinUSB vs MTP/WPD).
4. Resolusi path file DLL saat aplikasi dibundel ke installer desktop produksi (.exe / .msi).

Dokumen ini disusun sebagai **panduan resmi dan referensi teknis permanen** agar pengembang, teknisi lapangan, maupun tim devops memahami:
- Mengapa error `"Error loading a library"` sebelumnya terjadi.
- Bagaimana solusi teknis di backend Rust menyelesaikannya.
- Checklist kunci untuk memastikan kamera selalu terhubung.
- Bagaimana aplikasi dapat di-build dan di-install di komputer desktop Windows tanpa dependensi eksternal seperti MSYS2.

---

## 2. Analisis Masalah: Mengapa Terjadi "Error loading a library"?

### 2.1 Kronologi Gejala
1. File DLL yang dibutuhkan (`usb1.dll` di `iolibs`, `ptp2.dll` di `camlibs`, dan root DLL) sudah lengkap diletakkan di dalam folder `src-tauri/gphoto-libs`.
2. Driver USB kamera sudah diganti ke WinUSB via aplikasi Zadig.
3. Menjalankan perintah `gphoto2 --auto-detect` di dalam terminal **MSYS2 MINGW64** berhasil mendeteksi kamera:
   ```text
   Model                          Port
   ----------------------------------------------------------
   Canon EOS 1500D                usb:001,002
   Canon EOS 1500D                usb:001,002
   ```
4. Namun saat tombol **"Auto Detect Camera"** ditekan di dalam aplikasi desktop Tauri, aplikasi selalu mengembalikan error:
   ```text
   gagal terhubung ke kamera: Error loading a library
   ```

---

### 2.2 Akar Masalah 1: Ketidaksinkronan Environment Variable (Rust Win32 vs C Runtime `msvcrt.dll`)

Pada implementasi awal, Rust mengatur lokasi folder driver kamera menggunakan:
```rust
std::env::set_var("CAMLIBS", &camlibs_str);
std::env::set_var("IOLIBS", &iolibs_str);
```
Di sistem operasi Windows:
- `std::env::set_var` pada Rust memanggil API Win32 murni: `SetEnvironmentVariableW`.
- Fungsi ini **hanya** memperbarui environment table di level kernel/Win32 OS untuk proses tersebut.
- `libgphoto2` dan `libgphoto2_port` adalah pustaka C yang dikompilasi dengan MinGW-w64 GCC dan menggunakan C Runtime (`msvcrt.dll`).
- C Runtime memiliki **tabel environment internal tersendiri** (`_environ` / `_wenviron`) yang disalin saat proses pertama kali start. `SetEnvironmentVariableW` **TIDAK** memperbarui tabel internal `msvcrt.dll`.
- Ketika fungsi C `gp_port_info_list_load()` memanggil:
  ```c
  char *dir = getenv("IOLIBS");
  ```
  `getenv()` membaca tabel `msvcrt.dll`, yang mengembalikan nilai **`NULL`**!

---

### 2.3 Akar Masalah 2: Fallback ke Hardcoded Path Mesin Build MSYS2

Karena `getenv("IOLIBS")` mengembalikan `NULL`, pustaka `libgphoto2_port` beralih ke path bawaan saat pustaka tersebut dikompilasi (*compile-time default*):
```text
D:/M/msys64/mingw64/lib/libgphoto2_port/0.12.2
```
Path `D:/M/...` adalah path mesin build milik maintainer paket MSYS2. Path ini jelas **tidak ada** di komputer pengguna.
Hasilnya, log internal `libgphoto2` mencatat kegagalan:
```text
[gphoto2-port-info-list.c:333]: No iolibs found in 'D:/M/msys64/mingw64/lib/libgphoto2_port/0.12.2'
```
Karena driver komunikasi I/O (`usb1.dll`) tidak ditemukan, fungsi mengembalikan error code:
`GP_ERROR_LIBRARY` (`-4`), yang diterjemahkan string-nya oleh pustaka menjadi:
> **`"Error loading a library"`**

---

### 2.4 Mengapa di Terminal MSYS2 MINGW64 Berhasil?

Ketika terminal MSYS2 bash dijalankan, file inisialisasi shell (`/etc/profile.d/`) secara eksplisit mengekspor variabel:
```bash
export CAMLIBS=/mingw64/lib/libgphoto2/2.5.34
export IOLIBS=/mingw64/lib/libgphoto2_port/0.12.2
```
Sehingga saat proses `gphoto2.exe` dipanggil dari bash, tabel `msvcrt.dll` sudah mewarisi nilai tersebut sejak proses dimulai. Sedangkan saat aplikasi desktop Tauri diluncurkan langsung dari Windows (VSCode, Start Menu, atau PowerShell), variabel ini tidak pernah ada di C runtime.

---

## 3. Solusi Teknis yang Diterapkan di Backend Rust

Perbaikan diimplementasikan pada file [`src-tauri/src/lib.rs`](file:///C:/Programming/potohub/dekstop-app/src-tauri/src/lib.rs) dan [`src-tauri/src/gphoto.rs`](file:///C:/Programming/potohub/dekstop-app/src-tauri/src/gphoto.rs).

### 3.1 Bridging Environment ke C Runtime via `_putenv`
Dibuat fungsi helper yang memperbarui kedua tabel environment (Win32 OS dan C Runtime) secara simultan:

```rust
#[cfg(target_os = "windows")]
pub fn init_gphoto_environment() {
    extern "C" {
        fn _putenv(envstring: *const std::os::raw::c_char) -> std::os::raw::c_int;
    }

    fn set_c_and_win_env(key: &str, value: &str) {
        // 1. Update tabel Win32 OS (untuk Rust std::env dan proses anak)
        std::env::set_var(key, value);

        // 2. Update tabel internal C Runtime msvcrt.dll (untuk getenv di C/libgphoto2)
        if let Ok(c) = std::ffi::CString::new(format!("{}={}", key, value)) {
            unsafe {
                _putenv(c.as_ptr());
            }
        }
    }
    // ...
```

Variabel yang disuntikkan meliputi:
- `CAMLIBS`: Path ke folder driver kamera (`camlibs/`).
- `IOLIBS`: Path ke folder driver I/O port (`iolibs/`).
- `CAMLIBDIR` & `IOLIBDIR`: Alias kompatibilitas versi gphoto lama.
- `LTDL_LIBRARY_PATH`: Jalur pencarian dynamic loader `libltdl`.
- `PATH`: Ditambahkan folder root gphoto, camlibs, iolibs, dan fallback MSYS2 bin.

---

### 3.2 Format Path Forward Slash (`/`) untuk Kompatibilitas `libltdl`
`libltdl` (loader plugin yang dipakai `libgphoto2`) dapat mengalami *parsing error* atau menganggap karakter backslash `\` sebagai karakter escape. Selain itu, fungsi Windows `canonicalize()` menambahkan prefix extended-length `\\?\` yang tidak didukung oleh `libltdl`.

Diterapkan normalisasi path:
```rust
let clean_path = |p: std::path::PathBuf| -> String {
    let resolved = p.canonicalize().unwrap_or(p);
    let s = resolved.to_string_lossy().to_string();
    s.trim_start_matches("//?/")
     .trim_start_matches("\\\\?\\")
     .replace('\\', "/")
};
```

---

### 3.3 Registrasi Direktori DLL Windows (`SetDllDirectoryW`)
Agar Windows dynamic linker dapat memuat dependensi sekunder `usb1.dll` dan `ptp2.dll` (seperti `libusb-1.0.dll`, `libjpeg-8.dll`, `libxml2-16.dll`, `libintl-8.dll`), folder root `gphoto-libs` didaftarkan langsung ke loader Windows:

```rust
use std::os::windows::ffi::OsStrExt;
let wide_root: Vec<u16> = std::path::PathBuf::from(&gphoto_root_str.replace('/', "\\"))
    .as_os_str()
    .encode_wide()
    .chain(std::iter::once(0))
    .collect();
unsafe {
    extern "system" {
        fn SetDllDirectoryW(lpPathName: *const u16) -> i32;
    }
    SetDllDirectoryW(wide_root.as_ptr());
}
```

---

### 3.4 Hook Logging Internal `libgphoto2`
Pada [`src-tauri/src/gphoto.rs`](file:///C:/Programming/potohub/dekstop-app/src-tauri/src/gphoto.rs), ditambahkan logger callback native:

```rust
unsafe extern "C" fn gp_log_callback(
    level: libgphoto2_sys::GPLogLevel,
    domain: *const std::os::raw::c_char,
    message: *const std::os::raw::c_char,
    _data: *mut std::ffi::c_void,
) {
    let domain_str = std::ffi::CStr::from_ptr(domain).to_string_lossy();
    let message_str = std::ffi::CStr::from_ptr(message).to_string_lossy();
    if matches!(level, libgphoto2_sys::GPLogLevel::GP_LOG_ERROR) {
        eprintln!("[gphoto2-error] {}: {}", domain_str, message_str);
    }
}
```
Jika di kemudian hari terjadi kendala pada level driver C, pesan error detail dari `libgphoto2` akan langsung tampil di terminal debug aplikasi.

---

## 4. Kunci Memastikan Kamera Terhubung di Windows

Berikut adalah **Checklist Wajib** untuk menjamin kamera DSLR/Mirrorless dapat dideteksi dan dioperasikan oleh aplikasi di Windows:

| No | Komponen | Kriteria & Tindakan |
| :--- | :--- | :--- |
| 1 | **Driver USB (Zadig)** | Gunakan **Zadig** (Run as Administrator) → Pilih kamera (misal `Canon Digital Camera` - VID: `04A9`, PID: `32E1`) → Ganti driver bawaan Windows (MTP/WPD) menjadi **`WinUSB (v6.1.7600.16385 atau lebih baru)`**. Jika driver tetap MTP, libgphoto2 tidak bisa membuka komunikasi raw USB. |
| 2 | **Auto Power Off (Kamera Fisik)** | Kamera Canon secara default memiliki fitur sleep (*Auto Power Off*) setelah 30 detik / 1 menit tidak aktif. Saat tidur, status USB menjadi `Unknown`/terputus. **Wajib atur menu kamera: Auto Power Off = Disable / Mati**. |
| 3 | **Kabel & Port USB** | Gunakan kabel data berkualitas tinggi (bukan kabel charger HP tanpa jalur data). Tancapkan langsung ke port USB motherboard belakang pada PC, hindari USB Hub pasif murahan yang dapat menyebabkan voltage drop. |
| 4 | **Struktur Library Lengkap** | Pastikan folder `iolibs/` memiliki `usb1.dll` dan folder `camlibs/` memiliki `ptp2.dll` serta didampingi `libusb-1.0.dll` di folder root. |
| 5 | **Tidak Ada Aplikasi Pesaing** | Pastikan aplikasi seperti *EOS Utility*, *Lightroom*, atau *Windows Photos* tidak sedang berjalan di latar belakang karena akan mengunci (*lock*) port USB kamera. |

---

## 5. Optimasi & Perampingan Ukuran Bundle DLL (Dari 363 MB ke 7.00 MB)

### 5.1 Analisis Pembengkakan Ukuran Folder
Sebelumnya, folder `src-tauri/gphoto-libs` berukuran **363.35 MB** (148 file). Hal ini terjadi karena seluruh isi folder `C:\msys64\mingw64\bin\*.dll` tersalin ke dalam repositori, termasuk kakas compiler C++, runtime bahasa lain, dan encoder multimedia yang tidak digunakan oleh `libgphoto2`.

Beberapa file non-gphoto berukuran masif yang sebelumnya terbawa:
- `libLLVM-22.dll` (140.2 MB) & `libclang-cpp.dll` (56.7 MB) & `libclang.dll` (34.1 MB) — Kakas compiler Clang/LLVM.
- `libx265-217.dll` (21.6 MB) & `libx264-165.dll` (1.9 MB) — Codec video eksternal (aplikasi sudah memakai binary FFmpeg terpisah).
- `libaom.dll` (9.2 MB) & `libSvtAv1Enc-4.dll` (7.2 MB) — Codec AV1.
- `libpython3.14.dll` (5.3 MB) — Runtime Python.
- `libcrypto-3-x64.dll` (5.2 MB) & `libcryptopp.dll` (4.4 MB) — Library kriptografi OpenSSL / Crypto++.
- `libsqlite3-0.dll` (1.5 MB) — SQLite (Tauri plugin SQL sudah mengompilasi SQLite langsung secara statis ke dalam binary `.exe`).

### 5.2 Analisis Pohon Dependensi (Dependency Tree) Minimal
Melalui penelusuran struktur impor PE (`objdump -p`), pohon dependensi `libgphoto2` pada Windows murni membutuhkan **14 file DLL** pada root `gphoto-libs/`:

```text
libgphoto2-6.dll (Core Engine)
├── libgphoto2_port-12.dll (I/O Engine)
│   ├── libwinpthread-1.dll
│   ├── libsystre-0.dll ── libtre-5.dll
│   ├── libintl-8.dll ──── libiconv-2.dll
│   └── libltdl-7.dll (Plugin Loader)
├── libexif-12.dll (EXIF Parser)
├── libintl-8.dll
├── libltdl-7.dll
│
├── iolibs/usb1.dll (USB I/O Driver)
│   ├── libgphoto2_port-12.dll
│   ├── libintl-8.dll
│   └── libusb-1.0.dll (Raw USB Backend)
│
├── camlibs/ptp2.dll (Canon/Nikon/Sony Driver)
│   ├── libgphoto2-6.dll
│   ├── libgphoto2_port-12.dll
│   ├── libjpeg-8.dll (Live Preview Decompressor)
│   ├── libxml2-16.dll (PTP XML Parser)
│   │   ├── libiconv-2.dll
│   │   └── zlib1.dll (Kompresi XML)
│   └── libintl-8.dll
│
└── libgcc_s_seh-1.dll (GCC Runtime Unwind)
```

### 5.3 Hasil Perampingan
1. **Root DLLs**: Hanya menyisakan **14 file krusial** (~4.75 MB).
2. **Driver I/O (`iolibs/`)**: Menyisakan `usb1.dll` (90 KB), `ptpip.dll` (17 KB), dan `disk.dll` (16 KB). Menghapus file duplikat `usb.dll`.
3. **Driver Kamera (`camlibs/`)**: Tetap mempertahankan **20 file driver lengkap** (total 2.13 MB), sehingga mendukung Canon, Nikon, Sony, Fuji, Lumix, Pentax, dll.
4. **Penyertaan `zlib1.dll`**: Menambahkan `zlib1.dll` ke root `gphoto-libs` agar komputer klien tanpa MSYS2 tidak mengalami kegagalan saat `libxml2-16.dll` dipanggil oleh driver `ptp2.dll`.

> **Hasil Akhir**: Ukuran folder `gphoto-libs` terpangkas dari **363.35 MB** menjadi **7.00 MB** (**Penghematan 98% / 356 MB**). Waktu build Tauri dan ukuran installer NSIS berkurang secara signifikan.

---

## 6. Konfigurasi Build & Instalasi Desktop Windows (Production Ready)

Agar aplikasi yang sudah di-build (`pnpm tauri build`) dapat diinstal dan langsung berjalan di komputer Windows klien tanpa perlu install MSYS2 atau alat compiler lain:

### 6.1 Konfigurasi Resource Bundling di `tauri.conf.json`
Pada file [`src-tauri/tauri.conf.json`](file:///C:/Programming/potohub/dekstop-app/src-tauri/tauri.conf.json):

```json
"bundle": {
  "active": true,
  "targets": "all",
  "windows": {
    "nsis": {
      "installerIcon": "icons/icon.ico",
      "sidebarImage": "static/sidebar.bmp",
      "headerImage": "static/header.bmp"
    }
  },
  "resources": {
    "gphoto-libs/*": ".",
    "gphoto-libs/camlibs/*": "camlibs",
    "gphoto-libs/iolibs/*": "iolibs"
  },
  "externalBin": ["binaries/ffmpeg"]
}
```

### 6.2 Logika Resolusi Path Otomatis (Dev vs Production)
Fungsi `init_gphoto_environment()` di [`src-tauri/src/lib.rs`](file:///C:/Programming/potohub/dekstop-app/src-tauri/src/lib.rs) secara cerdas mendeteksi lingkungan saat aplikasi dijalankan:

1. **Saat Development (`pnpm tauri dev`)**:
   - `exe_path` berada di `src-tauri/target/debug/potohub-booth-client.exe`.
   - Logika mendeteksi folder development di `../../gphoto-libs`.
2. **Saat Production / Terpasang di Komputer Klien (Installed App)**:
   - File installer NSIS menyalin seluruh isi `bundle.resources` ke direktori instalasi (misal: `C:\Program Files\PotoHub Booth Client\`).
   - File `.exe` berada satu direktori dengan folder `camlibs/`, `iolibs/`, dan seluruh root DLL.
   - Pemeriksaan `has_dlls(&exe_dir.join("camlibs"))` langsung terpenuhi:
     ```rust
     let (camlibs_path, iolibs_path, gphoto_root) = if has_dlls(&dev_gphoto_dir.join("camlibs")) {
         (dev_gphoto_dir.join("camlibs"), dev_gphoto_dir.join("iolibs"), dev_gphoto_dir)
     } else if has_dlls(&exe_dir.join("camlibs")) {
         // INI YANG AKTIF PADA APLIKASI TERINSTAL
         (exe_dir.join("camlibs"), exe_dir.join("iolibs"), exe_dir.to_path_buf())
     }
     ```
   - Dengan begitu, variabel `CAMLIBS`, `IOLIBS`, dan DLL search directory secara otomatis menunjuk ke folder instalasi aplikasi klien.

---

## 7. Prosedur Deployment Perangkat Baru di Lapangan

Jika melakukan instalasi Photobooth pada komputer Windows baru:

1. **Jalankan Installer Desktop**:
   - Install aplikasi `PotoHub Booth Client Setup.exe`.
2. **Colok Kamera USB & Nyalakan**:
   - Nyalakan kamera DSLR Canon, pastikan mode dial kamera di posisi Manual (`M`) atau Program (`P`).
   - Matikan fitur **Auto Power Off** di menu kamera.
3. **Konfigurasi Driver USB sekali saja (One-time Setup)**:
   - Buka aplikasi **Zadig**.
   - Pilih menu `Options` → Centang `List All Devices`.
   - Pada dropdown utama, pilih `Canon Digital Camera`.
   - Di sebelah panah hijau, pastikan target driver adalah **WinUSB**.
   - Klik tombol **Replace Driver** / **Install Driver** dan tunggu hingga muncul pesan sukses.
4. **Buka Aplikasi PotoHub**:
   - Masuk ke dashboard / pengaturan kamera (`/camera-manual-settings` atau `/settings`).
   - Kamera akan langsung terdeteksi otomatis (`Canon EOS 1500D`), siap digunakan untuk liveview, capture, dan cetak foto.
