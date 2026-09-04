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
  import { QrCode, Camera, RefreshCw, ArrowRight, Search, RotateCw } from '@lucide/svelte';

  interface Props {
    selectedFrame: string;
    onComplete: (photos: string[]) => void;
    onBack: () => void;
    background?: string;
  }

  let { selectedFrame, onComplete, onBack, background }: Props = $props();

  let selectedTemplate = $state<BoothTemplate | null>(null);
  let photoSlots = $derived(getSortedPhotoSlots(selectedTemplate?.design_data));
  let totalPhotos = $derived(photoSlots.length > 0 ? photoSlots.length : 4);
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
      console.error('[V2Session] Failed to fetch template in V2Session:', err);
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

  function handleRetake() {
    if (boothFlow.photosTaken.length > 0) {
      boothFlow.photosTaken = boothFlow.photosTaken.slice(0, -1);
      selectedRetakeIndex = null;
    }
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
  let sessionsDone = $derived(boothFlow.photosTaken.length);
  let activeRetakeIdx = $derived(
    selectedRetakeIndex !== null ? selectedRetakeIndex : (allDone ? 0 : null)
  );

  const STEPPER_LABELS = ['Tutorial', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter', 'Scan File'];
  const activeIdx = 3;
  const DEFAULT_BG = '#fafafa';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('session').background ?? DEFAULT_BG);
</script>

<div
  class="w-full h-full flex flex-col relative overflow-hidden select-none"
  style:background={effectiveBg}
  style:font-family="'Playfair Display', Georgia, serif"
>
  <!-- StepperHeader -->
  <div
    class="w-full h-16 flex items-center justify-between px-10 border-b-2 border-black shrink-0 relative z-20 select-none"
    style="background: #C7EED8;"
  >
    <!-- dot pattern -->
    <div
      class="absolute inset-0 opacity-10 pointer-events-none"
      style="background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.5) 1px, transparent 0); background-size: 24px 24px;"
    ></div>

    <!-- stepper pills -->
    <div class="flex items-center gap-1 relative z-10 font-['Nunito',sans-serif]">
      {#each STEPPER_LABELS as label, i}
        {@const isActive = i === activeIdx}
        {@const isDone = i < activeIdx}
        <div class="flex items-center">
          <div
            class={`px-4 py-1.5 rounded-full border-2 border-black font-bold text-xs transition-all ${
              isActive
                ? 'bg-[#C7EED8] text-black shadow-[4px_4px_0_0_rgba(0,0,0,1)]'
                : isDone
                  ? 'bg-black text-white border-black'
                  : 'text-black/40 border-black/30 bg-transparent'
            }`}
          >
            {label}
          </div>
          {#if i < STEPPER_LABELS.length - 1}
            <div
              class={`w-6 h-px border-t border-black mx-0.5 ${isDone ? 'opacity-100' : 'opacity-30'}`}
            ></div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- brand -->
    <div class="flex items-center gap-2 relative z-10 font-['Nunito',sans-serif]">
      <div
        class="w-8 h-8 rounded-xl border-2 border-black bg-white flex items-center justify-center text-[#2a2873] shadow-inner"
      >
        <QrCode size={18} strokeWidth={2.5} />
      </div>
      <h1 class="text-black font-black text-xl m-0 tracking-wide drop-shadow-sm uppercase">
        {uiConfig.config.boothName || 'POTOHUB'}
      </h1>
    </div>
  </div>

  <div class="flex flex-1 items-center justify-center p-6 gap-6 min-h-0 relative z-10">
    <!-- Viewfinder (70%) -->
    <div
      class="flex-[0_0_70%] h-full bg-black rounded-3xl border-[3px] border-black flex items-center justify-center relative overflow-hidden shadow-sm"
    >
      {#if boothFlow.isFlashActive}
        <div class="absolute inset-0 bg-white z-40 pointer-events-none transition-opacity duration-150"></div>
      {/if}

      <!-- Dashed mockup guide (16:9 ratio) -->
      <div
        class="w-[60%] aspect-video border-2 border-dashed border-white/40 rounded-[32px] pointer-events-none z-10"
      ></div>

      <!-- Permanent Liveview Feed Layer -->
      {#if cameraStore.isLiveviewActive}
        {#if cameraStore.cameraMode === 'webcam'}
          <video
            use:playStream={cameraStore.stream}
            bind:this={videoEl}
            autoplay
            playsinline
            muted
            class="absolute inset-0 w-full h-full object-cover"
            style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
          ></video>
        {:else if frameSrc}
          <img
            src={frameSrc}
            alt="Livefeed"
            class="absolute inset-0 w-full h-full object-cover"
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
        <div class="absolute top-6 left-6 z-30 flex items-center gap-2 font-['Nunito',sans-serif]">
          <button
            onclick={() => handleRetakeSingle(activeRetakeIdx!)}
            class="flex items-center gap-2 bg-black/80 hover:bg-black text-white border-2 border-white/80 px-5 py-2.5 rounded-full font-bold text-sm shadow-[4px_4px_0_0_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer transition-all"
          >
            <RotateCw size={16} strokeWidth={2.5} />
            <span>Ulang Foto {activeRetakeIdx + 1}</span>
          </button>
        </div>
      {/if}

      <!-- Countdown Overlay -->
      {#if boothFlow.countdown !== null && boothFlow.countdown > 0}
        <div class="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm z-30">
          <div class="text-[18rem] text-white font-black leading-none drop-shadow-[0_0_30px_rgba(255,255,255,0.8)] font-['Nunito',sans-serif]">
            {boothFlow.countdown}
          </div>
        </div>
      {:else if !isRunning && !allDone}
        <div class="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none font-['Nunito',sans-serif]">
          <div class="text-white/80 text-6xl font-black uppercase tracking-[0.2em] mb-4 drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
            Ready?
          </div>
          <p class="text-white/50 italic text-xl font-['Playfair_Display',serif]">
            Click "Capture" on the right
          </p>
        </div>
      {/if}

      <!-- Photo counter badge -->
      <div class={`absolute top-6 left-6 px-6 py-2 border-2 border-white rounded-full text-white font-bold text-xl tracking-widest bg-black/50 backdrop-blur-md z-20 font-['Nunito',sans-serif] ${allDone ? 'hidden' : ''}`}>
        Photo {Math.min(sessionsDone + 1, totalPhotos)} / {totalPhotos}
      </div>

      <!-- Timer badge -->
      <div class="absolute top-6 right-6 px-5 py-2 border-2 border-white/30 rounded-full text-white/60 font-bold text-sm tracking-widest bg-black/40 backdrop-blur-md z-20 font-['Nunito',sans-serif]">
        {formatTime(sessionSecs)}
      </div>
    </div>

    <!-- Preview & Action Panel (30%) -->
    <div
      class="flex-1 h-full border-[3px] border-black rounded-3xl pt-8 pb-8 px-6 flex flex-col bg-white shadow-[8px_8px_0_0_rgba(0,0,0,1)] font-['Nunito',sans-serif]"
    >
      <h3 class="text-xl font-bold text-center mb-6 border-b-2 border-black pb-4 uppercase tracking-widest font-['Playfair_Display',serif]">
        Preview
      </h3>

      <!-- Selected template preview with liveview & photos -->
      <div class="flex-1 flex flex-col items-center justify-center min-h-0 py-2 overflow-hidden">
        {#if selectedTemplate}
          {@const tWidth = selectedTemplate.width || 1200}
          {@const tHeight = selectedTemplate.height || 1800}
          <div
            class="relative h-full max-w-full overflow-hidden rounded-xl bg-black/40 shadow-[4px_4px_0_0_#000] border-[2.5px] border-black"
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
          <div class="text-black/40 text-xs font-bold font-['Nunito',sans-serif]">Loading Template...</div>
        {/if}

        <p class="mt-3 font-bold text-gray-400 text-xs tracking-widest uppercase m-0">
          {sessionsDone} of {totalPhotos} taken
        </p>
      </div>

      <!-- Action buttons -->
      <div class="flex flex-col gap-3 mt-4 shrink-0">
        {#if !allDone}
          <button
            onclick={startCapture}
            disabled={isRunning}
            class="w-full py-4 bg-black text-white rounded-xl text-lg font-bold tracking-widest uppercase hover:bg-gray-800 transition-colors shadow-[4px_4px_0_0_rgba(200,200,200,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none flex items-center justify-center gap-3 cursor-pointer border-none"
          >
            <Camera size={20} /> {isRunning ? 'Capturing...' : 'Capture'}
          </button>
        {/if}

        <button
          onclick={handleRetake}
          disabled={sessionsDone === 0 || isRunning}
          class={`w-full py-3 border-2 border-black rounded-xl font-bold tracking-widest uppercase flex items-center justify-center gap-2 transition-all cursor-pointer bg-white ${
            sessionsDone > 0 && !isRunning
              ? 'hover:bg-gray-100 shadow-[4px_4px_0_0_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none text-black'
              : 'opacity-30 cursor-not-allowed bg-gray-50 text-gray-400'
          }`}
        >
          <RefreshCw size={16} strokeWidth={2.5} /> Retake
        </button>

        {#if allDone}
          <button
            onclick={() => onComplete(boothFlow.photosTaken)}
            class="w-full py-4 border-2 border-black bg-black text-white rounded-xl font-bold tracking-widest uppercase flex items-center justify-center gap-2 hover:bg-gray-800 shadow-[4px_4px_0_0_rgba(200,200,200,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer"
          >
            Finish <ArrowRight size={18} strokeWidth={3} />
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
