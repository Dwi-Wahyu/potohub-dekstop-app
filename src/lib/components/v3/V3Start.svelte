<script lang="ts">
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import PinPad from '$lib/components/shared/PinPad.svelte';
  import { Camera, Image as ImageIcon, Star } from '@lucide/svelte';

  interface Props {
    onStart: () => void;
    onOpenConfig: () => void;
  }

  let { onStart, onOpenConfig }: Props = $props();

  let showPinModal = $state(false);
  let tapCount = $state(0);
  let tapTimer: any = null;

  function handleHiddenTap() {
    tapCount++;
    if (tapTimer) clearTimeout(tapTimer);
    if (tapCount >= 5) {
      showPinModal = true;
      tapCount = 0;
    } else {
      tapTimer = setTimeout(() => {
        tapCount = 0;
      }, 1500);
    }
  }

  let startBtnPos = $derived(uiConfig.getElementPosition('start', 'start_button', { x: 50, y: 78 }));
  let startBtnStyle = $derived(uiConfig.getElementStyle('start', 'start_button', {
    bgColor: '#FFFFFF', textColor: '#CD1C33', fontSize: 'Besar', fontFamily: 'Sans Serif',
  }));
</script>

<div
  class="w-screen h-screen bg-[#CD1C33] text-white flex flex-col select-none relative overflow-hidden font-['Inter',sans-serif]"
  style="background-image: repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.05) 40px, rgba(0,0,0,0.05) 80px);"
>
  <!-- FilmBar Top -->
  <div class="h-6 flex items-center bg-[#1a1a1a] shrink-0 z-20">
    <div class="flex gap-2 px-3 overflow-hidden">
      {#each Array(40) as _, i}
        <div class="w-5 h-3 rounded-[2px] bg-white/10 border border-white/5 shrink-0"></div>
      {/each}
    </div>
  </div>

  <div class="flex-1 flex min-h-0 relative z-10">
    <!-- LEFT: scattered animated polaroids -->
    <div class="w-[50%] h-full flex items-center justify-center relative">
      <!-- Polaroids -->
      <div
        class="bg-[#FFC107] p-3 pb-10 w-[220px] shadow-2xl absolute top-16 left-24 z-10 border border-yellow-300 animate-bounce"
        style="animation-duration: 3.5s; transform: rotate(3deg);"
      >
        <div class="w-full aspect-[4/3] bg-amber-100 border border-amber-200 flex items-center justify-center">
          <ImageIcon class="text-amber-400" size={36} strokeWidth={1.2} />
        </div>
        <p class="text-[8px] font-bold text-center text-amber-800 tracking-widest mt-2 uppercase font-mono m-0">Our Moment ✦</p>
      </div>

      <div
        class="bg-white p-3 pb-10 w-[240px] shadow-2xl absolute top-32 left-44 z-20 border border-gray-100 animate-bounce"
        style="animation-duration: 3s; transform: rotate(-4deg);"
      >
        <div class="w-full aspect-[4/3] bg-gray-100 border border-gray-200 flex items-center justify-center">
          <Camera class="text-gray-300" size={40} strokeWidth={1.2} />
        </div>
        <p class="text-[8px] font-bold text-center text-gray-400 tracking-widest mt-2 uppercase font-mono m-0">Click ✦ Capture</p>
      </div>

      <div
        class="bg-[#0E8E5E] p-3 pb-10 w-[200px] shadow-xl absolute bottom-24 left-20 z-30 border border-green-800"
        style="transform: rotate(-2deg);"
      >
        <div class="w-full aspect-[4/3] bg-green-700 border border-green-600 flex items-center justify-center">
          <Star class="text-[#FFC107]" size={32} strokeWidth={1.2} fill="#FFC107" />
        </div>
        <p class="text-[8px] font-bold text-center text-green-100 tracking-widest mt-2 uppercase font-mono m-0">Memories ✦</p>
      </div>

      <!-- Floating sticker -->
      <div class="absolute bottom-28 right-8 w-20 h-20 rounded-full bg-[#FFC107] border-4 border-white shadow-xl flex flex-col items-center justify-center z-40 rotate-12">
        <span class="text-[8px] font-black text-black leading-tight text-center tracking-tight font-mono">NEW<br />LOOK</span>
      </div>
    </div>

    <!-- RIGHT: brand & start action -->
    <div class="w-[50%] h-full flex flex-col items-start justify-center text-white pr-16 gap-4 relative">
      <!-- Stamp -->
      <button
        onclick={() => (showPinModal = true)}
        class="absolute top-8 right-10 w-24 h-24 rounded-full border-[3px] border-dashed border-white/20 flex flex-col items-center justify-center text-white/25 text-center bg-transparent cursor-pointer hover:border-white/50 transition-colors"
        title="Operator PIN"
      >
        <span class="text-[8px] font-bold tracking-widest leading-tight uppercase font-mono">PHOTO<br />BOOTH<br />2025</span>
      </button>

      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <p
        onclick={handleHiddenTap}
        class="text-white/60 text-[10px] font-bold tracking-[0.5em] uppercase m-0 cursor-pointer"
      >
        ✦ Potohub Studio ✦
      </p>

      <h1 class="font-['Playfair_Display',serif] font-bold leading-[0.82] tracking-tight drop-shadow-lg text-[6rem] lg:text-[7.5rem] uppercase m-0">
        {uiConfig.config.boothName}
      </h1>

      <div class="flex items-center gap-3">
        <div class="w-10 h-[1.5px] bg-white/30"></div>
        <p class="font-['Dancing_Script',cursive] text-4xl text-white/80 drop-shadow-md -rotate-[2deg] m-0">
          {uiConfig.config.tagline || 'Bringing fun to every frame'}
        </p>
      </div>

      <div class="flex items-center gap-4 mt-4">
        <button
          onclick={onStart}
          class="bg-white text-[#CD1C33] px-10 py-3.5 rounded-full text-base font-black tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-2xl uppercase border-none cursor-pointer"
        >
          {uiConfig.getElementLabel('start', 'start_button', 'Mulai Sekarang')}
        </button>
        <div class="w-10 h-10 rounded-full border-2 border-white/30 flex items-center justify-center text-white/50 text-lg">
          ↓
        </div>
      </div>

      <!-- Marquee strip -->
      <div class="absolute bottom-0 left-0 right-0 h-8 bg-black/20 flex items-center overflow-hidden">
        <div class="flex gap-8 whitespace-nowrap text-white/40 text-[9px] font-bold tracking-widest uppercase font-mono">
          {#each Array(8) as _}
            <span>✦ CETAK FOTO ✦ INGAT KENANGAN ✦ POTOHUB STUDIO ✦ FOTO BOOTH</span>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- FilmBar Bottom -->
  <div class="h-6 flex items-center bg-[#1a1a1a] shrink-0 z-20">
    <div class="flex gap-2 px-3 overflow-hidden">
      {#each Array(40) as _, i}
        <div class="w-5 h-3 rounded-[2px] bg-white/10 border border-white/5 shrink-0"></div>
      {/each}
    </div>
  </div>

  {#if showPinModal}
    <div
      class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onclick={() => (showPinModal = false)}
      role="presentation"
    >
      <PinPad
        onSuccess={() => {
          showPinModal = false;
          onOpenConfig();
        }}
        onCancel={() => (showPinModal = false)}
      />
    </div>
  {/if}
</div>
