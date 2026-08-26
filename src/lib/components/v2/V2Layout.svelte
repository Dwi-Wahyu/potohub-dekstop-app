<script lang="ts">
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import V2Landing from './V2Landing.svelte';
  import V1ConfigDashboard from '$lib/components/v1/V1ConfigDashboard.svelte';
  import V2Tutorial from './V2Tutorial.svelte';
  import V2Payment from './V2Payment.svelte';
  import V2Qris from './V2Qris.svelte';
  import V2Ticket from './V2Ticket.svelte';
  import V2Frame from './V2Frame.svelte';
  import V2Session from './V2Session.svelte';
  import V2Filter from './V2Filter.svelte';
  import V2Download from './V2Download.svelte';

  type V2Step =
    | 'landing'
    | 'config'
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
    config: 'start',
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
    step = 'config';
  }

  function handleConfigBack() {
    step = 'landing';
  }

  function handleTutorialNext() {
    step = 'payment';
  }

  function handlePaymentSelect(method: 'ticket' | 'cashless') {
    if (method === 'ticket') {
      step = 'ticket';
    } else {
      step = 'qris';
    }
  }

  function handleTicketConfirm() {
    step = 'frame';
  }

  function handleQrisSuccess() {
    step = 'frame';
  }

  function handleSelectFrame(frameId: string) {
    selectedFrameId = frameId;
    step = 'session';
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
</script>

<div
  class="w-screen h-screen overflow-hidden bg-[#fafafa]"
  style:background={uiConfig.getStepStyle(V2_STEP_TO_UI_STEP[step]).background ?? undefined}
>
  {#if step === 'landing'}
    <V2Landing onStart={handleStart} onOpenConfig={handleOpenConfig} />
  {:else if step === 'config'}
    <V1ConfigDashboard onBack={handleConfigBack} onLogout={handleConfigBack} />
  {:else if step === 'tutorial'}
    <V2Tutorial onNext={handleTutorialNext} onBack={() => (step = 'landing')} />
  {:else if step === 'payment'}
    <V2Payment onSelect={handlePaymentSelect} onBack={() => (step = 'tutorial')} />
  {:else if step === 'qris'}
    <V2Qris onSuccess={handleQrisSuccess} onBack={() => (step = 'payment')} />
  {:else if step === 'ticket'}
    <V2Ticket onConfirm={handleTicketConfirm} onBack={() => (step = 'payment')} />
  {:else if step === 'frame'}
    <V2Frame onSelectFrame={handleSelectFrame} onBack={() => (step = 'payment')} />
  {:else if step === 'session'}
    <V2Session selectedFrame={selectedFrameId} onComplete={handleSessionComplete} onBack={() => (step = 'frame')} />
  {:else if step === 'filter'}
    <V2Filter onNext={handleFilterNext} onBack={() => (step = 'session')} />
  {:else if step === 'download'}
    <V2Download onDone={handleDone} />
  {/if}
</div>
