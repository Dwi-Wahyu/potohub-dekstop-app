<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { Clock } from '@lucide/svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';

  export type V3Step =
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

  interface Props {
    step: V3Step;
    onTimeout?: (step: V3Step) => void;
  }

  let { step, onTimeout }: Props = $props();

  function getStepDuration(currentStep: V3Step): number {
    switch (currentStep) {
      case 'tutorial':
        return boothConfig.config.procedureTimeSecs || 15;
      case 'package':
      case 'payment':
      case 'ticket':
        return boothConfig.config.paymentTimeSecs || 120;
      case 'frame':
        return 120;
      case 'session':
        return boothConfig.config.photoSessionTimeSecs || 60;
      case 'filter':
        return 60;
      case 'download':
        return boothConfig.config.endScreenTimeSecs || 60;
      default:
        return 0;
    }
  }

  let initialSecs = $state(0);
  let secs = $state(0);
  let timerId: any = null;

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer(targetStep: V3Step) {
    stopTimer();

    const duration = getStepDuration(targetStep);
    initialSecs = duration;
    secs = duration;

    if (targetStep === 'start' || targetStep === 'loading' || duration <= 0) {
      return;
    }

    timerId = setInterval(() => {
      if (secs > 0) {
        secs--;
      } else {
        stopTimer();
        onTimeout?.(targetStep);
      }
    }, 1000);
  }

  $effect(() => {
    // Only track step changes
    const currentStep = step;

    untrack(() => {
      startTimer(currentStep);
    });

    return () => {
      stopTimer();
    };
  });

  onDestroy(() => {
    stopTimer();
  });

  const fmtSecs = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  let isWarning = $derived(
    secs <= (initialSecs > 60 ? 60 : Math.min(10, Math.floor(initialSecs * 0.4)))
  );

  let isVisible = $derived(step !== 'start' && step !== 'loading' && secs >= 0);
</script>

{#if isVisible}
  <div
    class="absolute bottom-5 right-6 z-50 flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm shadow-2xl transition-all duration-300 select-none pointer-events-none font-['Inter',sans-serif]"
    style="
      background: {isWarning ? '#CD1C33' : 'rgba(10,8,16,0.78)'};
      color: white;
      backdrop-filter: blur(12px);
      box-shadow: {isWarning
        ? '0 0 0 2px rgba(205,28,51,0.4), 0 8px 28px rgba(205,28,51,0.45)'
        : '0 0 0 1px rgba(255,255,255,0.12), 0 6px 20px rgba(0,0,0,0.4)'};
    "
  >
    <div style="opacity: {isWarning ? 1 : 0.7}; display: flex; align-items: center;">
      <Clock size={14} strokeWidth={2.5} />
    </div>
    <span class="tabular-nums tracking-wider">{fmtSecs(secs)}</span>
  </div>
{/if}
