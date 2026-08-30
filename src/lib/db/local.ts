import Database from "@tauri-apps/plugin-sql";

export interface BoothActivation {
  boothId: string;
  activationCode: string;
  boothName: string;
  organizationId: string | null;
  templateVariant: "v1" | "v2" | "v3" | "custom";
  activatedAt: string;
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
      `INSERT INTO booth_activation (id, booth_id, activation_code, booth_name, organization_id, template_variant, activated_at)
     VALUES (1, $1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       booth_id = $1, activation_code = $2, booth_name = $3,
       organization_id = $4, template_variant = $5, activated_at = $6`,
      [
        data.boothId,
        data.activationCode,
        data.boothName,
        data.organizationId,
        data.templateVariant,
        data.activatedAt,
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
