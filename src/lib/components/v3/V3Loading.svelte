<script lang="ts">
  import { onMount } from 'svelte';

  import { uiConfig } from '$lib/stores/uiConfig.svelte';

  interface Props {
    onDone: () => void;
    background?: string;
  }

  let { onDone, background }: Props = $props();

  onMount(() => {
    const t = setTimeout(() => {
      onDone();
    }, 3000);
    return () => clearTimeout(t);
  });

  const DEFAULT_BG = '#1a1a1a';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('loading').background ?? DEFAULT_BG);
</script>

<div
  class="w-full h-full flex flex-col items-center justify-center gap-6 relative overflow-hidden select-none font-['Inter',sans-serif]"
  style:background={effectiveBg}
>
  <!-- Background decoration -->
  <div
    class="absolute inset-0 opacity-20 pointer-events-none"
    style="background-color: #CD1C33; background-image: repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.05) 40px, rgba(0,0,0,0.05) 80px);"
  ></div>
  <div class="absolute top-8 left-8 text-white/5 text-[200px] font-black font-['Playfair_Display',serif] leading-none pointer-events-none">✦</div>
  <div class="absolute bottom-8 right-8 text-white/5 text-[200px] font-black font-['Playfair_Display',serif] leading-none pointer-events-none">★</div>

  <div class="relative z-10 flex flex-col items-center gap-6">
    <div class="w-32 h-32 rounded-full bg-white flex items-center justify-center shadow-[0_0_60px_rgba(205,28,51,0.4)] border-4 border-[#FFC107] relative">
      <div class="animate-spin text-5xl">📸</div>
      <!-- orbit rings -->
      <div class="absolute inset-[-12px] rounded-full border-2 border-dashed border-[#CD1C33]/30 animate-spin" style="animation-duration: 3s;"></div>
      <div class="absolute inset-[-24px] rounded-full border border-dashed border-white/10 animate-spin" style="animation-duration: 5s; animation-direction: reverse;"></div>
    </div>

    <div class="text-center">
      <h1 class="text-6xl font-['Playfair_Display',serif] font-bold text-white tracking-widest drop-shadow-xl uppercase m-0">
        Memuat Foto...
      </h1>
      <p class="text-white/40 text-[11px] font-bold uppercase tracking-[0.4em] mt-3 m-0 font-mono">Mohon tunggu sebentar</p>
    </div>

    <div class="flex gap-3 mt-2">
      {#each [1, 2, 3, 4, 5] as i}
        <div
          class="w-2.5 h-2.5 rounded-full animate-pulse"
          style={`background: ${['#CD1C33', '#FFC107', '#0E8E5E', '#FFC107', '#CD1C33'][i - 1]}; animation-delay: ${(i - 1) * 0.15}s;`}
        ></div>
      {/each}
    </div>
  </div>
</div>
