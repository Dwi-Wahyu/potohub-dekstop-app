<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Search, RotateCw } from '@lucide/svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { runCaptureSequence } from '$lib/utils/capture';
  import { formatTime, getLiveviewTransformStyle } from '$lib/utils/shared';
  import { fetchTemplates, requireActiveBoothId, type BoothTemplate } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';
  import { getSortedPhotoSlots } from '$lib/utils/templateComposite';

  interface Props {
    onComplete: (photos: string[]) => void;
    onBack: () => void;
    frameConfigId?: string;
    background?: string;
  }

  let { onComplete, onBack, frameConfigId = '', background }: Props = $props();

  let selectedTemplate = $state<BoothTemplate | null>(null);
  let photoSlots = $derived(getSortedPhotoSlots(selectedTemplate?.design_data));
  let totalPhotos = $derived(photoSlots.length > 0 ? photoSlots.length : 4);
  let bgLayer = $derived(selectedTemplate?.design_data?.find((l) => l.isBackground));
  let bgUrl = $derived(bgLayer?.imageUrl || selectedTemplate?.frame_image_url || '');

  let sessionSecs = $state(5 * 60);
  let isRunning = $state(false);
  let selectedRetakeIndex = $state<number | null>(null);
  let timer: any = null;
  let liveviewInterval: any = null;
  let frameSrc = $state('');
  let videoEl = $state<HTMLVideoElement | null>(null);

  function playStream(node: HTMLVideoElement, stream: MediaStream | null) {
    if (stream) {
      node.srcObject = stream;
      node.muted = true;
      node.playsInline = true;
      node.play().catch(() => {});
    }
    return {
      update(newStream: MediaStream | null) {
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
        node.srcObject = null;
      }
    };
  }

  onMount(async () => {
    try {
      const boothId = await requireActiveBoothId();
      await cachedFetch(
        `templates:${boothId}`,
        () => fetchTemplates(boothId),
        (templates) => {
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

    await cameraStore.startLiveview(videoEl);
    timer = setInterval(() => {
      if (sessionSecs > 0) sessionSecs--;
    }, 1000);

    if (cameraStore.cameraMode === 'usb' || cameraStore.cameraMode === 'demo') {
      liveviewInterval = setInterval(async () => {
        const url = await cameraStore.getLiveviewFrame();
        if (url) {
          frameSrc = url;
        }
      }, 150);
    }
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (liveviewInterval) clearInterval(liveviewInterval);
    cameraStore.stopLiveview();
  });

  async function handleStartSession() {
    if (isRunning) return;
    isRunning = true;
    selectedRetakeIndex = null;
    boothFlow.photosTaken = [];

    await runCaptureSequence(totalPhotos, boothConfig.config.countdownSecs);

    isRunning = false;
  }

  async function handleRetakeSingle(index: number) {
    if (isRunning) return;
    isRunning = true;

    for (let c = boothConfig.config.countdownSecs; c > 0; c--) {
      boothFlow.countdown = c;
      await new Promise((r) => setTimeout(r, 1000));
    }
    boothFlow.countdown = null;
    const captureTs = Date.now();

    boothFlow.isFlashActive = true;
    setTimeout(() => {
      boothFlow.isFlashActive = false;
    }, 2000);

    try {
      const bytes = await cameraStore.capture();
      let photoUrl = '';
      if (bytes) {
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        photoUrl = URL.createObjectURL(blob);
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#ffffff';
          ctx.font = '30px sans-serif';
          ctx.fillText(`Photo ${index + 1}`, 240, 240);
          photoUrl = canvas.toDataURL('image/jpeg');
        }
      }

      if (photoUrl) {
        const updated = [...boothFlow.photosTaken];
        updated[index] = photoUrl;
        boothFlow.photosTaken = updated;
      }

      if (boothConfig.config.enableLiveviewVideo) {
        cameraStore
          .extractLiveviewClip(
            captureTs,
            boothConfig.config.liveviewClipPreSecs,
            boothConfig.config.liveviewClipPostSecs
          )
          .then((clipBlob) => {
            const clipUrl = clipBlob ? URL.createObjectURL(clipBlob) : null;
            const next = [...boothFlow.liveviewClips];
            next[index] = clipUrl;
            boothFlow.liveviewClips = next;
          })
          .catch((err) =>
            console.error('Gagal ekstrak liveview clip retake slot', index, err)
          );
      }
    } catch (err) {
      console.error('Retake capture error:', err);
    } finally {
      isRunning = false;
    }
  }

  let allDone = $derived(boothFlow.photosTaken.length === totalPhotos);
  let activeRetakeIdx = $derived(
    selectedRetakeIndex !== null ? selectedRetakeIndex : (allDone ? 0 : null)
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
        <div class="absolute inset-0 bg-white z-40 pointer-events-none transition-opacity duration-150"></div>
      {/if}

      <!-- Permanent Liveview Feed Layer -->
      {#if cameraStore.isLiveviewActive}
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

      <!-- Captured Photo Overlay Layer - Shown when allDone and not running retake -->
      {#if allDone && !isRunning && activeRetakeIdx !== null && boothFlow.photosTaken[activeRetakeIdx]}
        <img
          src={boothFlow.photosTaken[activeRetakeIdx]}
          alt={`Photo slot ${activeRetakeIdx + 1}`}
          class="absolute inset-0 w-full h-full object-cover z-20 block"
          style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
        />
      {/if}

      <!-- Top-left Retake button when allDone and not running capture -->
      {#if allDone && !isRunning && activeRetakeIdx !== null && boothFlow.photosTaken[activeRetakeIdx]}
        <div class="absolute top-5 left-5 z-30 flex items-center gap-3">
          <button
            onclick={() => handleRetakeSingle(activeRetakeIdx!)}
            class="flex items-center gap-2 bg-black/80 hover:bg-black text-white border border-white/30 px-5 py-2.5 rounded-full font-bold text-xs shadow-xl backdrop-blur-md cursor-pointer transition-transform active:scale-95"
          >
            <RotateCw size={15} />
            <span>Ulang Foto {activeRetakeIdx + 1}</span>
          </button>
        </div>
      {/if}

      <!-- Countdown Overlay -->
      {#if boothFlow.countdown !== null && boothFlow.countdown > 0}
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div class="w-36 h-36 rounded-full bg-black/60 border-4 border-white flex items-center justify-center text-6xl font-extrabold text-white">
            {boothFlow.countdown}
          </div>
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
            Siap? Mulai Sesi!
          </button>
          <span class="text-white/[0.38] text-[13px] font-medium">
            {totalPhotos} foto akan diambil otomatis
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

        <div class="flex-1 min-h-0 bg-[#141412] rounded-xl flex items-center justify-center p-2 relative overflow-hidden">
          {#if selectedTemplate}
            {@const tWidth = selectedTemplate.width || 1200}
            {@const tHeight = selectedTemplate.height || 1800}
            <div
              class="relative h-full max-w-full overflow-hidden rounded-lg bg-black/40 shadow-md"
              style="aspect-ratio: {tWidth} / {tHeight};"
            >
              {#if selectedTemplate.design_data}
                {#each selectedTemplate.design_data as layer, idx (layer.id ?? idx)}
                  {@const layerZIndex = selectedTemplate.design_data.length - idx}
                  {@const isPhotoSlot = !layer.isBackground && !layer.isQr}
                  {@const slotIdx = isPhotoSlot ? photoSlots.findIndex((s) => s.id === layer.id || s === layer) : -1}
                  {@const targetIdx = slotIdx >= 0 ? slotIdx : 0}
                  <div
                    class={`absolute overflow-hidden ${layer.isBackground ? 'pointer-events-none' : ''}`}
                    style="
                      left: {((layer.x || 0) / tWidth) * 100}%;
                      top: {((layer.y || 0) / tHeight) * 100}%;
                      width: {((layer.w || 200) / tWidth) * 100}%;
                      height: {((layer.h || 200) / tHeight) * 100}%;
                      transform: rotate({layer.rot || 0}deg);
                      z-index: {allDone && isPhotoSlot ? 40 + targetIdx : layerZIndex};
                    "
                  >
                    {#if layer.isBackground}
                      {#if bgUrl}
                        <img
                          src={bgUrl}
                          alt="Frame Overlay"
                          class="w-full h-full object-fill pointer-events-none block"
                        />
                      {/if}
                    {:else if layer.isQr}
                      <div class="w-full h-full bg-white flex items-center justify-center text-[#111] text-[9px] font-bold border border-gray-300 p-0.5">
                        QR Code
                      </div>
                    {:else}
                      {@const capturedPhoto = boothFlow.photosTaken[targetIdx]}
                      <div class="w-full h-full bg-black/40 relative">
                        {#if capturedPhoto}
                          <img src={capturedPhoto} alt={`Photo ${targetIdx + 1}`} class="w-full h-full object-cover block" style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};" />
                          {#if allDone}
                            <button
                              type="button"
                              onclick={(e) => {
                                e.stopPropagation();
                                selectedRetakeIndex = targetIdx;
                              }}
                              class={`absolute inset-0 bg-black/30 hover:bg-black/50 transition-colors flex items-center justify-center cursor-pointer z-50 border-none group ${activeRetakeIdx === targetIdx ? 'ring-2 ring-yellow-400' : ''}`}
                              title="Lihat & Take Ulang"
                            >
                              <div class="w-7 h-7 rounded-full bg-white/90 text-black flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-110">
                                <Search size={14} strokeWidth={2.5} />
                              </div>
                            </button>
                          {/if}
                        {:else if cameraStore.isLiveviewActive}
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

        <button
          onclick={() => allDone && onComplete(boothFlow.photosTaken)}
          disabled={!allDone}
          class={`shrink-0 flex items-center justify-center gap-2 border-none rounded-full px-8 py-4 font-bold text-base transition-all ${
            allDone ? 'bg-[#111117] text-white cursor-pointer hover:bg-[#2a2838]' : 'bg-[#e8e4df] text-[#bbb] cursor-default'
          }`}
        >
          Lanjut
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path d="M8.25 4.5l7.5 7.5-7.5 7.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        {#if !isRunning}
          <button
            onclick={onBack}
            class="shrink-0 flex items-center justify-center gap-1.5 bg-transparent border-none text-[#bbb] text-xs font-medium cursor-pointer py-1 hover:text-[#888]"
          >
            Kembali
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
