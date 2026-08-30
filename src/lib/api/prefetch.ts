import { fetchCategories, fetchTemplates } from './boothClient';
import { uiConfig } from '$lib/stores/uiConfig.svelte';
import { ensureAsset } from '$lib/utils/offlineCache';

function collectAssetUrls(): string[] {
  const urls: string[] = [];
  for (const s of uiConfig.config.stepStyles ?? []) {
    if (s.bgType === 'image' && s.bgValue) urls.push(s.bgValue);
  }
  // payment logos bila ada (logoUrl)
  for (const p of uiConfig.config.paymentMethods ?? []) {
    if (p.logoUrl) urls.push(p.logoUrl);
  }
  return urls;
}

/**
 * Kumpulkan semua URL aset booth (background step, banner kategori,
 * preview/frame template, layer desain) lalu download ke cache lokal
 * (app_cache_dir/assets). Dipanggil di background agar tidak memblokir render.
 */
export async function prefetchBoothAssets(boothId: string): Promise<void> {
  const [categories, templates] = await Promise.allSettled([
    fetchCategories(boothId),
    fetchTemplates(boothId),
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

  await Promise.allSettled([...urls].map((u) => ensureAsset(u)));
}
