<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { QrCode, Check } from '@lucide/svelte';
  import {
    fetchCategories,
    fetchTemplates,
    requireActiveBoothId,
    type BoothCategory,
    type BoothTemplate
  } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';

  interface Props {
    onSelectFrame: (frameId: string) => void;
    onBack: () => void;
  }

  let { onSelectFrame, onBack }: Props = $props();

  let selectedFrame = $state('strip-2x4');
  let activeCategoryId = $state('ALL');
  let timeLeft = $state(300);
  let timer: any = null;
  let liveviewInterval: any = null;
  let frameSrc = $state('');
  let videoEl = $state<HTMLVideoElement | null>(null);

  let categoriesData = $state<BoothCategory[]>([]);
  let templatesData = $state<BoothTemplate[]>([]);
  let loadingCatalog = $state(true);

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

  const FALLBACK_FRAMES = [
    { id: 'strip-2x4', name: 'Strip 2×4', cols: 2, rows: 4, category_id: 'ALL', preview_image_url: '' },
    { id: 'grid-2x2', name: 'Grid 2×2', cols: 2, rows: 2, category_id: 'ALL', preview_image_url: '' },
    { id: 'wide-1x3', name: 'Wide 1×3', cols: 1, rows: 3, category_id: 'ALL', preview_image_url: '' },
    { id: 'classic-4', name: 'Classic ×4', cols: 2, rows: 2, category_id: 'ALL', preview_image_url: '' },
    { id: 'square-9', name: 'Square ×9', cols: 3, rows: 3, category_id: 'ALL', preview_image_url: '' },
    { id: 'panorama', name: 'Panorama', cols: 1, rows: 2, category_id: 'ALL', preview_image_url: '' }
  ];

  onMount(async () => {
    timer = setInterval(() => {
      if (timeLeft > 0) timeLeft--;
    }, 1000);

    try {
      const boothId = await requireActiveBoothId();
      await cachedFetch(
        `categories:${boothId}`,
        () => fetchCategories(boothId),
        (d) => { categoriesData = d; }
      );
      await cachedFetch(
        `templates:${boothId}`,
        () => fetchTemplates(boothId),
        (d) => { templatesData = d; }
      );
      if (templatesData.length > 0) {
        selectedFrame = templatesData[0].id;
      }
    } catch (err) {
      console.error('[V2Frame] Failed to load dynamic catalog from backend:', err);
    } finally {
      loadingCatalog = false;
    }

    await cameraStore.startLiveview(videoEl);
    if (cameraStore.cameraMode === 'usb' || cameraStore.cameraMode === 'demo') {
      liveviewInterval = setInterval(async () => {
        const url = await cameraStore.getLiveviewFrame();
        if (url) frameSrc = url;
      }, 150);
    }
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (liveviewInterval) clearInterval(liveviewInterval);
    cameraStore.stopLiveview();
  });

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  let categoriesPills = $derived([
    { id: 'ALL', name: 'ALL FRAMES' },
    ...categoriesData.map((c) => ({ id: c.id, name: c.name.toUpperCase() }))
  ]);

  let visibleTemplates = $derived.by(() => {
    if (templatesData.length > 0) {
      if (activeCategoryId === 'ALL') return templatesData;
      return templatesData.filter((t) => t.category_id === activeCategoryId);
    }
    return FALLBACK_FRAMES;
  });

  let selectedTemplateObj = $derived(
    templatesData.find((t) => t.id === selectedFrame) ||
    FALLBACK_FRAMES.find((f) => f.id === selectedFrame) ||
    visibleTemplates[0]
  );

  let activeCatIdx = $derived(categoriesPills.findIndex((c) => c.id === activeCategoryId));
  let catProgress = $derived((Math.max(0, activeCatIdx) + 1) / categoriesPills.length);

  const STEPPER_LABELS = ['Tutorial', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter', 'Scan File'];
  const activeIdx = 2;
</script>

<div
  class="w-screen h-screen bg-[#fafafa] flex flex-col relative overflow-hidden select-none"
  style="font-family: 'Playfair Display', Georgia, serif;"
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

  <div class="flex flex-1 gap-5 p-5 min-h-0 relative z-10">
    <!-- Left: selected frame preview -->
    <div class="w-[28%] border-[3px] border-black rounded-3xl bg-white flex flex-col items-center p-6 gap-4 relative">
      <div class="absolute top-5 left-5 px-4 py-1 border-2 border-black rounded-full text-sm font-black tracking-widest font-['Nunito',sans-serif]">
        {fmtTime(timeLeft)}
      </div>

      <p class="text-xs font-bold uppercase tracking-[0.18em] text-black/40 mt-8 font-['Nunito',sans-serif] m-0">
        Preview
      </p>
      <h3 class="text-xl font-bold m-0 text-center">
        {selectedTemplateObj?.name || 'Selected Frame'}
      </h3>

      <div class="flex-1 flex items-center justify-center w-full min-h-0 p-1">
        {#if selectedTemplateObj}
          {@const bgLayer = 'design_data' in selectedTemplateObj ? selectedTemplateObj.design_data?.find((l: any) => l.isBackground) : null}
          {@const bgUrl = bgLayer?.imageUrl || ('frame_image_url' in selectedTemplateObj ? selectedTemplateObj.frame_image_url : '')}
          {@const tWidth = ('width' in selectedTemplateObj && selectedTemplateObj.width) || 1200}
          {@const tHeight = ('height' in selectedTemplateObj && selectedTemplateObj.height) || 1800}

          <div
            class="relative h-full max-w-full overflow-hidden rounded-xl bg-black/40 shadow-[8px_8px_0_0_#000] border-[3px] border-black"
            style="aspect-ratio: {tWidth} / {tHeight};"
          >
            {#if 'design_data' in selectedTemplateObj && selectedTemplateObj.design_data && selectedTemplateObj.design_data.length > 0}
              {#each selectedTemplateObj.design_data as layer, idx (layer.id ?? idx)}
                {@const layerZIndex = selectedTemplateObj.design_data.length - idx}
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
                  {:else}
                    <div class="w-full h-full bg-black/40 relative overflow-hidden">
                      {#if cameraStore.isLiveviewActive}
                        {#if cameraStore.cameraMode === 'webcam'}
                          <video
                            use:playStream={cameraStore.stream}
                            autoplay
                            playsinline
                            muted
                            class="w-full h-full object-cover block"
                            style="transform: scaleX(-1);"
                          ></video>
                        {:else if frameSrc}
                          <img
                            src={frameSrc}
                            alt="Live camera feed"
                            class="w-full h-full object-cover block"
                          />
                        {:else}
                          <div class="w-full h-full flex items-center justify-center text-white/40 text-[10px] animate-pulse">
                            Live View...
                          </div>
                        {/if}
                      {:else}
                        <div class="w-full h-full flex items-center justify-center text-white/40 text-[10px]">
                          Live View
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            {:else}
              {@const cols = (selectedTemplateObj as any).cols || 2}
              {@const rows = (selectedTemplateObj as any).rows || 2}
              <div
                style={`display: grid; grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr); gap: 4px; width: 100%; height: 100%;`}
                class="p-2"
              >
                {#each Array(cols * rows) as _, i}
                  <div class="border-2 border-black flex items-center justify-center overflow-hidden bg-black/30">
                    {#if cameraStore.isLiveviewActive}
                      {#if cameraStore.cameraMode === 'webcam'}
                        <video
                          use:playStream={cameraStore.stream}
                          autoplay
                          playsinline
                          muted
                          class="w-full h-full object-cover block"
                          style="transform: scaleX(-1);"
                        ></video>
                      {:else if frameSrc}
                        <img src={frameSrc} alt="Live feed" class="w-full h-full object-cover block" />
                      {/if}
                    {:else}
                      <span class="text-sm font-bold text-black/30 font-['Nunito',sans-serif]">{i + 1}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <button
        onclick={() => onSelectFrame(selectedFrame)}
        class="w-4/5 py-3.5 border-[2.5px] border-black rounded-full text-base font-bold uppercase tracking-widest font-['Nunito',sans-serif] hover:bg-black hover:text-white transition-all shadow-[4px_4px_0_0_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 cursor-pointer bg-white text-black shrink-0"
      >
        Select Frame
      </button>
    </div>

    <!-- Right: categories + frame grid -->
    <div class="flex-1 border-[3px] border-black rounded-3xl bg-white flex flex-col overflow-hidden">
      <!-- header -->
      <div class="px-7 pt-6 pb-0 shrink-0">
        <h2 class="text-3xl font-bold text-center mb-1">Choose Your Frame</h2>
        <div class="w-16 h-[2px] bg-black mx-auto mb-5"></div>

        <!-- category pill bar -->
        <div class="flex items-center gap-2 overflow-x-auto pb-0 font-['Nunito',sans-serif]" style="scrollbar-width: none;">
          {#each categoriesPills as cat}
            {@const isActive = activeCategoryId === cat.id}
            <button
              onclick={() => (activeCategoryId = cat.id)}
              class={`shrink-0 px-4 py-2 rounded-full text-[11px] font-black tracking-[0.14em] uppercase border-[2px] transition-all cursor-pointer ${
                isActive
                  ? 'bg-black text-white border-black shadow-[3px_3px_0_0_rgba(0,0,0,0.25)]'
                  : 'bg-white text-black border-black/25 hover:border-black'
              }`}
            >
              {cat.name}
            </button>
          {/each}
        </div>

        <!-- scroll progress bar -->
        <div class="mt-3 mb-4 h-[3px] bg-black/10 rounded-full overflow-hidden">
          <div
            class="h-full bg-black rounded-full transition-all duration-300"
            style={`width: ${catProgress * 100}%;`}
          ></div>
        </div>
      </div>

      <!-- frame grid -->
      <div class="flex-1 overflow-y-auto px-7 pb-7 min-h-0 font-['Nunito',sans-serif]">
        {#if visibleTemplates.length === 0}
          <div class="w-full h-full flex items-center justify-center text-black/30 font-bold">
            Tidak ada frame untuk kategori ini
          </div>
        {:else}
          <div class="grid grid-cols-3 gap-4">
            {#each visibleTemplates as f}
              {@const active = selectedFrame === f.id}
              <button
                onclick={() => (selectedFrame = f.id)}
                class={`border-[2.5px] rounded-2xl p-4 flex flex-col items-center gap-3 cursor-pointer transition-all ${
                  active
                    ? 'border-black shadow-[5px_5px_0_0_#000] bg-gray-50'
                    : 'border-black/20 hover:border-black bg-white'
                }`}
              >
                <div class="w-2/3 h-24 flex items-center justify-center overflow-hidden rounded-lg bg-gray-100 p-1 border border-black/10">
                  {#if 'preview_image_url' in f && f.preview_image_url}
                    <img src={f.preview_image_url} alt={f.name} class="w-full h-full object-contain block" />
                  {:else if 'design_data' in f && f.design_data}
                    {@const photoSlots = f.design_data.filter((l: any) => !l.isBackground)}
                    <div class="w-full h-full grid grid-cols-2 gap-1 p-0.5">
                      {#each photoSlots as _, i}
                        <div class={`rounded border ${active ? 'bg-black border-gray-600' : 'bg-gray-200 border-gray-300'}`}></div>
                      {/each}
                    </div>
                  {:else}
                    {@const cols = (f as any).cols || 2}
                    {@const rows = (f as any).rows || 2}
                    <div
                      style={`display: grid; grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr); gap: 3px; aspect-ratio: ${cols === 1 ? '2/3' : cols >= 3 ? '1/1' : '2/3'}; width: 100%;`}
                    >
                      {#each Array(cols * rows) as _, i}
                        <div
                          style={`background: ${active ? '#111' : '#e5e5e5'}; border: 1.5px solid ${active ? '#555' : '#bbb'}; border-radius: 3px;`}
                        ></div>
                      {/each}
                    </div>
                  {/if}
                </div>
                <span class="text-xs font-black tracking-wide text-center">{f.name}</span>
                {#if active}
                  <Check size={14} strokeWidth={3} />
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
