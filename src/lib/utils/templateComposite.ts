import type { BoothTemplate } from '$lib/api/boothClient';
import { invoke } from '@tauri-apps/api/core';
import QRCode from 'qrcode';

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
  qrCodeText?: string
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = template.width || 1200;
  canvas.height = template.height || 1800;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');

  // Clear canvas with white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Photo slots sorted strictly by capture order (order -> id -> 0)
  const photoSlots = (template.design_data || [])
    .filter((l) => !l.isBackground && !l.isQr)
    .sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : typeof a.id === 'number' ? a.id : 0;
      const orderB = typeof b.order === 'number' ? b.order : typeof b.id === 'number' ? b.id : 0;
      return orderA - orderB;
    });

  // Draw layers in ascending order of z-index / layer number (bottommost to topmost)
  const layersInDrawOrder = [...(template.design_data || [])].sort((a, b) => {
    const layerA = typeof a.layer === 'number' ? a.layer : 0;
    const layerB = typeof b.layer === 'number' ? b.layer : 0;
    return layerA - layerB;
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
          if (filterCss && filterCss !== 'none') {
            ctx.filter = filterCss;
          }
          drawCoverImage(ctx, photoImg, drawX, drawY, layerW, layerH);
          ctx.filter = 'none';
        }
      }
    }

    ctx.restore();
  }

  try {
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (e) {
    console.warn('Canvas toDataURL security error, using fallback photo:', e);
    return photos[0] || '';
  }
}
