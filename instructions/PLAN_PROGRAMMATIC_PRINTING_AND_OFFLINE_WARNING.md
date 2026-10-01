# Plan Implementasi Desktop App: Programmatic Printing, Offline Print Queue & Warning Printer Offline

Dokumen ini berisi rencana teknis komprehensif untuk implementasi:
1. **Pencetakan Programatik Otomatis (Programmatic Auto-Printing)** berbasis strip komposit (`print_strip.jpg`).
2. **Mekanisme Antrean Cetak Tangguh (Offline-Resilient Print Queue / Print Outbox)** di SQLite lokal jika printer terputus di tengah sesi.
3. **Deteksi Real-Time & Warning Printer Offline** pada alur customer dan telemetry heartbeat.

---

## 1. Konteks Kunci: Spesifikasi Gambar Cetak (Single Strip Composite)

> [!IMPORTANT]
> **ATURAN UTAMA PENCETAKAN:**
> Gambar yang dikirim ke printer **HANYALAH** satu gambar strip utuh hasil komposit (`compositeTemplateImage`), yaitu:
> 1. Foto-foto hasil capture kamera yang telah diposisikan pada slot koordinat masing-masing.
> 2. Filter CSS yang dipilih pengguna (jika ada).
> 3. Bingkai frame template dari **`bg_url`** (`frame_image_url` / layer background dengan cutout transparan) yang berada **di atas** foto.
> 4. QR code link softfile dan stiker/emotikon pilihan pengguna (jika ada).
> 
> **TIDAK PERNAH** mencetak foto kamera mentah (`photos[i]` / `slot_01.jpg`) secara terpisah. Satu sesi cetak = 1 berkas strip komposit (`print_strip.jpg`) yang dicetak sebanyak `boothFlow.printQty` lembar.

---

## 2. Masalah Kritis: Printer Terputus di Tengah Sesi

### Skenario Lapangan:
1. Pelanggan telah memilih paket foto (misal 2 lembar cetak strip), melakukan pembayaran QRIS/tunai, dan menyelesaikan sesi foto serta filter.
2. Komposit strip berhasil dibentuk dan disimpan di disk lokal: `${base}/composite/print_strip.jpg`.
3. Tepat sebelum atau saat cetak dilakukan, kabel USB printer tersenggol, daya printer mati, atau printer kehabisan kertas/error roll.
4. **Tanpa Mekanisme Antrean (Queue)**:
   - Sesi foto selesai/timeout, aplikasi kembali ke layar awal (*welcome screen*).
   - Perintah cetak hilang dari memory RAM.
   - Pelanggan kecewa karena sudah membayar namun foto fisik tidak keluar, dan operator harus mencetak manual secara rumit.
5. **DENGAN Mekanisme Print Queue (Mirip Offline Outbox R2)**:
   - File fisik strip sudah aman tersimpan di disk lokal.
   - Perintah cetak disimpan ke tabel SQLite `print_queue` dengan status `pending`.
   - Kiosk memberi tahu pelanggan dengan ramah bahwa foto telah aman di antrean cetak dan memberikan QR softfile.
   - Segera setelah operator menghubungkan kembali kabel USB / mengisi kertas, sistem secara otomatis mengeksekusi antrean cetak (**Auto-Print Reconnect**) secara FIFO tanpa intervensi manual!

---

## 3. Arsitektur Solusi: Print Outbox / Queue

