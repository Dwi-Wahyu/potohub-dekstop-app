<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Check } from '@lucide/svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { getLiveviewTransformStyle } from '$lib/utils/shared';
  import {
    fetchCategories,
    fetchTemplates,
    requireActiveBoothId,
    type BoothCategory,
    type BoothTemplate
  } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';

  import { uiConfig } from '$lib/stores/uiConfig.svelte';

  interface Props {
    onSelectFrame: (frameId: string) => void;
    onBack: () => void;
    background?: string;
  }

  let { onSelectFrame, onBack, background }: Props = $props();

  let selectedFrame = $state('frame1');
  let selectedCategory = $state('SEMUA');

  let categoriesData = $state<BoothCategory[]>([]);
  let templatesData = $state<BoothTemplate[]>([]);
  let loadingCatalog = $state(true);
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

  const FALLBACK_FRAMES = [
    { id: 'frame1', name: 'Vintage 1', cols: 1, rows: 3, catName: 'SERIES', category_id: '', color: 'hsl(37, 70%, 60%)' },
    { id: 'frame2', name: 'Vintage 2', cols: 2, rows: 2, catName: 'IDOL', category_id: '', color: 'hsl(74, 70%, 60%)' },
    { id: 'frame3', name: 'Vintage 3', cols: 1, rows: 3, catName: 'MUSIC', category_id: '', color: 'hsl(111, 70%, 60%)' },
    { id: 'frame4', name: 'Vintage 4', cols: 2, rows: 2, catName: 'BIRTHDAY', category_id: '', color: 'hsl(148, 70%, 60%)' },
    { id: 'frame5', name: 'Vintage 5', cols: 3, rows: 3, catName: 'SERIES', category_id: '', color: 'hsl(185, 70%, 60%)' },
    { id: 'frame6', name: 'Vintage 6', cols: 1, rows: 2, catName: 'IDOL', category_id: '', color: 'hsl(222, 70%, 60%)' },
    { id: 'frame7', name: 'Vintage 7', cols: 2, rows: 2, catName: 'MUSIC', category_id: '', color: 'hsl(259, 70%, 60%)' },
    { id: 'frame8', name: 'Vintage 8', cols: 1, rows: 4, catName: 'BIRTHDAY', category_id: '', color: 'hsl(296, 70%, 60%)' }
  ];

  onMount(async () => {
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
      console.error('[V3Frame] Failed to load dynamic catalog from backend:', err);
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
    if (liveviewInterval) clearInterval(liveviewInterval);
    cameraStore.stopLiveview();
  });

  let frameCategories = $derived([
    'SEMUA',
    ...categoriesData.map((c) => c.name.toUpperCase())
  ]);

  let visibleFrames = $derived.by(() => {
    if (templatesData.length > 0) {
      if (selectedCategory === 'SEMUA') return templatesData;
      const matchedCat = categoriesData.find((c) => c.name.toUpperCase() === selectedCategory);
      if (matchedCat) {
        return templatesData.filter((t) => t.category_id === matchedCat.id);
      }
      return templatesData;
    }
    if (selectedCategory === 'SEMUA') return FALLBACK_FRAMES;
    return FALLBACK_FRAMES.filter((f) => f.catName === selectedCategory);
  });

  const VISIBLE_STEPS = ['Package', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter'];
  const activeStepIdx = 2;
  const DEFAULT_BG = '#f5f5f5';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('frame').background ?? DEFAULT_BG);
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
        Pilih Kategori
      </h1>
      <p class="text-white/50 text-[8px] uppercase tracking-[0.3em] mt-1 m-0">{visibleFrames.length} frame tersedia · Pilih favoritmu</p>
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

  <!-- Category bar -->
  <div class="h-12 bg-[#1a1a1a] flex items-center justify-center gap-2 shrink-0 px-6 overflow-x-auto" style="scrollbar-width: none;">
    <span class="text-white/20 text-[8px] font-bold tracking-widest uppercase mr-2 shrink-0 font-mono">Kategori:</span>
    {#each frameCategories as cat}
      {@const active = selectedCategory === cat}
      <button
        onclick={() => (selectedCategory = cat)}
        class={`px-5 py-1 rounded-full text-[10px] font-bold tracking-[0.15em] transition-all uppercase shrink-0 border-none cursor-pointer ${
          active
            ? 'bg-[#FFC107] text-black shadow-md scale-105'
            : 'bg-white/10 text-white/50 hover:bg-white/15 hover:text-white'
        }`}
      >
        {cat}
      </button>
    {/each}
  </div>

  <!-- Frame grid -->
  <div class="flex-1 overflow-y-auto bg-[#f5f5f5] p-6" style="scrollbar-width: none;">
    {#if visibleFrames.length === 0}
      <div class="w-full h-full flex items-center justify-center text-gray-400 font-bold">
        Tidak ada frame untuk kategori ini
      </div>
    {:else}
      <div class="grid grid-cols-5 gap-4 max-w-5xl mx-auto pb-2">
        {#each visibleFrames as f, i}
          {@const isSel = selectedFrame === f.id}
          {@const bandColor = 'color' in f ? f.color : `hsl(${(i * 37) % 360}, 70%, 60%)`}
          {@const photoSlots = 'design_data' in f && f.design_data ? f.design_data.filter((l: any) => !l.isBackground) : []}
          {@const photoCount = photoSlots.length || ('cols' in f ? (f as any).cols * (f as any).rows : 3)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            onclick={() => {
              selectedFrame = f.id;
              onSelectFrame(f.id);
            }}
            class={`bg-white rounded-2xl overflow-hidden cursor-pointer transition-all flex flex-col border-2 ${
              isSel
                ? 'border-[#CD1C33] shadow-xl scale-[1.02]'
                : 'border-transparent shadow-sm hover:shadow-lg hover:border-gray-200'
            }`}
          >
            <!-- color band -->
            <div class="h-1.5 w-full" style="background: {bandColor};"></div>

            <div class="p-3 flex flex-col gap-2.5">
              <div class="flex justify-between items-start">
                <span class={`text-[11px] font-black ${isSel ? 'text-[#CD1C33]' : 'text-gray-700'}`}>
                  {f.name}
                </span>
                <span class="text-[8px] text-gray-300 font-medium bg-gray-50 px-1.5 py-0.5 rounded-full">
                  {photoCount} foto
                </span>
              </div>

              <div class="w-full aspect-[9/16] rounded-lg overflow-hidden bg-gray-50 flex flex-col gap-0.5 p-1 border border-gray-100 items-center justify-center relative">
                {#if 'preview_image_url' in f && f.preview_image_url}
                  <img src={f.preview_image_url} alt={f.name} class="w-full h-full object-contain block rounded" />
                {:else if cameraStore.isLiveviewActive}
                  <div class="w-full h-full flex flex-col gap-0.5 relative overflow-hidden">
                    {#each Array(Math.min(4, photoCount)) as _, j}
                      <div class="flex-1 bg-black/30 rounded-md overflow-hidden relative">
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
                          <img src={frameSrc} alt="Live feed" class="w-full h-full object-cover block" style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};" />
                        {/if}
                      </div>
                    {/each}
                  </div>
                {:else}
                  {#each Array(Math.min(4, photoCount)) as _, j}
                    <div
                      class="w-full flex-1 rounded-md"
                      style={`background: hsl(${((i * 37) + j * 40) % 360}, 60%, 75%);`}
                    ></div>
                  {/each}
                {/if}
              </div>

              {#if isSel}
                <div class="flex items-center justify-center gap-1 text-[#CD1C33] bg-[#fef2f2] rounded-full py-0.5">
                  <Check size={10} strokeWidth={3} /><span class="text-[9px] font-bold">Dipilih</span>
                </div>
              {:else}
                <div class="text-[9px] text-gray-400 text-center">Tap untuk pilih</div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
