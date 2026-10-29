import { invoke } from '@tauri-apps/api/core';
import { info, warn, error } from '@tauri-apps/plugin-log';
import { boothFlow } from '$lib/stores/booth.svelte';
import { boothConfig } from '$lib/stores/boothConfig.svelte';
import { uiConfig } from '$lib/stores/uiConfig.svelte';
import { uploadGalleryAsset, uploadSessionMedia, isValidUUID, type BoothTemplate } from '$lib/api/boothClient';
import { generateBlurPlaceholder } from './imagePlaceholder';
import { buildSessionGif } from './gif';
import { saveLocalSessionAssets, saveInitialSessionPhotos } from './localSessionStorage';
import {
  compositeTemplateVideoOverlay,
  getSortedPhotoSlots,
  getTemplateLayers
} from './templateComposite';

export interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SaveSessionAssetsResult {
  compositeUrl: string | null;
  gifUrl: string | null;
  videoUrl: string | null;
  gifBlob: Blob | null;
  compositeVideoBlob: Blob | null;
  compositeUploaded: boolean;
  rawPhotosUploaded: number;
  lastUploadError: string | null;
}

/**
 * Menerapkan orientasi horizontal mirror / flip vertical pada foto capture
 * agar foto mentah yang dikirim ke bucket cloudflare dan disimpan lokal
 * konsisten dengan pilihan customer dan tampilan viewfinder.
 */
export async function applyPhotoOrientation(
  photoUrl: string,
  mirrorOn: boolean = false,
  flipVertical: boolean = false
): Promise<Blob> {
  if (!mirrorOn && !flipVertical) {
    const res = await fetch(photoUrl);
    return await res.blob();
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        fetch(photoUrl).then((r) => r.blob()).then(resolve);
        return;
      }

      if (mirrorOn) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      if (flipVertical) {
        ctx.translate(0, h);
        ctx.scale(1, -1);
      }

      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else fetch(photoUrl).then((r) => r.blob()).then(resolve);
        },
        'image/jpeg',
        0.95
      );
    };
    img.onerror = () => {
      fetch(photoUrl).then((r) => r.blob()).then(resolve);
    };
    img.src = photoUrl;
  });
}