```
┌─────────────────────────────────────────────────────────────────┐
│               Kiosk Session Flow (V1Complete dkk.)              │
│  1. Generate compositeTemplateImage (Strip + bg_url)            │
│  2. Simpan fisik ke disk: ${base}/composite/print_strip.jpg     │
│  3. Cek printerStore.canPrint():                                │
│     ├─ ONLINE  -> Coba cetak langsung via print_photo_from_buf  │
│     │            (Jika gagal di tengah jalan -> Enqueue)        │
│     └─ OFFLINE -> Langsung Enqueue ke SQLite print_queue        │
│  4. Tampilkan status:                                           │
│     - Sukses: "Foto Anda berhasil dicetak!"                     │
│     - Masuk Antrean: "Koneksi printer terganggu. Foto Anda      │
│       masuk antrean cetak otomatis & segera dicetak saat online"│
└────────────────────────────────┬────────────────────────────────┘
                                 │
                     Simpan job  │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              SQLite Local Database (`print_queue`)              │
│  - id, session_code, image_path, copies, paper_size, status     │
│  - status: 'pending' | 'printing' | 'done' | 'failed'           │
└────────────────────────────────┬────────────────────────────────┘
                                 ▲
                     Background  │ Polling / Event
                     Worker      │ (Status Online Detected)
┌────────────────────────────────┴────────────────────────────────┐
│                    printQueue.ts (Worker)                       │
│  - Dipicu saat:                                                 │
│    a. printerStore mendeteksi status berubah jadi ONLINE        │
│    b. Kiosk app booting awal                                    │
│    c. Operator menekan "Flush Queue" di /camera-config          │
│  - Eksekusi FIFO satu per satu -> Update status 'done'          │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                    Heartbeat    │ pending_print_count
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Network Status Telemetry                    │
│  - Kirim pending_print_count ke API Server & Admin Dashboard    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Rencana Perubahan Detail Per-File

### 4.1 SQLite Migration 10: `print_queue` (`src-tauri/src/lib.rs`)
Tambahkan migrasi versi 10 pada array `migrations`:

```rust
Migration {
    version: 10,
    description: "create print_queue table for offline-resilient auto printing",
    sql: "CREATE TABLE IF NOT EXISTS print_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_code TEXT NOT NULL,
        image_path TEXT NOT NULL,
        copies INTEGER NOT NULL DEFAULT 1,
        paper_size TEXT NOT NULL DEFAULT '4x6',
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);",
    kind: MigrationKind::Up,
},
```

### 4.2 Helper Database `print_queue` (`src/lib/db/local.ts`)
Tambahkan fungsi-fungsi pengelola antrean cetak:

```typescript
export interface PrintJob {
  id: number;
  sessionCode: string;
  imagePath: string;
  copies: number;
  paperSize: string;
  status: 'pending' | 'printing' | 'done' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: number;
}

export async function enqueuePrintJob(params: {
  sessionCode: string;
  imagePath: string;
  copies: number;
  paperSize: string;
}): Promise<number> {
  const conn = await db();
  const now = Date.now();
  const res = await conn.execute(
    `INSERT INTO print_queue (session_code, image_path, copies, paper_size, status, attempts, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'pending', 0, $5, $5)`,
    [params.sessionCode, params.imagePath, params.copies, params.paperSize, now]
  );
  return Number(res.lastInsertId ?? 0);
}

export async function listPendingPrintJobs(): Promise<PrintJob[]> {
  const conn = await db();
  const rows = await conn.select<any[]>(
    `SELECT * FROM print_queue WHERE status = 'pending' AND attempts < 5 ORDER BY id ASC`
  );
  return rows.map((r) => ({
    id: r.id,
    sessionCode: r.session_code,
    imagePath: r.image_path,
    copies: r.copies,
    paperSize: r.paper_size,
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
    createdAt: r.created_at,
  }));
}

export async function markPrintJobDone(id: number): Promise<void> {
  const conn = await db();
  await conn.execute(
    `UPDATE print_queue SET status = 'done', updated_at = $2 WHERE id = $1`,
    [id, Date.now()]
  );
}

export async function markPrintJobFailedAttempt(id: number, error: string): Promise<void> {
  const conn = await db();
  const rows = await conn.select<any[]>("SELECT attempts FROM print_queue WHERE id = $1", [id]);
  const attempts = (rows[0]?.attempts ?? 0) + 1;
  const newStatus = attempts >= 5 ? 'failed' : 'pending';
  await conn.execute(
    `UPDATE print_queue SET status = $2, attempts = $3, last_error = $4, updated_at = $5 WHERE id = $1`,
    [newStatus, attempts, error, Date.now()]
  );
}

