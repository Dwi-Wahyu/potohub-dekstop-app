# Instruksi: Perbaikan False Offline Verdict & Outbox Poison Loop — `dekstop-app`

Dokumen ini adalah panduan teknis dan instruksi perbaikan mendalam untuk mengatasi masalah **salah mengira offline (false offline verdict)** yang terjadi pada mode development maupun build (production) pada aplikasi desktop Photobooth (`dekstop-app`).

Dokumen ini melengkapi dan memperbaiki kelemahan yang ditemukan pada implementasi [`OFFLINE_SAFE_PAYMENT_TICKET_SOFTFILE_SYNC.md`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/instructions/OFFLINE_SAFE_PAYMENT_TICKET_SOFTFILE_SYNC.md) dan laporan [`OFFLINE_SAFE_PAYMENT_TICKET_SOFTFILE_SYNC_REPORT.md`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/instructions-reports/OFFLINE_SAFE_PAYMENT_TICKET_SOFTFILE_SYNC_REPORT.md).

---

## 1. Analisis Akar Masalah (Root Cause Analysis)

Berdasarkan audit mendalam terhadap kode sumber sistem, terdapat **6 faktor utama** yang secara simultan menyebabkan aplikasi sering salah memvonis status jaringan menjadi *offline* padahal perangkat terhubung ke internet/jaringan:

