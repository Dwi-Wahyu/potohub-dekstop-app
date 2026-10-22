import jsQR from 'jsqr';
import type { QrPoint, QrScanResult } from '$lib/types/qr';

/**
 * Mendeteksi QR Code dari sebuah canvas 2D.
 * Mengutamakan native BarcodeDetector API jika tersedia di browser/webview,
 * lalu fallback ke jsQR dengan pemeriksaan orientasi normal dan mirrored.
 */
export async function detectQrFromCanvas(canvas: HTMLCanvasElement): Promise<QrScanResult | null> {
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return null;

  // 1. Coba native BarcodeDetector API jika didukung oleh Chromium/WebKit
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      const barcodes = await detector.detect(canvas);
      if (barcodes && barcodes.length > 0) {
        const first = barcodes[0];
        const raw = first.rawValue || '';
        if (raw.trim()) {
          const pts: QrPoint[] = (first.cornerPoints || []).map((p: any) => ({
            x: Number(p.x),
            y: Number(p.y)
          }));
          return { content: raw.trim(), cornerPoints: pts };
        }
      }
    } catch {
      // Abaikan dan lanjutkan ke jsQR
    }
  }

  // 2. jsQR pada orientasi normal
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const code = jsQR(imgData.data, imgData.width, imgData.height, {
      inversionAttempts: 'attemptBoth'
    });

    if (code && code.data && code.data.trim()) {
      const loc = code.location;
      const pts: QrPoint[] = [
        { x: loc.topLeftCorner.x, y: loc.topLeftCorner.y },
        { x: loc.topRightCorner.x, y: loc.topRightCorner.y },
        { x: loc.bottomRightCorner.x, y: loc.bottomRightCorner.y },
        { x: loc.bottomLeftCorner.x, y: loc.bottomLeftCorner.y }
      ];
      return { content: code.data.trim(), cornerPoints: pts };
    }
  } catch (e) {
    console.warn('[detectQrFromCanvas] jsQR normal pass error:', e);
  }

  // 3. Jika kamera booth sedang di-mirror (scaleX(-1)), teks/QR pada frame fisik mungkin terbalik.
  // Coba scan versi flipped horizontal.
  try {
    const flipCanvas = document.createElement('canvas');
    flipCanvas.width = w;
    flipCanvas.height = h;
    const flipCtx = flipCanvas.getContext('2d', { willReadFrequently: true });
    if (flipCtx) {
      flipCtx.save();
      flipCtx.translate(w, 0);
      flipCtx.scale(-1, 1);
      flipCtx.drawImage(canvas, 0, 0);
      flipCtx.restore();

      const flipData = flipCtx.getImageData(0, 0, w, h);
      const flipCode = jsQR(flipData.data, flipData.width, flipData.height, {
        inversionAttempts: 'attemptBoth'
      });
      if (flipCode && flipCode.data && flipCode.data.trim()) {
        const loc = flipCode.location;
        const pts: QrPoint[] = [
          { x: w - loc.topLeftCorner.x, y: loc.topLeftCorner.y },
          { x: w - loc.topRightCorner.x, y: loc.topRightCorner.y },
          { x: w - loc.bottomRightCorner.x, y: loc.bottomRightCorner.y },
          { x: w - loc.bottomLeftCorner.x, y: loc.bottomLeftCorner.y }
        ];
        return { content: flipCode.data.trim(), cornerPoints: pts };
      }
    }
  } catch (e) {
    console.warn('[detectQrFromCanvas] jsQR mirrored pass error:', e);
  }

  return null;
}

/**
 * Mendeteksi QR Code dari URL gambar (Blob URL atau Data URL dari liveview frame kamera).
 */
export async function detectQrFromImageUrl(url: string): Promise<QrScanResult | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const res = await detectQrFromCanvas(canvas);
        resolve(res);
      } catch (err) {
        console.warn('[detectQrFromImageUrl] Error reading image canvas:', err);
        resolve(null);
      }
    };
    img.onerror = (e) => {
      console.warn('[detectQrFromImageUrl] Image load error:', e);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Mendeteksi QR Code dari elemen <video> (untuk kamera dalam mode webcam).
 */
export async function detectQrFromVideo(video: HTMLVideoElement): Promise<QrScanResult | null> {
  if (!video || video.readyState < 2) return null;
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  if (w === 0 || h === 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, w, h);
  return detectQrFromCanvas(canvas);
}
