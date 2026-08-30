# Instruksi: Offline Cache, Download Aset, dan Penyimpanan Lokal Hasil Sesi — `dekstop-app`

**Target repo:** `dekstop-app` (Tauri v2 + SvelteKit). Dokumen ini **terpisah** dari `UI_CUSTOMIZE_SYNC.md` dan boleh dikerjakan independen.

**Batasan & pola yang harus dihormati:**

- `api`/`admin-dashboard`/`dekstop-app` = 3 repo terpisah, tidak ada import langsung.
- Utilitas murni → `src/lib/utils/*`; state → `src/lib/stores/*`; network/mapping → `src/lib/api/*`; command native → `src-tauri/src/*`; tampilan → `src/lib/components/**`.
- SQLite sudah tersedia via `@tauri-apps/plugin-sql` (lihat `src/lib/db/local.ts` dan migration di `src-tauri/src/lib.rs`). Gunakan pola yang sama, jangan tambah penyimpanan baru yang aneh.

---

## 0. Tujuan

1. **Caching agresif** — booth client langsung render dari cache lokal saat customer berinteraksi, refresh dari server di latar belakang (stale-while-revalidate).
2. **Download aset untuk offline** — gambar background step, tutorial, preview/background template frame, gambar kategori, dsb. diunduh & disimpan lokal agar booth tetap jalan tanpa internet.
3. **Penyimpanan lokal hasil sesi** — foto mentah, GIF, liveview terproses, dan hasil gabungan template disimpan ke folder lokal setelah sesi selesai (nice-to-have).

---

## 1. Keadaan Sekarang

- SQLite `booth.db` hanya berisi tabel `booth_activation` (migration v1).
- `uiConfig` & `boothConfig` dicache di `localStorage`.
- `fetchCategories()` / `fetchTemplates()` / `fetchAndCacheUiConfig()` selalu fetch jaringan saat dipanggil; tidak ada cache disk untuk gambar/aset.
- `src-tauri/src/media.rs` sudah punya `fetch_image_as_data_url` (reqwest → data URL) dan command media lain; `capture_photo` sudah menulis ke `app.path().app_data_dir()/captures`.
- Hasil sesi hanya di-upload ke R2 (`saveSessionAssets`), belum disimpan lokal.

---

## 2. Arsitektur Target

```
src-tauri/src/
├── cache.rs        # BARU — download & baca aset cache (reqwest + std::fs + app_cache_dir)
└── storage.rs      # BARU — tulis file hasil sesi ke app_data_dir/sessions

src/lib/
├── db/local.ts             # (existing) tambah helper api_cache & asset_cache
├── utils/offlineCache.ts   # BARU — cache-first util untuk aset & snapshot API
├── utils/localSessionStorage.ts  # BARU — simpan hasil sesi ke disk lokal
├── api/boothClient.ts      # (existing) tambah prefetchBoothAssets()
└── api/prefetch.ts         # BARU — kumpulkan URL aset dari config & download
```

Tidak perlu plugin baru. Gunakan command Rust + `reqwest` (sudah ada) + `std::fs`.

---

## 3. Part A — Tabel cache di SQLite

Tambahkan migration baru di `src-tauri/src/lib.rs` (di dalam `.add_migrations("sqlite:app.db", vec![...])`), setelah migration v1:

```rust
tauri_plugin_sql::Migration {
    version: 2,
    description: "create api_cache table",
    sql: "CREATE TABLE IF NOT EXISTS api_cache (
        cache_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
    );",
    kind: tauri_plugin_sql::MigrationKind::Up,
},
tauri_plugin_sql::Migration {
    version: 3,
    description: "create asset_cache table",
    sql: "CREATE TABLE IF NOT EXISTS asset_cache (
        url TEXT PRIMARY KEY,
        cache_key TEXT NOT NULL,
        mime TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        fetched_at INTEGER NOT NULL
    );",
    kind: tauri_plugin_sql::MigrationKind::Up,
},
```

> `asset_cache.url` menyimpan URL asli; `cache_key` adalah nama file relatif di cache dir (hash/slug). `local_file` tidak perlu disimpan karena bisa diturunkan dari `cache_key` + base dir.

---

## 4. Part B — Command Rust cache & storage

### 4.1 `src-tauri/src/cache.rs` (BARU)

