<script lang="ts">
  import { onMount } from 'svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { FILTERS } from '$lib/utils/filters';
  import StickerPicker from '$lib/components/shared/StickerPicker.svelte';
  import StickerCanvas from '$lib/components/shared/StickerCanvas.svelte';
  import { fetchEmots, fetchTemplates, requireActiveBoothId, type BoothEmot, type BoothTemplate } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';
  import { Check, Sparkles } from '@lucide/svelte';
  import type { Sticker, StickerType } from '$lib/utils/stickers';

  import { uiConfig } from '$lib/stores/uiConfig.svelte';

  interface Props {
    selectedFrame?: string;
    onNext: () => void;
    onBack: () => void;
    background?: string;
  }

  let { selectedFrame = '', onNext, onBack, background }: Props = $props();

  let selectedFilter = $state('none');
  let emotsData = $state<BoothEmot[]>([]);
  let selectedTemplate = $state<BoothTemplate | null>(null);
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

  let currentFilterCss = $derived(FILTERS.find((f) => f.id === selectedFilter)?.css ?? 'none');

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
      console.error('[V3Filter] Failed to fetch catalog or emots:', err);
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

  const V3_FILTERS_LIST = [
    { id: 'none', name: 'Original', swatch: 'bg-gradient-to-br from-gray-100 to-gray-200', desc: 'Warna asli, tanpa edit' },
    { id: 'bw', name: 'B&W', swatch: 'bg-gradient-to-br from-gray-400 to-gray-700', desc: 'Hitam putih elegan' },
    { id: 'noir', name: 'Noir', swatch: 'bg-gradient-to-br from-gray-800 to-black', desc: 'Gelap dramatis' },
    { id: 'warm', name: 'Vintage', swatch: 'bg-gradient-to-br from-amber-200 to-orange-300', desc: 'Hangat retro' },
    { id: 'vivid', name: 'Vivid', swatch: 'bg-gradient-to-br from-sky-200 to-blue-400', desc: 'Cerah mencolok' }
  ];

  const VISIBLE_STEPS = ['Package', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter'];
  const activeStepIdx = 4;
  const DEFAULT_BG = '#fdfdfd';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('filter').background ?? DEFAULT_BG);
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
        Pilih Filter &amp; Stiker
      </h1>
      <p class="text-white/50 text-[8px] uppercase tracking-[0.3em] mt-1 m-0">Double-klik stiker untuk hapus</p>
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
    <!-- Left preview panel with sticker canvas -->
    <div
      class="w-[42%] h-full bg-[#0E8E5E] flex flex-col items-center justify-center gap-5 p-10 relative overflow-hidden z-10 shrink-0"
      style="background-image: repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.07) 40px, rgba(0,0,0,0.07) 80px);"
    >
      <div class="absolute top-4 left-4 text-white/10 text-[80px] font-black font-['Playfair_Display',serif] leading-none pointer-events-none">✦</div>
      <div class="absolute bottom-4 right-4 text-white/10 text-[80px] font-black font-['Playfair_Display',serif] leading-none pointer-events-none">★</div>

      <p class="text-white/60 text-[9px] font-bold uppercase tracking-[0.3em] relative z-10 m-0">Preview</p>

      <StickerCanvas
        {stickers}
        onMove={moveSticker}
        onRemove={removeSticker}
        class="relative z-10 flex-1 max-h-[60vh] w-full flex items-center justify-center"
        containerStyle="width: 240px; position: relative;"
      >
        {#if selectedTemplate}
          {@const tWidth = selectedTemplate.width || 1200}
          {@const tHeight = selectedTemplate.height || 1800}
          <div
            class="relative h-full max-w-full overflow-hidden rounded-xl bg-black/40 shadow-2xl border-2 border-gray-200"
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
                          class="w-full h-full object-cover block"
                          style="filter: {currentFilterCss === 'none' ? 'none' : currentFilterCss};"
                        />
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        {:else}
          <div class="bg-[#fdfdfd] w-[230px] flex items-center justify-center py-6 px-3 shadow-2xl rounded-2xl">
            <div class="flex flex-col gap-1.5 w-full">
              {#each boothFlow.photosTaken as photo, i}
                <div class="w-full aspect-[4/3] rounded-lg overflow-hidden border border-gray-200">
                  <img
                    src={photo}
                    alt={`Photo ${i + 1}`}
                    class="w-full h-full object-cover"
                    style="filter: {currentFilterCss === 'none' ? 'none' : currentFilterCss};"
                  />
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </StickerCanvas>

      <div class="flex items-center gap-2 bg-black/20 rounded-full px-4 py-1.5 relative z-10">
        <div class="w-2 h-2 rounded-full bg-[#FFC107]"></div>
        <span class="text-white/80 text-[10px] font-bold tracking-widest uppercase">
          {V3_FILTERS_LIST.find((f) => f.id === selectedFilter)?.name || 'Original'}
        </span>
      </div>
    </div>

    <!-- Right: emoji picker + filter selection -->
    <div class="flex-1 bg-[#fdfdfd] flex flex-col px-10 py-8 gap-4 relative overflow-hidden">
      <StickerPicker onPick={addSticker} emots={emotsData} />

      <div class="h-px bg-gray-100"></div>

      <p class="text-[9px] font-bold text-gray-400 uppercase tracking-[0.3em] m-0">Pilih tampilan foto</p>

      <div class="flex flex-col gap-2 flex-1 overflow-y-auto" style="scrollbar-width: none;">
        {#each V3_FILTERS_LIST as f}
          {@const active = selectedFilter === f.id}
          <button
            onclick={() => {
              selectedFilter = f.id;
              boothFlow.selectedFilterId = f.id;
            }}
            class={`flex items-center gap-4 p-3 rounded-xl border-2 transition-all text-left border-none cursor-pointer ${
              active
                ? 'border-[#CD1C33] bg-[#fff5f5] shadow-md border-solid'
                : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
            }`}
            style={active ? 'border: 2px solid #CD1C33;' : 'border: 1px solid #f3f4f6;'}
          >
            <div class={`w-12 h-8 rounded-lg shrink-0 ${f.swatch}`}></div>
            <div class="flex-1 min-w-0">
              <div class={`font-black text-sm ${active ? 'text-[#CD1C33]' : 'text-gray-800'}`}>{f.name}</div>
              <div class="text-[10px] text-gray-400 truncate">{f.desc}</div>
            </div>
            {#if active}
              <div class="w-5 h-5 rounded-full bg-[#CD1C33] flex items-center justify-center shrink-0">
                <Check size={10} class="text-white" strokeWidth={3} />
              </div>
            {/if}
          </button>
        {/each}
      </div>

      <button
        onclick={onNext}
        class="w-full py-4 bg-[#CD1C33] text-white rounded-xl font-black tracking-widest uppercase hover:bg-[#A31327] transition-colors shadow-lg text-sm flex items-center justify-center gap-2 shrink-0 border-none cursor-pointer"
      >
        <Sparkles size={16} /> Proses Foto Sekarang
      </button>
    </div>
  </div>
</div>
