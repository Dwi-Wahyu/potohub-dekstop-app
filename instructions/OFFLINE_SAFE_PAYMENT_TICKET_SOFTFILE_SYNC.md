# Instruksi: Offline-Safe Payment (Ticket-Only) & Auto-Sync Softfile — `dekstop-app` + `api`

**Target repo:** `dekstop-app` (Tauri v2 + SvelteKit) sebagai fokus utama, dengan satu perubahan kecil non-breaking di repo `api` (health endpoint). Dokumen ini **terpisah** dari `OFFLINE_CACHE_AND_LOCAL_STORAGE.md` dan `UI_CUSTOMIZE_SYNC.md`, tapi **membangun di atas keduanya** (pakai tabel `api_cache`/`asset_cache` yang sudah ada, pola `cachedFetch`, dan mekanisme sync manual di `ConfigDashboard.svelte`). Baca dua dokumen itu dulu sebelum mengerjakan ini.

**Batasan & pola yang harus dihormati (jangan dilanggar):**

- `api` / `admin-dashboard` / `dekstop-app` = repo terpisah, tidak ada import langsung antar repo.
- Utilitas murni → `src/lib/utils/*`; state reaktif Svelte 5 (`$state`) → `src/lib/stores/*`; network/mapping → `src/lib/api/*`; command native Rust → `src-tauri/src/*`; tampilan → `src/lib/components/**`.
- SQLite sudah tersedia via `@tauri-apps/plugin-sql`. Tambah tabel baru lewat migration baru di `src-tauri/src/lib.rs` (jangan ubah SQL migration versi yang sudah pernah dirilis — selalu tambah versi baru).
- Jangan menambah dependency Tauri plugin baru (mis. plugin Network Information). Gunakan **pendekatan hybrid** yang sudah disepakati: `navigator.onLine` + event `online`/`offline` sebagai saklar utama, dikonfirmasi dengan 1x ping ringan ke API sendiri sebelum memproses antrean. Ini cukup dengan `fetch()` biasa dari frontend — tidak perlu crate Rust tambahan.
- Jangan pernah membuat UI diam-diam gagal. Setiap kondisi offline harus terlihat jelas oleh customer di layar (dan bisa diverifikasi lewat log).

---

## 0. Tujuan

1. **Payment method offline-safe** — saat internet mati, customer journey tetap jalan tapi **hanya metode Tiket (QR Ticket) yang bisa dipakai**. Tombol QRIS/Cashless harus **disabled** (bukan disembunyikan, biar customer paham kenapa) ketika offline.
2. **Verifikasi & klaim tiket tetap berfungsi offline** — booth harus bisa validasi & "memakai" QR tiket dari **cache lokal SQLite** tanpa perlu hit endpoint verify/redeem ke `api`. Mekanisme sync yang sudah ada (`syncBoothSettings()` yang dipanggil dari `ConfigDashboard.svelte`) diperluas supaya juga menarik **daftar tiket aktif** milik booth tsb dan menyimpannya ke SQLite.
3. **Pengiriman softfile graceful terhadap offline** — di `V1Complete.svelte` / `V2Download.svelte` / `V3Download.svelte`, customer harus melihat status "sedang offline, softfile akan otomatis dikirim begitu koneksi pulih" alih-alih error diam-diam. Aksi (buat sesi transaksi, upload aset, kirim email/WA softfile) di-antre di SQLite dan diproses otomatis oleh **outbox worker** begitu koneksi terverifikasi kembali.
4. **Deteksi & pemulihan koneksi** memakai pola hybrid event-driven + ping kesehatan ke server sendiri (bukan ke Google), dan **berhenti di tengah jalan** jika ping/flush gagal lagi (balik ke status offline, tidak retry membabi buta).

**Di luar cakupan:** payment gateway/QRIS tetap online-only by design (tidak diminta bikin QRIS offline). Rekonsiliasi tiket ganda dari banyak booth offline sekaligus (edge case multi-device race condition) dicatat sebagai risiko di §12, bukan diselesaikan penuh di sini.

---

## 1. Keadaan Sekarang (ringkasan hasil audit kode)

- **Sync manual sudah ada**: `ConfigDashboard.svelte` memanggil `syncBoothSettings()` (dari `src/lib/api/boothClient.ts`) saat halaman config dibuka (`onMount → void handleSync()`). Fungsi ini: POST `/booths/{boothId}/settings/sync` → `applyRemoteSettings()` → `fetchAndCacheUiConfig()` → fetch & cache banners. **Belum** menarik daftar tiket.
- **Cache lokal sudah ada**: `src/lib/db/local.ts` (tabel `api_cache`, `asset_cache`, `booth_activation`, `camera_presets`) + `src/lib/utils/offlineCache.ts` (`cachedFetch` stale-while-revalidate, `ensureAsset` cache-first untuk gambar). Pola ini **harus dipakai ulang**, jangan bikin lapisan cache baru yang beda gaya.
- **Verifikasi tiket** terjadi di 3 komponen yang isinya nyaris identik (beda nama variabel saja):
  - `src/lib/components/v1/V1TicketScan.svelte`
  - `src/lib/components/v2/V2Ticket.svelte`
  - `src/lib/components/v3/V3Ticket.svelte`

  Ketiganya memanggil `validateAndRedeemQrTicket(token, boothId)` dari `boothClient.ts`, yang **selalu** POST ke `${API_BASE}/qr-tickets/redeem` — tidak ada fallback lokal sama sekali. Kalau fetch gagal (offline), `catch` di komponen langsung menampilkan "Tiket Tidak Valid" — **padahal tiketnya mungkin valid**, cuma jaringannya yang mati. Ini bug yang harus diperbaiki oleh task ini.

- **Pemilihan metode pembayaran** ada di 3 komponen, dengan tombol QRIS/Cashless **selalu aktif**, tidak ada pengecekan status jaringan sama sekali:
  - `src/lib/components/v1/V1PaymentMethod.svelte` — dua kartu: "Scan Ticket" (`onSelect('ticket')`) dan "Cashless" (`onSelect('cashless')`).
  - `src/lib/components/v2/V2Payment.svelte` — dua kartu: "QRIS" (buka modal qty → `handleProceedQris()` → `onSelect('cashless')`) dan "Ticket" (`onSelect('ticket')`).
  - `src/lib/components/v3/V3Payment.svelte` — layar ini **sendiri sudah representasi QRIS** (dipanggil setelah `onSelectMethod('cashless')` dari `V3Package.svelte`); tombol "Cek Status Pembayaran" (`handleCheckStatus`) yang perlu di-disable saat offline, plus tombol balik ke pemilihan metode.

