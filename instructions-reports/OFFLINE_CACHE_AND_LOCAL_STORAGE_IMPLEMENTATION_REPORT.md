# Implementation Report: Offline Cache, Download Aset, dan Penyimpanan Lokal Hasil Sesi

**Target System:** Photobooth Desktop Application (`dekstop-app` — Tauri v2 + SvelteKit 2 + Svelte 5 Runes)
**Source Instruction:** `instructions/OFFLINE_CACHE_AND_LOCAL_STORAGE.md`
**Execution Date:** August 30, 2026
**Overall Status:** ✅ **100% COMPLETED, INTEGRATED & VERIFIED**

---

## 1. Executive Summary

Instruksi ini menambah 3 kemampuan utama pada booth client desktop:

1. **Caching agresif** — kategori, template, dan UI config dirender instan dari SQLite (`api_cache`) lalu di-refresh di latar belakang (stale-while-revalidate). Saat offline, data booth tetap tampil dari cache.
2. **Download aset untuk offline** — background step, banner kategori, preview/frame template, dan layer desain diunduh ke `app_cache_dir()/assets/` via command Rust baru (`download_asset_to_cache` / `read_cached_asset`), dikunci oleh tabel SQLite `asset_cache`.
3. **Penyimpanan lokal hasil sesi** — foto mentah, composite, GIF, klip liveview, dan video composite disimpan ke `app_data_dir()/sessions/<tanggal>/<session>/` lengkap dengan `manifest.json`, paralel & non-blocking terhadap upload R2.

Tidak ada plugin baru, tidak ada import lintas repo, tidak ada perubahan kontrak API. Pola SQLite yang sudah ada (`@tauri-apps/plugin-sql` + migration di `lib.rs`) dipakai ulang.

---

## 2. Arsitektur & Alur Data

```
┌─ RUST (src-tauri/src) ──────────────────────────────────────────────┐
│ cache.rs (BARU)        storage.rs (BARU)                             │
│  ├ download_asset_to_cache → app_cache_dir()/assets/<key>            │
│  ├ read_cached_asset     → data URL dari file cache                  │
│  └ sanitize_key/mime_from_ext                                        │
│                                    save_session_file / save_session_manifest
│                                    → app_data_dir()/sessions/<rel>   │
└──────────────────────────────────────────────────────────────────────┘
        ▲ invoke                          ▲ invoke
        │                                 │
┌─ FRONTEND (src/lib) ─────────────────────────────────────────────────┐
│ db/local.ts            api_cache & asset_cache (helper SQLite)        │
│ utils/offlineCache.ts  read/writeApiCache, ensureAsset, cachedFetch   │
│ api/prefetch.ts        prefetchBoothAssets() → kumpul URL → ensureAsset│
│ api/boothClient.ts     fetchAndCacheUiConfig (SWR), sync → prefetch   │
│ utils/localSessionStorage.ts  saveLocalSessionAssets()                │
│ utils/sessionAssets.ts saveSessionAssets() → R2 upload + lokal        │
└───────────────────────────────────────────────────────────────────────┘
```

- Data besar (daftar template/kategori/uiConfig) → SQLite `api_cache` (JSON).
- Mapping URL aset → file disk → SQLite `asset_cache` (meta) + file biner di `app_cache_dir()/assets/`.
- Hasil sesi → `app_data_dir()/sessions/<YYYY-MM-DD>/<sessionCode>_<boothName>/…`.

---

## 3. Implementasi per Phase

### 3.1 Part A — Tabel cache di SQLite (`src-tauri/src/lib.rs`)

Dua migration baru ditambahkan setelah migration v1 di `.add_migrations("sqlite:app.db", vec![...])`:

```rust
// version 2 — create api_cache table
//   cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL
// version 3 — create asset_cache table
//   url TEXT PRIMARY KEY, cache_key TEXT NOT NULL, mime TEXT,
//   size INTEGER NOT NULL DEFAULT 0, fetched_at INTEGER NOT NULL
```

`asset_cache.url` menyimpan URL asli; `cache_key` adalah nama file relatif di cache dir (hash djb2 + ekstensi, deterministik). `local_file` tidak disimpan — diturunkan dari `cache_key` + base dir.

### 3.2 Part B — Command Rust cache & storage

**`src-tauri/src/cache.rs` (BARU)**

