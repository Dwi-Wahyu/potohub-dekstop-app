<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';

  interface Props {
    onSuccess: () => void;
    onBack: () => void;
  }

  let { onSuccess, onBack }: Props = $props();

  let paid = $state(false);
  let timer: any = null;

  function simulatePayment() {
    paid = true;
    setTimeout(() => onSuccess(), 1500);
  }
</script>

<div
  class="w-screen h-screen bg-[#fafafa] flex flex-col select-none relative overflow-hidden"
  style="font-family: 'Playfair Display', Georgia, serif;"
>
  <div class="w-full h-16 flex items-center justify-between px-10 border-b-2 border-black shrink-0 relative z-20 bg-[#C7EED8]">
    <div class="flex items-center gap-2">
      <span class="font-['Nunito',sans-serif] font-black text-xs tracking-widest uppercase">
        {uiConfig.config.boothName} — QRIS Payment
      </span>
    </div>
  </div>

  <div class="relative z-10 flex-1 flex flex-col items-center justify-center p-8 max-w-md mx-auto w-full">
    <div class="border-[3px] border-black rounded-3xl bg-white p-8 w-full flex flex-col items-center gap-6 shadow-[10px_10px_0_0_rgba(0,0,0,1)]">
      <div class="text-center">
        <p class="text-xs font-['Nunito',sans-serif] font-black tracking-[0.25em] text-black/40 uppercase mb-1">
          Scan QRIS
        </p>
        <h3 class="text-2xl font-black uppercase text-black">Rp 35.000</h3>
      </div>

      <div class="border-[2.5px] border-black rounded-2xl p-4 bg-white">
        <svg width="180" height="180" viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" fill="white" />
          <rect x="5" y="5" width="25" height="25" fill="black" />
          <rect x="70" y="5" width="25" height="25" fill="black" />
          <rect x="5" y="70" width="25" height="25" fill="black" />
          <rect x="35" y="35" width="30" height="30" fill="black" />
        </svg>
      </div>

      <!-- TODO: integrasikan ke API pembayaran setelah gap backend selesai -->
      <button
        onclick={simulatePayment}
        disabled={paid}
        class="w-full py-3.5 bg-black text-white font-['Nunito',sans-serif] font-black uppercase tracking-widest rounded-full hover:bg-gray-900 transition-all cursor-pointer border-none"
      >
        {paid ? 'Pembayaran Berhasil! ✓' : 'Simulasi Pembayaran (Local State)'}
      </button>

      <button
        onclick={onBack}
        class="text-xs font-['Nunito',sans-serif] font-bold text-black/50 hover:text-black uppercase tracking-widest bg-transparent border-none cursor-pointer"
      >
        ← Batal / Kembali
      </button>
    </div>
  </div>
</div>
