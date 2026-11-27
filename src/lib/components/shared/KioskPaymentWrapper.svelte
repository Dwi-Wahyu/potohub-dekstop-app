<script lang="ts">
  import { onMount } from 'svelte';
  import { GenericScreen, type DesignBlocksDocument } from '@potohub/booth-ui';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { fetchCategories, requireActiveBoothId, type BoothCategory } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';
  import { networkStatus } from '$lib/stores/networkStatus.svelte';
  import OfflineBanner from '$lib/components/shared/OfflineBanner.svelte';
  import { createDesktopUiAdapter } from '$lib/adapters/boothUiAdapter.svelte';

  interface Props {
    doc: DesignBlocksDocument;
    basePrice?: number;
    enableQtyModal?: boolean;
    onSelect: (method: 'ticket' | 'cashless') => void;
    onBack: () => void;
  }

  let {
    doc,
    basePrice = 0,
    enableQtyModal = false,
    onSelect,
    onBack,
  }: Props = $props();

  let categoriesData = $state<BoothCategory[]>([]);
  let selectedMethod = $state<'qris' | 'ticket'>('qris');
  let showQtyModal = $state(false);
  let qty = $state(boothFlow.printQty || 1);

  onMount(async () => {
    try {
      const boothId = await requireActiveBoothId();
      await cachedFetch(
        `categories:${boothId}`,
        () => fetchCategories(boothId),
        (d) => {
          categoriesData = d;
        },
      );
    } catch (e) {
      console.warn('[KioskPaymentWrapper] Failed to fetch categories:', e);
    }
  });

  let effectiveUnitPrice = $derived(
    basePrice > 0
      ? basePrice
      : boothConfig.config.earlyPaymentPage && boothConfig.config.basePrice > 0
        ? boothConfig.config.basePrice
        : (categoriesData[0]?.base_price ?? uiConfig.config.categories[0]?.basePrice ?? 35000),
  );
  let effectiveQty = $derived(boothFlow.printQty || 1);
  let effectiveTotal = $derived(effectiveUnitPrice * effectiveQty);

  function handleSelectPaymentMethod(method: 'qris' | 'ticket') {
    selectedMethod = method;
    if (method === 'qris') {
      if (!networkStatus.isOnline) return;
      if (enableQtyModal) {
        qty = boothFlow.printQty || 1;
        showQtyModal = true;
        return;
      }
      onSelect('cashless');
    } else {
      onSelect('ticket');
    }
  }

  function handleProceedQris() {
    boothFlow.printQty = qty;
    showQtyModal = false;
    onSelect('cashless');
  }

  let adapter = $derived(
    createDesktopUiAdapter({
      categories: categoriesData.map((c) => ({
        id: c.id,
        name: c.name,
        base_price: c.base_price,
        extra_print_price: c.extra_price,
        banner_url: c.banner_url,
        banner_blur: c.banner_blur,
      })),
      templates: [],
      payment: {
        basePriceFormatted: `Rp ${effectiveUnitPrice.toLocaleString('id-ID')}`,
        totalPriceFormatted: `Rp ${effectiveTotal.toLocaleString('id-ID')}`,
        printQty: effectiveQty,
        selectedMethod,
        isOffline: !networkStatus.isOnline,
      },
      callbacks: {
        onBack,
        onSelectPaymentMethod: handleSelectPaymentMethod,
      },
    }),
  );
</script>

<div class="w-full h-full relative">
  {#if !networkStatus.isOnline}
    <div class="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <OfflineBanner />
    </div>
  {/if}

  <GenericScreen {doc} screenKey="payment" {adapter} interactive={true} fitMode="screen" />

  {#if showQtyModal}
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white text-slate-900 border-[3px] border-black rounded-3xl p-10 flex flex-col items-center shadow-[16px_16px_0_0_#000] w-full max-w-[440px] relative">
        <button
          type="button"
          onclick={() => (showQtyModal = false)}
          class="absolute top-5 right-5 w-9 h-9 border-2 border-black rounded-full text-base font-black flex items-center justify-center hover:bg-black hover:text-white transition-colors cursor-pointer bg-white"
        >
          ✕
        </button>

        <h3 class="text-2xl font-bold mb-2">Jumlah Cetak</h3>
        <div class="w-12 h-[2px] bg-black mb-7"></div>

        <div class="flex items-center gap-9 mb-6">
          <button
            type="button"
            onclick={() => (qty = Math.max(1, qty - 1))}
            class="w-14 h-14 border-[2.5px] border-black rounded-full text-2xl font-black flex items-center justify-center hover:bg-black hover:text-white transition-colors cursor-pointer bg-white"
          >
            −
          </button>
          <span class="text-5xl font-black w-16 text-center tabular-nums">{qty}</span>
          <button
            type="button"
            onclick={() => (qty = Math.min(10, qty + 1))}
            class="w-14 h-14 border-[2.5px] border-black rounded-full text-2xl font-black flex items-center justify-center hover:bg-black hover:text-white transition-colors cursor-pointer bg-white"
          >
            +
          </button>
        </div>

        <div class="text-3xl font-black mb-1">
          Rp {(effectiveUnitPrice * qty).toLocaleString('id-ID')}
        </div>
        <p class="text-xs text-slate-500 mb-8">
          {qty} × Rp {effectiveUnitPrice.toLocaleString('id-ID')}
        </p>

        <button
          type="button"
          onclick={handleProceedQris}
          class="w-full py-4 bg-black text-white text-base font-bold tracking-[0.12em] uppercase rounded-full hover:bg-slate-800 transition-colors cursor-pointer border-none"
        >
          Lanjut ke Pembayaran
        </button>
      </div>
    </div>
  {/if}
</div>
