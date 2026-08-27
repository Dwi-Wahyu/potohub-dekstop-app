<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getActivation } from '$lib/db/local';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { fetchAndCacheUiConfig } from '$lib/api/boothClient';
  import V1Layout from '$lib/components/v1/V1Layout.svelte';
  import V2Layout from '$lib/components/v2/V2Layout.svelte';
  import V3Layout from '$lib/components/v3/V3Layout.svelte';
  import CustomLayout from '$lib/components/custom/CustomLayout.svelte';

  let ready = $state(false);

  onMount(async () => {
    const activation = await getActivation();
    if (!activation) {
      await goto('/onboarding');
      return;
    }
    boothConfig.init(activation.boothId);
    uiConfig.init(activation.boothId);
    await fetchAndCacheUiConfig();
    if (boothConfig.config.cameraMode) {
      await cameraStore.connect(boothConfig.config.cameraMode);
    }
    ready = true;
  });
</script>

{#if ready}
  {#if uiConfig.templateVariant === 'v2'}
    <V2Layout />
  {:else if uiConfig.templateVariant === 'v3'}
    <V3Layout />
  {:else if uiConfig.templateVariant === 'custom'}
    <CustomLayout />
  {:else}
    <V1Layout />
  {/if}
{/if}
