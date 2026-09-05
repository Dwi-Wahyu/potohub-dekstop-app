<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getActivation } from '$lib/db/local';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { fetchAndCacheUiConfig, isTokenValid } from '$lib/api/boothClient';
  import { prefetchBoothAssets } from '$lib/api/prefetch';
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

    const urlParams = new URLSearchParams(window.location.search);
    const isJourneyMode = urlParams.has('journey');

    if (isJourneyMode) {
      boothConfig.init(activation.boothId);
      uiConfig.init(activation.boothId);
      await fetchAndCacheUiConfig();
      // Prefetch aset booth di background agar siap offline
      void prefetchBoothAssets(activation.boothId).catch((e) =>
        console.warn('Prefetch aset booth gagal:', e)
      );
      if (boothConfig.config.cameraMode) {
        await cameraStore.connect(boothConfig.config.cameraMode);
      }
      ready = true;
      return;
    }

    // Pengecekan keabsahan JWT Token saat aplikasi pertama kali dibuka
    const tokenValid = await isTokenValid(activation.token);
    if (tokenValid) {
      // Token valid & perangkat teraktivasi -> Buka Halaman Navigasi pertama kali
      await goto('/onboarding?step=destination');
    } else {
      // Token stale / expired / tidak valid -> Lempar ke onboarding login
      await goto('/onboarding');
    }
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
