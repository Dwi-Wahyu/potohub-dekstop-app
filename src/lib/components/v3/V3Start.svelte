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
  class="w-screen h-screen bg-[#0a0a0f] text-white flex flex-col justify-between items-center p-12 select-none relative overflow-hidden font-['Inter',sans-serif]"
>
  <!-- Background glow -->
  <div class="absolute inset-0 pointer-events-none opacity-30 bg-[radial-gradient(circle_at_center,#FFC107_0%,transparent_60%)]"></div>

  <!-- Header -->
  <div class="w-full flex justify-between items-center relative z-10">
    <div class="flex items-center gap-2">
      <span class="w-3 h-3 bg-[#FFC107] rounded-full animate-ping"></span>
      <span class="font-extrabold text-sm tracking-[0.2em] text-[#FFC107] uppercase">
        {uiConfig.config.boothName}
      </span>
    </div>

    <!-- Hidden PIN trigger lock button -->
    <button
      onclick={() => (showPinModal = true)}
      class="border-none bg-transparent cursor-pointer p-1 text-white/40 hover:text-white transition-colors"
      title="Operator PIN"
    >
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </button>
  </div>

  <!-- Hero -->
  <div class="flex flex-col items-center text-center relative z-10 my-auto">
    <span
      role="presentation"
      onclick={handleHiddenTap}
      class="text-xs font-black uppercase tracking-[0.4em] text-[#FFC107] mb-3 cursor-pointer"
    >
      Next-Gen Photobooth Studio
    </span>

    <h1 class="text-[clamp(72px,12vw,140px)] font-black uppercase tracking-tight leading-none text-white mb-4 drop-shadow-[0_0_35px_rgba(255,193,7,0.3)]">
      {uiConfig.config.boothName}
    </h1>

    <p class="text-xl text-white/60 max-w-lg mb-10 font-medium">
      {uiConfig.config.tagline}
    </p>

    <button
      onclick={onStart}
      class="px-14 py-5 bg-[#FFC107] text-black text-xl font-black uppercase tracking-[0.2em] rounded-full hover:bg-yellow-300 transition-all shadow-[0_0_30px_rgba(255,193,7,0.5)] active:scale-95 cursor-pointer border-none"
    >
      START BOOTH ★
    </button>
  </div>

  <!-- Footer -->
  <div class="w-full flex justify-between items-center relative z-10 text-xs font-bold text-white/30 tracking-widest">
    <span>TOUCH TO START</span>
    <span>SERIES V3.0</span>
  </div>

  {#if showPinModal}
    <div
      class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
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