- **Pengiriman softfile** memakai fungsi bersama (**benang merah** yang diminta user) di `src/lib/utils/shared.ts`:
  - `sendSoftfileEmail(email, onSent, sessionId)` → POST `${API_BASE}/public/softfile/send-email`
  - `sendSoftfileWA(phone, onSent, sessionId)` → POST `${API_BASE}/public/softfile/send-wa`
  - `sendSoftFile(target, onSent, sessionId)` → auto-detect email vs nomor telepon, delegasi ke dua fungsi di atas.

  Dipakai identik (hanya beda nama variabel lokal) di:
  - `src/lib/components/v1/V1Complete.svelte`
  - `src/lib/components/v2/V2Download.svelte`
  - `src/lib/components/v3/V3Download.svelte`

  Ketiganya juga punya `onMount` yang **selalu** mencoba `createTransactionSession(...)` ke `api` lalu `saveSessionAssets(...)` (upload composite/gif/video ke R2 via `uploadGalleryAsset`). Kalau offline, `createTransactionSession` throw → masuk `catch` → `boothFlow.sessionId` tetap kosong/lama → `sendSoftfileEmail`/`sendSoftfileWA` langsung `return false` karena mengecek `sessionId` tidak valid (`'00000000-0000-0000-0000-000000000000'` atau falsy) — **customer tidak diberi tahu apa-apa**, tombol kirim softfile kelihatan seperti gagal biasa.
  - Kabar baiknya: `saveSessionAssets` → `saveLocalSessionAssets` (`src/lib/utils/localSessionStorage.ts`) **selalu** menulis foto mentah, composite, gif, video ke disk lokal (`app_data_dir/sessions/...`) lewat command Rust `save_session_file`/`save_session_manifest` (`src-tauri/src/storage.rs`), **terlepas dari status jaringan**. Jadi asetnya sudah aman secara lokal; yang belum ada cuma command untuk **membaca kembali** file itu untuk di-upload ulang saat online — ini perlu ditambahkan.

- **API (`api` repo)**: endpoint tiket sudah lengkap di `src/handlers/qr_ticket.rs`:
  - `GET /api/booths/{boothId}/qr-tickets` (butuh auth Bearer, support `status=active|used|expired|cancelled`, `limit`, `offset`, default `limit=50` max `100`) — **ini yang akan dipakai untuk prefetch cache**, tidak perlu endpoint baru di sisi tiket.
  - `POST /api/qr-tickets/redeem` — publik (tanpa auth), body `{ token, booth_id }`, mengubah `status='used', used=true, used_at=NOW()` di server.
  - **Tidak ada endpoint health/ping.** Perlu ditambah `GET /api/health` ringan tanpa auth untuk keperluan ping "hybrid" dari desktop app.

---

## 2. Arsitektur Target

```
api/
└── src/
    ├── routes.rs                  # (ubah) tambah GET /api/health
    └── handlers/
        └── health.rs              # BARU — handler health check ringan

dekstop-app/
├── src-tauri/src/
│   ├── lib.rs                     # (ubah) migration v6 & v7 + daftar command baru
│   └── storage.rs                 # (ubah) tambah command read_session_file
└── src/lib/
    ├── db/local.ts                # (ubah) tambah helper qr_ticket_cache & offline_outbox
    ├── stores/
    │   └── networkStatus.svelte.ts   # BARU — deteksi online/offline hybrid
    ├── utils/
    │   ├── offlineCache.ts         # (tetap, dipakai ulang polanya)
    │   ├── offlineOutbox.ts        # BARU — antrean job + worker flush
    │   └── shared.ts               # (ubah) sendSoftFile jadi outbox-aware (opsional param)
    ├── api/
    │   └── boothClient.ts          # (ubah) fetchActiveQrTicketsForCache, redeemTicket(), syncBoothSettings()
    └── components/
        ├── v1/V1PaymentMethod.svelte   # (ubah) disable Cashless saat offline
        ├── v1/V1TicketScan.svelte      # (ubah) pakai redeemTicket() network-aware
        ├── v1/V1Complete.svelte        # (ubah) offline-safe session + softfile queueing
        ├── v2/V2Payment.svelte         # (ubah) disable QRIS saat offline
        ├── v2/V2Ticket.svelte          # (ubah) pakai redeemTicket()
        ├── v2/V2Download.svelte        # (ubah) offline-safe session + softfile queueing
        ├── v3/V3Payment.svelte         # (ubah) disable "Cek Status Pembayaran" saat offline
        ├── v3/V3Ticket.svelte          # (ubah) pakai redeemTicket()
        ├── v3/V3Download.svelte        # (ubah) offline-safe session + softfile queueing
        └── shared/
            ├── OfflineBanner.svelte    # BARU — badge/banner status offline dipakai di 6 komponen di atas
            └── ConfigDashboard.svelte  # (ubah) handleSync() juga panggil fetchActiveQrTicketsForCache
```

---

## Bagian 0 — Repo `api`: tambah health endpoint

Buat `api/src/handlers/health.rs`:

```rust
use actix_web::HttpResponse;

/// Health check ringan, tanpa auth, tanpa query database.
/// Dipakai oleh desktop client untuk memverifikasi konektivitas nyata
/// (bukan cuma status OS) sebelum memproses antrean offline.
#[utoipa::path(
    get,
    path = "/api/health",
    tag = "System",
    responses((status = 200, description = "Server aktif")),
)]
pub async fn health_check() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({ "status": "ok" }))
}
```

Daftarkan di `api/src/handlers/mod.rs` (`pub mod health;`) dan tambahkan route paling atas di `api/src/routes.rs`, **di luar** scope `/auth` dkk. supaya tidak butuh middleware auth apa pun:

```rust
pub fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .route("/health", web::get().to(handlers::health::health_check))
            // ...scope-scope lain yang sudah ada, jangan diubah urutannya
    );
}
```

> Kenapa endpoint baru, bukan pakai `/auth/me`? Karena `/auth/me` butuh token valid dan mengembalikan 401 saat token expired — itu akan salah dibaca sebagai "server tidak bisa dihubungi". Health check harus independen dari status auth booth.

---

## Bagian A — Repo `dekstop-app`: migration SQLite baru

Tambahkan di `src-tauri/src/lib.rs`, di dalam `vec![...]` migrations, **setelah** migration v5 (`camera_presets`) yang sudah ada. **Jangan ubah nomor versi migration lama.**

```rust
Migration {
    version: 6,
    description: "create qr_ticket_cache table for offline ticket verification",
    sql: "CREATE TABLE IF NOT EXISTS qr_ticket_cache (
        token TEXT PRIMARY KEY,
        booth_id TEXT NOT NULL,
        category_id TEXT,
        ticket_type TEXT,
        bundle_label TEXT,
        qty INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        used INTEGER NOT NULL DEFAULT 0,
        used_offline INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        cached_at INTEGER NOT NULL
    );",
    kind: MigrationKind::Up,
},
Migration {
    version: 7,
    description: "create offline_outbox table for deferred sync jobs",
    sql: "CREATE TABLE IF NOT EXISTS offline_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_type TEXT NOT NULL,
        local_ref TEXT,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );",
    kind: MigrationKind::Up,
},
```

Catatan desain tabel:

- `qr_ticket_cache.used_offline = 1` berarti tiket sudah "dipakai" secara lokal (customer sudah lewat foto session) tapi belum sempat dikonfirmasi ke server (`used_at`/`status='used'` di server). Baris **tidak dihapus** sampai job `redeem_ticket` terkait di `offline_outbox` berstatus `done`, supaya kalau app di-restart sebelum sempat sync, tiket itu tetap dianggap terpakai secara lokal (tidak bisa dipakai dua kali di booth yang sama).
- `offline_outbox.job_type` bernilai salah satu: `'redeem_ticket'` atau `'session_softfile'` (lihat Bagian F). `local_ref` menyimpan token tiket (untuk `redeem_ticket`) atau `local_session_id` (untuk `session_softfile`) supaya gampang dicari/dedupe.
- `status`: `'pending' → 'processing' → 'done'` atau balik ke `'pending'` (dengan `attempts++`, `last_error` diisi) kalau gagal di tengah jalan — **jangan** ditandai `'failed'` permanen kecuali attempts sudah sangat besar (lihat §12), karena semangat fitur ini adalah retry otomatis begitu online lagi.

