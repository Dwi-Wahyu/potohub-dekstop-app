<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { formatTime } from '$lib/utils/shared';

  interface Props {
    onNext: () => void;
    onBack: () => void;
    background?: string;
    customTutorialImg?: string;
  }

  let { onNext, onBack, background, customTutorialImg }: Props = $props();

  let secs = $state(60);
  let timer: any = null;

  onMount(() => {
    timer = setInterval(() => {
      if (secs > 0) {
        secs--;
      } else {
        clearInterval(timer);
        onNext();
      }
    }, 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const EL = '#cbb8b3';
  const DEFAULT_BG = 'linear-gradient(135deg, #1e1b4b 0%, #2a2873 50%, #312e81 100%)';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('tutorial').background ?? DEFAULT_BG);

  function getLocalTutorialImage(boothId: string): string {
    try {
      const direct =
        localStorage.getItem(`potohub.ui-customize-local.${boothId}`) ||
        localStorage.getItem(`potohub.ui-customize-local.default`);

      if (direct) {
        const parsed = JSON.parse(direct);
        if (parsed?.tutorialImageUrl) return parsed.tutorialImageUrl;
      }
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('potohub.ui-customize-local.')) {
          const item = localStorage.getItem(key);
          if (item) {
            const parsed = JSON.parse(item);
            if (parsed?.tutorialImageUrl) return parsed.tutorialImageUrl;
          }
        }
      }
    } catch {}
    return '';
  }

  let tutorialImg = $derived(
    customTutorialImg ||
      uiConfig.config.tutorialImageUrl ||
      getLocalTutorialImage(uiConfig.boothId)
  );
</script>

<div
  class="w-full h-full overflow-hidden flex flex-col px-[52px] py-10 gap-5 font-['Plus_Jakarta_Sans',sans-serif] text-[#e6e1e5] relative"
  style:background={effectiveBg}
