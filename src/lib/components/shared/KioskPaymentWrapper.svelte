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
  let effectiveEnableQtyModal = $derived.by(() => {
    const mode = doc.screens?.payment?.printQtyDialog?.mode;
    if (mode === 'page') return false;
    if (mode === 'dialog') return true;
    return enableQtyModal;
  });

  function handleSelectPaymentMethod(method: 'qris' | 'ticket') {
    selectedMethod = method;
    if (method === 'qris') {
      if (!networkStatus.isOnline) return;
      if (effectiveEnableQtyModal) {
        qty = boothFlow.printQty || 1;
        showQtyModal = true;
        return;
      }
      onSelect('cashless');
    } else {
      onSelect('ticket');
    }
  }

  function handleProceedQris(nextQty?: number) {
    if (typeof nextQty === 'number') {
      qty = nextQty;
    }
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
        totalPriceFormatted: `Rp ${(effectiveUnitPrice * (showQtyModal ? qty : effectiveQty)).toLocaleString('id-ID')}`,
        unitPrice: effectiveUnitPrice,
        printQty: showQtyModal ? qty : effectiveQty,
        printQtyDialogOpen: showQtyModal,
        selectedMethod,
        isOffline: !networkStatus.isOnline,
      },
      callbacks: {
        onBack,
        onSelectPaymentMethod: handleSelectPaymentMethod,
        onChangePrintQty: (q) => (qty = q),
        onConfirmPrintQty: (q) => handleProceedQris(q),
        onClosePrintQtyDialog: () => (showQtyModal = false),
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
</div>
