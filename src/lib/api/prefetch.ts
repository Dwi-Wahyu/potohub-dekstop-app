import { fetchCategories, fetchTemplates, fetchBanners, fetchEmots } from './boothClient';
import { uiConfig } from '$lib/stores/uiConfig.svelte';
import { ensureAsset, writeApiCache } from '$lib/utils/offlineCache';

function collectAssetUrls(): string[] {
  const urls: string[] = [];
  for (const s of uiConfig.config.stepStyles ?? []) {
    if (s.bgType === 'image' && s.bgValue) urls.push(s.bgValue);
  }
  if (uiConfig.config.tutorialImageUrl) {
    urls.push(uiConfig.config.tutorialImageUrl);
  }
  // payment logos bila ada (logoUrl)
  for (const p of uiConfig.config.paymentMethods ?? []) {
    if (p.logoUrl) urls.push(p.logoUrl);
  }
  return urls;
}

/**
 * Kumpulkan semua URL aset booth (background step, tutorial image, banner kategori,
 * preview/frame template, layer desain, promo banner, stiker/emot gambar) lalu download ke cache lokal
 * (app_cache_dir/assets). Dipanggil di background agar tidak memblokir render.
 */
export async function prefetchBoothAssets(boothId: string): Promise<void> {
  const [categories, templates, banners, emots] = await Promise.allSettled([
    fetchCategories(boothId),
    fetchTemplates(boothId),
    fetchBanners(boothId),
    fetchEmots(boothId),
  ]);

  const urls = new Set<string>(collectAssetUrls());
  if (categories.status === 'fulfilled') {
    for (const c of categories.value) if (c.banner_url) urls.add(c.banner_url);
  }
  if (templates.status === 'fulfilled') {
    for (const t of templates.value) {
      if (t.preview_image_url) urls.add(t.preview_image_url);
      if (t.frame_image_url) urls.add(t.frame_image_url);
      for (const layer of t.design_data ?? []) {
        if (layer.imageUrl) urls.add(layer.imageUrl);
      }
    }
  }
  if (banners.status === 'fulfilled') {
    void writeApiCache(`banners:${boothId}`, banners.value);
    for (const b of banners.value) {
      if (b.image_url) urls.add(b.image_url);
    }
  }
  if (emots.status === 'fulfilled') {
    void writeApiCache(`emots:${boothId}`, emots.value);
    for (const e of emots.value) {
      if (e.emot_type === 'image' && e.file_url) urls.add(e.file_url);
    }
  }

  await Promise.allSettled(
    [...urls].map(async (u) => {
      try {
        const dataUrl = await ensureAsset(u);
        if (dataUrl) {
          uiConfig.setResolvedBackground(u, dataUrl);
        }
      } catch (err) {
        console.warn('[prefetchBoothAssets] Gagal download aset ke cache lokal:', u, err);
      }
    })
  );
}
