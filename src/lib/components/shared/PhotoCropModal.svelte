<script lang="ts" module>
  export type CropVariant = 'v1' | 'v2' | 'v3';
</script>

<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { ZoomIn, ZoomOut, Maximize2, X, ArrowLeftRight } from '@lucide/svelte';
  import { boothFlow, type PhotoTransform } from '$lib/stores/booth.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { getLiveviewTransformStyle, getPhotoSlotTransformStyle } from '$lib/utils/shared';
  import {
    getLayerZIndex,
    findPhotoSlotIndex,
    getTemplatePreviewBoxStyle,
    type TemplateDesignLayer,
  } from '$lib/utils/templateComposite';
  import type { BoothTemplate } from '$lib/api/boothClient';
  import { STICKER_EMOJI_PX, STICKER_IMAGE_PX, type Sticker } from '$lib/utils/stickers';
  import type { CropDialogConfig, CropDialogControlsLayout } from '@potohub/booth-ui';

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
    onSwapSlots?: (indexA: number, indexB: number) => void;
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
    onSwapSlots,
    onClose,
  }: Props = $props();

  // Zoom minimal 1 (cover) supaya hasil cetak tidak pernah punya area kosong di slot
  const MIN = 1;
  const MAX = 3;
  const STEP = 0.25;
  const LONG_PRESS_MS = 320;
  const LONG_PRESS_MOVE_THRESHOLD = 10;

  let cropCfg = $derived<CropDialogConfig | undefined>(
    uiConfig.resolvedDesignBlocks?.screens?.filter?.cropDialog,
  );
  let controlsLayout = $derived<CropDialogControlsLayout>(cropCfg?.controlsLayout ?? 'corners');
  let enableSlotSwap = $derived(cropCfg?.enableSlotSwap !== false);
  let showZoomChip = $derived(cropCfg?.showZoomChip !== false);
  let showHint = $derived(cropCfg?.showHint !== false);

  let tWidth = $derived(template.width || 1200);
  let tHeight = $derived(template.height || 1800);
  let liveviewTransform = $derived(getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode));

  let selected = $state(0);
  let selectedPhoto = $derived(photos[selected]);
  let zoom = $derived(boothFlow.getPhotoTransform(selectedPhoto).zoom);

  // Pan state
  let drag: {
    pointerId: number;
    src: string;
    slotIdx: number;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    w: number;
    h: number;
  } | null = null;

  // 2-finger pinch state
  const activePointers = new Map<number, { x: number; y: number }>();
  let pinch: { startDist: number; startZoom: number; src: string } | null = null;

  // Long-press drag-to-swap state
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let swapDrag = $state<{
    pointerId: number;
    srcIndex: number;
    photo: string;
    curX: number;
    curY: number;
    w: number;
    h: number;
    targetIndex: number | null;
  } | null>(null);
  let recentlySwapped = $state<number[]>([]);
  let swapAnimTimer: ReturnType<typeof setTimeout> | null = null;
  let stageEl: HTMLDivElement | null = null;

  function clearLongPressTimer() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  onDestroy(() => {
    clearLongPressTimer();
    if (swapAnimTimer) clearTimeout(swapAnimTimer);
  });

  // Pergeseran maksimal (relatif ukuran slot) agar foto tetap menutup slot penuh
  const limit = (z: number) => Math.max(0, (z - 1) / 2);
  const clampPan = (v: number, z: number) => Math.min(limit(z), Math.max(-limit(z), v));

  function update(src: string | undefined, next: PhotoTransform) {
    if (!src) return;
    boothFlow.setPhotoTransform(src, {
      zoom: next.zoom,
      x: clampPan(next.x, next.zoom),
      y: clampPan(next.y, next.zoom),
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

  function findSlotIndexAtPoint(clientX: number, clientY: number, excludeIndex: number): number | null {
    if (!stageEl) return null;
    const nodes = stageEl.querySelectorAll<HTMLElement>('[data-crop-slot-index]');
    for (const node of nodes) {
      const idx = Number(node.dataset.cropSlotIndex);
      if (!Number.isFinite(idx) || idx === excludeIndex || idx < 0 || idx >= photoSlots.length) continue;
      const rect = node.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return idx;
      }
    }
    return null;
  }

  function onPointerDown(e: PointerEvent, index: number) {
    e.stopPropagation();
    selected = index;
    const src = photos[index];
    if (!src) return;

    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Jika 2 jari aktif -> masuk mode pinch-to-zoom dan batalkan long-press swap
    if (activePointers.size === 2) {
      clearLongPressTimer();
      drag = null;
      swapDrag = null;
      const pts = Array.from(activePointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const cur = boothFlow.getPhotoTransform(src);
      pinch = { startDist: Math.max(10, dist), startZoom: cur.zoom, src };
      return;
    }

    const rect = el.getBoundingClientRect();
    const cur = boothFlow.getPhotoTransform(src);
    drag = {
      pointerId: e.pointerId,
      src,
      slotIdx: index,
      sx: e.clientX,
      sy: e.clientY,
      ox: cur.x,
      oy: cur.y,
      w: Math.max(1, rect.width),
      h: Math.max(1, rect.height),
    };

    // Long-press swap trigger (jika diaktifkan dan ada > 1 slot foto)
    clearLongPressTimer();
    if (enableSlotSwap && photoSlots.length > 1 && photos.length > 1) {
      const startX = e.clientX;
      const startY = e.clientY;
      const pointerId = e.pointerId;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (!drag || drag.pointerId !== pointerId || activePointers.size > 1) return;
        drag = null;
        swapDrag = {
          pointerId,
          srcIndex: index,
          photo: src,
          curX: startX,
          curY: startY,
          w: Math.min(220, Math.max(96, rect.width)),
          h: Math.min(220, Math.max(96, rect.height)),
          targetIndex: null,
        };
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch-to-zoom
    if (pinch && activePointers.size >= 2) {
      const pts = Array.from(activePointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = dist / pinch.startDist;
      const nextZoom = Math.min(MAX, Math.max(MIN, Math.round(pinch.startZoom * ratio * 100) / 100));
      const cur = boothFlow.getPhotoTransform(pinch.src);
      update(pinch.src, { ...cur, zoom: nextZoom });
      return;
    }

    // Long-press swap drag
    if (swapDrag && swapDrag.pointerId === e.pointerId) {
      const targetIndex = findSlotIndexAtPoint(e.clientX, e.clientY, swapDrag.srcIndex);
      swapDrag = {
        ...swapDrag,
        curX: e.clientX,
        curY: e.clientY,
        targetIndex,
      };
      return;
    }

    if (!drag || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_THRESHOLD) {
      clearLongPressTimer();
    }

    const cur = boothFlow.getPhotoTransform(drag.src);
    update(drag.src, {
      zoom: cur.zoom,
      x: drag.ox + dx / drag.w,
      y: drag.oy + dy / drag.h,
    });
  }

  function onPointerUp(e: PointerEvent) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
      pinch = null;
    }
    clearLongPressTimer();

    if (swapDrag && swapDrag.pointerId === e.pointerId) {
      const { srcIndex, targetIndex } = swapDrag;
      swapDrag = null;
      if (targetIndex !== null && targetIndex !== srcIndex) {
        boothFlow.swapPhotoSlots(srcIndex, targetIndex);
        onSwapSlots?.(srcIndex, targetIndex);
        selected = targetIndex;
        recentlySwapped = [srcIndex, targetIndex];
        if (swapAnimTimer) clearTimeout(swapAnimTimer);
        swapAnimTimer = setTimeout(() => {
          recentlySwapped = [];
        }, 420);
      }
      return;
    }

    if (drag && drag.pointerId === e.pointerId) {
      drag = null;
    }
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
      btnBg: (kind: Kind) => (kind === 'primary' ? accent : kind === 'close' ? '#111117' : 'rgba(255,255,255,0.96)'),
      btnText: (kind: Kind) => (kind === 'default' ? '#111117' : '#ffffff'),
      btnBorder: (_kind: Kind) => 'none',
      btnRadius: 999,
      btnShadow: '0 8px 24px rgba(0,0,0,0.4)',
      btnClass: 'hover:scale-105 active:scale-95 transition-transform',
      chipBg: 'rgba(255,255,255,0.96)',
      chipText: '#0f0e14',
      chipExtra: 'border-radius: 999px; box-shadow: 0 8px 32px rgba(0,0,0,0.45);',
      chipClass: 'px-4 py-2 font-bold text-sm',
      hintColor: '#ffffff',
      label: {
        in: 'Perbesar',
        out: 'Perkecil',
        reset: 'Reset',
        close: 'Tutup',
        hint: 'Geser & pinch untuk crop · Tahan foto untuk tukar posisi',
        hintNoSwap: 'Pilih foto, lalu geser atau pinch untuk mengatur posisi',
      },
    },
    v2: {
      font: "'Playfair Display', Georgia, serif",
      overlay: 'background: rgba(250,250,250,0.55); backdrop-filter: blur(14px);',
      btnBg: (kind: Kind) => (kind === 'primary' ? accent : '#ffffff'),
      btnText: (kind: Kind) => (kind === 'primary' ? '#ffffff' : '#000000'),
      btnBorder: (_kind: Kind) => '3px solid #000000',
      btnRadius: 999,
      btnShadow: '4px 4px 0 0 #000000',
      btnClass: 'hover:bg-gray-100 active:translate-x-1 active:translate-y-1 transition-all',
      chipBg: '#ffffff',
      chipText: '#000000',
      chipExtra: 'border: 3px solid #000; border-radius: 999px; box-shadow: 4px 4px 0 0 #000;',
      chipClass: 'px-4 py-1.5 font-bold text-sm tracking-widest',
      hintColor: '#000000',
      label: {
        in: 'Enlarge',
        out: 'Shrink',
        reset: 'Reset',
        close: 'Tutup',
        hint: 'Drag & pinch to crop · Hold photo to swap slots',
        hintNoSwap: 'Pick a photo, then drag or pinch to reposition',
      },
    },
    v3: {
      font: 'Inter, system-ui, sans-serif',
      overlay: 'background: radial-gradient(circle at 50% 40%, rgba(205,28,51,0.16), rgba(10,10,15,0.82) 70%); backdrop-filter: blur(16px);',
      btnBg: (kind: Kind) => (kind === 'primary' ? accent : kind === 'close' ? 'rgba(255,255,255,0.1)' : '#fdfdfd'),
      btnText: (kind: Kind) => (kind === 'primary' || kind === 'close' ? '#ffffff' : accent),
      btnBorder: (kind: Kind) => (kind === 'close' ? '1px solid rgba(255,255,255,0.2)' : 'none'),
      btnRadius: 14,
      btnShadow: '0 8px 24px rgba(0,0,0,0.45)',
      btnClass: 'hover:brightness-110 active:scale-95 transition-all',
      chipBg: 'rgba(0,0,0,0.4)',
      chipText: '#ffffff',
      chipExtra: 'border-radius: 999px; border: 1px solid rgba(255,255,255,0.12);',
      chipClass: 'px-4 py-1.5 font-black text-xs tracking-[0.25em]',
      hintColor: '#ffffff',
      label: {
        in: 'Perbesar',
        out: 'Perkecil',
        reset: 'Reset',
        close: 'Tutup',
        hint: 'Geser & pinch untuk crop · Tahan foto untuk tukar posisi',
        hintNoSwap: 'Pilih foto, lalu geser atau pinch untuk mengatur posisi',
      },
    },
  };

  let skin = $derived(SKINS[variant]);
  let slotAccent = $derived(cropCfg?.accentColor || accent);
  const btnPx = 56;
  const iconPx = 24;

  let overlayStyle = $derived(
    cropCfg?.backdropColor
      ? `background: ${cropCfg.backdropColor}; backdrop-filter: blur(16px);`
      : skin.overlay,
  );

  function resolvedBtnStyle(kind: Kind, disabled = false): string {
    const bg =
      kind === 'primary'
        ? cropCfg?.primaryButtonBg || skin.btnBg('primary')
        : kind === 'close'
          ? cropCfg?.closeButtonBg || skin.btnBg('close')
          : cropCfg?.buttonBg || skin.btnBg('default');
    const color =
      kind === 'primary'
        ? cropCfg?.primaryButtonTextColor || skin.btnText('primary')
        : kind === 'close'
          ? cropCfg?.closeButtonTextColor || skin.btnText('close')
          : cropCfg?.buttonTextColor || skin.btnText('default');
    const radius = typeof cropCfg?.buttonRadius === 'number' ? cropCfg.buttonRadius : skin.btnRadius;
    const shadow = cropCfg?.buttonShadow || skin.btnShadow;
    const border =
      typeof cropCfg?.buttonBorderWidth === 'number'
        ? cropCfg.buttonBorderWidth > 0
          ? `${cropCfg.buttonBorderWidth}px solid ${cropCfg.buttonBorderColor || '#000000'}`
          : 'none'
        : skin.btnBorder(kind);

    return [
      `width: ${btnPx}px`,
      `height: ${btnPx}px`,
      `background: ${bg}`,
      `color: ${color}`,
      `border: ${border}`,
      `border-radius: ${radius}px`,
      `box-shadow: ${shadow}`,
      `opacity: ${disabled ? 0.4 : 1}`,
    ].join('; ');
  }

  let resolvedChipStyle = $derived(
    `background: ${cropCfg?.chipBg || skin.chipBg}; color: ${cropCfg?.chipTextColor || skin.chipText}; ${skin.chipExtra}`,
  );

  let resolvedHint = $derived.by(() => {
    const baseHint = cropCfg?.hintText?.trim() || (enableSlotSwap ? skin.label.hint : skin.label.hintNoSwap);
    if (enableSlotSwap && cropCfg?.swapHintText?.trim()) {
      return cropCfg?.hintText?.trim()
        ? `${cropCfg.hintText.trim()} · ${cropCfg.swapHintText.trim()}`
        : cropCfg.swapHintText.trim();
    }
    return baseHint;
  });

  // Keep frame dead-center while giving docks/rails breathing room
  let stageInset = $derived.by(() => {
    switch (controlsLayout) {
      case 'bottom_dock':
        return '13% 8% 15% 8%';
      case 'top_dock':
        return '16% 8% 11% 8%';
      case 'left_rail':
      case 'right_rail':
      case 'split_sides':
        return '12% 13%';
      default:
        return '12% 10%';
    }
  });
</script>

{#snippet zoomOutBtn(extraClass = '')}
  <button
    type="button"
    class="flex items-center justify-center cursor-pointer {skin.btnClass} {extraClass}"
    style={resolvedBtnStyle('default', zoom <= MIN)}
    onclick={(e) => {
      e.stopPropagation();
      zoomBy(-STEP);
    }}
    disabled={zoom <= MIN}
    aria-label={skin.label.out}
    title={skin.label.out}
  >
    <ZoomOut size={iconPx} strokeWidth={2.4} />
  </button>
{/snippet}

{#snippet zoomInBtn(extraClass = '')}
  <button
    type="button"
    class="flex items-center justify-center cursor-pointer {skin.btnClass} {extraClass}"
    style={resolvedBtnStyle('primary', zoom >= MAX)}
    onclick={(e) => {
      e.stopPropagation();
      zoomBy(STEP);
    }}
    disabled={zoom >= MAX}
    aria-label={skin.label.in}
    title={skin.label.in}
  >
    <ZoomIn size={iconPx} strokeWidth={2.4} />
  </button>
{/snippet}

{#snippet resetBtn(extraClass = '')}
  <button
    type="button"
    class="flex items-center justify-center cursor-pointer {skin.btnClass} {extraClass}"
    style={resolvedBtnStyle('default')}
    onclick={(e) => {
      e.stopPropagation();
      reset();
    }}
    aria-label={skin.label.reset}
    title={skin.label.reset}
  >
    <Maximize2 size={Math.max(16, iconPx - 2)} strokeWidth={2.4} />
  </button>
{/snippet}

{#snippet closeBtn(extraClass = '')}
  <button
    type="button"
    class="flex items-center justify-center cursor-pointer {skin.btnClass} {extraClass}"
    style={resolvedBtnStyle('close')}
    onclick={(e) => {
      e.stopPropagation();
      onClose();
    }}
    aria-label={skin.label.close}
    title={skin.label.close}
  >
    <X size={iconPx} strokeWidth={2.6} />
  </button>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="fixed inset-0 z-[200] flex items-center justify-center select-none crop-fade"
  style="{overlayStyle} font-family: {skin.font};"
  onclick={onClose}
  role="dialog"
  aria-modal="true"
  aria-label="Crop Foto"
  tabindex="-1"
>
  <!-- Stage: frame selalu di tengah -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={stageEl}
    class="absolute flex items-center justify-center crop-pop"
    style="inset: {stageInset}; container-type: size;"
    onclick={(e) => e.stopPropagation()}
    onwheel={onWheel}
  >
    <div
      class="relative overflow-hidden rounded-xl bg-black/40 shadow-2xl"
      style={getTemplatePreviewBoxStyle(tWidth, tHeight)}
    >
      {#each layers.filter((l) => !l.isQr) as layer, idx (layer.id ?? idx)}
        {@const box = `left: ${((layer.x || 0) / tWidth) * 100}%; top: ${((layer.y || 0) / tHeight) * 100}%; width: ${((layer.w || 200) / tWidth) * 100}%; height: ${((layer.h || 200) / tHeight) * 100}%; transform: rotate(${layer.rot || 0}deg);`}
        {#if layer.isBackground}
          {@const layerBgUrl = uiConfig.resolveAssetUrl(layer.imageUrl || bgUrl)}
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
          {@const isLiftedSource = swapDrag?.srcIndex === slotIdx}
          {@const isJustSwapped = recentlySwapped.includes(slotIdx)}
          <div
            role="presentation"
            data-crop-slot-index={slotIdx}
            class="absolute overflow-hidden bg-black/40 transition-opacity duration-150 {isJustSwapped ? 'crop-slot-swap-pop' : ''}"
            style="{box} z-index: {getLayerZIndex(layer, layers)}; cursor: {swapDrag ? 'grabbing' : isSel ? 'grab' : 'pointer'}; touch-action: none; opacity: {isLiftedSource ? 0.28 : 1};"
            onpointerdown={(e) => onPointerDown(e, slotIdx)}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
            onpointercancel={onPointerUp}
          >
            {#if photo}
              <div class="w-full h-full {isSel || swapDrag ? '' : 'crop-wiggle'}" style="animation-delay: {-(slotIdx % 5) * 0.28}s;">
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

      <!-- Penanda slot terpilih & target swap, di atas frame overlay -->
      {#each layers.filter((l) => !l.isBackground && !l.isQr) as layer, idx (layer.id ?? idx)}
        {@const slotIdx = slotIndexOf(layer)}
        {@const isSel = slotIdx === selected}
        {@const isSwapSource = swapDrag?.srcIndex === slotIdx}
        {@const isSwapTarget = swapDrag?.targetIndex === slotIdx}
        {@const isValidDropSlot = Boolean(swapDrag && swapDrag.srcIndex !== slotIdx)}
        <div
          class="absolute pointer-events-none transition-all duration-150 flex items-center justify-center"
          style="
            left: {((layer.x || 0) / tWidth) * 100}%;
            top: {((layer.y || 0) / tHeight) * 100}%;
            width: {((layer.w || 200) / tWidth) * 100}%;
            height: {((layer.h || 200) / tHeight) * 100}%;
            transform: rotate({layer.rot || 0}deg);
            z-index: 900;
            box-shadow: {isSwapTarget
              ? `inset 0 0 0 5px #22c55e, 0 0 24px rgba(34,197,94,0.55)`
              : isSwapSource
                ? `inset 0 0 0 3px rgba(255,255,255,0.5)`
                : isValidDropSlot
                  ? `inset 0 0 0 2px rgba(255,255,255,0.65)`
                  : isSel
                    ? `inset 0 0 0 4px ${slotAccent}`
                    : 'inset 0 0 0 1px rgba(0,0,0,0.18)'};
            background: {isSwapTarget ? 'rgba(34,197,94,0.18)' : 'transparent'};
          "
        >
          {#if isSwapTarget}
            <span class="px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-extrabold tracking-wide shadow-lg flex items-center gap-1.5">
              <ArrowLeftRight size={13} /> Tukar
            </span>
          {/if}
        </div>
      {/each}

      {#each stickers as s (s.id)}
        <div
          class="absolute pointer-events-none"
          style="left: {s.x}%; top: {s.y}%; transform: translate(-50%, -50%); font-size: {STICKER_EMOJI_PX}px; line-height: 1; z-index: 950; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));"
        >
          {#if s.type === 'image' && s.imageUrl}
            <img
              src={uiConfig.resolveAssetUrl(s.imageUrl)}
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

  <!-- Floating lifted photo card saat long-press swap -->
  {#if swapDrag}
    <div
      class="fixed pointer-events-none z-[260] rounded-xl overflow-hidden crop-lifted-card"
      style="
        left: {swapDrag.curX}px;
        top: {swapDrag.curY}px;
        width: {swapDrag.w}px;
        height: {swapDrag.h}px;
        border: 3px solid {swapDrag.targetIndex !== null ? '#22c55e' : slotAccent};
        box-shadow: 0 26px 56px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.25);
      "
    >
      <img
        src={swapDrag.photo}
        alt="Memindahkan foto"
        class="w-full h-full object-cover block {filterClass}"
        style="filter: {filterCss === 'none' ? 'none' : filterCss};"
      />
      <div class="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-black/75 text-white text-[11px] font-bold whitespace-nowrap flex items-center gap-1">
        <ArrowLeftRight size={11} />
        {swapDrag.targetIndex !== null ? `Tukar ke Slot ${swapDrag.targetIndex + 1}` : 'Geser ke slot lain'}
      </div>
    </div>
  {/if}

  <!-- Persentase zoom + petunjuk -->
  {#if showZoomChip || showHint}
    <div
      class="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none z-20"
      style={controlsLayout === 'top_dock' ? 'bottom: 24px;' : 'top: 28px;'}
    >
      {#if showZoomChip}
        <span class="tabular-nums {skin.chipClass}" style={resolvedChipStyle}>
          {swapDrag ? 'Mode Tukar Slot' : `${Math.round(zoom * 100)}%`}
        </span>
      {/if}
      {#if showHint}
        <span class="text-xs font-semibold opacity-80 text-center px-4" style="color: {skin.hintColor};">
          {resolvedHint}
        </span>
      {/if}
    </div>
  {/if}

  <!-- Kontrol tombol sesuai controlsLayout (frame tetap di tengah) -->
  {#if controlsLayout === 'corners'}
    {@render zoomOutBtn('absolute top-6 left-6 z-20')}
    {@render zoomInBtn('absolute top-6 right-6 z-20')}
    {@render resetBtn('absolute bottom-6 left-6 z-20')}
    {@render closeBtn('absolute bottom-6 right-6 z-20')}
  {:else if controlsLayout === 'bottom_dock'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2.5 rounded-full bg-black/25 backdrop-blur-md"
      onclick={(e) => e.stopPropagation()}
    >
      {@render zoomOutBtn()}
      {@render zoomInBtn()}
      {@render resetBtn()}
      {@render closeBtn()}
    </div>
  {:else if controlsLayout === 'top_dock'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2.5 rounded-full bg-black/25 backdrop-blur-md"
      onclick={(e) => e.stopPropagation()}
    >
      {@render zoomOutBtn()}
      {@render zoomInBtn()}
      {@render resetBtn()}
      {@render closeBtn()}
    </div>
  {:else if controlsLayout === 'left_rail'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute left-6 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-3 px-2.5 py-4 rounded-full bg-black/25 backdrop-blur-md"
      onclick={(e) => e.stopPropagation()}
    >
      {@render zoomInBtn()}
      {@render zoomOutBtn()}
      {@render resetBtn()}
      {@render closeBtn()}
    </div>
  {:else if controlsLayout === 'right_rail'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute right-6 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-3 px-2.5 py-4 rounded-full bg-black/25 backdrop-blur-md"
      onclick={(e) => e.stopPropagation()}
    >
      {@render zoomInBtn()}
      {@render zoomOutBtn()}
      {@render resetBtn()}
      {@render closeBtn()}
    </div>
  {:else if controlsLayout === 'split_sides'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute left-6 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-3 px-2.5 py-3.5 rounded-full bg-black/25 backdrop-blur-md"
      onclick={(e) => e.stopPropagation()}
    >
      {@render zoomInBtn()}
      {@render zoomOutBtn()}
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute right-6 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-3 px-2.5 py-3.5 rounded-full bg-black/25 backdrop-blur-md"
      onclick={(e) => e.stopPropagation()}
    >
      {@render resetBtn()}
      {@render closeBtn()}
    </div>
  {/if}
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
  .crop-lifted-card {
    transform: translate(-50%, -50%) scale(1.06) rotate(-1.5deg);
    animation: crop-lift-in 0.16s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .crop-slot-swap-pop {
    animation: crop-slot-swap-pop 0.38s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes crop-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes crop-pop {
    from { opacity: 0; transform: scale(0.94); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes crop-lift-in {
    from { transform: translate(-50%, -50%) scale(0.94) rotate(0deg); opacity: 0.7; }
    to { transform: translate(-50%, -50%) scale(1.06) rotate(-1.5deg); opacity: 1; }
  }
  @keyframes crop-slot-swap-pop {
    0% { transform: scale(0.9); filter: brightness(1.22); }
    55% { transform: scale(1.04); filter: brightness(1.05); }
    100% { transform: scale(1); filter: brightness(1); }
  }
  @keyframes crop-wiggle {
    0%, 100% { transform: translate(0, 0) rotate(0); }
    25% { transform: translate(-1.5px, 0.8px) rotate(-0.5deg); }
    50% { transform: translate(1.5px, -1px) rotate(0.5deg); }
    75% { transform: translate(-1px, -0.8px) rotate(-0.4deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .crop-wiggle { animation: none; }
    .crop-slot-swap-pop { animation: none; }
  }
</style>
