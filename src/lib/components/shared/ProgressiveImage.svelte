<script lang="ts">
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

  let isLoaded = $state(false);

  function handleLoad() {
    isLoaded = true;
  }

  $effect(() => {
    if (src) {
      isLoaded = false;
    }
  });
</script>

<div class="relative overflow-hidden {aspectRatio} {className}">
  <!-- Layer 1: Blur Placeholder -->
  {#if blurSrc && !isLoaded}
    <div
      class="absolute inset-0 bg-cover bg-center filter blur-md scale-105 transform pointer-events-none"
      style="background-image: url('{blurSrc}');"
    ></div>
  {/if}

  <!-- Layer 2: Actual Image -->
  {#if src}
    <img
      {src}
      {alt}
      loading="lazy"
      decoding="async"
      onload={handleLoad}
      class="w-full h-full object-{objectFit} {isLoaded || !blurSrc ? 'opacity-100' : 'opacity-0'}"
    />
  {/if}
</div>
