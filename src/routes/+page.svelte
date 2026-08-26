<script lang="ts">
  import { onMount } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { fetchAndCacheUiConfig } from '$lib/api/boothClient';
  import V1Layout from '$lib/components/v1/V1Layout.svelte';
  import V2Layout from '$lib/components/v2/V2Layout.svelte';
  import V3Layout from '$lib/components/v3/V3Layout.svelte';

  onMount(async () => {
    boothConfig.init('default');
    uiConfig.init('default');
    // Best-effort: fetch UI config, fallback to local cache/default if offline
    await fetchAndCacheUiConfig();

    // Auto-connect camera on startup using saved setting
    if (boothConfig.config.cameraMode) {
      await cameraStore.connect(boothConfig.config.cameraMode);
    }
  });
</script>

{#if uiConfig.templateVariant === 'v2'}
  <V2Layout />
{:else if uiConfig.templateVariant === 'v3'}
  <V3Layout />
{:else}
  <V1Layout />
{/if}
