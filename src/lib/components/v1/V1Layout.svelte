<script lang="ts">
  import { goto } from '$app/navigation';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import V1Landing from './V1Landing.svelte';
  import V1Tutorial from './V1Tutorial.svelte';
  import V1PaymentMethod from './V1PaymentMethod.svelte';
  import V1CategoryFrame from './V1CategoryFrame.svelte';
  import V1PrintQty from './V1PrintQty.svelte';
  import V1QRISPayment from './V1QRISPayment.svelte';
  import V1Camera from './V1Camera.svelte';
  import V1Customize from './V1Customize.svelte';
  import V1Complete from './V1Complete.svelte';
  import V1TicketScan from './V1TicketScan.svelte';
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
    payment: 'payment',
    camera: 'session',
    customize: 'filter',
    complete: 'download'
  };

  let selectedPrice = $state(35000);
  let selectedFrameConfigId = $state('grid4');

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
      boothFlow.paymentMethod = 'Cash';
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
    currentSubStep = 'print_qty';
  }

  function handlePrintQtyNext(quantity: number) {
    boothFlow.printQty = quantity;
    if (boothConfig.config.skipPayment) {
      boothFlow.paymentMethod = 'Cash';
      currentSubStep = 'camera';
    } else if (boothConfig.config.earlyPaymentPage) {
      currentSubStep = 'camera';
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
    if (boothConfig.config.earlyPaymentPage) {
      currentSubStep = 'category_frame';
    } else {
      currentSubStep = 'camera';
    }
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

  const V1_DEFAULT_BG = 'linear-gradient(135deg, #1e1b4b 0%, #2a2873 50%, #312e81 100%)';
  const getV1Bg = (stepKey: string) => uiConfig.getStepStyle(stepKey).background ?? V1_DEFAULT_BG;
</script>

<ProgressiveBackground
  src={uiConfig.getStepImageSrc(SUBSTEP_TO_UI_STEP[currentSubStep])}
  blurSrc={uiConfig.getStepBlur(SUBSTEP_TO_UI_STEP[currentSubStep])}
  class="w-screen h-screen overflow-hidden text-white select-none font-['Poppins',sans-serif]"
  style="background: {getV1Bg(SUBSTEP_TO_UI_STEP[currentSubStep])};"
>
  {#if currentSubStep === 'welcome'}
    <V1Landing background={getV1Bg('start')} onStart={handleStart} onOpenConfig={handleOpenConfig} />
  {:else if currentSubStep === 'tutorial'}
    <V1Tutorial background={getV1Bg('tutorial')} {customTutorialImg} onNext={handleTutorialNext} onBack={() => (currentSubStep = 'welcome')} />
  {:else if currentSubStep === 'category_frame'}
    <V1CategoryFrame
      background={getV1Bg('frame')}
      onNext={handleCategoryFrameNext}
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
      background={getV1Bg('frame')}
      basePrice={effectiveBasePrice}
      onNext={handlePrintQtyNext}
      onBack={() => (currentSubStep = 'category_frame')}
    />
  {:else if currentSubStep === 'method_select'}
    <V1PaymentMethod
      background={getV1Bg('payment')}
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
    <V1TicketScan
      background={getV1Bg('ticket')}
      onSuccess={() => {
        boothFlow.paymentMethod = 'Ticket';
        if (boothConfig.config.earlyPaymentPage) {
          currentSubStep = 'category_frame';
        } else {
          currentSubStep = 'camera';
        }
      }}
      onBack={() => (currentSubStep = 'method_select')}
    />
  {:else if currentSubStep === 'payment'}
    <V1QRISPayment
      background={getV1Bg('payment')}
      totalPrice={effectiveBasePrice * (boothFlow.printQty || 1)}
      onSuccess={handlePaymentSuccess}
      onBack={() => (currentSubStep = 'method_select')}
    />
  {:else if currentSubStep === 'camera'}
    <V1Camera
      background={getV1Bg('session')}
      frameConfigId={selectedFrameConfigId}
      onComplete={handleCameraComplete}
      onBack={() => (currentSubStep = 'print_qty')}
    />
  {:else if currentSubStep === 'customize'}
    <V1Customize
      background={getV1Bg('filter')}
      photos={boothFlow.photosTaken}
      frameConfigId={selectedFrameConfigId}
      onBack={() => (currentSubStep = 'camera')}
      onNext={handleCustomizeNext}
    />
  {:else if currentSubStep === 'complete'}
    <V1Complete background={getV1Bg('download')} photos={boothFlow.photosTaken} frameConfigId={selectedFrameConfigId} onNewSession={handleNewSession} />
  {/if}
</ProgressiveBackground>
