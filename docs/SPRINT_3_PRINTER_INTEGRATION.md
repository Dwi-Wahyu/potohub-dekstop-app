# Dokumentasi Integrasi Printer & Fitur Print Secondary (Sprint 3)

**Modul:** Photobooth Desktop Client (`potohub-dekstop-app`) & Ekosistem PotoHub  
**Target Platform:** Windows (Production Kiosk) & Linux (Testing & Development)  
**Versi Dokumen:** 1.1.0  
**Tanggal:** 2026-10-03  
**Status:** ✅ **SELESAI & TERVERIFIKASI PENUH DI LINUX & WINDOWS 11**

---

## 1. Ikhtisar & Tujuan Sprint

Sprint 3 berfokus pada penyelesaian integrasi perangkat keras printer foto dye-sublimation (**DNP DS-RX1 / DS-RX1HS**), penghapusan fungsionalitas tiruan/hardcode (*zero-mock policy*), arsitektur cetak **OS-Aware** (Windows native WinSpool & Linux CUPS), standardisasi ukuran kertas cetak sesuai `paper-sizes.json`, serta implementasi fitur **"Print Secondary"** untuk fleksibilitas pemotongan/format kertas.

### Sasaran Utama:
1. **Deteksi Hardware Riil & Zero Mock**: Menghilangkan mock virtual printer. Jika kabel USB printer dicabut, sistem secara instan mendeteksi status `OFFLINE` dan mengosongkan daftar perangkat.
2. **Arsitektur OS-Aware**:
   - Mesin booth produksi menggunakan sistem operasi **Windows 11** (memanfaatkan WinSpool API & driver resmi DNP).
   - Mesin pengujian dan development menggunakan **Linux** (memanfaatkan CUPS & Gutenprint driver).
3. **Fitur "Print Secondary"**: Memungkinkan alih cetak layout template dari *Primary Printer* ke *Secondary Printer* (misal: Primary disiapkan untuk strip potong 2x6, Secondary untuk foto utuh 4x6).
4. **Standardisasi Ukuran Kertas**: Mendukung seluruh varian ukuran kertas standar pada `paper-sizes.json` dengan safe database migration.
5. **Peningkatan UX Dasbor**: Proteksi anti-spam klik saat offline (beralih ke format teks seperti deteksi kamera) dan tombol refresh interaktif dengan animasi loading spinner.

---

## 2. Rincian Sub-Langkah Integrasi Printer

```mermaid
flowchart TD
    subgraph Boot ["1. App Startup (src/routes/+layout.svelte)"]
        AppStart["Aplikasi Dibuka"] -->|onMount| LoadPrinters["printerStore.loadPrinters()"]
    end

    subgraph UI ["2. Konfigurasi Kiosk (ConfigDashboard.svelte)"]
        LoadPrinters --> Rust_List["get_printer_list"]
        UI_Primary["Pilih Primary Printer"] -->|Simpan| BoothCfg["BoothConfig (localStorage)"]
        UI_Secondary["Pilih Secondary Printer"] -->|Simpan| BoothCfg
    end

    subgraph Core ["3. Alur Eksekusi Cetak Sesi Selesai"]
        Tpl["Selected Template"] -->|use_secondary_printer?| Resolve["printerStore.resolvePrinter()"]
        Resolve --> Target["Target Printer"]
        Target --> Check["canPrint(copies, useSecondary)"]
        Check -->|OK| PrintDirect["print_photo_from_buffer / print_photo"]
        Check -->|Printer Error/Offline| Enqueue["enqueuePrintJob (SQLite print_queue)"]
    end

    subgraph OS ["4. Eksekusi Native Driver (src-tauri/src/printer.rs)"]
        PrintDirect --> OS_Check{Target OS?}
        OS_Check -->|Windows 11 Production| WinSpool["WinSpool RAW Spooling API"]
        OS_Check -->|Linux Dev/Test| CUPS["CUPS lpr + PageSize Parameter"]
    end

    subgraph Offline ["5. Background Worker (printQueue.ts)"]
        OnlineEvent["Printer Reconnect (Offline -> Online)"] --> Flush["flushPrintQueue()"]
        Flush --> Target
    end
```

