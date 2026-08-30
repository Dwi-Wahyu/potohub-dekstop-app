<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { QrCode, Ticket, Camera } from '@lucide/svelte';

  interface Props {
    onNext: () => void;
    onBack: () => void;
  }

  let { onNext, onBack }: Props = $props();

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

  const STEPPER_LABELS = ['Tutorial', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter', 'Scan File'];
  const STEPPER_STEPS = ['tutorial', 'payment', 'frame', 'session', 'filter', 'download'];
  const activeIdx = 0;
</script>

<div
  class="w-screen h-screen bg-[#fafafa] flex flex-col relative overflow-hidden select-none"
  style="font-family: 'Playfair Display', Georgia, serif;"
>
  <!-- StepperHeader -->
  <div
    class="w-full h-16 flex items-center justify-between px-10 border-b-2 border-black shrink-0 relative z-20 select-none"
    style="background: #C7EED8;"
  >
    <!-- dot pattern -->
    <div
      class="absolute inset-0 opacity-10 pointer-events-none"
      style="background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.5) 1px, transparent 0); background-size: 24px 24px;"
    ></div>

    <!-- stepper pills -->
    <div class="flex items-center gap-1 relative z-10 font-['Nunito',sans-serif]">
      {#each STEPPER_LABELS as label, i}
        {@const isActive = i === activeIdx}
        {@const isDone = i < activeIdx}
        <div class="flex items-center">
          <div
            class={`px-4 py-1.5 rounded-full border-2 border-black font-bold text-xs transition-all ${
              isActive
                ? 'bg-[#C7EED8] text-black shadow-[4px_4px_0_0_rgba(0,0,0,1)]'
                : isDone
                  ? 'bg-black text-white border-black'
                  : 'text-black/40 border-black/30 bg-transparent'
            }`}
          >
            {label}
          </div>
          {#if i < STEPPER_LABELS.length - 1}
            <div
              class={`w-6 h-px border-t border-black mx-0.5 ${isDone ? 'opacity-100' : 'opacity-30'}`}
            ></div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- brand -->
    <div class="flex items-center gap-2 relative z-10 font-['Nunito',sans-serif]">
      <div
        class="w-8 h-8 rounded-xl border-2 border-black bg-white flex items-center justify-center text-[#2a2873] shadow-inner"
      >
        <QrCode size={18} strokeWidth={2.5} />
      </div>
      <h1 class="text-black font-black text-xl m-0 tracking-wide drop-shadow-sm uppercase">
        {uiConfig.config.boothName || 'POTOHUB'}
      </h1>
    </div>
  </div>

  <!-- ClassicBorder -->
  <div class="absolute inset-5 pointer-events-none z-0">
    <div class="absolute inset-0 border-[3px] border-black rounded-[28px]"></div>
    <div class="absolute inset-[6px] border border-black/20 rounded-[23px]"></div>
    {#each ['top-3 left-3', 'top-3 right-3', 'bottom-3 left-3', 'bottom-3 right-3'] as pos}
      <div class="absolute {pos} w-4 h-4">
        <div
          class="w-2 h-2 border-t-2 border-l-2 border-black absolute top-0 left-0"
          style="border-radius: 2px 0 0 0;"
        ></div>
      </div>
    {/each}
  </div>

  <div class="relative z-10 flex flex-col items-center w-full flex-1 justify-center">
    <!-- header -->
    <h2 class="text-3xl font-bold tracking-wide mb-1">Panduan Penggunaan</h2>
    <div class="w-16 h-[2px] bg-black mb-10"></div>

    <!-- cards + connectors -->
    <div class="flex items-center justify-center gap-0 mb-8 font-['Nunito',sans-serif]">
      <!-- Card 1 -->
      <div class="flex items-center">
        <div class="flex flex-col items-center gap-3" style="width: 148px;">
          <div
            class="w-8 h-8 border-[2px] border-black rounded-full flex items-center justify-center bg-white"
          >
            <span class="text-[10px] font-black tracking-widest">01</span>
          </div>
          <div
            class="w-full border-[2.5px] border-black rounded-2xl bg-white overflow-hidden shadow-[4px_4px_0_0_#000]"
          >
            <div class="px-4 pt-4 pb-3">
              <div class="flex gap-2 w-full">
                <div
                  class="flex-1 border-[1.5px] border-black/60 rounded-lg py-2.5 flex flex-col items-center gap-1 bg-[#fafafa]"
                >
                  <QrCode size={20} strokeWidth={1.5} />
                  <span class="text-[8.5px] font-black tracking-wider">QRIS</span>
                </div>
                <div
                  class="flex-1 border-[1.5px] border-black/60 rounded-lg py-2.5 flex flex-col items-center gap-1 bg-[#fafafa]"
                >
                  <Ticket size={20} strokeWidth={1.5} />
                  <span class="text-[8.5px] font-black tracking-wider">Voucher</span>
                </div>
              </div>
            </div>
            <div class="border-t-[2px] border-black px-3 py-2 flex items-center justify-center">
              <span class="text-[11px] font-black tracking-wide text-center leading-tight">Pembayaran</span>
            </div>
          </div>
          <p class="text-[10.5px] text-center text-black/45 leading-relaxed m-0 font-['Playfair_Display',serif]">Pilih QRIS atau Ticket</p>
        </div>
        <div class="flex items-center justify-center mb-10 mx-1" style="width: 36px;">
          <svg width="28" height="10" viewBox="0 0 28 10" fill="none">
            <path d="M0 5h24M19 1l5 4-5 4" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <!-- Card 2 -->
      <div class="flex items-center">
        <div class="flex flex-col items-center gap-3" style="width: 148px;">
          <div
            class="w-8 h-8 border-[2px] border-black rounded-full flex items-center justify-center bg-white"
          >
            <span class="text-[10px] font-black tracking-widest">02</span>
          </div>
          <div
            class="w-full border-[2.5px] border-black rounded-2xl bg-white overflow-hidden shadow-[4px_4px_0_0_#000]"
          >
            <div class="px-4 pt-4 pb-3">
              <div class="flex gap-2 w-full justify-center">
                {#each [{ c: 2, r: 3, active: true }, { c: 1, r: 3, active: false }, { c: 2, r: 2, active: false }] as f, i}
                  <div
                    class={`rounded-lg p-1 border-[1.5px] ${f.active ? 'border-black' : 'border-black/25'}`}
                    style="width: 32px;"
                  >
                    <div
                      style={`display: grid; grid-template-columns: repeat(${f.c}, 1fr); gap: 2px; aspect-ratio: 2/3;`}
                    >
                      {#each Array(f.c * f.r) as _}
                        <div class={`rounded-[1px] ${f.active ? 'bg-black/70' : 'bg-black/15'}`}></div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
            <div class="border-t-[2px] border-black px-3 py-2 flex items-center justify-center">
              <span class="text-[11px] font-black tracking-wide text-center leading-tight">Pilih Frame</span>
            </div>
          </div>
          <p class="text-[10.5px] text-center text-black/45 leading-relaxed m-0 font-['Playfair_Display',serif]">Tentukan layout strip fotomu</p>
        </div>
        <div class="flex items-center justify-center mb-10 mx-1" style="width: 36px;">
          <svg width="28" height="10" viewBox="0 0 28 10" fill="none">
            <path d="M0 5h24M19 1l5 4-5 4" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <!-- Card 3 -->
      <div class="flex items-center">
        <div class="flex flex-col items-center gap-3" style="width: 148px;">
          <div
            class="w-8 h-8 border-[2px] border-black rounded-full flex items-center justify-center bg-white"
          >
            <span class="text-[10px] font-black tracking-widest">03</span>
          </div>
          <div
            class="w-full border-[2.5px] border-black rounded-2xl bg-white overflow-hidden shadow-[4px_4px_0_0_#000]"
          >
            <div class="px-4 pt-4 pb-3">
              <div class="w-full rounded-xl bg-black overflow-hidden relative" style="aspect-ratio: 4/3;">
                <div class="absolute inset-2 border border-dashed border-white/25 rounded-lg"></div>
                <div class="absolute inset-0 flex items-center justify-center">
                  <span class="text-white font-black text-3xl opacity-90">3</span>
                </div>
                <div class="absolute bottom-2 left-0 right-0 flex justify-center">
                  <span class="text-white/40 text-[7px] font-black tracking-widest uppercase">Tap to Start</span>
                </div>
              </div>
            </div>
            <div class="border-t-[2px] border-black px-3 py-2 flex items-center justify-center">
              <span class="text-[11px] font-black tracking-wide text-center leading-tight">Sesi Foto</span>
            </div>
          </div>
          <p class="text-[10.5px] text-center text-black/45 leading-relaxed m-0 font-['Playfair_Display',serif]">Berpose & hitung mundur</p>
        </div>
        <div class="flex items-center justify-center mb-10 mx-1" style="width: 36px;">
          <svg width="28" height="10" viewBox="0 0 28 10" fill="none">
            <path d="M0 5h24M19 1l5 4-5 4" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <!-- Card 4 -->
      <div class="flex items-center">
        <div class="flex flex-col items-center gap-3" style="width: 148px;">
          <div
            class="w-8 h-8 border-[2px] border-black rounded-full flex items-center justify-center bg-white"
          >
            <span class="text-[10px] font-black tracking-widest">04</span>
          </div>
          <div
            class="w-full border-[2.5px] border-black rounded-2xl bg-white overflow-hidden shadow-[4px_4px_0_0_#000]"
          >
            <div class="px-4 pt-4 pb-3">
              <div class="flex gap-1.5 w-full">
                {#each [{ label: 'Ori', cls: '' }, { label: 'B&W', cls: 'grayscale' }, { label: 'Sepia', cls: 'sepia' }] as f, i}
                  <div class={`flex-1 rounded-lg overflow-hidden border-[1.5px] ${i === 0 ? 'border-black' : 'border-black/25'}`}>
                    <div class={`w-full ${f.cls} bg-gray-300 flex items-center justify-center`} style="aspect-ratio: 1/1;">
                      <Camera size={10} class="opacity-20" />
                    </div>
                    <div class={`text-center text-[7.5px] font-black py-1 ${i === 0 ? 'bg-black text-white' : ''}`}>{f.label}</div>
                  </div>
                {/each}
              </div>
            </div>
            <div class="border-t-[2px] border-black px-3 py-2 flex items-center justify-center">
              <span class="text-[11px] font-black tracking-wide text-center leading-tight">Pilih Filter</span>
            </div>
          </div>
          <p class="text-[10.5px] text-center text-black/45 leading-relaxed m-0 font-['Playfair_Display',serif]">Percantik hasil fotomu</p>
        </div>
        <div class="flex items-center justify-center mb-10 mx-1" style="width: 36px;">
          <svg width="28" height="10" viewBox="0 0 28 10" fill="none">
            <path d="M0 5h24M19 1l5 4-5 4" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <!-- Card 5 -->
      <div class="flex items-center">
        <div class="flex flex-col items-center gap-3" style="width: 148px;">
          <div
            class="w-8 h-8 border-[2px] border-black rounded-full flex items-center justify-center bg-white"
          >
            <span class="text-[10px] font-black tracking-widest">05</span>
          </div>
          <div
            class="w-full border-[2.5px] border-black rounded-2xl bg-white overflow-hidden shadow-[4px_4px_0_0_#000]"
          >
            <div class="px-4 pt-4 pb-3">
              <div class="w-full flex flex-col items-center gap-2">
                <div class="border-[1.5px] border-black rounded-lg p-1.5 bg-white">
                  <div class="grid grid-cols-5 gap-[2px]" style="width: 44px; height: 44px;">
                    {#each [1,1,0,1,1, 1,0,1,0,1, 0,1,1,1,0, 1,0,1,0,1, 1,1,0,1,1] as v, i}
                      <div class={`rounded-[1px] ${v ? 'bg-black' : 'bg-white'}`}></div>
                    {/each}
                  </div>
                </div>
                <span class="text-[8px] font-black tracking-[0.15em] text-black/40">SCAN ME</span>
              </div>
            </div>
            <div class="border-t-[2px] border-black px-3 py-2 flex items-center justify-center">
              <span class="text-[11px] font-black tracking-wide text-center leading-tight">Print & Download</span>
            </div>
          </div>
          <p class="text-[10.5px] text-center text-black/45 leading-relaxed m-0 font-['Playfair_Display',serif]">Ambil cetak & scan QR</p>
        </div>
      </div>
    </div>

    <!-- CTA -->
    <button
      onclick={onNext}
      class="px-14 py-3.5 border-[2.5px] border-black rounded-full text-base font-bold uppercase tracking-[0.2em] font-['Nunito',sans-serif] hover:bg-black hover:text-white transition-all active:scale-95 shadow-[4px_4px_0_0_#000] hover:shadow-none hover:translate-x-1 hover:translate-y-1 cursor-pointer bg-white text-black"
    >
      Mulai Sekarang
    </button>
  </div>
</div>
