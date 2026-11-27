<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Camera } from '@lucide/svelte';
  import { invoke } from '@tauri-apps/api/core';
  import {
    GenericScreen,
    type AdapterTemplate,
    type DesignBlocksDocument,
  } from '@potohub/booth-ui';
  import { cameraStore } from '$lib/camera.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import {
    runCaptureSequence,
    extractAndPersistSlotClip,
    type PauseDecisionAction,
  } from '$lib/utils/capture';
  import {
    fetchTemplates,
    requireActiveBoothId,
    type BoothTemplate,
  } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';
  import {
    recordCapturedSlotToCheckpoint,
    updateCheckpointTotalSlots,
  } from '$lib/utils/activeSessionCheckpoint';
  import {
    getTotalPhotosNeeded,
    getTemplateLayers,
    preloadAndResolveTemplateAssets,
  } from '$lib/utils/templateComposite';
  import { createDesktopUiAdapter } from '$lib/adapters/boothUiAdapter.svelte';

  interface Props {
    doc: DesignBlocksDocument;
    frameConfigId?: string;
    onComplete: (photos: string[]) => void;
    onBack?: () => void;
  }

  let { doc, frameConfigId = '', onComplete, onBack }: Props = $props();

  let templatesData = $state<BoothTemplate[]>([]);
  let selectedTemplate = $state<BoothTemplate | null>(null);
  let templateLayers = $derived(getTemplateLayers(selectedTemplate));
  let totalPhotos = $derived(getTotalPhotosNeeded(templateLayers, 4));

  $effect(() => {
    if (selectedTemplate && totalPhotos > 0) {
      void updateCheckpointTotalSlots(totalPhotos);
    }
  });

  let sessionSecs = $state(boothConfig.config.photoSessionTimeSecs || 60);
  let isRunning = $state(false);
  let isPausedBetweenCaptures = $state(false);
  let pausedSlotIndex = $state<number | null>(null);
  let pauseResolver = $state<((decision: PauseDecisionAction) => void) | null>(null);
  let selectedRetakeIndex = $state<number | null>(null);
  let currentCapturingSlot = $state(0);
  let timer: any = null;
  let liveviewInterval: any = null;
  let frameSrc = $state('');

  let cameraDisconnectModal = $state(false);
  let cameraDisconnectResolver = $state<((reconnected: boolean) => void) | null>(null);

  let cameraBlock = $derived(
    doc.screens.session?.blocks.find((b) => b.type === 'camera_preview'),
  );
  let pauseAfterCaptureEnabled = $derived(
    Boolean(cameraBlock?.props?.pauseAfterCapture),
  );

  async function handleCameraDisconnect(): Promise<boolean> {
    cameraDisconnectModal = true;
    return new Promise<boolean>((resolve) => {
      cameraDisconnectResolver = resolve;
    });
  }

  async function retryCameraConnection() {
    if (boothConfig.config.cameraMode) {
      await cameraStore.connect(boothConfig.config.cameraMode);
    }
    if (cameraStore.status === 'connected') {
      cameraDisconnectModal = false;
      if (cameraDisconnectResolver) {
        cameraDisconnectResolver(true);
        cameraDisconnectResolver = null;
      }
    }
  }

  function abortCameraDisconnect() {
    cameraDisconnectModal = false;
    if (cameraDisconnectResolver) {
      cameraDisconnectResolver(false);
      cameraDisconnectResolver = null;
    }
  }

  onMount(async () => {
    timer = setInterval(() => {
      if (sessionSecs > 0) {
        sessionSecs--;
        if (sessionSecs === 0) {
          clearInterval(timer);
          if (!isRunning) {
            onComplete(boothFlow.photosTaken);
          } else {
            const checkDone = setInterval(() => {
              if (!isRunning) {
                clearInterval(checkDone);
                onComplete(boothFlow.photosTaken);
              }
            }, 300);
          }
        }
      }
    }, 1000);

    const templatePromise = (async () => {
      try {
        const boothId = await requireActiveBoothId();
        await cachedFetch(
          `templates:${boothId}`,
          () => fetchTemplates(boothId),
          (templates) => {
            templatesData = templates;
            preloadAndResolveTemplateAssets(templates);
            const matched = templates.find((t) => t.id === frameConfigId);
            if (matched) {
              selectedTemplate = matched;
            } else if (templates[0]) {
              selectedTemplate = templates[0];
            }
          },
        );
      } catch (err) {
        console.error('[KioskSessionWrapper] Failed to load template:', err);
      }
    })();

    await cameraStore.checkDevMode();
    if ((cameraStore.isDevMode || cameraStore.cameraMode === 'webcam') && cameraStore.cameraMode !== 'demo') {
      cameraStore.cameraMode = 'webcam';
    }
    await cameraStore.startLiveview(null);

    if (cameraStore.cameraMode === 'usb' || cameraStore.cameraMode === 'demo') {
      const firstFrame = await cameraStore.getLiveviewFrame();
      if (firstFrame) {
        frameSrc = firstFrame;
      }
      let fetchingFrame = false;
      liveviewInterval = setInterval(async () => {
        if (fetchingFrame) return;
        fetchingFrame = true;
        try {
          const url = await cameraStore.getLiveviewFrame();
          if (url) {
            frameSrc = url;
          }
        } finally {
          fetchingFrame = false;
        }
      }, 40);
    }

    await templatePromise;
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (liveviewInterval) clearInterval(liveviewInterval);
    cameraStore.stopLiveview();
  });

  async function handlePauseAfterSlot(slotIdx: number): Promise<PauseDecisionAction> {
    isPausedBetweenCaptures = true;
    pausedSlotIndex = slotIdx;
    selectedRetakeIndex = slotIdx;
    return new Promise<PauseDecisionAction>((resolve) => {
      pauseResolver = resolve;
    });
  }

  function resolvePauseDecision(decision: PauseDecisionAction) {
    if (!pauseResolver) return;
    const fn = pauseResolver;
    pauseResolver = null;
    isPausedBetweenCaptures = false;
    if (decision === 'next') {
      pausedSlotIndex = null;
      selectedRetakeIndex = null;
    }
    fn(decision);
  }

  async function handleStartSession() {
    if (isRunning) return;
    isRunning = true;
    selectedRetakeIndex = null;
    isPausedBetweenCaptures = false;
    pausedSlotIndex = null;

    const currentValidPhotos = boothFlow.photosTaken.filter(Boolean);
    const startSlot =
      currentValidPhotos.length >= totalPhotos ? 0 : currentValidPhotos.length;
    if (startSlot === 0) {
      boothFlow.photosTaken = [];
      boothFlow.liveviewClips = [];
    }
    currentCapturingSlot = startSlot;

    await runCaptureSequence({
      slotCount: totalPhotos,
      countdownSecs: boothConfig.config.countdownSecs,
      startSlot,
      pauseAfterCapture: pauseAfterCaptureEnabled,
      onCapturePhoto: (_url, slotIdx) => {
        currentCapturingSlot = slotIdx;
      },
      onPauseAfterSlot: (slotIdx) => handlePauseAfterSlot(slotIdx),
      onCameraDisconnect: handleCameraDisconnect,
    });

    isPausedBetweenCaptures = false;
    pausedSlotIndex = null;
    isRunning = false;

    if (boothFlow.photosTaken.filter(Boolean).length >= totalPhotos) {
      selectedRetakeIndex = pauseAfterCaptureEnabled ? Math.max(0, totalPhotos - 1) : 0;
    }
  }

  async function handleRetakeSingle(index: number) {
    if (isRunning) return;
    isRunning = true;
    currentCapturingSlot = index;

    for (let c = boothConfig.config.countdownSecs; c > 0; c--) {
      boothFlow.countdown = c;
      if (c === 1 && cameraStore.cameraMode === 'usb') {
        await new Promise((r) => setTimeout(r, 800));
        cameraStore.setPreparingCapture(true);
        await new Promise((r) => setTimeout(r, 200));
      } else {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    boothFlow.countdown = null;
    const captureTs = Date.now();

    boothFlow.isFlashActive = true;
    boothFlow.captureMessage = 'Sedang capture kamera...';

    try {
      const capturePromise = cameraStore.capture();
      await new Promise((r) => setTimeout(r, 220));
      boothFlow.isFlashActive = false;
      boothFlow.isCapturingCamera = true;

      let bytes = await capturePromise;
      if (!bytes && cameraStore.cameraMode === 'usb') {
        await new Promise((r) => setTimeout(r, 500));
        await cameraStore.connect('usb');
        bytes = await cameraStore.capture();
      }

      if (!bytes && (cameraStore.status !== 'connected' || cameraStore.cameraMode === 'usb')) {
        boothFlow.captureMessage = 'Kamera tidak merespon, mencoba memulihkan...';
        const reconnected = await handleCameraDisconnect();
        if (reconnected) {
          isRunning = false;
          await handleRetakeSingle(index);
          return;
        }
      }

      let photoUrl = '';
      if (bytes && bytes.length > 0) {
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        photoUrl = URL.createObjectURL(blob);
        try {
          const sessionCode = boothFlow.sessionCode || `LOCAL-${Date.now()}`;
          const date = new Date().toISOString().slice(0, 10);
          const relPath = `${date}/${sessionCode}/raw/slot_${String(index + 1).padStart(2, '0')}.jpg`;
          await invoke('save_session_file', {
            relativePath: relPath,
            bytes: Array.from(bytes),
          });
          await recordCapturedSlotToCheckpoint(index, relPath);
        } catch (saveErr) {
          console.warn('[KioskSessionWrapper] Gagal menulis retake ke disk:', saveErr);
        }
      } else if (cameraStore.currentLiveviewUrl) {
        try {
          const resp = await fetch(cameraStore.currentLiveviewUrl);
          const arrayBuf = await resp.arrayBuffer();
          const persistentBlob = new Blob([arrayBuf], { type: 'image/jpeg' });
          photoUrl = URL.createObjectURL(persistentBlob);
        } catch {
          photoUrl = '';
        }
      }

      if (photoUrl) {
        const updated = [...boothFlow.photosTaken];
        updated[index] = photoUrl;
        boothFlow.photosTaken = updated;
        selectedRetakeIndex = index;
      }

      if (boothConfig.config.enableLiveviewVideo) {
        void extractAndPersistSlotClip(index, captureTs);
      }

      if (cameraStore.cameraMode === 'usb') {
        boothFlow.captureMessage = 'Menyiapkan liveview...';
        await cameraStore.getLiveviewFrame().catch(() => {});
      }
    } catch (err) {
      console.error('[KioskSessionWrapper] Retake capture error:', err);
    } finally {
      cameraStore.setPreparingCapture(false);
      boothFlow.isFlashActive = false;
      boothFlow.isCapturingCamera = false;
      boothFlow.captureMessage = null;
      isRunning = false;
    }
  }

  let allDone = $derived(
    boothFlow.photosTaken.filter(Boolean).length >= totalPhotos,
  );
  let activeRetakeIdx = $derived(
    selectedRetakeIndex !== null
      ? selectedRetakeIndex
      : isPausedBetweenCaptures && pausedSlotIndex !== null
        ? pausedSlotIndex
        : allDone
          ? 0
          : null,
  );

  let mappedActiveTemplate = $derived<AdapterTemplate | null>(
    selectedTemplate
      ? {
          id: selectedTemplate.id,
          category_id: selectedTemplate.category_id,
          name: selectedTemplate.name,
          width: selectedTemplate.width,
          height: selectedTemplate.height,
          design_data: selectedTemplate.design_data,
          frame_image_url: selectedTemplate.frame_image_url,
          preview_image_url: selectedTemplate.preview_image_url,
          preview_blur: selectedTemplate.preview_blur,
        }
      : null,
  );

  let adapter = $derived(
    createDesktopUiAdapter({
      categories: [],
      templates: templatesData.map((t) => ({
        id: t.id,
        category_id: t.category_id,
        name: t.name,
        width: t.width,
        height: t.height,
        design_data: t.design_data,
        frame_image_url: t.frame_image_url,
        preview_image_url: t.preview_image_url,
        preview_blur: t.preview_blur,
      })),
      frameSrc,
      session: {
        currentPhotoIndex:
          isPausedBetweenCaptures && pausedSlotIndex !== null
            ? pausedSlotIndex + 1
            : Math.min(totalPhotos, currentCapturingSlot + 1),
        totalPhotos,
        sessionSecs,
        countdown: boothFlow.countdown,
        isRunning,
        isCapturing: boothFlow.isCapturingCamera,
        isFlashActive: boothFlow.isFlashActive,
        captureMessage: boothFlow.captureMessage,
        isPausedAfterCapture: isPausedBetweenCaptures,
        allPhotosDone: allDone,
        canRetake:
          isPausedBetweenCaptures ||
          (!isRunning &&
            (allDone ||
              (selectedRetakeIndex !== null &&
                Boolean(boothFlow.photosTaken[selectedRetakeIndex])))),
        canNextPhoto: isPausedBetweenCaptures || (!isRunning && allDone),
        pauseAfterCapture: pauseAfterCaptureEnabled,
        mirrorOn: boothConfig.config.mirrorOn,
        capturedPhotos: boothFlow.photosTaken,
        activeTemplate: mappedActiveTemplate,
        selectedSlotIndex: activeRetakeIdx,
        onSelectSlot: (slotIdx: number) => {
          if (boothFlow.photosTaken[slotIdx]) {
            selectedRetakeIndex = slotIdx;
          }
        },
      },
      callbacks: {
        onBack,
        onToggleMirror: () => {
          boothConfig.save({ mirrorOn: !boothConfig.config.mirrorOn });
        },
        onCapturePhoto: () => {
          if (isPausedBetweenCaptures) {
            resolvePauseDecision('next');
            return;
          }
          if (!isRunning && !allDone) {
            void handleStartSession();
          } else if (allDone && !isRunning && activeRetakeIdx !== null) {
            void handleRetakeSingle(activeRetakeIdx);
          }
        },
        onRetakePhoto: (slotIdx?: number) => {
          if (isPausedBetweenCaptures) {
            resolvePauseDecision('retake');
            return;
          }
          const target =
            slotIdx !== undefined
              ? slotIdx
              : activeRetakeIdx !== null
                ? activeRetakeIdx
                : 0;
          void handleRetakeSingle(target);
        },
        onNextPhoto: () => {
          if (isPausedBetweenCaptures) {
            resolvePauseDecision('next');
            return;
          }
          if (allDone && !isRunning) {
            onComplete(boothFlow.photosTaken);
          } else if (!isRunning) {
            void handleStartSession();
          }
        },
      },
    }),
  );
</script>

<div class="w-full h-full relative">
  <GenericScreen {doc} screenKey="session" {adapter} interactive={true} fitMode="screen" />

  {#if cameraDisconnectModal}
    <div class="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-6 text-center select-none font-['Poppins',sans-serif]">
      <div class="bg-[#181824] border border-amber-500/40 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center">
        <div class="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
          <Camera size={36} class="animate-bounce" />
        </div>
        <h3 class="text-2xl font-black text-white mb-2">Kamera Terputus!</h3>
        <p class="text-white/70 text-sm mb-6 leading-relaxed">
          Koneksi kamera fisik terputus di tengah pemotretan. Mohon periksa kabel USB atau nyalakan kembali kamera. Foto yang sudah diambil tetap tersimpan aman.
        </p>
        <div class="flex flex-col gap-3 w-full">
          <button
            type="button"
            onclick={retryCameraConnection}
            class="w-full py-3.5 rounded-full font-bold text-base text-black bg-amber-400 hover:bg-amber-300 transition-all cursor-pointer shadow-lg active:scale-95"
          >
            Coba Sambungkan & Lanjutkan
          </button>
          <button
            type="button"
            onclick={abortCameraDisconnect}
            class="w-full py-3 rounded-full font-semibold text-sm text-white/60 hover:text-white bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
          >
            Batalkan Sesi
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