### 1.1. "Poison Outbox" Feedback Loop (`markOfflineDueToFailure()`) — *PENYEBAB UTAMA*
- **Lokasi:** [`src/lib/utils/offlineOutbox.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/utils/offlineOutbox.ts#L52-L57) & [`src/lib/stores/networkStatus.svelte.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/stores/networkStatus.svelte.ts#L76-L78).
- **Mekanisme Kegagalan:**
  1. Saat aplikasi mendeteksi jaringan, `verifyAndMaybeFlush()` memanggil `pingServer()`.
  2. Begitu ping sukses, `isOnline` bernilai `true`, lalu memanggil `flushOutbox()`.
  3. `flushOutbox()` memproses antrean `offline_outbox`. Jika `processJob(job)` menghasilkan `false`, kode mengeksekusi:
     ```ts
     networkStatus.markOfflineDueToFailure();
     break;
     ```
  4. **Fatal Flaw:** `processJob(job)` mengembalikan `false` untuk **SEMUA jenis error**, termasuk error logika bisnis / HTTP 4xx, bukan hanya error konektivitas jaringan:
     - Pada `redeem_ticket`: Jika tiket ditolak server (misal sudah pernah dipakai di booth lain atau kedaluwarsa), server membalas HTTP 400. `validateAndRedeemQrTicket` melempar `Error`. Handler menangkapnya dan mengembalikan `false`.
     - Pada `session_softfile`: Jika email/nomor WA pelanggan salah format, kuota Fonnte/WhatsApp habis, atau kredensial SMTP belum disetel, `sendSoftfileEmail`/`sendSoftfileWA` mengembalikan `false`. Kode melempar `Error('Softfile gagal terkirim...')` dan mengembalikan `false`.
     - Jika booth belum teraktivasi di database atau token kadaluwarsa (HTTP 401), `createTransactionSession` melempar error.
  5. Job yang gagal ini dibiarkan berstatus `pending` di antrean terdepan (`ORDER BY id ASC`).
  6. **Efek Bumerang:** Setiap kali sistem berhasil ping online, milidetik berikutnya outbox mencoba mengeksekusi job beracun (poison job) ini -> gagal -> langsung memanggil `markOfflineDueToFailure()` -> **status seketika dibanting kembali ke OFFLINE (`isOnline = false`)**. Pengguna melihat aplikasi seolah "macet dalam mode offline".

### 1.2. Ketergantungan Buta pada `navigator.onLine` & Event OS Tanpa Debounce
- **Lokasi:** [`src/lib/stores/networkStatus.svelte.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/stores/networkStatus.svelte.ts#L24-L52).
- **Mekanisme Kegagalan:**
  - `navigator.onLine` pada WebView desktop (khususnya WebKitGTK di Linux via `GNetworkMonitor`, serta WebView2 di Windows) sering tidak akurat saat ada antarmuka virtual (Docker bridge `docker0`, veth, WireGuard, Tailscale, VM adapter) atau transisi Wi-Fi powersave.
  - Event `window.addEventListener('offline')` memicu `handleOsOffline()` yang **seketika mengubah `isOnline = false` tanpa debounce** dan tanpa verifikasi ping.
  - Di dalam `pingServer()`, terdapat baris:
    ```ts
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    ```
    Jika `navigator.onLine` salah melaporkan `false`, fungsi `pingServer()` **menolak melakukan ping sama sekali**, mematikan peluang aplikasi untuk memverifikasi kondisi server sebenarnya.
  - Saat startup di mode build/dev, webview sering kali menginisialisasi `navigator.onLine` sebagai `false` selama beberapa puluh milidetik pertama. Akibatnya `init()` langsung mengunci `this.isOnline = false` tanpa menjalankan ping.

### 1.3. Ketiadaan Polling / Heartbeat Recovery Saat Offline ("One-Way Trap")
- **Lokasi:** [`src/routes/+layout.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/routes/+layout.svelte#L13-L19).
- **Mekanisme Kegagalan:**
  - Interval periodik 10 menit di `+layout.svelte` dibungkus kondisi:
    ```svelte
    if (networkStatus.isOnline) { ... }
    ```
  - Jika aplikasi sudah divonis offline, **tidak ada worker atau timer yang mencoba mengecek kembali apakah koneksi sudah pulih**.
  - Aplikasi 100% bergantung pada event OS `window.ononline`. Jika antarmuka fisik tidak pernah mati-nyala (misal koneksi internet yang sempat putus di router, atau backend yang baru saja dinyalakan), event `online` **tidak akan pernah dikirim oleh OS**. Aplikasi terkunci dalam mode offline selamanya sampai aplikasi direstart atau dibuka Config Dashboard secara manual.

### 1.4. Ping Server Terlalu Rapuh (Single Attempt, 4000ms, Tanpa Retry)
- **Lokasi:** [`src/lib/stores/networkStatus.svelte.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/stores/networkStatus.svelte.ts#L44-L55).
- **Mekanisme Kegagalan:**
  - `pingServer()` hanya mencoba 1 kali request ke `HEALTH_URL` dengan batas waktu 4000ms.
  - Jika backend sedang restart, cold start koneksi database/R2, atau terjadi jitter paket sesaat (>4000ms), ping gagal dan langsung memvonis sistem offline.
  - Tidak ada mekanisme multi-step probe atau retry cepat (fast retry).

### 1.5. Mismatch Konfigurasi URL API (`.env` vs Build vs Dev)
- **Lokasi:** [`dekstop-app/.env`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/.env), `vite.config.js`.
- **Mekanisme Kegagalan:**
  - Di `.env`:
    ```env
    PUBLIC_API_BASE_URL=http://localhost:8080/api
    ```
  - Pada saat `pnpm build` (mode produksi), Vite melakukan inline static replacement terhadap variabel lingkungan.
  - Jika binary build dijalankan di laptop/PC booth dan backend lokal (`localhost:8080`) tidak dinyalakan di mesin tersebut, setiap ping ke `http://localhost:8080/api/health` akan menghasilkan `ECONNREFUSED`. Aplikasi langsung dan selamanya memvonis dirinya **offline 100%**.
  - Pada mode dev, jika frontend dinyalakan mendahului backend Actix (`cargo run`), ping awal gagal dan langsung masuk ke jebakan "One-Way Trap".

### 1.6. Head-of-Line Blocking & Ketiadaan Dead-Letter Queue pada Outbox
- **Lokasi:** [`src/lib/db/local.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/db/local.ts#L408-L434).
- **Mekanisme Kegagalan:**
  - Job yang gagal hanya ditandai `attempts = attempts + 1` dan tetap berstatus `pending`.
  - Fungsi `listPendingOutboxJobs()` selalu menarik baris dengan `WHERE status != 'done' ORDER BY id ASC`.
  - Jika ada satu job yang datanya rusak permanen (misal file foto di disk terhapus atau payload korup), job tersebut akan terus dicoba pertama kali di setiap siklus, selalu gagal, dan mematikan pemrosesan job lain di belakangnya.

---

## 2. Rencana Perbaikan Arsitektur

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                RESTRUCTURED NETWORK STORE                              │
│                                                                                        │
│  ┌──────────────────────┐    OS Offline Event    ┌──────────────────────────────────┐  │
│  │ Window Event Listener│ ─────────────────────► │ Debounce 3s + Ping Verification  │  │
│  └──────────────────────┘                        │ (Cegah false offline dari OS)    │  │
│                                                  └─────────────────┬────────────────┘  │
│  ┌──────────────────────┐   Setiap 5s (Offline)                    │                   │
│  │ Active Heartbeat     │   Setiap 30s (Online)                    ▼                   │
│  │ Polling Loop         ├──────────────────────► ┌──────────────────────────────────┐  │
│  └──────────────────────┘                        │ pingServerWithRetry()            │  │
│                                                  │ - 2x fast probe                  │  │
│                                                  │ - Abaikan navigator.onLine palsu │  │
│                                                  └─────────────────┬────────────────┘  │
│                                                                    │                   │
│                                                                    ▼                   │
│                                                  ┌──────────────────────────────────┐  │
│                                                  │ isOnline ($state) Updated        │  │
│                                                  └─────────────────┬────────────────┘  │
│                                                                    │                   │
│                                          Koneksi pulih (true)      ▼                   │
│  ┌─────────────────────────────────────────────────────────────────┴────────────────┐  │
│  │                            RESILIENT OUTBOX WORKER                               │  │
│  │                                                                                  │  │
│  │  1. listActiveOutboxJobs() (WHERE status = 'pending' AND attempts < 5)           │  │
│  │  2. Eksekusi sekuensial:                                                         │  │
│  │     - Sukses               ──► markOutboxJobDone()                               │  │
│  │     - Error Bisnis (4xx)   ──► markOutboxJobDone() / dead_letter (JANGAN OFFLINE)│  │
│  │     - Network Error Murni  ──► markFailedAttempt() + STOP + markOffline()        │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Prinsip Perbaikan:
1. **Network Error vs Application Error Isolation**: Kegagalan HTTP 4xx (tiket ditolak, format nomor salah, auth invalid) adalah **bukti bahwa server hidup dan online**. Jangan pernah mengubah status koneksi menjadi offline akibat error HTTP status code.
2. **Never Blindly Trust OS Offline**: Beri debounce 3 detik dan verifikasi dengan ping langsung sebelum percaya pada event `offline` dari browser.
3. **Active Heartbeat Loop**: Jalankan loop pengecekan mandiri di dalam store: setiap 5 detik saat offline (agar cepat pulih begitu koneksi ada), dan setiap 30-60 detik saat online.
4. **Resilient Ping**: Abaikan `navigator.onLine` jika fetch HTTP ternyata berhasil menjangkau server. Lakukan retry cepat (2x percobaan) sebelum menyimpulkan server tak terjangkau.
5. **Dead-Letter Queue Outbox**: Batasi percobaan ulang job maksimal 5 kali. Job yang melebihi batas dipindahkan ke status `dead_letter` agar tidak memblokir antrean seumur hidup.

---

## 3. Langkah Demi Langkah Implementasi

### Bagian A: Perbaiki Database Outbox di `src/lib/db/local.ts`

Buka [`src/lib/db/local.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/db/local.ts). Ubah bagian outbox agar:
1. Mendukung status `'dead_letter'`.
2. `listPendingOutboxJobs` hanya mengambil job dengan `attempts < 5` dan `status = 'pending'`.
3. Menambahkan fungsi `markOutboxJobDeadLetter`.

```ts
// Ganti definisi OutboxJob dan helper terkait di src/lib/db/local.ts

export interface OutboxJob {
  id: number;
  jobType: 'redeem_ticket' | 'session_softfile';
  localRef: string | null;
  payload: string;
  status: 'pending' | 'processing' | 'done' | 'dead_letter';
  attempts: number;
  lastError: string | null;
}

export const MAX_OUTBOX_ATTEMPTS = 5;

export async function listPendingOutboxJobs(): Promise<OutboxJob[]> {
  const conn = await db();
  // Hanya ambil job pending yang belum melampaui batas percobaan maksimum
  const rows = await conn.select<any[]>(
    `SELECT * FROM offline_outbox 
     WHERE status = 'pending' AND attempts < $1 
     ORDER BY id ASC`,
    [MAX_OUTBOX_ATTEMPTS],
  );
  return rows.map((r) => ({
    id: r.id,
    jobType: r.job_type,
    localRef: r.local_ref,
    payload: r.payload,
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
  }));
}

export async function markOutboxJobDone(id: number): Promise<void> {
  const conn = await db();
  await conn.execute(
    "UPDATE offline_outbox SET status = 'done', updated_at = $2 WHERE id = $1",
    [id, Date.now()],
  );
}

export async function markOutboxJobFailedAttempt(id: number, error: string): Promise<void> {
  const conn = await db();
  const now = Date.now();
  // Ambil data attempt saat ini
  const rows = await conn.select<any[]>(
    "SELECT attempts FROM offline_outbox WHERE id = $1",
    [id]
  );
  const currentAttempts = (rows[0]?.attempts ?? 0) + 1;
  const newStatus = currentAttempts >= MAX_OUTBOX_ATTEMPTS ? 'dead_letter' : 'pending';

  await conn.execute(
    `UPDATE offline_outbox 
     SET status = $2, attempts = $3, last_error = $4, updated_at = $5 
     WHERE id = $1`,
    [newStatus, currentAttempts, error, now],
  );
}

export async function markOutboxJobDeadLetter(id: number, reason: string): Promise<void> {
  const conn = await db();
  await conn.execute(
    "UPDATE offline_outbox SET status = 'dead_letter', last_error = $2, updated_at = $3 WHERE id = $1",
    [id, reason, Date.now()],
  );
}

export async function countPendingOutboxJobs(): Promise<number> {
  const conn = await db();
  const rows = await conn.select<any[]>(
    `SELECT COUNT(*) as c FROM offline_outbox 
     WHERE status = 'pending' AND attempts < $1`,
    [MAX_OUTBOX_ATTEMPTS]
  );
  return Number(rows[0]?.c ?? 0);
}
```

---

### Bagian B: Klasifikasi Error Jaringan di `src/lib/api/boothClient.ts`

Buka [`src/lib/api/boothClient.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/api/boothClient.ts). 

1. Tambahkan utilitas helper untuk membedakan antara **Network Failure** murni vs **HTTP Response Failure**:

```ts
/**
 * Memeriksa apakah suatu error merupakan kegagalan transport/koneksi jaringan nyata
 * (bukan error respon HTTP dari server seperti 400, 401, 404, 500).
 */
export function isNetworkTransportError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof TypeError) {
    // Di browser/webview: "Failed to fetch", "NetworkError when attempting to fetch resource", dsb.
    return true;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('networkrequestfailed') ||
    msg.includes('connection refused') ||
    msg.includes('the operation was aborted') ||
    msg.includes('timeout')
  );
}
```

2. Perbaiki fungsi `validateAndRedeemQrTicket` agar **tidak melempar Exception fatal** jika server merespons HTTP 400 (karena ini respon sah server yang menyatakan tiket ditolak/kadaluwarsa, bukan kegagalan jaringan):

```ts
export async function validateAndRedeemQrTicket(
  token: string,
  boothId?: string,
): Promise<RedeemQrTicketResponse> {
  const cleanToken = token.includes("token=")
    ? token.split("token=")[1].split("&")[0]
    : token.trim();
  const cleanBoothId = boothId && boothId.trim() !== "" ? boothId.trim() : null;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/qr-tickets/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: cleanToken,
        booth_id: cleanBoothId,
      }),
    });
  } catch (networkErr) {
    // Lempar ulang error jaringan asli agar pemanggil tahu ini masalah koneksi
    throw networkErr;
  }

  // Jika server merespons (baik 200 maupun 400/404/422), jaringan jelas ONLINE!
  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const serverMessage = errJson?.message || "Tiket QR tidak valid atau telah digunakan";
    return {
      valid: false,
      success: false,
      message: serverMessage,
      ticket: null,
    };
  }

  const json = await res.json();
  return {
    ...json,
    valid: Boolean(json.valid ?? json.success ?? true),
    success: true,
  };
}
```

3. Perbaiki `redeemTicket` agar memeriksa `networkStatus.isOnline` dengan cerdas, dan jika fetch gagal karena error jaringan, jatuh ke offline mode:

```ts
export async function redeemTicket(token: string, boothId: string): Promise<RedeemTicketResult> {
  const cleanToken = token.includes('token=')
    ? token.split('token=')[1].split('&')[0]
    : token.trim();

  const { networkStatus } = await import('$lib/stores/networkStatus.svelte');

  // Jika status online (atau belum pasti), coba jalur server dulu
  if (networkStatus.isOnline) {
    try {
      const remote = await validateAndRedeemQrTicket(cleanToken, boothId);
      // Jika remote mengembalikan respons server (valid true/false), kembalikan hasilnya langsung
      return { 
        valid: remote.valid, 
        message: remote.message || (remote.valid ? 'Tiket valid' : 'Tiket tidak valid'), 
        offline: false 
      };
    } catch (e) {
      // Hanya jatuh ke jalur offline jika error-nya memang error konektivitas jaringan
      if (!isNetworkTransportError(e)) {
        return { 
          valid: false, 
          message: e instanceof Error ? e.message : 'Tiket tidak valid', 
          offline: false 
        };
      }
      console.warn('[redeemTicket] Jaringan bermasalah saat redeem online, beralih ke cache lokal:', e);
    }
  }

  // Jalur offline fallback
  return redeemTicketOffline(cleanToken, boothId);
}
```

---

### Bagian C: Refactor Outbox Worker di `src/lib/utils/offlineOutbox.ts`

Buka [`src/lib/utils/offlineOutbox.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/utils/offlineOutbox.ts).

