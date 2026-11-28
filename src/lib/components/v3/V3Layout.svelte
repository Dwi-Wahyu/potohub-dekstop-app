<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import type { StoreCategory } from '$lib/stores/uiConfig.svelte';
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
  import V3Session from './V3Session.svelte';
  import V3Filter from './V3Filter.svelte';
  import V3Loading from './V3Loading.svelte';
  import V3Download from './V3Download.svelte';
  import V3Timer from './V3Timer.svelte';
  import V1PrintQty from '../v1/V1PrintQty.svelte';
  import ProgressiveBackground from '$lib/components/shared/ProgressiveBackground.svelte';

  interface Props {
    customTutorialImg?: string;
  }

  let { customTutorialImg }: Props = $props();

  type V3Step =
    | 'start'
    | 'tutorial'
    | 'package'
    | 'print_qty'
    | 'payment'
    | 'ticket'
    | 'frame'
    | 'session'
    | 'filter'
    | 'loading'
    | 'download';

  let step = $state<V3Step>('start');
  let selectedPackage = $state<StoreCategory | null>(null);
  let selectedFrameId = $state('frame1');
  let seenForceReset = boothFlow.forceResetCounter;

  $effect(() => {
    if (boothFlow.forceResetCounter !== seenForceReset) {
      seenForceReset = boothFlow.forceResetCounter;
      step = 'start';
    }
  });

  onMount(async () => {
    try {
      const cp = await getActiveCheckpoint();
      if (cp && isCheckpointValid(cp)) {
        const { allSlotsRestored } = await restoreActiveSession(cp);
        if (cp.status === 'selecting_frame') {
          selectedFrameId = cp.selectedFrameId || '';
          step = 'frame';
        } else if (allSlotsRestored || cp.status === 'customizing') {
          selectedFrameId = cp.selectedFrameId || 'frame1';
          step = 'filter';
        } else {
          selectedFrameId = cp.selectedFrameId || 'frame1';
          step = 'session';
        }
      } else if (cp) {
        await clearActiveCheckpoint();
      }
    } catch (err) {
      console.warn('[V3Layout] Gagal memulihkan checkpoint sesi aktif:', err);
    }
  });

  $effect(() => {
    boothFlow.goTo(step as any);
  });

  function handleStart() {
    step = 'tutorial';
  }

  function handleOpenConfig() {
    goto('/settings');
  }

  function handleTutorialNext() {
    if (boothConfig.config.skipPayment) {
      boothFlow.paymentMethod = 'Ticket';
      step = 'frame';
    } else if (boothConfig.config.earlyPaymentPage) {
      step = 'package';
    } else {
      step = 'frame';
    }
  }

  function handleSelectPackage(pkg: StoreCategory) {
    selectedPackage = pkg;
    step = 'payment';
  }

  function handlePaymentSelectMethod(method: 'ticket' | 'cashless') {
    if (method === 'ticket') {
      boothFlow.paymentMethod = 'Ticket';
      step = 'ticket';
    } else {
      boothFlow.paymentMethod = 'Cashless';
      const isEarly = boothConfig.config.earlyPaymentPage;
      if (isEarly) {
        step = 'frame';
      } else {
        step = 'session';
      }
      void initActiveCheckpoint({
        sessionCode: boothFlow.sessionCode || `TRX-${Date.now()}`,
        sessionId: boothFlow.sessionId,
        paymentMethod: 'Cashless',
        selectedFrameId: isEarly ? null : selectedFrameId,
        totalSlots: 3,
        printQty: boothFlow.printQty,
        status: isEarly ? 'selecting_frame' : 'capturing',
        isPaid: true,
      });
    }
  }

  function handleTicketConfirm() {
    boothFlow.paymentMethod = 'Ticket';
    const isEarly = boothConfig.config.earlyPaymentPage;
    if (isEarly) {
      step = 'frame';
    } else {
      step = 'session';
    }
    void initActiveCheckpoint({
      sessionCode: boothFlow.sessionCode || `LOCAL-${Date.now()}`,
      sessionId: boothFlow.sessionId,
      paymentMethod: 'Ticket',
      selectedFrameId: isEarly ? null : selectedFrameId,
      totalSlots: 3,
      printQty: boothFlow.printQty,
      status: isEarly ? 'selecting_frame' : 'capturing',
      isPaid: true,
    });
  }

  function handleSelectFrame(frameId: string) {
    selectedFrameId = frameId;
    boothFlow.selectedFrameId = frameId;
    if (boothConfig.config.skipPayment) {
      boothFlow.paymentMethod = 'Ticket';
      step = 'session';
      void initActiveCheckpoint({
        sessionCode: boothFlow.sessionCode || `LOCAL-${Date.now()}`,
        sessionId: boothFlow.sessionId,
        paymentMethod: 'Ticket',
        selectedFrameId: frameId,
        totalSlots: 3,
        printQty: boothFlow.printQty,
        status: 'capturing',
        isPaid: false,
      });
    } else if (boothConfig.config.earlyPaymentPage) {
      step = 'session';
      void updateCheckpointSelection({
        selectedFrameId: frameId,
        status: 'capturing',
      });
    } else {
      step = 'package';
    }
  }

  function handleSessionComplete(photos: string[]) {
    boothFlow.photosTaken = photos;
    step = 'filter';
    void updateCheckpointStatus('customizing');
  }

  function handleFilterNext() {
    step = 'loading';
    void updateCheckpointStatus('downloading');
  }

  function handleLoadingDone() {
    step = 'download';
  }

  function handleDone() {
    boothFlow.reset();
    step = 'start';
  }

  function handleStepTimeout(timedOutStep: V3Step) {
    switch (timedOutStep) {
      case 'tutorial':
        handleTutorialNext();
        break;
      case 'package':
      case 'payment':
      case 'ticket':
        handleDone();
        break;
      case 'frame':
        if (boothConfig.config.skipPayment) {
          step = 'session';
        } else if (boothConfig.config.earlyPaymentPage) {
          step = 'session';
        } else {
          step = 'package';
        }
        break;
      case 'session':
        step = 'filter';
        break;
      case 'filter':
        step = 'loading';
        break;
      case 'download':
        handleDone();
        break;
    }
  }

  const V3_DEFAULT_BG_MAP: Record<string, string> = {
    start: '#CD1C33 repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.05) 40px, rgba(0,0,0,0.05) 80px)',
    tutorial: '#fdfdfd',
    package: '#fdfdfd',
    payment: '#fdfdfd',
    ticket: '#fdfdfd',
    frame: '#f5f5f5',
    session: '#fdfdfd',
    filter: '#fdfdfd',
    loading: '#CD1C33 repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.05) 40px, rgba(0,0,0,0.05) 80px)',
    download: '#fdfdfd'
  };
  const getV3Bg = (stepKey: string) => uiConfig.getStepStyle(stepKey).background ?? V3_DEFAULT_BG_MAP[stepKey] ?? '#fdfdfd';

  let v3BasePrice = $derived(
    boothConfig.config.earlyPaymentPage && boothConfig.config.basePrice > 0
      ? boothConfig.config.basePrice
      : (selectedPackage?.basePrice ?? uiConfig.config.categories[0]?.basePrice ?? 35000),
  );

  const V3_STEP_TO_UI_STEP: Record<V3Step, string> = {
    start: 'start',
    tutorial: 'tutorial',
    package: 'payment',
    print_qty: 'frame',
    payment: 'qris',
    ticket: 'ticket',
    frame: 'frame',
    session: 'session',
    filter: 'filter',
    loading: 'loading',
    download: 'download',
  };

  let designBlockAdapter = $derived(
    createDesktopUiAdapter({
      categories: [],
      templates: [],
      customTutorialImg,
      callbacks: {
        onStart: handleStart,
        onNext: handleTutorialNext,
        onBack: () => (step = 'start'),
      },
    }),
  );
