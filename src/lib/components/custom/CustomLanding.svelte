<script lang="ts">
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import PinPad from '$lib/components/shared/PinPad.svelte';

  interface Props {
    onStart: () => void;
    onOpenConfig: () => void;
  }

  let { onStart, onOpenConfig }: Props = $props();

  let showPinModal = $state(false);

  let startBtnPos = $derived(uiConfig.getElementPosition('start', 'start_button', { x: 50, y: 82 }));
  let startBtnStyle = $derived(uiConfig.getElementStyle('start', 'start_button', {
    bgColor: '#ebf0f7', textColor: '#2a2873', fontSize: 'Sedang', fontFamily: 'Sans Serif',
  }));
</script>

<div
  class="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none"
  style="background: #ebf0f7; font-family: 'Poppins', sans-serif;"
>
  <button
    type="button"
    onclick={() => (showPinModal = true)}
    class="absolute top-5 right-6 opacity-40 hover:opacity-100 transition-opacity border-none p-2 rounded-full cursor-pointer z-20"
    style="background: #ebf0f7; box-shadow: 8px 8px 16px #c8d2e0, -8px -8px 16px #ffffff;"
    title="Operator PIN"
  >⚙</button>

  <div class="flex flex-col items-center gap-3 text-center px-4">
    <h1
      class="text-[clamp(48px,8vw,96px)] font-bold tracking-tight m-0"
      style="color: var(--neu-primary, #2a2873);"
    >{uiConfig.config.boothName}</h1>
    <p class="text-base m-0" style="color: #64748b;">{uiConfig.config.tagline}</p>
  </div>

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
    Mulai
  </button>

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
