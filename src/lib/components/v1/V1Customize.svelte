<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { FILTERS } from '$lib/utils/filters';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import StickerPicker from '$lib/components/shared/StickerPicker.svelte';
  import StickerCanvas from '$lib/components/shared/StickerCanvas.svelte';
  import type { Sticker, StickerType } from '$lib/utils/stickers';
  import { formatTime } from '$lib/utils/shared';
  import { fetchTemplates, fetchEmots, requireActiveBoothId, type BoothTemplate, type BoothEmot } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';

  interface Props {
    photos: string[];
    frameConfigId?: string;
    onBack: () => void;
    onNext: () => void;
    background?: string;
  }

  let { photos, frameConfigId = '', onBack, onNext, background }: Props = $props();

  let selectedTemplate = $state<BoothTemplate | null>(null);
  let emotsData = $state<BoothEmot[]>([]);
  let photoSlots = $derived(
    selectedTemplate?.design_data
      ?.filter((l) => !l.isBackground && !l.isQr)
      ?.slice()
      ?.sort((a, b) => {
        const orderA = typeof a.order === 'number' ? a.order : typeof a.id === 'number' ? a.id : 0;
        const orderB = typeof b.order === 'number' ? b.order : typeof b.id === 'number' ? b.id : 0;
        return orderA - orderB;
      }) ?? []
  );
  let bgLayer = $derived(selectedTemplate?.design_data?.find((l) => l.isBackground));
  let bgUrl = $derived(bgLayer?.imageUrl || selectedTemplate?.frame_image_url || '');

  let stickers = $state<Sticker[]>(boothFlow.stickers);
  let stickerCounter = $state(0);
  let secs = $state(5 * 60);
  let timer: any = null;

  onMount(async () => {
    try {
      const boothId = await requireActiveBoothId();
      // Render instan dari cache SQLite bila ada, refresh di latar belakang
      await cachedFetch(
        `templates:${boothId}`,
        () => fetchTemplates(boothId),
        (templates) => {
          const matched = templates.find((t) => t.id === frameConfigId);
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
      console.error('[V1Customize] Failed to load catalog or emots in customize:', err);
    }

    timer = setInterval(() => {
      if (secs > 0) secs--;
      else {
        clearInterval(timer);
        onBack();
      }
    }, 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
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

  let currentFilterCss = $derived(
    FILTERS.find((f) => f.id === boothFlow.selectedFilterId)?.css ?? ''
  );
  let thumbSrc = $derived(
    photos[0] || 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=400&fit=crop&auto=format'
  );
  const DEFAULT_BG = 'linear-gradient(135deg, #1e1b4b 0%, #2a2873 50%, #312e81 100%)';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('filter').background ?? DEFAULT_BG);
</script>

<div
  class="w-full h-full overflow-hidden relative flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif]"
  style:background={effectiveBg}
>
  <!-- Watermark -->
  <!-- <div class="absolute inset-0 overflow-hidden flex items-center justify-center pointer-events-none select-none z-0">
    <span class="text-[clamp(180px,22vw,380px)] font-black text-white/[0.028] tracking-[-0.04em] leading-none whitespace-nowrap">
      {uiConfig.config.boothName}
    </span>
  </div> -->

  <div class="relative z-10 flex flex-row items-center gap-[clamp(32px,3.5vw,64px)] px-[clamp(32px,4vw,72px)] py-8 w-full h-full box-border justify-center">
    <!-- Filter grid card -->
    <div class="flex-[0_0_63%] h-full bg-white rounded-3xl p-8 pb-7 flex flex-col gap-6 shadow-[0_40px_100px_rgba(0,0,0,0.7)] overflow-hidden">
      <div class="shrink-0">
        <h2 class="m-0 text-[28px] font-extrabold text-[#111117] tracking-[-0.02em]">Tambahkan Filter</h2>
        <p class="m-0 mt-2 text-[15px] text-[#999]">Buat fotomu lebih sempurna</p>
      </div>

      <div class="flex-1 min-h-0 grid grid-cols-4 grid-rows-2 gap-4">
        {#each FILTERS as f}
          {@const selected = boothFlow.selectedFilterId === f.id}
          <div class="flex flex-col gap-2 min-h-0">
            <button
              onclick={() => (boothFlow.selectedFilterId = f.id)}
              class="flex-1 min-h-0 border-none cursor-pointer p-0 rounded-2xl overflow-hidden relative bg-transparent block transition-all duration-150 active:scale-95"
              style="
                outline: {selected ? `3px solid ${uiConfig.config.primaryColor}` : 'none'};
              "
            >
              <img
                src={thumbSrc}
                alt={f.label}
                class="w-full h-full object-cover block"
                style="filter: {f.css === 'none' ? 'none' : f.css};"
              />
              {#if selected}
                <div class="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-md">
                  <svg width="14" height="14" fill="none" stroke={uiConfig.config.primaryColor} stroke-width="2.5" viewBox="0 0 24 24">
                    <path d="M4.5 12.75l6 6 9-13.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </div>
              {/if}
            </button>
            <span class={`text-center text-xs ${selected ? 'font-bold text-[#111]' : 'text-gray-500'}`}>
              {f.label}
            </span>
          </div>
        {/each}
      </div>

      <div class="shrink-0 border-t border-gray-100 pt-4">
        <StickerPicker onPick={addSticker} emots={emotsData} />
      </div>

      <button
        onclick={onBack}
        class="shrink-0 self-start flex items-center gap-1.5 bg-transparent border-none text-[#bbb] text-[13px] font-medium cursor-pointer p-0 hover:text-[#888]"
      >
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path d="M15.75 19.5L8.25 12l7.5-7.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Ambil Ulang
      </button>
    </div>

    <!-- Film strip preview card -->
    <div class="flex-[0_0_25%] h-full flex flex-col items-stretch gap-3.5">
      <div class="self-center shrink-0 flex items-center gap-2 bg-white/95 text-[#0f0e14] px-6 py-3 rounded-full font-bold text-[17px] shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
        <svg width="15" height="15" fill="none" stroke={uiConfig.config.primaryColor} stroke-width="2.5" viewBox="0 0 24 24">
          <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="tabular-nums">{formatTime(secs)}</span>
      </div>

      <div class="flex-1 min-h-0 bg-white rounded-[22px] p-5 pb-[18px] flex flex-col gap-3.5 shadow-[0_40px_100px_rgba(0,0,0,0.7)] overflow-hidden">
        <div class="shrink-0 flex items-center justify-between">
          <span class="text-sm font-black text-[#111]">{selectedTemplate?.name || uiConfig.config.boothName}</span>
          <span class="text-[10px] font-semibold text-[#ccc] uppercase">Preview</span>
        </div>

        <StickerCanvas
          {stickers}
          onMove={moveSticker}
          onRemove={removeSticker}
          class="flex-1 min-h-0 rounded-xl overflow-hidden"
        >
          <div class="w-full h-full bg-[#141412] rounded-xl flex items-center justify-center p-2 relative overflow-hidden">
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
                      {:else}
                        {@const slotIdx = photoSlots.findIndex((s) => s === layer)}
                        {@const capturedPhoto = photos[slotIdx]}
                        <div class="w-full h-full bg-black/40 relative">
                          {#if capturedPhoto}
                            <img
                              src={capturedPhoto}
                              alt={`Photo ${slotIdx + 1}`}
                              class="w-full h-full object-cover block"
                              style="filter: {currentFilterCss === 'none' ? 'none' : currentFilterCss};"
                            />
                          {:else}
                            <div class="w-full h-full flex items-center justify-center text-white/40 text-[9px]">
                              {slotIdx + 1}
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
        </StickerCanvas>

        <button
          onclick={onNext}
          class="shrink-0 flex items-center justify-center gap-2 bg-[#111117] text-white border-none rounded-full px-6 py-4 font-bold text-base cursor-pointer hover:bg-[#2a2838] transition-all"
        >
          Selesai
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path d="M8.25 4.5l7.5 7.5-7.5 7.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</div>
