<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getActivation } from '$lib/db/local';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { fetchAndCacheUiConfig, syncBoothSettings } from '$lib/api/boothClient';
  import V1Layout from '$lib/components/v1/V1Layout.svelte';
  import V2Layout from '$lib/components/v2/V2Layout.svelte';
  import V3Layout from '$lib/components/v3/V3Layout.svelte';
  import CustomLayout from '$lib/components/custom/CustomLayout.svelte';

  let ready = $state(false);

  onMount(async () => {
    const activation = await getActivation();
    if (!activation || !activation.boothId) {
      await goto('/onboarding');
      return;
    }

    // Muat cache UI & pengaturan lokal langsung agar layar awal tampil instan tanpa menunggu jaringan/kamera
    boothConfig.init(activation.boothId);
    uiConfig.init(activation.boothId);
    ready = true;

    // Segarkan UI terbaru dari server di background + siapkan kamera tanpa memblokir render awal
    void fetchAndCacheUiConfig(true).catch(() => {});
    void syncBoothSettings().catch((e) =>
      console.warn('Sync pengaturan booth awal gagal:', e),
    );
    void (async () => {
      await cameraStore.checkDevMode();
      if (boothConfig.config.cameraMode) {
        await cameraStore.connect(boothConfig.config.cameraMode);
      }
    })().catch((e) => console.warn('Inisialisasi kamera background gagal:', e));
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
