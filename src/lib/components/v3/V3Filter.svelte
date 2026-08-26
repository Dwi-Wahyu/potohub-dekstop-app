<script lang="ts">
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { FILTERS } from '$lib/utils/filters';
  import EmojiPicker from '$lib/components/shared/EmojiPicker.svelte';

  interface Props {
    onNext: () => void;
    onBack: () => void;
  }

  let { onNext, onBack }: Props = $props();

  let selectedFilter = $state('none');
  let currentFilterCss = $derived(FILTERS.find((f) => f.id === selectedFilter)?.css ?? 'none');
</script>

<div
  class="w-screen h-screen bg-[#0a0a0f] text-white flex flex-col justify-between p-12 select-none relative overflow-hidden font-['Inter',sans-serif]"
>
  <div class="w-full flex justify-between items-center relative z-10">
    <span class="font-extrabold text-sm tracking-[0.2em] text-[#FFC107] uppercase">
      {uiConfig.config.boothName} — Filter & Edit
    </span>
  </div>

  <div class="relative z-10 flex-1 flex gap-8 max-w-6xl mx-auto w-full my-auto py-4">
    <!-- Strip preview -->
    <div class="flex-1 border border-white/10 rounded-3xl bg-white/5 p-6 backdrop-blur-xl flex flex-col justify-between">
      <h3 class="text-lg font-bold uppercase text-white mb-4">Preview Strips</h3>

      <div class="grid grid-cols-3 gap-3 flex-1 overflow-hidden p-4 bg-black/40 border border-white/10 rounded-2xl">
        {#each boothFlow.photosTaken as photo, i}
          <div class="overflow-hidden border border-white/20 rounded-xl bg-black">
            <img
              src={photo}
              alt={`Photo ${i + 1}`}
              class="w-full h-full object-cover"
              style="filter: {currentFilterCss === 'none' ? 'none' : currentFilterCss};"
            />
          </div>
        {/each}
      </div>
    </div>

    <!-- Controls -->
    <div class="w-80 border border-white/10 rounded-3xl bg-white/5 p-6 flex flex-col justify-between backdrop-blur-xl">
      <div>
        <h4 class="text-base font-bold uppercase text-white mb-4">Efek Filter</h4>
        <div class="flex flex-col gap-2 mb-6">
          {#each FILTERS as f}
            <button
              onclick={() => {
                selectedFilter = f.id;
                boothFlow.selectedFilterId = f.id;
              }}
              class={`w-full py-3 px-4 rounded-xl border text-left font-bold text-xs transition-all cursor-pointer ${
                selectedFilter === f.id
                  ? 'bg-[#FFC107] text-black border-[#FFC107] shadow-[0_0_15px_rgba(255,193,7,0.4)]'
                  : 'bg-white/5 text-white border-white/10 hover:bg-white/10'
              }`}
            >
              {f.label}
            </button>
          {/each}
        </div>

        <EmojiPicker onPick={() => {}} dark />
      </div>

      <div class="flex flex-col gap-3 mt-4">
        <button
          onclick={onNext}
          class="w-full py-3.5 bg-[#FFC107] text-black font-black uppercase tracking-widest rounded-full hover:bg-yellow-300 transition-all cursor-pointer border-none"
        >
          Proses Cetak →
        </button>
        <button
          onclick={onBack}
          class="text-xs font-bold text-white/40 hover:text-white uppercase tracking-widest bg-transparent border-none cursor-pointer"
        >
          ← Retake Foto
        </button>
      </div>
    </div>
  </div>
</div>