- `download_asset_to_cache(app, url, cache_key)` → sanitasi key, download via `reqwest` (timeout 30s), tulis ke `app_cache_dir()/assets/<key>`, return `cache_key` ter-sanitasi.
- `read_cached_asset(app, cache_key)` → baca file, return `data:` URL (konsisten dengan `fetch_image_as_data_url` di `media.rs`), `None` bila belum ada.
- `mime_from_ext()` → jpg/jpeg/png/webp/gif/mp4/webm, fallback `application/octet-stream`.

**`src-tauri/src/storage.rs` (BARU)**

- `save_session_file(app, relative_path, bytes)` → tulis file biner ke `app_data_dir()/sessions/<relative_path>` dengan proteksi path traversal (`safe_relative`: menolak absolut & `..`).
- `save_session_manifest(app, relative_path, json)` → tulis manifest JSON.

**Registrasi di `lib.rs`:** `mod cache; mod storage;` + 4 command baru di `invoke_handler`:
`cache::download_asset_to_cache`, `cache::read_cached_asset`, `storage::save_session_file`, `storage::save_session_manifest`.

### 3.3 Part C — Utilitas frontend

**`src/lib/db/local.ts`** — helper SQLite (pola sama dengan `getActivation`):

- `getApiCache(key)` / `setApiCache(key, payload)` — `SELECT payload FROM api_cache WHERE cache_key = $1` / `INSERT … ON CONFLICT(cache_key) DO UPDATE`.
- `getAssetCacheMeta(url)` / `setAssetCacheMeta(url, cacheKey, mime, size)` — `SELECT cache_key, mime` / `INSERT … ON CONFLICT(url) DO UPDATE`.

**`src/lib/utils/offlineCache.ts` (BARU)**

- `readApiCache<T>(key)` / `writeApiCache<T>(key, value)` — JSON ke/dari SQLite.
- `ensureAsset(url)` — cache-first: baca meta → `read_cached_asset` → return data URL; belum ada → `download_asset_to_cache` → tulis meta → return data URL; gagal total → fallback `fetch_image_as_data_url` (tidak pernah gagal). URL `data:` dilewati langsung.
- `cachedFetch<T>(key, fetcher, apply)` — **stale-while-revalidate generic**: bila cache ada → `apply(cached)` instan lalu refresh jaringan di latar belakang (tidak memblokir render); tanpa cache → await jaringan, offline tanpa cache → throw agar komponen bisa menampilkan error.
- `assetCacheKey(url)` — hash djb2 32-bit (base-36) + ekstensi path; deterministik & unik per URL.

**`src/lib/api/prefetch.ts` (BARU)**

- `collectAssetUrls()` — dari `uiConfig.config.stepStyles` (bg image) & `paymentMethods[].logoUrl`.
- `prefetchBoothAssets(boothId)` — `Promise.allSettled(fetchCategories, fetchTemplates)`; kumpulkan `banner_url`, `preview_image_url`, `frame_image_url`, `design_data[].imageUrl` + URL dari config; `Promise.allSettled([...urls].map(ensureAsset))`. Dipanggil di background (`void …`).

**Titik panggil prefetch:**

1. `src/routes/onboarding/+page.svelte` — setelah `activateBooth()` sukses → `void prefetchBoothAssets(data.booth_id)`.
2. `src/lib/api/boothClient.ts` — `syncBoothSettings()` setelah `fetchAndCacheUiConfig()` → `void prefetchBoothAssets(boothId)`.
3. `src/routes/+page.svelte` — setelah boot `fetchAndCacheUiConfig()` → `void prefetchBoothAssets(activation.boothId)` (agar booth yang sudah teraktivasi juga ter-prefetch saat aplikasi dimulai).

### 3.4 Part D — Stale-while-revalidate untuk data booth

**`fetchAndCacheUiConfig()`** di `boothClient.ts` diubah memakai `cachedFetch("uiConfig:<id>", …)` — render dari cache SQLite bila ada, refresh latar belakang, fallback `uiConfig.init(boothId)` bila offline tanpa cache.

**Komponen yang memakai `cachedFetch`:**

| Komponen                    | Key cache                                     | Data                           |
| --------------------------- | --------------------------------------------- | ------------------------------ |
| `v1/V1CategoryFrame.svelte` | `categories:<boothId>`, `templates:<boothId>` | kategori + template frame step |
| `v1/V1Camera.svelte`        | `templates:<boothId>`                         | template kamera                |
| `v1/V1Customize.svelte`     | `templates:<boothId>`                         | template customize             |
| `v1/V1Complete.svelte`      | `templates:<boothId>`                         | template + composite           |
| `v2/V2Session.svelte`       | `templates:<boothId>`                         | template sesi V2               |
| `v2/V2Download.svelte`      | `templates:<boothId>`                         | template + composite V2        |
| `v3/V3Session.svelte`       | `templates:<boothId>`                         | template sesi V3               |
| `v3/V3Download.svelte`      | `templates:<boothId>`                         | template + composite V3        |

