<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { runCaptureSequence } from '$lib/utils/capture';
  import { formatTime } from '$lib/utils/shared';

  interface Props {
    selectedFrame: string;
    onComplete: (photos: string[]) => void;
    onBack: () => void;
  }

  let { selectedFrame, onComplete, onBack }: Props = $props();

  let isRunning = $state(false);
  let sessionSecs = $state(5 * 60);
  let timer: any = null;
  let liveviewInterval: any = null;
  let frameSrc = $state('');
  let videoEl = $state<HTMLVideoElement | null>(null);

  const totalPhotos = 4;

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

  async function startCapture() {
    if (isRunning) return;
    isRunning = true;
    boothFlow.photosTaken = [];
    await runCaptureSequence(totalPhotos, boothConfig.config.countdownSecs);
    isRunning = false;
  }

  let allDone = $derived(boothFlow.photosTaken.length === totalPhotos);
</script>

<div
  class="w-screen h-screen bg-[#fafafa] flex flex-col select-none relative overflow-hidden"
  style="font-family: 'Playfair Display', Georgia, serif;"
>
  <div class="w-full h-16 flex items-center justify-between px-10 border-b-2 border-black shrink-0 relative z-20 bg-[#C7EED8]">
    <div class="flex items-center gap-2">
      <span class="font-['Nunito',sans-serif] font-black text-xs tracking-widest uppercase">
        {uiConfig.config.boothName} — Photo Session
      </span>
    </div>
    <div class="text-xs font-['Nunito',sans-serif] font-black tracking-widest">
      {formatTime(sessionSecs)}
    </div>
  </div>

  <div class="relative z-10 flex-1 flex gap-8 p-10 max-w-6xl mx-auto w-full">
    <!-- Camera Feed -->
    <div class="flex-1 bg-black border-[3px] border-black rounded-3xl overflow-hidden relative shadow-[8px_8px_0_0_rgba(0,0,0,1)] flex items-center justify-center">
      {#if cameraStore.isLiveviewActive}
        {#if cameraStore.cameraMode === 'webcam'}
          <video
            bind:this={videoEl}
            autoplay
            playsinline
            muted
            class="w-full h-full object-cover"
            style="transform: scaleX(-1);"
          ></video>
        {:else if frameSrc}
          <img
            src={frameSrc}
            alt="Livefeed"
            class="w-full h-full object-cover"
          />
        {:else}
          <div class="text-white/40 text-sm font-['Nunito',sans-serif]">Loading Live Preview...</div>
        {/if}
      {:else}
        <div class="text-white/40 text-sm font-['Nunito',sans-serif]">Live Preview Camera</div>
      {/if}

      {#if boothFlow.countdown !== null && boothFlow.countdown > 0}
        <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
          <div class="text-8xl font-black text-white font-['Nunito',sans-serif]">
            {boothFlow.countdown}
          </div>
        </div>
      {/if}

      {#if !isRunning && !allDone}
        <button
          onclick={startCapture}
          class="absolute bottom-8 px-10 py-4 bg-white border-2 border-black rounded-full text-black font-['Nunito',sans-serif] font-black uppercase tracking-widest shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:bg-black hover:text-white transition-all cursor-pointer"
        >
          Ambil Foto! 📸
        </button>
      {/if}
    </div>

    <!-- Side strip preview -->
    <div class="w-72 border-[3px] border-black rounded-3xl bg-white p-6 flex flex-col justify-between shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
      <div>
        <h4 class="text-lg font-black uppercase text-black mb-4">Hasil Foto</h4>
        <div class="grid grid-cols-2 gap-2">
          {#each Array(totalPhotos) as _, i}
            <div class="aspect-[3/4] bg-gray-100 border-2 border-black rounded-lg overflow-hidden flex items-center justify-center">
              {#if boothFlow.photosTaken[i]}
                <img src={boothFlow.photosTaken[i]} alt={`Photo ${i + 1}`} class="w-full h-full object-cover" />
              {:else}
                <span class="text-xs text-gray-400 font-bold">{i + 1}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-3">
        <button
          onclick={() => allDone && onComplete(boothFlow.photosTaken)}
          disabled={!allDone}
          class="w-full py-3.5 bg-black text-white font-['Nunito',sans-serif] font-black uppercase tracking-widest rounded-full disabled:opacity-30 cursor-pointer border-none"
        >
          Lanjut Filter →
        </button>
        <button
          onclick={onBack}
          class="text-xs font-['Nunito',sans-serif] font-bold text-black/50 hover:text-black uppercase tracking-widest bg-transparent border-none cursor-pointer"
        >
          ← Kembali
        </button>
      </div>
    </div>
  </div>
</div>
