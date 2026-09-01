<script lang="ts">
  import { onMount } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { QrCode, Ticket } from '@lucide/svelte';
  import { fetchCategories, requireActiveBoothId, type BoothCategory } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';

  interface Props {
    onSelect: (method: 'ticket' | 'cashless') => void;
    onBack: () => void;
    background?: string;
  }

  let { onSelect, onBack, background }: Props = $props();

  let showQtyModal = $state(false);
  let qty = $state(1);
  let categoriesData = $state<BoothCategory[]>([]);

  onMount(async () => {
    try {
      const boothId = await requireActiveBoothId();
      await cachedFetch(
        `categories:${boothId}`,
        () => fetchCategories(boothId),
        (d) => { categoriesData = d; }
      );
    } catch (e) {
      console.error('[V2Payment] Failed to fetch dynamic categories:', e);
    }
  });

  let priceBase = $derived(
    categoriesData[0]?.base_price ?? uiConfig.config.categories[0]?.basePrice ?? 35000
  );

  const STEPPER_LABELS = ['Tutorial', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter', 'Scan File'];
  const activeIdx = 1;
  const DEFAULT_BG = '#fafafa';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('payment').background ?? DEFAULT_BG);

  function handleProceedQris() {
    boothFlow.printQty = qty;
    showQtyModal = false;
    onSelect('cashless');
  }
</script>

<div
  class="w-full h-full flex flex-col relative overflow-hidden select-none"
  style:background={effectiveBg}
  style:font-family="'Playfair Display', Georgia, serif"
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

  <!-- Content -->
  <div class="relative z-10 flex flex-col items-center flex-1 justify-center">
    <h2 class="text-3xl font-bold mb-2">Select Payment Method</h2>
    <div class="w-20 h-[2px] bg-black mb-16"></div>

    <div class="flex gap-12 font-['Nunito',sans-serif]">
      <!-- QRIS -->
      <button
        onclick={() => (showQtyModal = true)}
        class="group flex flex-col items-center gap-6 px-12 py-10 border-[3px] border-black rounded-3xl bg-white hover:bg-black hover:text-white transition-all shadow-[8px_8px_0_0_#000] hover:shadow-none hover:translate-x-2 hover:translate-y-2 active:scale-95 cursor-pointer"
      >
        <QrCode size={72} strokeWidth={1.2} />
        <span
          class="text-xl font-black tracking-[0.2em] uppercase px-6 py-2 border-[2.5px] border-black rounded-full group-hover:border-white transition-colors"
        >
          QRIS
        </span>
      </button>

      <!-- Ticket -->
      <button
        onclick={() => onSelect('ticket')}
        class="group flex flex-col items-center gap-6 px-12 py-10 border-[3px] border-black rounded-3xl bg-white hover:bg-black hover:text-white transition-all shadow-[8px_8px_0_0_#000] hover:shadow-none hover:translate-x-2 hover:translate-y-2 active:scale-95 cursor-pointer"
      >
        <Ticket size={72} strokeWidth={1.2} />
        <span
          class="text-xl font-black tracking-[0.2em] uppercase px-6 py-2 border-[2.5px] border-black rounded-full group-hover:border-white transition-colors"
        >
          Ticket
        </span>
      </button>
    </div>
  </div>

  <!-- Quantity modal -->
  {#if showQtyModal}
    <div class="absolute inset-0 bg-white/85 backdrop-blur-sm z-50 flex items-center justify-center">
      <div
        class="bg-white border-[3px] border-black rounded-3xl p-12 flex flex-col items-center shadow-[16px_16px_0_0_#000] w-[460px] relative font-['Nunito',sans-serif]"
      >
        <button
          onclick={() => (showQtyModal = false)}
          class="absolute top-6 right-6 w-9 h-9 border-2 border-black rounded-full text-lg font-black flex items-center justify-center hover:bg-black hover:text-white transition-colors cursor-pointer bg-white"
        >
          ✕
        </button>

        <h3 class="text-2xl font-bold mb-2 font-['Playfair_Display',serif]">Print Quantity</h3>
        <div class="w-12 h-[2px] bg-black mb-8"></div>

        <div class="flex items-center gap-10 mb-6">
          <button
            onclick={() => (qty = Math.max(1, qty - 1))}
            class="w-14 h-14 border-[2.5px] border-black rounded-full text-2xl font-black flex items-center justify-center hover:bg-black hover:text-white transition-colors shadow-[3px_3px_0_0_#000] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] cursor-pointer bg-white"
          >
            −
          </button>
          <span class="text-5xl font-black w-16 text-center">{qty}</span>
          <button
            onclick={() => (qty = Math.min(10, qty + 1))}
            class="w-14 h-14 border-[2.5px] border-black rounded-full text-2xl font-black flex items-center justify-center hover:bg-black hover:text-white transition-colors shadow-[3px_3px_0_0_#000] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] cursor-pointer bg-white"
          >
            +
          </button>
        </div>

        <div class="text-4xl font-black mb-2">
          Rp {(priceBase * qty).toLocaleString('id-ID')}
        </div>
        <p class="text-sm text-black/40 tracking-widest mb-10">
          {qty} × Rp {priceBase.toLocaleString('id-ID')}
        </p>

        <button
          onclick={handleProceedQris}
          class="w-full py-4 bg-black text-white text-xl font-bold tracking-[0.15em] uppercase rounded-full hover:bg-gray-900 transition-colors shadow-[6px_6px_0_0_rgba(0,0,0,0.2)] cursor-pointer border-none"
        >
          Proceed to Payment
        </button>
      </div>
    </div>
  {/if}
</div>