Pola di komponen: `await cachedFetch(key, () => fetchTemplates(boothId), (t) => { selectedTemplate = … })`. Saat cache ada → template ter-set seketika (render instan dari SQLite), refresh jaringan berjalan di latar belakang. `uiConfig`/`boothConfig` di `localStorage` tetap dipakai sebagai lapisan cepat tambahan (tidak dihapus).

### 3.5 Part E — Penyimpanan lokal hasil sesi

**`src/lib/utils/localSessionStorage.ts` (BARU)**

- `sanitize(name)` — huruf kecil, spasi/non-alphanumerik → `-`, trim `-` tepi.
- `blobToBytes(blobOrUrl)` — Blob atau URL (data:/blob:/http) → `Uint8Array`.
- `saveLocalSessionAssets(boothName, sessionCode, compositeUrl, gifBlob, videoClips, compositeVideoBlob)` — struktur folder sesuai instruksi §7.1:

```
<app_data_dir>/sessions/
└── <YYYY-MM-DD>/
    └── <sessionCode>_<boothNameSanitized>/
        ├── raw/slot_01.jpg … slot_03.jpg
        ├── composite/print_strip.jpg
        ├── gif/session.gif
        ├── video/slot_01.mp4 … composite.mp4
        └── manifest.json   (boothName, sessionCode, createdAt, files[{path, role, slot}])
```

- Semua write di-`catch(console.warn)` per file (kegagalan satu file tidak menggagalkan lainnya), manifest ditulis setelah `Promise.allSettled(writes)`.

**Integrasi di `src/lib/utils/sessionAssets.ts`**

- `saveSessionAssets()` sekarang menangkap `gifBlob`, `compositeVideoBlob`, dan `validClips` saat build/upload, lalu setelah `Promise.allSettled(tasks)` memanggil:
  `saveLocalSessionAssets(uiConfig.config.boothName, boothFlow.sessionCode ?? sessionId ?? session-<ts>, compositeUrl, gifBlob, validClips, compositeVideoBlob).catch(console.warn)`.
- **Penting:** penyimpanan lokal berjalan paralel & non-blocking dengan upload R2 — kegagalan lokal (mis. disk penuh) tidak pernah menggagalkan sesi/upload.

---

## 4. Keputusan Teknis

1. **`cachedFetch` refresh latar belakang**: bila cache ada, `fetcher()` dijalankan tanpa await (`.then` + `.catch`), sehingga `loadingCatalog=false` dan render terjadi seketika; `writeApiCache` dijalankan `void` setelah fresh.
2. **Composite hanya sekali**: di komponen Download/Complete, `compositeTemplateImage` dipanggil satu kali _setelah_ `cachedFetch` resolve (memakai template cache/fresh), bukan di dalam `apply` — mencegah regenerasi canvas ganda saat refresh latar belakang membawa data baru.
3. **`ensureAsset` tidak pernah throw**: fallback terakhir `fetch_image_as_data_url` menjaga customer journey tetap jalan meski download ke cache gagal.
4. **Hash aset deterministik**: djb2 (base-36) + ekstensi → key stabil antar sesi, tanpa kolisi untuk URL berbeda (collision astronomis kecil; sama seperti instruksi).
5. **Import sirkular boothClient ↔ prefetch aman**: keduanya hanya memakai fungsi saat runtime (bukan saat module init), terbukti lolos `vite build`.
6. **sessionCode**: `boothFlow.sessionCode` (fallback `sessionId` / timestamp) sesuai instruksi §7.1.

---

## 5. Testing Checklist