```rust
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn assets_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_cache_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("assets")
}

fn sanitize_key(key: &str) -> String {
    key.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .collect()
}

/// Download URL ke cache dir, return path relatif cache_key (bukan path absolut).
#[tauri::command]
pub async fn download_asset_to_cache(
    app: AppHandle,
    url: String,
    cache_key: String,
) -> Result<String, String> {
    let key = sanitize_key(&cache_key);
    let dir = assets_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&key);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Gagal download aset (HTTP {})", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(key)
}

/// Baca file cache, return data URL (konsisten dengan fetch_image_as_data_url).
#[tauri::command]
pub async fn read_cached_asset(
    app: AppHandle,
    cache_key: String,
) -> Result<Option<String>, String> {
    let key = sanitize_key(&cache_key);
    let path = assets_dir(&app).join(&key);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mime = mime_from_ext(&key);
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(Some(format!("data:{};base64,{}", mime, b64)))
}

fn mime_from_ext(name: &str) -> &'static str {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}
```

### 4.2 `src-tauri/src/storage.rs` (BARU)

```rust
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn sessions_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("sessions")
}

fn safe_relative(p: &str) -> Result<PathBuf, String> {
    let path = Path::new(p);
    if path.is_absolute() || p.contains("..") {
        return Err("relative_path tidak valid".into());
    }
    Ok(path.to_path_buf())
}

/// Simpan satu file biner hasil sesi ke app_data_dir/sessions/<relative_path>.
#[tauri::command]
pub async fn save_session_file(
    app: AppHandle,
    relative_path: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let rel = safe_relative(&relative_path)?;
    let full = sessions_dir(&app).join(&rel);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&full, &bytes).map_err(|e| e.to_string())?;
    Ok(full.to_string_lossy().to_string())
}

/// Simpan manifest JSON sesi.
#[tauri::command]
pub async fn save_session_manifest(
    app: AppHandle,
    relative_path: String,
    json: String,
) -> Result<String, String> {
    let rel = safe_relative(&relative_path)?;
    let full = sessions_dir(&app).join(&rel);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&full, json).map_err(|e| e.to_string())?;
    Ok(full.to_string_lossy().to_string())
}
```

### 4.3 Register di `src-tauri/src/lib.rs`

- Tambah `mod cache;` dan `mod storage;` di atas.
- Tambah ke `.invoke_handler(tauri::generate_handler![ ... ])`:
  `cache::download_asset_to_cache`, `cache::read_cached_asset`,
  `storage::save_session_file`, `storage::save_session_manifest`.

---

## 5. Part C — Utilitas frontend

### 5.1 `src/lib/db/local.ts` — helper cache

Tambahkan fungsi (pola sama dengan `getActivation`):

```ts
export async function getApiCache(key: string): Promise<string | null> {
  /* SELECT payload FROM api_cache WHERE cache_key = $1 */
}
export async function setApiCache(key: string, payload: string): Promise<void> {
  /* INSERT ... ON CONFLICT(cache_key) DO UPDATE */
}
export async function getAssetCacheMeta(
  url: string,
): Promise<{ cache_key: string; mime: string | null } | null> {
  /* SELECT ... */
}
export async function setAssetCacheMeta(
  url: string,
  cacheKey: string,
  mime: string | null,
  size: number,
): Promise<void> {
  /* INSERT ... ON CONFLICT(url) DO UPDATE */
}
```

### 5.2 `src/lib/utils/offlineCache.ts` (BARU)

```ts
import { invoke } from "@tauri-apps/api/core";
import {
  getApiCache,
  setApiCache,
  getAssetCacheMeta,
  setAssetCacheMeta,
} from "$lib/db/local";

export async function readApiCache<T>(key: string): Promise<T | null> {
  const raw = await getApiCache(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeApiCache<T>(key: string, value: T): Promise<void> {
  await setApiCache(key, JSON.stringify(value));
}

/// Cache-first untuk aset: return data URL dari cache lokal, atau download bila belum ada.
export async function ensureAsset(url: string): Promise<string> {
  const meta = await getAssetCacheMeta(url);
  if (meta) {
    const dataUrl = await invoke<string | null>("read_cached_asset", {
      cacheKey: meta.cache_key,
    });
    if (dataUrl) return dataUrl;
  }
  const cacheKey = assetCacheKey(url); // mis. slug/hash pendek dari url
  const savedKey = await invoke<string>("download_asset_to_cache", {
    url,
    cacheKey,
  });
  const dataUrl = await invoke<string>("read_cached_asset", {
    cacheKey: savedKey,
  });
  await setAssetCacheMeta(url, savedKey, mimeFromUrl(url), 0);
  return dataUrl;
}

function assetCacheKey(url: string): string {
  // hash sederhana (djb2) + ext dari path — cukup untuk unik & deterministik
  let h = 5381;
  for (let i = 0; i < url.length; i++)
    h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  const ext = (url.split(".").pop()?.split(/[?#]/)[0] || "bin").toLowerCase();
  return `${h.toString(36)}.${ext}`;
}

function mimeFromUrl(url: string): string {
  const ext = url.split(".").pop()?.split(/[?#]/)[0]?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
  };
  return map[ext] ?? "application/octet-stream";
}
```

