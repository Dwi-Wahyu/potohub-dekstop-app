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
    selectedFrame: string;
    onComplete: (photos: string[]) => void;
    onBack: () => void;
  }

  let { selectedFrame, onComplete, onBack }: Props = $props();

  let selectedTemplate = $state<BoothTemplate | null>(null);
  let photoSlots = $derived(selectedTemplate?.design_data?.filter((l) => !l.isBackground) ?? []);
  let totalPhotos = $derived(photoSlots.length > 0 ? photoSlots.length : 3);

  let isRunning = $state(false);
  let sessionSecs = $state(5 * 60);
  let timer: any = null;
  let liveviewInterval: any = null;
  let frameSrc = $state('');
  let videoEl = $state<HTMLVideoElement | null>(null);

  onMount(async () => {
    const boothId = localStorage.getItem('booth_id') || 'default';
    try {
      const templates = await fetchTemplates(boothId);
      const matched = templates.find((t) => t.id === selectedFrame);
      if (matched) {
        selectedTemplate = matched;
      } else if (templates[0]) {
        selectedTemplate = templates[0];
      }
    } catch (err) {
      console.error('Failed to fetch template in V3Session:', err);
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
    <span class="text-sm font-bold text-white/50">{formatTime(sessionSecs)}</span>
  </div>

  <div class="relative z-10 flex-1 flex gap-8 max-w-6xl mx-auto w-full my-auto py-6">
    <!-- Viewfinder -->
    <div class="flex-1 bg-black border border-white/20 rounded-3xl overflow-hidden relative flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.8)]">
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
          <div class="text-white/40 text-sm">Loading Live Preview...</div>
        {/if}
      {:else}
        <div class="text-white/40 text-sm">Live Preview Camera</div>
      {/if}

      {#if boothFlow.countdown !== null && boothFlow.countdown > 0}
        <div class="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
          <div class="text-9xl font-black text-[#FFC107] drop-shadow-[0_0_30px_rgba(255,193,7,0.5)]">
            {boothFlow.countdown}
          </div>
        </div>
      {/if}

      {#if !isRunning && !allDone}
        <button
          onclick={startCapture}
          class="absolute bottom-8 px-12 py-4 bg-[#FFC107] text-black font-black uppercase tracking-widest rounded-full hover:bg-yellow-300 transition-all cursor-pointer border-none shadow-[0_0_20px_rgba(255,193,7,0.4)] z-20"
        >
          Mulai Foto 📸
        </button>
      {/if}
    </div>

    <!-- Side strip -->
    <div class="w-80 border border-white/10 rounded-3xl bg-white/5 p-6 flex flex-col justify-between backdrop-blur-xl">
      <div>
        <h4 class="text-base font-bold text-white uppercase mb-4">{selectedTemplate?.name || 'Hasil Sesi'}</h4>
        <div class="grid grid-cols-2 gap-2.5">
          {#each Array(totalPhotos) as _, i}
            <div class="aspect-[3/4] bg-white/5 border border-white/10 rounded-xl overflow-hidden flex items-center justify-center">
              {#if boothFlow.photosTaken[i]}
                <img src={boothFlow.photosTaken[i]} alt={`Photo ${i + 1}`} class="w-full h-full object-cover" />
              {:else}
                <span class="text-xs text-white/30 font-bold">{i + 1}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <div class="flex flex-col gap-3">
        <button
          onclick={() => allDone && onComplete(boothFlow.photosTaken)}
          disabled={!allDone}
          class="w-full py-3.5 bg-[#FFC107] text-black font-black uppercase tracking-widest rounded-full disabled:opacity-30 cursor-pointer border-none shadow-[0_0_15px_rgba(255,193,7,0.3)]"
        >
          Lanjut →
        </button>

        {#if !isRunning}
          <button
            onclick={onBack}
            class="w-full py-2 text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors cursor-pointer bg-transparent border-none"
          >
            ← Kembali
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

{#if boothFlow.isFlashActive}
  <div class="fixed inset-0 bg-white z-[9999] pointer-events-none transition-opacity duration-150"></div>
{/if}
