import { invoke } from '@tauri-apps/api/core';
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
  backgroundUrl?: string | null
) {
  console.log('[saveSessionAssets] mulai', {
    boothId,
    sessionId,
    hasComposite: !!compositeUrl,
    photosTakenCount: boothFlow.photosTaken.length,
    liveviewClipsCount: boothFlow.liveviewClips.filter(Boolean).length,
  });

  const tasks: Promise<unknown>[] = [];

  // Tangkapan untuk penyimpanan lokal (Part E) — diisi saat build/upload
  let gifBlob: Blob | null = null;
  let compositeVideoBlob: Blob | null = null;
  const validClips = boothFlow.liveviewClips.filter((c): c is string => !!c);

  // 1. Foto mentah tiap slot
  boothFlow.photosTaken.forEach((photoUrl, i) => {
    tasks.push(
      uploadGalleryAsset(
        boothId,
        sessionId,
        'photo',
        photoUrl,
        'jpg',
        'image/jpeg',
        1200,
        1800
      ).catch((e) => console.error(`Gagal upload foto mentah slot ${i}:`, e))
    );
  });

  // 2. Composite (hasil template)
  if (compositeUrl) {
    tasks.push(
      uploadGalleryAsset(
        boothId,
        sessionId,
        'photo',
        compositeUrl,
        'jpg',
        'image/jpeg',
        templateWidth,
        templateHeight
      ).catch((e) => console.error('Gagal upload composite:', e))
    );
  }

  // 3. GIF gabungan foto
  if (boothConfig.config.enableSessionGif && boothFlow.photosTaken.length > 0) {
    tasks.push(
      buildSessionGif(boothFlow.photosTaken)
        .then((blob) => {
          gifBlob = blob;
          return uploadGalleryAsset(
            boothId,
            sessionId,
            'gif',
            blob,
            'gif',
            'image/gif',
            480,
            720
          );
        })
        .catch((e) => console.error('Gagal buat/upload GIF sesi:', e))
    );
  }

  // 4. Video composite live view per slot
  if (
    boothConfig.config.enableLiveviewVideo &&
    validClips.length === boothFlow.photosTaken.length &&
    validClips.length > 0
  ) {
    console.log(`[liveview] Membuat video composite dengan ${validClips.length}/${boothFlow.photosTaken.length} klip valid.`);
    tasks.push(
      (async () => {
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
            console.warn('Gagal load background frame untuk video composite:', e);
          }
        }

        const videoBytes = await invoke<number[]>('compose_template_video', {
          clips: clipBytes,
          slotRects: slotRects.map((r) => [r.x, r.y, r.w, r.h]),
          canvasWidth: templateWidth,
          canvasHeight: templateHeight,
          backgroundJpeg: bgBytes
        });
        const blob = new Blob([new Uint8Array(videoBytes)], {
          type: 'video/mp4'
        });
        compositeVideoBlob = blob;
        return uploadGalleryAsset(
          boothId,
          sessionId,
          'video',
          blob,
          'mp4',
          'video/mp4',
          templateWidth,
          templateHeight
        );
      })().catch((e) => console.error('Gagal buat/upload video liveview:', e))
    );
  } else {
    console.warn(
      `[liveview] Video composite dilewati. enableLiveviewVideo=${boothConfig.config.enableLiveviewVideo}, validClips=${validClips.length}, photosTaken=${boothFlow.photosTaken.length}`
    );
  }

  await Promise.allSettled(tasks);

  // 5. Penyimpanan lokal hasil sesi (Part E) — tidak boleh menggagalkan upload R2
  saveLocalSessionAssets(
    uiConfig.config.boothName,
    boothFlow.sessionCode ?? sessionId ?? `session-${Date.now()}`,
    compositeUrl,
    gifBlob,
    validClips,
    compositeVideoBlob
  ).catch((e) => console.warn('Gagal simpan hasil sesi ke lokal:', e));
}
