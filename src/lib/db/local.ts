import Database from "@tauri-apps/plugin-sql";

export interface BoothActivation {
  boothId: string;
  activationCode: string;
  boothName: string;
  organizationId: string | null;
  templateVariant: "v1" | "v2" | "v3" | "custom";
  activatedAt: string;
  token?: string | null;
  deviceId?: string | null;
}

export interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
  createdAt: number;
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
// USER SESSION (SQLite `user_session`) — Operator/User login token
// ============================================================================

export interface UserSession {
  userId: string;
  name: string;
  email: string;
  role: string;
  token: string;
  expiresAt: number;
  updatedAt: number;
}

export async function getUserSession(): Promise<UserSession | null> {
  try {
    const conn = await db();
    const rows = await conn.select<any[]>(
      "SELECT * FROM user_session WHERE id = 1",
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      userId: r.user_id,
      name: r.name,
      email: r.email,
      role: r.role,
      token: r.token,
      expiresAt: Number(r.expires_at),
      updatedAt: Number(r.updated_at),
    };
  } catch (e) {
    console.warn("Failed to query SQLite user_session:", e);
    return null;
  }
}

export async function saveUserSession(data: UserSession): Promise<void> {
  try {
    const conn = await db();
    await conn.execute(
      `INSERT INTO user_session (id, user_id, name, email, role, token, expires_at, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         user_id = $1, name = $2, email = $3, role = $4, token = $5, expires_at = $6, updated_at = $7`,
      [
        data.userId,
        data.name,
        data.email,
        data.role,
        data.token,
        data.expiresAt,
        data.updatedAt,
      ],
    );
  } catch (e) {
    console.error("Failed to save user session:", e);
  }
}

export async function clearUserSession(): Promise<void> {
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem("potohub_refresh_token");
    }
    const conn = await db();
    await conn.execute("DELETE FROM user_session WHERE id = 1");
  } catch (e) {
    console.warn("Failed to clear user_session:", e);
  }
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

export interface SessionHistoryItem {
  id: number;
  sessionCode: string;
  status: 'pending' | 'processing' | 'done' | 'dead_letter';
  attempts: number;
  lastError: string | null;
  createdAt: number;
  softfileTarget: string | null;
  compositePath: string | null;
  printQty: number;
  paperSize?: string;
  useSecondary?: boolean;
  printStatus?: 'printed' | 'pending' | 'failed';
  printError?: string | null;
}

export async function getOutboxJobByLocalRef(localRef: string): Promise<OutboxJob | null> {
  const conn = await db();
  const rows = await conn.select<any[]>(
    "SELECT * FROM offline_outbox WHERE local_ref = $1 ORDER BY id DESC LIMIT 1",
    [localRef],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    jobType: r.job_type,
    localRef: r.local_ref,
    payload: r.payload,
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
  };
}

export async function upsertSessionOutboxJob(
  sessionCode: string,
  payload: any,
  options?: { status?: 'pending' | 'done'; lastError?: string | null },
): Promise<number> {
  const conn = await db();
  const now = Date.now();
  const targetStatus = options?.status ?? 'pending';
  const targetError = options?.lastError ?? null;
  const existing = await getOutboxJobByLocalRef(sessionCode);
  if (existing) {
    let existingPayload: any = {};
    try {
      existingPayload = JSON.parse(existing.payload);
    } catch {}
    const merged = { ...existingPayload, ...payload };
    if (payload.softfileTarget && !existingPayload.softfileTarget) {
      merged.softfileTarget = payload.softfileTarget;
    } else if (!payload.softfileTarget && existingPayload.softfileTarget) {
      merged.softfileTarget = existingPayload.softfileTarget;
    }
    if (payload.backendSessionId && !existingPayload.backendSessionId) {
      merged.backendSessionId = payload.backendSessionId;
    } else if (!payload.backendSessionId && existingPayload.backendSessionId) {
      merged.backendSessionId = existingPayload.backendSessionId;
    }
    const finalStatus = existingPayload.softfileTarget && existing.status === 'pending' ? 'pending' : targetStatus;
    await conn.execute(
      `UPDATE offline_outbox 
       SET payload = $2, status = $3, attempts = 0, last_error = $4, updated_at = $5
       WHERE id = $1`,
      [existing.id, JSON.stringify(merged), finalStatus, targetError, now],
    );
    return existing.id;
  } else {
    const result = await conn.execute(
      `INSERT INTO offline_outbox (job_type, local_ref, payload, status, attempts, last_error, created_at, updated_at)
       VALUES ('session_softfile', $1, $2, $3, 0, $4, $5, $5)`,
      [sessionCode, JSON.stringify(payload), targetStatus, targetError, now],
    );
    return Number(result.lastInsertId ?? 0);
  }
}

