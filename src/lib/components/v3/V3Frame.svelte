<script lang="ts">
  import { uiConfig } from '$lib/stores/uiConfig.svelte';

  interface Props {
    onSelectFrame: (frameId: string) => void;
    onBack: () => void;
  }

  let { onSelectFrame, onBack }: Props = $props();

  let selectedFrame = $state('frame1');

  const FRAMES = [
    { id: 'frame1', label: 'Classic Strip 4', cols: 1, rows: 4 },
    { id: 'frame2', label: 'Grid 2×2', cols: 2, rows: 2 },
    { id: 'frame3', label: 'Wide 3', cols: 3, rows: 1 },
    { id: 'frame4', label: 'Square 9', cols: 3, rows: 3 }
  ];
</script>

<div
  class="w-screen h-screen bg-[#0a0a0f] text-white flex flex-col justify-between p-12 select-none relative overflow-hidden font-['Inter',sans-serif]"
>
  <div class="w-full flex justify-between items-center relative z-10">
    <span class="font-extrabold text-sm tracking-[0.2em] text-[#FFC107] uppercase">
      {uiConfig.config.boothName} — Select Frame
    </span>
  </div>

  <div class="relative z-10 flex-1 flex flex-col justify-between max-w-5xl mx-auto w-full my-auto py-6">
    <div class="text-center">
      <span class="text-xs font-black uppercase tracking-[0.3em] text-[#FFC107] mb-1 block">
        Frame & Layout
      </span>
      <h2 class="text-3xl font-black uppercase text-white">Pilih Layout Frame</h2>
    </div>

    <div class="grid grid-cols-4 gap-6 my-auto">
      {#each FRAMES as f}
        {@const isSel = selectedFrame === f.id}
        <button
          onclick={() => (selectedFrame = f.id)}
          class={`border rounded-2xl p-6 flex flex-col items-center gap-4 transition-all cursor-pointer ${
            isSel ? 'border-[#FFC107] bg-white/10 scale-105 shadow-[0_0_25px_rgba(255,193,7,0.3)]' : 'border-white/10 bg-white/5 hover:border-white/30'
          }`}
        >
          <div
            class="w-full p-2 bg-black/40 border border-white/20 rounded-xl grid gap-1.5"
            style="grid-template-columns: repeat({f.cols}, 1fr); grid-template-rows: repeat({f.rows}, 1fr); aspect-ratio: {f.cols === 1 ? '2/3' : '1/1'};"
          >
            {#each Array(f.cols * f.rows) as _}
              <div class={`rounded-sm ${isSel ? 'bg-[#FFC107]' : 'bg-white/40'}`}></div>
            {/each}
          </div>

          <div class="text-center">
            <h4 class="text-base font-bold text-white uppercase m-0">{f.label}</h4>
            <span class="text-xs text-white/40">{f.cols * f.rows} foto</span>
          </div>
        </button>
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
        onclick={() => onSelectFrame(selectedFrame)}
        class="px-10 py-3.5 text-sm font-black border-none bg-[#FFC107] text-black rounded-full uppercase tracking-widest hover:bg-yellow-300 transition-all cursor-pointer shadow-[0_0_20px_rgba(255,193,7,0.4)]"
      >
        Mulai Foto Sesi →
      </button>
    </div>
  </div>
</div>
