<script lang="ts">
  import { EMOJI_LIST, loadBoothEmojis, type StickerType } from '$lib/utils/stickers';
  import type { BoothEmot } from '$lib/api/boothClient';

  interface Props {
    onPick: (emoji: string, imageUrl?: string, type?: StickerType) => void;
    accentColor?: string;
    dark?: boolean;
    boothId?: string;
    emots?: BoothEmot[];
  }

  let {
    onPick,
    accentColor = '#CD1C33',
    dark = false,
    boothId,
    emots = []
  }: Props = $props();

  let fallbackList = $derived(boothId ? loadBoothEmojis(boothId) : EMOJI_LIST);
</script>

<div>
  <p class={`text-[9px] font-bold uppercase tracking-[0.3em] mb-2 ${dark ? 'text-white/40' : 'text-gray-400'}`}>
    Tambah Stiker
  </p>
  <div class="flex gap-1.5 flex-wrap max-h-[76px] overflow-y-auto pr-1" style="scrollbar-width: none;">
    {#if emots && emots.length > 0}
      {#each emots as emot}
        <button
          onclick={() => {
            if (emot.emot_type === 'image' && emot.file_url) {
              onPick('', emot.file_url, 'image');
            } else {
              onPick(emot.emoji_text || '😊', '', 'emoji');
            }
          }}
          class={`w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-125 active:scale-110 shrink-0 border cursor-pointer ${
            dark ? 'bg-white/10 hover:bg-white/20 border-white/10' : 'bg-gray-50 hover:bg-gray-100 border-gray-100'
          }`}
          title={emot.name}
        >
          {#if emot.emot_type === 'image' && emot.file_url}
            <img src={emot.file_url} alt={emot.name} class="w-6 h-6 object-contain pointer-events-none" />
          {:else}
            <span class="text-xl">{emot.emoji_text || '😊'}</span>
          {/if}
        </button>
      {/each}
    {:else}
      {#each fallbackList as e}
        <button
          onclick={() => onPick(e, '', 'emoji')}
          class={`text-xl w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-125 active:scale-110 shrink-0 border cursor-pointer ${
            dark ? 'bg-white/10 hover:bg-white/20 border-white/10' : 'bg-gray-50 hover:bg-gray-100 border-gray-100'
          }`}
          title={e}
        >
          {e}
        </button>
      {/each}
    {/if}
  </div>
</div>
