<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { formatTime } from '$lib/utils/shared';

  interface Props {
    basePrice: number;
    onNext: (quantity: number) => void;
    onBack: () => void;
  }

  let { basePrice, onNext, onBack }: Props = $props();

  let quantity = $state(1);
  let secs = $state(14 * 60 + 50);
  let timer: any = null;

  const MIN = 1;
  const MAX = 10;

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

  function minus() {
    quantity = Math.max(MIN, quantity - 1);
  }

  function plus() {
    quantity = Math.min(MAX, quantity + 1);
  }

  let total = $derived(basePrice * quantity);
  const fmtPrice = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
</script>

<div
  class="w-full h-full overflow-hidden flex flex-col font-['Plus_Jakarta_Sans',sans-serif] text-[#e6e1e5] relative"
  style="background: linear-gradient(135deg, #1e1b4b 0%, #2a2873 50%, #312e81 100%);"
>
  <!-- Watermark -->
  <div
    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[clamp(180px,22vw,380px)] font-black text-white/[0.028] tracking-[-0.04em] whitespace-nowrap pointer-events-none select-none z-0"
  >
    {uiConfig.config.boothName}
  </div>

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
      <h1 class="m-0 mb-1.5 text-[32px] font-bold tracking-[-0.01em] text-white">
        Pilih Jumlah Print
      </h1>
      <p class="m-0 text-sm text-white/[0.35]">
        Klik tombol + untuk menambah jumlah print
      </p>
    </div>

    <div class="flex items-center gap-2 bg-white/95 text-[#0f0e14] px-[22px] py-[11px] rounded-full font-bold text-base shadow-[0_6px_24px_rgba(0,0,0,0.4)] shrink-0">
      <svg width="15" height="15" fill="none" stroke={uiConfig.config.primaryColor} stroke-width="2.5" viewBox="0 0 24 24">
        <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="tabular-nums">{formatTime(secs)}</span>
    </div>
  </header>

  <!-- Card -->
  <main class="flex-grow min-h-0 flex items-center justify-center px-20 py-8 relative z-10">
    <div class="w-full max-w-[820px] rounded-[22px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.7)] flex flex-col">
      <!-- Top section: light -->
      <div class="bg-white px-9 py-8 flex items-center gap-7">
        <svg width="72" height="80" viewBox="0 0 72 80" fill="none" class="shrink-0">
          <rect x="18" y="4" width="42" height="62" rx="5" stroke="#c0c0c8" stroke-width="2" fill="#f5f5f5" />
          <rect x="23" y="12" width="32" height="18" rx="3" fill="#e0e0e8" />
          <rect x="23" y="34" width="32" height="18" rx="3" fill="#e0e0e8" />
          <rect x="4" y="14" width="42" height="62" rx="5" stroke="#9ca3af" stroke-width="2" fill="white" />
          <rect x="10" y="22" width="30" height="18" rx="3" fill="#d1d5db" />
          <rect x="10" y="44" width="30" height="18" rx="3" fill="#d1d5db" />
        </svg>

        <div class="flex-1 min-w-0">
          <h2 class="m-0 mb-2 text-xl font-bold text-[#111827]">
            Tambah Jumlah Print
          </h2>
          <p class="m-0 text-[13px] text-[#6b7280] leading-relaxed">
            Penambahan jumlah print berpengaruh pada total harga yang
            akan kamu bayarkan ({quantity} lembar = {fmtPrice(basePrice * quantity)})
          </p>
        </div>

        <!-- Counter Widget -->
        <div class="flex items-center rounded-2xl overflow-hidden h-[52px] shrink-0 bg-[#0a0910] shadow-inner">
          <button
            onclick={minus}
            disabled={quantity <= MIN}
            class="w-[52px] h-[52px] border-none bg-white/10 flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-white/20 active:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width="18" height="18" fill="none" stroke="white" stroke-width="2.5" viewBox="0 0 24 24">
              <path d="M5 12h14" stroke-linecap="round" />
            </svg>
          </button>

          <div class="w-[56px] h-[52px] flex items-center justify-center bg-transparent">
            <span class="text-[26px] font-extrabold text-white font-['Nunito',sans-serif] tabular-nums tracking-[-0.02em]">
              {quantity}
            </span>
          </div>

          <button
            onclick={plus}
            disabled={quantity >= MAX}
            class="w-[52px] h-[52px] border-none bg-white/10 flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-white/20 active:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg width="18" height="18" fill="none" stroke="white" stroke-width="2.5" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Bottom section: dark -->
      <div class="bg-[#0f0e14] px-9 py-6 flex items-center justify-between">
        <div>
          {#if quantity > 1}
            <div class="text-xs text-white/40 mb-0.5">
              {quantity} × {fmtPrice(basePrice)}
            </div>
          {/if}
          <div class="text-[36px] font-extrabold text-white tracking-[-0.02em] tabular-nums font-['Nunito',sans-serif]">
            {fmtPrice(total)}
          </div>
        </div>

        <button
          title="next"
          onclick={() => onNext(quantity)}
          class="w-16 h-16 rounded-full border-none flex items-center justify-center cursor-pointer transition-all duration-200 ease-out active:scale-95 hover:scale-110"
          style="
            background-color: {uiConfig.config.primaryColor};
            color: #1a0a00;
          "
        >
          <svg width="26" height="26" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
            <path d="M8.25 4.5l7.5 7.5-7.5 7.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  </main>
</div>