export async function countPendingPrintJobs(): Promise<number> {
  const conn = await db();
  const rows = await conn.select<any[]>(
    `SELECT COUNT(*) as c FROM print_queue WHERE status = 'pending'`
  );
  return Number(rows[0]?.c ?? 0);
}
```

### 4.3 Worker Otomatisasi Antrean Cetak: `src/lib/utils/printQueue.ts`
Buat berkas baru pengatur siklus antrean cetak:

```typescript
import { listPendingPrintJobs, markPrintJobDone, markPrintJobFailedAttempt } from '$lib/db/local';
import { printerStore } from '$lib/printer.svelte';
import { invoke } from '@tauri-apps/api/core';

let isFlushing = false;

export async function flushPrintQueue(): Promise<{ processed: number; errors: number }> {
  if (isFlushing) return { processed: 0, errors: 0 };
  
  // Pastikan printer benar-benar online dan siap sebelum flush
  await printerStore.refreshStatus();
  if (!printerStore.status?.is_online || !printerStore.status?.is_ready) {
    return { processed: 0, errors: 0 };
  }

  isFlushing = true;
  let processed = 0;
  let errors = 0;

  try {
    const jobs = await listPendingPrintJobs();
    for (const job of jobs) {
      // Re-check printer status sebelum mencetak job berikutnya
      if (!printerStore.status?.is_online || !printerStore.status?.is_ready) {
        break;
      }

      try {
        await invoke('print_photo', {
          printerName: printerStore.selectedPrinter,
          imagePath: job.imagePath,
          copies: job.copies,
          paperSize: job.paperSize,
        });

        await markPrintJobDone(job.id);
        processed++;
        // Update software paper counter lokal
        if (printerStore.status?.paper_remaining) {
          printerStore.status.paper_remaining = Math.max(0, printerStore.status.paper_remaining - job.copies);
        }
      } catch (err) {
        console.error(`[printQueue] Gagal mencetak job #${job.id}:`, err);
        await markPrintJobFailedAttempt(job.id, String(err));
        errors++;
        // Hentikan proses jika printer mendadak offline kembali
        await printerStore.refreshStatus();
        if (!printerStore.status?.is_online) break;
      }
    }
  } finally {
    isFlushing = false;
  }

  return { processed, errors };
}
```

### 4.4 Integrasi Auto-Flush pada Perubahan Status Printer (`printer.svelte.ts`)
Di dalam `PrinterStore`:
- Saat polling mendeteksi transisi dari `is_online: false` menjadi `is_online: true`:
  Panggil otomatis `flushPrintQueue()`!
- Dengan ini, begitu staff menancapkan kembali kabel USB printer, antrean yang tertunda langsung dicetak tanpa perlu menekan tombol apapun.

### 4.5 Eksekusi di Layar Selesai Kiosk (`V1Complete.svelte`, `V2Download.svelte`, `V3Download.svelte`)
Perbarui penanganan cetak:

```typescript
const copies = boothFlow.printQty || 1;
const paperSize = selectedTemplate?.paper_size || '4x6';
const diskPath = `${base}/composite/print_strip.jpg`; // path absolut atau relatif yang disimpan saveSessionAssets

