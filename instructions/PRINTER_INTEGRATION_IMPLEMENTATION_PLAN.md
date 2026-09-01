# Rencana Implementasi DNP Printer — Photobooth Desktop App (Tauri v2 + SvelteKit)

> **Untuk siapa dokumen ini**: agen CLI yang akan mengeksekusi perubahan pada repo `potohub-dekstop-app`.
> **Prinsip kerja**: jalankan per-Phase secara berurutan, jangan lompat. Setiap Phase punya "Definition of Done" — jangan lanjut ke Phase berikutnya sebelum itu terpenuhi.

---

## 0. Kondisi Project Saat Ini (baseline)

- **CCAPI Integration**: Sudah selesai (kamera EOS R100 terhubung via CCAPI)
- **Printer**: DNP DS-RX1HS (belum terintegrasi)
- **Frontend**: SvelteKit 5 dengan `cameraStore` sebagai single source of truth
- **Backend**: Tauri v2 dengan Rust

**Keputusan desain yang mengikat** (sesuai instruksi Anda):

- Tidak ada database. State cukup di Svelte 5 (`$state`) lokal per sesi aplikasi.
- Fokus: **fungsi utama dulu** — koneksi printer, cetak foto, monitor status printer (sisa kertas, error).
- Arsitektur komunikasi printer: **Rust backend sebagai jembatan ke Windows Print API** (pakai `winapi` atau `printspooler` crate), diekspor ke frontend lewat `#[tauri::command]`.

---

## Phase 0 — Persiapan Driver & Firmware (WAJIB sebelum coding)

Tujuan: memastikan driver printer terinstal dengan benar di Windows dan printer siap digunakan.

### Langkah manual (dilakukan oleh user, bukan agen)

