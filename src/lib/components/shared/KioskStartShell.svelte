<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import PinPad from '$lib/components/shared/PinPad.svelte';
  import IdleBannerModal from '$lib/components/shared/IdleBannerModal.svelte';
  import OperatorAccessControl from '$lib/components/shared/OperatorAccessControl.svelte';
  import DeviceWarningToast from '$lib/components/shared/DeviceWarningToast.svelte';
  import { setWindowDecorations, setWindowMinimizable } from '$lib/utils/windowControl';

  interface Props {
    variant?: 'v1' | 'v2' | 'v3' | 'custom';
    onOpenConfig: () => void;
    children: Snippet;
  }

  let { variant = 'v1', onOpenConfig, children }: Props = $props();

  let showPinModal = $state(false);
  let isOperatorUnlocked = $state(false);

  onMount(() => {
    void setWindowDecorations(false);
    void setWindowMinimizable(false);
  });

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      showPinModal = true;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative w-full h-full overflow-hidden">
  {@render children()}

  <IdleBannerModal disabled={showPinModal} />

  <DeviceWarningToast
    {variant}
    onOpenConfig={() => {
      if (isOperatorUnlocked) {
        onOpenConfig();
      } else {
        showPinModal = true;
      }
    }}
  />

  <OperatorAccessControl
    bind:showPinModal
    bind:isOperatorUnlocked
    onTriggerPin={() => (showPinModal = true)}
    {onOpenConfig}
  />

  {#if showPinModal}
    <div
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onclick={() => (showPinModal = false)}
      role="presentation"
    >
      <PinPad
        onSuccess={() => {
          showPinModal = false;
          isOperatorUnlocked = true;
        }}
        onCancel={() => (showPinModal = false)}
      />
    </div>
  {/if}
</div>