---

## Bagian B — Rust: command baca file sesi lokal

`saveLocalSessionAssets` sudah menulis composite/gif/video ke `app_data_dir/sessions/<date>/<sessionCode>_<boothName>/...` lewat `save_session_file`. Tambahkan pasangan **read**-nya di `src-tauri/src/storage.rs`:

```rust
/// Baca kembali file hasil sesi yang sudah disimpan lokal (utk re-upload saat online).
#[tauri::command]
pub async fn read_session_file(app: AppHandle, relative_path: String) -> Result<Vec<u8>, String> {
    let rel = safe_relative(&relative_path)?;
    let full = sessions_dir(&app).join(&rel);
    std::fs::read(&full).map_err(|e| e.to_string())
}
```

Daftarkan di `invoke_handler![...]` pada `src-tauri/src/lib.rs`, tambahkan `storage::read_session_file,` di sebelah `storage::save_session_file,` yang sudah ada.

---

## Bagian C — `src/lib/stores/networkStatus.svelte.ts` (BARU)

Ini otak dari deteksi hybrid: event OS sebagai saklar utama + ping 1x ke `api/health` sebelum mempercayai status "online", plus circuit-breaker yang balik ke offline kalau ping/flush gagal.

```ts
import { flushOutbox } from '$lib/utils/offlineOutbox';

const envs = import.meta.env as Record<string, string>;
const rawBase =
  envs.VITE_API_BASE_URL || envs.PUBLIC_API_BASE_URL || 'http://localhost:8080/api';
const API_BASE = rawBase.replace(/\/+$/, '');
const HEALTH_URL = `${API_BASE}/health`;
const PING_TIMEOUT_MS = 4000;

class NetworkStatusStore {
  // 'online' hanya true SETELAH ping health-check sukses, bukan cuma navigator.onLine.
  isOnline = $state(navigator.onLine);
  isVerifying = $state(false);
  lastCheckedAt = $state<number | null>(null);

  private listenersBound = false;

  init() {
    if (this.listenersBound) return;
    this.listenersBound = true;

    // 1) Sakelar utama: sinyal dari OS/WebView.
    window.addEventListener('online', () => this.handleOsOnline());
    window.addEventListener('offline', () => this.handleOsOffline());

    // Cek awal saat app dibuka.
    if (navigator.onLine) {
      void this.verifyAndMaybeFlush();
    } else {
      this.isOnline = false;
    }
  }

  private handleOsOffline() {
    this.isOnline = false;
  }

  private async handleOsOnline() {
    // JANGAN langsung anggap online — verifikasi dulu ke server sendiri (bukan Google).
    await this.verifyAndMaybeFlush();
  }

  /** Ping ringan ke server sendiri. True hanya jika server benar-benar merespons. */
  async pingServer(): Promise<boolean> {
    if (!navigator.onLine) return false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
      const res = await fetch(HEALTH_URL, { method: 'GET', signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Dipanggil saat OS bilang online, atau bisa dipanggil manual (mis. tombol retry). */
  async verifyAndMaybeFlush() {
    if (this.isVerifying) return;
    this.isVerifying = true;
    try {
      const ok = await this.pingServer();
      this.lastCheckedAt = Date.now();
      this.isOnline = ok;
      if (ok) {
        // 2) Baru setelah ping sukses, kosongkan antrean SQLite.
        await flushOutbox();
      }
    } finally {
      this.isVerifying = false;
    }
  }

  /** Dipanggil oleh outbox worker: jika di tengah proses flush terjadi timeout,
   *  turunkan status jadi offline dan hentikan proses (persis requirement #4 user). */
  markOfflineDueToFailure() {
    this.isOnline = false;
  }
}

export const networkStatus = new NetworkStatusStore();
```

Panggil `networkStatus.init()` sekali saja di root layout: tambahkan di `src/routes/+layout.svelte` pada `onMount` (import `{ networkStatus } from '$lib/stores/networkStatus.svelte'`). Ini memastikan listener aktif selama app hidup, bukan hanya saat layar payment/download terbuka.

---

## Bagian D — `src/lib/db/local.ts`: helper cache tiket & outbox

Tambahkan di file yang sudah ada (pola identik dengan `getApiCache`/`setApiCache` yang sudah ada), **jangan bikin file db baru**:

```ts
// ============================================================================
// QR TICKET CACHE (SQLite `qr_ticket_cache`) — utk verifikasi tiket saat offline
// ============================================================================

export interface CachedQrTicket {
  token: string;
  boothId: string;
  categoryId: string | null;
  ticketType: string | null;
  bundleLabel: string | null;
  qty: number;
  status: string;
  used: boolean;
  usedOffline: boolean;
  expiresAt: string;
}

export async function replaceQrTicketCache(
  boothId: string,
  tickets: CachedQrTicket[],
): Promise<void> {
  const conn = await db();
  // Hapus cache lama milik booth ini yang BELUM dipakai offline (baris used_offline=1
  // wajib dipertahankan sampai ter-sync, jangan pernah ditimpa oleh refresh cache).
  await conn.execute(
    "DELETE FROM qr_ticket_cache WHERE booth_id = $1 AND used_offline = 0",
    [boothId],
  );
  for (const t of tickets) {
    await conn.execute(
      `INSERT INTO qr_ticket_cache
         (token, booth_id, category_id, ticket_type, bundle_label, qty, status, used, used_offline, expires_at, cached_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10)
       ON CONFLICT (token) DO UPDATE SET
         status = $7, used = $8, expires_at = $9, cached_at = $10
       WHERE qr_ticket_cache.used_offline = 0`,
      [
        t.token, boothId, t.categoryId, t.ticketType, t.bundleLabel, t.qty,
        t.status, t.used ? 1 : 0, t.expiresAt, Date.now(),
      ],
    );
  }
}

export async function findCachedTicket(token: string, boothId: string): Promise<CachedQrTicket | null> {
  const conn = await db();
  const rows = await conn.select<any[]>(
    "SELECT * FROM qr_ticket_cache WHERE token = $1 AND booth_id = $2",
    [token, boothId],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    token: r.token, boothId: r.booth_id, categoryId: r.category_id,
    ticketType: r.ticket_type, bundleLabel: r.bundle_label, qty: r.qty,
    status: r.status, used: !!r.used, usedOffline: !!r.used_offline, expiresAt: r.expires_at,
  };
}

export async function markCachedTicketUsedOffline(token: string): Promise<void> {
  const conn = await db();
  await conn.execute(
    "UPDATE qr_ticket_cache SET used = 1, used_offline = 1 WHERE token = $1",
    [token],
  );
}

export async function clearCachedTicketOfflineFlag(token: string): Promise<void> {
  const conn = await db();
  await conn.execute(
    "UPDATE qr_ticket_cache SET used_offline = 0, status = 'used' WHERE token = $1",
    [token],
  );
}

// ============================================================================
// OFFLINE OUTBOX (SQLite `offline_outbox`) — antrean job utk dieksekusi saat online
// ============================================================================

export interface OutboxJob {
  id: number;
  jobType: 'redeem_ticket' | 'session_softfile';
  localRef: string | null;
  payload: string; // JSON — di-parse oleh worker sesuai jobType
  status: 'pending' | 'processing' | 'done';
  attempts: number;
  lastError: string | null;
}

export async function enqueueOutboxJob(
  jobType: OutboxJob['jobType'],
  payload: unknown,
  localRef?: string,
): Promise<number> {
  const conn = await db();
  const now = Date.now();
  const result = await conn.execute(
    `INSERT INTO offline_outbox (job_type, local_ref, payload, status, attempts, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', 0, $4, $4)`,
    [jobType, localRef ?? null, JSON.stringify(payload), now],
  );
  return Number(result.lastInsertId ?? 0);
}