if (copies > 0) {
  const check = printerStore.canPrint(copies);
  
  if (check.ok) {
    // Printer online: coba cetak langsung
    isPrinting = true;
    try {
      const bytes = await blobToBytes(compositeUrl);
      await printerStore.printFromBuffer(bytes, {
        copies,
        paper_size: paperSize as any,
        quality: 'standard'
      });
      printStatus = 'SUCCESS';
    } catch (err) {
      console.warn('[V1Complete] Cetak langsung gagal, mengalihkan ke antrean:', err);
      // Gagal saat transmisi: simpan ke print_queue agar tidak hilang!
      await enqueuePrintJob({
        sessionCode: boothFlow.sessionCode,
        imagePath: diskPath,
        copies,
        paperSize
      });
      printStatus = 'QUEUED';
    } finally {
      isPrinting = false;
    }
  } else {
    // Printer sedang offline / error: amankan langsung ke antrean!
    await enqueuePrintJob({
      sessionCode: boothFlow.sessionCode,
      imagePath: diskPath,
      copies,
      paperSize
    });
    printStatus = 'QUEUED';
  }
}
```

**Feedback UI untuk Pengguna**:
- Jika `printStatus === 'SUCCESS'`:
  `"✅ Foto strip Anda sedang dicetak. Silakan ambil di tray printer."`
- Jika `printStatus === 'QUEUED'`:
  `"⏳ Koneksi printer terganggu. Foto strip Anda telah disimpan ke antrean cetak otomatis dan akan langsung tercetak saat printer terhubung kembali oleh staff. Anda tetap dapat mengunduh softfile digital lewat QR code di atas."`

### 4.6 Sinkronisasi Telemetry Heartbeat (`networkStatus.svelte.ts`)
Tambahkan `pending_print_count` ke payload heartbeat:
```typescript
const pendingPrints = await countPendingPrintJobs().catch(() => 0);

const payload = {
  device_id: identity.deviceId,
  app_version: '0.1.0',
  mode: mode,
  camera_status: cameraStatus,
  printer_status: printerStatus,
  remaining_paper: printerStore.status?.paper_remaining ?? null,
  pending_outbox_count: pendingOutbox,
  pending_print_count: pendingPrints, // BARU
  offline_duration_seconds: offlineDuration,
};
```

---

## 5. Tahapan Pelaksanaan (Step-by-Step Execution Plan)

### Phase 1: SQLite Migration 10
- Edit `dekstop-app/src-tauri/src/lib.rs`: tambahkan `Migration 10` untuk tabel `print_queue`.
- Verifikasi `cargo check`.

### Phase 2: Database Helpers & Queue Worker
- Edit `dekstop-app/src/lib/db/local.ts`: tambahkan helper CRUD `print_queue`.
- Buat `dekstop-app/src/lib/utils/printQueue.ts`: fungsi `flushPrintQueue()`.

### Phase 3: Auto-Flush pada Reconnect & Kiosk Boot
- Edit `dekstop-app/src/lib/printer.svelte.ts`: panggil `flushPrintQueue()` saat transisi offline -> online.
- Panggil `flushPrintQueue()` saat aplikasi pertama kali boot.

### Phase 4: Integrasi Alur Selesai Sesi (`V1Complete`, `V2Download`, `V3Download`)
- Hubungkan logika try-direct-print dengan fallback `enqueuePrintJob`.
- Tambahkan teks status informatif di UI.

### Phase 5: Telemetry Heartbeat Update
- Edit `dekstop-app/src/lib/stores/networkStatus.svelte.ts` untuk mengirim `pending_print_count`.

---

## 6. Definition of Done (DoD)

1. **Zero Data Loss**: Jika printer terputus/mati di tengah sesi, strip komposit tetap tersimpan di disk dan job cetak tersimpan di `print_queue`.
2. **Auto-Resume Cetak**: Segera setelah printer terhubung kembali, `flushPrintQueue()` secara otomatis mencetak seluruh strip yang tertunda secara urut.
3. **Pesan UI Ramah**: Pengguna tidak melihat error teknis mentah, melainkan penjelasan ramah bahwa cetakan aman di antrean dan softfile tetap dapat diakses.
4. **Telemetry Akurat**: Server dan Admin Dashboard mengetahui jumlah antrean cetak yang menunggu (`pending_print_count`).