---

### Sub-Langkah 2.1: Verifikasi Hardware & Pengujian Fisik Terminal (DNP DS-RX1)

Sebelum pengkodean programatik, dilakukan diagnosa dan verifikasi perangkat keras langsung pada mesin DNP:
1. **Status Indikator LED Hardware DNP DS-RX1**:
   - LED **Ribbon** dan **Paper** dalam kondisi mati menandakan pita ribbon dan kertas gulung terpasang dengan baik (normal).
   - LED **Power** menyala hijau solid menandakan unit siap beroperasi (*Ready*).
2. **Koneksi CUPS & Driver Gutenprint (Linux)**:
   - Perangkat terdeteksi pada URI `direct gutenprint53+usb://dnp-dsrx1/Cy2C63549159`.
3. **Uji Cetak Terminal**:
   - Berhasil mencetak foto fisik melalui perintah:
     ```bash
     lpr -P DNP_DSRX1 -o PageSize=w288h432 ~/Downloads/test.jpg
     ```
   - **Catatan Teknis**: Printer dye-sub DNP memerlukan opsi `PageSize` eksplisit (misal `w288h432` untuk ukuran 4x6 / 4R) agar spooler tidak menolak format buffer gambar.

---

### Sub-Langkah 2.2: Backend Rust OS-Aware (`src-tauri/src/printer.rs` & `src-tauri/src/lib.rs`)

Backend Tauri dibuat fleksibel dan peka terhadap sistem operasi target (*OS-Aware*):
1. **Implementasi Windows Production (`#[cfg(target_os = "windows")]`)**:
   * **Multi-Stage Printer Enumeration (`get_installed_printers`)**:
     - **Tahap 1 (Level 4 - `PRINTER_INFO_4W`)**: Standar Win32 user-mode tercepat untuk membaca nama printer lokal/USB tanpa memerlukan hak administrator khusus.
     - **Tahap 2 (Level 2 - `PRINTER_INFO_2W`)**: Fallback jika Level 4 tidak tersedia.
     - **Tahap 3 (PowerShell Fallback)**: Eksekusi `powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"` sebagai jaring pengaman terakhir jika WinSpool API dibatasi oleh sistem.
   * **Resilient Status Query (`get_printer_status`)**:
     - Membuka handle printer via `OpenPrinterW`.
     - Mengambil status via `PRINTER_INFO_2W` (Level 2). Jika akses dibatasi, otomatis fallback ke `PRINTER_INFO_6` (Level 6 khusus kode status `dwStatus`) atau query status PowerShell.
     - Memeriksa flag `PRINTER_STATUS_OFFLINE` dan atribut `PRINTER_ATTRIBUTE_WORK_OFFLINE` (0x00000400).
   * **Direct Spooling**: Menggunakan WinAPI `winspool` (`StartDocPrinterW`, `StartPagePrinter`, `WritePrinter`, `EndPagePrinter`, `EndDocPrinter`, `ClosePrinter`) untuk pengiriman buffer RAW ke driver printer DNP tanpa dialog print Windows.
2. **Implementasi Linux Development/Testing (`#[cfg(not(target_os = "windows"))]`)**:
   - **Deteksi Dua Tahap**: Membaca antrean CUPS (`lpstat -e`), dan jika belum terkonfigurasi, otomatis mengekstrak printer USB langsung dari `lpinfo -v`.
   - **Deteksi Cabut Kabel (Unplug)**: Ketika kabel USB dicabut, perangkat langsung hilang dari output `lpinfo -v` / `lpstat`, mengembalikan array kosong dan status `OFFLINE`.
   - **Pemetaan Ukuran Kertas Otomatis (`map_paper_size_to_cups`)**:
     - `4R` / `4x6`: `-o PageSize=w288h432`
     - `2R` / `2x6`: `-o PageSize=w288h432 -o DNP2x6Cut=True` (pemotongan ganda otomatis strip 2x6)
     - `6R` / `6x8`: `-o PageSize=w288h576`
     - `6x6`: `-o PageSize=w288h288`
     - `A4`: `-o PageSize=A4`
