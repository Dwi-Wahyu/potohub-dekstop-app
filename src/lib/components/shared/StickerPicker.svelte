<script lang="ts">
  import { EMOJI_LIST, loadBoothEmojis, type StickerType } from '$lib/utils/stickers';
  import type { BoothEmot } from '$lib/api/boothClient';
  import { ensureAsset } from '$lib/utils/offlineCache';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { Trash2, Undo2 } from '@lucide/svelte';

  interface Props {
    onPick: (emoji: string, imageUrl?: string, type?: StickerType) => void;
    accentColor?: string;
    dark?: boolean;
    boothId?: string;
    emots?: BoothEmot[];
    // Tombol hapus muncul hanya jika onClear diberikan dan sudah ada stiker
    onUndo?: () => void;
    onClear?: () => void;
    count?: number;
  }

  let {
    onPick,
    accentColor = '#CD1C33',
    dark = false,
    boothId,
    emots = [],
    onUndo,
    onClear,
    count = 0
  }: Props = $props();

  let fallbackList = $derived(boothId ? loadBoothEmojis(boothId) : EMOJI_LIST);
  let emotDataUrls = $state<Record<string, string>>({});
  const requestedUrls = new Set<string>();

  $effect(() => {
    if (emots && emots.length > 0) {
      for (const emot of emots) {
        if (emot.emot_type === 'image' && emot.file_url && !requestedUrls.has(emot.file_url)) {
          requestedUrls.add(emot.file_url);
          const url = emot.file_url;
          void ensureAsset(url)
            .then((dataUrl) => {
              if (dataUrl) {
                emotDataUrls[url] = dataUrl;
                uiConfig.setResolvedBackground(url, dataUrl);
              }
            })
            .catch(() => {});
        }
      }
    }
  });
</script>

<div>
  {#if onClear && count > 0}
    <div class="flex gap-2 mb-2">
      {#if onUndo}
        <button
          onclick={onUndo}
          class={`flex-1 h-12 flex items-center justify-center gap-2 text-sm font-bold rounded-2xl cursor-pointer transition-all active:scale-95 border-none ${
            dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Undo2 size={18} /> Hapus terakhir
        </button>
      {/if}
      <button
        onclick={onClear}
        class={`flex-1 h-12 flex items-center justify-center gap-2 text-sm font-bold rounded-2xl cursor-pointer transition-all active:scale-95 border-none ${
          dark ? 'bg-red-500/25 text-red-200 hover:bg-red-500/35' : 'bg-red-50 text-red-600 hover:bg-red-100'
        }`}
      >
        <Trash2 size={18} /> Hapus semua ({count})
      </button>
    </div>
  {/if}

  <p class={`text-[9px] font-bold uppercase tracking-[0.3em] mb-2 ${dark ? 'text-white/40' : 'text-gray-400'}`}>
    Tambah Stiker
  </p>
  <div class="flex gap-1.5 flex-wrap max-h-[76px] overflow-y-auto pr-1" style="scrollbar-width: none;">
    {#if emots && emots.length > 0}
      {#each emots as emot}
        <button
          onclick={() => {
            if (emot.emot_type === 'image' && emot.file_url) {
              const urlToUse = emotDataUrls[emot.file_url] || uiConfig.resolveAssetUrl(emot.file_url);
              onPick('', urlToUse, 'image');
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
            <img src={emotDataUrls[emot.file_url] || uiConfig.resolveAssetUrl(emot.file_url)} alt={emot.name} class="w-6 h-6 object-contain pointer-events-none" />
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
