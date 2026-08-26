<script lang="ts">
  import { uiConfig } from '$lib/stores/uiConfig.svelte';

  interface Props {
    onSelect: (method: 'ticket' | 'cashless') => void;
    onBack: () => void;
  }

  let { onSelect, onBack }: Props = $props();
</script>

<div
  class="w-screen h-screen bg-[#fafafa] flex flex-col select-none relative overflow-hidden"
  style="font-family: 'Playfair Display', Georgia, serif;"
>
  <div class="w-full h-16 flex items-center justify-between px-10 border-b-2 border-black shrink-0 relative z-20 bg-[#C7EED8]">
    <div class="flex items-center gap-2">
      <span class="font-['Nunito',sans-serif] font-black text-xs tracking-widest uppercase">
        {uiConfig.config.boothName} — Payment Method
      </span>
    </div>
  </div>

  <div class="relative z-10 flex-1 flex flex-col justify-between p-12 max-w-4xl mx-auto w-full">
    <div class="text-center mt-4">
      <p class="text-xs font-['Nunito',sans-serif] font-black tracking-[0.3em] uppercase text-black/40 mb-2">
        Metode Pembayaran
      </p>
      <h2 class="text-4xl font-black uppercase tracking-tight text-black">
        Pilih Cara Pembayaran
      </h2>
    </div>

    <div class="grid grid-cols-2 gap-8 my-auto">
      <!-- Ticket -->
      <button
        onclick={() => onSelect('ticket')}
        class="border-[3px] border-black rounded-3xl bg-white p-8 flex flex-col items-center text-center gap-4 shadow-[8px_8px_0_0_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-all cursor-pointer"
      >
        <div class="w-16 h-16 rounded-2xl bg-black/5 border-2 border-black flex items-center justify-center font-bold text-2xl">
          🎟️
        </div>
        <div>
          <h3 class="text-2xl font-black uppercase text-black mb-1">Kode Tiket</h3>
          <p class="text-xs text-black/50 font-['Nunito',sans-serif] font-bold tracking-wide m-0">
            Masukkan voucher / tiket dari kasir
          </p>
        </div>
      </button>

      <!-- Cashless -->
      <button
        onclick={() => onSelect('cashless')}
        class="border-[3px] border-black rounded-3xl bg-white p-8 flex flex-col items-center text-center gap-4 shadow-[8px_8px_0_0_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-all cursor-pointer"
      >
        <div class="w-16 h-16 rounded-2xl bg-black/5 border-2 border-black flex items-center justify-center font-bold text-2xl">
          💳
        </div>
        <div>
          <h3 class="text-2xl font-black uppercase text-black mb-1">QRIS Cashless</h3>
          <p class="text-xs text-black/50 font-['Nunito',sans-serif] font-bold tracking-wide m-0">
            Bayar via QRIS (GoPay, OVO, ShopeePay, dll)
          </p>
        </div>
      </button>
    </div>

    <div class="flex justify-start">
      <button
        onclick={onBack}
        class="px-8 py-3 text-xs font-['Nunito',sans-serif] font-black border-2 border-black rounded-full uppercase tracking-widest hover:bg-black hover:text-white transition-all cursor-pointer bg-transparent"
      >
        ← Kembali
      </button>
    </div>
  </div>
</div>
