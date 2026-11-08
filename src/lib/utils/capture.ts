import { invoke } from '@tauri-apps/api/core';
import { cameraStore } from '$lib/camera.svelte';
import { boothFlow } from '$lib/stores/booth.svelte';
import { boothConfig } from '$lib/stores/boothConfig.svelte';
import { recordCapturedSlotToCheckpoint } from '$lib/utils/activeSessionCheckpoint';

export interface CaptureSequenceOptions {
  slotCount: number;
  countdownSecs: number;
  startSlot?: number;
  onCapturePhoto?: (photoUrl: string, slotIndex: number) => void;
  onCameraDisconnect?: () => Promise<boolean>; // return true jika berhasil reconnect & lanjut, false jika batalkan
}

export async function runCaptureSequence(
  slotCountOrOptions: number | CaptureSequenceOptions,
  countdownSecsParam?: number,
  onCapturePhotoParam?: (photoUrl: string) => void
) {
  let slotCount: number;
  let countdownSecs: number;
  let startSlot = 0;
  let onCapturePhoto: ((photoUrl: string, slotIndex: number) => void) | undefined;
  let onCameraDisconnect: (() => Promise<boolean>) | undefined;

  if (typeof slotCountOrOptions === 'object') {
    slotCount = slotCountOrOptions.slotCount;
    countdownSecs = slotCountOrOptions.countdownSecs;
    startSlot = slotCountOrOptions.startSlot ?? 0;
    onCapturePhoto = slotCountOrOptions.onCapturePhoto;
    onCameraDisconnect = slotCountOrOptions.onCameraDisconnect;
  } else {
    slotCount = slotCountOrOptions;
    countdownSecs = countdownSecsParam ?? 5;
    if (onCapturePhotoParam) {
      onCapturePhoto = (url) => onCapturePhotoParam(url);
    }
  }

  const clipPromises: Promise<void>[] = [];

  for (let i = startSlot; i < slotCount; i++) {
    const cSecs =
      i === 0
        ? typeof boothConfig.config.firstCountdownSecs === 'number' && boothConfig.config.firstCountdownSecs > 0
          ? boothConfig.config.firstCountdownSecs
          : countdownSecs
        : countdownSecs;

    for (let c = cSecs; c > 0; c--) {
      boothFlow.countdown = c;
      if (c === 1 && cameraStore.cameraMode === 'usb') {
        await new Promise((r) => setTimeout(r, 800));
        // Hentikan request EVF baru 200ms sebelum angka 0 agar bus USB kosong & shutter berbunyi tepat bersamaan dengan flash putih
        cameraStore.isPreparingCapture = true;
        await new Promise((r) => setTimeout(r, 200));
      } else {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    boothFlow.countdown = null;
    const captureTs = Date.now(); // t=0 untuk window klip — SEBELUM shutter, seakurat mungkin

    // 1. Munculkan sekilas flash putih terang pada kotak preview liveview untuk UX jepretan
    boothFlow.isFlashActive = true;
    boothFlow.captureMessage = 'Sedang capture kamera...';

    const slotIndex = i;

    try {
      // Picu perintah shutter kamera fisik secara paralel bersamaan dengan munculnya flash putih
      const capturePromise = cameraStore.capture();

      // Biarkan flash putih terlihat jelas sekilas (220ms) di kotak liveview sebelum menampilkan overlay gelap
      await new Promise((r) => setTimeout(r, 220));
      boothFlow.isFlashActive = false;
      boothFlow.isCapturingCamera = true;

      let bytes = await capturePromise;
      // Retry otomatis 1x jika pada jepretan pertama kamera sedang transisi/busy
      if (!bytes && cameraStore.cameraMode === 'usb') {
        console.warn(`[runCaptureSequence] Capture slot ${i + 1} pertama null, retry dalam 400ms...`);
        await new Promise((r) => setTimeout(r, 400));
        bytes = await cameraStore.capture();
      }

      // Jika kamera terputus di tengah pemotretan
      if (!bytes && cameraStore.status !== 'connected' && onCameraDisconnect) {
        boothFlow.captureMessage = 'Kamera terputus, mencoba memulihkan...';
        const reconnected = await onCameraDisconnect();
        if (reconnected) {
          // Ulangi slot ini setelah berhasil reconnected
          i--;
          continue;
        }
      }

      let photoUrl = '';
      if (bytes && bytes.length > 0) {
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        photoUrl = URL.createObjectURL(blob);

        // 2. Simpan instan ke disk lokal & update checkpoint sebelum countdown slot berikutnya
        boothFlow.captureMessage = 'Menyimpan foto ke sistem...';
        try {
          const sessionCode = boothFlow.sessionCode || `LOCAL-${Date.now()}`;
          const date = new Date().toISOString().slice(0, 10);
          const relPath = `${date}/${sessionCode}/raw/slot_${String(i + 1).padStart(2, '0')}.jpg`;
          await invoke('save_session_file', {
            relativePath: relPath,
            bytes: Array.from(bytes),
          });
          await recordCapturedSlotToCheckpoint(slotIndex, relPath);
        } catch (saveErr) {
          console.warn(`[runCaptureSequence] Gagal menulis foto slot ${i + 1} ke disk:`, saveErr);
        }
      } else {
        // Fallback aman: clone frame liveview ke persistent blob agar tidak hilang saat liveview di-revoke
        if (cameraStore.currentLiveviewUrl) {
          try {
            const resp = await fetch(cameraStore.currentLiveviewUrl);
            const arrayBuf = await resp.arrayBuffer();
            const persistentBlob = new Blob([arrayBuf], { type: 'image/jpeg' });
            photoUrl = URL.createObjectURL(persistentBlob);
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
      }

      if (photoUrl) {
        const updated = [...boothFlow.photosTaken];
        updated[slotIndex] = photoUrl;
        boothFlow.photosTaken = updated;
        if (onCapturePhoto) onCapturePhoto(photoUrl, slotIndex);
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

      // Pastikan pengambilan liveview langsung aktif kembali agar kamera siap dan tidak busy
      if (cameraStore.cameraMode === 'usb') {
        boothFlow.captureMessage = 'Menyiapkan live preview...';
        await cameraStore.getLiveviewFrame().catch(() => {});
      }

      // Jeda aman stabilisasi kamera sebelum slot berikutnya (mencegah DEVICE_BUSY pada EOS R / DSLR)
      if (i < slotCount - 1) {
        boothFlow.captureMessage = 'Menstabilkan kamera...';
        await new Promise((r) => setTimeout(r, 600));
      }
    } catch (err) {
      console.error('Capture error:', err);
    } finally {
      // Hilangkan overlay saat kamera sudah stabil & siap untuk slot berikutnya
      boothFlow.isFlashActive = false;
      boothFlow.isCapturingCamera = false;
      boothFlow.captureMessage = null;
    }
  }

  // Tunggu semua ekstraksi klip selesai sebelum sesi dianggap "selesai foto"
  await Promise.allSettled(clipPromises);
}
