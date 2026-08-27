import { invoke } from '@tauri-apps/api/core';

export async function buildSessionGif(
  photoUrls: string[],
  frameDelayMs = 500
): Promise<Blob> {
  const photoBytes: number[][] = [];
  for (const url of photoUrls) {
    const buf = await (await fetch(url)).arrayBuffer();
    photoBytes.push(Array.from(new Uint8Array(buf)));
  }
  const gifBytes = await invoke<number[]>('encode_photos_to_gif', {
    photos: photoBytes,
    frameDelayMs,
  });
  return new Blob([new Uint8Array(gifBytes)], { type: 'image/gif' });
}