</script>

<ProgressiveBackground
  src={uiConfig.getStepImageSrc(V3_STEP_TO_UI_STEP[step])}
  blurSrc={uiConfig.getStepBlur(V3_STEP_TO_UI_STEP[step])}
  class="w-screen h-screen overflow-hidden"
  style="background: {getV3Bg(V3_STEP_TO_UI_STEP[step])};"
>
  {#if step === 'start'}
    <KioskStartShell variant="v3" onOpenConfig={handleOpenConfig}>
      <StartScreen doc={uiConfig.resolvedDesignBlocks} adapter={designBlockAdapter} />
    </KioskStartShell>
  {:else if step === 'tutorial'}
    <TutorialScreen doc={uiConfig.resolvedDesignBlocks} adapter={designBlockAdapter} />
  {:else if step === 'package'}
    <KioskPaymentWrapper
      doc={uiConfig.resolvedDesignBlocks}
      basePrice={v3BasePrice}
      enableQtyModal={true}
      onSelect={(method) => {
        if (method === 'ticket') {
          handlePaymentSelectMethod('ticket');
        } else if (uiConfig.resolvedDesignBlocks?.screens?.payment?.printQtyDialog?.mode === 'page') {
          step = 'print_qty';
        } else {
          step = 'payment';
        }
      }}
      onBack={() => {
        if (boothConfig.config.earlyPaymentPage) {
          step = 'tutorial';
        } else {
          step = 'frame';
        }
      }}
    />
  {:else if step === 'print_qty'}
    <V1PrintQty
      background={getV3Bg('frame')}
      basePrice={v3BasePrice}
      onNext={(qty) => {
        boothFlow.printQty = qty;
        step = 'payment';
      }}
      onBack={() => (step = 'package')}
    />
  {:else if step === 'payment'}
    <KioskQrisWrapper
      doc={uiConfig.resolvedDesignBlocks}
      totalPrice={v3BasePrice * (boothFlow.printQty || 1)}
      onSuccess={() => handlePaymentSelectMethod('cashless')}
      onBack={() => (step = 'package')}
    />
  {:else if step === 'ticket'}
    <KioskTicketWrapper
      doc={uiConfig.resolvedDesignBlocks}
      onSuccess={handleTicketConfirm}
      onBack={() => (step = 'package')}
    />
  {:else if step === 'frame'}
    <KioskFrameWrapper
      doc={uiConfig.resolvedDesignBlocks}
      onSelectFrame={(frameId) => handleSelectFrame(frameId)}
      onBack={() => {
        if (boothConfig.config.earlyPaymentPage && !boothConfig.config.skipPayment) {
          step = 'payment';
        } else {
          step = 'tutorial';
        }
      }}
    />
  {:else if step === 'session'}
    {#if uiConfig.config.designBlocks?.screens?.session}
      <KioskSessionWrapper
        doc={uiConfig.resolvedDesignBlocks}
        frameConfigId={selectedFrameId}
        onComplete={handleSessionComplete}
        onBack={() => (step = 'frame')}
      />
    {:else}
      <V3Session background={getV3Bg('session')} selectedFrame={selectedFrameId} onComplete={handleSessionComplete} />
    {/if}
  {:else if step === 'filter'}
    <V3Filter background={getV3Bg('filter')} selectedFrame={selectedFrameId} onNext={handleFilterNext} />
  {:else if step === 'loading'}
    <V3Loading background={getV3Bg('loading')} onDone={handleLoadingDone} />
  {:else if step === 'download'}
    {#if uiConfig.resolvedDesignBlocks?.screens?.softfile}
      <KioskSoftfileWrapper
        doc={uiConfig.resolvedDesignBlocks}
        photos={boothFlow.photosTaken}
        frameConfigId={selectedFrameId}
        onDone={handleDone}
      />
    {:else}
      <V3Download background={getV3Bg('download')} selectedFrame={selectedFrameId} onDone={handleDone} />
    {/if}
  {/if}

  <V3Timer {step} onTimeout={handleStepTimeout} />
</ProgressiveBackground>
