<script lang="ts">
  import { onMount } from 'svelte';
  import { uiConfig, type StoreCategory } from '$lib/stores/uiConfig.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { QrCode, Ticket, ChevronRight, Check } from '@lucide/svelte';
  import { fetchCategories, requireActiveBoothId, type BoothCategory } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';

  interface Props {
    onSelectPackage: (pkg: StoreCategory) => void;
    onSelectMethod?: (method: 'ticket' | 'cashless') => void;
    onBack: () => void;
  }

  let { onSelectPackage, onSelectMethod, onBack }: Props = $props();

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
      console.error('[V3Package] Failed to fetch dynamic categories:', e);
    }
  });

  let priceBase = $derived(
    categoriesData[0]?.base_price ?? uiConfig.config.categories[0]?.basePrice ?? 35000
  );

  function handleProceedQris() {
    boothFlow.printQty = qty;
    showQtyModal = false;
    if (onSelectMethod) {
      onSelectMethod('cashless');
    } else {
      const defaultPkg = uiConfig.config.categories[0] || {
        id: 'std',
        name: 'Standard',
        basePrice: priceBase,
        extraPrintPrice: 10000,
        color: '#FFC107'
      };
      onSelectPackage(defaultPkg);
    }
  }

  function handleSelectTicket() {
    if (onSelectMethod) {
      onSelectMethod('ticket');
    } else {
      const defaultPkg = uiConfig.config.categories[0] || {
        id: 'std',
        name: 'Standard',
        basePrice: priceBase,
        extraPrintPrice: 10000,
        color: '#FFC107'
      };
      onSelectPackage(defaultPkg);
    }
  }

  const VISIBLE_STEPS = ['Package', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter'];
  const activeStepIdx = 0;
</script>

<div class="w-screen h-screen flex flex-col bg-[#fdfdfd] select-none font-['Inter',sans-serif] relative overflow-hidden">
  <!-- Header -->
  <div class="h-[68px] bg-[#CD1C33] flex items-center justify-between px-8 shadow-lg shrink-0 z-20 relative overflow-hidden">
    <div
      class="absolute inset-0 opacity-[0.06] pointer-events-none"
      style="background-image: repeating-linear-gradient(90deg, transparent, transparent 20px, #fff 20px, #fff 40px);"
    ></div>

    <div class="relative z-10">
      <h1 class="text-xl text-white font-['Playfair_Display',serif] font-bold tracking-[0.15em] leading-none uppercase m-0">
        Metode Pembayaran
      </h1>
      <p class="text-white/50 text-[8px] uppercase tracking-[0.3em] mt-1 m-0">Langkah 1 dari 5</p>
    </div>

    <!-- Stepper -->
    <div class="flex items-center gap-1.5 relative z-10">
      {#each VISIBLE_STEPS as stepLabel, i}
        {@const isDone = i < activeStepIdx}
        {@const isActive = i === activeStepIdx}
        <div class="flex items-center gap-1.5">
          <div
            class={`w-7 h-7 rounded-full text-[9px] font-black flex items-center justify-center border-2 transition-all ${
              isDone
                ? 'bg-[#FFC107] border-[#FFC107] text-black'
                : isActive
                  ? 'bg-white border-white text-[#CD1C33]'
                  : 'bg-transparent border-white/30 text-white/40'
            }`}
          >
            {#if isDone}
              <Check size={10} strokeWidth={3} />
            {:else}
              {i + 1}
            {/if}
          </div>
          {#if i < VISIBLE_STEPS.length - 1}
            <div class={`w-6 h-[2px] rounded-full ${isDone ? 'bg-[#FFC107]' : 'bg-white/20'}`}></div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="flex-1 flex min-h-0 relative z-10">
    <!-- LEFT Info Card -->
    <div
      class="w-[40%] h-full bg-[#0E8E5E] flex flex-col items-center justify-center relative overflow-hidden shrink-0"
      style="background-image: repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.07) 40px, rgba(0,0,0,0.07) 80px);"
    >
      <div class="absolute right-0 top-0 bottom-0 w-8 bg-black/10 flex items-center justify-center">
        <span class="text-white/20 text-[9px] font-bold tracking-[0.4em] uppercase rotate-90 whitespace-nowrap">
          STEP 1 · BAYAR
        </span>
      </div>

      <!-- Scalloped ticket card -->
      <div
        class="bg-[#fdfdfd] w-[82%] h-[86%] shadow-2xl flex flex-col items-center justify-between py-8 px-8 relative"
        style="box-shadow: 0 20px 40px rgba(0,0,0,0.25);"
      >
        <div class="w-full flex items-center justify-between">
          <div class="text-[9px] font-bold text-gray-400 uppercase tracking-[0.25em]">Pilih Cara Bayar</div>
          <div class="w-5 h-5 rounded-full bg-[#CD1C33] flex items-center justify-center">
            <span class="text-white text-[8px] font-black">1</span>
          </div>
        </div>

        <div class="flex flex-col items-center gap-3">
          <div class="relative">
            <!-- Mock strip preview -->
            <div class="w-[100px] aspect-[2/3] bg-gray-100 border-2 border-gray-300 rounded-lg p-1.5 flex flex-col gap-1 shadow-md">
              <div class="flex-1 bg-gray-300 rounded"></div>
              <div class="flex-1 bg-gray-300 rounded"></div>
              <div class="flex-1 bg-gray-300 rounded"></div>
            </div>
            <div class="absolute -top-3 -right-5 w-11 h-11 rounded-full bg-[#FFC107] border-2 border-white shadow-lg flex flex-col items-center justify-center rotate-12">
              <span class="text-[7px] font-black text-black leading-none text-center font-mono">HOT<br />DEAL</span>
            </div>
          </div>

          <p class="text-xs text-gray-400 text-center leading-relaxed m-0">
            Mulai dari <span class="font-bold text-[#CD1C33]">Rp 35.000</span><br />untuk 1 strip foto
          </p>
        </div>

        <div class="w-full border border-dashed border-gray-200 rounded-xl p-4 flex flex-col gap-2 font-mono">
          {#each [{ k: 'Format', v: '4R / Strip' }, { k: 'Cetak', v: '1–10 lembar' }, { k: 'Waktu', v: '± 2 menit' }] as r}
            <div class="flex justify-between text-xs">
              <span class="text-gray-400">{r.k}</span>
              <span class="font-bold text-gray-700">{r.v}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- RIGHT Payment buttons -->
    <div
      class="flex-1 bg-[#CD1C33] flex flex-col items-center justify-center gap-8 p-10 relative overflow-hidden"
      style="background-image: repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.05) 40px, rgba(0,0,0,0.05) 80px);"
    >
      <div class="absolute top-6 left-6 text-white/5 text-[120px] font-black font-['Playfair_Display',serif] leading-none select-none pointer-events-none">
        Rp
      </div>
      <div class="absolute bottom-6 right-6 w-32 h-32 rounded-full border-[3px] border-dashed border-white/10 pointer-events-none"></div>

      <div class="text-center relative z-10">
        <p class="text-white/50 text-[9px] font-bold tracking-[0.4em] uppercase mb-2 m-0">✦ Pilih Salah Satu ✦</p>
        <h1 class="text-5xl font-['Playfair_Display',serif] font-bold text-white tracking-widest drop-shadow-lg m-0">
          Bayar Sekarang
        </h1>
      </div>

      <div class="flex gap-6 relative z-10">
        <!-- QRIS -->
        <button
          onclick={() => (showQtyModal = true)}
          class="group bg-[#fdfdfd] flex flex-col items-center gap-4 px-10 py-8 w-[220px] shadow-2xl hover:-translate-y-2 hover:shadow-[0_28px_48px_rgba(0,0,0,0.35)] active:scale-95 transition-all relative border-none cursor-pointer rounded-2xl"
        >
          <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FFC107] text-black text-[8px] font-black tracking-widest px-3 py-0.5 rounded-full uppercase shadow-md font-mono">
            Populer
          </div>
          <div class="text-[#CD1C33] group-hover:scale-110 transition-transform mt-1">
            <QrCode size={52} strokeWidth={1.2} />
          </div>
          <div class="text-center">
            <div class="text-base font-black tracking-[0.15em] uppercase text-gray-800">QRIS</div>
            <div class="text-[9px] text-gray-400 mt-1 leading-tight">Scan &amp; bayar instan</div>
          </div>
          <div class="w-full flex items-center gap-2">
            <div class="flex-1 h-[1px] bg-gray-100"></div>
            <ChevronRight size={12} class="text-[#CD1C33] opacity-60" />
            <div class="flex-1 h-[1px] bg-gray-100"></div>
          </div>
        </button>

        <!-- Ticket -->
        <button
          onclick={handleSelectTicket}
          class="group bg-[#fdfdfd] flex flex-col items-center gap-4 px-10 py-8 w-[220px] shadow-2xl hover:-translate-y-2 hover:shadow-[0_28px_48px_rgba(0,0,0,0.35)] active:scale-95 transition-all relative border-none cursor-pointer rounded-2xl"
        >
          <div class="text-[#CD1C33] group-hover:scale-110 transition-transform mt-1">
            <Ticket size={52} strokeWidth={1.2} />
          </div>
          <div class="text-center">
            <div class="text-base font-black tracking-[0.15em] uppercase text-gray-800">Ticket</div>
            <div class="text-[9px] text-gray-400 mt-1 leading-tight">Scan atau masukkan kode</div>
          </div>
          <div class="w-full flex items-center gap-2">
            <div class="flex-1 h-[1px] bg-gray-100"></div>
            <ChevronRight size={12} class="text-[#CD1C33] opacity-60" />
            <div class="flex-1 h-[1px] bg-gray-100"></div>
          </div>
        </button>
      </div>

      <button
        onclick={onBack}
        class="text-xs text-white/50 hover:text-white uppercase tracking-widest bg-transparent border-none cursor-pointer font-bold mt-2"
      >
        ← Kembali
      </button>
    </div>
  </div>

  <!-- Quantity modal -->
  {#if showQtyModal}
    <div
      class="absolute inset-0 z-50 flex items-center justify-center"
      style="background: rgba(20,20,20,0.7); backdrop-filter: blur(8px);"
    >
      <div class="bg-[#fdfdfd] rounded-3xl w-[400px] p-10 flex flex-col items-center shadow-2xl relative overflow-hidden">
        <button
          onclick={() => (showQtyModal = false)}
          class="absolute top-4 right-4 w-7 h-7 rounded-full bg-[#CD1C33] text-white text-xs font-black flex items-center justify-center hover:bg-[#A31327] transition-colors cursor-pointer border-none"
        >
          ✕
        </button>

        <div
          class="w-full bg-[#CD1C33] -mx-10 -mt-10 mb-6 px-10 py-5 flex flex-col items-center"
          style="margin-left: -40px; margin-right: -40px; width: calc(100% + 80px);"
        >
          <p class="text-white/70 text-[9px] font-bold tracking-[0.3em] uppercase mb-1 m-0">Jumlah Cetak</p>
          <h3 class="text-2xl font-['Playfair_Display',serif] font-bold text-white m-0">Print Quantity</h3>
        </div>

        <div class="flex items-center gap-6 mb-5">
          <button
            onclick={() => (qty = Math.max(1, qty - 1))}
            class="w-11 h-11 rounded-full border-2 border-[#CD1C33] text-[#CD1C33] text-xl font-black flex items-center justify-center hover:bg-[#CD1C33] hover:text-white transition-colors cursor-pointer bg-white"
          >
            −
          </button>
          <span class="text-5xl font-black text-gray-800 w-12 text-center font-['Playfair_Display',serif]">{qty}</span>
          <button
            onclick={() => (qty = Math.min(10, qty + 1))}
            class="w-11 h-11 rounded-full border-2 border-[#CD1C33] text-[#CD1C33] text-xl font-black flex items-center justify-center hover:bg-[#CD1C33] hover:text-white transition-colors cursor-pointer bg-white"
          >
            +
          </button>
        </div>

        <div class="text-3xl font-black text-[#CD1C33] font-['Playfair_Display',serif] mb-1">
          Rp {(priceBase * qty).toLocaleString('id-ID')}
        </div>
        <p class="text-[10px] text-gray-400 tracking-widest mb-8 m-0 font-mono">
          {qty} × Rp {priceBase.toLocaleString('id-ID')}
        </p>

        <button
          onclick={handleProceedQris}
          class="w-full py-3.5 bg-[#0E8E5E] text-white font-bold tracking-widest uppercase rounded-full hover:bg-[#0b7a50] transition-colors shadow-md text-sm border-none cursor-pointer"
        >
          Lanjut ke Pembayaran →
        </button>
      </div>
    </div>
  {/if}
</div>
