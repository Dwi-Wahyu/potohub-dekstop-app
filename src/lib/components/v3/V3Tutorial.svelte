<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Star, QrCode, Image as ImageIcon, Camera, Download, ChevronRight } from '@lucide/svelte';

  import { uiConfig } from '$lib/stores/uiConfig.svelte';

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
      if (secs > 0) secs--;
      else {
        clearInterval(timer);
        onNext();
      }
    }, 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const TUTORIAL_ITEMS = [
    { n: 1, icon: QrCode, title: 'Bayar Dulu', desc: 'QRIS atau voucher code', bg: '#fef2f2', accent: '#CD1C33', iconClass: 'text-[#CD1C33]' },
    { n: 2, icon: ImageIcon, title: 'Pilih Frame', desc: '10+ pilihan tersedia', bg: '#f0faf5', accent: '#0E8E5E', iconClass: 'text-[#0E8E5E]' },
    { n: 3, icon: Camera, title: 'Pose & Foto', desc: 'Countdown 5 detik', bg: '#f7f7f7', accent: '#1a1a1a', iconClass: 'text-[#1a1a1a]' },
    { n: 4, icon: Download, title: 'Unduh Hasilnya', desc: 'Scan QR, foto tersimpan', bg: '#fffbeb', accent: '#d97706', iconClass: 'text-[#FFC107]' }
  ];
  const DEFAULT_BG = '#fdfdfd';
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
  class="w-full h-full flex flex-col select-none font-['Inter',sans-serif] relative overflow-hidden"
  style:background={effectiveBg}
>
  <!-- Top bar -->
  <div class="bg-[#1a1a1a] h-10 flex items-center px-8 gap-3 shrink-0">
    {#each ['#CD1C33', '#FFC107', '#0E8E5E'] as c}
      <div class="w-3 h-3 rounded-full" style="background: {c};"></div>
    {/each}
    <span class="text-white/30 text-[10px] font-mono tracking-widest ml-4">PANDUAN PENGGUNAAN</span>
  </div>

  <div class="flex-1 flex flex-col items-center justify-center px-16 gap-10 relative overflow-hidden">
    <!-- Big decorative question mark background -->
    <div class="absolute -left-8 top-1/2 -translate-y-1/2 text-[280px] font-black text-gray-100 leading-none select-none pointer-events-none font-['Playfair_Display',serif]">
      ?
    </div>

    <div class="text-center relative z-10">
      <div class="inline-flex items-center gap-2 bg-[#CD1C33] text-white text-[9px] font-bold tracking-[0.3em] uppercase px-4 py-1.5 rounded-full mb-4">
        <Star size={9} fill="white" /> Panduan Singkat
      </div>
      <h2 class="text-5xl font-['Playfair_Display',serif] text-gray-800 m-0">
        Gimana <span class="text-[#CD1C33] italic">caranya?</span>
      </h2>
    </div>

    {#if tutorialImg}
      <div class="w-full max-w-4xl p-4 flex items-center justify-center overflow-hidden relative z-10">
        <img
          src={tutorialImg}
          alt="Panduan Penggunaan"
          class="max-w-full max-h-full object-contain rounded-2xl shadow-xl"
        />
      </div>
    {:else}
      <div class="grid grid-cols-4 gap-5 w-full max-w-5xl relative z-10">
        {#each TUTORIAL_ITEMS as item}
          {@const IconComp = item.icon}
          <div
            class="rounded-2xl p-5 flex flex-col gap-3 border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
            style="background: {item.bg};"
          >
            <div
              class="absolute top-3 right-3 text-[48px] font-black opacity-[0.06] font-['Playfair_Display',serif] leading-none"
              style="color: {item.accent};"
            >
              {item.n}
            </div>
            <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-white shadow-sm shrink-0">
              <IconComp size={32} class={item.iconClass} strokeWidth={1.5} />
            </div>
            <div>
              <div class="font-black text-gray-800 text-sm">{item.title}</div>
              <div class="text-xs text-gray-400 mt-0.5">{item.desc}</div>
            </div>
            <div class="h-[2px] w-8 rounded-full mt-auto" style="background: {item.accent};"></div>
          </div>
        {/each}
      </div>
    {/if}

    <button
      onclick={onNext}
      class="relative z-10 bg-[#CD1C33] text-white px-14 py-3.5 rounded-full text-sm font-black tracking-[0.2em] uppercase hover:bg-[#A31327] transition-colors shadow-xl flex items-center gap-2 border-none cursor-pointer"
    >
      Siap! Mulai <ChevronRight size={16} strokeWidth={3} />
    </button>
  </div>

  <div class="h-3 bg-[#CD1C33] shrink-0"></div>
</div>
