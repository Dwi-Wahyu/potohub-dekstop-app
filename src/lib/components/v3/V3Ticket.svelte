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
  class="w-screen h-screen bg-[#0a0a0f] text-white flex flex-col justify-between p-12 select-none relative overflow-hidden font-['Inter',sans-serif]"
>
  <div class="w-full flex justify-between items-center relative z-10">
    <span class="font-extrabold text-sm tracking-[0.2em] text-[#FFC107] uppercase">
      {uiConfig.config.boothName} — Ticket Verification
    </span>
  </div>

  <div class="relative z-10 flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full my-auto">
    <div class="border border-white/10 rounded-3xl bg-white/5 p-8 w-full flex flex-col items-center gap-6 backdrop-blur-xl">
      <div class="text-center">
        <span class="text-xs font-black uppercase tracking-[0.3em] text-[#FFC107] mb-1 block">
          Verifikasi Tiket
        </span>
        <h2 class="text-2xl font-black uppercase text-white">Masukkan Kode</h2>
      </div>

      <input
        type="text"
        bind:value={code}
        onkeydown={(e) => e.key === 'Enter' && verify()}
        placeholder="XXXX-XXXX-XXXX"
        class={`w-full text-center text-lg font-black tracking-[0.2em] rounded-xl px-4 py-3 outline-none border-2 transition-colors bg-white/10 text-white placeholder-white/20 ${
          error ? 'border-red-400' : 'border-white/20 focus:border-[#FFC107]'
        }`}
        style="font-family: 'Space Mono', monospace;"
      />

      {#if error}
        <p class="text-xs text-red-400 text-center tracking-wider m-0">Kode tidak valid</p>
      {/if}

      <button
        onclick={verify}
        class="w-full py-3.5 bg-[#FFC107] text-black font-black tracking-[0.2em] uppercase rounded-full hover:bg-yellow-300 transition-colors shadow-lg text-sm cursor-pointer border-none"
      >
        Verifikasi Tiket ✓
      </button>

      <button
        onclick={onBack}
        class="text-xs font-bold text-white/40 hover:text-white uppercase tracking-widest bg-transparent border-none cursor-pointer mt-2"
      >
        ← Kembali
      </button>
    </div>
  </div>
</div>
