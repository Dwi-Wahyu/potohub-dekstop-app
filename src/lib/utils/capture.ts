import { cameraStore } from '$lib/camera.svelte';
import { boothFlow } from '$lib/stores/booth.svelte';
import { boothConfig } from '$lib/stores/boothConfig.svelte';

export async function runCaptureSequence(
  slotCount: number,
  countdownSecs: number,
  onCapturePhoto?: (photoUrl: string) => void
) {
  const clipPromises: Promise<void>[] = [];

  for (let i = 0; i < slotCount; i++) {
    for (let c = countdownSecs; c > 0; c--) {
      boothFlow.countdown = c;
      await new Promise((r) => setTimeout(r, 1000));
    }
    boothFlow.countdown = null;
    const captureTs = Date.now(); // t=0 untuk window klip — SEBELUM shutter, seakurat mungkin

    // Trigger visual screen flash effect - hold for 2 seconds (2000ms)
    boothFlow.isFlashActive = true;
    setTimeout(() => {
      boothFlow.isFlashActive = false;
    }, 2000);

    try {
      const bytes = await cameraStore.capture();
      const slotIndex = i;
      if (bytes) {
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const photoUrl = URL.createObjectURL(blob);
        boothFlow.photosTaken = [...boothFlow.photosTaken, photoUrl];
        if (onCapturePhoto) onCapturePhoto(photoUrl);
      } else {
        // Fallback for demo or when capture returns empty bytes
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#ffffff';
          ctx.font = '30px sans-serif';
          ctx.fillText(`Photo ${i + 1}`, 240, 240);
          const photoUrl = canvas.toDataURL('image/jpeg');
          boothFlow.photosTaken = [...boothFlow.photosTaken, photoUrl];
          if (onCapturePhoto) onCapturePhoto(photoUrl);
        }
      }

      if (boothConfig.config.enableLiveviewVideo) {
        clipPromises.push(
          cameraStore
            .extractLiveviewClip(
              captureTs,
              boothConfig.config.liveviewClipPreSecs,
              boothConfig.config.liveviewClipPostSecs
            )
            .then((clipBlob) => {
              const clipUrl = clipBlob ? URL.createObjectURL(clipBlob) : null;
              const next = [...boothFlow.liveviewClips];
              next[slotIndex] = clipUrl;
              boothFlow.liveviewClips = next;
            })
            .catch((err) =>
              console.error('Gagal ekstrak liveview clip slot', slotIndex, err)
            )
        );
      }
    } catch (err) {
      console.error('Capture error:', err);
    }
  }

  // Tunggu semua ekstraksi klip selesai sebelum sesi dianggap "selesai foto"
  await Promise.allSettled(clipPromises);
}
