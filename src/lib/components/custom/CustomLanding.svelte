<script lang="ts">
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import PinPad from '$lib/components/shared/PinPad.svelte';
  import IdleBannerModal from '$lib/components/shared/IdleBannerModal.svelte';
  import { Lock } from '@lucide/svelte';

  interface Props {
    onStart: () => void;
    onOpenConfig: () => void;
    background?: string;
  }

  let { onStart, onOpenConfig, background }: Props = $props();

  let showPinModal = $state(false);

  let startBtnPos = $derived(uiConfig.getElementPosition('start', 'start_button', { x: 50, y: 82 }));
  let startBtnStyle = $derived(uiConfig.getElementStyle('start', 'start_button', {
    bgColor: '#ebf0f7', textColor: '#2a2873', fontSize: 'Sedang', fontFamily: 'Sans Serif',
  }));

  let effectiveBg = $derived(
    background ?? uiConfig.getStepStyle('start').background ?? '#ebf0f7'
  );
</script>

<div
  class="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none"
  style:background={effectiveBg}
  style:font-family="'Poppins', sans-serif"
>
  <button
    type="button"
    onclick={() => (showPinModal = true)}
    class="absolute top-5 right-6 opacity-40 hover:opacity-100 transition-opacity border-none p-2 rounded-full cursor-pointer z-20"
    style="background: #ebf0f7; box-shadow: 8px 8px 16px #c8d2e0, -8px -8px 16px #ffffff;"
    title="Operator PIN"
  >
    <Lock />
  </button>

  <button
    onclick={onStart}
    style="
      position: absolute;
      left: {startBtnPos.x}%;
      top: {startBtnPos.y}%;
      transform: translate(-50%, -50%);
      background: {startBtnStyle.bgColor};
      color: {startBtnStyle.textColor};
      box-shadow: 8px 8px 16px #c8d2e0, -8px -8px 16px #ffffff;
    "
    class="px-10 py-4 rounded-2xl border-none font-semibold text-lg cursor-pointer active:shadow-[inset_5px_5px_10px_#c8d2e0,inset_-5px_-5px_10px_#ffffff] transition-shadow z-20"
  >
    {uiConfig.getElementLabel('start', 'start_button', 'Mulai')}
  </button>

  <!-- Idle Promo Banner Popup Slider -->
  <IdleBannerModal disabled={showPinModal} />

  {#if showPinModal}
    <div
      class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onclick={() => (showPinModal = false)}
      role="presentation"
    >
      <PinPad
        onSuccess={() => {
          showPinModal = false;
          onOpenConfig();
        }}
        onCancel={() => (showPinModal = false)}
      />
    </div>
  {/if}
</div>
