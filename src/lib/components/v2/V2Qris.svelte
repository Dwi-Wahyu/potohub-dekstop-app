<script lang="ts">
  import { onMount } from 'svelte';
  import QRCode from 'qrcode';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { QrCode, ChevronLeft } from '@lucide/svelte';
  import { fetchCategories, requireActiveBoothId, type BoothCategory } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';

  interface Props {
    onSuccess: () => void;
    onBack: () => void;
    background?: string;
  }

  let { onSuccess, onBack, background }: Props = $props();

  let paid = $state(false);
  let qrUrl = $state('');
  let categoriesData = $state<BoothCategory[]>([]);

  let priceBase = $derived(
    categoriesData[0]?.base_price ?? uiConfig.config.categories[0]?.basePrice ?? 35000
  );
  let qty = $derived(boothFlow.printQty || 1);
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
      console.error('Failed to generate QR or fetch categories:', e);
    }
  });

  function simulatePayment() {
    paid = true;
    setTimeout(() => onSuccess(), 1000);
  }

  const STEPPER_LABELS = ['Tutorial', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter', 'Scan File'];
  const activeIdx = 1;
  const DEFAULT_BG = '#fafafa';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('payment').background ?? DEFAULT_BG);
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

  <!-- Main content -->
  <div class="relative z-10 flex flex-col items-center flex-1 justify-center gap-0">
    <p class="text-xs tracking-[0.35em] uppercase text-black/40 mb-3 font-['Nunito',sans-serif] font-black">Scan &amp; Pay</p>
    <h2 class="text-3xl font-bold mb-1">Pembayaran QRIS</h2>
    <div class="w-16 h-[2px] bg-black mb-8"></div>

    <!-- QR card -->
    <div
      class="bg-white border-[3px] border-black rounded-3xl shadow-[10px_10px_0_0_#000] p-8 flex flex-col items-center gap-5 w-[360px]"
    >
      <div class="text-center font-['Nunito',sans-serif]">
        <p class="text-xs tracking-widest text-black/40 mb-1 uppercase font-bold">TOTAL PEMBAYARAN</p>
        <p class="text-4xl font-black font-['Playfair_Display',serif] m-0">Rp {total.toLocaleString('id-ID')}</p>
        <p class="text-xs text-black/35 mt-1 m-0">{qty} print × Rp {priceBase.toLocaleString('id-ID')}</p>
      </div>

      <!-- QR Code -->
      <div class="p-3 border-[2px] border-black/10 rounded-2xl bg-white flex justify-center items-center">
        {#if qrUrl}
          <img src={qrUrl} alt="QRIS Code" class="w-[200px] h-[200px] object-contain" />
        {:else}
          <div class="w-[200px] h-[200px] flex items-center justify-center text-xs text-black/30 font-mono">
            Loading QR...
          </div>
        {/if}
      </div>

      <!-- accepted logos -->
      <div class="flex items-center gap-3 font-['Nunito',sans-serif]">
        {#each ['GoPay', 'OVO', 'DANA', 'LinkAja', 'ShopeePay'] as name}
          <span class="text-[9px] font-black tracking-wider px-2 py-1 border border-black/20 rounded-md text-black/50">
            {name}
          </span>
        {/each}
      </div>

      <p class="text-[10px] text-black/30 tracking-widest text-center m-0 font-['Nunito',sans-serif]">
        Gunakan aplikasi e-wallet atau m-banking
      </p>
    </div>

    <p class="mt-6 text-xs text-black/30 tracking-widest font-['Nunito',sans-serif]">
      QR berlaku selama 15 menit
    </p>

    <button
      onclick={simulatePayment}
      disabled={paid}
      class="mt-8 px-16 py-4 bg-black text-white text-base font-bold tracking-[0.2em] uppercase rounded-full hover:bg-gray-900 transition-all shadow-[6px_6px_0_0_rgba(0,0,0,0.25)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] active:scale-95 cursor-pointer border-none font-['Nunito',sans-serif]"
    >
      {paid ? 'Pembayaran Berhasil! ✓' : 'Saya Sudah Bayar ✓'}
    </button>

    <button
      onclick={onBack}
      class="mt-4 flex items-center gap-2 text-sm text-black/40 hover:text-black transition-colors cursor-pointer bg-transparent border-none font-['Nunito',sans-serif]"
    >
      <ChevronLeft size={14} /> Ganti Metode Pembayaran
    </button>
  </div>
</div>