export async function listPendingOutboxJobs(): Promise<OutboxJob[]> {
  const conn = await db();
  const rows = await conn.select<any[]>(
    "SELECT * FROM offline_outbox WHERE status != 'done' ORDER BY id ASC",
  );
  return rows.map((r) => ({
    id: r.id, jobType: r.job_type, localRef: r.local_ref, payload: r.payload,
    status: r.status, attempts: r.attempts, lastError: r.last_error,
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
  await conn.execute(
    `UPDATE offline_outbox SET status = 'pending', attempts = attempts + 1,
       last_error = $2, updated_at = $3 WHERE id = $1`,
    [id, error, Date.now()],
  );
}

export async function countPendingOutboxJobs(): Promise<number> {
  const conn = await db();
  const rows = await conn.select<any[]>(
    "SELECT COUNT(*)::int as c FROM offline_outbox WHERE status != 'done'",
  );
  return rows[0]?.c ?? 0;
}
```

> `ON CONFLICT ... WHERE qr_ticket_cache.used_offline = 0` di atas memastikan refresh cache dari server tidak pernah menimpa tiket yang sedang menunggu sync offline — poin krusial supaya tidak ada duplikasi klaim.

---

## Bagian E — `src/lib/api/boothClient.ts`: prefetch tiket & redeem network-aware

### E.1 Tarik semua tiket aktif saat sync (dengan paginasi, limit API max 100/halaman)

```ts
import { replaceQrTicketCache, findCachedTicket, markCachedTicketUsedOffline, type CachedQrTicket } from '$lib/db/local';
import { enqueueOutboxJob } from '$lib/db/local';

interface QrTicketApiRow {
  token: string;
  category_id: string | null;
  ticket_type: string;
  bundle_label: string | null;
  qty: number;
  status: string;
  used: boolean;
  expires_at: string;
}

/**
 * Tarik SEMUA tiket berstatus aktif milik booth (paginated, page size 100 = limit
 * maksimum yang diizinkan endpoint) lalu simpan ke SQLite qr_ticket_cache.
 * Dipanggil dari syncBoothSettings() supaya jadi bagian dari mekanisme sync yang sudah ada.
 */
export async function fetchActiveQrTicketsForCache(boothId: string): Promise<number> {
  const PAGE_SIZE = 100;
  let offset = 0;
  const all: CachedQrTicket[] = [];

  while (true) {
    const res = await fetch(
      `${API_BASE}/booths/${boothId}/qr-tickets?status=active&limit=${PAGE_SIZE}&offset=${offset}`,
      { headers: await getAuthHeaders() },
    );
    if (!res.ok) throw new Error(`Gagal memuat daftar tiket (HTTP ${res.status})`);
    const json = await res.json();
    const rows: QrTicketApiRow[] = json.data ?? [];
    for (const t of rows) {
      all.push({
        token: t.token, boothId, categoryId: t.category_id, ticketType: t.ticket_type,
        bundleLabel: t.bundle_label, qty: t.qty, status: t.status, used: t.used,
        usedOffline: false, expiresAt: t.expires_at,
      });
    }
    if (rows.length < PAGE_SIZE) break; // halaman terakhir
    offset += PAGE_SIZE;
    if (offset > 20000) break; // safety valve, jangan looping tanpa batas
  }

  await replaceQrTicketCache(boothId, all);
  return all.length;
}
```

### E.2 Wrapper `redeemTicket()` — network-aware, dipakai UI menggantikan `validateAndRedeemQrTicket` langsung

```ts
export interface RedeemTicketResult {
  valid: boolean;
  message: string;
  offline: boolean; // true jika diverifikasi dari cache lokal, bukan server
}

/**
 * Titik masuk TUNGGAL untuk verifikasi+klaim tiket dari UI (ganti panggilan
 * langsung ke validateAndRedeemQrTicket di V1/V2/V3 Ticket*.svelte).
 *
 * - Online  → coba endpoint /qr-tickets/redeem seperti biasa. Kalau fetch-nya
 *             sendiri yang gagal (bukan response tervalidasi tidak-valid dari
 *             server), JATUHKAN ke jalur offline sebagai fallback, jangan
 *             langsung menyatakan tiket tidak valid.
 * - Offline → validasi terhadap qr_ticket_cache, tandai used_offline secara
 *             lokal, dan antre job 'redeem_ticket' agar disinkronkan ke server
 *             begitu online lagi.
 */
export async function redeemTicket(token: string, boothId: string): Promise<RedeemTicketResult> {
  const cleanToken = token.includes('token=')
    ? token.split('token=')[1].split('&')[0]
    : token.trim();

  const { networkStatus } = await import('$lib/stores/networkStatus.svelte');

  if (networkStatus.isOnline) {
    try {
      const remote = await validateAndRedeemQrTicket(cleanToken, boothId);
      return { valid: remote.valid, message: remote.message, offline: false };
    } catch (e) {
      // Bedakan "tiket ditolak server" (Error dilempar dgn pesan dari server,
      // fetch tetap sukses) vs "request-nya sendiri gagal" (TypeError jaringan).
      // validateAndRedeemQrTicket melempar Error utk KEDUA kasus, jadi di sini
      // kita hanya fallback ke offline bila status jaringan browser juga false
      // ATAU pesan errornya mengindikasikan network failure.
      const looksLikeNetworkFailure =
        e instanceof TypeError || !navigator.onLine;
      if (!looksLikeNetworkFailure) {
        return { valid: false, message: e instanceof Error ? e.message : 'Tiket tidak valid', offline: false };
      }
      // lanjut ke jalur offline di bawah
    }
  }

  return redeemTicketOffline(cleanToken, boothId);
}

async function redeemTicketOffline(token: string, boothId: string): Promise<RedeemTicketResult> {
  const cached = await findCachedTicket(token, boothId);
  if (!cached) {
    return {
      valid: false,
      offline: true,
      message: 'Tiket tidak ditemukan di data offline booth ini. Sambungkan internet lalu coba lagi, atau sinkronkan booth terlebih dahulu.',
    };
  }
  if (cached.used || cached.usedOffline || cached.status === 'used' || cached.status === 'cancelled') {
    return { valid: false, offline: true, message: 'Tiket sudah pernah digunakan atau dibatalkan.' };
  }
  if (new Date(cached.expiresAt).getTime() <= Date.now()) {
    return { valid: false, offline: true, message: 'Tiket sudah kadaluwarsa.' };
  }

  await markCachedTicketUsedOffline(token);
  await enqueueOutboxJob('redeem_ticket', { token, boothId }, token);

  return { valid: true, offline: true, message: 'Tiket valid (diverifikasi secara offline).' };
}
```

> Catatan penting soal `TypeError`: `fetch()` di browser/WebView melempar `TypeError: Failed to fetch` saat benar-benar tidak ada koneksi/DNS gagal — beda dengan response HTTP 4xx/5xx yang tetap `resolve` normal. `validateAndRedeemQrTicket` yang sudah ada membungkus semuanya jadi `Error` biasa lewat `catch`, jadi kalau mau membedakan lebih presisi, ubah `validateAndRedeemQrTicket` supaya melempar ulang error asli (bukan selalu `new Error(errJson?.message ...)`) ketika `res` tidak pernah didapat (`fetch` reject). Tandai perubahan ini di PR terpisah kecil kalau diperlukan; opsi paling aman & minimal-invasive adalah **cek `networkStatus.isOnline` dulu SEBELUM mencoba fetch sama sekali** (skip percobaan online kalau memang sudah tahu offline), yang sudah dilakukan di kode di atas.

### E.3 Integrasikan ke `syncBoothSettings()`

Di dalam `syncBoothSettings()` yang sudah ada, tambahkan pemanggilan setelah bagian banners (baris ~508-517 saat ini):

```ts
export async function syncBoothSettings() {
  const boothId = await getActiveBoothId();
  if (!boothId) throw new Error('Booth belum teraktivasi.');
  try {
    const res = await fetch(`${API_BASE}/booths/${boothId}/settings/sync`, {
      method: 'POST',
      headers: await getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Sync gagal');
    const data = await res.json();
    applyRemoteSettings(data.settings ?? {});
    await fetchAndCacheUiConfig();
    try {
      const banners = await fetchBanners(boothId);
      await writeApiCache(`banners:${boothId}`, banners);
    } catch (e) {
      console.warn('Sync banners gagal:', e);
    }
    // BARU: refresh cache tiket aktif utk verifikasi offline.
    try {
      const count = await fetchActiveQrTicketsForCache(boothId);
      console.log(`[syncBoothSettings] ${count} tiket aktif dicache utk offline`);
    } catch (e) {
      console.warn('Sync qr_ticket_cache gagal:', e);
    }
    void prefetchBoothAssets(boothId).catch((e) =>
      console.warn('Prefetch aset booth gagal:', e),
    );
    return data;
  } catch (e) {
    throw e instanceof Error ? e : new Error('Sync gagal');
  }
}
```

Tidak perlu ubah `ConfigDashboard.svelte` — `handleSync()` di sana sudah memanggil `syncBoothSettings()`, jadi otomatis ikut menarik cache tiket begitu diploy.

**Tambahan disarankan (opsional tapi kuat direkomendasikan):** panggil `syncBoothSettings()` juga secara periodik di background (mis. `setInterval` 10-15 menit) dari `+layout.svelte`, supaya cache tiket tidak basi kalau operator lupa buka halaman ConfigDashboard. Jangan jadikan blocking — bungkus dengan `void` dan `try/catch` seperti pola yang sudah ada di `cachedFetch`.

---

## Bagian F — `src/lib/utils/offlineOutbox.ts` (BARU): worker flush

```ts
import {
  listPendingOutboxJobs,
  markOutboxJobDone,
  markOutboxJobFailedAttempt,
  clearCachedTicketOfflineFlag,
  type OutboxJob,
} from '$lib/db/local';
import { validateAndRedeemQrTicket, createTransactionSession, uploadGalleryAsset } from '$lib/api/boothClient';
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
  softfileTarget: string | null; // email ATAU nomor WA, null jika customer tidak isi
  localSessionCode: string;      // sessionCode yg sudah dipakai saveLocalSessionAssets
  assetRelativePaths: { role: 'composite' | 'gif' | 'video'; path: string; contentType: string; width: number; height: number }[];
}

/**
 * Proses SEMUA job pending secara berurutan (FIFO). Berhenti SESAAT job pertama
 * gagal (mis. timeout tengah proses) — sisa job dibiarkan 'pending' utk dicoba
 * lagi pada verifikasi online berikutnya. Ini sesuai requirement: "jika di
 * tengah pengiriman antrean terjadi masalah, ubah status jadi offline dan berhenti."
 */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const jobs = await listPendingOutboxJobs();
    for (const job of jobs) {
      const ok = await processJob(job);
      if (!ok) {
        const { networkStatus } = await import('$lib/stores/networkStatus.svelte');
        networkStatus.markOfflineDueToFailure();
        break; // STOP total, jangan lanjut ke job berikutnya
      }
    }
  } finally {
    flushing = false;
  }
}

async function processJob(job: OutboxJob): Promise<boolean> {
  try {
    if (job.jobType === 'redeem_ticket') {
      const payload: RedeemTicketPayload = JSON.parse(job.payload);
      const result = await validateAndRedeemQrTicket(payload.token, payload.boothId);
      // Server adalah sumber kebenaran akhir. Kalau ternyata server bilang
      // tidak valid (mis. sudah dipakai duluan oleh booth lain), tetap tandai
      // job selesai (tidak retry selamanya) tapi catat di log utk audit manual.
      if (!result.valid) {
        console.warn(`[offlineOutbox] Tiket ${payload.token} ditolak server saat sync:`, result.message);
      }
      await clearCachedTicketOfflineFlag(payload.token);
      await markOutboxJobDone(job.id);
      return true;
    }

    if (job.jobType === 'session_softfile') {
      const payload: SessionSoftfilePayload = JSON.parse(job.payload);

      const session = await createTransactionSession(
        payload.boothId, payload.categoryId, payload.printQty, payload.paymentMethod, payload.frameId,
      );
      const sessionId = session.session_id || (session as any).id;

      for (const asset of payload.assetRelativePaths) {
        const bytes = await invoke<number[]>('read_session_file', { relativePath: asset.path });
        const blob = new Blob([new Uint8Array(bytes)], { type: asset.contentType });
        await uploadGalleryAsset(
          payload.boothId, sessionId,
          asset.role === 'composite' ? 'photo' : asset.role,
          blob, asset.contentType.split('/')[1] || 'jpg', asset.contentType,
          asset.width, asset.height,
        );
      }

      if (payload.softfileTarget) {
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.softfileTarget);
        const sent = isEmail
          ? await sendSoftfileEmail(payload.softfileTarget, () => {}, sessionId)
          : await sendSoftfileWA(payload.softfileTarget, () => {}, sessionId);
        if (!sent) throw new Error('Softfile gagal terkirim saat sync ulang');
      }

      await markOutboxJobDone(job.id);
      return true;
    }

    console.warn('[offlineOutbox] job_type tidak dikenal:', job.jobType);
    await markOutboxJobDone(job.id); // buang job asing daripada macet selamanya
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[offlineOutbox] Job #${job.id} (${job.jobType}) gagal:`, msg);
    await markOutboxJobFailedAttempt(job.id, msg);
    return false;
  }
}
```

> **Kenapa job `session_softfile` menyatukan create-session + upload + softfile jadi satu unit?** Karena tiga langkah ini punya dependensi berurutan (butuh `sessionId` asli dari server sebelum upload & softfile bisa jalan), dan kalau dipisah jadi 3 job independen, urutan eksekusi FIFO antar-sesi bisa kacau saat ada >1 sesi offline menumpuk. Menyatukannya dalam satu payload membuat retry-nya idempoten per sesi.

---

## Bagian G — UI Payment: disable QRIS/Cashless saat offline

Tambahkan komponen kecil `src/lib/components/shared/OfflineBanner.svelte` (dipakai di semua layar di bagian G, H, I):

```svelte
<script lang="ts">
  import { networkStatus } from '$lib/stores/networkStatus.svelte';
  interface Props { message?: string }
  let { message = 'Sedang offline — hanya pembayaran Tiket yang tersedia.' }: Props = $props();
</script>

{#if !networkStatus.isOnline}
  <div class="px-4 py-2 rounded-full bg-amber-500/90 text-black text-xs font-bold flex items-center gap-2 shadow-lg">
    <span class="w-2 h-2 rounded-full bg-black/70 animate-pulse"></span>
    {message}
  </div>
{/if}
```

### `V1PaymentMethod.svelte`

Import `networkStatus` dan `OfflineBanner`. Ubah tombol "Cashless":

```svelte
<script lang="ts">
  import { networkStatus } from '$lib/stores/networkStatus.svelte';
  import OfflineBanner from '$lib/components/shared/OfflineBanner.svelte';
  // ...import lain yang sudah ada
</script>
```

```svelte
<!-- Cashless Card -->
<button
  onclick={() => networkStatus.isOnline && onSelect('cashless')}
  disabled={!networkStatus.isOnline}
  class="... {!networkStatus.isOnline ? 'opacity-40 grayscale cursor-not-allowed hover:scale-100' : ''}"
  title={!networkStatus.isOnline ? 'Tidak tersedia saat offline' : undefined}
>
  <!-- isi tombol tetap sama -->
</button>
```

Tambahkan `<OfflineBanner />` di dalam `<header>` (mis. di bawah judul, `absolute bottom-2 left-1/2 -translate-x-1/2` atau sejenisnya sesuai selera desain existing).

### `V2Payment.svelte`

Sama pola: tombol kartu "QRIS" (`onclick={() => (showQtyModal = true)}`) → tambahkan `disabled={!networkStatus.isOnline}` + guard `networkStatus.isOnline &&` di `onclick`, plus styling redup. Tambahkan `<OfflineBanner />` di dekat judul "Select Payment Method". Tombol "Ticket" **tidak diubah** (tetap selalu aktif).

### `V3Payment.svelte`

Halaman ini murni QRIS. Ubah tombol `handleCheckStatus`:

```svelte
<button
  onclick={handleCheckStatus}
  disabled={paid || !networkStatus.isOnline}
  class="..."
>
  {!networkStatus.isOnline ? 'Tidak tersedia offline' : (paid ? 'Pembayaran Berhasil!' : 'Cek Status Pembayaran')}
</button>
```

Tambahkan `<OfflineBanner message="Sedang offline — QRIS tidak tersedia, silakan kembali & pilih Tiket." />` di atas kartu QRIS. Karena `V3Payment` hanya diakses lewat jalur cashless, pertimbangkan juga menambahkan tombol "Ganti ke Tiket" yang lebih menonjol saat `!networkStatus.isOnline` (memanggil `onBack()` yang sudah ada, cukup ubah label tombol yang sudah ada agar kontekstual).

---

## Bagian H — UI Ticket Scan: pakai `redeemTicket()`

Untuk `V1TicketScan.svelte`, `V2Ticket.svelte`, `V3Ticket.svelte` — ganti import dan pemanggilan.

**Sebelum** (semua 3 file, pola identik):

```ts
import { validateAndRedeemQrTicket } from '$lib/api/boothClient';
// ...
await validateAndRedeemQrTicket(result.content, boothId);
// sukses → onSuccess()/onConfirm();
```

**Sesudah:**

```ts
import { redeemTicket } from '$lib/api/boothClient';
// ...
const result = await redeemTicket(result.content, boothId);
if (!result.valid) {
  throw new Error(result.message); // biarkan catch block yang sudah ada menanganinya
}
if (result.offline) {
  successMessage = 'Tiket Valid (mode offline)! Memulai sesi foto…';
} else {
  successMessage = 'Tiket Valid! Memulai sesi foto…';
}
setTimeout(() => onSuccess(), 500); // atau onConfirm() di V2/V3
```

Lakukan perubahan identik di dua tempat lain di tiap file (handler scan QR & handler input manual), sesuai nama variabel lokal masing-masing file (`errorMessage`/`errorMsg`, `onSuccess`/`onConfirm`, dst — **jangan ganti nama prop**, cukup ganti pemanggilan fungsi & pesan).

Tambahkan `<OfflineBanner message="Offline — tiket akan diverifikasi dari data lokal booth." />` di ketiga layar ini juga, supaya customer/operator tahu kenapa hasilnya "(mode offline)".

---

## Bagian I — UI Download/Complete: offline-safe session + softfile queueing

Pola berikut identik untuk `V1Complete.svelte`, `V2Download.svelte`, `V3Download.svelte` — sesuaikan nama variabel lokal (`isSavingSession`/`isSaving`, `frameConfigId`/`selectedFrame`) di tiap file.

### I.1 Tambah import

```ts
import { networkStatus } from '$lib/stores/networkStatus.svelte';
import { enqueueOutboxJob } from '$lib/db/local';
import OfflineBanner from '$lib/components/shared/OfflineBanner.svelte';
```

### I.2 Ubah blok `onMount` — cabang offline vs online

Struktur `onMount` yang sudah ada (composite → createTransactionSession → saveSessionAssets) diubah jadi:

```ts
let softfileQueued = $state(false);

onMount(async () => {
  // ...timer & fetch template & compositeTemplateImage TETAP SAMA seperti sebelumnya...

  const localSessionCode = generateSessionCode(uiConfig.config.boothName); // sudah ada di shared.ts
  boothFlow.sessionCode = localSessionCode;

  if (!networkStatus.isOnline) {
    // JALUR OFFLINE: jangan hit API sama sekali. Pakai sessionCode lokal sbg
    // referensi sementara utk QR & tampilan; simpan aset ke disk (sudah jalan
    // otomatis lewat saveSessionAssets/saveLocalSessionAssets di bawah), dan
    // antre job utk dieksekusi begitu online kembali.
    boothFlow.sessionId = null;
    isSavingSession = true;
    try {
      // saveSessionAssets tetap dipanggil supaya file lokal (composite/gif/video)
      // tetap tersimpan ke disk via saveLocalSessionAssets, TANPA upload ke R2
      // (uploadGalleryAsset di dalamnya akan gagal & di-catch senyap, itu OK —
      // upload sesungguhnya dilakukan ulang oleh outbox worker).
      await saveSessionAssets(
        boothId, localSessionCode, compositeUrl,
        selectedTemplate?.width || 1200, selectedTemplate?.height || 1800,
        (selectedTemplate?.design_data || []).filter((l) => !l.isBackground && !l.isQr),
        selectedTemplate?.frame_image_url || selectedTemplate?.design_data?.find((l) => l.isBackground)?.imageUrl,
      );
    } finally {
      isSavingSession = false;
    }
    // QR mengarah ke placeholder lokal; TIDAK valid dibuka sampai sesi sinkron.
    qrDataUrl = await QRCode.toDataURL(
      `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/pending-${localSessionCode}`,
      { margin: 1, width: 200 },
    ).catch(() => '');
    return; // job session_softfile BARU didaftarkan saat customer submit email/WA (lihat I.3)
  }

  // JALUR ONLINE: perilaku lama, tidak berubah.
  try {
    isSavingSession = true;
    const session = await createTransactionSession(
      boothId, selectedTemplate?.category_id, boothFlow.printQty, 'cashless', frameConfigId,
    );
    const sessId = session.session_id || session.id || 'demo-session';
    boothFlow.sessionId = sessId;
    const softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/${sessId}`;
    qrDataUrl = await QRCode.toDataURL(softfileUrl, { margin: 1, width: 200 });
    await saveSessionAssets(
      boothId, sessId, compositeUrl,
      selectedTemplate?.width || 1200, selectedTemplate?.height || 1800,
      (selectedTemplate?.design_data || []).filter((l) => !l.isBackground && !l.isQr),
      selectedTemplate?.frame_image_url || selectedTemplate?.design_data?.find((l) => l.isBackground)?.imageUrl,
    );
  } catch (err) {
    console.error('Failed to create & save session in database:', err);
    const fallbackUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/${boothFlow.sessionId || 'demo-session'}`;
    qrDataUrl = await QRCode.toDataURL(fallbackUrl, { margin: 1, width: 200 }).catch(() => '');
  } finally {
    isSavingSession = false;
  }
});
```

### I.3 Ubah `handleSendEmail`/`handleSendWA` — antre kalau offline

```ts
async function handleSendEmail() {
  if (!email.trim() || emailSent) return;
  sendError = '';

  if (!networkStatus.isOnline) {
    await enqueueSoftfileJob(email.trim());
    return;
  }

  const ok = await sendSoftfileEmail(email, (success) => { if (success) emailSent = true; }, boothFlow.sessionId ?? undefined);
  if (!ok && !emailSent) {
    sendError = 'Gagal mengirim softfile. Periksa koneksi internet.';
  }
}

async function handleSendWA() {
  if (!phone.trim() || waSent) return;
  sendError = '';

  if (!networkStatus.isOnline) {
    await enqueueSoftfileJob(phone.trim());
    return;
  }

  const ok = await sendSoftfileWA(phone, (success) => { if (success) waSent = true; }, boothFlow.sessionId ?? undefined);
  if (!ok && !waSent) {
    sendError = 'Gagal mengirim softfile. Periksa koneksi internet.';
  }
}

async function enqueueSoftfileJob(target: string) {
  await enqueueOutboxJob(
    'session_softfile',
    {
      boothId: await requireActiveBoothId().catch(() => 'default'),
      categoryId: selectedTemplate?.category_id ?? null,
      frameId: frameConfigId,
      printQty: boothFlow.printQty,
      paymentMethod: 'Cashless',
      softfileTarget: target,
      localSessionCode: boothFlow.sessionCode,
      assetRelativePaths: buildAssetRelativePaths(boothFlow.sessionCode, uiConfig.config.boothName),
    },
    boothFlow.sessionCode ?? undefined,
  );
  softfileQueued = true;
  emailSent = target === email.trim();
  waSent = target === phone.trim();
}
```

> `paymentMethod` di job harus mengikuti metode yang benar-benar dipakai (`'Ticket'` kalau flow-nya lewat tiket). Sesuaikan value ini dengan cara `boothFlow`/props menandai metode pembayaran aktif di masing-masing file (`V1Complete`/`V2Download`/`V3Download` saat ini selalu hardcode `'cashless'` untuk `createTransactionSession` — ini sendiri kelihatannya bug lama di luar cakupan task ini; laporkan tapi jangan diperbaiki diam-diam tanpa konfirmasi, cukup catat di `instructions-reports/` hasil kerja).

`buildAssetRelativePaths` adalah helper kecil baru di `src/lib/utils/localSessionStorage.ts` yang mengembalikan path relatif yang **sama persis** dengan yang dipakai `saveLocalSessionAssets` (`${date}/${sessionCode}_${sanitize(boothName)}/composite/print_strip.jpg`, dst.) supaya outbox worker bisa `read_session_file` dengan path yang tepat. Tambahkan fungsi ini di file yang sama supaya penulisan & pembacaan path tidak pernah "divergen" (single source of truth):

```ts
export function buildAssetRelativePaths(sessionCode: string | null, boothName: string) {
  if (!sessionCode) return [];
  const date = new Date().toISOString().slice(0, 10);
  const base = `${date}/${sessionCode}_${sanitize(boothName || 'booth')}`;
  return [
    { role: 'composite' as const, path: `${base}/composite/print_strip.jpg`, contentType: 'image/jpeg', width: 1200, height: 1800 },
    { role: 'gif' as const, path: `${base}/gif/session.gif`, contentType: 'image/gif', width: 1200, height: 1800 },
  ];
  // Tambahkan video jika enableLiveviewVideo aktif — cek boothConfig.config.enableLiveviewVideo
  // dan sesuaikan ekstensi (.mp4/.webm) mengikuti logic yang sama di sessionAssets.ts.
}
```

### I.4 Tambahkan banner & indikator "queued" di markup

Di bagian JSX/Svelte template (dekat tombol kirim email/WA), tambahkan:

```svelte
{#if !networkStatus.isOnline}
  <OfflineBanner message="Sedang offline — softfile akan otomatis dikirim setelah koneksi pulih." />
{:else if softfileQueued}
  <div class="text-xs text-amber-600 font-semibold">Menunggu koneksi pulih untuk mengirim softfile…</div>
{/if}
```

Dan ubah label tombol kirim supaya tidak menyesatkan saat offline, mis. tombol email:

```svelte
<button
  onclick={handleSendEmail}
  disabled={!email.trim() || emailSent}
  ...
>
  {emailSent ? (networkStatus.isOnline ? 'Terkirim' : 'Menunggu Koneksi') : 'Kirim Email'}
</button>
```

(Perhatikan: `emailSent` sekarang di-set `true` juga di jalur offline di §I.3 supaya tombol tidak bisa dipencet berulang — tapi labelnya berbeda berkat pengecekan `networkStatus.isOnline` di atas.)

---

## Bagian J — Trigger flush tambahan

Selain `verifyAndMaybeFlush()` yang otomatis jalan saat event `online` dari OS (Bagian C), tambahkan juga pemicu flush manual di `ConfigDashboard.svelte` (`handleSync()` yang sudah ada), supaya operator yang menekan tombol "Sync" manual juga langsung mengosongkan antrean:

```ts
async function handleSync() {
  syncStatus = 'Syncing...';
  try {
    const res = await syncBoothSettings();
    await networkStatus.verifyAndMaybeFlush(); // BARU
    // ...sisanya tetap sama
  } catch (e) {
    syncStatus = e instanceof Error ? e.message : 'Sync gagal';
  }
  // ...
}
```

Tampilkan juga jumlah job pending di dashboard (opsional, bagus untuk operator lapangan) dengan `countPendingOutboxJobs()` dari `db/local.ts`.

---

## Bagian K — Checklist verifikasi manual

1. **Matikan Wi-Fi/LAN** di mesin dev (atau blokir domain API lewat `/etc/hosts`) → buka `V1PaymentMethod` / `V2Payment` / `V3Payment`: tombol QRIS/Cashless harus terlihat redup & tidak bisa diklik; tombol Ticket tetap normal.
2. Dengan booth yang sudah pernah sync online minimal 1x (punya isi `qr_ticket_cache`), matikan internet lalu scan/masukkan token tiket aktif → harus berhasil dengan pesan "(mode offline)"; cek baris di `qr_ticket_cache` (`used_offline=1`) dan baris baru di `offline_outbox` (`job_type='redeem_ticket'`, `status='pending'`).
3. Coba pakai token yang sama dua kali saat masih offline → percobaan kedua harus ditolak ("sudah pernah digunakan").
4. Selesaikan sesi foto sampai ke layar Download/Complete saat masih offline → banner "sedang offline" muncul, isi email/nomor WA lalu submit → status berubah jadi "Menunggu Koneksi" (bukan error), dan baris baru muncul di `offline_outbox` (`job_type='session_softfile'`).
5. Nyalakan kembali internet → dalam beberapa detik, `networkStatus.isOnline` harus `true` (cek lewat devtools atau log), `flushOutbox()` berjalan otomatis: baris `redeem_ticket` & `session_softfile` berubah `status='done'`; softfile benar-benar terkirim (cek endpoint email/WA di sisi `api` / log admin-dashboard); customer di layar (kalau masih terbuka) melihat label tombol berubah jadi "Terkirim".
6. **Simulasi gagal di tengah flush**: matikan internet lagi tepat setelah `redeem_ticket` job pertama diproses tapi sebelum `session_softfile` selesai (bisa disimulasikan dengan mematikan `api` server manual di tengah proses) → job `session_softfile` harus tetap `status='pending'` dengan `attempts` bertambah dan `last_error` terisi, `networkStatus.isOnline` balik ke `false`, TIDAK ada job lain yang diproses setelahnya sampai verifikasi online berikutnya berhasil.
7. Restart aplikasi desktop di tengah kondisi ada job pending → setelah restart & online, `flushOutbox()` (dipanggil dari `verifyAndMaybeFlush()` saat `networkStatus.init()`) harus tetap memproses job lama yang tersisa di SQLite (karena disimpan persisten, bukan in-memory).
8. Jalankan `syncBoothSettings()` (buka `ConfigDashboard`) saat online dan pastikan `qr_ticket_cache` ter-update (tiket yang baru dibuat operator di admin-dashboard ikut muncul), tanpa menghapus baris yang sedang `used_offline=1` dari sesi yang belum sync.

---

## Bagian L — Risiko, batasan, dan catatan lanjutan

- **Race condition multi-booth**: kalau organisasi punya banyak booth fisik yang sama-sama offline dan kebetulan mem-verifikasi token tiket yang sama secara lokal (mis. tiket dibagikan/difoto ulang oleh pengunjung), keduanya akan sama-sama menganggap valid secara lokal. Server akan menolak salah satu saat sync (yang kedua diproses `flushOutbox` akan mendapati `result.valid === false` dari `redeem_qr_ticket`). Kode di Bagian F sudah menangani ini dengan tetap menandai job `done` (tidak infinite retry) dan mencatat log warning — **tapi tidak ada notifikasi otomatis ke operator**. Kalau dibutuhkan, tambahkan tabel audit terpisah atau kirim log ini lewat `tauri-plugin-log` yang sudah terpasang, lalu ekspos di `ConfigDashboard`.
- **Staleness cache tiket**: kalau booth offline lebih lama dari waktu antara dua sync terakhir, tiket yang dibuat operator *setelah* sync terakhir tidak akan ada di cache dan akan ditolak ("tidak ditemukan di data offline"). Ini limitasi wajar dari pendekatan cache — mitigasi: sync otomatis periodik (lihat catatan opsional di Bagian E.3) dan edukasi operator untuk sync manual sebelum sesi ramai/berpotensi offline (venue dengan sinyal buruk).
- **`attempts` tak terbatas**: saat ini job yang terus gagal akan terus dicoba ulang setiap kali koneksi terverifikasi online, tanpa batas maksimum. Untuk produksi, pertimbangkan menambahkan ambang batas (mis. `attempts >= 10` → ubah `status` jadi `'needs_review'` dan tampilkan di `ConfigDashboard` supaya operator bisa investigasi manual alih-alih diam-diam retry selamanya).
- **`paymentMethod` hardcode `'cashless'`** pada `createTransactionSession` di ketiga file Download/Complete adalah temuan existing bug di luar cakupan (lihat catatan di Bagian I.3) — laporkan ke tim, jangan ubah tanpa konfirmasi karena berpotensi mempengaruhi laporan keuangan yang sudah berjalan.
- **QR softfile saat offline** mengarah ke URL placeholder (`/softfile/pending-<code>`) yang belum tentu valid dibuka oleh customer di HP mereka sebelum sync selesai. Kalau memungkinkan, ganti UX ini jadi menyembunyikan tombol/QR "buka softfile" sepenuhnya saat offline dan hanya menonjolkan form email/WA (yang sudah offline-safe lewat outbox) sebagai satu-satunya cara customer mendapat filenya nanti.

---

## Ringkasan file yang disentuh

**Repo `api`:**
- BARU: `src/handlers/health.rs`
- Ubah: `src/handlers/mod.rs`, `src/routes.rs`

**Repo `dekstop-app`:**
- Ubah: `src-tauri/src/lib.rs` (migration v6, v7 + daftar command)
- Ubah: `src-tauri/src/storage.rs` (command `read_session_file`)
- Ubah: `src/lib/db/local.ts` (helper `qr_ticket_cache` & `offline_outbox`)
- BARU: `src/lib/stores/networkStatus.svelte.ts`
- BARU: `src/lib/utils/offlineOutbox.ts`
- Ubah: `src/lib/utils/localSessionStorage.ts` (`buildAssetRelativePaths`)
- Ubah: `src/lib/api/boothClient.ts` (`fetchActiveQrTicketsForCache`, `redeemTicket`, integrasi ke `syncBoothSettings`)
- BARU: `src/lib/components/shared/OfflineBanner.svelte`
- Ubah: `src/lib/components/shared/ConfigDashboard.svelte` (panggil `verifyAndMaybeFlush()` di `handleSync`)
- Ubah: `src/routes/+layout.svelte` (`networkStatus.init()`)
- Ubah: `src/lib/components/v1/V1PaymentMethod.svelte`, `v1/V1TicketScan.svelte`, `v1/V1Complete.svelte`
- Ubah: `src/lib/components/v2/V2Payment.svelte`, `v2/V2Ticket.svelte`, `v2/V2Download.svelte`
- Ubah: `src/lib/components/v3/V3Payment.svelte`, `v3/V3Ticket.svelte`, `v3/V3Download.svelte`

Setelah selesai, tulis laporan implementasi di `dekstop-app/instructions-reports/OFFLINE_SAFE_PAYMENT_TICKET_SOFTFILE_SYNC_REPORT.md` mengikuti format laporan yang sudah ada di folder tersebut (ringkasan perubahan, file yang disentuh, hasil testing manual dari Bagian K, dan risiko yang belum ditangani dari Bagian L).
