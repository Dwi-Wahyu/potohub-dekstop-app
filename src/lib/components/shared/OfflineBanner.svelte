<script lang="ts">
  import { networkStatus } from '$lib/stores/networkStatus.svelte';
  interface Props { message?: string }
  let { message = 'Sedang offline — hanya pembayaran Tiket yang tersedia.' }: Props = $props();
</script>

{#if !networkStatus.isOnline}
  <div class="px-4 py-2 rounded-full bg-amber-500/90 text-black text-xs font-bold flex items-center gap-2 shadow-lg">
    <span class="w-2 h-2 rounded-full bg-black/70 animate-pulse"></span>
    {message}
  </div>
{/if}
