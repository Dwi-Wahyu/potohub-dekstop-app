<script lang="ts">
  import type { Snippet } from 'svelte';
  import { uiConfig, isLocalAssetUrl } from '$lib/stores/uiConfig.svelte';

  interface Props {
    src?: string | null;
    blurSrc?: string | null;
    class?: string;
    style?: string;
    children?: Snippet;
  }

  let { src = null, blurSrc = null, class: className = '', style = '', children }: Props = $props();

  let resolvedSrc = $derived(src ? uiConfig.resolveAssetUrl(src) : null);
  let isInstantSource = $derived(
    !resolvedSrc || isLocalAssetUrl(resolvedSrc) || uiConfig.isAssetDecoded(resolvedSrc),
  );
  let isLoaded = $state(true);

  $effect(() => {
    const target = resolvedSrc;
    if (!target || isLocalAssetUrl(target) || uiConfig.isAssetDecoded(target) || !blurSrc) {
      isLoaded = true;
      return;
    }
    const img = new Image();
    img.src = target;
    if (img.complete) {
      isLoaded = true;
      return;
    }
    isLoaded = false;
    img.onload = () => {
      isLoaded = true;
    };
    img.onerror = () => {
      isLoaded = true;
    };
  });
</script>

<div class="relative overflow-hidden {className}" {style}>
  <!-- Layer 1: Blur Placeholder (hanya untuk aset remote yang belum tercache lokal) -->
  {#if blurSrc && !isInstantSource && !isLoaded}
    <div
      class="absolute inset-0 bg-cover bg-center filter blur-md scale-105 transform pointer-events-none"
      style="background-image: url('{blurSrc}');"
    ></div>
  {/if}

  <!-- Layer 2: Full High-Res Background Image -->
  {#if resolvedSrc}
    <div
      class="absolute inset-0 bg-cover bg-center pointer-events-none {isInstantSource || isLoaded || !blurSrc ? 'opacity-100' : 'opacity-0'}"
      style="background-image: url('{resolvedSrc}');"
    ></div>
  {/if}

  <!-- Layer 3: Content Slot -->
  <div class="relative z-10 w-full h-full">
    {@render children?.()}
  </div>
</div>
