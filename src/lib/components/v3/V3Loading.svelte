<script lang="ts">
  import { onMount } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';

  interface Props {
    onDone: () => void;
  }

  let { onDone }: Props = $props();

  onMount(() => {
    const t = setTimeout(() => {
      onDone();
    }, 3000);
    return () => clearTimeout(t);
  });
</script>

<div
  class="w-screen h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center select-none relative overflow-hidden font-['Inter',sans-serif]"
>
  <div class="flex flex-col items-center gap-6 text-center">
    <div class="w-16 h-16 rounded-full border-4 border-[#FFC107] border-t-transparent animate-spin"></div>
    <div>
      <h2 class="text-2xl font-black uppercase text-white mb-2">Memproses Cetakan Foto</h2>
      <p class="text-sm text-white/40 tracking-wider">Sedang mengirim ke printer DNP DS-RX1HS...</p>
    </div>
  </div>
</div>