3. **Database SQLite Lokal Migration 11 (`src-tauri/src/lib.rs`)**:
   - Menambahkan kolom `use_secondary` pada tabel `print_queue`:
     ```sql
     ALTER TABLE print_queue ADD COLUMN use_secondary INTEGER NOT NULL DEFAULT 0;
     ```
4. **Unit Test Backend**:
   - `test_print_options_default`: Verifikasi default copies = 1 dan paper size = `4x6`.
   - `test_printer_status_empty_name`: Memastikan penanganan input printer kosong aman.
   - `test_cups_paper_size_mapping`: Memvalidasi mapping nama ukuran ke format parameter CUPS.
   - `test_print_empty_buffer_fails`: Memvalidasi penolakan buffer kosong.
   - *Hasil uji:* `cargo test --lib printer` -> **4 passed; 0 failed**.

---

### Sub-Langkah 2.3: Safe Migration & Model Backend API (`api/`)

Pembaruan pada backend cloud API agar mengenali ukuran kertas baru dan atribut printer sekunder:
1. **Safe SQL Migration (`api/migrations/20261003000000_extend_paper_sizes_and_secondary_printer.sql`)**:
   - Memperluas enum `paper_size` tanpa menghapus tabel:
     ```sql
     ALTER TYPE paper_size ADD VALUE IF NOT EXISTS '2R';
     ALTER TYPE paper_size ADD VALUE IF NOT EXISTS '3R';
     ALTER TYPE paper_size ADD VALUE IF NOT EXISTS '5R';
     ALTER TYPE paper_size ADD VALUE IF NOT EXISTS '6R';
     ALTER TYPE paper_size ADD VALUE IF NOT EXISTS '8R';
     ALTER TYPE paper_size ADD VALUE IF NOT EXISTS '10R';
     ALTER TYPE paper_size ADD VALUE IF NOT EXISTS 'A7';
     ALTER TYPE paper_size ADD VALUE IF NOT EXISTS 'A6';
     ALTER TYPE paper_size ADD VALUE IF NOT EXISTS 'A5';
     ALTER TYPE paper_size ADD VALUE IF NOT EXISTS 'A4';
     ALTER TYPE paper_size ADD VALUE IF NOT EXISTS 'A3';
     ALTER TABLE templates ADD COLUMN IF NOT EXISTS use_secondary_printer BOOLEAN NOT NULL DEFAULT FALSE;
     ```
   - Template yang telah ada (format `4R`) tetap valid dan aman 100%.
2. **Model & Handler Template Rust (`api/src/models/template.rs`, `api/src/handlers/template.rs`)**:
   - Menambahkan varian enum `PaperSize` dan field `use_secondary_printer` pada struct `Template`, `CreateTemplateRequest`, dan `UpdateTemplateRequest`.
3. **Integration Test Suite (`api/tests/template_printer_test.rs`)**:
   - Menguji serialisasi enum kertas, backward-compatibility payload lama, flag secondary printer, dan simulasi resolusi target printer OS-aware.
   - *Hasil uji:* `cargo test --test template_printer_test` -> **4 passed; 0 failed**.

---

### Sub-Langkah 2.4: Store Reaktif Svelte 5 & Antrean Cetak Offline (`dekstop-app/src/lib/`)

1. **Inisialisasi Booting Instan (`src/routes/+layout.svelte`)**:
   - Menambahkan pemanggilan `void printerStore.loadPrinters();` pada `onMount` root layout, sehingga begitu aplikasi pertama kali dibuka di Windows, printer langsung terdeteksi seketika tanpa perlu menunggu navigasi ke modal pengaturan.
2. **Pencocokan Nama Hardware Fleksibel (`src/lib/printer.svelte.ts`)**:
   - Algoritma pencarian otomatis DNP mencakup variasi: `DS-RX1`, `RX1`, `DNP`, `CITIZEN`, dan `PHOTO PRINTER`.