**Perubahan Kritis:**
- Pisahkan penanganan error: Hanya panggil `markOfflineDueToFailure()` jika error terbukti merupakan `isNetworkTransportError`.
- Jika error adalah error bisnis (misal tiket ditolak, template ID tidak ditemukan, upload R2 ditolak hak akses), tandai job selesai (`markOutboxJobDone`) atau buang ke dead letter queue (`markOutboxJobDeadLetter`). Jangan hentikan antrean dan jangan matikan status jaringan!

```ts
import {
  listPendingOutboxJobs,
  markOutboxJobDone,
  markOutboxJobFailedAttempt,
  markOutboxJobDeadLetter,
  clearCachedTicketOfflineFlag,
  type OutboxJob,
} from '$lib/db/local';
import {
  validateAndRedeemQrTicket,
  createTransactionSession,
  uploadGalleryAsset,
  isNetworkTransportError,
} from '$lib/api/boothClient';
import { sendSoftfileEmail, sendSoftfileWA } from '$lib/utils/shared';
import { invoke } from '@tauri-apps/api/core';

let flushing = false;

interface RedeemTicketPayload {
  token: string;
  boothId: string;
}

interface SessionSoftfilePayload {
  boothId: string;
  categoryId: string | null;
  frameId: string | null;
  printQty: number;
  paymentMethod: 'Ticket' | 'Cashless';
  softfileTarget: string | null;
  localSessionCode: string;
  assetRelativePaths: {
    role: 'composite' | 'gif' | 'video';
    path: string;
    contentType: string;
    width: number;
    height: number;
  }[];
}

export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const jobs = await listPendingOutboxJobs();
    for (const job of jobs) {
      const result = await processJob(job);
      if (result.status === 'network_failure') {
        // HANYA jika benar-benar error jaringan transport, tandai offline dan hentikan antrean
        console.warn(`[offlineOutbox] Job #${job.id} mengalami error jaringan. Menjeda outbox.`);
        const { networkStatus } = await import('$lib/stores/networkStatus.svelte');
        networkStatus.markOfflineDueToFailure();
        break;
      }
      // Jika result status 'success' atau 'business_error', lanjut ke job berikutnya!
    }
  } finally {
    flushing = false;
  }
}

