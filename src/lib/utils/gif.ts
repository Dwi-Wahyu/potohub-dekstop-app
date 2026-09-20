import { invoke } from '@tauri-apps/api/core';
import { info, warn } from '@tauri-apps/plugin-log';

async function prepareGifFrame(
  url: string,
  targetW = 480,
  targetH = 720,
  mirrorHorizontal = false
): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Gagal inisialisasi context canvas 2D'));
          return;
        }

        if (mirrorHorizontal) {
          ctx.translate(targetW, 0);
          ctx.scale(-1, 1);
        }

        // Cover crop calculation
        const imgAspect = img.width / img.height;
        const targetAspect = targetW / targetH;
        let sx = 0;
        let sy = 0;
        let sw = img.width;
        let sh = img.height;
        if (imgAspect > targetAspect) {
          sw = img.height * targetAspect;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetAspect;
          sy = (img.height - sh) / 2;
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              reject(new Error('Canvas toBlob menghasilkan null'));
              return;
            }
            const buf = await blob.arrayBuffer();
            resolve(Array.from(new Uint8Array(buf)));
          },
          'image/jpeg',
          0.85
        );
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

export async function buildSessionGif(
  photoUrls: string[],
  frameDelayMs = 500,
  mirrorHorizontal = false
): Promise<Blob> {
  const photoBytes: number[][] = [];
  for (const url of photoUrls) {
    try {
      const bytes = await prepareGifFrame(url, 480, 720, mirrorHorizontal);
      photoBytes.push(bytes);
    } catch (e) {
      await warn(`[buildSessionGif] Gagal resize canvas, fallback direct fetch: ${String(e)}`).catch(() => {});
      const buf = await (await fetch(url)).arrayBuffer();
      photoBytes.push(Array.from(new Uint8Array(buf)));
    }
  }

  await info(
    `[buildSessionGif] Mengirim ${photoBytes.length} frame ke Rust encode_photos_to_gif (mirror=${mirrorHorizontal})`
  ).catch(() => {});
  const gifBytes = await invoke<number[]>('encode_photos_to_gif', {
    photos: photoBytes,
    frameDelayMs,
  });
  await info(
    `[buildSessionGif] Selesai encode GIF, ukuran=${gifBytes.length} bytes`
  ).catch(() => {});
  return new Blob([new Uint8Array(gifBytes)], { type: 'image/gif' });
}
