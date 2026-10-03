# Laporan Implementasi Integrasi Printer & Dukungan Secondary Printer (Desktop App)

**Target Sistem:** Photobooth Desktop App (Tauri v2 + Rust Backend + SvelteKit 2 + Svelte 5)  
**Tanggal Pembaruan:** 2026-10-03  
**Status Implementasi:** ✅ **100% SELESAI & TERVERIFIKASI**

---

## 1. Ringkasan Eksekutif

Laporan ini mendokumentasikan integrasi penuh perangkat keras printer foto dye-sublimation **DNP DS-RX1 / DS-RX1HS** pada aplikasi Photobooth Desktop Client (`potohub-dekstop-app`). Integrasi ini mencakup:
1. Verifikasi pencetakan fisik langsung ke perangkat keras DNP.
2. Arsitektur cetak **OS-Aware** yang mendukung lingkungan **Windows (WinSpool API)** untuk mesin produksi booth asli, dan **Linux (CUPS & Gutenprint)** untuk pengujian/development.
3. Fitur **"Print Secondary"**: kemampuan konfigurasi dua printer (Primary & Secondary) untuk template dengan kebutuhan potong kertas khusus (misal: 4R utuh vs 4R potong split 2 strip 2x6).
4. Pembaruan UI Dasbor Konfigurasi: tombol refresh interaktif dengan animasi loading spinner, serta proteksi plain-text ketika printer offline agar pengguna tidak melakukan spam-klik pada dropdown kosong.

---

## 2. Pengujian Fisik Terminal & Parameter Cetak DNP

Pengujian cetak fisik langsung dari terminal Linux menuju printer DNP DS-RX1 terverifikasi berhasil menggunakan CUPS backend Gutenprint dengan perintah:
```bash
lpr -P DNP_DSRX1 -o PageSize=w288h432 ~/Downloads/test.jpg
```
* **Indikator LED Hardware DNP**:
  - Lampu LED *Ribbon* dan *Paper* mati menandakan ribbon & kertas terpasang dengan baik (normal).
  - Lampu LED *Power* menyala hijau solid menandakan printer siap mencetak (*Ready*).
* **Pemetaan PageSize CUPS (`map_paper_size_to_cups`)**:
  Printer dye-sub DNP memerlukan opsi ukuran eksplisit agar job tidak tertolak oleh print spooler:
  - `4R` / `4x6`: `-o PageSize=w288h432`
  - `2R` / `2x6`: `-o PageSize=w288h432 -o DNP2x6Cut=True`
  - `6R` / `6x8`: `-o PageSize=w288h576`
  - `6x6`: `-o PageSize=w288h288`
  - `A4`: `-o PageSize=A4`

---

## 3. Rincian Modifikasi Arsitektur & Kode

### 3.1 Backend Rust (`src-tauri/src/printer.rs` & `src-tauri/src/lib.rs`)
* **Dukungan Dual-Platform OS-Aware**:
  - **Windows Production (`#[cfg(target_os = "windows")]`)**: Menggunakan Windows API `winspool` (`EnumPrintersW`, `OpenPrinterW`, `StartDocPrinterW`, `WritePrinter`, `EndDocPrinter`, `ClosePrinter`) untuk pengiriman buffer RAW ke driver Windows DNP.
  - **Linux Development (`#[cfg(not(target_os = "windows"))]`)**: Menggunakan `lpr` dan `lpinfo` dengan parsing dynamic device URI serta injeksi opsi `-o PageSize=...`.
* **Database SQLite Migration 11 (`src-tauri/src/lib.rs`)**:
  ```sql
  ALTER TABLE print_queue ADD COLUMN use_secondary INTEGER NOT NULL DEFAULT 0;
  ```
* **Unit Testing (`src-tauri/src/printer.rs`)**:
  Menyediakan 4 test case OS-aware:
  - `test_print_options_default`: Memastikan default cetak 1 copy dan paper size `4x6`.
  - `test_printer_status_empty_name`: Memastikan error handling saat nama printer kosong.
  - `test_cups_paper_size_mapping`: Memastikan mapping nama ukuran kertas ke format page size CUPS.
  - `test_print_empty_buffer_fails`: Memastikan buffer kosong ditolak secara aman.

### 3.2 Antrean Cetak & Database Lokal (`src/lib/db/local.ts` & `src/lib/utils/printQueue.ts`)
* `PrintJob`: Menambahkan properti `useSecondary?: boolean`.
* `enqueuePrintJob`: Menyimpan flag `use_secondary` ke dalam tabel antrean lokal `print_queue`.
* `flushPrintQueue`: Mengecek status printer target yang relevan (`printerStore.resolvePrinter(job.useSecondary)`) sebelum memproses antrean, memastikan job diteruskan ke printer yang tepat (Primary atau Secondary).

### 3.3 Svelte 5 Reactive Store (`src/lib/printer.svelte.ts`)
* Mendukung multi-printer: `selectedPrinter` (Primary) dan `secondaryPrinter` (Secondary) dengan pelacakan status masing-masing (`status` & `secondaryStatus`).
* Fungsi `resolvePrinter(useSecondary?: boolean)` untuk menentukan target printer berdasarkan template.
* Fungsi `canPrint(copies, useSecondary)` untuk mengecek ketersediaan printer tujuan secara akurat.
* Non-blocking queue flushing otomatis saat koneksi printer pulih dari offline ke online.

### 3.4 Dasbor Konfigurasi Kiosk (`src/lib/components/shared/ConfigDashboard.svelte`)
* **Primary Printer Dropdown**: Memilih printer utama (default: DNP DS-RX1).
* **Secondary Printer Dropdown**: Memilih printer sekunder opsional atau nonaktif (`-- Nonaktif (Gunakan Primary) --`).
* **Proteksi Anti-Spam (Plain Text)**: Jika tidak ada printer terdeteksi, dropdown disembunyikan dan diganti dengan teks status ramah seperti deteksi kamera (`Tidak ada printer terdeteksi`), mencegah pengguna spam-klik pada select box kosong.
* **Tombol Refresh Interaktif**: Menampilkan icon putar `RotateCw` dengan animasi `animate-spin` dan teks `Mendeteksi...` saat proses query hardware USB berjalan.

### 3.5 Alur Otomatis Cetak Sesi Selesai (`V1Complete.svelte`, `V2Download.svelte`, `V3Download.svelte`)
* Membaca flag `selectedTemplate?.use_secondary_printer`.
* Mengirimkan `useSecondary` ke `printerStore.canPrint`, `printerStore.printFromBuffer`, dan `enqueuePrintJob`.

---

## 4. Hasil Verifikasi & Validasi
* **Cargo Tests**: `cargo test --lib printer` -> **4 passed; 0 failed (100% OK)**.
* **Cargo Check**: `cargo check` -> **Finished dev profile in 2.50s (0 errors)**.
* **Svelte Diagnostics**: `pnpm check` -> **0 errors, 0 warnings (100% OK)**.
