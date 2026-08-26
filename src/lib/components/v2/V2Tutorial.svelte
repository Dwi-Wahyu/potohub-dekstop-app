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
    { num: '01', title: 'Pilih Metode', desc: 'Gunakan tiket atau pembayaran cashless' },
    { num: '02', title: 'Pilih Frame', desc: 'Pilih layout foto yang kamu suka' },
    { num: '03', title: 'Foto Sesi', desc: 'Pose terbaik dalam beberapa kali jepretan' },
    { num: '04', title: 'Filter & Cetak', desc: 'Tambah filter dan stiker lalu cetak' }
  ];
</script>

<div
  class="w-screen h-screen bg-[#fafafa] flex flex-col select-none relative overflow-hidden"
  style="font-family: 'Playfair Display', Georgia, serif;"
>
  <!-- Header -->
  <div class="w-full h-16 flex items-center justify-between px-10 border-b-2 border-black shrink-0 relative z-20 bg-[#C7EED8]">
    <div class="flex items-center gap-2">
      <span class="font-['Nunito',sans-serif] font-black text-xs tracking-widest uppercase">
        {uiConfig.config.boothName} — Tutorial
      </span>
    </div>
    <div class="text-xs font-['Nunito',sans-serif] font-black tracking-widest">
      {secs}s
    </div>
  </div>

  <!-- Content -->
  <div class="relative z-10 flex-1 flex flex-col justify-between p-12 max-w-5xl mx-auto w-full">
    <div class="text-center mt-4">
      <p class="text-xs font-['Nunito',sans-serif] font-black tracking-[0.3em] uppercase text-black/40 mb-2">
        Panduan Penggunaan
      </p>
      <h2 class="text-4xl font-black uppercase tracking-tight text-black">
        Cara Menggunakan Photobooth
      </h2>
    </div>

    <div class="grid grid-cols-4 gap-6 my-auto">
      {#each STEPS as s}
        <div class="border-[2.5px] border-black rounded-2xl bg-white p-6 flex flex-col justify-between shadow-[6px_6px_0_0_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 transition-all">
          <span class="text-3xl font-black font-['Nunito',sans-serif] text-black/20">{s.num}</span>
          <div class="mt-8">
            <h3 class="text-lg font-bold text-black mb-2">{s.title}</h3>
            <p class="text-xs text-black/60 font-['Nunito',sans-serif] font-semibold leading-relaxed m-0">
              {s.desc}
            </p>
          </div>
        </div>
      {/each}
    </div>

    <div class="flex justify-between items-center mt-4">
      <button
        onclick={onBack}
        class="px-8 py-3 text-xs font-['Nunito',sans-serif] font-black border-2 border-black rounded-full uppercase tracking-widest hover:bg-black hover:text-white transition-all cursor-pointer bg-transparent"
      >
        ← Kembali
      </button>

      <button
        onclick={onNext}
        class="px-10 py-3.5 text-sm font-['Nunito',sans-serif] font-black border-2 border-black bg-black text-white rounded-full uppercase tracking-widest shadow-[4px_4px_0_0_rgba(0,0,0,0.3)] hover:shadow-none transition-all cursor-pointer"
      >
        Lanjut →
      </button>
    </div>
  </div>
</div>