type JobProcessOutcome = 
  | { status: 'success' }
  | { status: 'business_error'; reason: string }
  | { status: 'network_failure'; error: unknown };

async function processJob(job: OutboxJob): Promise<JobProcessOutcome> {
  try {
    if (job.jobType === 'redeem_ticket') {
      const payload: RedeemTicketPayload = JSON.parse(job.payload);
      const result = await validateAndRedeemQrTicket(payload.token, payload.boothId);
      
      if (!result.valid) {
        console.warn(`[offlineOutbox] Tiket ${payload.token} ditolak server saat sync:`, result.message);
      }
      
      // Bersihkan flag offline & tandai job selesai terlepas tiket diterima/ditolak server
      await clearCachedTicketOfflineFlag(payload.token);
      await markOutboxJobDone(job.id);
      return { status: 'success' };
    }

    if (job.jobType === 'session_softfile') {
      const payload: SessionSoftfilePayload = JSON.parse(job.payload);

      let sessionId: string;
      try {
        const session = await createTransactionSession(
          payload.boothId,
          payload.categoryId,
          payload.printQty,
          payload.paymentMethod,
          payload.frameId,
        );
        sessionId = session.session_id || (session as any).id;
      } catch (sessErr) {
        if (isNetworkTransportError(sessErr)) {
          await markOutboxJobFailedAttempt(job.id, String(sessErr));
          return { status: 'network_failure', error: sessErr };
        }
        // Jika 400/401/404 bukan error jaringan, catat sebagai dead-letter agar tidak macet selamanya
        console.error(`[offlineOutbox] createTransactionSession gagal permanen untuk Job #${job.id}:`, sessErr);
        await markOutboxJobDeadLetter(job.id, `Session create failed: ${sessErr}`);
        return { status: 'business_error', reason: String(sessErr) };
      }

      // Upload file aset lokal yang tersimpan
      for (const asset of payload.assetRelativePaths) {
        try {
          const bytes = await invoke<number[]>('read_session_file', { relativePath: asset.path });
          const blob = new Blob([new Uint8Array(bytes)], { type: asset.contentType });
          await uploadGalleryAsset(
            payload.boothId,
            sessionId,
            asset.role === 'composite' ? 'photo' : asset.role,
            blob,
            asset.contentType.split('/')[1] || 'jpg',
            asset.contentType,
            asset.width,
            asset.height,
          );
        } catch (assetErr) {
          if (isNetworkTransportError(assetErr)) {
            await markOutboxJobFailedAttempt(job.id, String(assetErr));
            return { status: 'network_failure', error: assetErr };
          }
          console.warn(`[offlineOutbox] Asset ${asset.path} gagal dibaca/diupload:`, assetErr);
        }
      }

      // Kirim softfile jika ada target (jangan lempar fatal network error jika nomor/email gagal terkirim)
      if (payload.softfileTarget) {
        try {
          const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.softfileTarget);
          if (isEmail) {
            await sendSoftfileEmail(payload.softfileTarget, () => {}, sessionId);
          } else {
            await sendSoftfileWA(payload.softfileTarget, () => {}, sessionId);
          }
        } catch (softfileErr) {
          console.warn('[offlineOutbox] Pengiriman email/WA softfile gagal saat sync, namun sesi & aset aman:', softfileErr);
        }
      }

      await markOutboxJobDone(job.id);
      return { status: 'success' };
    }

    console.warn('[offlineOutbox] job_type tidak dikenal:', job.jobType);
    await markOutboxJobDone(job.id);
    return { status: 'success' };
  } catch (e) {
    if (isNetworkTransportError(e)) {
      await markOutboxJobFailedAttempt(job.id, String(e));
      return { status: 'network_failure', error: e };
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[offlineOutbox] Job #${job.id} (${job.jobType}) gagal non-network:`, msg);
    await markOutboxJobFailedAttempt(job.id, msg);
    return { status: 'business_error', reason: msg };
  }
}
```

---

### Bagian D: Refactor `src/lib/stores/networkStatus.svelte.ts`

Buka [`src/lib/stores/networkStatus.svelte.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/stores/networkStatus.svelte.ts).

