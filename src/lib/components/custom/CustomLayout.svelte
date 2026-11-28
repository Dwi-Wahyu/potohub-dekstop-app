<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import {
    getActiveCheckpoint,
    isCheckpointValid,
    restoreActiveSession,
    clearActiveCheckpoint,
    initActiveCheckpoint,
    updateCheckpointSelection,
    updateCheckpointStatus,
  } from '$lib/utils/activeSessionCheckpoint';
  import { StartScreen, TutorialScreen } from '@potohub/booth-ui';
  import { createDesktopUiAdapter } from '$lib/adapters/boothUiAdapter.svelte';
  import KioskStartShell from '$lib/components/shared/KioskStartShell.svelte';
  import KioskFrameWrapper from '$lib/components/shared/KioskFrameWrapper.svelte';
  import KioskPaymentWrapper from '$lib/components/shared/KioskPaymentWrapper.svelte';
  import KioskQrisWrapper from '$lib/components/shared/KioskQrisWrapper.svelte';
  import KioskSessionWrapper from '$lib/components/shared/KioskSessionWrapper.svelte';
  import KioskTicketWrapper from '$lib/components/shared/KioskTicketWrapper.svelte';
  import KioskSoftfileWrapper from '$lib/components/shared/KioskSoftfileWrapper.svelte';
  import V1PrintQty from '$lib/components/v1/V1PrintQty.svelte';
  import V1Camera from '$lib/components/v1/V1Camera.svelte';
  import V1Customize from '$lib/components/v1/V1Customize.svelte';
  import V1Complete from '$lib/components/v1/V1Complete.svelte';
  import ProgressiveBackground from '$lib/components/shared/ProgressiveBackground.svelte';

  interface Props {
    customTutorialImg?: string;
  }

  let { customTutorialImg }: Props = $props();

  let currentSubStep = $state<
    'welcome' | 'tutorial' | 'method_select' | 'category_frame' | 'print_qty' | 'ticket' | 'payment' | 'camera' | 'customize' | 'complete'
  >('welcome');

  const SUBSTEP_TO_UI_STEP: Record<typeof currentSubStep, string> = {
    welcome: 'start',
    tutorial: 'tutorial',
    method_select: 'payment',
    category_frame: 'frame',
    print_qty: 'frame',
    ticket: 'ticket',
    payment: 'qris',
    camera: 'session',
    customize: 'filter',
    complete: 'download'
  };

  let selectedPrice = $state(35000);
  let selectedFrameConfigId = $state('grid4');
  let seenForceReset = boothFlow.forceResetCounter;

  $effect(() => {
    if (boothFlow.forceResetCounter !== seenForceReset) {
      seenForceReset = boothFlow.forceResetCounter;
      currentSubStep = 'welcome';
    }
  });

  onMount(async () => {
    try {
      const cp = await getActiveCheckpoint();
      if (cp && isCheckpointValid(cp)) {
        const { allSlotsRestored } = await restoreActiveSession(cp);
        if (cp.status === 'selecting_frame') {
          selectedFrameConfigId = cp.selectedFrameId || '';
          currentSubStep = 'category_frame';
        } else if (allSlotsRestored || cp.status === 'customizing') {
          selectedFrameConfigId = cp.selectedFrameId || 'grid4';
          currentSubStep = 'customize';
        } else {
          selectedFrameConfigId = cp.selectedFrameId || 'grid4';
          currentSubStep = 'camera';
        }
      } else if (cp) {
        await clearActiveCheckpoint();
      }
    } catch (err) {
      console.warn('[CustomLayout] Gagal memulihkan checkpoint sesi aktif:', err);
    }
  });

  $effect(() => {
    boothFlow.goTo(currentSubStep as any);
  });

  let effectiveBasePrice = $derived(
    boothConfig.config.earlyPaymentPage && boothConfig.config.basePrice > 0
      ? boothConfig.config.basePrice
      : selectedPrice
  );

  function handleStart() {
    currentSubStep = 'tutorial';
  }

  function handleOpenConfig() {
    goto('/settings');
  }

  function handleTutorialNext() {
    if (boothConfig.config.skipPayment) {
      boothFlow.paymentMethod = 'Ticket';
      currentSubStep = 'category_frame';
    } else if (boothConfig.config.earlyPaymentPage) {
      currentSubStep = 'method_select';
    } else {
      currentSubStep = 'category_frame';
    }
  }

  function handleCategoryFrameNext(price: number, frameId: string) {
    selectedPrice = price;
    selectedFrameConfigId = frameId;
    boothFlow.selectedFrameId = frameId;
    if (boothConfig.config.earlyPaymentPage) {
      void updateCheckpointSelection({ selectedFrameId: frameId });
    }
    if (
      !boothConfig.config.earlyPaymentPage &&
      uiConfig.resolvedDesignBlocks?.screens?.payment?.printQtyDialog?.mode === 'dialog'
    ) {
      currentSubStep = 'method_select';
      return;
    }
    currentSubStep = 'print_qty';
  }

  function handlePrintQtyNext(quantity: number) {
    boothFlow.printQty = quantity;
    if (boothConfig.config.skipPayment) {
      boothFlow.paymentMethod = 'Ticket';
      currentSubStep = 'camera';
      void initActiveCheckpoint({
        sessionCode: boothFlow.sessionCode || `LOCAL-${Date.now()}`,
        sessionId: boothFlow.sessionId,
        paymentMethod: 'Ticket',
        selectedFrameId: selectedFrameConfigId,
        totalSlots: 4,
        printQty: quantity,
        status: 'capturing',
        isPaid: false,
      });
    } else if (boothConfig.config.earlyPaymentPage) {
      currentSubStep = 'camera';
      void updateCheckpointSelection({
        selectedFrameId: selectedFrameConfigId,
        printQty: quantity,
        status: 'capturing',
      });
    } else {
      currentSubStep = 'method_select';
    }
  }

  function handleMethodSelect(method: 'ticket' | 'cashless') {
    if (method === 'ticket') {
      boothFlow.paymentMethod = 'Ticket';
      currentSubStep = 'ticket';
    } else {
      boothFlow.paymentMethod = 'Cashless';
      currentSubStep = 'payment';
    }
  }

  function handlePaymentSuccess() {
    boothFlow.paymentMethod = 'Cashless';
    const isEarly = boothConfig.config.earlyPaymentPage;
    if (isEarly) {
      currentSubStep = 'category_frame';
    } else {
      currentSubStep = 'camera';
    }
    void initActiveCheckpoint({
      sessionCode: boothFlow.sessionCode || `TRX-${Date.now()}`,
      sessionId: boothFlow.sessionId,
      paymentMethod: 'Cashless',
      selectedFrameId: isEarly ? null : selectedFrameConfigId,
      totalSlots: 4,
      printQty: boothFlow.printQty,
      status: isEarly ? 'selecting_frame' : 'capturing',
      isPaid: true,
    });
  }

  function handleCameraComplete(photos: string[]) {
    boothFlow.photosTaken = photos;
    currentSubStep = 'customize';
    void updateCheckpointStatus('customizing');
  }

  function handleCustomizeNext() {
    currentSubStep = 'complete';
    void updateCheckpointStatus('downloading');
  }

  function handleNewSession() {
    boothFlow.reset();
    currentSubStep = 'welcome';
  }

  const CUSTOM_DEFAULT_BG = '#ebf0f7';
  const getCustomBg = (stepKey: string) => uiConfig.getStepStyle(stepKey).background ?? CUSTOM_DEFAULT_BG;

  let designBlockAdapter = $derived(
    createDesktopUiAdapter({
      categories: [],
      templates: [],
      customTutorialImg,
      callbacks: {
        onStart: handleStart,
        onNext: handleTutorialNext,
        onBack: () => (currentSubStep = 'welcome'),
      },
    }),
  );
