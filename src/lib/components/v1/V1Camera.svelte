<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { runCaptureSequence } from '$lib/utils/capture';
  import { formatTime } from '$lib/utils/shared';
  import { fetchTemplates, type BoothTemplate } from '$lib/api/boothClient';

  interface Props {
    onComplete: (photos: string[]) => void;
    onBack: () => void;
    frameConfigId?: string;
  }

  let { onComplete, onBack, frameConfigId = '' }: Props = $props();

  let selectedTemplate = $state<BoothTemplate | null>(null);
  let photoSlots = $derived(selectedTemplate?.design_data?.filter((l) => !l.isBackground && !l.isQr) ?? []);
  let totalPhotos = $derived(photoSlots.length > 0 ? photoSlots.length : 4);
  let bgLayer = $derived(selectedTemplate?.design_data?.find((l) => l.isBackground));
  let bgUrl = $derived(bgLayer?.imageUrl || selectedTemplate?.frame_image_url || '');

  let sessionSecs = $state(5 * 60);
  let isRunning = $state(false);
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
    const boothId = localStorage.getItem('booth_id') || 'default';
    try {
      const templates = await fetchTemplates(boothId);
      const matched = templates.find((t) => t.id === frameConfigId);
      if (matched) {
        selectedTemplate = matched;
      } else if (templates[0]) {
        selectedTemplate = templates[0];
      }
    } catch (err) {
      console.error('Failed to load template:', err);
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
    boothFlow.photosTaken = [];

    await runCaptureSequence(totalPhotos, boothConfig.config.countdownSecs);

    isRunning = false;
  }

  let allDone = $derived(boothFlow.photosTaken.length === totalPhotos);
</script>

<div
  class="w-full h-full overflow-hidden relative flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif]"
  style="background: linear-gradient(135deg, #1e1b4b 0%, #2a2873 50%, #312e81 100%);"
>
  <!-- Watermark -->
  <div class="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-0">
    <span class="font-black text-[clamp(180px,22vw,380px)] text-white/[0.028] tracking-[-0.04em] leading-none whitespace-nowrap">
      {uiConfig.config.boothName}
    </span>
  </div>

  <div class="relative z-10 flex flex-row items-center justify-center w-full box-border gap-[clamp(40px,4.5vw,88px)] px-[clamp(40px,5vw,100px)] py-6">
    <!-- Viewfinder card -->
    <div
      class="shrink-0 rounded-[26px] overflow-hidden relative bg-[#0a0910]"
      style="
        width: calc((100vh - 48px) * 0.75);
        height: calc(100vh - 48px);
        box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 64px 140px rgba(0,0,0,0.95);
      "
    >
      {#if cameraStore.isLiveviewActive}
        {#if cameraStore.cameraMode === 'webcam'}
          <video
            bind:this={videoEl}
            autoplay
            playsinline
            muted
            class="w-full h-full object-cover block"
            style="
              transform: {boothConfig.config.mirrorOn ? 'scaleX(-1)' : 'none'} {boothConfig.config.flipVertical ? 'scaleY(-1)' : 'none'};
            "
          ></video>
        {:else if frameSrc}
          <img
            src={frameSrc}
            alt="Live camera feed"
            class="w-full h-full object-cover block"
            style="
              transform: {boothConfig.config.mirrorOn ? 'scaleX(-1)' : 'none'} {boothConfig.config.flipVertical ? 'scaleY(-1)' : 'none'};
            "
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

      {#if isRunning}
        <div class="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#06060a]/80 backdrop-blur-md border border-red-500/30 px-[18px] py-2 rounded-full z-20">
          <span class="w-[7px] h-[7px] rounded-full bg-red-500 inline-block animate-pulse"></span>
          <span class="text-[11px] font-extrabold text-white tracking-[0.15em]">REKAM</span>
        </div>

        <div class="absolute bottom-[116px] left-1/2 -translate-x-1/2 bg-[#06060a]/75 backdrop-blur-md border border-white/10 px-[22px] py-[7px] rounded-full text-[13px] text-white/75 font-semibold z-20">
          Foto {boothFlow.photosTaken.length + 1} dari {totalPhotos}
        </div>
      {/if}

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
                  <div
                    class="absolute overflow-hidden"
                    style="
                      left: {((layer.x || 0) / tWidth) * 100}%;
                      top: {((layer.y || 0) / tHeight) * 100}%;
                      width: {((layer.w || 200) / tWidth) * 100}%;
                      height: {((layer.h || 200) / tHeight) * 100}%;
                      transform: rotate({layer.rot || 0}deg);
                      z-index: {layerZIndex};
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
                      {@const slotIdx = photoSlots.findIndex((s) => s.id === layer.id || s === layer)}
                      {@const targetIdx = slotIdx >= 0 ? slotIdx : 0}
                      {@const capturedPhoto = boothFlow.photosTaken[targetIdx]}
                      <div class="w-full h-full bg-black/40 relative">
                        {#if capturedPhoto}
                          <img src={capturedPhoto} alt={`Photo ${targetIdx + 1}`} class="w-full h-full object-cover block" />
                        {:else if cameraStore.isLiveviewActive}
                          {#if cameraStore.cameraMode === 'webcam'}
                            <video
                              use:playStream={cameraStore.stream}
                              autoplay
                              playsinline
                              muted
                              class="w-full h-full object-cover"
                              style="transform: scaleX(-1);"
                            ></video>
                          {:else if frameSrc}
                            <img src={frameSrc} alt="Live view" class="w-full h-full object-cover block" />
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

{#if boothFlow.isFlashActive}
  <div class="fixed inset-0 bg-white z-[9999] pointer-events-none transition-opacity duration-150"></div>
{/if}