export async function listAllSessionOutboxJobs(limit = 60): Promise<SessionHistoryItem[]> {
  const conn = await db();
  const rows = await conn.select<any[]>(
    `SELECT * FROM offline_outbox 
     WHERE job_type = 'session_softfile' 
     ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => {
    let payloadObj: any = {};
    try {
      payloadObj = JSON.parse(r.payload);
    } catch {}
    const compositePath =
      payloadObj.assetRelativePaths?.find((a: any) => a.role === 'composite')?.path || null;
    return {
      id: r.id,
      sessionCode: r.local_ref || payloadObj.localSessionCode || `sesi-${r.id}`,
      status: r.status,
      attempts: r.attempts,
      lastError: r.last_error,
      createdAt: r.created_at || Date.now(),
      softfileTarget: payloadObj.softfileTarget || null,
      compositePath,
      printQty: payloadObj.printQty || 1,
      paperSize: payloadObj.paperSize || '4x6',
      useSecondary: payloadObj.useSecondary ?? false,
      printStatus: payloadObj.printStatus || (r.status === 'done' ? 'printed' : 'pending'),
      printError: payloadObj.printError || null,
    };
  });
}

export async function updateSessionPrintStatus(
  sessionCode: string,
  printStatus: 'printed' | 'pending' | 'failed',
  printError?: string | null,
): Promise<void> {
  const conn = await db();
  const existing = await getOutboxJobByLocalRef(sessionCode);
  if (!existing) return;
  let payloadObj: any = {};
  try {
    payloadObj = JSON.parse(existing.payload);
  } catch {}
  payloadObj.printStatus = printStatus;
  payloadObj.printError = printError || null;
  await conn.execute(
    `UPDATE offline_outbox SET payload = $2, updated_at = $3 WHERE id = $1`,
    [existing.id, JSON.stringify(payloadObj), Date.now()],
  );
}

export async function countPendingSessionSoftfileJobs(): Promise<number> {
  const conn = await db();
  const rows = await conn.select<any[]>(
    `SELECT COUNT(*) as c FROM offline_outbox 
     WHERE job_type = 'session_softfile' AND status IN ('pending', 'dead_letter')`,
  );
  return Number(rows[0]?.c ?? 0);
}

export async function getOutboxJobById(id: number): Promise<OutboxJob | null> {
  const conn = await db();
  const rows = await conn.select<any[]>("SELECT * FROM offline_outbox WHERE id = $1", [id]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    jobType: r.job_type,
    localRef: r.local_ref,
    payload: r.payload,
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
  };
}

export async function updateOutboxJobPayload(id: number, payload: string): Promise<void> {
  const conn = await db();
  await conn.execute("UPDATE offline_outbox SET payload = $2, updated_at = $3 WHERE id = $1", [
    id,
    payload,
    Date.now(),
  ]);
}

export async function resetOutboxJobForRetry(id: number): Promise<void> {
  const conn = await db();
  await conn.execute(
    "UPDATE offline_outbox SET status = 'pending', attempts = 0, last_error = NULL, updated_at = $2 WHERE id = $1",
    [id, Date.now()],
  );
}

// ============================================================================
// DEVICE IDENTITY (SQLite `device_identity`)
// ============================================================================

export async function getOrCreateDeviceId(): Promise<DeviceIdentity> {
  try {
    const conn = await db();
    const rows = await conn.select<any[]>("SELECT * FROM device_identity WHERE id = 1");
    if (rows.length > 0 && rows[0].device_id) {
      return {
        deviceId: rows[0].device_id,
        deviceName: rows[0].device_name ?? "Photobooth-Kiosk",
        createdAt: Number(rows[0].created_at ?? Date.now()),
      };
    }
  } catch (e) {
    console.warn("Table device_identity query warning:", e);
  }

  const newDeviceId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}`;
  const deviceName = "Photobooth-Kiosk";
  const now = Date.now();

  try {
    const conn = await db();
    await conn.execute(
      `INSERT INTO device_identity (id, device_id, device_name, created_at)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET device_id = $1`,
      [newDeviceId, deviceName, now],
    );
  } catch (e) {
    console.error("Failed to save device_identity:", e);
  }

  return { deviceId: newDeviceId, deviceName, createdAt: now };
}

// ============================================================================
// PRINT QUEUE (SQLite `print_queue`) — Antrean Cetak Otomatis Tangguh Offline
// ============================================================================

export interface PrintJob {
  id: number;
  sessionCode: string;
  imagePath: string;
  copies: number;
  paperSize: string;
  useSecondary?: boolean;
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
  useSecondary?: boolean;
}): Promise<number> {
  const conn = await db();
  const now = Date.now();
  const res = await conn.execute(
    `INSERT INTO print_queue (session_code, image_path, copies, paper_size, use_secondary, status, attempts, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', 0, $6, $6)`,
    [params.sessionCode, params.imagePath, params.copies, params.paperSize, params.useSecondary ? 1 : 0, now]
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
    useSecondary: Boolean(r.use_secondary),
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
    `SELECT COUNT(*) as c FROM print_queue WHERE status = 'pending' AND attempts < 5`
  );
  return Number(rows[0]?.c ?? 0);
}
