import { cameraStore } from '$lib/camera.svelte';
import { boothFlow } from '$lib/stores/booth.svelte';

export async function runCaptureSequence(
  slotCount: number,
  countdownSecs: number,
  onCapturePhoto?: (photoUrl: string) => void
) {
  for (let i = 0; i < slotCount; i++) {
    for (let c = countdownSecs; c > 0; c--) {
      boothFlow.countdown = c;
      await new Promise((r) => setTimeout(r, 1000));
    }
    boothFlow.countdown = null;
    try {
      const bytes = await cameraStore.capture();
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
    } catch (err) {
      console.error('Capture error:', err);
    }
  }
}
