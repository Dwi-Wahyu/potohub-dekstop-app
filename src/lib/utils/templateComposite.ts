import type { BoothTemplate } from '$lib/api/boothClient';
import { boothFlow } from '$lib/stores/booth.svelte';
import { boothConfig } from '$lib/stores/boothConfig.svelte';
import type { Sticker } from '$lib/utils/stickers';
import { resolveFilterCss, applyFilterToCanvas } from '$lib/utils/filters';
import { invoke } from '@tauri-apps/api/core';
import QRCode from 'qrcode';

export interface TemplateDesignLayer {
  id?: number;
  order?: number;
  layer?: number;
  isBackground?: boolean;
  isQr?: boolean;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rot?: number;
  imageUrl?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Mengurutkan layer foto (bukan background, bukan QR) berdasarkan atribut `order`
 * yang di-assign admin di dashboard. Fallback ke `id` jika `order` tidak ada.
 * SATU-SATUNYA sumber kebenaran untuk urutan pengisian foto ke slot template —
 * jangan buat logic sorting duplikat di komponen lain, selalu import fungsi ini.
 */
export function getSortedPhotoSlots<T extends TemplateDesignLayer>(
  designData: T[] | null | undefined
): T[] {
  return (designData || [])
    .filter((l) => !l.isBackground && !l.isQr)
    .sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : typeof a.id === 'number' ? a.id : 0;
      const orderB = typeof b.order === 'number' ? b.order : typeof b.id === 'number' ? b.id : 0;
      return orderA - orderB;
    });
}

/**
 * Normalizes layers for a template:
 * 1. Clones design_data array or empty array.
 * 2. Synthesizes background layer covering full canvas if frame_image_url exists and no isBackground layer is present
 *    (matching admin-dashboard/src/pages/TemplateFramePage.svelte line 221-239).
 * 3. If no layer has an explicit numeric `layer` attribute, ensures background layers are at index 0
 *    (matching admin-dashboard's ensureBackgroundAtTop).
 */
export function getTemplateLayers<T extends TemplateDesignLayer = TemplateDesignLayer>(
  template: BoothTemplate | null | undefined
): T[] {
  if (!template) return [];

  const rawLayers: T[] = Array.isArray(template.design_data)
    ? [...(template.design_data as T[])]
    : [];

  const canvasWidth = template.width || 1200;
  const canvasHeight = template.height || 1800;
  const frameUrl = template.frame_image_url;

  const hasBg = rawLayers.some((l) => l.isBackground);
  if (frameUrl && !hasBg) {
    let maxId = 0;
    for (const l of rawLayers) {
      if (typeof l.id === 'number') maxId = Math.max(maxId, l.id);
    }
    const bgLayer = {
      id: maxId + 1 || 9999,
      name: 'Frame Background',
      x: 0,
      y: 0,
      w: canvasWidth,
      h: canvasHeight,
      rot: 0,
      visible: true,
      locked: false,
      isBackground: true,
      imageUrl: frameUrl,
    } as unknown as T;
    rawLayers.unshift(bgLayer);
  }

  const hasExplicitLayer = rawLayers.some(
    (l) => typeof l.layer === 'number' && !isNaN(l.layer)
  );

  if (!hasExplicitLayer) {
    const bgLayers = rawLayers.filter((l) => l.isBackground);
    const nonBgLayers = rawLayers.filter((l) => !l.isBackground);
    return [...bgLayers, ...nonBgLayers];
  }

  return rawLayers;
}

/**
 * Calculates the z-index (stacking order) of a layer:
 * - If layers have explicit numeric `layer` attribute (from API seed / JSON):
 *   `layer.layer` directly represents the z-index (higher number = drawn on top / higher z-index).
 *   If a layer lacks `layer`, background gets max + 1, non-background gets 0.
 * - If no layers have explicit `layer` (e.g. from admin-dashboard):
 *   Layers are ordered top-to-bottom where index 0 is topmost (e.g. Frame Background).
 *   Matches admin-dashboard line 1082: layers.length - findIndex
 */