1. **Instal Driver DNP DS-RX1HS**:
   - Download driver dari [DNP Support Page](https://eventprinters.com/pages/dnp-printer-drivers-repair-support)
   - Ikuti instruksi instalasi
   - Hubungkan printer via USB dan pastikan terdeteksi di Control Panel > Devices and Printers

2. **Update Firmware (Opsional tetapi direkomendasikan)**:
   - Download firmware v2.21 dari DNP
   - Ikuti panduan update

3. **Verifikasi**:
   - Buka Control Panel > Devices and Printers
   - Pastikan printer muncul sebagai "DNP DS-RX1HS" dengan status "Ready"
   - Test cetak dari Notepad/Photos untuk memastikan driver berfungsi

**Definition of Done Phase 0**: Printer terdeteksi di Windows dan bisa mencetak dari aplikasi lain (Notepad/Photos).

---

## Phase 1 — Setup Dependency & Permission

### 1.1 Tambah dependency Rust

Edit `src-tauri/Cargo.toml`, tambahkan ke `[dependencies]`:

```toml
# Untuk Windows Print API
winapi = { version = "0.3", features = ["winspool", "wingdi", "winuser"] }
# Alternatif: pakai crate yang lebih high-level
printspooler = "0.1"  # Cek ketersediaan di crates.io
# Untuk konversi gambar ke format printer
image = "0.25"
```

### 1.2 Tambah permission di `capabilities/default.json`

Karena aplikasi perlu mengakses printer Windows, tambahkan permission:

```json
{
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "core:path:default",
    "core:process:default"
  ]
}
```

> **Catatan**: Untuk akses printer, tidak perlu permission tambahan karena Rust backend berjalan dengan hak akses sistem yang sama dengan aplikasi.

**Definition of Done Phase 1**: `cargo check` sukses tanpa error.

---

## Phase 2 — Rust Backend: DNP Printer Module

### 2.1 Buat file `src-tauri/src/printer.rs`

```rust
use serde::{Deserialize, Serialize};
use thiserror::Error;
use std::path::PathBuf;

#[derive(Error, Debug, Serialize)]
pub enum PrinterError {
    #[error("printer tidak ditemukan: {0}")]
    PrinterNotFound(String),
    #[error("gagal mencetak: {0}")]
    PrintFailed(String),
    #[error("gagal mendapatkan status printer: {0}")]
    StatusFailed(String),
    #[error("printer tidak siap")]
    PrinterNotReady,
    #[error("kertas habis")]
    OutOfPaper,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PrinterStatus {
    pub is_ready: bool,
    pub is_online: bool,
    pub paper_remaining: Option<u32>,
    pub paper_limit_alert: Option<u32>,
    pub printer_name: String,
    pub has_error: bool,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PrintOptions {
    pub copies: u32,
    pub paper_size: String, // "4x6", "6x8", "2x6", "6x6"
    pub quality: String,    // "standard", "high"
}

impl Default for PrintOptions {
    fn default() -> Self {
        Self {
            copies: 1,
            paper_size: "4x6".to_string(),
            quality: "standard".to_string(),
        }
    }
}

/// Mendapatkan daftar printer yang terinstal di Windows
pub fn get_installed_printers() -> Result<Vec<String>, PrinterError> {
    // Implementasi menggunakan winapi atau printspooler
    // Panggil EnumPrintersW dari winspool.dll
    unimplemented!("Akan diimplementasikan di Phase 2.2")
}

/// Cek status printer DNP DS-RX1HS
pub fn get_printer_status(printer_name: &str) -> Result<PrinterStatus, PrinterError> {
    // Implementasi menggunakan winapi
    // Bisa baca status dari driver DNP (paper remaining, error, dll.)
    unimplemented!("Akan diimplementasikan di Phase 2.3")
}

/// Cetak gambar ke printer DNP
pub fn print_image(
    printer_name: &str,
    image_path: &PathBuf,
    options: &PrintOptions,
) -> Result<(), PrinterError> {
    // Implementasi:
    // 1. Load image
    // 2. Konversi ke format yang sesuai (CMYK, resolusi)
    // 3. Kirim ke printer via Windows Print API
    unimplemented!("Akan diimplementasikan di Phase 2.4")
}

/// Cetak dari buffer gambar (langsung dari memory)
pub fn print_image_from_buffer(
    printer_name: &str,
    image_data: &[u8],
    options: &PrintOptions,
) -> Result<(), PrinterError> {
    // Sama seperti print_image, tapi dari memory buffer
    unimplemented!("Akan diimplementasikan di Phase 2.5")
}
```

### 2.2 Implementasi Windows Print API (Detail)

Untuk implementasi sebenarnya, Anda perlu memanggil Windows API:

**Step 1: Dapatkan daftar printer**

```rust
// Gunakan winapi::winspool::EnumPrintersW
// Filter untuk printer DNP DS-RX1HS
```

**Step 2: Buka printer**

```rust
// Gunakan winapi::winspool::OpenPrinterW
```

**Step 3: Mulai dokumen cetak**

```rust
// Gunakan winapi::winspool::StartDocPrinterW
// Gunakan winapi::winspool::StartPagePrinter
```

**Step 4: Kirim data gambar**

```rust
// Konversi gambar ke format yang didukung printer (biasanya JPEG atau BMP)
// Gunakan winapi::winspool::WritePrinter
```

**Step 5: Selesai cetak**

```rust
// Gunakan winapi::winspool::EndPagePrinter
// Gunakan winapi::winspool::EndDocPrinter
// Gunakan winapi::winspool::ClosePrinter
```

### 2.3 Baca Status Printer (Sisa Kertas)

Driver DNP menyediakan informasi status tambahan:

- **Sisa kertas** (`Remaining Paper Now`)
- **Batas peringatan** (`Paper Limit Alert`)
- **Status printer** (online/offline, error)

Untuk mengakses ini, Anda mungkin perlu:

1. Menggunakan **DNP SDK** (jika tersedia)
2. Atau membaca dari **registry** / **driver-specific API**
3. Atau menggunakan **WMI (Windows Management Instrumentation)** untuk query printer status

### 2.4 Tauri Commands untuk Printer

Edit `src-tauri/src/lib.rs`, tambahkan:

```rust
mod printer;

use printer::{PrinterStatus, PrintOptions, PrinterError};

#[tauri::command]
async fn get_printer_list() -> Result<Vec<String>, PrinterError> {
    printer::get_installed_printers()
}

#[tauri::command]
async fn get_printer_status(printer_name: String) -> Result<PrinterStatus, PrinterError> {
    printer::get_printer_status(&printer_name)
}

#[tauri::command]
async fn print_photo(
    printer_name: String,
    image_path: String,
    copies: u32,
    paper_size: String,
) -> Result<(), PrinterError> {
    let options = PrintOptions {
        copies,
        paper_size,
        ..Default::default()
    };
    printer::print_image(&printer_name, &PathBuf::from(image_path), &options)
}

#[tauri::command]
async fn print_photo_from_buffer(
    printer_name: String,
    image_data: Vec<u8>,
    copies: u32,
    paper_size: String,
) -> Result<(), PrinterError> {
    let options = PrintOptions {
        copies,
        paper_size,
        ..Default::default()
    };
    printer::print_image_from_buffer(&printer_name, &image_data, &options)
}

// Register commands di invoke_handler
// tambahkan: get_printer_list, get_printer_status, print_photo, print_photo_from_buffer
```

**Definition of Done Phase 2**:

```bash
cd src-tauri && cargo check
```

sukses tanpa error/warning fatal.

---

## Phase 3 — Frontend: Printer Store (Svelte 5)

Buat `src/lib/printer.svelte.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";

export type PrinterStatus = {
  is_ready: boolean;
  is_online: boolean;
  paper_remaining?: number;
  paper_limit_alert?: number;
  printer_name: string;
  has_error: boolean;
  error_message?: string;
};

export type PrintOptions = {
  copies: number;
  paper_size: "4x6" | "6x8" | "2x6" | "6x6";
  quality: "standard" | "high";
};

class PrinterStore {
  printers = $state<string[]>([]);
  selectedPrinter = $state<string | null>(null);
  status = $state<PrinterStatus | null>(null);
  isPrinting = $state(false);
  errorMessage = $state<string | null>(null);

  async loadPrinters() {
    try {
      this.printers = await invoke<string[]>("get_printer_list");
      // Filter untuk DNP
      const dnpPrinters = this.printers.filter(
        (p) => p.includes("DNP") || p.includes("DS-RX1"),
      );
      if (dnpPrinters.length > 0) {
        this.selectedPrinter = dnpPrinters[0];
        await this.refreshStatus();
      }
    } catch (err) {
      this.errorMessage = String(err);
    }
  }

  async refreshStatus() {
    if (!this.selectedPrinter) return;
    try {
      this.status = await invoke<PrinterStatus>("get_printer_status", {
        printerName: this.selectedPrinter,
      });
    } catch (err) {
      this.errorMessage = String(err);
    }
  }

  async print(imagePath: string, options: PrintOptions) {
    if (!this.selectedPrinter || this.isPrinting) return;
    this.isPrinting = true;
    this.errorMessage = null;
    try {
      await invoke("print_photo", {
        printerName: this.selectedPrinter,
        imagePath,
        copies: options.copies,
        paperSize: options.paper_size,
      });
    } catch (err) {
      this.errorMessage = String(err);
    } finally {
      this.isPrinting = false;
    }
  }

  async printFromBuffer(imageData: Uint8Array, options: PrintOptions) {
    if (!this.selectedPrinter || this.isPrinting) return;
    this.isPrinting = true;
    this.errorMessage = null;
    try {
      await invoke("print_photo_from_buffer", {
        printerName: this.selectedPrinter,
        imageData: Array.from(imageData),
        copies: options.copies,
        paperSize: options.paper_size,
      });
    } catch (err) {
      this.errorMessage = String(err);
    } finally {
      this.isPrinting = false;
    }
  }
}

export const printerStore = new PrinterStore();
```

**Definition of Done Phase 3**:

```bash
pnpm check
```

tidak menghasilkan error TypeScript.

---

## Phase 4 — UI: Printer Settings & Status

### 4.1 Tambahkan Tab Printer di Halaman Settings

Modifikasi `src/routes/camera-config/+page.svelte` atau buat halaman settings terpisah:

```svelte
<script lang="ts">
  import { printerStore } from "$lib/printer.svelte";
  import { onMount } from "svelte";

  let paperLimitAlert = $state(50);
  let paperReminder = $state(true);

  onMount(() => {
    printerStore.loadPrinters();
  });
</script>

<!-- ... existing code ... -->

{#if printerStore.printers.length > 0}
  <div class="border-t border-neutral-800 pt-4 mt-4">
    <h2 class="text-lg font-semibold mb-3">🖨️ Printer</h2>

    <div class="flex flex-col gap-2">
      <label class="text-sm text-neutral-400">Printer Terdeteksi</label>
      <select
        class="bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
        bind:value={printerStore.selectedPrinter}
        onchange={() => printerStore.refreshStatus()}
      >
        {#each printerStore.printers as p}
          <option value={p}>{p}</option>
        {/each}
      </select>

      {#if printerStore.status}
        <div class="bg-neutral-900 p-3 rounded mt-2 text-sm">
          <p>Status: <span class={printerStore.status.is_ready ? "text-green-400" : "text-red-400"}>
            {printerStore.status.is_ready ? "✅ Siap" : "❌ Tidak Siap"}
          </span></p>
          <p>Sisa Kertas: {printerStore.status.paper_remaining ?? "?"} lembar</p>
          {#if printerStore.status.paper_remaining && printerStore.status.paper_remaining < 50}
            <p class="text-yellow-400">⚠️ Kertas menipis!</p>
          {/if}
        </div>
      {/if}

      <!-- Paper Reminder Settings (dari gambar referensi) -->
      <div class="mt-3 border-t border-neutral-800 pt-3">
        <h3 class="text-sm font-medium text-neutral-400 mb-2">Pengaturan Peringatan Kertas</h3>

        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" bind:checked={paperReminder} />
          Paper Out Reminder
        </label>

        <div class="flex items-center gap-2 mt-2">
          <label class="text-sm text-neutral-400">Batas Peringatan:</label>
          <input
            type="number"
            class="bg-neutral-900 border border-neutral-700 rounded px-3 py-1 w-20"
            bind:value={paperLimitAlert}
          />
          <span class="text-sm text-neutral-400">lembar</span>
        </div>
      </div>
    </div>
  </div>
{/if}
```

### 4.2 Integrasi Print di Halaman Session

Modifikasi `src/routes/session/+page.svelte` untuk menambahkan opsi cetak:

```svelte
<script lang="ts">
  import { cameraStore } from "$lib/camera.svelte";
  import { printerStore } from "$lib/printer.svelte";

  let printCopies = $state(1);
  let paperSize = $state<"4x6" | "6x8" | "2x6" | "6x6">("4x6");
  let autoPrint = $state(true);

  async function handleCapture() {
    await cameraStore.capture();
    // Setelah capture, jika autoPrint aktif, cetak otomatis
    if (autoPrint && cameraStore.lastPhotoPath) {
      await printerStore.print(cameraStore.lastPhotoPath, {
        copies: printCopies,
        paper_size: paperSize,
        quality: "standard"
      });
    }
  }
</script>

<!-- ... existing code ... -->

<!-- Tambahan kontrol cetak -->
<div class="flex flex-col gap-2 mt-4 p-4 bg-neutral-900 rounded">
  <h3 class="text-sm font-medium">Pengaturan Cetak</h3>

  <label class="flex items-center gap-2 text-sm">
    <input type="checkbox" bind:checked={autoPrint} />
    Cetak Otomatis
  </label>

  <div class="flex gap-4">
    <div>
      <label class="text-sm text-neutral-400">Jumlah Cetak</label>
      <input
        type="number"
        min="1"
        max="5"
        class="bg-neutral-800 border border-neutral-700 rounded px-3 py-1 w-16"
        bind:value={printCopies}
      />
    </div>
    <div>
      <label class="text-sm text-neutral-400">Ukuran Kertas</label>
      <select
        class="bg-neutral-800 border border-neutral-700 rounded px-3 py-1"
        bind:value={paperSize}
      >
        <option value="4x6">4x6"</option>
        <option value="6x8">6x8"</option>
        <option value="2x6">2x6" (Strip)</option>
        <option value="6x6">6x6" (Persegi)</option>
      </select>
    </div>
  </div>

  {#if printerStore.isPrinting}
    <p class="text-yellow-400 text-sm">⏳ Mencetak...</p>
  {/if}

  {#if printerStore.errorMessage}
    <p class="text-red-400 text-sm">❌ {printerStore.errorMessage}</p>
  {/if}
</div>
```

**Definition of Done Phase 4**:

```bash
pnpm tauri dev
```

Aplikasi jalan, printer terdeteksi, status kertas terbaca, dan cetak foto berfungsi.

---

## Phase 5 — Uji Terintegrasi dengan Printer Fisik

Checklist manual (dilakukan bersama user, printer harus menyala & terhubung via USB):

- [ ] Printer terdeteksi di daftar printer (`get_printer_list` mengembalikan "DNP DS-RX1HS")
- [ ] Status printer menampilkan `is_ready: true` dan sisa kertas yang akurat
- [ ] Peringatan kertas menipis muncul ketika sisa kertas di bawah batas alert
- [ ] Cetak 1 foto berhasil (4x6")
- [ ] Cetak multiple copies (2-3 lembar) berhasil
- [ ] Cetak ukuran 2x6" (strip) berhasil
- [ ] Cetak dari buffer (tanpa menyimpan file) berhasil
- [ ] Error handling: ketika printer offline, aplikasi menampilkan pesan error yang jelas
- [ ] Reprint berhasil (cetak ulang foto yang sama)

---

## Eksplisit Di Luar Scope Dokumen Ini

- **Integrasi DNP SDK Resmi** (jika dibutuhkan fitur advanced seperti status ribbon, kalibrasi warna)
- **Auto-download hasil foto dari kamera** (saat ini foto tetap di SD card)
- **Multi-printer** (dua printer DNP dalam satu booth)
- **Print queue management** (antrian cetak)

---

## Ringkasan API yang Dipakai

| Fungsi                                              | Method | Deskripsi                                              |
| :-------------------------------------------------- | :----- | :----------------------------------------------------- |
| `get_printer_list()`                                | Sync   | Mendapatkan daftar printer terinstal di Windows        |
| `get_printer_status(name)`                          | Sync   | Mendapatkan status printer (siap, online, sisa kertas) |
| `print_photo(name, path, copies, size)`             | Async  | Cetak foto dari file path                              |
| `print_photo_from_buffer(name, data, copies, size)` | Async  | Cetak foto dari memory buffer                          |

---

## Referensi

- DNP Printer Drivers & Support: [eventprinters.com](https://eventprinters.com/pages/dnp-printer-drivers-repair-support)
- DNP DS-RX1HS Firmware v2.21: [Download](https://dnpphoto.com/Portals/0/Resources/RX1HS_v2.21_Win_Firmware%20Update.zip)
- Photobooth-app Printer Setup Guide: [photobooth-app.org](https://photobooth-app.org/extras/printerexample/)
