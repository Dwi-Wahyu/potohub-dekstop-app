<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    src?: string | null;
    blurSrc?: string | null;
    class?: string;
    style?: string;
    children?: Snippet;
  }

  let { src = null, blurSrc = null, class: className = '', style = '', children }: Props = $props();

  let isLoaded = $state(false);

  $effect(() => {
    if (!src) {
      isLoaded = false;
      return;
    }
    isLoaded = false;
    const img = new Image();
    img.src = src;
    img.onload = () => {
      isLoaded = true;
    };
    img.onerror = () => {
      isLoaded = true;
    };
  });
</script>

<div class="relative overflow-hidden {className}" {style}>
  <!-- Layer 1: Blur Placeholder -->
  {#if blurSrc && !isLoaded}
    <div
      class="absolute inset-0 bg-cover bg-center filter blur-md scale-105 transform pointer-events-none"
      style="background-image: url('{blurSrc}');"
    ></div>
  {/if}

  <!-- Layer 2: Full High-Res Background Image -->
  {#if src}
    <div
      class="absolute inset-0 bg-cover bg-center pointer-events-none {isLoaded || !blurSrc ? 'opacity-100' : 'opacity-0'}"
      style="background-image: url('{src}');"
    ></div>
  {/if}

  <!-- Layer 3: Content Slot -->
  <div class="relative z-10 w-full h-full">
    {@render children?.()}
  </div>
</div>