3. **Dukungan Multi-Printer & Status Reaktif**:
   - Mengelola status terpisah untuk printer utama (`selectedPrinter`, `status`) dan printer kedua (`secondaryPrinter`, `secondaryStatus`).
   - Metode `resolvePrinter(useSecondary?: boolean)`:
     ```typescript
     resolvePrinter(useSecondary?: boolean): string | null {
       if (useSecondary && this.secondaryPrinter) {
         return this.secondaryPrinter;
       }
       return this.selectedPrinter;
     }
     ```
   - Metode `canPrint(copies, useSecondary)`: Mengecek status ketersediaan, status error, dan kecukupan kertas pada printer tujuan.
   - Pemicu otomatis `flushPrintQueue()` saat printer mengalami transisi status dari `OFFLINE` menjadi `ONLINE`.
4. **Konfigurasi Booth (`src/lib/stores/boothConfig.svelte.ts`)**:
   - Menambahkan atribut `primaryPrinter: string` dan `secondaryPrinter: string` pada `BoothCfg` yang tersimpan otomatis di `localStorage`.
5. **Manajemen Antrean Cetak Lokal (`src/lib/db/local.ts` & `src/lib/utils/printQueue.ts`)**:
   - `enqueuePrintJob`: Menyimpan flag `use_secondary` ke tabel `print_queue`.
   - `flushPrintQueue`: Mengecek kesiapan printer spesifik target (`useSecondary`) sebelum memanggil print, memastikan job tidak tertukar antar printer.
6. **Alur Otomatis Cetak Sesi Selesai (`V1Complete.svelte`, `V2Download.svelte`, `V3Download.svelte`)**:
   - Menyerahkan parameter `useSecondary = Boolean(selectedTemplate?.use_secondary_printer)` saat memanggil fungsi cetak langsung maupun saat memasukkan ke antrean fallback.

---

### Sub-Langkah 2.5: Antarmuka Dasbor Konfigurasi Kiosk (`ConfigDashboard.svelte`)

Peningkatan UX pada halaman pengaturan booth:
1. **Dropdown Primary Printer**:
   - Menampilkan seluruh printer terdeteksi dengan status langsung, misal: `DS-RX1 (Ready)` atau `DS-RX1 (Offline)`.
2. **Dropdown Secondary Printer**:
   - Memungkinkan memilih printer kedua untuk tugas khusus, atau memilih `-- Nonaktif (Gunakan Primary) --`.
3. **Proteksi Anti-Spam Klik**:
   - Jika tidak ada printer USB yang tersambung, elemen `<select>` ditiadakan dan diganti dengan teks informatif:
     `"Tidak ada printer terdeteksi."` / `"Mencari printer via USB…"` (konsisten dengan desain deteksi kamera DSLR).
4. **Tombol Refresh Interaktif**:
   - Menggunakan ikon `RotateCw` dengan animasi putar `animate-spin` dan label teks `"Mendeteksi..."` selama pemindaian port USB berlangsung.

---

### Sub-Langkah 2.6: Editor Template Frame Admin Dashboard (`TemplateFramePage.svelte`)

Pembaruan pada antarmuka admin pengelola template:
1. **Pilihan Ukuran Kertas Lengkap Sesuai `paper-sizes.json`**:
   - Menyediakan pilihan nama bersih langsung tanpa teks dimensi/embel-embel tambahan (misal: `4R`, `2R`, `3R`, `5R`, `6R`, `8R`, `10R`, `A7`, `A6`, `A5`, `A4`, `A3`, `6x8`, `2x6`, `6x6`, `Custom`).
   - Otomatis mengisi lebar (*width*) dan tinggi (*height*) canvas template saat ukuran kertas dipilih.
2. **Toggle "Print Secondary"**:
   - Tombol toggle mini pada bilah konfigurasi template terikat ke state `printSecondaryGlobal`.
   - Nilai tersimpan ke database melalui atribut `use_secondary_printer` pada payload API.

---

## 3. Matriks Hasil Verifikasi & Validasi Pengujian