</script>

<ProgressiveBackground
  src={uiConfig.getStepImageSrc(SUBSTEP_TO_UI_STEP[currentSubStep])}
  blurSrc={uiConfig.getStepBlur(SUBSTEP_TO_UI_STEP[currentSubStep])}
  class="w-screen h-screen overflow-hidden text-white select-none font-['Poppins',sans-serif]"
  style="background: {getCustomBg(SUBSTEP_TO_UI_STEP[currentSubStep])};"
>
  {#if currentSubStep === 'welcome'}
    <KioskStartShell variant="custom" onOpenConfig={handleOpenConfig}>
      <StartScreen doc={uiConfig.resolvedDesignBlocks} adapter={designBlockAdapter} />
    </KioskStartShell>
  {:else if currentSubStep === 'tutorial'}
    <TutorialScreen doc={uiConfig.resolvedDesignBlocks} adapter={designBlockAdapter} />
  {:else if currentSubStep === 'category_frame'}
    <KioskFrameWrapper
      doc={uiConfig.resolvedDesignBlocks}
      onSelectFrame={(frameId, price) => handleCategoryFrameNext(price, frameId)}
      onBack={() => {
        if (boothConfig.config.earlyPaymentPage && !boothConfig.config.skipPayment) {
          currentSubStep = 'method_select';
        } else {
          currentSubStep = 'tutorial';
        }
      }}
    />
  {:else if currentSubStep === 'print_qty'}
    <V1PrintQty
      background={getCustomBg('frame')}
      basePrice={effectiveBasePrice}
      onNext={handlePrintQtyNext}
      onBack={() => (currentSubStep = 'category_frame')}
    />
  {:else if currentSubStep === 'method_select'}
    <KioskPaymentWrapper
      doc={uiConfig.resolvedDesignBlocks}
      basePrice={effectiveBasePrice}
      onSelect={handleMethodSelect}
      onBack={() => {
        if (boothConfig.config.earlyPaymentPage) {
          currentSubStep = 'tutorial';
        } else {
          currentSubStep = 'print_qty';
        }
      }}
    />
  {:else if currentSubStep === 'ticket'}
    <KioskTicketWrapper
      doc={uiConfig.resolvedDesignBlocks}
      onSuccess={() => {
        boothFlow.paymentMethod = 'Ticket';
        const isEarly = boothConfig.config.earlyPaymentPage;
        if (isEarly) {
          currentSubStep = 'category_frame';
        } else {
          currentSubStep = 'camera';
        }
        void initActiveCheckpoint({
          sessionCode: boothFlow.sessionCode || `LOCAL-${Date.now()}`,
          sessionId: boothFlow.sessionId,
          paymentMethod: 'Ticket',
          selectedFrameId: isEarly ? null : selectedFrameConfigId,
          totalSlots: 4,
          printQty: boothFlow.printQty,
          status: isEarly ? 'selecting_frame' : 'capturing',
          isPaid: true,
        });
      }}
      onBack={() => (currentSubStep = 'method_select')}
    />
  {:else if currentSubStep === 'payment'}
    <KioskQrisWrapper
      doc={uiConfig.resolvedDesignBlocks}
      totalPrice={effectiveBasePrice * (boothFlow.printQty || 1)}
      onSuccess={handlePaymentSuccess}
      onBack={() => (currentSubStep = 'method_select')}
    />
  {:else if currentSubStep === 'camera'}
    <KioskSessionWrapper
      doc={uiConfig.resolvedDesignBlocks}
      frameConfigId={selectedFrameConfigId}
      onComplete={handleCameraComplete}
      onBack={() => (currentSubStep = 'category_frame')}
    />
  {:else if currentSubStep === 'customize'}
    <V1Customize
      background={getCustomBg('filter')}
      photos={boothFlow.photosTaken}
      frameConfigId={selectedFrameConfigId}
      onNext={handleCustomizeNext}
    />
  {:else if currentSubStep === 'complete'}
    {#if uiConfig.resolvedDesignBlocks?.screens?.softfile}
      <KioskSoftfileWrapper
        doc={uiConfig.resolvedDesignBlocks}
        photos={boothFlow.photosTaken}
        frameConfigId={selectedFrameConfigId}
        onDone={handleNewSession}
      />
    {:else}
      <V1Complete background={getCustomBg('download')} photos={boothFlow.photosTaken} frameConfigId={selectedFrameConfigId} onNewSession={handleNewSession} />
    {/if}
  {/if}
</ProgressiveBackground>

