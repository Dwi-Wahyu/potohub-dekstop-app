<script lang="ts">
  import { uiConfig, type StoreCategory } from '$lib/stores/uiConfig.svelte';

  interface Props {
    onSelectPackage: (pkg: StoreCategory) => void;
    onBack: () => void;
  }

  let { onSelectPackage, onBack }: Props = $props();

  const fmtPrice = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
</script>

<div
  class="w-screen h-screen bg-[#0a0a0f] text-white flex flex-col justify-between p-12 select-none relative overflow-hidden font-['Inter',sans-serif]"
>
  <div class="w-full flex justify-between items-center relative z-10">
    <span class="font-extrabold text-sm tracking-[0.2em] text-[#FFC107] uppercase">
      {uiConfig.config.boothName} — Select Package
    </span>
  </div>

  <div class="relative z-10 flex-1 flex flex-col justify-between max-w-5xl mx-auto w-full my-auto py-6">
    <div class="text-center">
      <span class="text-xs font-black uppercase tracking-[0.3em] text-[#FFC107] mb-1 block">
        Pilih Paket
      </span>
      <h2 class="text-3xl font-black uppercase text-white">Paket Photobooth</h2>
    </div>

    <div class="grid grid-cols-4 gap-6 my-auto">
      {#each uiConfig.config.categories as cat}
        <button
          onclick={() => onSelectPackage(cat)}
          class="border border-white/10 rounded-2xl bg-white/5 p-6 flex flex-col justify-between text-left hover:border-[#FFC107] hover:scale-105 transition-all cursor-pointer"
        >
          <div>
            <span class="w-3 h-3 rounded-full block mb-4" style="background: {cat.color};"></span>
            <h3 class="text-xl font-black text-white uppercase mb-1">{cat.name}</h3>
            <p class="text-xs text-white/40 m-0">Print tambahan: {fmtPrice(cat.extraPrintPrice)}</p>
          </div>

          <div class="mt-8 pt-4 border-t border-white/10">
            <span class="text-2xl font-black text-[#FFC107]">{fmtPrice(cat.basePrice)}</span>
          </div>
        </button>
      {/each}
    </div>

    <div class="flex justify-start">
      <button
        onclick={onBack}
        class="px-8 py-3 text-xs font-bold border border-white/20 rounded-full uppercase tracking-widest hover:border-white transition-all cursor-pointer bg-transparent text-white"
      >
        ← Kembali
      </button>
    </div>
  </div>
</div>
