<script lang="ts">
  import { goto } from '$app/navigation';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import type { StoreCategory } from '$lib/stores/uiConfig.svelte';
  import V3Start from './V3Start.svelte';
  import V3Tutorial from './V3Tutorial.svelte';
  import V3Package from './V3Package.svelte';
  import V3Payment from './V3Payment.svelte';
  import V3Ticket from './V3Ticket.svelte';
  import V3Frame from './V3Frame.svelte';
  import V3Session from './V3Session.svelte';
  import V3Filter from './V3Filter.svelte';
  import V3Loading from './V3Loading.svelte';
  import V3Download from './V3Download.svelte';
  import V3Timer from './V3Timer.svelte';
  import ProgressiveBackground from '$lib/components/shared/ProgressiveBackground.svelte';

  interface Props {
    customTutorialImg?: string;
  }

  let { customTutorialImg }: Props = $props();

  type V3Step =
    | 'start'
    | 'tutorial'
    | 'package'
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

  function handleStart() {
    step = 'tutorial';
  }

  function handleOpenConfig() {
    goto('/settings');
  }

  function handleTutorialNext() {
    if (boothConfig.config.skipPayment) {
      boothFlow.paymentMethod = 'Cash';
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
      if (boothConfig.config.earlyPaymentPage) {
        step = 'frame';
      } else {
        step = 'session';
      }
    }
  }

  function handleTicketConfirm() {
    boothFlow.paymentMethod = 'Ticket';
    if (boothConfig.config.earlyPaymentPage) {
      step = 'frame';
    } else {
      step = 'session';
    }
  }

  function handleSelectFrame(frameId: string) {
    selectedFrameId = frameId;
    if (boothConfig.config.skipPayment) {
      boothFlow.paymentMethod = 'Cash';
      step = 'session';
    } else if (boothConfig.config.earlyPaymentPage) {
      step = 'session';
    } else {
      step = 'package';
    }
  }

  function handleSessionComplete(photos: string[]) {
    boothFlow.photosTaken = photos;
    step = 'filter';
  }

  function handleFilterNext() {
    step = 'loading';
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
</script>

<ProgressiveBackground
  src={uiConfig.getStepImageSrc(step)}
  blurSrc={uiConfig.getStepBlur(step)}
  class="w-screen h-screen overflow-hidden"
  style="background: {getV3Bg(step)};"
>
  {#if step === 'start'}
    <V3Start background={getV3Bg('start')} onStart={handleStart} onOpenConfig={handleOpenConfig} />
  {:else if step === 'tutorial'}
    <V3Tutorial background={getV3Bg('tutorial')} {customTutorialImg} onNext={handleTutorialNext} onBack={() => (step = 'start')} />
  {:else if step === 'package'}
    <V3Package
      background={getV3Bg('package')}
      onSelectPackage={handleSelectPackage}
      onSelectMethod={handlePaymentSelectMethod}
      onBack={() => {
        if (boothConfig.config.earlyPaymentPage) {
          step = 'tutorial';
        } else {
          step = 'frame';
        }
      }}
    />
  {:else if step === 'payment'}
    <V3Payment background={getV3Bg('payment')} selectedPackage={selectedPackage} onSelectMethod={handlePaymentSelectMethod} onBack={() => (step = 'package')} />
  {:else if step === 'ticket'}
    <V3Ticket background={getV3Bg('ticket')} onConfirm={handleTicketConfirm} onBack={() => (step = 'payment')} />
  {:else if step === 'frame'}
    <V3Frame
      background={getV3Bg('frame')}
      onSelectFrame={handleSelectFrame}
      onBack={() => {
        if (boothConfig.config.earlyPaymentPage && !boothConfig.config.skipPayment) {
          step = 'payment';
        } else {
          step = 'tutorial';
        }
      }}
    />
  {:else if step === 'session'}
    <V3Session background={getV3Bg('session')} selectedFrame={selectedFrameId} onComplete={handleSessionComplete} onBack={() => (step = 'frame')} />
  {:else if step === 'filter'}
    <V3Filter background={getV3Bg('filter')} selectedFrame={selectedFrameId} onNext={handleFilterNext} onBack={() => (step = 'session')} />
  {:else if step === 'loading'}
    <V3Loading background={getV3Bg('loading')} onDone={handleLoadingDone} />
  {:else if step === 'download'}
    <V3Download background={getV3Bg('download')} selectedFrame={selectedFrameId} onDone={handleDone} />
  {/if}

  <V3Timer {step} onTimeout={handleStepTimeout} />
</ProgressiveBackground>