export function getLayerZIndex(
  layer: TemplateDesignLayer,
  allLayers: TemplateDesignLayer[]
): number {
  const hasExplicitLayer = allLayers.some(
    (l) => typeof l.layer === 'number' && !isNaN(l.layer)
  );

  if (hasExplicitLayer) {
    if (typeof layer.layer === 'number' && !isNaN(layer.layer)) {
      return Number(layer.layer);
    }
    const maxLayer = Math.max(
      ...allLayers
        .filter((l) => typeof l.layer === 'number' && !isNaN(l.layer))
        .map((l) => Number(l.layer)),
      0
    );
    if (layer.isBackground) {
      return maxLayer + 1;
    }
    return 0;
  }

  const idx = allLayers.findIndex((l) => (layer.id != null && l.id === layer.id) || l === layer);
  if (idx >= 0) {
    return allLayers.length - idx;
  }
  return layer.isBackground ? allLayers.length + 1 : 1;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return null;

  // 1. If already data URL or blob URL, load directly
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // 2. In Tauri environment: fetch image bytes natively via Rust to completely bypass CORS, WebKit CSP, or canvas tainting
  try {
    const dataUrl = await invoke<string>('fetch_image_as_data_url', { url: src });
    if (dataUrl && dataUrl.startsWith('data:')) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });
    }
  } catch (err) {
    // Invoke error (e.g. running in pure browser environment) - fall back to browser fetch
  }

  // 3. Fallback: load via fetch Blob URL
  try {
    const res = await fetch(src);
    if (res.ok) {
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = blobUrl;
      });
    }
  } catch (err) {
    console.warn('Fetch blob failed for image:', src, err);
  }

  // 4. Fallback: load directly via Image element with anonymous crossOrigin
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.width / img.height;
  const targetRatio = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;

  if (imgRatio > targetRatio) {
    sw = img.height * targetRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / targetRatio;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export async function compositeTemplateImage(
  template: BoothTemplate,
  photos: string[],
  filterCss?: string,
  qrCodeText?: string,
  stickers: Sticker[] = boothFlow.stickers
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = template.width || 1200;
  canvas.height = template.height || 1800;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');

  // Clear canvas with white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const allLayers = getTemplateLayers(template);

  // Photo slots sorted strictly by capture order (order -> id -> 0)
  const photoSlots = getSortedPhotoSlots(allLayers);
  const effectiveFilter = resolveFilterCss(filterCss);

  // Draw layers in ascending order of z-index (bottommost to topmost)
  const layersInDrawOrder = [...allLayers].sort((a, b) => {
    return getLayerZIndex(a, allLayers) - getLayerZIndex(b, allLayers);
  });

  for (const layer of layersInDrawOrder) {
    ctx.save();

    const layerX = layer.x || 0;
    const layerY = layer.y || 0;
    const layerW = layer.w || canvas.width;
    const layerH = layer.h || canvas.height;
    const rot = layer.rot || 0;

    const centerX = layerX + layerW / 2;
    const centerY = layerY + layerH / 2;

    ctx.translate(centerX, centerY);
    if (rot) {
      ctx.rotate((rot * Math.PI) / 180);
    }

    const drawX = -layerW / 2;
    const drawY = -layerH / 2;

    if (layer.isBackground) {
      const bgUrl = layer.imageUrl || template.frame_image_url;
      if (bgUrl) {
        const bgImg = await loadImage(bgUrl);
        if (bgImg) {
          ctx.drawImage(bgImg, drawX, drawY, layerW, layerH);
        }
      }
    } else if (layer.isQr) {
      // Draw QR Code slot
      if (qrCodeText) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qrCodeText, { margin: 1, width: Math.round(layerW) });
          const qrImg = await loadImage(qrDataUrl);
          if (qrImg) {
            ctx.drawImage(qrImg, drawX, drawY, layerW, layerH);
          }
        } catch (e) {
          console.warn('Failed to draw QR code on canvas:', e);
        }
      }
    } else {
      // Photo slot - accurately mapped to corresponding camera photo
      const slotIdx = photoSlots.findIndex((s) => s.id === layer.id || (s.x === layer.x && s.y === layer.y));
      const targetIdx = slotIdx >= 0 ? slotIdx : 0;
      const photoSrc = photos[targetIdx] || photos[0];

      if (photoSrc) {
        const photoImg = await loadImage(photoSrc);
        if (photoImg) {
          const slotW = Math.max(1, Math.round(layerW));
          const slotH = Math.max(1, Math.round(layerH));
          const slotCanvas = document.createElement('canvas');
          slotCanvas.width = slotW;
          slotCanvas.height = slotH;
          const slotCtx = slotCanvas.getContext('2d');
          if (slotCtx) {
            if (boothConfig.config.mirrorOn) {
              slotCtx.translate(slotW, 0);
              slotCtx.scale(-1, 1);
            }
            if (boothConfig.config.flipVertical) {
              slotCtx.translate(0, slotH);
              slotCtx.scale(1, -1);
            }
            drawCoverImage(slotCtx, photoImg, 0, 0, slotW, slotH);
            if (effectiveFilter && effectiveFilter !== 'none') {
              try {
                slotCtx.filter = effectiveFilter;
                drawCoverImage(slotCtx, photoImg, 0, 0, slotW, slotH);
              } catch {}
            }
            applyFilterToCanvas(slotCtx, slotW, slotH, filterCss);
            ctx.drawImage(slotCanvas, drawX, drawY, layerW, layerH);
          } else {
            drawCoverImage(ctx, photoImg, drawX, drawY, layerW, layerH);
          }
        }
      }
    }

    ctx.restore();
  }

  // Draw user chosen stickers on top of the composited canvas
  if (stickers && stickers.length > 0) {
    for (const s of stickers) {
      ctx.save();
      const cx = (s.x / 100) * canvas.width;
      const cy = (s.y / 100) * canvas.height;

      if (s.type === 'image' && s.imageUrl) {
        const img = await loadImage(s.imageUrl);
        if (img) {
          const baseWidth = s.width || 64;
          const targetW = (baseWidth / 400) * canvas.width;
          const targetH = s.height ? (s.height / 400) * canvas.height : (img.height / img.width) * targetW;

          ctx.translate(cx, cy);
          if (s.rotation) {
            ctx.rotate((s.rotation * Math.PI) / 180);
          }
          ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
        }
      } else if (s.emoji) {
        ctx.translate(cx, cy);
        if (s.rotation) {
          ctx.rotate((s.rotation * Math.PI) / 180);
        }
        const fontSize = Math.round((32 / 400) * canvas.width);
        ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.emoji, 0, 0);
      }
      ctx.restore();
    }
  }

  try {
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (e) {
    console.warn('Canvas toDataURL security error, using fallback photo:', e);
    return photos[0] || '';
  }
}
