import { invoke } from '@tauri-apps/api/core';
import { info, warn, error } from '@tauri-apps/plugin-log';
import { boothFlow } from '$lib/stores/booth.svelte';
import { boothConfig } from '$lib/stores/boothConfig.svelte';
import { uiConfig } from '$lib/stores/uiConfig.svelte';
import { uploadGalleryAsset } from '$lib/api/boothClient';
import { buildSessionGif } from './gif';
import { saveLocalSessionAssets } from './localSessionStorage';

export interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
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
  sessionCodeSnapshot: string | null = boothFlow.sessionCode
) {
  // Snapshot imutabel di awal agar kebal terhadap boothFlow.reset() saat user klik selesai
  const photos = photosSnapshot.length > 0 ? [...photosSnapshot] : [...boothFlow.photosTaken];
  const validClips = (clipsSnapshot.length > 0 ? clipsSnapshot : boothFlow.liveviewClips).filter(
    (c): c is string => !!c
  );
  const sessionCode = sessionCodeSnapshot || boothFlow.sessionCode || sessionId || `session-${Date.now()}`;

  await info(
    `[saveSessionAssets] mulai boothId=${boothId} sessionId=${sessionId} photos=${photos.length} clips=${validClips.length} hasComposite=${!!compositeUrl}`
  ).catch(() => {});

  let gifBlob: Blob | null = null;
  let compositeVideoBlob: Blob | null = null;

  // 1. Upload Composite Strip Foto terlebih dahulu agar customer segera dapat QR/Softfile
  if (compositeUrl) {
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
      await info('[saveSessionAssets] Sukses upload composite strip foto').catch(() => {});
    } catch (e) {
      await error(`[saveSessionAssets] Gagal upload composite strip: ${String(e)}`).catch(() => {});
    }
  }

  // 2. Upload Thumbnail & Foto Mentah Tiap Slot SEGERA (ringan, selesai 1-2s sebelum user berpindah layar)
  if (photos.length > 0) {
    try {
      await uploadGalleryAsset(
        boothId,
        sessionId,
        'thumbnail',
        photos[0],
        'jpg',
        'image/jpeg',
        1200,
        1800
      );
      await info('[saveSessionAssets] Sukses upload thumbnail foto mentah').catch(() => {});
    } catch (e) {
      await error(`[saveSessionAssets] Gagal upload thumbnail foto mentah: ${String(e)}`).catch(() => {});
    }

    for (let i = 0; i < photos.length; i++) {
      const photoUrl = photos[i];
      try {
        await uploadGalleryAsset(
          boothId,
          sessionId,
          'photo',
          photoUrl,
          'jpg',
          'image/jpeg',
          1200,
          1800
        );
        await info(`[saveSessionAssets] Sukses upload foto mentah slot ${i + 1}/${photos.length}`).catch(() => {});
      } catch (e) {
        await error(`[saveSessionAssets] Gagal upload foto mentah slot ${i + 1}: ${String(e)}`).catch(() => {});
      }
    }
  }

  // 3. GIF gabungan foto (menggunakan snapshot foto & orientasi mirrorOn yang dipilih)
  if (boothConfig.config.enableSessionGif && photos.length > 0) {
    try {
      const isMirrored = boothConfig.config.mirrorOn ?? false;
      const blob = await buildSessionGif(photos, 500, isMirrored);
      gifBlob = blob;
      await uploadGalleryAsset(
        boothId,
        sessionId,
        'gif',
        blob,
        'gif',
        'image/gif',
        480,
        720
      );
      await info('[saveSessionAssets] Sukses upload GIF sesi').catch(() => {});
    } catch (e) {
      await error(`[saveSessionAssets] Gagal buat/upload GIF sesi: ${String(e)}`).catch(() => {});
    }
  }

  // 4. Video composite live view per slot (dengan orientasi mirror horizontal yang selaras)
  if (
    boothConfig.config.enableLiveviewVideo &&
    validClips.length === photos.length &&
    validClips.length > 0
  ) {
    await info(`[liveview] Membuat video composite dengan ${validClips.length}/${photos.length} klip valid.`).catch(() => {});
    try {
      const clipBytes = await Promise.all(
        validClips.map(async (url) =>
          Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer()))
        )
      );

      let bgBytes: number[] | null = null;
      if (backgroundUrl) {
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

      const isMirrored = boothConfig.config.mirrorOn ?? false;
      const videoBytes = await invoke<number[]>('compose_template_video', {
        clips: clipBytes,
        slotRects: slotRects.map((r) => [r.x, r.y, r.w, r.h]),
        canvasWidth: templateWidth,
        canvasHeight: templateHeight,
        backgroundJpeg: bgBytes,
        mirrorHorizontal: isMirrored,
      });
      const blob = new Blob([new Uint8Array(videoBytes)], {
        type: 'video/mp4'
      });
      compositeVideoBlob = blob;
      await uploadGalleryAsset(
        boothId,
        sessionId,
        'video',
        blob,
        'mp4',
        'video/mp4',
        templateWidth,
        templateHeight
      );
      await info('[saveSessionAssets] Sukses upload video liveview composite').catch(() => {});
    } catch (e) {
      await error(`[saveSessionAssets] Gagal buat/upload video liveview: ${String(e)}`).catch(() => {});
    }
  } else {
    await warn(
      `[liveview] Video composite dilewati. enableLiveviewVideo=${boothConfig.config.enableLiveviewVideo}, validClips=${validClips.length}, photosCount=${photos.length}`
    ).catch(() => {});
  }

  // 5. Penyimpanan lokal hasil sesi (Part E) — menggunakan snapshot agar tidak terhapus
  saveLocalSessionAssets(
    uiConfig.config.boothName,
    sessionCode,
    compositeUrl,
    gifBlob,
    validClips,
    compositeVideoBlob,
    photos
  ).catch(async (e) => {
    await warn(`[saveSessionAssets] Gagal simpan hasil sesi ke lokal: ${String(e)}`).catch(() => {});
  });
}
