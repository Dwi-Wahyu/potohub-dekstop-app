import jsQR from 'jsqr';
import type { QrPoint, QrScanResult } from '$lib/types/qr';

/**
 * Helper untuk memetakan koordinat titik sudut jsQR kembali ke ukuran asli frame canvas.
 */
function mapQrResult(
  code: NonNullable<ReturnType<typeof jsQR>>,
  sourceW: number,
  sourceH: number,
  offsetX = 0,
  offsetY = 0,
  isMirrored = false
): QrScanResult {
  const loc = code.location;
  let pts: QrPoint[];

  if (!isMirrored) {
    pts = [
      { x: offsetX + loc.topLeftCorner.x, y: offsetY + loc.topLeftCorner.y },
      { x: offsetX + loc.topRightCorner.x, y: offsetY + loc.topRightCorner.y },
      { x: offsetX + loc.bottomRightCorner.x, y: offsetY + loc.bottomRightCorner.y },
      { x: offsetX + loc.bottomLeftCorner.x, y: offsetY + loc.bottomLeftCorner.y }
    ];
  } else {
    pts = [
      { x: sourceW - (offsetX + loc.topLeftCorner.x), y: offsetY + loc.topLeftCorner.y },
      { x: sourceW - (offsetX + loc.topRightCorner.x), y: offsetY + loc.topRightCorner.y },
      { x: sourceW - (offsetX + loc.bottomRightCorner.x), y: offsetY + loc.bottomRightCorner.y },
      { x: sourceW - (offsetX + loc.bottomLeftCorner.x), y: offsetY + loc.bottomLeftCorner.y }
    ];
  }

  return {
    content: code.data.trim(),
    cornerPoints: pts,
    sourceWidth: sourceW,
    sourceHeight: sourceH
  };
}

