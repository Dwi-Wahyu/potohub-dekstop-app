<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { GenericScreen, type DesignBlocksDocument, type QrPoint } from '@potohub/booth-ui';
  import { cameraStore } from '$lib/camera.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { networkStatus } from '$lib/stores/networkStatus.svelte';
  import { redeemTicket, requireActiveBoothId } from '$lib/api/boothClient';
  import {
    detectQrFromImageElement,
    detectQrFromImageUrl,
    detectQrFromVideo,
  } from '$lib/utils/qrScanner';

  type QrScanResult = NonNullable<Awaited<ReturnType<typeof detectQrFromVideo>>>;
  import { createDesktopUiAdapter } from '$lib/adapters/boothUiAdapter.svelte';
  import OfflineBanner from '$lib/components/shared/OfflineBanner.svelte';
  import OnScreenKeyboard from '$lib/components/shared/OnScreenKeyboard.svelte';

  interface Props {
    doc: DesignBlocksDocument;
    onSuccess: () => void;
    onBack: () => void;
  }

  let { doc, onSuccess, onBack }: Props = $props();

  let ticketCode = $state('');
  let status = $state<'idle' | 'verifying' | 'success' | 'error'>('idle');
  let statusMessage = $state('');
  let keyboardOpen = $state(false);
  let frameSrc = $state('');

  let detectedQrPoints = $state<QrPoint[] | null>(null);
  let detectedSourceWidth = $state(0);
  let detectedSourceHeight = $state(0);

  let videoEl: HTMLVideoElement | null = null;
  let imgEl: HTMLImageElement | null = null;
  let destroyed = false;

  let liveviewInterval: ReturnType<typeof setInterval> | null = null;
  let autoScanInterval: ReturnType<typeof setInterval> | null = null;
  let errorResetTimer: ReturnType<typeof setTimeout> | null = null;
  let successTimer: ReturnType<typeof setTimeout> | null = null;
  let isScanningNow = false;
  let lastAutoScannedContent = '';
  let lastAutoScanAt = 0;

  onMount(async () => {
    try {
      await cameraStore.checkDevMode();
      if (destroyed) return;

      const cfgMode = boothConfig.config.cameraMode;
      const targetMode: 'usb' | 'webcam' | 'demo' =
        cfgMode === 'demo' || cameraStore.cameraMode === 'demo'
          ? 'demo'
          : cfgMode === 'usb' && cameraStore.status === 'connected' && cameraStore.cameraMode === 'usb'
            ? 'usb'
            : cameraStore.isDevMode || cfgMode === 'webcam'
              ? 'webcam'
              : cameraStore.cameraMode === 'webcam' &&
                  cameraStore.status === 'connected' &&
                  cameraStore.stream?.active
                ? 'webcam'
                : (cfgMode || 'usb');

      if (
        cameraStore.status === 'idle' ||
        cameraStore.status === 'error' ||
        cameraStore.cameraMode !== targetMode ||
        (targetMode === 'webcam' && !cameraStore.stream?.active)
      ) {
        await cameraStore.connect(targetMode);
      }
      if (destroyed) return;

      // Jika mode USB belum berhasil terhubung tetapi perangkat punya dev/webcam atau fallback perlu dicoba ulang
      if (cameraStore.status !== 'connected' && cameraStore.cameraMode === 'usb') {
        await new Promise((r) => setTimeout(r, 250));
        if (!destroyed) {
          await cameraStore.connect('usb');
        }
      }
      if (destroyed) return;

      await cameraStore.startLiveview(videoEl);
      if (destroyed) return;

      if (cameraStore.cameraMode === 'usb' || cameraStore.cameraMode === 'demo') {
        const firstFrame = await cameraStore.getLiveviewFrame();
        if (firstFrame && !destroyed) {
          frameSrc = firstFrame;
        }
        let fetchingFrame = false;
        liveviewInterval = setInterval(async () => {
          if (fetchingFrame || destroyed) return;
          fetchingFrame = true;
          try {
            if (cameraStore.status !== 'connected') return;
            const url = await cameraStore.getLiveviewFrame();
            if (url && !destroyed) {
              frameSrc = url;
            }
          } finally {
            fetchingFrame = false;
          }
        }, 80);
      }

      autoScanInterval = setInterval(() => {
        void runAutoScanTick();
      }, 260);
    } catch (err) {
      console.warn('[KioskTicketWrapper] Liveview init warning:', err);
    }
  });

  onDestroy(() => {
    destroyed = true;
    if (liveviewInterval) clearInterval(liveviewInterval);
    if (autoScanInterval) clearInterval(autoScanInterval);
    if (errorResetTimer) clearTimeout(errorResetTimer);
    if (successTimer) clearTimeout(successTimer);
    cameraStore.stopLiveview().catch(() => {});
  });

  async function detectCurrentFrame(): Promise<QrScanResult | null> {
    if (videoEl && videoEl.readyState >= 2) {
      const res = await detectQrFromVideo(videoEl);
      if (res) {
        return {
          ...res,
          sourceWidth: res.sourceWidth ?? (videoEl.videoWidth || 640),
          sourceHeight: res.sourceHeight ?? (videoEl.videoHeight || 480),
        };
      }
    }

    if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
      const res = await detectQrFromImageElement(imgEl);
      if (res) {
        return {
          ...res,
          sourceWidth: res.sourceWidth ?? imgEl.naturalWidth,
          sourceHeight: res.sourceHeight ?? imgEl.naturalHeight,
        };
      }
    }

    if (frameSrc) {
      return detectQrFromImageUrl(frameSrc);
    }

    return null;
  }

  function recordDetectedQr(res: QrScanResult) {
    detectedQrPoints = res.cornerPoints;
    detectedSourceWidth = res.sourceWidth ?? 0;
    detectedSourceHeight = res.sourceHeight ?? 0;

    void invoke('save_qr_result', {
      data: {
        content: res.content,
        corner_points: res.cornerPoints,
      },
    }).catch(() => {});
  }

  async function runAutoScanTick() {
    if (isScanningNow || status === 'verifying' || status === 'success') {
      return;
    }

    isScanningNow = true;
    try {
      const res = await detectCurrentFrame();
      if (!res?.content) {
        if (status === 'idle') {
          detectedQrPoints = null;
        }
        return;
      }

      recordDetectedQr(res);
      const clean = res.content.trim();
      const now = Date.now();
      if (clean === lastAutoScannedContent && now - lastAutoScanAt < 4000) {
        return;
      }
      lastAutoScannedContent = clean;
      lastAutoScanAt = now;
      ticketCode = clean;
      await verifyTicketCode(clean);
    } catch {
      // keep silent during background polling
    } finally {
      isScanningNow = false;
    }
  }

  async function handleManualCameraScan() {
    if (status === 'verifying' || status === 'success') return;

    if (errorResetTimer) {
      clearTimeout(errorResetTimer);
      errorResetTimer = null;
    }

    status = 'verifying';
    statusMessage = 'Memindai QR...';
    let found: QrScanResult | null = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      found = await detectCurrentFrame();
      if (found?.content) break;
      await new Promise((r) => setTimeout(r, 110));
    }

    if (found?.content) {
      recordDetectedQr(found);
      ticketCode = found.content.trim();
      await verifyTicketCode(ticketCode);
      return;
    }

    detectedQrPoints = null;
    status = 'error';
    statusMessage = 'QR code tidak terdeteksi. Arahkan QR ke kamera atau ketik manual.';
    errorResetTimer = setTimeout(() => {
      if (status === 'error') {
        status = 'idle';
        statusMessage = '';
      }
    }, 3200);
  }

  async function verifyTicketCode(codeToVerify: string) {
    const clean = codeToVerify.trim();
    if (!clean) {
      status = 'error';
      statusMessage = 'Masukkan kode tiket terlebih dahulu.';
      return;
    }

    if (errorResetTimer) {
      clearTimeout(errorResetTimer);
      errorResetTimer = null;
    }

    status = 'verifying';
    statusMessage = 'Memverifikasi tiket...';
    keyboardOpen = false;

    try {
      const boothId = await requireActiveBoothId();
      const result = await redeemTicket(clean, boothId);

      if (result.valid) {
        status = 'success';
        statusMessage = result.message || 'Tiket valid! Memulai sesi...';
        boothFlow.sessionCode = clean;
        successTimer = setTimeout(() => {
          onSuccess();
        }, 650);
      } else {
        status = 'error';
        statusMessage = result.message || 'Tiket tidak valid atau sudah digunakan.';
        errorResetTimer = setTimeout(() => {
          if (status === 'error') {
            status = 'idle';
            statusMessage = '';
            detectedQrPoints = null;
          }
        }, 3500);
      }
    } catch (err) {
      status = 'error';
      statusMessage = err instanceof Error ? err.message : 'Gagal menghubungi server.';
      errorResetTimer = setTimeout(() => {
        if (status === 'error') {
          status = 'idle';
          statusMessage = '';
          detectedQrPoints = null;
        }
      }, 3500);
    }
  }

  function handleKeyboardPress(key: string) {
    if (key === 'BACKSPACE') {
      ticketCode = ticketCode.slice(0, -1);
    } else if (key === 'CLEAR') {
      ticketCode = '';
    } else {
      ticketCode = (ticketCode + key).slice(0, 32);
    }
    if (status === 'error') {
      status = 'idle';
      statusMessage = '';
    }
  }

  let adapter = $derived(
    createDesktopUiAdapter({
      categories: [],
      templates: [],
      frameSrc,
      ticket: {
        code: ticketCode,
        status,
        statusMessage,
        isVerifying: status === 'verifying',
        isOffline: !networkStatus.isOnline,
        keyboardOpen,
        detectedQrPoints,
        detectedSourceWidth,
        detectedSourceHeight,
        onRegisterMedia: ({ videoEl: v, imgEl: i }) => {
          videoEl = v;
          imgEl = i;
        },
      },
      callbacks: {
        onBack,
        onScanTicket: () => {
          void handleManualCameraScan();
        },
        onInputTicketCode: (code) => {
          ticketCode = code;
          if (status === 'error') {
            status = 'idle';
            statusMessage = '';
          }
        },
        onSubmitTicket: (code) => {
          const effective = code.trim() || ticketCode.trim();
          void verifyTicketCode(effective);
        },
        onToggleTicketKeyboard: () => {
          keyboardOpen = !keyboardOpen;
        },
      },
    }),
  );
</script>

<div class="w-full h-full relative">
  {#if !networkStatus.isOnline}
    <div class="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <OfflineBanner />
    </div>
  {/if}

  <GenericScreen {doc} screenKey="ticket" {adapter} interactive={true} fitMode="screen" />

  {#if keyboardOpen}
    <div class="fixed inset-0 z-[100] pointer-events-none flex items-end justify-center pb-6">
      <div class="pointer-events-auto">
        <OnScreenKeyboard
          open={keyboardOpen}
          activeField="ticket"
          availableFields={[{ id: 'ticket', label: 'Kode Tiket' }]}
          onKeyPress={handleKeyboardPress}
          onSubmit={() => {
            keyboardOpen = false;
            void verifyTicketCode(ticketCode);
          }}
          onClose={() => (keyboardOpen = false)}
        />
      </div>
    </div>
  {/if}
</div>
