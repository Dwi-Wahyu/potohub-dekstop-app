<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { runCaptureSequence } from '$lib/utils/capture';
  import { formatTime, getLiveviewTransformStyle } from '$lib/utils/shared';
  import { fetchTemplates, requireActiveBoothId, type BoothTemplate } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';
  import { getSortedPhotoSlots } from '$lib/utils/templateComposite';
  import { Check, Sparkles, ChevronRight, Search, RotateCw, Camera } from '@lucide/svelte';

  interface Props {
    selectedFrame: string;
    onComplete: (photos: string[]) => void;
    onBack: () => void;
    background?: string;
  }

  let { selectedFrame, onComplete, onBack, background }: Props = $props();

  let selectedTemplate = $state<BoothTemplate | null>(null);
  let photoSlots = $derived(getSortedPhotoSlots(selectedTemplate?.design_data));
  let totalPhotos = $derived(photoSlots.length > 0 ? photoSlots.length : 3);
  let bgLayer = $derived(selectedTemplate?.design_data?.find((l) => l.isBackground));
  let bgUrl = $derived(bgLayer?.imageUrl || selectedTemplate?.frame_image_url || '');

  let isRunning = $state(false);
  let selectedRetakeIndex = $state<number | null>(null);
  let sessionSecs = $state(5 * 60);
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
          const matched = templates.find((t) => t.id === selectedFrame);
          if (matched) {
            selectedTemplate = matched;
          } else if (templates[0]) {
            selectedTemplate = templates[0];
          }
        }
      );
    } catch (err) {
      console.error('[V3Session] Failed to fetch template in V3Session:', err);
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

  let photosTaken = $derived(boothFlow.photosTaken.length);
  let allDone = $derived(photosTaken === totalPhotos);
  let activeRetakeIdx = $derived(
    selectedRetakeIndex !== null ? selectedRetakeIndex : (allDone ? 0 : null)
  );

  const VISIBLE_STEPS = ['Package', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter'];
  const activeStepIdx = 3;
  const DEFAULT_BG = '#fdfdfd';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('session').background ?? DEFAULT_BG);
</script>

<div
  class="w-full h-full flex flex-col select-none font-['Inter',sans-serif] relative overflow-hidden"
  style:background={effectiveBg}
>
  <!-- Header -->
  <div class="h-[68px] bg-[#CD1C33] flex items-center justify-between px-8 shadow-lg shrink-0 z-20 relative overflow-hidden">
    <div
      class="absolute inset-0 opacity-[0.06] pointer-events-none"
      style="background-image: repeating-linear-gradient(90deg, transparent, transparent 20px, #fff 20px, #fff 40px);"
    ></div>

    <div class="relative z-10">
      <h1 class="text-xl text-white font-['Playfair_Display',serif] font-bold tracking-[0.15em] leading-none uppercase m-0">
        Sesi Foto
      </h1>
      <p class="text-white/50 text-[8px] uppercase tracking-[0.3em] mt-1 m-0">
        {photosTaken} dari {totalPhotos} foto sudah diambil
      </p>
    </div>

    <!-- Stepper -->
    <div class="flex items-center gap-1.5 relative z-10">
      {#each VISIBLE_STEPS as stepLabel, i}
        {@const isDone = i < activeStepIdx}
        {@const isActive = i === activeStepIdx}
        <div class="flex items-center gap-1.5">
          <div
            class={`w-7 h-7 rounded-full text-[9px] font-black flex items-center justify-center border-2 transition-all ${
              isDone
                ? 'bg-[#FFC107] border-[#FFC107] text-black'
                : isActive
                  ? 'bg-white border-white text-[#CD1C33]'
                  : 'bg-transparent border-white/30 text-white/40'
            }`}
          >
            {#if isDone}
              <Check size={10} strokeWidth={3} />
            {:else}
              {i + 1}
            {/if}
          </div>
          {#if i < VISIBLE_STEPS.length - 1}
            <div class={`w-6 h-[2px] rounded-full ${isDone ? 'bg-[#FFC107]' : 'bg-white/20'}`}></div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="flex-1 flex min-h-0 relative z-10">
    <!-- Left strip panel -->
    <div class="w-[34%] h-full bg-[#fdfdfd] flex flex-col items-center justify-center gap-5 p-8 border-r border-gray-100 shadow-[4px_0_16px_rgba(0,0,0,0.05)] z-10">
      <p class="text-[8px] font-bold text-gray-400 uppercase tracking-[0.3em] m-0">✦ Preview Strip ✦</p>

      <div class="relative flex-1 max-h-[55vh] w-full flex items-center justify-center">
        {#if selectedTemplate}
          {@const tWidth = selectedTemplate.width || 1200}
          {@const tHeight = selectedTemplate.height || 1800}

          <div
            class="relative h-full max-w-full overflow-hidden rounded-xl bg-black/40 shadow-xl border-2 border-gray-200"
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
                    <div class="w-full h-full bg-black/40 relative overflow-hidden">
                      {#if capturedPhoto}
                        <img src={capturedPhoto} alt={`Photo ${targetIdx + 1}`} class="w-full h-full object-cover block" />
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
                            class="w-full h-full object-cover block"
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
          <div class="text-gray-400 text-xs font-bold">Loading Template...</div>
        {/if}

        {#if photosTaken > 0}
          <div class="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-[#0E8E5E] border-2 border-white shadow-lg flex items-center justify-center z-30">
            <span class="text-white text-[10px] font-black">{photosTaken}/{totalPhotos}</span>
          </div>
        {/if}
      </div>

      <div class="flex gap-2">
        {#each Array(totalPhotos) as _, i}
          <div class={`w-8 h-2 rounded-full transition-all ${i < photosTaken ? 'bg-[#CD1C33]' : 'bg-gray-200'}`}></div>
        {/each}
      </div>

      <div class="w-full border border-dashed border-gray-200 rounded-xl p-3 font-mono">
        <p class="text-[9px] text-gray-400 text-center m-0">
          Frame: <span class="font-bold text-gray-600 capitalize">{selectedTemplate?.name || selectedFrame}</span>
        </p>
      </div>
    </div>

    <!-- Right: Camera -->
    <div
      class="flex-1 bg-[#0E8E5E] flex items-center justify-center p-10 relative overflow-hidden"
      style="background-image: repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.07) 40px, rgba(0,0,0,0.07) 80px);"
    >
      <!-- Decorative outer corners -->
      <div class="absolute top-6 left-6 w-8 h-8 border-t-4 border-l-4 border-white/30 rounded-tl-lg pointer-events-none"></div>
      <div class="absolute top-6 right-6 w-8 h-8 border-t-4 border-r-4 border-white/30 rounded-tr-lg pointer-events-none"></div>
      <div class="absolute bottom-6 left-6 w-8 h-8 border-b-4 border-l-4 border-white/30 rounded-bl-lg pointer-events-none"></div>
      <div class="absolute bottom-6 right-6 w-8 h-8 border-b-4 border-r-4 border-white/30 rounded-br-lg pointer-events-none"></div>

      <div class="w-full max-w-[720px] aspect-video rounded-2xl overflow-hidden shadow-2xl bg-[#111827] relative flex items-center justify-center border-4 border-[#FFC107]">
        {#if boothFlow.isFlashActive}
          <div class="absolute inset-0 bg-white z-40 pointer-events-none transition-opacity duration-150"></div>
        {/if}
        <!-- Corner markers -->
        {#each ['top-2 left-2', 'top-2 right-2', 'bottom-2 left-2', 'bottom-2 right-2'] as pos}
          <div class={`absolute ${pos} w-5 h-5 border-2 border-[#FFC107] rounded-sm pointer-events-none z-10`}></div>
        {/each}

        <!-- Permanent Liveview Feed Layer -->
        {#if cameraStore.isLiveviewActive}
          {#if cameraStore.cameraMode === 'webcam'}
            <video
              use:playStream={cameraStore.stream}
              bind:this={videoEl}
              autoplay
              playsinline
              muted
              class="w-full h-full object-cover"
              style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
            ></video>
          {:else if frameSrc}
            <img
              src={frameSrc}
              alt="Livefeed"
              class="w-full h-full object-cover"
              style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
            />
          {/if}
        {/if}

        <!-- Captured Photo Overlay Layer - Shown when allDone and not running retake -->
        {#if allDone && !isRunning && activeRetakeIdx !== null && boothFlow.photosTaken[activeRetakeIdx]}
          <img
            src={boothFlow.photosTaken[activeRetakeIdx]}
            alt={`Photo slot ${activeRetakeIdx + 1}`}
            class="absolute inset-0 w-full h-full object-cover z-20"
          />
        {/if}

        <!-- Top-left Retake button when allDone and not running capture -->
        {#if allDone && !isRunning && activeRetakeIdx !== null && boothFlow.photosTaken[activeRetakeIdx]}
          <div class="absolute top-4 left-4 z-30 flex items-center gap-2">
            <button
              onclick={() => handleRetakeSingle(activeRetakeIdx!)}
              class="flex items-center gap-2 bg-[#CD1C33] hover:bg-[#A31327] text-white px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-widest shadow-xl border-2 border-white/20 cursor-pointer transition-all active:scale-95"
            >
              <RotateCw size={16} strokeWidth={2.5} />
              <span>Ulang Foto {activeRetakeIdx + 1}</span>
            </button>
          </div>
        {/if}

        <!-- Countdown Overlay -->
        {#if boothFlow.countdown !== null && boothFlow.countdown > 0}
          <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-30">
            <span class="text-[11rem] font-black text-white leading-none drop-shadow-2xl font-mono">{boothFlow.countdown}</span>
            <span class="text-white/60 text-sm font-bold tracking-widest uppercase mt-2">Bersiap!</span>
          </div>
        {:else if !isRunning && !allDone}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            onclick={startCapture}
            class="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors z-20 cursor-pointer"
          >
            <div class="text-white/80 text-xl font-bold uppercase tracking-[0.6em] text-center px-12 leading-loose">
              Tap untuk mulai
            </div>
          </div>
        {/if}
      </div>

      {#if allDone}
        <button
          onclick={() => onComplete(boothFlow.photosTaken)}
          class="absolute bottom-8 right-8 bg-[#CD1C33] text-white px-8 py-3 rounded-full font-bold shadow-2xl hover:bg-[#A31327] flex items-center gap-2 transition-colors border-2 border-white/20 cursor-pointer uppercase tracking-widest text-xs"
        >
          Pilih Filter <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      {/if}
    </div>
  </div>
</div>
