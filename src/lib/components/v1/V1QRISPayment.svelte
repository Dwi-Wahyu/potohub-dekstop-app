<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { formatTime } from '$lib/utils/shared';

  interface Props {
    totalPrice: number;
    onSuccess: () => void;
    onBack: () => void;
    background?: string;
  }

  let { totalPrice, onSuccess, onBack, background }: Props = $props();

  let secs = $state(14 * 60 + 30);
  let qrSecs = $state(5 * 60);
  let paid = $state(false);
  let timer: any = null;

  onMount(() => {
    timer = setInterval(() => {
      if (secs > 0) secs--;
      else {
        clearInterval(timer);
        onBack();
      }
      if (qrSecs > 0) qrSecs--;
    }, 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  // Local state stub simulation - see §0 item 5
  function simulatePayment() {
    paid = true;
    setTimeout(() => onSuccess(), 1500);
  }

  const fmtPrice = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
  const PAYMENT_METHODS = ['GoPay', 'OVO', 'DANA', 'ShopeePay', 'LinkAja', 'BRI', 'BCA', 'Mandiri', 'BNI'];
  const DEFAULT_BG = 'linear-gradient(135deg, #1e1b4b 0%, #2a2873 50%, #312e81 100%)';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('payment').background ?? DEFAULT_BG);
</script>

<div
  class="w-full h-full overflow-hidden flex flex-col relative font-['Plus_Jakarta_Sans',sans-serif] text-[#e6e1e5]"
  style:background={effectiveBg}
>

  <div class="relative z-10 flex flex-col h-full text-[#e6e1e5]">
    <!-- Header -->
    <header class="flex justify-between items-start px-12 pt-8 shrink-0">
      <button
        onclick={onBack}
        class="flex items-center gap-1.5 px-5 py-[9px] rounded-full bg-transparent border border-white/10 text-white/30 cursor-pointer font-['Plus_Jakarta_Sans',sans-serif] text-sm font-medium hover:border-white/20 hover:text-white/50"
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path d="M15.75 19.5L8.25 12l7.5-7.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Kembali
      </button>

      <div class="text-center flex-1 px-6">
        <h1 class="m-0 mb-1.5 text-[28px] font-bold text-[#f0edf8]">
          Scan QRIS Untuk Bayar
        </h1>
        <p class="m-0 text-[13px] text-[#e6e1e5]/50">
          Pembayaran akan dikonfirmasi secara otomatis
        </p>
      </div>

      <div class="flex items-center gap-2 bg-white/95 text-[#0f0e14] px-[22px] py-[11px] rounded-full font-bold text-base shrink-0 shadow-[0_6px_24px_rgba(0,0,0,0.4)]">
        <svg width="15" height="15" fill="none" stroke={uiConfig.config.primaryColor} stroke-width="2.5" viewBox="0 0 24 24">
          <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="tabular-nums">{formatTime(secs)}</span>
      </div>
    </header>

    <!-- QRIS Card -->
    <main class="flex-grow min-h-0 flex items-center justify-center px-12 py-5">
      <div
        class={`bg-white rounded-3xl pt-7 px-8 pb-6 w-[340px] shadow-[0_32px_80px_rgba(0,0,0,0.6)] flex flex-col items-center gap-4 relative transition-all duration-300 ${
          paid ? 'opacity-50 scale-95' : 'opacity-100 scale-100'
        }`}
      >
        {#if paid}
          <div class="absolute inset-0 rounded-3xl bg-green-500/12 flex items-center justify-center z-10">
            <div class="w-[72px] h-[72px] rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_32px_rgba(34,197,94,0.5)]">
              <svg width="36" height="36" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24">
                <path d="M4.5 12.75l6 6 9-13.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
          </div>
        {/if}

        <div class="w-full flex justify-between items-start">
          <div class="flex gap-1 font-bold text-xs">
            <span class="bg-[#e53935] text-white px-2 py-1 rounded">Q</span>
            <span class="bg-[#1565c0] text-white px-2 py-1 rounded">R</span>
            <span class="bg-[#2e7d32] text-white px-2 py-1 rounded">I</span>
            <span class="bg-[#f57c00] text-white px-2 py-1 rounded">S</span>
          </div>
          <div class="text-right">
            <div class="font-extrabold text-base text-[#1a0e0e]">
              {uiConfig.config.boothName}
            </div>
            <div class="text-[10px] text-gray-400">Photobooth</div>
          </div>
        </div>

        <div class="w-full h-px bg-gray-100"></div>

        <div class="text-center">
          <div class="text-[11px] text-gray-400 mb-0.5">Total Pembayaran</div>
          <div class="text-[28px] font-extrabold text-gray-900 tracking-[-0.02em]">
            {fmtPrice(totalPrice)}
          </div>
        </div>

        <!-- Static QR SVG placeholder -->
        <div class="p-3 border-2 border-gray-100 rounded-xl bg-gray-50 flex items-center justify-center">
          <svg width="180" height="180" viewBox="0 0 100 100" fill="none" class="text-gray-900">
            <rect width="100" height="100" fill="white" />
            <!-- Top Left Finder -->
            <rect x="5" y="5" width="25" height="25" fill="black" />
            <rect x="8" y="8" width="19" height="19" fill="white" />
            <rect x="12" y="12" width="11" height="11" fill="black" />
            <!-- Top Right Finder -->
            <rect x="70" y="5" width="25" height="25" fill="black" />
            <rect x="73" y="8" width="19" height="19" fill="white" />
            <rect x="77" y="12" width="11" height="11" fill="black" />
            <!-- Bottom Left Finder -->
            <rect x="5" y="70" width="25" height="25" fill="black" />
            <rect x="8" y="73" width="19" height="19" fill="white" />
            <rect x="12" y="77" width="11" height="11" fill="black" />
            <!-- Dummy data modules -->
            <rect x="35" y="10" width="8" height="8" fill="black" />
            <rect x="45" y="20" width="15" height="8" fill="black" />
            <rect x="35" y="35" width="30" height="30" fill="black" />
            <rect x="40" y="40" width="20" height="20" fill="white" />
            <rect x="45" y="45" width="10" height="10" fill="black" />
            <rect x="70" y="40" width="20" height="10" fill="black" />
            <rect x="75" y="60" width="15" height="25" fill="black" />
            <rect x="40" y="75" width="25" height="15" fill="black" />
          </svg>
        </div>

        <div class="flex items-center gap-1.5 text-[11px] text-gray-400">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>QR berlaku {formatTime(qrSecs)}</span>
        </div>

        <div class="w-full h-px bg-gray-100"></div>

        <div class="flex flex-wrap gap-1.5 justify-center">
          {#each PAYMENT_METHODS as m}
            <span class="text-[9px] font-bold px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
              {m}
            </span>
          {/each}
        </div>
      </div>
    </main>

    <!-- Footer -->
    <footer class="shrink-0 flex flex-col items-center gap-4 px-12 pb-8">
      <!-- TODO: integrasikan ke API pembayaran setelah gap backend selesai -->
      <button
        onclick={simulatePayment}
        disabled={paid}
        class="bg-transparent border border-white/15 text-white/40 px-6 py-2 rounded-full text-xs font-medium cursor-pointer hover:border-white/35 hover:text-white/70 disabled:cursor-default"
      >
        Simulasi Pembayaran Berhasil
      </button>
    </footer>
  </div>
</div>
