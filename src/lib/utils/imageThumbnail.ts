/**
 * Menghasilkan thumbnail JPEG terkompresi (~30-45 KB) dari foto mentah
 * untuk galeri dashboard admin agar hemat memori dan bandwidth bucket Cloudflare,
 * tanpa mengubah resolusi asli foto mentah yang diunduh oleh customer.
 */
export async function generateThumbnailBlob(
  source: File | Blob | string,
  maxWidth = 480,
  quality = 0.75
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    let objectUrl: string | null = null;
    if (typeof source === 'string') {
      img.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    }

    img.onload = () => {
      try {
        const originalWidth = img.naturalWidth || img.width;
        const originalHeight = img.naturalHeight || img.height;

        let targetWidth = originalWidth;
        let targetHeight = originalHeight;

        if (originalWidth > maxWidth) {
          targetWidth = maxWidth;
          targetHeight = Math.round((originalHeight * maxWidth) / originalWidth);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          return reject(new Error('Canvas 2D context tidak tersedia'));
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        canvas.toBlob(
          (blob) => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            if (blob) {
              resolve({ blob, width: targetWidth, height: targetHeight });
            } else {
              reject(new Error('Gagal mengonversi canvas ke blob thumbnail'));
            }
          },
          'image/jpeg',
          quality
        );
      } catch (err) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = (err) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(err);
    };
  });
}
