<script lang="ts">
  import { onMount } from 'svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import StickerPicker from '$lib/components/shared/StickerPicker.svelte';
  import StickerCanvas from '$lib/components/shared/StickerCanvas.svelte';
  import { fetchEmots, fetchTemplates, requireActiveBoothId, type BoothEmot, type BoothTemplate } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';
  import { getSortedPhotoSlots } from '$lib/utils/templateComposite';
  import type { Sticker, StickerType } from '$lib/utils/stickers';
  import { QrCode, ChevronLeft, ChevronRight, ArrowRight, Camera } from '@lucide/svelte';

  interface Props {
    selectedFrame?: string;
    onNext: () => void;
    onBack: () => void;
    background?: string;
  }

  let { selectedFrame = '', onNext, onBack, background }: Props = $props();

  let activeFilterIndex = $state(0);
  let emotsData = $state<BoothEmot[]>([]);
  let selectedTemplate = $state<BoothTemplate | null>(null);
  let photoSlots = $derived(getSortedPhotoSlots(selectedTemplate?.design_data));
  let bgLayer = $derived(selectedTemplate?.design_data?.find((l) => l.isBackground));
  let bgUrl = $derived(bgLayer?.imageUrl || selectedTemplate?.frame_image_url || '');

  let stickers = $state<Sticker[]>(boothFlow.stickers);
  let stickerCounter = $state(0);

  const V2_FILTERS = [
    { id: 'Original', name: 'Original', style: '' },
    { id: 'B&W', name: 'B&W', style: 'grayscale' },
    { id: 'Sepia', name: 'Sepia', style: 'sepia' },
    { id: 'Cool', name: 'Cool', style: 'saturate-50' },
    { id: 'Warm', name: 'Warm', style: 'brightness-110' }
  ];

  let activeFilter = $derived(V2_FILTERS[activeFilterIndex]);

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
      await cachedFetch(
        `emots:${boothId}`,
        () => fetchEmots(boothId),
        (emots) => { emotsData = emots; }
      );
    } catch (err) {
      console.error('[V2Filter] Failed to fetch catalog or emots:', err);
    }
  });

  function addSticker(emoji: string, imageUrl: string = '', type: StickerType = 'emoji') {
    stickers = [
      ...stickers,
      {
        id: stickerCounter++,
        emoji,
        imageUrl,
        type,
        x: 30 + Math.random() * 40,
        y: 30 + Math.random() * 40
      }
    ];
    boothFlow.stickers = stickers;
  }

  function moveSticker(id: number, x: number, y: number) {
    stickers = stickers.map((st) => (st.id === id ? { ...st, x, y } : st));
    boothFlow.stickers = stickers;
  }

  function removeSticker(id: number) {
    stickers = stickers.filter((st) => st.id !== id);
    boothFlow.stickers = stickers;
  }

  function handleSwipe(dir: 'left' | 'right') {
    const total = V2_FILTERS.length;
    activeFilterIndex = dir === 'left' ? (activeFilterIndex + 1) % total : (activeFilterIndex - 1 + total) % total;
    boothFlow.selectedFilterId = V2_FILTERS[activeFilterIndex].id;
  }

  const STEPPER_LABELS = ['Tutorial', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter', 'Scan File'];
  const activeIdx = 4;
  const DEFAULT_BG = '#fafafa';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('filter').background ?? DEFAULT_BG);
</script>

