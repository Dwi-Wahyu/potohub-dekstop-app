<script lang="ts">
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import PinPad from '$lib/components/shared/PinPad.svelte';

  interface Props {
    onStart: () => void;
    onOpenConfig: () => void;
  }

  let { onStart, onOpenConfig }: Props = $props();

  let showPinModal = $state(false);
  let tapCount = $state(0);
  let tapTimer: any = null;

  function handleHiddenTap() {
    tapCount++;
    if (tapTimer) clearTimeout(tapTimer);
    if (tapCount >= 5) {
      showPinModal = true;
      tapCount = 0;
    } else {
      tapTimer = setTimeout(() => {
        tapCount = 0;
      }, 1500);
    }
  }
</script>

<div
  class="w-screen h-screen bg-[#fafafa] flex flex-col justify-between items-center px-16 py-12 select-none relative overflow-hidden"
  style="font-family: 'Playfair Display', Georgia, serif;"
>
  <!-- Decorative borders -->
  <div class="absolute inset-5 pointer-events-none z-0">
    <div class="absolute inset-0 border-[3px] border-black rounded-[28px]"></div>
    <div class="absolute inset-[6px] border border-black/20 rounded-[23px]"></div>
  </div>

  <!-- Top bar -->
  <div class="w-full flex justify-between items-center relative z-10">
    <div class="flex items-center gap-2">
      <span class="w-2.5 h-2.5 bg-black rounded-full"></span>
      <span class="font-['Nunito',sans-serif] font-black text-sm tracking-[0.25em] uppercase">
        {uiConfig.config.boothName}
      </span>
    </div>

    <!-- Hidden PIN trigger lock icon -->
    <button
      onclick={() => (showPinModal = true)}
      class="border-none bg-transparent cursor-pointer p-1 opacity-50 hover:opacity-100 transition-opacity"
      title="Operator PIN"
    >
      <svg width="18" height="18" fill="none" stroke="black" stroke-width="2" viewBox="0 0 24 24">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </button>
  </div>

  <!-- Center hero -->
  <div class="flex flex-col items-center text-center relative z-10 my-auto">
    <span
      role="presentation"
      onclick={handleHiddenTap}
      class="text-xs font-['Nunito',sans-serif] font-black uppercase tracking-[0.4em] text-black/40 mb-4 cursor-pointer"
    >
      Classic Photobooth Studio
    </span>

    <h1 class="text-[clamp(64px,10vw,120px)] font-black uppercase tracking-tight leading-[0.9] text-black mb-4">
      {uiConfig.config.boothName}
    </h1>

    <p class="text-xl italic text-black/60 max-w-md mb-10 font-normal">
      "{uiConfig.config.tagline}"
    </p>

    <button
      onclick={onStart}
      class="px-14 py-5 bg-black text-white text-lg font-['Nunito',sans-serif] font-black uppercase tracking-[0.25em] rounded-full hover:bg-gray-900 transition-all shadow-[8px_8px_0_0_rgba(0,0,0,0.2)] active:scale-95 cursor-pointer border-none"
    >
      Mulai Sesi →
    </button>
  </div>

  <!-- Footer bar -->
  <div class="w-full flex justify-between items-center relative z-10 text-xs font-['Nunito',sans-serif] font-bold text-black/40 tracking-widest">
    <span>PRESS TO START</span>
    <span>VERSION 2.0</span>
  </div>

  {#if showPinModal}
    <div
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onclick={() => (showPinModal = false)}
      role="presentation"
    >
      <PinPad
        onSuccess={() => {
          showPinModal = false;
          onOpenConfig();
        }}
        onCancel={() => (showPinModal = false)}
      />
    </div>
  {/if}
</div>
