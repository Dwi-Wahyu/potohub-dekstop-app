<script lang="ts">
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import PinPad from '$lib/components/shared/PinPad.svelte';
  import IdleBannerModal from '$lib/components/shared/IdleBannerModal.svelte';

  interface Props {
    onStart: () => void;
    onOpenConfig: () => void;
    background?: string;
  }

  let { onStart, onOpenConfig, background }: Props = $props();

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

  const DEFAULT_BG = '#fafafa';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('start').background ?? DEFAULT_BG);
</script>

<div
  class="w-full h-full flex items-center justify-center relative overflow-hidden select-none"
  style:background={effectiveBg}
  style:font-family="'Playfair Display', Georgia, serif"
>
  <!-- Decorative border (ClassicBorder) -->
  <div class="absolute inset-5 pointer-events-none z-0">
    <div class="absolute inset-0 border-[3px] border-black rounded-[28px]"></div>
    <div class="absolute inset-[6px] border border-black/20 rounded-[23px]"></div>
    {#each ['top-3 left-3', 'top-3 right-3', 'bottom-3 left-3', 'bottom-3 right-3'] as pos}
      <div class="absolute {pos} w-4 h-4">
        <div
          class="w-2 h-2 border-t-2 border-l-2 border-black absolute top-0 left-0"
          style="border-radius: 2px 0 0 0;"
        ></div>
      </div>
    {/each}
  </div>

  <!-- Booth badge & Operator lock at top right -->
  <div class="absolute top-8 right-10 z-10 flex items-center gap-3">
    <button
      onclick={() => (showPinModal = true)}
      class="border-none bg-transparent cursor-pointer p-1 opacity-40 hover:opacity-100 transition-opacity"
      title="Operator PIN"
    >
      <svg width="18" height="18" fill="none" stroke="black" stroke-width="2" viewBox="0 0 24 24">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </button>
  </div>

  <!-- Center hero -->
  <div class="relative z-10 flex flex-col items-center">
    <p class="text-base italic tracking-[0.2em] text-black/40 mb-10">
      {uiConfig.config.tagline || 'Bringing fun to every frame'}
    </p>

    <!-- Logo card -->
    <div class="relative mb-14">
      <div
        class="px-8 h-36 border-[3px] border-black rounded-[32px] bg-white flex items-center justify-center shadow-[8px_8px_0_0_#000]"
      >
        <h1
          class="text-5xl font-black tracking-tighter uppercase font-['Nunito',sans-serif] m-0 text-black"
          style="letter-spacing: -0.03em;"
        >
          {uiConfig.config.boothName || 'POTOHUB'}
        </h1>
      </div>
      <div
        class="absolute -top-3 -left-3 w-5 h-5 border-[3px] border-black rounded-full bg-[#fafafa]"
      ></div>
      <div
        class="absolute -bottom-3 -right-3 w-5 h-5 border-[3px] border-black rounded-full bg-[#fafafa]"
      ></div>
    </div>

    <p class="text-sm tracking-widest text-black/30 mb-8 uppercase font-['Nunito',sans-serif] font-bold">
      Touch the screen to begin
    </p>

    <button
      onclick={onStart}
      class="px-14 py-3.5 border-[2.5px] border-black rounded-full text-lg font-bold uppercase tracking-[0.2em] font-['Nunito',sans-serif] hover:bg-black hover:text-white transition-all active:scale-95 shadow-[4px_4px_0_0_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 cursor-pointer bg-white text-black"
    >
      Start
    </button>
  </div>

  <!-- Idle Promo Banner Popup Slider -->
  <IdleBannerModal disabled={showPinModal} />

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
