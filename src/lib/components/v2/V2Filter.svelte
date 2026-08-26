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
  class="w-screen h-screen bg-[#fafafa] flex flex-col select-none relative overflow-hidden"
  style="font-family: 'Playfair Display', Georgia, serif;"
>
  <div class="w-full h-16 flex items-center justify-between px-10 border-b-2 border-black shrink-0 relative z-20 bg-[#C7EED8]">
    <div class="flex items-center gap-2">
      <span class="font-['Nunito',sans-serif] font-black text-xs tracking-widest uppercase">
        {uiConfig.config.boothName} — Edit & Filter
      </span>
    </div>
  </div>

  <div class="relative z-10 flex-1 flex gap-8 p-10 max-w-6xl mx-auto w-full">
    <!-- Preview -->
    <div class="flex-1 border-[3px] border-black rounded-3xl bg-white p-6 shadow-[8px_8px_0_0_rgba(0,0,0,1)] flex flex-col justify-between">
      <h3 class="text-xl font-black uppercase text-black mb-4">Preview Strips</h3>

      <div class="grid grid-cols-2 gap-3 flex-1 overflow-hidden p-4 bg-gray-100 border-2 border-black rounded-2xl">
        {#each boothFlow.photosTaken as photo, i}
          <div class="overflow-hidden border-2 border-black rounded-xl bg-white">
            <img
              src={photo}
              alt={`Foto ${i + 1}`}
              class="w-full h-full object-cover"
              style="filter: {currentFilterCss === 'none' ? 'none' : currentFilterCss};"
            />
          </div>
        {/each}
      </div>
    </div>

    <!-- Controls -->
    <div class="w-80 border-[3px] border-black rounded-3xl bg-white p-6 flex flex-col justify-between shadow-[8px_8px_0_0_rgba(0,0,0,1)]">
      <div>
        <h4 class="text-lg font-black uppercase text-black mb-4">Pilih Filter</h4>
        <div class="flex flex-col gap-2 mb-6">
          {#each FILTERS as f}
            <button
              onclick={() => {
                selectedFilter = f.id;
                boothFlow.selectedFilterId = f.id;
              }}
              class={`w-full py-3 px-4 rounded-xl border-2 border-black font-['Nunito',sans-serif] font-bold text-sm text-left transition-all cursor-pointer ${
                selectedFilter === f.id ? 'bg-black text-white shadow-[4px_4px_0_0_rgba(0,0,0,0.3)]' : 'bg-white text-black hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          {/each}
        </div>

        <EmojiPicker onPick={() => {}} />
      </div>

      <div class="flex flex-col gap-3 mt-6">
        <button
          onclick={onNext}
          class="w-full py-3.5 bg-black text-white font-['Nunito',sans-serif] font-black uppercase tracking-widest rounded-full hover:bg-gray-900 transition-all cursor-pointer border-none"
        >
          Cetak & Download →
        </button>
        <button
          onclick={onBack}
          class="text-xs font-['Nunito',sans-serif] font-bold text-black/50 hover:text-black uppercase tracking-widest bg-transparent border-none cursor-pointer"
        >
          ← Ulang Foto
        </button>
      </div>
    </div>
  </div>
</div>
