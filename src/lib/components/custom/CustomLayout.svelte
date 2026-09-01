<script lang="ts">
  import { goto } from '$app/navigation';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import CustomLanding from './CustomLanding.svelte';
  import V1Tutorial from '$lib/components/v1/V1Tutorial.svelte';
  import V1PaymentMethod from '$lib/components/v1/V1PaymentMethod.svelte';
  import V1CategoryFrame from '$lib/components/v1/V1CategoryFrame.svelte';
  import V1PrintQty from '$lib/components/v1/V1PrintQty.svelte';
  import V1QRISPayment from '$lib/components/v1/V1QRISPayment.svelte';
  import V1Camera from '$lib/components/v1/V1Camera.svelte';
  import V1Customize from '$lib/components/v1/V1Customize.svelte';
  import V1Complete from '$lib/components/v1/V1Complete.svelte';
  import V1TicketScan from '$lib/components/v1/V1TicketScan.svelte';

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
    payment: 'payment',
    camera: 'session',
    customize: 'filter',
    complete: 'download'
  };

  let selectedPrice = $state(35000);
  let selectedFrameConfigId = $state('grid4');

  function handleStart() {
    currentSubStep = 'tutorial';
  }

  function handleOpenConfig() {
    goto('/settings');
  }

  function handleTutorialNext() {
    currentSubStep = 'category_frame';
  }

  function handleCategoryFrameNext(price: number, frameId: string) {
    selectedPrice = price;
    selectedFrameConfigId = frameId;
    currentSubStep = 'print_qty';
  }

  function handlePrintQtyNext(quantity: number) {
    boothFlow.printQty = quantity;
    if (boothConfig.config.paymentPage) {
      currentSubStep = 'method_select';
    } else {
      currentSubStep = 'camera';
    }
  }

  function handleMethodSelect(method: 'ticket' | 'cashless') {
    if (method === 'ticket') {
      currentSubStep = 'ticket';
    } else {
      currentSubStep = 'payment';
    }
  }

  function handlePaymentSuccess() {
    currentSubStep = 'camera';
  }

  function handleCameraComplete(photos: string[]) {
    boothFlow.photosTaken = photos;
    currentSubStep = 'customize';
  }

  function handleCustomizeNext() {
    currentSubStep = 'complete';
  }

  function handleNewSession() {
    boothFlow.reset();
    currentSubStep = 'welcome';
  }

  const CUSTOM_DEFAULT_BG = '#ebf0f7';
  const getCustomBg = (stepKey: string) => uiConfig.getStepStyle(stepKey).background ?? CUSTOM_DEFAULT_BG;
</script>

<div
  class="w-screen h-screen overflow-hidden text-white select-none font-['Poppins',sans-serif]"
  style:background={getCustomBg(SUBSTEP_TO_UI_STEP[currentSubStep])}
>
  {#if currentSubStep === 'welcome'}
    <CustomLanding background={getCustomBg('start')} onStart={handleStart} onOpenConfig={handleOpenConfig} />
  {:else if currentSubStep === 'tutorial'}
    <V1Tutorial background={getCustomBg('tutorial')} onNext={handleTutorialNext} onBack={() => (currentSubStep = 'welcome')} />
  {:else if currentSubStep === 'category_frame'}
    <V1CategoryFrame background={getCustomBg('frame')} onNext={handleCategoryFrameNext} onBack={() => (currentSubStep = 'tutorial')} />
  {:else if currentSubStep === 'print_qty'}
    <V1PrintQty
      background={getCustomBg('frame')}
      basePrice={selectedPrice}
      onNext={handlePrintQtyNext}
      onBack={() => (currentSubStep = 'category_frame')}
    />
  {:else if currentSubStep === 'method_select'}
    <V1PaymentMethod background={getCustomBg('payment')} onSelect={handleMethodSelect} onBack={() => (currentSubStep = 'print_qty')} />
  {:else if currentSubStep === 'ticket'}
    <V1TicketScan
      background={getCustomBg('ticket')}
      onSuccess={() => (currentSubStep = 'camera')}
      onBack={() => (currentSubStep = 'method_select')}
    />
  {:else if currentSubStep === 'payment'}
    <V1QRISPayment
      background={getCustomBg('payment')}
      totalPrice={selectedPrice * boothFlow.printQty}
      onSuccess={handlePaymentSuccess}
      onBack={() => (currentSubStep = 'method_select')}
    />
  {:else if currentSubStep === 'camera'}
    <V1Camera
      background={getCustomBg('session')}
      frameConfigId={selectedFrameConfigId}
      onComplete={handleCameraComplete}
      onBack={() => (currentSubStep = 'print_qty')}
    />
  {:else if currentSubStep === 'customize'}
    <V1Customize
      background={getCustomBg('filter')}
      photos={boothFlow.photosTaken}
      frameConfigId={selectedFrameConfigId}
      onBack={() => (currentSubStep = 'camera')}
      onNext={handleCustomizeNext}
    />
  {:else if currentSubStep === 'complete'}
    <V1Complete background={getCustomBg('download')} photos={boothFlow.photosTaken} frameConfigId={selectedFrameConfigId} onNewSession={handleNewSession} />
  {/if}
</div>

