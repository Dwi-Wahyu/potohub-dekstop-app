<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Search, RotateCw, FlipHorizontal2, Camera, RefreshCw, ArrowRight, Loader2 } from '@lucide/svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { cameraStore } from '$lib/camera.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { runCaptureSequence, extractAndPersistSlotClip, type PauseDecisionAction } from '$lib/utils/capture';
  import { formatTime, getLiveviewTransformStyle } from '$lib/utils/shared';
  import { fetchTemplates, requireActiveBoothId, type BoothTemplate } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';
  import { recordCapturedSlotToCheckpoint, updateCheckpointTotalSlots } from '$lib/utils/activeSessionCheckpoint';
  import {
    getSortedPhotoSlots,
    getTotalPhotosNeeded,
    findPhotoSlotIndex,
    getTemplateLayers,
    getLayerZIndex,
    getTemplatePreviewBoxStyle,
    preloadAndResolveTemplateAssets
  } from '$lib/utils/templateComposite';

  interface Props {
    onComplete: (photos: string[]) => void;
    onBack?: () => void;
    frameConfigId?: string;
    background?: string;
  }

  let { onComplete, frameConfigId = '', background }: Props = $props();

  let selectedTemplate = $state<BoothTemplate | null>(null);
  let templateLayers = $derived(getTemplateLayers(selectedTemplate));
  let photoSlots = $derived(getSortedPhotoSlots(templateLayers));
  let totalPhotos = $derived(getTotalPhotosNeeded(templateLayers, 4));
  let bgLayer = $derived(templateLayers.find((l) => l.isBackground));
  let bgUrl = $derived(bgLayer?.imageUrl || selectedTemplate?.frame_image_url || '');

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
  let timer: any = null;
  let liveviewInterval: any = null;
  let frameSrc = $state('');
  let videoEl = $state<HTMLVideoElement | null>(null);

  // Read granular session customization from uiConfig.resolvedDesignBlocks.screens.session
  let sessionBlocks = $derived(uiConfig.resolvedDesignBlocks?.screens?.session?.blocks ?? []);
  let cameraBlock = $derived(sessionBlocks.find((b) => b.type === 'camera_preview'));
  let retakeBtnBlock = $derived(sessionBlocks.find((b) => b.type === 'session_retake_button'));
  let nextPhotoBtnBlock = $derived(sessionBlocks.find((b) => b.type === 'session_next_photo_button'));
  let shutterBtnBlock = $derived(sessionBlocks.find((b) => b.type === 'shutter_button'));
  let framePreviewBlock = $derived(sessionBlocks.find((b) => b.type === 'session_frame_preview'));

  let pauseAfterCaptureEnabled = $derived(Boolean(cameraBlock?.props?.pauseAfterCapture));
  let customFrameOverlayUrl = $derived(
    cameraBlock?.props?.frameOverlayUrl
      ? uiConfig.resolveAssetUrl(String(cameraBlock.props.frameOverlayUrl))
      : '',
  );
  let counterBgColor = $derived(
    String(cameraBlock?.props?.counterBgColor ?? 'rgba(0, 0, 0, 0.65)'),
  );
  let counterTextColor = $derived(String(cameraBlock?.props?.counterTextColor ?? '#ffffff'));
  let counterBorderColor = $derived(String(cameraBlock?.props?.counterBorderColor ?? '#ffffff'));

  let customLoaderMediaUrl = $derived(
    cameraBlock?.props?.loaderMediaUrl
      ? uiConfig.resolveAssetUrl(String(cameraBlock.props.loaderMediaUrl))
      : '',
  );
  let customLoaderMediaType = $derived(
    String(cameraBlock?.props?.loaderMediaType ?? '') ||
      (customLoaderMediaUrl.toLowerCase().includes('.mp4') ? 'video' : 'gif'),
  );
  let customLoaderTitle = $derived(
    String(cameraBlock?.props?.loaderTitle ?? 'Sedang capture kamera...'),
  );
  let customLoaderSubtitle = $derived(
    String(
      cameraBlock?.props?.loaderSubtitle ??
        'Tahan pose, foto sedang diproses dan live preview sedang disiapkan...',
    ),
  );
  let customLoaderBgColor = $derived(
    String(cameraBlock?.props?.loaderBgColor ?? 'rgba(0, 0, 0, 0.78)'),
  );
  let customLoaderAccentColor = $derived(
    String(cameraBlock?.props?.loaderAccentColor ?? uiConfig.config.primaryColor),
  );

  let retakeButtonLabel = $derived(String(retakeBtnBlock?.props?.label ?? 'RETAKE PHOTO'));
  let nextPhotoButtonLabel = $derived(String(nextPhotoBtnBlock?.props?.label ?? 'NEXT PHOTO'));
  let finishSessionButtonLabel = $derived(
    String(nextPhotoBtnBlock?.props?.finishLabel ?? 'Lanjut'),
  );
  let showStripFrameBlock = $derived(framePreviewBlock ? framePreviewBlock.visible !== false : true);

  // Intra-Capture Cue Overlay settings ("Lihat ke kamera" + multi-chevron / flash / custom media)
  let intraCaptureScope = $derived(
    String(cameraBlock?.props?.intraCaptureScope ?? 'viewfinder') === 'fullscreen'
      ? 'fullscreen'
      : 'viewfinder',
  );
  let intraCaptureMode = $derived(String(cameraBlock?.props?.intraCaptureMode ?? 'chevron_up'));
  let intraCaptureText = $derived(String(cameraBlock?.props?.intraCaptureText ?? 'Lihat ke kamera'));
  let intraCaptureSubtext = $derived(String(cameraBlock?.props?.intraCaptureSubtext ?? ''));
  let intraCaptureShowChevrons = $derived(cameraBlock?.props?.intraCaptureShowChevrons !== false);
  let customIntraCaptureMediaUrl = $derived(
    cameraBlock?.props?.intraCaptureMediaUrl
      ? uiConfig.resolveAssetUrl(String(cameraBlock.props.intraCaptureMediaUrl))
      : '',
  );
  let customIntraCaptureMediaType = $derived(
    String(cameraBlock?.props?.intraCaptureMediaType ?? '') ||
      (customIntraCaptureMediaUrl.toLowerCase().includes('.mp4') ? 'video' : 'image'),
  );
  let intraCaptureBgColor = $derived(
    String(cameraBlock?.props?.intraCaptureBgColor ?? 'transparent'),
  );
  let intraCaptureTextColor = $derived(
    String(cameraBlock?.props?.intraCaptureTextColor ?? '#ffffff'),
  );
  let intraCaptureAccentColor = $derived(
    String(cameraBlock?.props?.intraCaptureAccentColor ?? '#ffffff'),
  );
  let intraCaptureDuration = $derived(
    Math.min(5, Math.max(0.5, Number(cameraBlock?.props?.intraCaptureDuration ?? 1.5))),
  );
  let isIntraCaptureCueActive = $derived(
    intraCaptureMode !== 'flash_only' &&
      !boothFlow.isCapturingCamera &&
      boothFlow.isIntraCaptureActive,
  );

  // Modal kamera terputus
  let cameraDisconnectModal = $state(false);
  let cameraDisconnectResolver = $state<((reconnected: boolean) => void) | null>(null);

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

  function playStream(node: HTMLVideoElement, stream: MediaStream | null) {
    cameraStore.setVideoElement(node);
    if (stream) {
      node.srcObject = stream;
      node.muted = true;
      node.playsInline = true;
      node.play().catch(() => {});
    }
    return {
      update(newStream: MediaStream | null) {
        cameraStore.setVideoElement(node);
        if (newStream) {
          node.srcObject = newStream;
          node.muted = true;
          node.playsInline = true;
          node.play().catch(() => {});
        } else {
          node.srcObject = null;
        }
      },
      destroy() {
        cameraStore.setVideoElement(null);
        node.srcObject = null;
      }
    };
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
            preloadAndResolveTemplateAssets(templates);
            const matched = templates.find((t) => t.id === frameConfigId);
            if (matched) {
              selectedTemplate = matched;
            } else if (templates[0]) {
              selectedTemplate = templates[0];
            }
          }
        );
      } catch (err) {
        console.error('[V1Camera] Failed to load template:', err);
      }
    })();

    await cameraStore.startLiveview(videoEl);

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

    // Jika sudah ada foto tersimpan dari checkpoint pemulihan, lanjutkan dari slot berikutnya
    const currentValidPhotos = boothFlow.photosTaken.filter(Boolean);
    const startSlot = currentValidPhotos.length >= totalPhotos ? 0 : currentValidPhotos.length;
    if (startSlot === 0) {
      boothFlow.photosTaken = [];
      boothFlow.liveviewClips = [];
    }

    await runCaptureSequence({
      slotCount: totalPhotos,
      countdownSecs: boothConfig.config.countdownSecs,
      startSlot,
      pauseAfterCapture: pauseAfterCaptureEnabled,
      intraCaptureMode,
      intraCaptureDurationSecs: intraCaptureDuration,
      onPauseAfterSlot: (slotIdx) => handlePauseAfterSlot(slotIdx),
      onCameraDisconnect: handleCameraDisconnect,
    });

    isPausedBetweenCaptures = false;
    pausedSlotIndex = null;
    isRunning = false;
  }

  async function handleRetakeSingle(index: number) {
    if (isRunning) return;
    isRunning = true;

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

    // Setelah timer countdown selesai, jalankan Intra-Capture Screen tepat saat capture kamera
    if (intraCaptureMode === 'flash_only') {
      boothFlow.isFlashActive = true;
      boothFlow.isIntraCaptureActive = false;
    } else {
      boothFlow.isFlashActive = false;
      boothFlow.isIntraCaptureActive = true;
    }
    boothFlow.captureMessage = 'Sedang capture kamera...';

    try {
      const capturePromise = cameraStore.capture();

      if (intraCaptureMode === 'flash_only') {
        await new Promise((r) => setTimeout(r, 220));
        boothFlow.isFlashActive = false;
      } else {
        const cueMs = Math.min(5000, Math.max(500, Math.round(intraCaptureDuration * 1000)));
        await new Promise((r) => setTimeout(r, cueMs));
        boothFlow.isIntraCaptureActive = false;
      }
      boothFlow.isCapturingCamera = true;

      let bytes = await capturePromise;
      if (!bytes && cameraStore.cameraMode === 'usb') {
        console.warn(`[V1Camera] Retake slot ${index + 1} null, coba connect & retry dalam 500ms...`);
        await new Promise((r) => setTimeout(r, 500));
        await cameraStore.connect('usb');
        bytes = await cameraStore.capture();
      }

      if (!bytes && (cameraStore.status !== 'connected' || cameraStore.cameraMode === 'usb')) {
        boothFlow.captureMessage = 'Kamera tidak merespon, mencoba memulihkan...';
        const reconnected = await handleCameraDisconnect();
        if (reconnected) {
          await handleRetakeSingle(index);
          return;
        }
      }

      let photoUrl = '';
      if (bytes && bytes.length > 0) {
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        photoUrl = URL.createObjectURL(blob);

        // Simpan instan hasil retake ke disk lokal & checkpoint
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
          console.warn('[V1Camera] Gagal menulis retake ke disk:', saveErr);
        }
      } else {
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
            ctx.fillText(`Photo ${index + 1}`, canvas.width / 2, canvas.height / 2);
            photoUrl = canvas.toDataURL('image/jpeg');
          }
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
      console.error('Retake capture error:', err);
    } finally {
      cameraStore.setPreparingCapture(false);
      boothFlow.isFlashActive = false;
      boothFlow.isIntraCaptureActive = false;
      boothFlow.isCapturingCamera = false;
      boothFlow.captureMessage = null;
      isRunning = false;
    }
  }

  let allDone = $derived(boothFlow.photosTaken.filter(Boolean).length >= totalPhotos);
  let activeRetakeIdx = $derived(
    selectedRetakeIndex !== null
      ? selectedRetakeIndex
      : isPausedBetweenCaptures && pausedSlotIndex !== null
        ? pausedSlotIndex
        : allDone
          ? 0
          : null,
  );
  let showCapturedReviewOverlay = $derived(
    ((allDone && !isRunning) || isPausedBetweenCaptures) &&
      activeRetakeIdx !== null &&
      Boolean(boothFlow.photosTaken[activeRetakeIdx]),
  );

  const DEFAULT_BG = 'linear-gradient(135deg, #1e1b4b 0%, #2a2873 50%, #312e81 100%)';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('session').background ?? DEFAULT_BG);