**Perubahan Kritis:**
1. **Hilangkan pemblokiran `if (!navigator.onLine) return false;`** di `pingServer()`. Selama kita ingin menguji server, coba lakukan HTTP fetch.
2. **Debounce event `offline`**: Saat OS menembakkan event `offline`, tunda 3 detik lalu lakukan ping verifikasi. Jika ping berhasil, jangan pernah ubah `isOnline` menjadi `false`.
3. **Tambahkan Heartbeat Polling Loop**:
   - Jika `isOnline === false`: Lakukan cek setiap **5 detik** agar ketika jaringan tersambung kembali, aplikasi pulih secara instan tanpa menunggu interaksi pengguna.
   - Jika `isOnline === true`: Lakukan cek berkala setiap **30 detik**.
4. **Retry Cepat pada Ping**: Jika percobaan pertama timeout/gagal, lakukan percobaan kedua sebelum memutuskan bahwa server benar-benar mati.

```ts
import { flushOutbox } from '$lib/utils/offlineOutbox';

const envs = import.meta.env as Record<string, string>;
const rawBase =
  envs.VITE_API_BASE_URL || envs.PUBLIC_API_BASE_URL || 'http://localhost:8080/api';
const API_BASE = rawBase.replace(/\/+$/, '');
const HEALTH_URL = `${API_BASE}/health`;

const PING_TIMEOUT_MS = 3500;
const HEARTBEAT_OFFLINE_MS = 5000;  // saat offline, cek tiap 5 detik
const HEARTBEAT_ONLINE_MS = 30000;  // saat online, cek tiap 30 detik
const OS_OFFLINE_DEBOUNCE_MS = 3000;

class NetworkStatusStore {
  isOnline = $state(true); // Default optimis untuk mencegah freeze UI pada awal start
  isVerifying = $state(false);
  lastCheckedAt = $state<number | null>(null);

  private listenersBound = false;
  private heartbeatTimer: any = null;
  private offlineDebounceTimer: any = null;

  init() {
    if (typeof window === 'undefined' || this.listenersBound) return;
    this.listenersBound = true;

    // 1) Sinyal dari OS / Browser
    window.addEventListener('online', () => this.handleOsOnline());
    window.addEventListener('offline', () => this.handleOsOffline());

    // 2) Jalankan verifikasi awal saat startup tanpa memblokir
    void this.verifyAndMaybeFlush();

    // 3) Mulai heartbeat loop adaptif
    this.startHeartbeat();
  }

  private handleOsOnline() {
    console.log('[NetworkStatus] OS memicu event online. Memverifikasi server...');
    if (this.offlineDebounceTimer) {
      clearTimeout(this.offlineDebounceTimer);
      this.offlineDebounceTimer = null;
    }
    void this.verifyAndMaybeFlush();
  }

  private handleOsOffline() {
    console.log('[NetworkStatus] OS memicu event offline. Menunggu verifikasi...');
    // JANGAN LANGSUNG SET FALSE! Beri jeda 3 detik lalu verifikasi via ping
    if (this.offlineDebounceTimer) clearTimeout(this.offlineDebounceTimer);
    this.offlineDebounceTimer = setTimeout(async () => {
      const actuallyOnline = await this.pingServer();
      if (!actuallyOnline) {
        console.warn('[NetworkStatus] Terkonfirmasi offline setelah verifikasi.');
        this.isOnline = false;
        this.resetHeartbeat();
      } else {
        console.log('[NetworkStatus] Event offline diabaikan: Server tetap dapat dijangkau.');
      }
    }, OS_OFFLINE_DEBOUNCE_MS);
  }

  /**
   * Ping ringan ke server backend dengan 2x percobaan cepat.
   * Tidak bergantung pada navigator.onLine yang sering keliru di WebView.
   */
  async pingServer(): Promise<boolean> {
    const attempt = async (): Promise<boolean> => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
        // Tambahkan query parameter timestamp untuk mencegah cache WebView
        const res = await fetch(`${HEALTH_URL}?_t=${Date.now()}`, {
          method: 'GET',
          signal: ctrl.signal,
          cache: 'no-store',
        });
        clearTimeout(t);
        return res.ok;
      } catch {
        return false;
      }
    };

    // Percobaan 1
    const okFirst = await attempt();
    if (okFirst) return true;

    // Percobaan 2 (retry cepat jeda 300ms jika percobaan 1 gagal/jitter)
    await new Promise((r) => setTimeout(r, 300));
    return await attempt();
  }

  /**
   * Verifikasi status jaringan dan kuras antrean outbox jika online.
   */
  async verifyAndMaybeFlush() {
    if (this.isVerifying) return;
    this.isVerifying = true;
    try {
      const wasOffline = !this.isOnline;
      const ok = await this.pingServer();
      this.lastCheckedAt = Date.now();
      this.isOnline = ok;

      if (ok) {
        if (wasOffline) {
          console.log('[NetworkStatus] Koneksi pulih! Memproses antrean offline...');
        }
        // Kosongkan antrean SQLite setelah koneksi terkonfirmasi
        await flushOutbox();
      }
    } finally {
      this.isVerifying = false;
      this.resetHeartbeat();
    }
  }

  /**
   * Dipanggil oleh outbox worker HANYA saat terjadi kegagalan jaringan transport murni.
   */
  markOfflineDueToFailure() {
    if (this.isOnline) {
      console.warn('[NetworkStatus] Koneksi terputus saat transfer data. Menandai offline.');
      this.isOnline = false;
      this.resetHeartbeat();
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    const intervalMs = this.isOnline ? HEARTBEAT_ONLINE_MS : HEARTBEAT_OFFLINE_MS;
    this.heartbeatTimer = setInterval(() => {
      void this.verifyAndMaybeFlush();
    }, intervalMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private resetHeartbeat() {
    this.startHeartbeat();
  }
}

export const networkStatus = new NetworkStatusStore();
```