### 5.3 `src/lib/api/prefetch.ts` (BARU)

```ts
import { fetchCategories, fetchTemplates } from "./boothClient";
import { uiConfig } from "$lib/stores/uiConfig.svelte";
import { ensureAsset } from "$lib/utils/offlineCache";

function collectAssetUrls(): string[] {
  const urls: string[] = [];
  for (const s of uiConfig.config.stepStyles ?? []) {
    if (s.bgType === "image" && s.bgValue) urls.push(s.bgValue);
  }
  // payment logos bila ada (logoUrl)
  for (const p of uiConfig.config.paymentMethods ?? []) {
    if (p.logoUrl) urls.push(p.logoUrl);
  }
  return urls;
}

export async function prefetchBoothAssets(boothId: string): Promise<void> {
  const [categories, templates] = await Promise.allSettled([
    fetchCategories(boothId),
    fetchTemplates(boothId),
  ]);

  const urls = new Set<string>(collectAssetUrls());
  if (categories.status === "fulfilled") {
    for (const c of categories.value) if (c.banner_url) urls.add(c.banner_url);
  }
  if (templates.status === "fulfilled") {
    for (const t of templates.value) {
      if (t.preview_image_url) urls.add(t.preview_image_url);
      if (t.frame_image_url) urls.add(t.frame_image_url);
      for (const layer of t.design_data ?? []) {
        if (layer.imageUrl) urls.add(layer.imageUrl);
      }
    }
  }

  await Promise.allSettled([...urls].map((u) => ensureAsset(u)));
}
```

### 5.4 Panggil prefetch

- Setelah aktivasi berhasil (`onboarding/+page.svelte`): panggil `await prefetchBoothAssets(boothId)`.
- Setelah `syncBoothSettings()` di `src/lib/api/boothClient.ts`: panggil `prefetchBoothAssets(boothId)`.
- Jangan blokir render utama — jalankan di background (`void prefetchBoothAssets(...)`).

---

## 6. Part D — Stale-while-revalidate untuk data booth

Ubah alur load kategori/template/UI config agar render pakai cache dulu, lalu refresh:

```ts
// Contoh di komponen yang memakai categories/templates (frame step):
import { readApiCache, writeApiCache } from "$lib/utils/offlineCache";

async function loadTemplatesCached(boothId: string) {
  const key = `templates:${boothId}`;
  const cached = await readApiCache<Template[]>(key);
  if (cached) templates = cached; // render instan dari SQLite
  try {
    const fresh = await fetchTemplates(boothId);
    templates = fresh;
    void writeApiCache(key, fresh); // refresh latar belakang
  } catch {
    // offline: biarkan pakai cached
  }
}
```

Terapkan pola yang sama untuk `uiConfig` dan `categories`. `uiConfig`/`boothConfig` yang sudah di `localStorage` boleh tetap dipakai sebagai lapisan cepat tambahan; SQLite `api_cache` dipakai untuk data yang lebih besar (daftar template/kategori).

---

## 7. Part E — Penyimpanan lokal hasil sesi

### 7.1 Struktur folder (rekomendasi)

```
<app_data_dir>/sessions/
└── <YYYY-MM-DD>/
    └── <sessionCode>_<boothNameSanitized>/
        ├── raw/
        │   ├── slot_01.jpg
        │   ├── slot_02.jpg
        │   └── slot_03.jpg
        ├── composite/
        │   └── print_strip.jpg
        ├── gif/
        │   └── session.gif
        ├── video/
        │   ├── slot_01.mp4
        │   ├── slot_02.mp4
        │   └── composite.mp4
        └── manifest.json
```

- `<sessionCode>`: dari `boothFlow.sessionCode` (fallback `sessionId`/timestamp).
- `boothNameSanitized`: `booth_name` huruf kecil, spasi → `-`, buang karakter non-alphanumerik.

### 7.2 `src/lib/utils/localSessionStorage.ts` (BARU)

