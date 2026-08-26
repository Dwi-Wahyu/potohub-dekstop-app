<script lang="ts">
  import { EMOJI_LIST, loadBoothEmojis } from '$lib/utils/stickers';

  interface Props {
    onPick: (emoji: string) => void;
    accentColor?: string;
    dark?: boolean;
    boothId?: string;
  }

  let {
    onPick,
    accentColor = '#CD1C33',
    dark = false,
    boothId
  }: Props = $props();

  let list = $derived(boothId ? loadBoothEmojis(boothId) : EMOJI_LIST);
</script>

<div>
  <p class={`text-[9px] font-bold uppercase tracking-[0.3em] mb-2 ${dark ? 'text-white/40' : 'text-gray-400'}`}>
    Tambah Stiker
  </p>
  <div class="flex gap-1.5 flex-wrap max-h-[76px] overflow-y-auto pr-1" style="scrollbar-width: none;">
    {#each list as e}
      <button
        onclick={() => onPick(e)}
        class={`text-xl w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-125 active:scale-110 shrink-0 ${
          dark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-50 hover:bg-gray-100 border border-gray-100'
        }`}
        title={e}
      >
        {e}
      </button>
    {/each}
  </div>
</div>