export async function saveSessionAssets(
  boothId: string,
  sessionId: string,
  compositeUrl: string | null,
  templateWidth: number,
  templateHeight: number,
  slotRects: SlotRect[],
  backgroundUrl?: string | null,
  photosSnapshot: string[] = [...boothFlow.photosTaken],
  clipsSnapshot: (string | null)[] = [...boothFlow.liveviewClips],
  sessionCodeSnapshot: string | null = boothFlow.sessionCode,
  template?: BoothTemplate | null,
  softfileUrl?: string | null
): Promise<SaveSessionAssetsResult> {
  // Snapshot imutabel di awal agar kebal terhadap boothFlow.reset() saat user klik selesai
  const photos = photosSnapshot.length > 0 ? [...photosSnapshot] : [...boothFlow.photosTaken];
  const validClips = (clipsSnapshot.length > 0 ? clipsSnapshot : boothFlow.liveviewClips).filter(
    (c): c is string => !!c
  );
  const sessionCode = sessionCodeSnapshot || boothFlow.sessionCode || sessionId || `session-${Date.now()}`;
  const isMirrored = boothConfig.config.mirrorOn ?? false;
  const isFlipVertical = boothConfig.config.flipVertical ?? false;
  const canUploadOnline = isValidUUID(boothId) && isValidUUID(sessionId);

  await info(
    `[saveSessionAssets] mulai boothId=${boothId} sessionId=${sessionId} canUploadOnline=${canUploadOnline} photos=${photos.length} clips=${validClips.length} hasComposite=${!!compositeUrl} mirrorOn=${isMirrored}`
  ).catch(() => {});

  let gifBlob: Blob | null = null;
  let compositeVideoBlob: Blob | null = null;
  let compositeUploaded = false;
  let rawPhotosUploaded = 0;
  let lastUploadError: string | null = canUploadOnline
    ? null
    : `Session ID belum terdaftar di server (${sessionId || 'kosong'})`;

  // 1. Upload Composite Strip Foto terlebih dahulu agar customer segera dapat QR/Softfile
  if (compositeUrl && canUploadOnline) {
    try {
      await uploadGalleryAsset(
        boothId,
        sessionId,
        'photo',
        compositeUrl,
        'jpg',
        'image/jpeg',
        templateWidth,
        templateHeight
      );
      compositeUploaded = true;
      await info('[saveSessionAssets] Sukses upload composite strip foto').catch(() => {});
    } catch (e) {
      lastUploadError = String(e);
      await error(`[saveSessionAssets] Gagal upload composite strip: ${String(e)}`).catch(() => {});
    }
  } else if (!compositeUrl) {
    lastUploadError = 'Composite strip foto gagal dibuat';
  }

  // Siapkan foto-foto mentah dengan orientasi yang konsisten (mirrorOn & flipVertical)
  const processedPhotoBlobs: Blob[] = [];
  const processedPhotoUrls: string[] = [];

  for (let i = 0; i < photos.length; i++) {
    try {
      const blob = await applyPhotoOrientation(photos[i], isMirrored, isFlipVertical);
      processedPhotoBlobs.push(blob);
      processedPhotoUrls.push(URL.createObjectURL(blob));
    } catch (e) {
      await warn(`[saveSessionAssets] Gagal proses orientasi foto slot ${i + 1}: ${String(e)}`).catch(() => {});
      // Fallback ke foto original
      const fallbackBlob = await (await fetch(photos[i])).blob();
      processedPhotoBlobs.push(fallbackBlob);
      processedPhotoUrls.push(photos[i]);
    }
  }

  // Simpan foto mentah & strip foto ke lokal seawal mungkin (< 1 detik) ke disk Windows
  void saveInitialSessionPhotos(
    uiConfig.config.boothName,
    sessionCode,
    compositeUrl,
    processedPhotoBlobs.length > 0 ? processedPhotoBlobs : photos
  ).catch((e) => warn(`[saveSessionAssets] Gagal simpan foto awal ke disk: ${String(e)}`));

  // 2. Mulai pembuatan GIF lokal secara paralel agar user segera bisa preview
  let gifPromise: Promise<{ blob: Blob; width: number; height: number } | null> = Promise.resolve(null);
  if (boothConfig.config.enableSessionGif && processedPhotoUrls.length > 0) {
    boothFlow.isGeneratingGif = true;
    gifPromise = (async () => {
      try {
        const gifResult = await buildSessionGif(processedPhotoUrls, 500, false);
        gifBlob = gifResult.blob;
        const gifUrl = URL.createObjectURL(gifResult.blob);
        boothFlow.sessionGifUrl = gifUrl;
        boothFlow.isGeneratingGif = false;
        await info(`[saveSessionAssets] Sukses generate GIF sesi (${gifResult.width}x${gifResult.height})`).catch(() => {});
        return gifResult;
      } catch (e) {
        boothFlow.isGeneratingGif = false;
        await error(`[saveSessionAssets] Gagal buat GIF sesi: ${String(e)}`).catch(() => {});
        return null;
      }
    })();
  }

  // 3. Mulai pembuatan Video Composite lokal secara paralel agar user segera bisa preview
  const fallbackClip = validClips[0];
  const normalizedClips: string[] = [];
  if (fallbackClip && photos.length > 0) {
    const rawClips = clipsSnapshot.length > 0 ? clipsSnapshot : boothFlow.liveviewClips;
    for (let i = 0; i < photos.length; i++) {
      normalizedClips.push(rawClips[i] || fallbackClip);
    }
  }

  let videoPromise: Promise<Blob | null> = Promise.resolve(null);
  if (
    boothConfig.config.enableLiveviewVideo &&
    normalizedClips.length === photos.length &&
    normalizedClips.length > 0
  ) {
    boothFlow.isGeneratingVideo = true;
    videoPromise = (async () => {
      try {
        await info(`[liveview] Membuat video composite dengan ${normalizedClips.length}/${photos.length} klip.`).catch(() => {});
        const clipBytes = await Promise.all(
          normalizedClips.map(async (url) =>
            Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer()))
          )
        );

        let effectiveWidth = templateWidth;
        let effectiveHeight = templateHeight;
        let effectiveSlotRects = slotRects;

        if (template) {
          effectiveWidth = template.width || templateWidth || 1200;
          effectiveHeight = template.height || templateHeight || 1800;
          const allLayers = getTemplateLayers(template);
          const sortedPhotoSlots = getSortedPhotoSlots(allLayers);
          effectiveSlotRects = sortedPhotoSlots.map((s) => ({
            x: s.x || 0,
            y: s.y || 0,
            w: s.w || 200,
            h: s.h || 200,
          }));
        }

        let bgBytes: number[] | null = null;
        if (template) {
          try {
            const overlayDataUrl = await compositeTemplateVideoOverlay(
              template,
              softfileUrl ?? undefined,
              boothFlow.stickers
            );
            if (overlayDataUrl && overlayDataUrl.startsWith('data:')) {
              const base64Str = overlayDataUrl.split(',')[1];
              const binStr = atob(base64Str);
              const len = binStr.length;
              const u8 = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                u8[i] = binStr.charCodeAt(i);
              }
              bgBytes = Array.from(u8);
              await info('[liveview] Sukses render overlay PNG template untuk video composite').catch(() => {});
            }
          } catch (e) {
            await warn(`[liveview] Gagal render overlay template, mencoba fallback background: ${String(e)}`).catch(() => {});
          }
        }

        if (!bgBytes && backgroundUrl) {
          try {
            const dataUrl = await invoke<string>('fetch_image_as_data_url', { url: backgroundUrl });
            if (dataUrl && dataUrl.startsWith('data:')) {
              const base64Str = dataUrl.split(',')[1];
              const binStr = atob(base64Str);
              const len = binStr.length;
              const u8 = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                u8[i] = binStr.charCodeAt(i);
              }
              bgBytes = Array.from(u8);
            }
          } catch (e) {
            await warn(`[liveview] Gagal load background frame untuk video composite: ${String(e)}`).catch(() => {});
          }
        }

        const videoBytes = await invoke<number[]>('compose_template_video', {
          clips: clipBytes,
          slotRects: effectiveSlotRects.map((r) => [r.x, r.y, r.w, r.h]),
          canvasWidth: effectiveWidth,
          canvasHeight: effectiveHeight,
          backgroundJpeg: bgBytes,
          mirrorHorizontal: isMirrored,
        });
        const blob = new Blob([new Uint8Array(videoBytes)], {
          type: 'video/mp4'
        });
        compositeVideoBlob = blob;
        const videoUrl = URL.createObjectURL(blob);
        boothFlow.sessionVideoUrl = videoUrl;
        boothFlow.isGeneratingVideo = false;
        await info('[saveSessionAssets] Sukses generate video liveview composite').catch(() => {});
        return blob;
      } catch (e) {
        boothFlow.isGeneratingVideo = false;
        await error(`[saveSessionAssets] Gagal buat video liveview: ${String(e)}`).catch(() => {});
        return null;
      }
    })();
  } else {
    boothFlow.isGeneratingVideo = false;
  }

  // 4. Upload Foto Mentah Tiap Slot & Catat Foto Pertama sebagai Thumbnail di Database
  if (processedPhotoBlobs.length > 0 && canUploadOnline) {
    let firstUploadedMedia: { file_url: string; file_size?: number } | null = null;
    let firstBlurBase64: string | undefined = undefined;

    try {
      firstBlurBase64 = await generateBlurPlaceholder(processedPhotoUrls[0], 24, 0.25);
    } catch (err) {
      await warn(`[saveSessionAssets] Gagal generate blur placeholder untuk thumbnail: ${String(err)}`).catch(() => {});
    }

    for (let i = 0; i < processedPhotoBlobs.length; i++) {
      const blob = processedPhotoBlobs[i];
      try {
        const uploaded = await uploadGalleryAsset(
          boothId,
          sessionId,
          'photo',
          blob,
          'jpg',
          'image/jpeg',
          1200,
          1800,
          i === 0 ? firstBlurBase64 : undefined
        );
        rawPhotosUploaded++;
        if (i === 0) {
          firstUploadedMedia = uploaded;
        }
        await info(`[saveSessionAssets] Sukses upload foto mentah slot ${i + 1}/${processedPhotoBlobs.length}`).catch(() => {});
      } catch (e) {
        if (!lastUploadError) lastUploadError = String(e);
        await error(`[saveSessionAssets] Gagal upload foto mentah slot ${i + 1}: ${String(e)}`).catch(() => {});
      }
    }

    if (firstUploadedMedia && firstUploadedMedia.file_url) {
      try {
        await uploadSessionMedia(
          boothId,
          sessionId,
          firstUploadedMedia.file_url,
          'thumbnail',
          1200,
          1800,
          firstUploadedMedia.file_size || processedPhotoBlobs[0].size,
          firstBlurBase64
        );
        await info('[saveSessionAssets] Sukses register metadata thumbnail foto mentah pertama ke database').catch(() => {});
      } catch (e) {
        await error(`[saveSessionAssets] Gagal register metadata thumbnail ke database: ${String(e)}`).catch(() => {});
      }
    }
  }

  // 5. Tunggu GIF selesai dibuat, lalu upload ke R2 jika online
  const gifResult = await gifPromise;
  if (gifResult && gifResult.blob && canUploadOnline) {
    try {
      await uploadGalleryAsset(
        boothId,
        sessionId,
        'gif',
        gifResult.blob,
        'gif',
        'image/gif',
        gifResult.width,
        gifResult.height
      );
      await info('[saveSessionAssets] Sukses upload GIF sesi ke R2').catch(() => {});
    } catch (e) {
      await error(`[saveSessionAssets] Gagal upload GIF sesi ke R2: ${String(e)}`).catch(() => {});
    }
  }

  // 6. Tunggu Video Composite selesai dibuat, lalu upload ke R2 jika online
  const videoBlob = await videoPromise;
  if (videoBlob && canUploadOnline) {
    try {
      const effWidth = template?.width || templateWidth || 1200;
      const effHeight = template?.height || templateHeight || 1800;
      await uploadGalleryAsset(
        boothId,
        sessionId,
        'video',
        videoBlob,
        'mp4',
        'video/mp4',
        effWidth,
        effHeight
      );
      await info('[saveSessionAssets] Sukses upload video liveview composite ke R2').catch(() => {});
    } catch (e) {
      await error(`[saveSessionAssets] Gagal upload video liveview ke R2: ${String(e)}`).catch(() => {});
    }
  }

  // 7. Penyimpanan lokal hasil sesi — WAJIB di-await agar file ada di disk sebelum outbox / print membacanya
  try {
    await saveLocalSessionAssets(
      uiConfig.config.boothName,
      sessionCode,
      compositeUrl,
      gifBlob,
      validClips,
      compositeVideoBlob,
      processedPhotoBlobs.length > 0 ? processedPhotoBlobs : photos
    );
  } catch (e) {
    await warn(`[saveSessionAssets] Gagal simpan hasil sesi ke lokal: ${String(e)}`).catch(() => {});
  }

  return {
    compositeUrl,
    gifUrl: boothFlow.sessionGifUrl,
    videoUrl: boothFlow.sessionVideoUrl,
    gifBlob,
    compositeVideoBlob,
    compositeUploaded,
    rawPhotosUploaded,
    lastUploadError,
  };
}
