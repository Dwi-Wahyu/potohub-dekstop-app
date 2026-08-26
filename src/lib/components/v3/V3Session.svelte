<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { runCaptureSequence } from '$lib/utils/capture';

  interface Props {
    selectedFrame: string;
    onComplete: (photos: string[]) => void;
    onBack: () => void;
  }

  let { selectedFrame, onComplete, onBack }: Props = $props();

  let isRunning = $state(false);
  let liveviewInterval: any = null;
  let frameSrc = $state('');
  let videoEl = $state<HTMLVideoElement | null>(null);
  const totalPhotos = 3;

  onMount(async () => {
    await cameraStore.startLiveview(videoEl);

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
  class="w-screen h-screen bg-[#0a0a0f] text-white flex flex-col justify-between p-12 select-none relative overflow-hidden font-['Inter',sans-serif]"
>
  <div class="w-full flex justify-between items-center relative z-10">
    <span class="font-extrabold text-sm tracking-[0.2em] text-[#FFC107] uppercase">
      {uiConfig.config.boothName} — Photo Session
    </span>
  </div>

  <div class="relative z-10 flex-1 flex gap-8 max-w-6xl mx-auto w-full my-auto py-4">
    <!-- Viewfinder -->
    <div class="flex-1 bg-black border border-white/10 rounded-3xl overflow-hidden relative flex items-center justify-center shadow-[0_0_40px_rgba(0,0,0,0.8)]">
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
            alt="Live camera"
            class="w-full h-full object-cover"
          />
        {:else}
          <div class="text-white/40 text-sm">Loading Live Preview...</div>
        {/if}
      {:else}
        <div class="text-white/40 text-sm">Live Camera View</div>
      {/if}

      {#if boothFlow.countdown !== null && boothFlow.countdown > 0}
        <div class="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div class="text-8xl font-black text-[#FFC107] animate-bounce">
            {boothFlow.countdown}
          </div>
        </div>
      {/if}

      {#if !isRunning && !allDone}
        <button
          onclick={startCapture}
          class="absolute bottom-8 px-12 py-4 bg-[#FFC107] text-black font-black uppercase tracking-[0.2em] rounded-full hover:bg-yellow-300 transition-all cursor-pointer border-none shadow-[0_0_25px_rgba(255,193,7,0.5)]"
        >
          Ambil Sesi Foto ★
        </button>
      {/if}
    </div>

    <!-- Side strip preview -->
    <div class="w-72 border border-white/10 rounded-3xl bg-white/5 p-6 flex flex-col justify-between backdrop-blur-xl">
      <div>
        <h4 class="text-base font-bold uppercase text-white mb-4">Sesi Jepretan</h4>
        <div class="flex flex-col gap-3">
          {#each Array(totalPhotos) as _, i}
            <div class="aspect-[4/3] bg-black/40 border border-white/20 rounded-xl overflow-hidden flex items-center justify-center">
              {#if boothFlow.photosTaken[i]}
                <img src={boothFlow.photosTaken[i]} alt={`Photo ${i + 1}`} class="w-full h-full object-cover" />
              {:else}
                <span class="text-xs text-white/30 font-bold">Slot {i + 1}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-3">
        <button
          onclick={() => allDone && onComplete(boothFlow.photosTaken)}
          disabled={!allDone}
          class="w-full py-3.5 bg-[#FFC107] text-black font-black uppercase tracking-widest rounded-full disabled:opacity-20 cursor-pointer border-none"
        >
          Lanjut Filter →
        </button>
        <button
          onclick={onBack}
          class="text-xs font-bold text-white/40 hover:text-white uppercase tracking-widest bg-transparent border-none cursor-pointer"
        >
          ← Kembali
        </button>
      </div>
    </div>
  </div>
</div>
