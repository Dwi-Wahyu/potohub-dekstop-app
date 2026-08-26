<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';

  interface Props {
    onNext: () => void;
    onBack: () => void;
  }

  let { onNext, onBack }: Props = $props();

  let secs = $state(60);
  let timer: any = null;

  onMount(() => {
    timer = setInterval(() => {
      if (secs > 0) secs--;
      else {
        clearInterval(timer);
        onNext();
      }
    }, 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const STEPS = [
    { num: '01', title: 'Pilih Paket', desc: 'Pilih jenis paket foto favoritmu' },
    { num: '02', title: 'Pembayaran', desc: 'Bayar via QRIS atau masukkan tiket' },
    { num: '03', title: 'Pilih Frame', desc: 'Pilih desain & tata letak foto' },
    { num: '04', title: 'Sesi Foto & Filter', desc: 'Pose terbaik lalu pilih filter' }
  ];
</script>

<div
  class="w-screen h-screen bg-[#0a0a0f] text-white flex flex-col justify-between p-12 select-none relative overflow-hidden font-['Inter',sans-serif]"
>
  <div class="w-full flex justify-between items-center relative z-10">
    <span class="font-extrabold text-sm tracking-[0.2em] text-[#FFC107] uppercase">
      {uiConfig.config.boothName} — Tutorial
    </span>
    <span class="text-xs font-bold text-white/50">{secs}s</span>
  </div>

  <div class="relative z-10 flex-1 flex flex-col justify-between max-w-5xl mx-auto w-full my-auto py-8">
    <div class="text-center">
      <span class="text-xs font-black uppercase tracking-[0.3em] text-[#FFC107] mb-2 block">
        Panduan Singkat
      </span>
      <h2 class="text-4xl font-black uppercase text-white">Cara Memulai</h2>
    </div>

    <div class="grid grid-cols-4 gap-6 my-auto">
      {#each STEPS as s}
        <div class="border border-white/10 rounded-2xl bg-white/5 p-6 flex flex-col justify-between backdrop-blur-md hover:border-[#FFC107] transition-colors">
          <span class="text-3xl font-black text-[#FFC107]">{s.num}</span>
          <div class="mt-8">
            <h3 class="text-lg font-bold text-white mb-2">{s.title}</h3>
            <p class="text-xs text-white/50 leading-relaxed m-0">{s.desc}</p>
          </div>
        </div>
      {/each}
    </div>

    <div class="flex justify-between items-center">
      <button
        onclick={onBack}
        class="px-8 py-3 text-xs font-bold border border-white/20 rounded-full uppercase tracking-widest hover:border-white transition-all cursor-pointer bg-transparent text-white"
      >
        ← Kembali
      </button>

      <button
        onclick={onNext}
        class="px-10 py-3.5 text-sm font-black border-none bg-[#FFC107] text-black rounded-full uppercase tracking-widest hover:bg-yellow-300 transition-all cursor-pointer shadow-[0_0_20px_rgba(255,193,7,0.4)]"
      >
        Lanjut →
      </button>
    </div>
  </div>
</div>