</script>

<div
  class="w-full h-full overflow-hidden relative flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif]"
  style:background={effectiveBg}
>

  <div class="relative z-10 flex flex-row items-center justify-center w-full box-border gap-[clamp(40px,4.5vw,88px)] px-[clamp(40px,5vw,100px)] py-6">
    <!-- Viewfinder card (16:9 ratio) -->
    <div
      class="shrink-0 rounded-[26px] overflow-hidden relative bg-[#0a0910] aspect-video"
      style="
        width: calc((100vh - 48px) * (16 / 9));
        max-width: 58vw;
        height: calc(100vh - 48px);
        box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 64px 140px rgba(0,0,0,0.95);
      "
    >
      {#if boothFlow.isFlashActive}
        <div class="absolute inset-0 bg-white z-50 pointer-events-none transition-opacity duration-150"></div>
      {/if}

      <!-- Permanent Liveview Feed Layer -->
      {#if cameraStore.isLiveviewActive || frameSrc}
        {#if cameraStore.cameraMode === 'webcam'}
          <video
            use:playStream={cameraStore.stream}
            bind:this={videoEl}
            autoplay
            playsinline
            muted
            class="w-full h-full object-cover block"
            style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
          ></video>
        {:else if frameSrc}
          <img
            src={frameSrc}
            alt="Live camera feed"
            class="w-full h-full object-cover block"
            style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
          />
        {:else}
          <div class="w-full h-full bg-[#111117] flex items-center justify-center text-white/40">
            Loading Live Preview...
          </div>
        {/if}
      {:else}
        <div class="w-full h-full bg-[#111117] flex items-center justify-center text-white/40">
          Kamera Offline
        </div>
      {/if}

      <!-- Captured Photo Overlay Layer - Shown when allDone or paused after capture -->
      {#if showCapturedReviewOverlay && activeRetakeIdx !== null}
        <img
          src={boothFlow.photosTaken[activeRetakeIdx]}
          alt={`Photo slot ${activeRetakeIdx + 1}`}
          class="absolute inset-0 w-full h-full object-cover z-20 block"
          style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
        />
      {/if}

      <!-- Custom Viewfinder Frame Overlay from UI Customize -->
      {#if customFrameOverlayUrl}
        <img
          src={customFrameOverlayUrl}
          alt="Viewfinder Frame Overlay"
          class="absolute inset-0 w-full h-full object-fill pointer-events-none select-none z-25"
        />
      {/if}

      <!-- Pause After Each Capture Action Bar (Retake Photo / Next Photo) -->
      {#if isPausedBetweenCaptures && pausedSlotIndex !== null}
        <div class="absolute bottom-7 left-0 right-0 z-35 flex items-center justify-center gap-4 px-8">
          <button
            type="button"
            onclick={() => resolvePauseDecision('retake')}
            class="px-7 py-3.5 rounded-xl font-extrabold text-base uppercase tracking-wider flex items-center gap-2.5 shadow-2xl border-2 cursor-pointer transition-transform active:scale-95"
            style="
              background: {retakeBtnBlock?.style?.bgColor ?? '#eef6f6'};
              color: {retakeBtnBlock?.style?.textColor ?? '#4a5568'};
              border-color: {retakeBtnBlock?.style?.borderColor ?? '#1a1a1e'};
            "
          >
            <span>{retakeButtonLabel} #{pausedSlotIndex + 1}</span>
            <RotateCw size={18} />
          </button>

          <button
            type="button"
            onclick={() => resolvePauseDecision('next')}
            class="px-7 py-3.5 rounded-xl font-extrabold text-base uppercase tracking-wider flex items-center gap-2.5 shadow-2xl border-2 cursor-pointer transition-transform active:scale-95"
            style="
              background: {nextPhotoBtnBlock?.style?.bgColor ?? '#eef6f6'};
              color: {nextPhotoBtnBlock?.style?.textColor ?? '#4a5568'};
              border-color: {nextPhotoBtnBlock?.style?.borderColor ?? '#1a1a1e'};
            "
          >
            <span>
              {pausedSlotIndex + 1 >= totalPhotos ? finishSessionButtonLabel : nextPhotoButtonLabel}
            </span>
            <ArrowRight size={18} />
          </button>
        </div>
      {/if}

      <!-- Top-left Retake button when allDone and not running capture -->
      {#if allDone && !isRunning && activeRetakeIdx !== null && boothFlow.photosTaken[activeRetakeIdx]}
        <div class="absolute top-5 left-5 z-30 flex items-center gap-3">
          <button
            onclick={() => handleRetakeSingle(activeRetakeIdx!)}
            class="flex items-center gap-2 bg-black/80 hover:bg-black text-white border border-white/30 px-5 py-2.5 rounded-full font-bold text-xs shadow-xl backdrop-blur-md cursor-pointer transition-transform active:scale-95"
          >
            <RotateCw size={15} />
            <span>{retakeButtonLabel} #{activeRetakeIdx + 1}</span>
          </button>
        </div>
      {/if}

      <!-- Top-right Mirror toggle button when customer hasn't started session -->
      {#if !isRunning && !allDone}
        <div class="absolute top-5 right-5 z-30 flex items-center gap-3">
          <button
            type="button"
            onclick={() => boothConfig.save({ mirrorOn: !boothConfig.config.mirrorOn })}
            class={`flex items-center gap-2 border px-4 py-2 rounded-full font-bold text-xs shadow-xl backdrop-blur-md cursor-pointer transition-all active:scale-95 ${
              boothConfig.config.mirrorOn
                ? 'bg-black/80 hover:bg-black text-white border-white/40'
                : 'bg-black/40 hover:bg-black/60 text-white/70 border-white/20'
            }`}
            title="Toggle Mirror Kamera"
          >
            <FlipHorizontal2 size={15} />
            <span>MIRROR: {boothConfig.config.mirrorOn ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      {/if}

      <!-- Customizable Countdown Overlay -->
      {#if boothFlow.countdown !== null && boothFlow.countdown > 0 && !isIntraCaptureCueActive}
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div
            class="w-36 h-36 rounded-full border-4 flex items-center justify-center text-6xl font-extrabold shadow-2xl"
            style="
              background: {counterBgColor};
              color: {counterTextColor};
              border-color: {counterBorderColor};
            "
          >
            {boothFlow.countdown}
          </div>
        </div>
      {/if}

      <!-- Intra-Capture Cue Overlay inside Viewfinder (when intraCaptureScope === 'viewfinder') -->
      {#if isIntraCaptureCueActive && intraCaptureScope === 'viewfinder'}
        <div
          class="absolute inset-0 z-35 backdrop-blur-[2px] flex flex-col items-center justify-between py-10 px-6 text-center pointer-events-none select-none"
          style="background: {intraCaptureBgColor};"
        >
          {#if intraCaptureMode === 'chevron_up' || intraCaptureShowChevrons}
            <div class="flex flex-col items-center -space-y-2.5 animate-bounce" style="color: {intraCaptureAccentColor};">
              <svg width="48" height="26" viewBox="0 0 44 24" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" class="opacity-55">
                <path d="M6 19L22 5L38 19" />
              </svg>
              <svg width="48" height="26" viewBox="0 0 44 24" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" class="opacity-80">
                <path d="M6 19L22 5L38 19" />
              </svg>
              <svg width="48" height="26" viewBox="0 0 44 24" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 19L22 5L38 19" />
              </svg>
            </div>
          {:else}
            <div></div>
          {/if}

          <div class="flex flex-col items-center justify-center gap-3 my-auto">
            {#if (intraCaptureMode === 'custom' || intraCaptureMode === 'custom_media' || (!intraCaptureMode.includes('flash') && customIntraCaptureMediaUrl)) && customIntraCaptureMediaUrl}
              <div class="max-w-[280px] max-h-[220px] flex items-center justify-center pointer-events-none bg-transparent">
                {#if customIntraCaptureMediaType === 'video'}
                  <video
                    src={customIntraCaptureMediaUrl}
                    autoplay
                    loop
                    muted
                    playsinline
                    class="max-w-full max-h-full object-contain block bg-transparent"
                  ></video>
                {:else}
                  <img
                    src={customIntraCaptureMediaUrl}
                    alt="Intra capture cue"
                    class="max-w-full max-h-full object-contain block bg-transparent"
                  />
                {/if}
              </div>
            {/if}

            {#if intraCaptureText}
              <div
                class="text-4xl font-extrabold tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.75)]"
                style="color: {intraCaptureTextColor};"
              >
                {intraCaptureText}
              </div>
            {/if}
            {#if intraCaptureSubtext}
              <div class="text-sm font-semibold opacity-85" style="color: {intraCaptureTextColor};">
                {intraCaptureSubtext}
              </div>
            {/if}
            {#if Array.isArray(cameraBlock?.props?.intraCaptureExtraTexts)}
              {#each cameraBlock.props.intraCaptureExtraTexts as extraTxt}
                {#if extraTxt}
                  <div class="text-sm font-semibold opacity-90 drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] text-white">
                    {extraTxt}
                  </div>
                {/if}
              {/each}
            {/if}
          </div>

          <div class="h-6"></div>
        </div>
      {/if}

      <!-- Overlay status saat sedang capture & menstabilkan liveview kamera (Supports Custom Video MP4 / GIF Loader) -->
      {#if boothFlow.isCapturingCamera}
        <div
          class="absolute inset-0 backdrop-blur-sm z-40 flex flex-col items-center justify-center p-6 text-center select-none pointer-events-auto"
          style="background: {customLoaderBgColor};"
        >
          {#if customLoaderMediaUrl}
            <div
              class="rounded-2xl overflow-hidden shadow-2xl border-2 mb-4 flex items-center justify-center bg-black/30"
              style="border-color: {customLoaderAccentColor}; max-width: 220px; max-height: 220px;"
            >
              {#if customLoaderMediaType === 'video'}
                <video
                  src={customLoaderMediaUrl}
                  autoplay
                  loop
                  muted
                  playsinline
                  class="max-w-[220px] max-h-[220px] w-auto h-auto object-contain block"
                ></video>
              {:else}
                <img
                  src={customLoaderMediaUrl}
                  alt="Loading"
                  class="max-w-[220px] max-h-[220px] w-auto h-auto object-contain block"
                />
              {/if}
            </div>
          {:else}
            <div
              class="w-20 h-20 rounded-full flex items-center justify-center mb-4 text-white shadow-2xl"
              style="background: {customLoaderAccentColor}30; border: 2px solid {customLoaderAccentColor};"
            >
              <Camera size={38} class="animate-pulse" style="color: {customLoaderAccentColor};" />
            </div>
          {/if}
          <h2 class="text-2xl font-black text-white uppercase tracking-wider mb-2 drop-shadow">
            {boothFlow.captureMessage || customLoaderTitle}
          </h2>
          <p class="text-white/80 text-sm max-w-sm font-medium">
            {customLoaderSubtitle}
          </p>
        </div>
      {/if}

      <!-- Badge Pemulihan Sesi jika ada foto yang sudah tersimpan -->
      {#if boothFlow.photosTaken.filter(Boolean).length > 0 && !isRunning && !allDone}
        <div class="absolute top-5 left-5 z-30 bg-emerald-500/25 border border-emerald-400/60 backdrop-blur-md text-emerald-100 px-5 py-2.5 rounded-full text-xs font-bold shadow-xl flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
          <span>Sesi Pulih: {boothFlow.photosTaken.filter(Boolean).length} dari {totalPhotos} foto tersimpan</span>
        </div>
      {/if}

      {#if !isRunning && !allDone}
        <div class="absolute bottom-9 left-0 right-0 flex flex-col items-center gap-4 z-20">
          <button
            onclick={handleStartSession}
            class="px-[60px] py-5 rounded-full font-extrabold text-[21px] border-none cursor-pointer tracking-[-0.01em] transition-transform duration-150 active:scale-95"
            style="
              background-color: {uiConfig.config.primaryColor};
              color: #1a0a00;
              box-shadow: 0 8px 32px {uiConfig.config.primaryColor}80;
            "
          >
            {boothFlow.photosTaken.filter(Boolean).length > 0
              ? `Lanjutkan Sesi (Foto ke-${boothFlow.photosTaken.filter(Boolean).length + 1})`
              : 'Siap? Mulai Sesi!'}
          </button>
          <span class="text-white/[0.60] text-[13px] font-medium drop-shadow">
            {boothFlow.photosTaken.filter(Boolean).length > 0
              ? `${boothFlow.photosTaken.filter(Boolean).length} dari ${totalPhotos} foto aman tersimpan di disk lokal`
              : `${totalPhotos} foto akan diambil otomatis`}
          </span>
        </div>
      {/if}
    </div>

    <!-- Template preview card (Side card) -->
    <div
      class="shrink-0 flex flex-col items-stretch gap-3.5 w-[35vw]"
      style="height: calc(100vh - 48px);"
    >
      <div class="self-center flex items-center gap-[9px] bg-white/95 text-[#0f0e14] px-7 py-3 rounded-full font-bold text-lg shadow-[0_8px_32px_rgba(0,0,0,0.45)] shrink-0">
        <svg width="16" height="16" fill="none" stroke={uiConfig.config.primaryColor} stroke-width="2.5" viewBox="0 0 24 24">
          <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="tabular-nums">{formatTime(sessionSecs)}</span>
      </div>

      <div class="flex-1 min-h-0 bg-white rounded-[22px] p-[20px_18px_18px] flex flex-col gap-4 shadow-[0_40px_100px_rgba(0,0,0,0.75)] overflow-hidden">
        <div class="flex items-center justify-between shrink-0">
          <span class="text-[15px] font-black text-[#111]">{selectedTemplate?.name || uiConfig.config.boothName}</span>
          <span class="text-[11px] font-semibold text-[#888]">
            {boothFlow.photosTaken.length}/{totalPhotos} foto
          </span>
        </div>

        <div
          class="flex-1 min-h-0 bg-[#141412] rounded-xl flex items-center justify-center p-2 relative overflow-hidden"
          style="container-type: size;"
        >
          {#if selectedTemplate}
            {@const tWidth = selectedTemplate.width || 1200}
            {@const tHeight = selectedTemplate.height || 1800}
            <div
              class="relative overflow-hidden rounded-lg bg-black/40 shadow-md"
              style={getTemplatePreviewBoxStyle(tWidth, tHeight)}
            >
              {#if templateLayers.length > 0}
                {#each templateLayers.filter((l) => !l.isQr) as layer, idx (layer.id ?? idx)}
                  {@const layerZIndex = getLayerZIndex(layer, templateLayers)}
                  {@const isPhotoSlot = !layer.isBackground}
                  {@const targetIdx = isPhotoSlot ? findPhotoSlotIndex(layer, photoSlots) : 0}
                  <div
                    class={`absolute overflow-hidden ${layer.isBackground ? 'pointer-events-none' : ''}`}
                    style="
                      left: {((layer.x || 0) / tWidth) * 100}%;
                      top: {((layer.y || 0) / tHeight) * 100}%;
                      width: {((layer.w || 200) / tWidth) * 100}%;
                      height: {((layer.h || 200) / tHeight) * 100}%;
                      transform: rotate({layer.rot || 0}deg);
                      z-index: {layerZIndex};
                      pointer-events: {layer.isBackground ? 'none' : 'auto'};
                    "
                  >
                    {#if layer.isBackground}
                      {@const layerBgUrl = uiConfig.resolveAssetUrl(layer.imageUrl || bgUrl)}
                      {#if layerBgUrl}
                        <img
                          src={layerBgUrl}
                          alt="Frame Overlay"
                          class="w-full h-full object-fill pointer-events-none block"
                        />
                      {/if}
                    {:else}
                      {@const capturedPhoto = boothFlow.photosTaken[targetIdx]}
                      <div class="w-full h-full bg-black/40 relative">
                        {#if capturedPhoto}
                          <img src={capturedPhoto} alt={`Photo ${targetIdx + 1}`} class="w-full h-full object-cover block" style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};" />
                          {#if allDone || isPausedBetweenCaptures}
                            <button
                              type="button"
                              onclick={(e) => {
                                e.stopPropagation();
                                selectedRetakeIndex = targetIdx;
                              }}
                              class={`absolute inset-0 transition-colors flex items-center justify-center cursor-pointer z-50 border-none group ${activeRetakeIdx === targetIdx ? 'ring-2 ring-yellow-400 bg-transparent' : 'bg-black/30 hover:bg-black/50'}`}
                              title={activeRetakeIdx === targetIdx ? 'Foto terpilih' : 'Lihat & Take Ulang'}
                            >
                              {#if activeRetakeIdx !== targetIdx}
                                <div class="w-7 h-7 rounded-full bg-white/90 text-black flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-110">
                                  <Search size={14} strokeWidth={2.5} />
                                </div>
                              {/if}
                            </button>
                          {/if}
                        {:else if cameraStore.isLiveviewActive || frameSrc}
                          {#if cameraStore.cameraMode === 'webcam'}
                            <video
                              use:playStream={cameraStore.stream}
                              autoplay
                              playsinline
                              muted
                              class="w-full h-full object-cover"
                              style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
                            ></video>
                          {:else if frameSrc}
                            <img src={frameSrc} alt="Live view" class="w-full h-full object-cover block" style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};" />
                          {:else}
                            <div class="w-full h-full flex items-center justify-center text-white/40 text-[9px] animate-pulse">
                              {targetIdx + 1}
                            </div>
                          {/if}
                        {:else}
                          <div class="w-full h-full flex items-center justify-center text-white/40 text-[9px]">
                            {targetIdx + 1}
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          {:else}
            <div class="text-white/40 text-xs">Loading Template...</div>
          {/if}
        </div>

        {#if allDone}
          <div class="shrink-0 flex items-center gap-2 w-full">
            <button
              type="button"
              onclick={() => handleRetakeSingle(activeRetakeIdx ?? 0)}
              disabled={isRunning}
              class="flex-1 flex items-center justify-center gap-2 bg-[#f4ece3] hover:bg-[#e8ded3] text-[#111117] border-none rounded-full px-4 py-3.5 font-bold text-sm cursor-pointer transition-all active:scale-95 shadow-sm"
              title="Ambil ulang foto pada slot yang dipilih"
            >
              <RotateCw size={15} />
              <span>{retakeButtonLabel} {activeRetakeIdx !== null ? `#${activeRetakeIdx + 1}` : ''}</span>
            </button>
            <button
              type="button"
              onclick={() => onComplete(boothFlow.photosTaken)}
              disabled={isRunning}
              class="flex-1 flex items-center justify-center gap-2 bg-[#111117] hover:bg-[#2a2838] text-white border-none rounded-full px-4 py-3.5 font-bold text-sm cursor-pointer transition-all active:scale-95 shadow-sm"
            >
              {finishSessionButtonLabel}
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M8.25 4.5l7.5 7.5-7.5 7.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        {:else if isPausedBetweenCaptures && pausedSlotIndex !== null}
          <div class="shrink-0 flex items-center gap-2 w-full">
            <button
              type="button"
              onclick={() => resolvePauseDecision('retake')}
              class="flex-1 flex items-center justify-center gap-2 bg-[#f4ece3] hover:bg-[#e8ded3] text-[#111117] border-none rounded-full px-4 py-3.5 font-bold text-sm cursor-pointer transition-all active:scale-95 shadow-sm"
            >
              <RotateCw size={15} />
              <span>{retakeButtonLabel} #{pausedSlotIndex + 1}</span>
            </button>
            <button
              type="button"
              onclick={() => resolvePauseDecision('next')}
              class="flex-1 flex items-center justify-center gap-2 bg-[#111117] hover:bg-[#2a2838] text-white border-none rounded-full px-4 py-3.5 font-bold text-sm cursor-pointer transition-all active:scale-95 shadow-sm"
            >
              <span>{pausedSlotIndex + 1 >= totalPhotos ? finishSessionButtonLabel : nextPhotoButtonLabel}</span>
              <ArrowRight size={15} />
            </button>
          </div>
        {:else}
          <button
            type="button"
            disabled={true}
            class="shrink-0 flex items-center justify-center gap-2 border-none rounded-full px-8 py-4 font-bold text-base transition-all bg-[#e8e4df] text-[#bbb] cursor-default"
          >
            Lanjut
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path d="M8.25 4.5l7.5 7.5-7.5 7.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        {/if}
      </div>
    </div>
  </div>

  <!-- Full-Screen Intra-Capture Cue Overlay (when intraCaptureScope === 'fullscreen') -->
  {#if isIntraCaptureCueActive && intraCaptureScope === 'fullscreen'}
    <div
      class="fixed inset-0 z-45 backdrop-blur-[3px] flex flex-col items-center justify-between py-12 px-8 text-center pointer-events-none select-none"
      style="background: {intraCaptureBgColor};"
    >
      {#if intraCaptureMode === 'chevron_up' || intraCaptureShowChevrons}
        <div class="flex flex-col items-center -space-y-3 animate-bounce" style="color: {intraCaptureAccentColor};">
          <svg width="68" height="36" viewBox="0 0 44 24" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" class="opacity-55">
            <path d="M6 19L22 5L38 19" />
          </svg>
          <svg width="68" height="36" viewBox="0 0 44 24" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" class="opacity-80">
            <path d="M6 19L22 5L38 19" />
          </svg>
          <svg width="68" height="36" viewBox="0 0 44 24" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 19L22 5L38 19" />
          </svg>
        </div>
      {:else}
        <div></div>
      {/if}

      <div class="flex flex-col items-center justify-center gap-4 my-auto">
        {#if (intraCaptureMode === 'custom' || intraCaptureMode === 'custom_media' || (!intraCaptureMode.includes('flash') && customIntraCaptureMediaUrl)) && customIntraCaptureMediaUrl}
          <div class="max-w-[420px] max-h-[340px] flex items-center justify-center pointer-events-none bg-transparent">
            {#if customIntraCaptureMediaType === 'video'}
              <video
                src={customIntraCaptureMediaUrl}
                autoplay
                loop
                muted
                playsinline
                class="max-w-full max-h-full object-contain block bg-transparent"
              ></video>
            {:else}
              <img
                src={customIntraCaptureMediaUrl}
                alt="Intra capture cue"
                class="max-w-full max-h-full object-contain block bg-transparent"
              />
            {/if}
          </div>
        {/if}

        {#if intraCaptureText}
          <div
            class="text-5xl font-black tracking-tight drop-shadow-[0_6px_30px_rgba(0,0,0,0.85)]"
            style="color: {intraCaptureTextColor};"
          >
            {intraCaptureText}
          </div>
        {/if}
        {#if intraCaptureSubtext}
          <div class="text-lg font-semibold opacity-90" style="color: {intraCaptureTextColor};">
            {intraCaptureSubtext}
          </div>
        {/if}
        {#if Array.isArray(cameraBlock?.props?.intraCaptureExtraTexts)}
          {#each cameraBlock.props.intraCaptureExtraTexts as extraTxt}
            {#if extraTxt}
              <div class="text-lg font-semibold opacity-95 drop-shadow-[0_3px_16px_rgba(0,0,0,0.9)] text-white">
                {extraTxt}
              </div>
            {/if}
          {/each}
        {/if}
      </div>

      <div class="h-8"></div>
    </div>
  {/if}

  <!-- Modal Kamera Terputus Saat Sesi Berlangsung -->
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
            onclick={retryCameraConnection}
            class="w-full py-3.5 rounded-full font-bold text-base text-black bg-amber-400 hover:bg-amber-300 transition-all cursor-pointer shadow-lg active:scale-95"
          >
            Coba Sambungkan & Lanjutkan
          </button>
          <button
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
