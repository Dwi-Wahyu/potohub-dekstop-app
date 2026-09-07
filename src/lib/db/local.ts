import Database from "@tauri-apps/plugin-sql";

export interface BoothActivation {
  boothId: string;
  activationCode: string;
  boothName: string;
  organizationId: string | null;
  templateVariant: "v1" | "v2" | "v3" | "custom";
  activatedAt: string;
  token?: string | null;
}

let dbPromise: ReturnType<typeof Database.load> | null = null;
function db() {
  if (!dbPromise) dbPromise = Database.load("sqlite:app.db");
  return dbPromise;
}

export async function getActivation(): Promise<BoothActivation | null> {
  try {
    const conn = await db();
    const rows = await conn.select<any[]>(
      "SELECT * FROM booth_activation WHERE id = 1",
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      boothId: r.booth_id,
      activationCode: r.activation_code,
      boothName: r.booth_name,
      organizationId: r.organization_id,
      templateVariant: r.template_variant,
      activatedAt: r.activated_at,
      token: r.token ?? null,
    };
  } catch (e) {
    console.warn("Failed to query SQLite booth_activation:", e);
    return null;
  }
}

export async function saveActivation(data: BoothActivation): Promise<void> {
  try {
    const conn = await db();
    await conn.execute(
      `INSERT INTO booth_activation (id, booth_id, activation_code, booth_name, organization_id, template_variant, activated_at, token)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       booth_id = $1, activation_code = $2, booth_name = $3,
       organization_id = $4, template_variant = $5, activated_at = $6, token = $7`,
      [
        data.boothId,
        data.activationCode,
        data.boothName,
        data.organizationId,
        data.templateVariant,
        data.activatedAt,
        data.token ?? null,
      ],
    );
  } catch (e) {
    console.error("Failed to save activation:", e);
    throw new Error(
      "Database tidak tersedia. Pastikan aplikasi berjalan dengan benar.",
    );
  }
}

export async function clearActivation(): Promise<void> {
  const conn = await db();
  await conn.execute("DELETE FROM booth_activation WHERE id = 1");
}

// ============================================================================
// API CACHE (SQLite `api_cache`) — snapshot JSON besar (templates/categories)
// ============================================================================

export async function getApiCache(key: string): Promise<string | null> {
  try {
    const conn = await db();
    const rows = await conn.select<any[]>(
      "SELECT payload FROM api_cache WHERE cache_key = $1",
      [key],
    );
    return rows.length ? (rows[0].payload as string) : null;
  } catch (e) {
    console.warn("Failed to read api_cache:", e);
    return null;
  }
}

export async function setApiCache(key: string, payload: string): Promise<void> {
  try {
    const conn = await db();
    await conn.execute(
      `INSERT INTO api_cache (cache_key, payload, fetched_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (cache_key) DO UPDATE SET
         payload = $2, fetched_at = $3`,
      [key, payload, Date.now()],
    );
  } catch (e) {
    console.warn("Failed to write api_cache:", e);
  }
}

// ============================================================================
// ASSET CACHE META (SQLite `asset_cache`) — mapping url -> cache_key lokal
// ============================================================================

export interface AssetCacheMeta {
  cache_key: string;
  mime: string | null;
}

export async function getAssetCacheMeta(
  url: string,
): Promise<AssetCacheMeta | null> {
  try {
    const conn = await db();
    const rows = await conn.select<any[]>(
      "SELECT cache_key, mime FROM asset_cache WHERE url = $1",
      [url],
    );
    if (!rows.length) return null;
    return { cache_key: rows[0].cache_key, mime: rows[0].mime };
  } catch (e) {
    console.warn("Failed to read asset_cache:", e);
    return null;
  }
}

export async function setAssetCacheMeta(
  url: string,
  cacheKey: string,
  mime: string | null,
  size: number,
): Promise<void> {
  try {
    const conn = await db();
    await conn.execute(
      `INSERT INTO asset_cache (url, cache_key, mime, size, fetched_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (url) DO UPDATE SET
         cache_key = $2, mime = $3, size = $4, fetched_at = $5`,
      [url, cacheKey, mime, size, Date.now()],
    );
  } catch (e) {
    console.warn("Failed to write asset_cache:", e);
  }
}

// ============================================================================
// CAMERA PRESET (SQLite `camera_presets`) — ISO/Tv/Av tersimpan per model kamera
// ============================================================================

export interface CameraPreset {
  model: string;
  iso: string;
  shutterSpeed: string;
  aperture: string;
  updatedAt: string;
}

export async function saveCameraPreset(
  model: string,
  iso: string,
  shutterSpeed: string,
  aperture: string,
): Promise<void> {
  const conn = await db();
  await conn.execute(
    `INSERT INTO camera_presets (model, iso, shutter_speed, aperture, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (model) DO UPDATE SET
       iso = $2, shutter_speed = $3, aperture = $4, updated_at = $5`,
    [model, iso, shutterSpeed, aperture, new Date().toISOString()],
  );
}

export async function getCameraPreset(model: string): Promise<CameraPreset | null> {
  try {
    const conn = await db();
    const rows = await conn.select<any[]>(
      "SELECT * FROM camera_presets WHERE model = $1",
      [model],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      model: r.model,
      iso: r.iso,
      shutterSpeed: r.shutter_speed,
      aperture: r.aperture,
      updatedAt: r.updated_at,
    };
  } catch (e) {
    console.warn("Gagal membaca camera_presets:", e);
    return null;
  }
}

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
  status: 'pending' | 'processing' | 'done' | 'dead_letter';
  attempts: number;
  lastError: string | null;
}

export const MAX_OUTBOX_ATTEMPTS = 5;

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
    [id],
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
    [MAX_OUTBOX_ATTEMPTS],
  );
  return Number(rows[0]?.c ?? 0);
}
