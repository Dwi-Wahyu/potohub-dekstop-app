<script lang="ts">
  import { uiConfig } from '$lib/stores/uiConfig.svelte';

  interface Props {
    onConfirm: () => void;
    onBack: () => void;
  }

  let { onConfirm, onBack }: Props = $props();

  let code = $state('');
  let error = $state(false);

  function verify() {
    if (code.trim().length >= 4) {
      onConfirm();
    } else {
      error = true;
      setTimeout(() => (error = false), 1500);
    }
  }
</script>

<div
  class="w-screen h-screen bg-[#fafafa] flex flex-col select-none relative overflow-hidden"
  style="font-family: 'Playfair Display', Georgia, serif;"
>
  <div class="w-full h-16 flex items-center justify-between px-10 border-b-2 border-black shrink-0 relative z-20 bg-[#C7EED8]">
    <div class="flex items-center gap-2">
      <span class="font-['Nunito',sans-serif] font-black text-xs tracking-widest uppercase">
        {uiConfig.config.boothName} — Ticket Entry
      </span>
    </div>
  </div>

  <div class="relative z-10 flex-1 flex flex-col items-center justify-center p-8 max-w-md mx-auto w-full">
    <div class="border-[3px] border-black rounded-3xl bg-white p-8 w-full flex flex-col items-center gap-6 shadow-[10px_10px_0_0_rgba(0,0,0,1)]">
      <div class="text-center">
        <p class="text-xs font-['Nunito',sans-serif] font-black tracking-[0.25em] text-black/40 uppercase mb-1">
          Input Tiket
        </p>
        <h3 class="text-2xl font-black uppercase text-black">Masukkan Kode</h3>
      </div>

      <input
        type="text"
        bind:value={code}
        onkeydown={(e) => e.key === 'Enter' && verify()}
        placeholder="XXXX-XXXX-XXXX"
        class={`w-full text-center text-xl font-black tracking-[0.25em] border-[2.5px] rounded-2xl px-4 py-3 outline-none transition-colors ${
          error ? 'border-red-500 bg-red-50' : 'border-black bg-white'
        }`}
        style="font-family: 'Courier New', monospace;"
      />

      {#if error}
        <p class="text-xs text-red-500 font-bold tracking-wider font-['Nunito',sans-serif] m-0">
          Kode tidak valid
        </p>
      {/if}

      <button
        onclick={verify}
        class="w-full py-4 bg-black text-white font-['Nunito',sans-serif] font-black tracking-[0.2em] uppercase rounded-full hover:bg-gray-900 transition-all shadow-[6px_6px_0_0_rgba(0,0,0,0.25)] cursor-pointer border-none"
      >
        Verifikasi Tiket ✓
      </button>

      <button
        onclick={onBack}
        class="text-xs font-['Nunito',sans-serif] font-bold text-black/50 hover:text-black uppercase tracking-widest bg-transparent border-none cursor-pointer"
      >
        ← Kembali
      </button>
    </div>
  </div>
</div>