---

### Bagian E: Perbaiki `src/routes/+layout.svelte`

Buka [`src/routes/+layout.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/routes/+layout.svelte). Karena `networkStatus` sekarang sudah memiliki active heartbeat mandiri, background sync di `+layout.svelte` cukup memanggil sinkronisasi data booth jika online, dan tidak perlu mengintervensi pengecekan status jaringan:

```svelte
<script lang="ts">
  import '../globals.css';
  import { onMount } from 'svelte';
  import { networkStatus } from '$lib/stores/networkStatus.svelte';
  import { syncBoothSettings } from '$lib/api/boothClient';

  let { children } = $props();

  onMount(() => {
    networkStatus.init();

    // Background sync data booth periodik (tiap 10 menit) bila online
    const interval = setInterval(() => {
      if (networkStatus.isOnline) {
        void syncBoothSettings().catch((e) =>
          console.warn('[PeriodicSync] Gagal sync background:', e)
        );
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  });
</script>

{@render children()}
```

---

### Bagian F: Penanganan Environment URL pada Mode Dev dan Build

Buka [`.env`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/.env) di `dekstop-app`:

1. **Untuk Mode Development (`pnpm tauri dev`):**
   Pastikan port backend Actix (`api`) berjalan di port yang sama:
   ```env
   PUBLIC_API_BASE_URL=http://localhost:8080/api
   ADMIN_DASHBOARD_URL=http://localhost:3000
   ```
   Pastikan backend `api` sudah berjalan (`cargo run` di direktori `api`) sebelum atau bersamaan dengan desktop app.

2. **Untuk Mode Build / Production (`pnpm tauri build`):**
   Buat atau sesuaikan berkas `.env.production` (atau sesuaikan `.env` sebelum menjalankan build):
   ```env
   PUBLIC_API_BASE_URL=https://potohub-api.dwiwahyu.my.id/api
   ADMIN_DASHBOARD_URL=https://potohub.dwiwahyu.my.id
   R2_PUBLIC_URL=https://potohub-bucket.dwiwahyu.my.id
   ```
   *Peringatan:* Jika binary diproduksi dengan `PUBLIC_API_BASE_URL=http://localhost:8080/api`, maka aplikasi yang diinstal di komputer booth klien akan selalu mencoba menghubungi `localhost:8080` dan divonis offline secara permanen!

3. **Fallback Runtime Dinamis (Opsional tapi Direkomendasikan):**
   Di `src/lib/api/boothClient.ts` dan `src/lib/stores/networkStatus.svelte.ts`, jika tabel `booth_activation` di SQLite menyimpan URL server kustom di masa depan, gunakan URL dari SQLite sebagai prioritas di atas konstanta `.env`.

---

## 4. Matriks Pengujian & Verifikasi (Acceptance Criteria)

Setelah menerapkan perbaikan di atas, lakukan verifikasi skenario berikut:

| # | Skenario Pengujian | Hasil yang Diharapkan |
|---|---|---|
| 1 | **Aplikasi dinyalakan saat koneksi internet aktif** | Aplikasi langsung berstatus Online (`isOnline = true`). Tombol QRIS/Cashless aktif dan tidak ada `OfflineBanner`. |
| 2 | **Outbox berisi tiket yang sudah kadaluwarsa / ditolak server** | Outbox worker memproses job, tiket ditolak server, job ditandai selesai/dead letter, dan **status aplikasi TETAP ONLINE** (tidak terlempar ke offline). |
| 3 | **Pengiriman email/WA softfile gagal di outbox** | Outbox worker mencatat warning log, job selesai/failed attempt, dan **status aplikasi TETAP ONLINE**. |
| 4 | **Kabel LAN dicabut / Wi-Fi dimatikan** | Setelah jeda debounce 3 detik, aplikasi mendeteksi offline, menampilkan `OfflineBanner`, dan men-disable tombol Cashless. |
| 5 | **Kabel LAN dicolokkan kembali / Wi-Fi dihidupkan** | Dalam waktu maksimal 5 detik (heartbeat offline), aplikasi otomatis mendeteksi online kembali tanpa perlu membuka Config Dashboard atau restart aplikasi. |
| 6 | **Virtual Adapter Docker / VPN aktif di OS** | Perubahan virtual interface di OS tidak menyebabkan aplikasi memvonis offline palsu karena ada debounce dan active ping verification. |
| 7 | **Pengujian Build Produksi** | Aplikasi yang di-build dengan `.env.production` yang mengarah ke domain publik API dapat langsung online saat dijalankan di komputer booth tanpa backend lokal. |

---

## 5. Ringkasan Berkas yang Perlu Dimodifikasi

1. [`dekstop-app/src/lib/db/local.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/db/local.ts): Penambahan batas retry `attempts < 5`, status `dead_letter`, dan filter query antrean.
2. [`dekstop-app/src/lib/api/boothClient.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/api/boothClient.ts): Helper `isNetworkTransportError`, penanganan aman HTTP 400 di `validateAndRedeemQrTicket`, dan fallback network-aware di `redeemTicket`.
3. [`dekstop-app/src/lib/utils/offlineOutbox.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/utils/offlineOutbox.ts): Pemisahan error bisnis vs error jaringan transport, penghapusan pemanggilan `markOfflineDueToFailure()` pada error non-network.
4. [`dekstop-app/src/lib/stores/networkStatus.svelte.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/stores/networkStatus.svelte.ts): Penghapusan guard `!navigator.onLine`, penambahan active heartbeat polling (5s saat offline / 30s saat online), 2x fast ping probe, dan 3s debounce pada OS offline event.
5. [`dekstop-app/.env`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/.env) / `.env.production`: Penyesuaian `PUBLIC_API_BASE_URL` antara mode lokal dan produksi.
