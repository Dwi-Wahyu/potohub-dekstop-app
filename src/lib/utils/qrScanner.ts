import jsQR from 'jsqr';
import type { QrPoint, QrScanResult } from '$lib/types/qr';

/**
 * Mendeteksi QR Code dari sebuah canvas 2D.
 * Mengutamakan native BarcodeDetector API jika tersedia di browser/webview,
 * lalu fallback ke jsQR dengan pemeriksaan:
 * 1. Orientasi normal
 * 2. Orientasi horizontal mirrored
 * 3. Crop area tengah (Center Region of Interest / ROI)
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
          return { content: raw.trim(), cornerPoints: pts, sourceWidth: w, sourceHeight: h };
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
      return { content: code.data.trim(), cornerPoints: pts, sourceWidth: w, sourceHeight: h };
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
        return { content: flipCode.data.trim(), cornerPoints: pts, sourceWidth: w, sourceHeight: h };
      }
    }
  } catch (e) {
    console.warn('[detectQrFromCanvas] jsQR mirrored pass error:', e);
  }

  // 4. Center ROI crop pass (65% tengah frame)
  // Membantu mengatasi noise lampu studio di pinggir frame atau gradien kontras latar belakang
  if (w > 200 && h > 200) {
    try {
      const cropW = Math.round(w * 0.65);
      const cropH = Math.round(h * 0.65);
      const cropX = Math.round((w - cropW) / 2);
      const cropY = Math.round((h - cropH) / 2);

      const roiCanvas = document.createElement('canvas');
      roiCanvas.width = cropW;
      roiCanvas.height = cropH;
      const roiCtx = roiCanvas.getContext('2d', { willReadFrequently: true });
      if (roiCtx) {
        roiCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        const roiData = roiCtx.getImageData(0, 0, cropW, cropH);
        const roiCode = jsQR(roiData.data, roiData.width, roiData.height, {
          inversionAttempts: 'attemptBoth'
        });
        if (roiCode && roiCode.data && roiCode.data.trim()) {
          const loc = roiCode.location;
          const pts: QrPoint[] = [
            { x: cropX + loc.topLeftCorner.x, y: cropY + loc.topLeftCorner.y },
            { x: cropX + loc.topRightCorner.x, y: cropY + loc.topRightCorner.y },
            { x: cropX + loc.bottomRightCorner.x, y: cropY + loc.bottomRightCorner.y },
            { x: cropX + loc.bottomLeftCorner.x, y: cropY + loc.bottomLeftCorner.y }
          ];
          return { content: roiCode.data.trim(), cornerPoints: pts, sourceWidth: w, sourceHeight: h };
        }
      }
    } catch (e) {
      console.warn('[detectQrFromCanvas] jsQR center ROI pass error:', e);
    }
  }

  return null;
}

/**
 * Mendeteksi QR Code langsung dari elemen <img> yang sudah dimuat di DOM.
 * Sangat cepat (0ms network) dan kebal terhadap pencabutan Blob URL.
 */
export async function detectQrFromImageElement(img: HTMLImageElement): Promise<QrScanResult | null> {
  if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) return null;
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, w, h);
  return detectQrFromCanvas(canvas);
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
