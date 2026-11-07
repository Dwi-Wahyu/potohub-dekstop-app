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
    const cSecs = i === 0 ? (boothConfig.config.firstCountdownSecs || countdownSecs) : countdownSecs;
    for (let c = cSecs; c > 0; c--) {
      boothFlow.countdown = c;
      await new Promise((r) => setTimeout(r, 1000));
    }
    boothFlow.countdown = null;
    const captureTs = Date.now(); // t=0 untuk window klip — SEBELUM shutter, seakurat mungkin

    // Tampilkan overlay "Sedang capture kamera..." agar customer tahu proses sedang berjalan dan kamera tidak busy
    boothFlow.isCapturingCamera = true;
    boothFlow.captureMessage = 'Sedang capture kamera...';

    // Trigger visual screen flash effect - durasi singkat 250ms agar responsif dan tidak menutupi layar
    boothFlow.isFlashActive = true;
    setTimeout(() => {
      boothFlow.isFlashActive = false;
    }, 250);

    const slotIndex = i;
    // Tampilkan snapshot instan dari liveview saat ini pada slot preview agar customer langsung melihat hasilnya seketika
    let instantSnapshotUrl = '';
    if (cameraStore.currentLiveviewUrl) {
      instantSnapshotUrl = cameraStore.currentLiveviewUrl;
      const updated = [...boothFlow.photosTaken];
      updated[slotIndex] = instantSnapshotUrl;
      boothFlow.photosTaken = updated;
      if (onCapturePhoto) onCapturePhoto(instantSnapshotUrl);
    }

    try {
      let bytes = await cameraStore.capture();
      // Retry otomatis 1x jika pada jepretan pertama kamera sedang transisi/busy
      if (!bytes && cameraStore.cameraMode === 'usb') {
        console.warn(`[runCaptureSequence] Capture slot ${i + 1} pertama null, retry dalam 300ms...`);
        await new Promise((r) => setTimeout(r, 300));
        bytes = await cameraStore.capture();
      }

      if (bytes && bytes.length > 0) {
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const photoUrl = URL.createObjectURL(blob);
        const updated = [...boothFlow.photosTaken];
        updated[slotIndex] = photoUrl;
        boothFlow.photosTaken = updated;
        if (onCapturePhoto) onCapturePhoto(photoUrl);
      } else if (!instantSnapshotUrl) {
        // Fallback: Snapshot liveview terakhir atau placeholder jika keduanya kosong
        let photoUrl = '';
        if (cameraStore.currentLiveviewUrl) {
          try {
            const resp = await fetch(cameraStore.currentLiveviewUrl);
            const blob = await resp.blob();
            photoUrl = URL.createObjectURL(blob);
          } catch {
            photoUrl = '';
          }
        }
        if (!photoUrl) {
          const canvas = document.createElement('canvas');
          canvas.width = 1200;
          canvas.height = 800;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#1e1b4b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 36px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Photo ${i + 1}`, canvas.width / 2, canvas.height / 2);
            photoUrl = canvas.toDataURL('image/jpeg');
          }
        }
        if (photoUrl) {
          const updated = [...boothFlow.photosTaken];
          updated[slotIndex] = photoUrl;
          boothFlow.photosTaken = updated;
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

      // Pastikan pengambilan liveview sudah aktif kembali agar kamera siap dan tidak busy
      if (cameraStore.cameraMode === 'usb') {
        await new Promise((r) => setTimeout(r, 400));
        await cameraStore.getLiveviewFrame().catch(() => {});
      }
    } catch (err) {
      console.error('Capture error:', err);
    } finally {
      // Tahan sejenak agar customer melihat foto hasil jepretan sebelum countdown berikutnya
      await new Promise((r) => setTimeout(r, 800));
      boothFlow.isCapturingCamera = false;
      boothFlow.captureMessage = null;
    }

    if (i < slotCount - 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  // Tunggu semua ekstraksi klip selesai sebelum sesi dianggap "selesai foto"
  await Promise.allSettled(clipPromises);
}
