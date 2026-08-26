<script lang="ts">
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import type { StoreCategory } from '$lib/stores/uiConfig.svelte';
  import V3Start from './V3Start.svelte';
  import V1ConfigDashboard from '$lib/components/v1/V1ConfigDashboard.svelte';
  import V3Tutorial from './V3Tutorial.svelte';
  import V3Package from './V3Package.svelte';
  import V3Payment from './V3Payment.svelte';
  import V3Ticket from './V3Ticket.svelte';
  import V3Frame from './V3Frame.svelte';
  import V3Session from './V3Session.svelte';
  import V3Filter from './V3Filter.svelte';
  import V3Loading from './V3Loading.svelte';
  import V3Download from './V3Download.svelte';

  type V3Step =
    | 'start'
    | 'config'
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
    step = 'config';
  }

  function handleConfigBack() {
    step = 'start';
  }

  function handleTutorialNext() {
    step = 'package';
  }

  function handleSelectPackage(pkg: StoreCategory) {
    selectedPackage = pkg;
    step = 'payment';
  }

  function handlePaymentSelectMethod(method: 'ticket' | 'cashless') {
    if (method === 'ticket') {
      step = 'ticket';
    } else {
      step = 'frame';
    }
  }

  function handleTicketConfirm() {
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
    step = 'loading';
  }

  function handleLoadingDone() {
    step = 'download';
  }

  function handleDone() {
    boothFlow.reset();
    step = 'start';
  }
</script>

<div
  class="w-screen h-screen overflow-hidden bg-[#0a0a0f]"
  style:background={uiConfig.getStepStyle(step === 'config' ? 'start' : step).background ?? undefined}
>
  {#if step === 'start'}
    <V3Start onStart={handleStart} onOpenConfig={handleOpenConfig} />
  {:else if step === 'config'}
    <V1ConfigDashboard onBack={handleConfigBack} onLogout={handleConfigBack} />
  {:else if step === 'tutorial'}
    <V3Tutorial onNext={handleTutorialNext} onBack={() => (step = 'start')} />
  {:else if step === 'package'}
    <V3Package onSelectPackage={handleSelectPackage} onBack={() => (step = 'tutorial')} />
  {:else if step === 'payment'}
    <V3Payment selectedPackage={selectedPackage} onSelectMethod={handlePaymentSelectMethod} onBack={() => (step = 'package')} />
  {:else if step === 'ticket'}
    <V3Ticket onConfirm={handleTicketConfirm} onBack={() => (step = 'payment')} />
  {:else if step === 'frame'}
    <V3Frame onSelectFrame={handleSelectFrame} onBack={() => (step = 'payment')} />
  {:else if step === 'session'}
    <V3Session selectedFrame={selectedFrameId} onComplete={handleSessionComplete} onBack={() => (step = 'frame')} />
  {:else if step === 'filter'}
    <V3Filter onNext={handleFilterNext} onBack={() => (step = 'session')} />
  {:else if step === 'loading'}
    <V3Loading onDone={handleLoadingDone} />
  {:else if step === 'download'}
    <V3Download onDone={handleDone} />
  {/if}
</div>
