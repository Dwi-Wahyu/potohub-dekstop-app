import { invoke } from '@tauri-apps/api/core';
import { info, warn } from '@tauri-apps/plugin-log';

export interface GifFrameResult {
  bytes: number[];
  width: number;
  height: number;
}

export interface SessionGifResult {
  blob: Blob;
  width: number;
  height: number;
}

async function prepareGifFrame(
  url: string,
  targetDimensions?: { width: number; height: number },
  mirrorHorizontal = false,
  maxDimension = 720
): Promise<GifFrameResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const naturalW = img.naturalWidth || img.width;
        const naturalH = img.naturalHeight || img.height;

        if (!naturalW || !naturalH) {
          reject(new Error('Ukuran gambar tidak valid'));
          return;
        }

        let targetW: number;
        let targetH: number;

        if (targetDimensions) {
          targetW = targetDimensions.width;
          targetH = targetDimensions.height;
        } else {
          // Menjaga aspect ratio asli 100% tanpa crop (cover crop dihilangkan)
          if (naturalW >= naturalH) {
            targetW = Math.min(naturalW, maxDimension);
            targetH = Math.round((naturalH * targetW) / naturalW);
          } else {
            targetH = Math.min(naturalH, maxDimension);
            targetW = Math.round((naturalW * targetH) / naturalH);
          }

          // Pastikan dimensi bernilai genap untuk kompatibilitas encoder
          targetW = Math.max(2, Math.floor(targetW / 2) * 2);
          targetH = Math.max(2, Math.floor(targetH / 2) * 2);
        }

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

        // Gambar seluruh foto ke canvas secara proporsional tanpa crop
        ctx.drawImage(img, 0, 0, targetW, targetH);

        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              reject(new Error('Canvas toBlob menghasilkan null'));
              return;
            }
            const buf = await blob.arrayBuffer();
            resolve({
              bytes: Array.from(new Uint8Array(buf)),
              width: targetW,
              height: targetH,
            });
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
  mirrorHorizontal = false,
  maxDimension = 720
): Promise<SessionGifResult> {
  if (photoUrls.length === 0) {
    throw new Error('Daftar foto kosong untuk pembuatan GIF');
  }

  const photoBytes: number[][] = [];
  let uniformDims: { width: number; height: number } | undefined;

  for (let i = 0; i < photoUrls.length; i++) {
    const url = photoUrls[i];
    try {
      const frameResult = await prepareGifFrame(
        url,
        uniformDims,
        mirrorHorizontal,
        maxDimension
      );
      if (!uniformDims) {
        uniformDims = { width: frameResult.width, height: frameResult.height };
      }
      photoBytes.push(frameResult.bytes);
    } catch (e) {
      await warn(`[buildSessionGif] Gagal resize canvas frame ${i + 1}, fallback direct fetch: ${String(e)}`).catch(() => {});
      const buf = await (await fetch(url)).arrayBuffer();
      photoBytes.push(Array.from(new Uint8Array(buf)));
    }
  }

  const finalW = uniformDims?.width || 720;
  const finalH = uniformDims?.height || 480;

  await info(
    `[buildSessionGif] Mengirim ${photoBytes.length} frame (${finalW}x${finalH}, mirror=${mirrorHorizontal}) ke Rust encode_photos_to_gif`
  ).catch(() => {});

  const gifBytes = await invoke<number[]>('encode_photos_to_gif', {
    photos: photoBytes,
    frameDelayMs,
  });

  await info(
    `[buildSessionGif] Selesai encode GIF, ukuran=${gifBytes.length} bytes (${finalW}x${finalH})`
  ).catch(() => {});

  const blob = new Blob([new Uint8Array(gifBytes)], { type: 'image/gif' });
  return {
    blob,
    width: finalW,
    height: finalH,
  };
}
