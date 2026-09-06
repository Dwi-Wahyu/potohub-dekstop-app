import { invoke } from '@tauri-apps/api/core';
import { boothFlow } from '$lib/stores/booth.svelte';
import { boothConfig } from '$lib/stores/boothConfig.svelte';

function sanitize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function blobToBytes(blobOrUrl: Blob | string): Promise<Uint8Array> {
  const blob = typeof blobOrUrl === 'string' ? await (await fetch(blobOrUrl)).blob() : blobOrUrl;
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Simpan hasil sesi ke folder lokal:
 *   <app_data_dir>/sessions/<YYYY-MM-DD>/<sessionCode>_<boothNameSanitized>/
 *     raw/ composite/ gif/ video/ manifest.json
 * Tidak pernah throw ke pemanggil — semua kegagalan dicatat via console.warn.
 */
export async function saveLocalSessionAssets(
  boothName: string,
  sessionCode: string,
  compositeUrl: string | null,
  gifBlob: Blob | null,
  videoClips: (Blob | string | null)[],
  compositeVideoBlob: Blob | null,
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const base = `${date}/${sessionCode}_${sanitize(boothName || 'booth')}`;
  const manifest: any = {
    boothName,
    sessionCode,
    createdAt: new Date().toISOString(),
    files: [],
  };

  const writes: Promise<void>[] = [];

  boothFlow.photosTaken.forEach((photoUrl, i) => {
    writes.push(
      blobToBytes(photoUrl)
        .then(async (bytes) => {
          const rel = `${base}/raw/slot_${String(i + 1).padStart(2, '0')}.jpg`;
          await invoke('save_session_file', { relativePath: rel, bytes: Array.from(bytes) });
          manifest.files.push({ path: rel, role: 'raw_photo', slot: i + 1 });
        })
        .catch(console.warn)
    );
  });

  if (compositeUrl) {
    writes.push(
      blobToBytes(compositeUrl)
        .then(async (bytes) => {
          const rel = `${base}/composite/print_strip.jpg`;
          await invoke('save_session_file', { relativePath: rel, bytes: Array.from(bytes) });
          manifest.files.push({ path: rel, role: 'composite' });
        })
        .catch(console.warn)
    );
  }

  if (gifBlob) {
    writes.push(
      blobToBytes(gifBlob)
        .then(async (bytes) => {
          const rel = `${base}/gif/session.gif`;
          await invoke('save_session_file', { relativePath: rel, bytes: Array.from(bytes) });
          manifest.files.push({ path: rel, role: 'gif' });
        })
        .catch(console.warn)
    );
  }

  videoClips.forEach((clip, i) => {
    if (!clip) return;
    writes.push(
      blobToBytes(clip)
        .then(async (bytes) => {
          const ext = (clip instanceof Blob ? clip.type : '').includes('webm') ? 'webm' : 'mp4';
          const rel = `${base}/video/slot_${String(i + 1).padStart(2, '0')}.${ext}`;
          await invoke('save_session_file', { relativePath: rel, bytes: Array.from(bytes) });
          manifest.files.push({ path: rel, role: 'liveview_clip', slot: i + 1 });
        })
        .catch(console.warn)
    );
  });

  if (compositeVideoBlob) {
    writes.push(
      blobToBytes(compositeVideoBlob)
        .then(async (bytes) => {
          const rel = `${base}/video/composite.mp4`;
          await invoke('save_session_file', { relativePath: rel, bytes: Array.from(bytes) });
          manifest.files.push({ path: rel, role: 'composite_video' });
        })
        .catch(console.warn)
    );
  }

  await Promise.allSettled(writes);
  await invoke('save_session_manifest', {
    relativePath: `${base}/manifest.json`,
    json: JSON.stringify(manifest, null, 2),
  });
}

export function buildAssetRelativePaths(sessionCode: string | null, boothName: string) {
  if (!sessionCode) return [];
  const date = new Date().toISOString().slice(0, 10);
  const base = `${date}/${sessionCode}_${sanitize(boothName || 'booth')}`;
  const list: {
    role: 'composite' | 'gif' | 'video';
    path: string;
    contentType: string;
    width: number;
    height: number;
  }[] = [
    {
      role: 'composite',
      path: `${base}/composite/print_strip.jpg`,
      contentType: 'image/jpeg',
      width: 1200,
      height: 1800,
    },
  ];

  if (boothConfig.config.enableSessionGif) {
    list.push({
      role: 'gif',
      path: `${base}/gif/session.gif`,
      contentType: 'image/gif',
      width: 480,
      height: 720,
    });
  }

  if (boothConfig.config.enableLiveviewVideo) {
    list.push({
      role: 'video',
      path: `${base}/video/composite.mp4`,
      contentType: 'video/mp4',
      width: 1200,
      height: 1800,
    });
  }

  return list;
}
