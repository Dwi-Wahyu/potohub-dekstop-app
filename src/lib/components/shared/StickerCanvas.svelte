<script lang="ts">
  import { STICKER_EMOJI_PX, STICKER_IMAGE_PX, type Sticker } from '$lib/utils/stickers';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import type { Snippet } from 'svelte';
  import { Trash2, X } from '@lucide/svelte';

  interface Props {
    stickers: Sticker[];
    onMove: (id: number, x: number, y: number) => void;
    onRemove: (id: number) => void;
    containerStyle?: string;
    class?: string;
    children?: Snippet;
  }

  let {
    stickers,
    onMove,
    onRemove,
    containerStyle = '',
    class: className = '',
    children
  }: Props = $props();

  let containerRef = $state<HTMLDivElement | null>(null);
  let dragging = $state<{ id: number; ox: number; oy: number; moved: boolean } | null>(null);
  let selectedId = $state<number | null>(null);
  // Diisi saat stiker sedang diseret: menampilkan zona tong sampah di bawah tengah
  let overTrash = $state<boolean | null>(null);

  // Zona tong sampah (persen dari kanvas), sesuai desain Figma
  const inTrash = (x: number, y: number) => y >= 84 && x >= 25 && x <= 75;

  function onPointerDown(e: PointerEvent, sticker: Sticker) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const curX = (sticker.x / 100) * rect.width;
    const curY = (sticker.y / 100) * rect.height;
    dragging = { id: sticker.id, ox: e.clientX - curX, oy: e.clientY - curY, moved: false };
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - dragging.ox) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - dragging.oy) / rect.height) * 100));
    dragging.moved = true;
    overTrash = inTrash(x, y);
    onMove(dragging.id, x, y);
  }

  function onPointerUp() {
    const d = dragging;
    dragging = null;
    if (!d) return;
    if (!d.moved) {
      // Ketuk tanpa geser = pilih / batal pilih stiker
      selectedId = selectedId === d.id ? null : d.id;
      return;
    }
    const wasOverTrash = overTrash;
    overTrash = null;
    if (wasOverTrash) {
      if (selectedId === d.id) selectedId = null;
      onRemove(d.id);
    }
  }

  function removeSelected(e: MouseEvent, id: number) {
    e.stopPropagation();
    selectedId = null;
    onRemove(id);
  }
</script>

<div
  role="presentation"
  bind:this={containerRef}
  class={`relative ${className}`}
  style={containerStyle}
  onpointerdown={() => (selectedId = null)}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointerleave={onPointerUp}
>
  {#if children}
    {@render children()}
  {/if}

  {#if overTrash !== null}
    <div
      class="absolute flex items-center justify-center pointer-events-none"
      style="
        left: 50%;
        bottom: 10px;
        transform: translateX(-50%) scale({overTrash ? 1.15 : 1});
        width: 72px;
        height: 72px;
        border-radius: 999px;
        z-index: 130;
        background: {overTrash ? '#ef4444' : 'rgba(0,0,0,0.6)'};
        color: #fff;
        border: 3px solid #fff;
        box-shadow: 0 6px 20px rgba(0,0,0,0.4);
        transition: all 0.15s;
      "
    >
      <Trash2 size={30} />
    </div>
  {/if}

  {#each stickers as s (s.id)}
    {@const isSel = selectedId === s.id}
    <div
      onpointerdown={(e) => onPointerDown(e, s)}
      role="presentation"
      style="
        position: absolute;
        left: {s.x}%;
        top: {s.y}%;
        transform: translate(-50%, -50%);
        font-size: {STICKER_EMOJI_PX}px;
        cursor: grab;
        user-select: none;
        touch-action: none;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        z-index: {isSel ? 120 : 100};
        line-height: 1;
        padding: 10px;
        border-radius: 10px;
        outline: {isSel ? '2px dashed rgba(255,255,255,0.9)' : 'none'};
        outline-offset: 2px;
        opacity: {overTrash && dragging?.id === s.id ? 0.55 : 1};
      "
      title="Geser untuk pindah · Ketuk untuk pilih"
    >
      {#if isSel}
        <button
          onpointerdown={(e) => e.stopPropagation()}
          onpointerup={(e) => e.stopPropagation()}
          onclick={(e) => removeSelected(e, s.id)}
          aria-label="Hapus stiker"
          class="absolute flex items-center justify-center cursor-pointer p-0"
          style="
            top: -26px;
            right: -26px;
            width: 48px;
            height: 48px;
            border-radius: 999px;
            background: #ef4444;
            color: #fff;
            border: 3px solid #fff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            touch-action: manipulation;
          "
        >
          <X size={24} strokeWidth={3} />
        </button>
      {/if}
      {#if s.type === 'image' && s.imageUrl}
        <img
          src={uiConfig.resolveAssetUrl(s.imageUrl)}
          alt="Sticker"
          class="pointer-events-none block select-none"
          style="
            width: {s.width ? `${s.width}px` : `${STICKER_IMAGE_PX}px`};
            height: {s.height ? `${s.height}px` : 'auto'};
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
          "
        />
      {:else}
        {s.emoji}
      {/if}
    </div>
  {/each}
</div>
