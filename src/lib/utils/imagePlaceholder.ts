/**
 * Generates a low-resolution (24x24 px) Base64 JPEG blur placeholder Data URL
 * for progressive image loading in desktop app.
 */
export async function generateBlurPlaceholder(
  source: File | Blob | string,
  size = 24,
  quality = 0.25
): Promise<string> {
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
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          return reject(new Error('Canvas 2D context not available'));
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(img, 0, 0, size, size);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
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
