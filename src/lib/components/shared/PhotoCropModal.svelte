<script lang="ts" module>
  export type CropVariant = 'v1' | 'v2' | 'v3';
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { ZoomIn, ZoomOut, Maximize2, X } from '@lucide/svelte';
  import { boothFlow, type PhotoTransform } from '$lib/stores/booth.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { getLiveviewTransformStyle, getPhotoSlotTransformStyle } from '$lib/utils/shared';
  import { getLayerZIndex, findPhotoSlotIndex, type TemplateDesignLayer } from '$lib/utils/templateComposite';
  import type { BoothTemplate } from '$lib/api/boothClient';
  import { STICKER_EMOJI_PX, STICKER_IMAGE_PX, type Sticker } from '$lib/utils/stickers';

  interface Props {
    template: BoothTemplate;
    layers: TemplateDesignLayer[];
    photoSlots: TemplateDesignLayer[];
    photos: string[];
    bgUrl: string;
    stickers: Sticker[];
    variant: CropVariant;
    accent: string;
    filterClass?: string;
    filterCss?: string;
    onClose: () => void;
  }

  let {
    template,
    layers,
    photoSlots,
    photos,
    bgUrl,
    stickers,
    variant,
    accent,
    filterClass = '',
    filterCss = 'none',
    onClose
  }: Props = $props();

  // Zoom minimal 1 (cover) supaya hasil cetak tidak pernah punya area kosong di slot
  const MIN = 1;
  const MAX = 3;
  const STEP = 0.25;

  let tWidth = $derived(template.width || 1200);
  let tHeight = $derived(template.height || 1800);
  let liveviewTransform = $derived(getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode));

  let selected = $state(0);
  let selectedPhoto = $derived(photos[selected]);
  let zoom = $derived(boothFlow.getPhotoTransform(selectedPhoto).zoom);

  let drag: { src: string; sx: number; sy: number; ox: number; oy: number; w: number; h: number } | null = null;

  // Pergeseran maksimal (relatif ukuran slot) agar foto tetap menutup slot penuh
  const limit = (z: number) => Math.max(0, (z - 1) / 2);
  const clampPan = (v: number, z: number) => Math.min(limit(z), Math.max(-limit(z), v));

  function update(src: string | undefined, next: PhotoTransform) {
    if (!src) return;
    boothFlow.setPhotoTransform(src, {
      zoom: next.zoom,
      x: clampPan(next.x, next.zoom),
      y: clampPan(next.y, next.zoom)
    });
  }

  function zoomBy(delta: number) {
    const cur = boothFlow.getPhotoTransform(selectedPhoto);
    const z = Math.min(MAX, Math.max(MIN, Math.round((cur.zoom + delta) * 100) / 100));
    update(selectedPhoto, { ...cur, zoom: z });
  }

  function reset() {
    update(selectedPhoto, { x: 0, y: 0, zoom: 1 });
  }

  function slotIndexOf(layer: TemplateDesignLayer) {
    return findPhotoSlotIndex(layer, photoSlots);
  }

  function onPointerDown(e: PointerEvent, index: number) {
    e.stopPropagation();
    selected = index;
    const src = photos[index];
    if (!src) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const cur = boothFlow.getPhotoTransform(src);
    drag = { src, sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y, w: rect.width, h: rect.height };
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const cur = boothFlow.getPhotoTransform(drag.src);
    update(drag.src, {
      zoom: cur.zoom,
      x: drag.ox + (e.clientX - drag.sx) / drag.w,
      y: drag.oy + (e.clientY - drag.sy) / drag.h
    });
  }

  function onPointerUp() {
    drag = null;
  }

  function onWheel(e: WheelEvent) {
    zoomBy(e.deltaY < 0 ? STEP : -STEP);
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') zoomBy(STEP);
      if (e.key === '-') zoomBy(-STEP);
      if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  type Kind = 'default' | 'primary' | 'close';

  const SKINS = {
    v1: {
      font: "'Plus Jakarta Sans', sans-serif",
      overlay: 'background: rgba(10,9,16,0.62); backdrop-filter: blur(18px) saturate(120%);',
      btn: (kind: Kind) =>
        `background: ${kind === 'primary' ? accent : kind === 'close' ? '#111117' : 'rgba(255,255,255,0.96)'}; color: ${kind === 'default' ? '#111117' : '#fff'}; border-radius: 999px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); border: none;`,
      btnClass: 'hover:scale-105 active:scale-95 transition-transform',
      chip: 'background: rgba(255,255,255,0.96); color: #0f0e14; border-radius: 999px; box-shadow: 0 8px 32px rgba(0,0,0,0.45);',
      chipClass: 'px-4 py-2 font-bold text-sm',
      label: { in: 'Perbesar', out: 'Perkecil', reset: 'Reset', close: 'Tutup', hint: 'Pilih foto, lalu geser untuk mengatur posisi' }
    },
    v2: {
      font: "'Playfair Display', Georgia, serif",
      overlay: 'background: rgba(250,250,250,0.55); backdrop-filter: blur(14px);',
      btn: (kind: Kind) =>
        `background: ${kind === 'primary' ? accent : '#fff'}; color: ${kind === 'primary' ? '#fff' : '#000'}; border: 3px solid #000; border-radius: 999px; box-shadow: 4px 4px 0 0 #000;`,
      btnClass: 'hover:bg-gray-100 active:translate-x-1 active:translate-y-1 transition-all',
      chip: 'background: #fff; color: #000; border: 3px solid #000; border-radius: 999px; box-shadow: 4px 4px 0 0 #000;',
      chipClass: 'px-4 py-1.5 font-bold text-sm tracking-widest',
      label: { in: 'Enlarge', out: 'Shrink', reset: 'Reset', close: 'Tutup', hint: 'Pick a photo, then drag to reposition' }
    },
    v3: {
      font: 'Inter, system-ui, sans-serif',
      overlay: 'background: radial-gradient(circle at 50% 40%, rgba(205,28,51,0.16), rgba(10,10,15,0.82) 70%); backdrop-filter: blur(16px);',
      btn: (kind: Kind) =>
        `background: ${kind === 'primary' ? accent : kind === 'close' ? 'rgba(255,255,255,0.1)' : '#fdfdfd'}; color: ${kind === 'primary' || kind === 'close' ? '#fff' : accent}; border-radius: 14px; border: ${kind === 'close' ? '1px solid rgba(255,255,255,0.2)' : 'none'}; box-shadow: 0 8px 24px rgba(0,0,0,0.45);`,
      btnClass: 'hover:brightness-110 active:scale-95 transition-all',
      chip: 'background: rgba(0,0,0,0.4); color: #fff; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12);',
      chipClass: 'px-4 py-1.5 font-black text-xs tracking-[0.25em]',
      label: { in: 'Perbesar', out: 'Perkecil', reset: 'Reset', close: 'Tutup', hint: 'Pilih foto, lalu geser untuk mengatur posisi' }
    }
  };

  let skin = $derived(SKINS[variant]);
  const btnBase = 'w-14 h-14 flex items-center justify-center cursor-pointer';
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="fixed inset-0 z-[200] flex items-center justify-center select-none crop-fade"
  style="{skin.overlay} font-family: {skin.font};"
  onclick={onClose}
  role="dialog"
  aria-modal="true"
  aria-label="Crop Foto"
  tabindex="-1"
>
  <!-- Stage: strip besar -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="absolute flex items-center justify-center crop-pop"
    style="inset: 12% 10%;"
    onclick={(e) => e.stopPropagation()}
    onwheel={onWheel}
  >
    <div
      class="relative h-full max-w-full overflow-hidden rounded-xl bg-black/40 shadow-2xl"
      style="aspect-ratio: {tWidth} / {tHeight};"
    >
      {#each layers.filter((l) => !l.isQr) as layer, idx (layer.id ?? idx)}
        {@const box = `left: ${((layer.x || 0) / tWidth) * 100}%; top: ${((layer.y || 0) / tHeight) * 100}%; width: ${((layer.w || 200) / tWidth) * 100}%; height: ${((layer.h || 200) / tHeight) * 100}%; transform: rotate(${layer.rot || 0}deg);`}
        {#if layer.isBackground}
          {@const layerBgUrl = layer.imageUrl || bgUrl}
          {#if layerBgUrl}
            <img
              src={layerBgUrl}
              alt="Frame Overlay"
              class="absolute object-fill pointer-events-none block"
              style="{box} z-index: {getLayerZIndex(layer, layers)};"
            />
          {/if}
        {:else}
          {@const slotIdx = slotIndexOf(layer)}
          {@const photo = photos[slotIdx]}
          {@const isSel = slotIdx === selected}
          <div
            role="presentation"
            class="absolute overflow-hidden bg-black/40"
            style="{box} z-index: {getLayerZIndex(layer, layers)}; cursor: {isSel ? 'grab' : 'pointer'}; touch-action: none;"
            onpointerdown={(e) => onPointerDown(e, slotIdx)}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
            onpointercancel={onPointerUp}
          >
            {#if photo}
              <div class="w-full h-full {isSel ? '' : 'crop-wiggle'}" style="animation-delay: {-(slotIdx % 5) * 0.28}s;">
                <img
                  src={photo}
                  alt={`Foto ${slotIdx + 1}`}
                  draggable="false"
                  class="w-full h-full object-cover block pointer-events-none {filterClass}"
                  style="filter: {filterCss === 'none' ? 'none' : filterCss}; transform: {getPhotoSlotTransformStyle(boothFlow.getPhotoTransform(photo), liveviewTransform)}; will-change: transform;"
                />
              </div>
            {/if}
          </div>
        {/if}
      {/each}

      <!-- Penanda slot terpilih, di atas frame overlay -->
      {#each layers.filter((l) => !l.isBackground && !l.isQr) as layer, idx (layer.id ?? idx)}
        {@const isSel = slotIndexOf(layer) === selected}
        <div
          class="absolute pointer-events-none"
          style="
            left: {((layer.x || 0) / tWidth) * 100}%;
            top: {((layer.y || 0) / tHeight) * 100}%;
            width: {((layer.w || 200) / tWidth) * 100}%;
            height: {((layer.h || 200) / tHeight) * 100}%;
            transform: rotate({layer.rot || 0}deg);
            z-index: 900;
            box-shadow: {isSel ? `inset 0 0 0 4px ${accent}` : 'inset 0 0 0 1px rgba(0,0,0,0.18)'};
          "
        ></div>
      {/each}

      {#each stickers as s (s.id)}
        <div
          class="absolute pointer-events-none"
          style="left: {s.x}%; top: {s.y}%; transform: translate(-50%, -50%); font-size: {STICKER_EMOJI_PX}px; line-height: 1; z-index: 950; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));"
        >
          {#if s.type === 'image' && s.imageUrl}
            <img
              src={s.imageUrl}
              alt="Sticker"
              class="block"
              style="width: {s.width ? `${s.width}px` : `${STICKER_IMAGE_PX}px`}; height: {s.height ? `${s.height}px` : 'auto'};"
            />
          {:else}
            {s.emoji}
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Persentase zoom + petunjuk -->
  <div class="absolute top-9 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
    <span class="tabular-nums {skin.chipClass}" style={skin.chip}>{Math.round(zoom * 100)}%</span>
    <span class="text-xs font-semibold opacity-70" style="color: {variant === 'v2' ? '#000' : '#fff'};">{skin.label.hint}</span>
  </div>

  <!-- Kontrol di 4 pojok -->
  <button
    class="absolute top-6 left-6 {btnBase} {skin.btnClass}"
    style="{skin.btn('default')} opacity: {zoom <= MIN ? 0.4 : 1};"
    onclick={(e) => { e.stopPropagation(); zoomBy(-STEP); }}
    disabled={zoom <= MIN}
    aria-label={skin.label.out}
    title={skin.label.out}
  >
    <ZoomOut size={24} strokeWidth={2.4} />
  </button>
  <button
    class="absolute top-6 right-6 {btnBase} {skin.btnClass}"
    style="{skin.btn('primary')} opacity: {zoom >= MAX ? 0.4 : 1};"
    onclick={(e) => { e.stopPropagation(); zoomBy(STEP); }}
    disabled={zoom >= MAX}
    aria-label={skin.label.in}
    title={skin.label.in}
  >
    <ZoomIn size={24} strokeWidth={2.4} />
  </button>
  <button
    class="absolute bottom-6 left-6 {btnBase} {skin.btnClass}"
    style={skin.btn('default')}
    onclick={(e) => { e.stopPropagation(); reset(); }}
    aria-label={skin.label.reset}
    title={skin.label.reset}
  >
    <Maximize2 size={22} strokeWidth={2.4} />
  </button>
  <button
    class="absolute bottom-6 right-6 {btnBase} {skin.btnClass}"
    style={skin.btn('close')}
    onclick={(e) => { e.stopPropagation(); onClose(); }}
    aria-label={skin.label.close}
    title={skin.label.close}
  >
    <X size={24} strokeWidth={2.6} />
  </button>
</div>

<style>
  .crop-fade {
    animation: crop-in 0.2s ease-out;
  }
  .crop-pop {
    animation: crop-pop 0.25s ease-out;
  }
  .crop-wiggle {
    animation: crop-wiggle 1.4s ease-in-out infinite;
  }
  @keyframes crop-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes crop-pop {
    from { opacity: 0; transform: scale(0.94); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes crop-wiggle {
    0%, 100% { transform: translate(0, 0) rotate(0); }
    25% { transform: translate(-1.5px, 0.8px) rotate(-0.5deg); }
    50% { transform: translate(1.5px, -1px) rotate(0.5deg); }
    75% { transform: translate(-1px, -0.8px) rotate(-0.4deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .crop-wiggle { animation: none; }
  }
</style>
