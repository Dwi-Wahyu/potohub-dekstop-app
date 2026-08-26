<script lang="ts">
  import { uiConfig } from '$lib/stores/uiConfig.svelte';

  interface Props {
    onSelectFrame: (frameId: string) => void;
    onBack: () => void;
  }

  let { onSelectFrame, onBack }: Props = $props();

  let selectedFrame = $state('strip-2x4');

  const FRAMES = [
    { id: 'strip-2x4', label: 'Strip 2×4', cols: 2, rows: 4 },
    { id: 'grid-2x2', label: 'Grid 2×2', cols: 2, rows: 2 },
    { id: 'wide-1x3', label: 'Wide 1×3', cols: 1, rows: 3 },
    { id: 'classic-4', label: 'Classic ×4', cols: 2, rows: 2 },
    { id: 'square-9', label: 'Square ×9', cols: 3, rows: 3 },
    { id: 'panorama', label: 'Panorama', cols: 1, rows: 2 }
  ];
</script>

<div
  class="w-screen h-screen bg-[#fafafa] flex flex-col select-none relative overflow-hidden"
  style="font-family: 'Playfair Display', Georgia, serif;"
>
  <div class="w-full h-16 flex items-center justify-between px-10 border-b-2 border-black shrink-0 relative z-20 bg-[#C7EED8]">
    <div class="flex items-center gap-2">
      <span class="font-['Nunito',sans-serif] font-black text-xs tracking-widest uppercase">
        {uiConfig.config.boothName} — Select Frame
      </span>
    </div>
  </div>

  <div class="relative z-10 flex-1 flex flex-col justify-between p-12 max-w-5xl mx-auto w-full">
    <div class="text-center mt-2">
      <p class="text-xs font-['Nunito',sans-serif] font-black tracking-[0.3em] uppercase text-black/40 mb-1">
        Layout Foto
      </p>
      <h2 class="text-3xl font-black uppercase tracking-tight text-black">
        Pilih Desain Frame
      </h2>
    </div>

    <div class="grid grid-cols-3 gap-6 my-auto">
      {#each FRAMES as f}
        {@const isSel = selectedFrame === f.id}
        <button
          onclick={() => (selectedFrame = f.id)}
          class={`border-[3px] border-black rounded-2xl bg-white p-6 flex flex-col items-center gap-4 transition-all cursor-pointer ${
            isSel ? 'shadow-[8px_8px_0_0_rgba(0,0,0,1)] bg-gray-50' : 'shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5'
          }`}
        >
          <div
            class="w-full p-2 bg-[#f0f0f0] border-2 border-black rounded-lg grid gap-1"
            style="grid-template-columns: repeat({f.cols}, 1fr); grid-template-rows: repeat({f.rows}, 1fr); aspect-ratio: {f.cols === 1 ? '2/3' : '1/1'};"
          >
            {#each Array(f.cols * f.rows) as _}
              <div class={`border border-black rounded-sm ${isSel ? 'bg-black' : 'bg-white'}`}></div>
            {/each}
          </div>

          <div class="text-center">
            <h4 class="text-lg font-black uppercase text-black m-0">{f.label}</h4>
            <span class="text-xs text-black/50 font-['Nunito',sans-serif] font-bold">
              {f.cols * f.rows} foto
            </span>
          </div>
        </button>
      {/each}
    </div>

    <div class="flex justify-between items-center mt-2">
      <button
        onclick={onBack}
        class="px-8 py-3 text-xs font-['Nunito',sans-serif] font-black border-2 border-black rounded-full uppercase tracking-widest hover:bg-black hover:text-white transition-all cursor-pointer bg-transparent"
      >
        ← Kembali
      </button>

      <button
        onclick={() => onSelectFrame(selectedFrame)}
        class="px-10 py-3.5 text-sm font-['Nunito',sans-serif] font-black border-2 border-black bg-black text-white rounded-full uppercase tracking-widest shadow-[4px_4px_0_0_rgba(0,0,0,0.3)] cursor-pointer"
      >
        Mulai Foto Sesi →
      </button>
    </div>
  </div>
</div>