| Komponen | Lingkungan | Jenis Pengujian | Hasil | Catatan |
| :--- | :--- | :--- | :--- | :--- |
| **DNP DS-RX1 (Linux)** | Linux CUPS | Fisik via Terminal | **SUKSES** | Cetak fisik keluar dengan opsi `-o PageSize=w288h432` |
| **DNP DS-RX1 (Windows 11)** | Windows 11 (Port USB002) | `Get-Printer` & Kiosk App | **SUKSES & READY** | Terdeteksi langsung di aplikasi sebagai Primary Printer `(Ready)` |
| **`printer.rs`** | Desktop App (Rust) | `cargo test --lib printer` | **4/4 PASSED** | Default options, empty name, cups mapping, empty buffer |
| **`template_printer_test.rs`** | Backend API (Rust) | `cargo test --test template_printer_test` | **4/4 PASSED** | Enums, backward compat, secondary flag, OS resolution |
| **Desktop App Svelte** | Desktop App (TS/Svelte) | `pnpm check` | **0 Errors, 0 Warnings** | Validasi tipe data dan Svelte 5 runes |
| **Admin Dashboard** | Web Dashboard | `pnpm build` | **0 Errors** | Bundle production berhasil dibuild |
| **Cabut/Colok USB** | Hardware Riil | Live Detection | **SUKSES** | Status langsung berganti antara Ready dan Tidak Terdeteksi |

---

## 4. Panduan Troubleshooting Driver Windows 11 (Berdasarkan PDF Resmi DNP)

Berdasarkan manual resmi DNP Windows 11 (`DS-RX1_PrinterDriverInstruction_For11_V1.23_English.pdf`), jika printer belum terdeteksi setelah instalasi driver:

1. **Masalah "Unspecified Devices" (Bab 1.4 Halaman 6-7 PDF)**:
   - Jika kabel USB sudah terhubung sebelum `DriverInstall.CMD` dijalankan, Windows 11 menempatkan printer di bawah **"Unspecified"** dengan nama *"Photo Printer"*.
   - **Solusi**:
     1. Buka *Control Panel* -> *Hardware and Sound* -> *Devices and Printers*.
     2. Pada bagian *Unspecified*, klik kanan icon **"Photo Printer"** atau **"Dai Nippon Printing DS-RX1"** -> pilih **"Remove device"**.
     3. Cabut kabel USB printer dari komputer.
     4. **Restart komputer**.
     5. Setelah komputer menyala kembali, colokkan kabel USB dan nyalakan printer.
     6. Periksa di *Settings -> Bluetooth & devices -> Printers & scanners*, printer `DS-RX1` akan muncul.
2. **Wajib Restart Komputer (Halaman 5 & 27 PDF)**:
   - Driver DNP Windows 11 memasang modul port monitor USB dan filter spooler yang hanya aktif setelah sistem di-restart. Selalu restart komputer satu kali setelah instalasi driver selesai.
3. **Verifikasi Terminal PowerShell**:
   ```powershell
   Get-Printer | Format-Table Name, DriverName, PortName, PrinterStatus, OperationalStatus -AutoSize
   ```
   Pastikan muncul baris:
   ```
   DS-RX1    Local    DS-RX1    USB002    False
   ```

---

## 5. Panduan Operasional untuk Operator Booth

1. **Pengaturan Printer Default (Single Printer)**:
   - Hubungkan printer DNP via USB.
   - Buka dasbor konfigurasi (`/settings` atau via PIN).
   - Pastikan **Primary Printer** terpilih nama printer DNP dengan label `(Ready)`.
   - Biarkan **Secondary Printer** pada posisi `-- Nonaktif (Gunakan Primary) --`.
