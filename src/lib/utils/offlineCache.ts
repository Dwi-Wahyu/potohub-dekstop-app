import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import {
  getApiCache,
  setApiCache,
  getAssetCacheMeta,
  setAssetCacheMeta,
} from '$lib/db/local';

// ============================================================================
// API SNAPSHOT CACHE (SQLite `api_cache`) — stale-while-revalidate
// ============================================================================

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

/**
 * Stale-while-revalidate generic loader.
 * - Bila cache ada → render instan dari SQLite (apply(cached)), refresh dari
 *   jaringan dijalankan di latar belakang (tidak memblokir render), lalu cache diupdate.
 * - Tanpa cache → await jaringan; offline tanpa cache → throw agar komponen
 *   bisa menampilkan pesan error.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  apply: (data: T) => void
): Promise<void> {
  const cached = await readApiCache<T>(key);
  if (cached) {
    apply(cached);
    // refresh latar belakang — jangan blokir render utama
    fetcher()
      .then((fresh) => {
        apply(fresh);
        void writeApiCache(key, fresh);
      })
      .catch((e) =>
        console.warn(`[offlineCache] ${key} refresh gagal, pakai cache lokal:`, e),
      );
    return;
  }
  const fresh = await fetcher();
  apply(fresh);
  void writeApiCache(key, fresh);
}

// ============================================================================
// ASSET CACHE — Tauri Asset Protocol (convertFileSrc) atau fallback data URL
// ============================================================================

/**
 * Cache-first untuk aset: return streaming asset URL native (convertFileSrc) dari
 * cache disk lokal, atau download bila belum ada.
 * Menghemat memori RAM dan menghindari overhead Base64 IPC.
 */
export async function ensureAsset(url: string): Promise<string> {
  if (!url) throw new Error('ensureAsset: url kosong');
  // Jika sudah merupakan data URL, blob URL, atau asset streaming URL, langsung return
  if (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('asset:') ||
    url.startsWith('http://asset.localhost')
  ) {
    return url;
  }

  // 1. Cek apakah metadata aset sudah ada di SQLite
  const meta = await getAssetCacheMeta(url);
  if (meta) {
    try {
      const filePath = await invoke<string | null>('get_cached_asset_path', {
        cacheKey: meta.cache_key,
      });
      if (filePath) {
        return convertFileSrc(filePath);
      }
    } catch (e) {
      console.warn('[offlineCache] get_cached_asset_path gagal, coba fallback data URL:', e);
    }
    // Fallback: baca sebagai data URL jika get_cached_asset_path gagal
    const dataUrl = await invoke<string | null>('read_cached_asset', {
      cacheKey: meta.cache_key,
    });
    if (dataUrl) return dataUrl;
  }

  // 2. Download aset ke cache lokal
  const cacheKey = assetCacheKey(url);
  try {
    const savedAbsPath = await invoke<string>('download_asset_to_cache', {
      url,
      cacheKey,
    });
    if (savedAbsPath) {
      await setAssetCacheMeta(url, cacheKey, mimeFromUrl(url), 0);
      try {
        return convertFileSrc(savedAbsPath);
      } catch {
        const dataUrl = await invoke<string | null>('read_cached_asset', {
          cacheKey,
        });
        if (dataUrl) return dataUrl;
      }
    }
  } catch (e) {
    console.warn('[offlineCache] download aset gagal, fallback fetch langsung:', e);
  }

  // 3. Fallback terakhir: fetch langsung sebagai data URL via Rust reqwest
  return invoke<string>('fetch_image_as_data_url', { url });
}

function assetCacheKey(url: string): string {
  // hash sederhana (djb2) + ext dari path — cukup untuk unik & deterministik
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  const ext = (url.split('.').pop()?.split(/[?#]/)[0] || 'bin').toLowerCase();
  return `${h.toString(36)}.${ext}`;
}

function mimeFromUrl(url: string): string {
  const ext = url.split('.').pop()?.split(/[?#]/)[0]?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    webm: 'video/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}