```ts
import { invoke } from "@tauri-apps/api/core";
import { boothFlow } from "$lib/stores/booth.svelte";
import { boothConfig } from "$lib/stores/boothConfig.svelte";

function sanitize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function blobToBytes(blobOrUrl: Blob | string): Promise<Uint8Array> {
  const blob =
    typeof blobOrUrl === "string"
      ? await (await fetch(blobOrUrl)).blob()
      : blobOrUrl;
  return new Uint8Array(await blob.arrayBuffer());
}

export async function saveLocalSessionAssets(
  boothName: string,
  sessionCode: string,
  compositeUrl: string | null,
  gifBlob: Blob | null,
  videoClips: (Blob | string | null)[],
  compositeVideoBlob: Blob | null,
) {
  const date = new Date().toISOString().slice(0, 10);
  const base = `${date}/${sessionCode}_${sanitize(boothName || "booth")}`;
  const manifest: any = {
    boothName,
    sessionCode,
    createdAt: new Date().toISOString(),
    files: [],
  };

  const writes: Promise<void>[] = [];

  boothFlow.photosTaken.forEach((photoUrl, i) => {
    writes.push(
      blobToBytes(photoUrl)
        .then(async (bytes) => {
          const rel = `${base}/raw/slot_${String(i + 1).padStart(2, "0")}.jpg`;
          await invoke("save_session_file", {
            relativePath: rel,
            bytes: Array.from(bytes),
          });
          manifest.files.push({ path: rel, role: "raw_photo", slot: i + 1 });
        })
        .catch(console.warn),
    );
  });

  if (compositeUrl) {
    writes.push(
      blobToBytes(compositeUrl)
        .then(async (bytes) => {
          const rel = `${base}/composite/print_strip.jpg`;
          await invoke("save_session_file", {
            relativePath: rel,
            bytes: Array.from(bytes),
          });
          manifest.files.push({ path: rel, role: "composite" });
        })
        .catch(console.warn),
    );
  }

  if (gifBlob) {
    writes.push(
      blobToBytes(gifBlob)
        .then(async (bytes) => {
          const rel = `${base}/gif/session.gif`;
          await invoke("save_session_file", {
            relativePath: rel,
            bytes: Array.from(bytes),
          });
          manifest.files.push({ path: rel, role: "gif" });
        })
        .catch(console.warn),
    );
  }

  videoClips.forEach((clip, i) => {
    if (!clip) return;
    writes.push(
      blobToBytes(clip)
        .then(async (bytes) => {
          const ext = (clip instanceof Blob ? clip.type : "").includes("webm")
            ? "webm"
            : "mp4";
          const rel = `${base}/video/slot_${String(i + 1).padStart(2, "0")}.${ext}`;
          await invoke("save_session_file", {
            relativePath: rel,
            bytes: Array.from(bytes),
          });
          manifest.files.push({
            path: rel,
            role: "liveview_clip",
            slot: i + 1,
          });
        })
        .catch(console.warn),
    );
  });

  if (compositeVideoBlob) {
    writes.push(
      blobToBytes(compositeVideoBlob)
        .then(async (bytes) => {
          const rel = `${base}/video/composite.mp4`;
          await invoke("save_session_file", {
            relativePath: rel,
            bytes: Array.from(bytes),
          });
          manifest.files.push({ path: rel, role: "composite_video" });
        })
        .catch(console.warn),
    );
  }

  await Promise.allSettled(writes);
  await invoke("save_session_manifest", {
    relativePath: `${base}/manifest.json`,
    json: JSON.stringify(manifest, null, 2),
  });
}
```

### 7.3 Integrasi ke `src/lib/utils/sessionAssets.ts`

Di dalam `saveSessionAssets()`, setelah (atau paralel dengan) upload ke R2, panggil `saveLocalSessionAssets(...)` dengan argumen yang sama. PENTING: penyimpanan lokal **tidak boleh** menggagalkan upload R2 — jalankan dengan `.catch(console.warn)`.

---

## 8. Testing Checklist

1. `cargo build` + `pnpm build` OK (command baru terdaftar).
2. Aktifkan booth → prefetch berjalan → `app_cache_dir()/assets/` terisi gambar background/tutorial/template/kategori.
3. Matikan internet (atau blokir API) → jalankan customer journey → layout, background, frame preview, dan tutorial tetap tampil dari cache.
4. Data booth (categories/templates/uiConfig) dirender instan dari SQLite `api_cache` saat reload, lalu di-refresh bila jaringan ada.
5. Selesaikan sesi → `app_data_dir()/sessions/<date>/<session>/` berisi `raw/`, `composite/`, `gif/`, `video/`, `manifest.json`.
6. `manifest.json` valid dan memuat daftar file + role + slot.
7. Upload R2 tetap sukses meskipun penyimpanan lokal gagal (mis. disk penuh) — kegagalan lokal tidak menggagalkan sesi.

---

## 9. Di Luar Scope

- Sinkronisasi UI customization (label/step indicator/image bg) → lihat `UI_CUSTOMIZE_SYNC.md`.
- Pembuatan folder gallery/softfile web.
- Retensi/pembersihan otomatis folder `sessions` lama (bisa ditambahkan belakangan, mis. hapus folder > 30 hari).
- Enkripsi file lokal.