2. **Pengaturan Dual-Printer (Primary Strip Cut 2x6 + Secondary Full 4x6)**:
   - Hubungkan kedua printer ke port USB kiosk.
   - Pada Dasbor Konfigurasi:
     - Pilih Printer 1 sebagai **Primary Printer** (dikonfigurasi dengan mode potong split 2x6 pada driver).
     - Pilih Printer 2 sebagai **Secondary Printer** (dikonfigurasi mode cetak utuh 4x6).
   - Pada Admin Dashboard:
     - Untuk template foto strip 2x6, biarkan opsi *Print Secondary* dalam posisi **Off**.
     - Untuk template foto penuh 4x6, aktifkan opsi *Print Secondary* ke posisi **On**.
     - Sistem kiosk akan secara otomatis mengarahkan cetakan ke printer yang tepat tanpa memerlukan intervensi operator saat sesi berlangsung.

---

## 6. Workaround Pengujian E2E Kamera Webcam Laptop (Development Mode)

Untuk memfasilitasi pengujian alur lengkap (*End-to-End*) dari pemotretan hingga pencetakan fisik ke printer DNP DS-RX1 saat kamera DSLR fisik belum tersedia di stasiun pengujian, telah diimplementasikan fitur **Development Webcam Workaround**.

### 6.1. Fitur & Kemampuan Workaround
1. **Photo Capture Beresolusi Tinggi**:
   - Memanfaatkan sensor kamera laptop via `ImageCapture.takePhoto()` (dengan fallback ke canvas `<video>` snapshot 1080p/720p pada kualitas JPEG 0.95).
   - Menghasilkan buffer JPEG yang identik dengan output kamera DSLR gphoto2.
2. **Template Strip Composite**:
   - Foto hasil webcam langsung di-composite ke dalam layout template frame yang dipilih pengguna menggunakan `templateComposite.ts`.
   - Layout strip siap diverifikasi dan dikirim ke printer fisik via `printerStore.printComposite()`.
3. **Klip Liveview Video (Liveframe)**:
   - Menyimpan buffer berkala 8 FPS JPEG di memori selama sesi liveview.
   - Meng-encode frame window capture melalui Tauri sidecar `ffmpeg` (`encode_jpeg_frames_to_video`) menghasilkan file MP4 yang 100% valid untuk digabungkan ke video composite liveframe (`compose_template_video`).
4. **Animasi GIF Sesi**:
   - Mengambil frame-frame still pemotretan dan meng-encode menjadi animasi loop GIF melalui perintah Tauri `encode_photos_to_gif`.

### 6.2. Cara Mengaktifkan Mode Webcam Pengembang

Fitur ini dapat diaktifkan melalui salah satu dari cara berikut:

1. **Menggunakan NPM Script / CLI Flag**:
   ```bash
   # Menjalankan frontend dev server dengan flag development
   pnpm dev:webcam
   # ATAU
   pnpm dev -- --development

   # Menjalankan aplikasi desktop Tauri dengan flag development
   pnpm tauri:webcam
   # ATAU
   pnpm tauri dev -- -- --development
   ```

2. **Menggunakan File Konfigurasi `.env`**:
   Buka file `.env` pada folder `dekstop-app/`:
   ```env
   # Set 'true' untuk mengaktifkan webcam development
   VITE_ENABLE_DEV_WEBCAM=true
   ```
   Dapat digunakan saat `pnpm tauri dev` maupun saat membuat installer build pengujian (`pnpm tauri build`).

3. **Menggunakan URL Query Parameter / LocalStorage**:
   Akses aplikasi dengan menambahkan query `?development=true` atau `?webcam=true`.

### 6.3. Jaminan Keamanan Produksi (*Production Safety*)
- **Default Aman**: Nilai default `VITE_ENABLE_DEV_WEBCAM` adalah `false`.
- **Isolasi Alur DSLR**: Jika development mode tidak diaktifkan, aplikasi berjalan murni pada mode `'usb'` (DSLR gphoto2). Alur deteksi, inisialisasi, dan capture gphoto2 tidak tersentuh dan tidak mengalami degradasi.
- **Auto-fallback Cerdas**: Jika development mode aktif dan kamera DSLR USB tidak ditemukan, aplikasi secara otomatis beralih ke webcam laptop tanpa membuat aplikasi error/hang, sehingga pengujian cetak strip foto dapat langsung dijalankan.