/**
 * Mendeteksi QR Code dari sebuah canvas 2D.
 * Dilengkapi dengan Anti-Glare & Screen Bloom Filter untuk mengatasi pantulan lampu
 * dan backlight layar HP yang overexposed pada kamera DSLR/Mirrorless.
 *
 * Alur pemeriksaan multi-pass:
 * 1. Native BarcodeDetector API (jika didukung webview)
 * 2. jsQR Normal Full Frame
 * 3. jsQR Center ROI (65% area tengah)
 * 4. jsQR Center ROI + Anti-Glare Gamma Compression (gamma ~2.3 - memulihkan modul QR yang silau)
 * 5. jsQR Center ROI + Aggressive Anti-Glare (gamma ~2.8)
 * 6. jsQR Center ROI + Contrast Stretch (memperbaiki layar HP yang washed out)
 * 7. jsQR Full Frame + Anti-Glare Gamma Compression
 * 8. Mirrored / Flipped Horizontal (Normal & Anti-Glare)
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
      // Abaikan dan lanjutkan ke pipeline jsQR
    }
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  let fullImgData: ImageData | null = null;
  try {
    fullImgData = ctx.getImageData(0, 0, w, h);
  } catch (e) {
    console.warn('[detectQrFromCanvas] Gagal mengambil getImageData:', e);
    return null;
  }

  const rawPixels = fullImgData.data;

  // 2. jsQR pada orientasi normal (Full frame standar)
  try {
    const code = jsQR(rawPixels, w, h, { inversionAttempts: 'attemptBoth' });
    if (code && code.data && code.data.trim()) {
      return mapQrResult(code, w, h, 0, 0, false);
    }
  } catch (e) {
    console.warn('[detectQrFromCanvas] jsQR normal pass error:', e);
  }

  // 3. Multi-Pass Center ROI & Anti-Glare Preprocessing
  // Layar HP biasanya diarahkan ke tengah frame. Membatasi scanning ke 65% area tengah
  // mengisolasi layar HP dari bayangan atau lighting background ruangan booth.
  if (w > 160 && h > 160) {
    const cropW = Math.round(w * 0.65);
    const cropH = Math.round(h * 0.65);
    const cropX = Math.round((w - cropW) / 2);
    const cropY = Math.round((h - cropH) / 2);
    const roiPixelCount = cropW * cropH;

    const roiRaw = new Uint8ClampedArray(roiPixelCount * 4);
    const roiGrays = new Uint8Array(roiPixelCount);
    let minGray = 255;
    let maxGray = 0;

    for (let y = 0; y < cropH; y++) {
      const srcRowOffset = (cropY + y) * w;
      const dstRowOffset = y * cropW;
      for (let x = 0; x < cropW; x++) {
        const srcIdx = (srcRowOffset + (cropX + x)) * 4;
        const dstIdx = (dstRowOffset + x) * 4;

        const r = rawPixels[srcIdx];
        const g = rawPixels[srcIdx + 1];
        const b = rawPixels[srcIdx + 2];

        roiRaw[dstIdx] = r;
        roiRaw[dstIdx + 1] = g;
        roiRaw[dstIdx + 2] = b;
        roiRaw[dstIdx + 3] = 255;

        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        roiGrays[dstRowOffset + x] = gray;

        if (gray < minGray) minGray = gray;
        if (gray > maxGray) maxGray = gray;
      }
    }

    // 3a. Center ROI Raw
    try {
      const codeRoi = jsQR(roiRaw, cropW, cropH, { inversionAttempts: 'attemptBoth' });
      if (codeRoi && codeRoi.data && codeRoi.data.trim()) {
        return mapQrResult(codeRoi, w, h, cropX, cropY, false);
      }
    } catch {}

    // 3b. Center ROI + Anti-Glare Gamma Compression (Gamma = 2.3)
    // Gamma > 1 mengkompresi highlight/glare putih layar HP dan memperlebar kontras modul hitam
    const roiGamma = new Uint8ClampedArray(roiPixelCount * 4);
    for (let i = 0; i < roiPixelCount; i++) {
      const g = roiGrays[i];
      const val = Math.min(255, Math.max(0, Math.round(Math.pow(g / 255, 2.3) * 255)));
      const idx = i * 4;
      roiGamma[idx] = val;
      roiGamma[idx + 1] = val;
      roiGamma[idx + 2] = val;
      roiGamma[idx + 3] = 255;
    }

    try {
      const codeGamma = jsQR(roiGamma, cropW, cropH, { inversionAttempts: 'attemptBoth' });
      if (codeGamma && codeGamma.data && codeGamma.data.trim()) {
        return mapQrResult(codeGamma, w, h, cropX, cropY, false);
      }
    } catch {}

    // 3c. Center ROI + Aggressive Anti-Glare (Gamma = 2.8) untuk glare lampu kuat
    for (let i = 0; i < roiPixelCount; i++) {
      const g = roiGrays[i];
      const val = Math.min(255, Math.max(0, Math.round(Math.pow(g / 255, 2.8) * 255)));
      const idx = i * 4;
      roiGamma[idx] = val;
      roiGamma[idx + 1] = val;
      roiGamma[idx + 2] = val;
      roiGamma[idx + 3] = 255;
    }

    try {
      const codeAggressive = jsQR(roiGamma, cropW, cropH, { inversionAttempts: 'attemptBoth' });
      if (codeAggressive && codeAggressive.data && codeAggressive.data.trim()) {
        return mapQrResult(codeAggressive, w, h, cropX, cropY, false);
      }
    } catch {}

    // 3d. Center ROI + Contrast Stretching (jika layar HP redup / washed out)
    if (maxGray - minGray > 20 && (minGray > 25 || maxGray < 230)) {
      const roiStretched = new Uint8ClampedArray(roiPixelCount * 4);
      const span = (maxGray - minGray) || 1;
      for (let i = 0; i < roiPixelCount; i++) {
        const val = Math.min(255, Math.max(0, Math.round(((roiGrays[i] - minGray) / span) * 255)));
        const idx = i * 4;
        roiStretched[idx] = val;
        roiStretched[idx + 1] = val;
        roiStretched[idx + 2] = val;
        roiStretched[idx + 3] = 255;
      }

      try {
        const codeStretched = jsQR(roiStretched, cropW, cropH, { inversionAttempts: 'attemptBoth' });
        if (codeStretched && codeStretched.data && codeStretched.data.trim()) {
          return mapQrResult(codeStretched, w, h, cropX, cropY, false);
        }
      } catch {}
    }
  }

  // 4. Anti-Glare Gamma Compression pada Full Frame (jika tiket berada di luar area tengah)
  try {
    const fullGamma = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < rawPixels.length; i += 4) {
      const g = 0.299 * rawPixels[i] + 0.587 * rawPixels[i + 1] + 0.114 * rawPixels[i + 2];
      const val = Math.min(255, Math.max(0, Math.round(Math.pow(g / 255, 2.3) * 255)));
      fullGamma[i] = val;
      fullGamma[i + 1] = val;
      fullGamma[i + 2] = val;
      fullGamma[i + 3] = 255;
    }
    const codeFullGamma = jsQR(fullGamma, w, h, { inversionAttempts: 'attemptBoth' });
    if (codeFullGamma && codeFullGamma.data && codeFullGamma.data.trim()) {
      return mapQrResult(codeFullGamma, w, h, 0, 0, false);
    }
  } catch {}

  // 5. Cek orientasi flipped horizontal (jika kamera di-mirror)
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
        return mapQrResult(flipCode, w, h, 0, 0, true);
      }

      // Flipped horizontal + Anti-Glare Gamma pass
      const flipGamma = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < flipData.data.length; i += 4) {
        const g = 0.299 * flipData.data[i] + 0.587 * flipData.data[i + 1] + 0.114 * flipData.data[i + 2];
        const val = Math.min(255, Math.max(0, Math.round(Math.pow(g / 255, 2.3) * 255)));
        flipGamma[i] = val;
        flipGamma[i + 1] = val;
        flipGamma[i + 2] = val;
        flipGamma[i + 3] = 255;
      }
      const flipCodeGamma = jsQR(flipGamma, w, h, { inversionAttempts: 'attemptBoth' });
      if (flipCodeGamma && flipCodeGamma.data && flipCodeGamma.data.trim()) {
        return mapQrResult(flipCodeGamma, w, h, 0, 0, true);
      }
    }
  } catch (e) {
    console.warn('[detectQrFromCanvas] jsQR mirrored pass error:', e);
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