>
  <!-- Watermark Dinamis -->
  <!-- <div
    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[clamp(160px,28vw,380px)] font-black text-white/[0.028] select-none pointer-events-none leading-none whitespace-nowrap z-0"
  >
    {uiConfig.config.boothName}
  </div> -->

  <!-- Header -->
  <header class="flex justify-between items-center shrink-0 relative z-10">
   <button
      onclick={onBack}
      class="flex items-center gap-1.5 border border-white/10 text-white/30 px-5 py-[9px] rounded-full bg-transparent cursor-pointer font-['Plus_Jakarta_Sans',sans-serif] text-sm font-medium transition-colors duration-150 hover:text-white/60 hover:border-white/20"
    >
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path d="M15.75 19.5L8.25 12l7.5-7.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      Kembali
    </button>

    <h1 class="m-0 text-4xl font-bold tracking-wider bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
      {uiConfig.getElementLabel('tutorial', 'instruction_text', 'Tutorial')}
    </h1>

    <div class="flex items-center gap-2 bg-white/95 text-[#0f0e14] px-[22px] py-[11px] rounded-full font-bold text-xl shadow-[0_6px_24px_rgba(0,0,0,0.4)]">
      <svg width="22" height="22" fill="none" stroke={uiConfig.config.primaryColor} stroke-width="2.5" viewBox="0 0 24 24">
        <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="tabular-nums">{formatTime(secs)}</span>
    </div>
  </header>

  <!-- Steps grid / Custom Tutorial Image -->
  <main class="flex-grow min-h-0 flex items-center justify-center relative z-10">
    {#if tutorialImg}
      <div class="w-full h-full flex items-center justify-center overflow-hidden p-2">
        <img
          src={tutorialImg}
          alt="Tutorial Penggunaan"
          class="max-w-full max-h-full object-contain"
        />
      </div>
    {:else}
      <div class="relative w-full">
      <!-- Flow connectors -->
      <div class="absolute top-[25%] left-[10%] right-[10%] h-1 rounded-sm z-0" style="background-color: {uiConfig.config.primaryColor}33;"></div>
      <div class="absolute top-[75%] left-[10%] right-[10%] h-1 rounded-sm z-0" style="background-color: {uiConfig.config.primaryColor}33;"></div>
      <div class="absolute top-[25%] bottom-[25%] right-[10%] w-1 rounded-sm z-0" style="background-color: {uiConfig.config.primaryColor}33;"></div>

      <div class="grid grid-cols-4 auto-rows-fr gap-6">
        <!-- Step 1 -->
        <article class="group bg-[#111117] rounded-[22px] overflow-hidden border border-white/5 flex flex-col relative z-10 shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] transition-transform duration-200 hover:scale-[1.04]">
          <div class="bg-[#0a0910] px-4 py-[13px] flex items-center gap-2.5 border-b border-white/5 shrink-0">
            <span class="w-[22px] h-[22px] rounded-full bg-white text-black flex items-center justify-center text-[11px] font-bold shrink-0">1</span>
            <h2 class="m-0 text-xs font-semibold text-white overflow-hidden text-ellipsis whitespace-nowrap">Pilih Kategori</h2>
          </div>
          <div class="bg-[#e5d5cf] p-5 flex-grow flex items-center justify-center">
            <div class="flex gap-2.5 w-full h-full">
              <div class="grid grid-cols-2 grid-rows-3 gap-1.5 flex-1">
                {#each Array(6) as _, i}
                  <div class="bg-[#cbb8b3] rounded-md"></div>
                {/each}
              </div>
              <div class="grid grid-cols-2 grid-rows-[auto_1fr_1fr] gap-1.5 flex-1">
                <div class="bg-[#cbb8b3] rounded-md col-span-2 h-9"></div>
                <div class="bg-[#cbb8b3] rounded-md"></div>
                <div class="bg-[#cbb8b3] rounded-md"></div>
              </div>
            </div>
          </div>
        </article>

        <!-- Step 2 -->
        <article class="group bg-[#111117] rounded-[22px] overflow-hidden border border-white/5 flex flex-col relative z-10 shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] transition-transform duration-200 hover:scale-[1.04]">
          <div class="bg-[#0a0910] px-4 py-[13px] flex items-center gap-2.5 border-b border-white/5 shrink-0">
            <span class="w-[22px] h-[22px] rounded-full bg-white text-black flex items-center justify-center text-[11px] font-bold shrink-0">2</span>
            <h2 class="m-0 text-xs font-semibold text-white overflow-hidden text-ellipsis whitespace-nowrap">
              {boothConfig.config.paymentPage ? 'Pilih Metode' : 'Metode (Dinonaktifkan)'}
            </h2>
          </div>
          <div class="bg-[#e5d5cf] p-5 flex-grow flex items-center justify-center">
            {#if boothConfig.config.paymentPage}
              <div class="flex justify-center items-center gap-2.5 w-full">
                {#each [true, false, false] as sel, i}
                  <div class={`w-[30%] aspect-square bg-[#cbb8b3] rounded-xl relative ${sel ? 'border-[3px] border-[#a8938d]' : ''}`}>
                    <div class="absolute bottom-2 left-1/2 -translate-x-1/2 w-[70%] h-1 bg-[#a8938d] rounded-full"></div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="opacity-50 font-bold text-gray-700">Non-Aktif</div>
            {/if}
          </div>
        </article>

        <!-- Step 3 -->
        <article class="group bg-[#111117] rounded-[22px] overflow-hidden border border-white/5 flex flex-col relative z-10 shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] transition-transform duration-200 hover:scale-[1.04]">
          <div class="bg-[#0a0910] px-4 py-[13px] flex items-center gap-2.5 border-b border-white/5 shrink-0">
            <span class="w-[22px] h-[22px] rounded-full bg-white text-black flex items-center justify-center text-[11px] font-bold shrink-0">3</span>
            <h2 class="m-0 text-xs font-semibold text-white overflow-hidden text-ellipsis whitespace-nowrap">Atur Jumlah Print</h2>
          </div>
          <div class="bg-[#e5d5cf] p-5 flex-grow flex items-center justify-center">
            <div class="w-full border-2 border-[#cbb8b3] rounded-xl flex items-center px-3 py-2.5 gap-3">
              <div class="w-[52px] h-[52px] bg-[#cbb8b3] rounded-lg shrink-0"></div>
              <div class="flex-grow flex flex-col gap-2">
                <div class="h-2.5 w-1/2 bg-[#cbb8b3] rounded-full"></div>
                <div class="h-2 w-[70%] bg-[#cbb8b3] rounded-full opacity-60"></div>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-[22px] h-[22px] rounded-full border-2 border-[#cbb8b3] flex items-center justify-center">
                  <div class="w-2.5 h-[2px] bg-[#cbb8b3]"></div>
                </div>
                <span class="text-[#8c7873] font-bold text-[13px]">1</span>
                <div class="w-[22px] h-[22px] rounded-full border-2 border-[#cbb8b3] flex items-center justify-center relative">
                  <div class="w-2.5 h-[2px] bg-[#cbb8b3] absolute"></div>
                  <div class="w-[2px] h-2.5 bg-[#cbb8b3] absolute"></div>
                </div>
              </div>
            </div>
          </div>
        </article>

        <!-- Step 4 -->
        <article class="group bg-[#111117] rounded-[22px] overflow-hidden border border-white/5 flex flex-col relative z-10 shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] transition-transform duration-200 hover:scale-[1.04]">
          <div class="bg-[#0a0910] px-4 py-[13px] flex items-center gap-2.5 border-b border-white/5 shrink-0">
            <span class="w-[22px] h-[22px] rounded-full bg-white text-black flex items-center justify-center text-[11px] font-bold shrink-0">4</span>
            <h2 class="m-0 text-xs font-semibold text-white overflow-hidden text-ellipsis whitespace-nowrap">
              {boothConfig.config.paymentPage ? 'Pembayaran' : 'Pembayaran (Gratis)'}
            </h2>
          </div>
          <div class="bg-[#e5d5cf] p-5 flex-grow flex items-center justify-center">
            {#if boothConfig.config.paymentPage}
              <div class="w-[88px] h-[88px] border-[3px] border-[#cbb8b3] rounded-2xl flex items-center justify-center relative bg-white/50">
                <div class="w-[44px] h-[44px] bg-[#cbb8b3] opacity-50 rounded"></div>
                <div class="absolute w-3 h-3 border-2 border-[#cbb8b3] top-1.5 left-1.5"></div>
                <div class="absolute w-3 h-3 border-2 border-[#cbb8b3] top-1.5 right-1.5"></div>
                <div class="absolute w-3 h-3 border-2 border-[#cbb8b3] bottom-1.5 left-1.5"></div>
              </div>
            {:else}
              <div class="opacity-50 font-bold text-gray-700">Gratis</div>
            {/if}
          </div>
        </article>

        <!-- Step 8 -->
        <article class="group bg-[#111117] rounded-[22px] overflow-hidden border border-white/5 flex flex-col relative z-10 shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] transition-transform duration-200 hover:scale-[1.04] order-8">
          <div class="bg-[#0a0910] px-4 py-[13px] flex items-center gap-2.5 border-b border-white/5 shrink-0">
            <span class="w-[22px] h-[22px] rounded-full bg-white text-black flex items-center justify-center text-[11px] font-bold shrink-0">8</span>
            <h2 class="m-0 text-xs font-semibold text-white overflow-hidden text-ellipsis whitespace-nowrap">Print & Download Softfile</h2>
          </div>
          <div class="bg-[#e5d5cf] p-5 flex-grow flex items-center justify-center">
            <div class="flex items-center justify-center gap-4 w-full">
              <div class="w-[52px] h-[76px] bg-[#cbb8b3] rounded-md grid grid-cols-2 grid-rows-3 gap-1 p-1">
                {#each Array(6) as _, i}
                  <div class="bg-[#dcd0cd] rounded-sm"></div>
                {/each}
              </div>
              <div class="flex flex-col items-center gap-2">
                <div class="w-14 h-14 border-2 border-[#cbb8b3] rounded-xl flex items-center justify-center">
                  <div class="w-7 h-7 bg-[#cbb8b3] opacity-50 rounded"></div>
                </div>
                <div class="w-11 h-1.5 bg-[#cbb8b3] rounded-full"></div>
              </div>
            </div>
          </div>
        </article>

        <!-- Step 7 -->
        <article class="group bg-[#111117] rounded-[22px] overflow-hidden border border-white/5 flex flex-col relative z-10 shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] transition-transform duration-200 hover:scale-[1.04] order-7">
          <div class="bg-[#0a0910] px-4 py-[13px] flex items-center gap-2.5 border-b border-white/5 shrink-0">
            <span class="w-[22px] h-[22px] rounded-full bg-white text-black flex items-center justify-center text-[11px] font-bold shrink-0">7</span>
            <h2 class="m-0 text-xs font-semibold text-white overflow-hidden text-ellipsis whitespace-nowrap">
              {boothConfig.config.photoFilter ? 'Pilih Filter' : 'Filter (Dinonaktifkan)'}
            </h2>
          </div>
          <div class="bg-[#e5d5cf] p-5 flex-grow flex items-center justify-center">
            {#if boothConfig.config.photoFilter}
              <div class="flex items-center w-full h-full gap-2">
                <div class="flex-1 flex items-end justify-center h-full">
                  <svg width="70" height="84" viewBox="0 0 100 120" fill="none">
                    <ellipse cx="50" cy="25" rx="25" ry="25" fill="#a8938d" class="opacity-60" />
                    <path d="M10.5 120H89.5C95.3 120 100 115.3 100 109.5V100C100 72.4 77.6 50 50 50C22.4 50 0 72.4 0 100V109.5C0 115.3 4.7 120 10.5 120Z" fill="#a8938d" class="opacity-60" />
                  </svg>
                </div>
                <div class="grid grid-cols-2 grid-rows-3 gap-1.5 flex-1 h-full py-0.5">
                  {#each Array(6) as _, i}
                    <div class={`bg-[#cbb8b3] rounded ${i === 5 ? 'border-2 border-white' : ''}`}></div>
                  {/each}
                </div>
              </div>
            {:else}
              <div class="opacity-50 font-bold text-gray-700">Non-Aktif</div>
            {/if}
          </div>
        </article>

        <!-- Step 6 -->
        <article class="group bg-[#111117] rounded-[22px] overflow-hidden border border-white/5 flex flex-col relative z-10 shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] transition-transform duration-200 hover:scale-[1.04] order-6">
          <div class="bg-[#0a0910] px-4 py-[13px] flex items-center gap-2.5 border-b border-white/5 shrink-0">
            <span class="w-[22px] h-[22px] rounded-full bg-white text-black flex items-center justify-center text-[11px] font-bold shrink-0">6</span>
            <h2 class="m-0 text-xs font-semibold text-white overflow-hidden text-ellipsis whitespace-nowrap">Sesi Foto</h2>
          </div>
          <div class="bg-[#e5d5cf] p-5 flex-grow flex items-center justify-center">
            <div class="flex gap-2.5 w-full h-full">
              <div class="grid grid-cols-3 grid-rows-3 gap-1.5 flex-[3]">
                {#each Array(9) as _, i}
                  <div class={`bg-[#cbb8b3] rounded ${i === 4 ? 'border-2 border-white' : ''}`}></div>
                {/each}
              </div>
              <div class="grid grid-cols-2 grid-rows-3 gap-1.5 flex-[2]">
                {#each Array(6) as _, i}
                  <div class="bg-[#cbb8b3] rounded"></div>
                {/each}
              </div>
            </div>
          </div>
        </article>

        <!-- Step 5 -->
        <article class="group bg-[#111117] rounded-[22px] overflow-hidden border border-white/5 flex flex-col relative z-10 shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] transition-transform duration-200 hover:scale-[1.04] order-5">
          <div class="bg-[#0a0910] px-4 py-[13px] flex items-center gap-2.5 border-b border-white/5 shrink-0">
            <span class="w-[22px] h-[22px] rounded-full bg-white text-black flex items-center justify-center text-[11px] font-bold shrink-0">5</span>
            <h2 class="m-0 text-xs font-semibold text-white overflow-hidden text-ellipsis whitespace-nowrap">
              {boothConfig.config.paymentPage ? 'Cek Pembayaran Otomatis' : 'Lewati Pembayaran'}
            </h2>
          </div>
          <div class="bg-[#e5d5cf] p-5 flex-grow flex items-center justify-center">
            {#if boothConfig.config.paymentPage}
              <div class="flex flex-col items-center gap-3.5 w-full">
                <div class="w-[60px] h-[60px] bg-[#cbb8b3] rounded-2xl flex items-center justify-center">
                  <div class="w-[22px] h-[13px] border-b-[4px] border-r-[4px] border-[#8c7873] rotate-45 mb-1 -mr-1"></div>
                </div>
                <div class="w-1/2 h-2 bg-[#cbb8b3] rounded-full"></div>
                <div class="w-[35%] h-1.5 bg-[#cbb8b3] rounded-full opacity-60"></div>
              </div>
            {:else}
              <div class="opacity-50 font-bold text-gray-700">Mati</div>
            {/if}
          </div>
        </article>
      </div>
    </div>
    {/if}
  </main>

  <!-- Footer -->
  <footer class="flex justify-end shrink-0 relative z-10">
    <button
      onclick={onNext}
      style="
        background-color: {uiConfig.config.primaryColor};
        color: #1a0a00;
        box-shadow: 0 4px 20px {uiConfig.config.primaryColor}4D;
      "
      class="px-10 py-[18px] rounded-full font-bold text-xl flex items-center gap-3.5 border-none cursor-pointer transition-transform duration-150 active:scale-95"
    >
      Lanjut
      <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
        <path d="M8.25 4.5l7.5 7.5-7.5 7.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  </footer>
</div>
