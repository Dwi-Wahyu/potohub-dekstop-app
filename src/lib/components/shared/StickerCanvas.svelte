<script lang="ts">
  import type { Sticker } from '$lib/utils/stickers';
  import type { Snippet } from 'svelte';

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
  let dragging = $state<{ id: number; ox: number; oy: number } | null>(null);

  function onPointerDown(e: PointerEvent, sticker: Sticker) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const curX = (sticker.x / 100) * rect.width;
    const curY = (sticker.y / 100) * rect.height;
    dragging = { id: sticker.id, ox: e.clientX - curX, oy: e.clientY - curY };
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging || !containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - dragging.ox) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - dragging.oy) / rect.height) * 100));
    onMove(dragging.id, x, y);
  }

  function onPointerUp() {
    dragging = null;
  }
</script>

<div
  role="presentation"
  bind:this={containerRef}
  class={`relative ${className}`}
  style={containerStyle}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointerleave={onPointerUp}
>
  {#if children}
    {@render children()}
  {/if}

  {#each stickers as s (s.id)}
    <div
      onpointerdown={(e) => onPointerDown(e, s)}
      ondblclick={() => onRemove(s.id)}
      role="presentation"
      style="
        position: absolute;
        left: {s.x}%;
        top: {s.y}%;
        transform: translate(-50%, -50%);
        font-size: 32px;
        cursor: grab;
        user-select: none;
        touch-action: none;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        z-index: 20;
        line-height: 1;
      "
      title="Geser untuk pindah · Double-click untuk hapus"
    >
      {#if s.type === 'image' && s.imageUrl}
        <img
          src={s.imageUrl}
          alt="Sticker"
          class="pointer-events-none block select-none"
          style="
            width: {s.width ? `${s.width}px` : '64px'};
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
