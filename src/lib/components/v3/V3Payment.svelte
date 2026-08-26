<script lang="ts">
  import { uiConfig, type StoreCategory } from '$lib/stores/uiConfig.svelte';

  interface Props {
    selectedPackage: StoreCategory | null;
    onSelectMethod: (method: 'ticket' | 'cashless') => void;
    onBack: () => void;
  }

  let { selectedPackage, onSelectMethod, onBack }: Props = $props();

  let paid = $state(false);

  function simulateQris() {
    paid = true;
    setTimeout(() => onSelectMethod('cashless'), 1500);
  }

  const fmtPrice = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
</script>

<div
  class="w-screen h-screen bg-[#0a0a0f] text-white flex flex-col justify-between p-12 select-none relative overflow-hidden font-['Inter',sans-serif]"
>
  <div class="w-full flex justify-between items-center relative z-10">
    <span class="font-extrabold text-sm tracking-[0.2em] text-[#FFC107] uppercase">
      {uiConfig.config.boothName} — Payment
    </span>
  </div>

  <div class="relative z-10 flex-1 flex flex-col items-center justify-center max-w-xl mx-auto w-full my-auto">
    <div class="border border-white/10 rounded-3xl bg-white/5 p-8 w-full flex flex-col items-center gap-6 backdrop-blur-xl">
      <div class="text-center">
        <span class="text-xs font-black uppercase tracking-[0.3em] text-[#FFC107] mb-1 block">
          Pembayaran QRIS
        </span>
        <h2 class="text-3xl font-black uppercase text-white">
          {selectedPackage ? fmtPrice(selectedPackage.basePrice) : 'Rp 35.000'}
        </h2>
      </div>

      <div class="p-4 bg-white rounded-2xl border border-white/20">
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
        onclick={simulateQris}
        disabled={paid}
        class="w-full py-4 bg-[#FFC107] text-black font-black uppercase tracking-widest rounded-full hover:bg-yellow-300 transition-all cursor-pointer border-none shadow-[0_0_20px_rgba(255,193,7,0.4)]"
      >
        {paid ? 'Pembayaran Berhasil! ✓' : 'Simulasi Pembayaran (Local State)'}
      </button>

      <div class="flex items-center gap-4 w-full">
        <div class="h-px bg-white/10 flex-1"></div>
        <span class="text-xs text-white/40 uppercase font-bold">atau</span>
        <div class="h-px bg-white/10 flex-1"></div>
      </div>

      <button
        onclick={() => onSelectMethod('ticket')}
        class="w-full py-3 bg-white/10 text-white font-bold uppercase text-xs tracking-widest rounded-full hover:bg-white/20 transition-all cursor-pointer border border-white/10"
      >
        Gunakan Kode Tiket →
      </button>

      <button
        onclick={onBack}
        class="text-xs font-bold text-white/40 hover:text-white uppercase tracking-widest bg-transparent border-none cursor-pointer mt-2"
      >
        ← Batal / Kembali
      </button>
    </div>
  </div>
</div>
