<script lang="ts">
  import { onMount } from 'svelte';
  import PinPad from '$lib/components/shared/PinPad.svelte';
  import IdleBannerModal from '$lib/components/shared/IdleBannerModal.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { setWindowDecorations } from '$lib/utils/windowControl';

  interface Props {
    onStart: () => void;
    onOpenConfig: () => void;
    background?: string;
  }

  let { onStart, onOpenConfig, background }: Props = $props();

  onMount(() => {
    void setWindowDecorations(false);
  });

  let showPinModal = $state(false);
  let tapCount = $state(0);
  let tapTimer = $state<NodeJS.Timeout | null>(null);

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

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      showPinModal = true;
    }
  }

  let startBtnPos = $derived(uiConfig.getElementPosition('start', 'start_button', { x: 50, y: 82 }));
  let startBtnStyle = $derived(uiConfig.getElementStyle('start', 'start_button', {
    bgColor: '#f5d9cc', textColor: '#1a0a00', fontSize: 'Sedang', fontFamily: 'Sans Serif',
  }));

  const DEFAULT_BG = 'linear-gradient(135deg, #1e1b4b 0%, #2a2873 50%, #312e81 100%)';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('start').background ?? DEFAULT_BG);
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="relative w-full h-full overflow-hidden flex flex-col items-center justify-center font-['Plus_Jakarta_Sans',sans-serif]"
  style:background={effectiveBg}
>
  <!-- Center content -->
  <div class="relative flex flex-col items-center gap-2.5">
    <div class="relative inline-block" role="presentation" onclick={handleHiddenTap}>
      <!-- Icons + Recording dot -->
      <div class="absolute -top-[38px] -right-1 flex items-center gap-1.5 pointer-events-none">
        <svg width="30" height="30" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="21" stroke="white" stroke-width="2.5" fill="none" />
          <circle cx="16.5" cy="19.5" r="2.2" fill="white" />
          <circle cx="31.5" cy="19.5" r="2.2" fill="white" />
          <path d="M 15 29 Q 24 37 33 29" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" />
        </svg>
        <svg width="30" height="30" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="21" stroke="white" stroke-width="2.5" fill="none" />
          <circle cx="16.5" cy="18.5" r="2.4" fill="white" />
          <circle cx="31.5" cy="18.5" r="2.4" fill="white" />
          <path d="M 13 28.5 Q 24 40 35 28.5" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" />
        </svg>
        <svg width="30" height="30" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="21" stroke="white" stroke-width="2.5" fill="none" />
          <path d="M 13 19.5 Q 16.5 14.5 20 19.5" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" />
          <path d="M 28 19.5 Q 31.5 14.5 35 19.5" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" />
          <path d="M 12 29 Q 24 42 36 29" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" />
        </svg>
        <span class="inline-block w-2.5 h-2.5 rounded-full bg-red-600 ml-0.5 shrink-0"></span>
      </div>

      <!-- Nama Brand Dinamis -->
      <h1 class="m-0 p-0 font-['Nunito',sans-serif] font-extrabold text-[clamp(72px,11vw,160px)] leading-none text-[#f5d9cc] tracking-[-0.01em] select-none cursor-pointer">
        {uiConfig.config.boothName}
      </h1>
    </div>

    <!-- Tagline Dinamis -->
    <p class="m-0 font-['Be_Vietnam_Pro',sans-serif] font-normal text-[clamp(12px,1.2vw,18px)] text-white/80 tracking-[0.02em]">
      {uiConfig.config.tagline}
    </p>
  </div>

  <!-- MULAI button Dinamis -->
  <button
    onclick={onStart}
    style="
      background-color: {startBtnStyle.bgColor};
      color: {startBtnStyle.textColor};
      box-shadow: 0 8px 32px {startBtnStyle.bgColor}50, 0 2px 8px rgba(0,0,0,0.4);
      position: absolute;
      left: {startBtnPos.x}%;
      top: {startBtnPos.y}%;
      transform: translate(-50%, -50%);
    "
    class="px-9 py-2.5 rounded-full min-w-[120px] border-none font-['Plus_Jakarta_Sans',sans-serif] font-bold text-[clamp(11px,1vw,14px)] tracking-[0.2em] uppercase cursor-pointer touch-manipulation transition-transform duration-150 ease-out active:scale-95"
  >
    {uiConfig.getElementLabel('start', 'start_button', 'MULAI')}
  </button>

  <p class="absolute bottom-[clamp(12px,2vh,20px)] left-0 right-0 text-center text-[clamp(9px,0.7vw,12px)] text-white/30 m-0 font-['Plus_Jakarta_Sans',sans-serif]">
    Powered by Potohub · v3.2
  </p>

  <!-- Idle Promo Banner Popup Slider -->
  <IdleBannerModal disabled={showPinModal} />

  <!-- PIN Modal for hidden trigger or keyboard shortcut -->
  {#if showPinModal}
    <div
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
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