<div
  class="w-full h-full flex flex-col select-none relative overflow-hidden"
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

  <div class="flex flex-col flex-1 min-h-0 pt-5 pb-4 px-10 gap-4 relative z-10">
    <!-- StickerPicker sits above carousel -->
    <div class="shrink-0">
      <StickerPicker onPick={addSticker} emots={emotsData} />
    </div>

    <h2 class="text-3xl font-bold border-b-2 border-black pb-2 shrink-0 m-0">Choose filter!</h2>

    <!-- Carousel -->
    <div class="flex flex-1 items-center justify-center relative overflow-visible">
      {#each V2_FILTERS as f, i}
        {@const total = V2_FILTERS.length}
        {@const isActive = i === activeFilterIndex}
        {@const isPrev = i === (activeFilterIndex - 1 + total) % total}
        {@const isNext = i === (activeFilterIndex + 1) % total}

        {#if isActive || isPrev || isNext}
          <!-- Card container -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            onclick={() => !isActive && (activeFilterIndex = i)}
            class={`absolute aspect-[2/3] border-[3px] rounded-3xl bg-white p-3 transition-all duration-300 ${
              isActive
                ? 'border-black shadow-[8px_8px_0_0_rgba(0,0,0,1)] z-10 scale-100 cursor-default'
                : 'border-gray-400 opacity-50 z-0 scale-[0.82] cursor-pointer'
            } ${isPrev ? '-translate-x-[200px]' : isNext ? 'translate-x-[200px]' : ''}`}
            style="height: 100%;"
          >
            {#if isActive}
              <StickerCanvas
                {stickers}
                onMove={moveSticker}
                onRemove={removeSticker}
                class="w-full h-full"
              >
                {#if selectedTemplate}
                  {@const tWidth = selectedTemplate.width || 1200}
                  {@const tHeight = selectedTemplate.height || 1800}
                  <div
                    class="relative h-full max-w-full overflow-hidden rounded-xl bg-black/40 shadow-md mx-auto"
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
                            <div class="w-full h-full bg-black/40 relative overflow-hidden">
                              {#if capturedPhoto}
                                <img
                                  src={capturedPhoto}
                                  alt={`Photo ${targetIdx + 1}`}
                                  class={`w-full h-full object-cover block ${f.style}`}
                                />
                              {/if}
                            </div>
                          {/if}
                        </div>
                      {/each}
                    {/if}
                  </div>
                {:else}
                  <div class="w-full h-full flex flex-col gap-2">
                    <div class="grid grid-cols-2 gap-2 flex-1 w-full h-full">
                      {#each boothFlow.photosTaken as photo, pIdx}
                        <div class={`border-2 border-black bg-gray-300 overflow-hidden ${f.style}`}>
                          <img src={photo} alt={`P ${pIdx+1}`} class="w-full h-full object-cover" />
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </StickerCanvas>
            {:else}
              <div class="w-full h-full flex flex-col items-center justify-center blur-[1px] opacity-70">
                {#if selectedTemplate}
                  {@const tWidth = selectedTemplate.width || 1200}
                  {@const tHeight = selectedTemplate.height || 1800}
                  <div
                    class="relative h-full max-w-full overflow-hidden rounded-xl bg-black/40 shadow-md mx-auto"
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
                          {:else if !layer.isQr}
                            {@const slotIdx = photoSlots.findIndex((s) => s.id === layer.id || s === layer)}
                            {@const targetIdx = slotIdx >= 0 ? slotIdx : 0}
                            {@const capturedPhoto = boothFlow.photosTaken[targetIdx]}
                            <div class="w-full h-full bg-black/40 relative overflow-hidden">
                              {#if capturedPhoto}
                                <img
                                  src={capturedPhoto}
                                  alt={`Photo ${targetIdx + 1}`}
                                  class={`w-full h-full object-cover block ${f.style}`}
                                />
                              {/if}
                            </div>
                          {/if}
                        </div>
                      {/each}
                    {/if}
                  </div>
                {:else}
                  <div class="grid grid-cols-2 gap-2 flex-1 w-full h-full">
                    {#each boothFlow.photosTaken as photo, pIdx}
                      <div class={`border-2 border-black bg-gray-300 overflow-hidden ${f.style}`}>
                        <img src={photo} alt={`P ${pIdx+1}`} class="w-full h-full object-cover" />
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      {/each}

      <!-- Nav buttons -->
      <button
        onclick={() => handleSwipe('right')}
        class="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white border-4 border-black flex items-center justify-center hover:bg-gray-100 shadow-[6px_6px_0_0_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none z-20 cursor-pointer"
      >
        <ChevronLeft size={28} strokeWidth={3} />
      </button>
      <button
        onclick={() => handleSwipe('left')}
        class="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white border-4 border-black flex items-center justify-center hover:bg-gray-100 shadow-[6px_6px_0_0_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none z-20 cursor-pointer"
      >
        <ChevronRight size={28} strokeWidth={3} />
      </button>
    </div>

    <div class="flex items-center justify-between shrink-0 font-['Nunito',sans-serif]">
      <h3 class="text-lg font-bold tracking-widest uppercase font-['Playfair_Display',serif] m-0">{activeFilter.name}</h3>
      <button
        onclick={onNext}
        class="px-12 py-4 bg-[#f97316] text-white rounded-full text-lg font-bold tracking-widest uppercase shadow-[4px_4px_0_0_rgba(200,200,200,1)] hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all flex items-center gap-3 cursor-pointer border-none"
      >
        Print <ArrowRight size={20} strokeWidth={3} />
      </button>
    </div>
  </div>
</div>
