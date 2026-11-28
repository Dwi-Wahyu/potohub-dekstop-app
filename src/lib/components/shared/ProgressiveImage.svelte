<script lang="ts">
  import { uiConfig, isLocalAssetUrl } from '$lib/stores/uiConfig.svelte';

  interface Props {
    src?: string | null;
    blurSrc?: string | null;
    alt?: string;
    class?: string;
    aspectRatio?: string;
    objectFit?: 'cover' | 'contain' | 'fill' | 'none';
  }

  let {
    src = null,
    blurSrc = null,
    alt = '',
    class: className = '',
    aspectRatio = '',
    objectFit = 'cover'
  }: Props = $props();

  let resolvedSrc = $derived(src ? uiConfig.resolveAssetUrl(src) : null);
  let isInstantSource = $derived(
    !resolvedSrc || isLocalAssetUrl(resolvedSrc) || uiConfig.isAssetDecoded(resolvedSrc),
  );
  let isLoaded = $state(true);

  function handleLoad() {
    isLoaded = true;
  }

  $effect(() => {
    const target = resolvedSrc;
    if (!target || isLocalAssetUrl(target) || uiConfig.isAssetDecoded(target) || !blurSrc) {
      isLoaded = true;
    } else {
      isLoaded = false;
    }
  });
</script>

<div class="relative overflow-hidden {aspectRatio} {className}">
  <!-- Layer 1: Blur Placeholder (hanya untuk aset remote yang belum tercache lokal) -->
  {#if blurSrc && !isInstantSource && !isLoaded}
    <div
      class="absolute inset-0 bg-cover bg-center filter blur-md scale-105 transform pointer-events-none"
      style="background-image: url('{blurSrc}');"
    ></div>
  {/if}

  <!-- Layer 2: Actual Image -->
  {#if resolvedSrc}
    <img
      src={resolvedSrc}
      {alt}
      loading="eager"
      decoding={isInstantSource ? 'sync' : 'async'}
      draggable="false"
      onload={handleLoad}
      class="w-full h-full object-{objectFit} pointer-events-none select-none {isInstantSource || isLoaded || !blurSrc ? 'opacity-100' : 'opacity-0'}"
    />
  {/if}
</div>
