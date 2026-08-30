<script lang="ts">
  import { onMount } from 'svelte';
  import QRCode from 'qrcode';
  import { uiConfig, type StoreCategory } from '$lib/stores/uiConfig.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { Check, Clock, ChevronLeft } from '@lucide/svelte';
  import { fetchCategories, requireActiveBoothId, type BoothCategory } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';

  interface Props {
    selectedPackage: StoreCategory | null;
    onSelectMethod: (method: 'ticket' | 'cashless') => void;
    onBack: () => void;
  }

  let { selectedPackage, onSelectMethod, onBack }: Props = $props();

  let paid = $state(false);
  let qrUrl = $state('');
  let categoriesData = $state<BoothCategory[]>([]);

  let qty = $derived(boothFlow.printQty || 1);
  let priceBase = $derived(
    selectedPackage?.basePrice ?? categoriesData[0]?.base_price ?? uiConfig.config.categories[0]?.basePrice ?? 35000
  );
  let total = $derived(priceBase * qty);

  onMount(async () => {
    try {
      const boothId = await requireActiveBoothId();
      await cachedFetch(
        `categories:${boothId}`,
        () => fetchCategories(boothId),
        (d) => { categoriesData = d; }
      );
      qrUrl = await QRCode.toDataURL(
        `potohub://pay?booth=${encodeURIComponent(uiConfig.config.boothName)}&amount=${total}&ref=${Date.now()}`,
        { margin: 1, width: 200 }
      );
    } catch (e) {
      console.error('Failed to generate QR in V3Payment:', e);
    }
  });

  function handleCheckStatus() {
    paid = true;
    setTimeout(() => onSelectMethod('cashless'), 1000);
  }

  const VISIBLE_STEPS = ['Package', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter'];
  const activeStepIdx = 1;
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
        Pembayaran
      </h1>
      <p class="text-white/50 text-[8px] uppercase tracking-[0.3em] mt-1 m-0">Scan QRIS untuk melanjutkan</p>
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

  <div class="flex-1 bg-[#f7f7f7] flex items-center justify-center gap-8 px-16 relative">
    <!-- QRIS Card -->
    <div class="bg-white rounded-3xl w-[360px] shadow-2xl flex flex-col overflow-hidden border border-gray-100">
      <div class="bg-[#1a1a1a] px-6 py-3 flex items-center justify-between">
        <span class="font-black text-lg italic tracking-tighter text-white font-serif">QRIS</span>
        <div class="flex gap-1">
          {#each ['#CD1C33', '#FFC107', '#0E8E5E'] as c}
            <div class="w-2 h-2 rounded-full" style="background: {c};"></div>
          {/each}
        </div>
      </div>
      <div class="p-6 flex flex-col items-center gap-4">
        <div class="p-3 border-2 border-gray-100 rounded-xl bg-white shadow-inner flex justify-center items-center">
          {#if qrUrl}
            <img src={qrUrl} alt="QRIS" class="w-[190px] h-[190px] object-contain" />
          {:else}
            <div class="w-[190px] h-[190px] flex items-center justify-center text-xs text-gray-400 font-mono">
              Loading QR...
            </div>
          {/if}
        </div>
        <p class="text-[9px] text-gray-400 tracking-widest uppercase font-bold text-center m-0">
          Scan menggunakan aplikasi bank kamu
        </p>
        <div class="w-full border-t border-dashed border-gray-200 pt-3 flex items-center justify-between">
          <span class="text-[10px] text-gray-400">Powered by</span>
          <span class="text-[10px] font-black text-gray-700 tracking-widest">GPN ✦ QRIS</span>
        </div>
      </div>
    </div>

    <!-- Total Card -->
    <div class="bg-white rounded-3xl w-[320px] shadow-2xl flex flex-col overflow-hidden border border-gray-100">
      <div class="bg-[#CD1C33] px-6 py-3 flex items-center gap-2">
        <span class="text-white/70 text-[9px] font-bold uppercase tracking-[0.25em]">Total Tagihan</span>
      </div>
      <div class="p-6 flex flex-col items-center gap-4">
        <div class="text-center">
          <div class="text-5xl font-['Playfair_Display',serif] font-black text-[#CD1C33]">
            Rp {total.toLocaleString('id-ID')}
          </div>
          <p class="text-xs text-gray-400 mt-1 m-0">
            {selectedPackage?.name ?? 'Standard Package'} · {qty} lembar
          </p>
        </div>

        <div class="w-full border border-dashed border-gray-200 rounded-xl p-4 flex flex-col gap-2.5 font-mono">
          <div class="flex justify-between text-xs">
            <span class="text-gray-400">Harga satuan</span>
            <span class="font-bold">Rp {priceBase.toLocaleString('id-ID')}</span>
          </div>
          <div class="flex justify-between text-xs">
            <span class="text-gray-400">Jumlah cetak</span>
            <span class="font-bold">{qty} lembar</span>
          </div>
          <div class="border-t border-gray-100 pt-2 flex justify-between text-xs">
            <span class="font-bold text-gray-600">Total</span>
            <span class="font-black text-[#CD1C33]">Rp {total.toLocaleString('id-ID')}</span>
          </div>
        </div>

        <div class="w-full bg-[#0E8E5E] text-white px-5 py-2.5 rounded-full font-mono text-xs font-bold flex items-center justify-center gap-2 shadow">
          <Clock size={15} /> Bayar sebelum 10:00
        </div>

        <button
          onclick={handleCheckStatus}
          disabled={paid}
          class="w-full py-2.5 border-2 border-[#0E8E5E] text-[#0E8E5E] rounded-full font-bold text-xs tracking-widest uppercase hover:bg-[#f0faf5] transition-colors cursor-pointer bg-white"
        >
          {paid ? 'Pembayaran Berhasil! ✓' : 'Cek Status Pembayaran'}
        </button>

        <button
          onclick={onBack}
          class="text-xs text-gray-400 hover:text-gray-700 uppercase tracking-widest bg-transparent border-none cursor-pointer font-bold flex items-center gap-1 mt-1"
        >
          <ChevronLeft size={14} /> Ganti Metode
        </button>
      </div>
    </div>
  </div>
</div>
