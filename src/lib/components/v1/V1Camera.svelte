<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { runCaptureSequence } from '$lib/utils/capture';
  import { formatTime } from '$lib/utils/shared';

  interface Props {
    onComplete: (photos: string[]) => void;
    onBack: () => void;
    frameConfigId?: string;
  }

  let { onComplete, onBack, frameConfigId = 'strip4' }: Props = $props();

  const FRAME_LAYOUTS: Record<string, { cols: number; rows: number }> = {
    strip2: { cols: 1, rows: 2 },
    strip4: { cols: 1, rows: 4 },
    grid4: { cols: 2, rows: 2 },
    grid6: { cols: 2, rows: 3 },
    grid8: { cols: 2, rows: 4 },
    love4: { cols: 2, rows: 2 },
    wide3: { cols: 3, rows: 1 }
  };

  let layout = $derived(FRAME_LAYOUTS[frameConfigId] ?? FRAME_LAYOUTS['strip4']);
  let totalPhotos = $derived(layout.cols * layout.rows);

  let sessionSecs = $state(5 * 60);
  let isRunning = $state(false);
  let selectedIdx = $state<number | null>(null);
  let timer: any = null;
  let liveviewInterval: any = null;
  let frameSrc = $state('');
  let videoEl = $state<HTMLVideoElement | null>(null);

  onMount(async () => {
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
    selectedIdx = null;

    await runCaptureSequence(totalPhotos, boothConfig.config.countdownSecs);

    isRunning = false;
    if (boothFlow.photosTaken.length > 0) {
      selectedIdx = 0;
    }
  }

  let allDone = $derived(boothFlow.photosTaken.length === totalPhotos);
  let previewPhoto = $derived(
    allDone && !isRunning && selectedIdx !== null ? boothFlow.photosTaken[selectedIdx] : null
  );
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
      {#if previewPhoto}
        <img src={previewPhoto} alt="Preview" class="w-full h-full object-cover block" />
      {:else if cameraStore.isLiveviewActive}
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
        <div class="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#06060a]/80 backdrop-blur-md border border-red-500/30 px-[18px] py-2 rounded-full">
          <span class="w-[7px] h-[7px] rounded-full bg-red-500 inline-block animate-pulse"></span>
          <span class="text-[11px] font-extrabold text-white tracking-[0.15em]">REKAM</span>
        </div>

        <div class="absolute bottom-[116px] left-1/2 -translate-x-1/2 bg-[#06060a]/75 backdrop-blur-md border border-white/10 px-[22px] py-[7px] rounded-full text-[13px] text-white/75 font-semibold">
          Foto {boothFlow.photosTaken.length + 1} dari {totalPhotos}
        </div>
      {/if}

      {#if boothFlow.countdown !== null && boothFlow.countdown > 0}
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div class="w-36 h-36 rounded-full bg-black/60 border-4 border-white flex items-center justify-center text-6xl font-extrabold text-white">
            {boothFlow.countdown}
          </div>
        </div>
      {/if}

      {#if !isRunning && !allDone}
        <div class="absolute bottom-9 left-0 right-0 flex flex-col items-center gap-4">
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

    <!-- Film strip side card -->
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

      <div class="flex-1 min-h-0 bg-white rounded-[22px] p-[20px_18px_18px] flex flex-col gap-4 shadow-[0_40px_100px_rgba(0,0,0,0.75)]">
        <div class="flex items-center justify-between shrink-0">
          <span class="text-[15px] font-black text-[#111]">{uiConfig.config.boothName}</span>
          <span class="text-[11px] font-semibold text-[#ccc]">
            {boothFlow.photosTaken.length}/{totalPhotos} foto
          </span>
        </div>

        <div class="flex-1 min-h-0 bg-[#141412] rounded-xl flex flex-row overflow-hidden p-3.5">
          <div class="flex-1 grid gap-2" style="grid-template-columns: repeat({layout.cols}, 1fr); grid-template-rows: repeat({layout.rows}, 1fr);">
            {#each Array(totalPhotos) as _, i}
              {@const filled = !!boothFlow.photosTaken[i]}
              {@const selected = selectedIdx === i && filled}
              <button
                type="button"
                onclick={() => filled && (selectedIdx = i)}
                class={`rounded-md overflow-hidden bg-[#2a2825] relative transition-all border-0 p-0 ${
                  filled ? 'cursor-pointer' : 'cursor-default'
                }`}
                style="outline: {selected ? `2.5px solid ${uiConfig.config.primaryColor}` : 'none'};"
              >
                {#if filled}
                  <img src={boothFlow.photosTaken[i]} alt={`Foto ${i + 1}`} class="w-full h-full object-cover block" />
                {:else}
                  <div class="absolute inset-0 flex items-center justify-center text-white/30 text-xs">
                    {i + 1}
                  </div>
                {/if}
              </button>
            {/each}
          </div>
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
