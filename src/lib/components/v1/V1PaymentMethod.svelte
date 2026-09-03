<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { formatTime } from '$lib/utils/shared';

  interface Props {
    onSelect: (method: 'ticket' | 'cashless') => void;
    onBack: () => void;
    background?: string;
  }

  let { onSelect, onBack, background }: Props = $props();

  let secs = $state(15 * 60);
  let timer: any = null;

  onMount(() => {
    timer = setInterval(() => {
      if (secs > 0) secs--;
      else {
        clearInterval(timer);
        onBack();
      }
    }, 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const DEFAULT_BG = 'linear-gradient(135deg, #1e1b4b 0%, #2a2873 50%, #312e81 100%)';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('payment').background ?? DEFAULT_BG);
</script>

<div
  class="w-full h-full overflow-hidden flex flex-col font-['Plus_Jakarta_Sans',sans-serif] text-[#e6e1e5] relative"
  style:background={effectiveBg}
>
  <!-- Header -->
  <header class="flex justify-between items-center px-12 py-7 shrink-0 relative z-10">
    <button
      onclick={onBack}
      class="flex items-center gap-1.5 border border-white/10 text-white/30 px-5 py-[9px] rounded-full bg-transparent cursor-pointer font-['Plus_Jakarta_Sans',sans-serif] text-sm font-medium transition-colors duration-150 hover:text-white/60 hover:border-white/20"
    >
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path d="M15.75 19.5L8.25 12l7.5-7.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      Kembali
    </button>

    <div class="text-center flex-1 px-6">
      <h1 class="m-0 mb-2 text-[34px] font-bold tracking-[-0.01em] text-white">
        Pilih Metode Pembayaran
      </h1>
      <p class="m-0 text-[15px] text-white/[0.35] font-normal">
        Silahkan sebelumnya, pilih metode yang akan kamu pakai
      </p>
    </div>

    <div class="flex items-center gap-2 bg-white/95 text-[#0f0e14] px-[22px] py-[11px] rounded-full font-bold text-base shadow-[0_6px_24px_rgba(0,0,0,0.4)] shrink-0">
      <svg width="15" height="15" fill="none" stroke={uiConfig.config.primaryColor} stroke-width="2.5" viewBox="0 0 24 24">
        <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="tabular-nums">{formatTime(secs)}</span>
    </div>
  </header>

  <!-- Cards -->
  <main class="flex-grow min-h-0 flex items-center justify-center gap-12 px-13 py-10 relative z-10">
    <!-- Scan Ticket Card -->
    <button
      onclick={() => onSelect('ticket')}
      class="flex flex-col items-center justify-between w-[320px] bg-white rounded-[22px] px-9 pt-11 pb-7 outline-none cursor-pointer transition-all duration-200 ease-out hover:scale-[1.03] active:scale-95 shadow-[0_40px_100px_rgba(0,0,0,0.7)] group"
    >
      <div class="flex-1 flex items-center justify-center mb-7">
        <svg width="160" height="180" viewBox="0 0 160 180" fill="none">
          <rect x="40" y="20" width="100" height="130" rx="10" fill="#e8e8e8" />
          <rect x="20" y="30" width="100" height="130" rx="10" fill="white" stroke="#d0d0d0" stroke-width="1.5" />
          <rect x="32" y="42" width="24" height="24" rx="3" fill="#111" />
          <rect x="36" y="46" width="16" height="16" rx="2" fill="white" />
          <rect x="40" y="50" width="8" height="8" rx="1" fill="#111" />
          <rect x="84" y="42" width="24" height="24" rx="3" fill="#111" />
          <rect x="88" y="46" width="16" height="16" rx="2" fill="white" />
          <rect x="92" y="50" width="8" height="8" rx="1" fill="#111" />
          <rect x="32" y="94" width="24" height="24" rx="3" fill="#111" />
          <rect x="36" y="98" width="16" height="16" rx="2" fill="white" />
          <rect x="40" y="102" width="8" height="8" rx="1" fill="#111" />
          <line x1="28" y1="128" x2="112" y2="128" stroke="#e0e0e0" stroke-width="1.5" stroke-dasharray="4 3" />
        </svg>
      </div>
      <div class="w-full flex items-center justify-between">
        <span class="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-xl text-[#1a1a1e] tracking-[-0.01em]">
          Scan Ticket
        </span>
        <div class="w-[42px] h-[42px] rounded-full flex items-center justify-center shrink-0 bg-[#f5f5f5] group-hover:bg-[#f5d9cc] transition-colors">
          <svg width="18" height="18" fill="none" stroke="#333" stroke-width="2.5" viewBox="0 0 24 24">
            <path d="M8.25 4.5l7.5 7.5-7.5 7.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      </div>
    </button>

    <!-- Cashless Card -->
    <button
      onclick={() => onSelect('cashless')}
      class="flex flex-col items-center justify-between w-[320px] bg-white rounded-[22px] px-9 pt-11 pb-7 outline-none cursor-pointer transition-all duration-200 ease-out hover:scale-[1.03] active:scale-95 shadow-[0_40px_100px_rgba(0,0,0,0.7)] group"
    >
      <div class="flex-1 flex items-center justify-center mb-7">
        <svg width="160" height="180" viewBox="0 0 160 180" fill="none">
          <rect x="40" y="25" width="106" height="70" rx="10" fill="#d1d5db" />
          <rect x="14" y="38" width="106" height="70" rx="10" fill="white" stroke="#d0d0d0" stroke-width="1.5" />
          <rect x="26" y="58" width="22" height="18" rx="4" fill="#e5c87a" stroke="#d4a840" stroke-width="1" />
          <rect x="14" y="50" width="106" height="12" fill="#f3f4f6" />
          <rect x="28" y="120" width="56" height="56" rx="8" fill="#f9f9f9" stroke="#e0e0e0" stroke-width="1.5" />
          <line x1="28" y1="148" x2="84" y2="148" stroke={uiConfig.config.primaryColor} stroke-width="1.5" stroke-opacity="0.8" />
        </svg>
      </div>
      <div class="w-full flex items-center justify-between">
        <span class="font-['Plus_Jakarta_Sans',sans-serif] font-bold text-xl text-[#1a1a1e] tracking-[-0.01em]">
          Cashless
        </span>
        <div class="w-[42px] h-[42px] rounded-full flex items-center justify-center shrink-0 bg-[#f5f5f5] group-hover:bg-[#f5d9cc] transition-colors">
          <svg width="18" height="18" fill="none" stroke="#333" stroke-width="2.5" viewBox="0 0 24 24">
            <path d="M8.25 4.5l7.5 7.5-7.5 7.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      </div>
    </button>
  </main>
</div>
