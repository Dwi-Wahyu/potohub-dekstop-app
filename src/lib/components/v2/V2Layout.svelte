<script lang="ts">
  import { goto } from '$app/navigation';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import V2Landing from './V2Landing.svelte';
  import V2Tutorial from './V2Tutorial.svelte';
  import V2Payment from './V2Payment.svelte';
  import V2Qris from './V2Qris.svelte';
  import V2Ticket from './V2Ticket.svelte';
  import V2Frame from './V2Frame.svelte';
  import V2Session from './V2Session.svelte';
  import V2Filter from './V2Filter.svelte';
  import V2Download from './V2Download.svelte';
  import ProgressiveBackground from '$lib/components/shared/ProgressiveBackground.svelte';

  interface Props {
    customTutorialImg?: string;
  }

  let { customTutorialImg }: Props = $props();

  type V2Step =
    | 'landing'
    | 'tutorial'
    | 'payment'
    | 'qris'
    | 'ticket'
    | 'frame'
    | 'session'
    | 'filter'
    | 'download';

  const V2_STEP_TO_UI_STEP: Record<V2Step, string> = {
    landing: 'start',
    tutorial: 'tutorial',
    payment: 'payment',
    qris: 'payment',
    ticket: 'ticket',
    frame: 'frame',
    session: 'session',
    filter: 'filter',
    download: 'download'
  };

  let step = $state<V2Step>('landing');
  let selectedFrameId = $state('strip-2x4');

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
      step = 'payment';
    } else {
      step = 'frame';
    }
  }

  function handlePaymentSelect(method: 'ticket' | 'cashless') {
    if (method === 'ticket') {
      boothFlow.paymentMethod = 'Ticket';
      step = 'ticket';
    } else {
      boothFlow.paymentMethod = 'Cashless';
      step = 'qris';
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

  function handleQrisSuccess() {
    boothFlow.paymentMethod = 'Cashless';
    if (boothConfig.config.earlyPaymentPage) {
      step = 'frame';
    } else {
      step = 'session';
    }
  }

  function handleSelectFrame(frameId: string) {
    selectedFrameId = frameId;
    boothFlow.selectedFrameId = frameId;
    if (boothConfig.config.skipPayment) {
      boothFlow.paymentMethod = 'Cash';
      step = 'session';
    } else if (boothConfig.config.earlyPaymentPage) {
      step = 'session';
    } else {
      step = 'payment';
    }
  }

  function handleSessionComplete(photos: string[]) {
    boothFlow.photosTaken = photos;
    step = 'filter';
  }

  function handleFilterNext() {
    step = 'download';
  }

  function handleDone() {
    boothFlow.reset();
    step = 'landing';
  }

  const V2_DEFAULT_BG = '#fafafa';
  const getV2Bg = (stepKey: string) => uiConfig.getStepStyle(stepKey).background ?? V2_DEFAULT_BG;
</script>

<ProgressiveBackground
  src={uiConfig.getStepImageSrc(V2_STEP_TO_UI_STEP[step])}
  blurSrc={uiConfig.getStepBlur(V2_STEP_TO_UI_STEP[step])}
  class="w-screen h-screen overflow-hidden"
  style="background: {getV2Bg(V2_STEP_TO_UI_STEP[step])};"
>
  {#if step === 'landing'}
    <V2Landing background={getV2Bg('start')} onStart={handleStart} onOpenConfig={handleOpenConfig} />
  {:else if step === 'tutorial'}
    <V2Tutorial background={getV2Bg('tutorial')} {customTutorialImg} onNext={handleTutorialNext} onBack={() => (step = 'landing')} />
  {:else if step === 'payment'}
    <V2Payment
      background={getV2Bg('payment')}
      onSelect={handlePaymentSelect}
      onBack={() => {
        if (boothConfig.config.earlyPaymentPage) {
          step = 'tutorial';
        } else {
          step = 'frame';
        }
      }}
    />
  {:else if step === 'qris'}
    <V2Qris background={getV2Bg('payment')} onSuccess={handleQrisSuccess} onBack={() => (step = 'payment')} />
  {:else if step === 'ticket'}
    <V2Ticket background={getV2Bg('ticket')} onConfirm={handleTicketConfirm} onBack={() => (step = 'payment')} />
  {:else if step === 'frame'}
    <V2Frame
      background={getV2Bg('frame')}
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
    <V2Session
      background={getV2Bg('session')}
      selectedFrame={selectedFrameId}
      onComplete={handleSessionComplete}
      onBack={() => (step = 'frame')}
    />
  {:else if step === 'filter'}
    <V2Filter background={getV2Bg('filter')} selectedFrame={selectedFrameId} onNext={handleFilterNext} onBack={() => (step = 'session')} />
  {:else if step === 'download'}
    <V2Download background={getV2Bg('download')} selectedFrame={selectedFrameId} onDone={handleDone} />
  {/if}
</ProgressiveBackground>