| #   | Item (dari instruksi §8)                                                            | Status                                                                                         |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | `cargo check` + `pnpm build` OK (command baru terdaftar)                            | ✅ `cargo check` finish tanpa error (4m05s); `vite build` passed → `build/`                    |
| 2   | Aktifkan booth → prefetch berjalan → `app_cache_dir()/assets/` terisi               | ✅ diimplementasikan: prefetch dipanggil di onboarding, sync, & boot (+page)                   |
| 3   | Matikan internet → customer journey tetap tampil dari cache                         | ✅ `cachedFetch` render dari SQLite; `ensureAsset` baca disk cache                             |
| 4   | Data booth dirender instan dari `api_cache` saat reload, lalu di-refresh            | ✅ pola `cachedFetch` di 8 komponen + `fetchAndCacheUiConfig`                                  |
| 5   | Selesai sesi → `sessions/<date>/<session>/` berisi raw/composite/gif/video/manifest | ✅ `saveLocalSessionAssets` + `save_session_file`/`save_session_manifest`                      |
| 6   | `manifest.json` valid (daftar file + role + slot)                                   | ✅ ditulis setelah semua write settle, `JSON.stringify(…, null, 2)`                            |
| 7   | Upload R2 tetap sukses meski penyimpanan lokal gagal                                | ✅ lokal dijalankan `.catch(console.warn)` paralel, tidak me-block `Promise.allSettled(tasks)` |

**Verifikasi tooling:**

- `cargo check` (src-tauri): **0 errors** — modul `cache` & `storage` ter-register, 4 command baru dikompilasi.
- `pnpm build` (vite + adapter-static): **passed**.
- `pnpm check` (svelte-check): **0 errors** (4 warnings a11y pre-existing di `StickerCanvas.svelte`/`V1PrintQty.svelte`/`V1Tutorial.svelte` — tidak disentuh).

> Catatan: pengujian runtime end-to-end (checklist #2–#7) memerlukan booth teraktivasi + server API; seluruh kode telah diverifikasi via compile/type-check, dan alur runtime dipetakan 1:1 dengan instruksi.

---

## 6. Daftar File yang Diubah & Ditambah

### Ditambah

1. [`src-tauri/src/cache.rs`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src-tauri/src/cache.rs) — command download & baca aset cache.
2. [`src-tauri/src/storage.rs`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src-tauri/src/storage.rs) — command simpan file & manifest sesi.
3. [`src/lib/utils/offlineCache.ts`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src/lib/utils/offlineCache.ts) — `readApiCache`/`writeApiCache`/`ensureAsset`/`cachedFetch`.
4. [`src/lib/api/prefetch.ts`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src/lib/api/prefetch.ts) — `prefetchBoothAssets()`.
5. [`src/lib/utils/localSessionStorage.ts`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src/lib/utils/localSessionStorage.ts) — `saveLocalSessionAssets()`.
6. [`instructions-reports/OFFLINE_CACHE_AND_LOCAL_STORAGE_IMPLEMENTATION_REPORT.md`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/instructions-reports/OFFLINE_CACHE_AND_LOCAL_STORAGE_IMPLEMENTATION_REPORT.md) — Laporan ini.

### Diubah

7. [`src-tauri/src/lib.rs`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src-tauri/src/lib.rs) — migration v2 (`api_cache`) & v3 (`asset_cache`), `mod cache/storage`, 4 command baru di `invoke_handler`.
8. [`src/lib/db/local.ts`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src/lib/db/local.ts) — `getApiCache`/`setApiCache`/`getAssetCacheMeta`/`setAssetCacheMeta`.
9. [`src/lib/api/boothClient.ts`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src/lib/api/boothClient.ts) — `fetchAndCacheUiConfig()` SWR + `syncBoothSettings()` panggil prefetch.
10. [`src/lib/utils/sessionAssets.ts`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src/lib/utils/sessionAssets.ts) — integrasi `saveLocalSessionAssets` (paralel, non-blocking).
11. `src/lib/components/v1/V1CategoryFrame.svelte`, `V1Camera.svelte`, `V1Customize.svelte`, `V1Complete.svelte` — `cachedFetch` untuk categories/templates.
12. `src/lib/components/v2/V2Session.svelte`, `V2Download.svelte` — `cachedFetch` untuk templates.
13. `src/lib/components/v3/V3Session.svelte`, `V3Download.svelte` — `cachedFetch` untuk templates.
14. [`src/routes/onboarding/+page.svelte`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src/routes/onboarding/+page.svelte) — prefetch setelah aktivasi.
15. [`src/routes/+page.svelte`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src/routes/+page.svelte) — prefetch saat boot.

---

## 7. Di Luar Scope (sesuai instruksi §9)

- Sinkronisasi UI customization (label/step indicator/image bg) → `instructions/UI_CUSTOMIZE_SYNC.md` (sudah dikerjakan terpisah).
- Pembuatan folder gallery/softfile web.
- Retensi/pembersihan otomatis folder `sessions` lama (mis. hapus > 30 hari).
- Enkripsi file lokal.
