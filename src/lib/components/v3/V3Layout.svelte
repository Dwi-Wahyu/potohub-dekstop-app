<script lang="ts">
  import { goto } from '$app/navigation';
  import { boothFlow } from '$lib/stores/booth.svelte';
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

  const V3_DEFAULT_BG = '#CD1C33';
  const getV3Bg = (stepKey: string) => uiConfig.getStepStyle(stepKey).background ?? V3_DEFAULT_BG;
</script>

<div
  class="w-screen h-screen overflow-hidden"
  style:background={getV3Bg(step)}
>
  {#if step === 'start'}
    <V3Start background={getV3Bg('start')} onStart={handleStart} onOpenConfig={handleOpenConfig} />
  {:else if step === 'tutorial'}
    <V3Tutorial background={getV3Bg('tutorial')} {customTutorialImg} onNext={handleTutorialNext} onBack={() => (step = 'start')} />
  {:else if step === 'package'}
    <V3Package background={getV3Bg('package')} onSelectPackage={handleSelectPackage} onSelectMethod={handlePaymentSelectMethod} onBack={() => (step = 'tutorial')} />
  {:else if step === 'payment'}
    <V3Payment background={getV3Bg('payment')} selectedPackage={selectedPackage} onSelectMethod={handlePaymentSelectMethod} onBack={() => (step = 'package')} />
  {:else if step === 'ticket'}
    <V3Ticket background={getV3Bg('ticket')} onConfirm={handleTicketConfirm} onBack={() => (step = 'payment')} />
  {:else if step === 'frame'}
    <V3Frame background={getV3Bg('frame')} onSelectFrame={handleSelectFrame} onBack={() => (step = 'payment')} />
  {:else if step === 'session'}
    <V3Session background={getV3Bg('session')} selectedFrame={selectedFrameId} onComplete={handleSessionComplete} onBack={() => (step = 'frame')} />
  {:else if step === 'filter'}
    <V3Filter background={getV3Bg('filter')} selectedFrame={selectedFrameId} onNext={handleFilterNext} onBack={() => (step = 'session')} />
  {:else if step === 'loading'}
    <V3Loading background={getV3Bg('loading')} onDone={handleLoadingDone} />
  {:else if step === 'download'}
    <V3Download background={getV3Bg('download')} selectedFrame={selectedFrameId} onDone={handleDone} />
  {/if}
</div>
