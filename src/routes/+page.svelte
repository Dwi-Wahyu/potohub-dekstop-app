<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getActivation } from '$lib/db/local';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { cameraStore, isDevWebcamEnabled } from '$lib/camera.svelte';
  import { fetchAndCacheUiConfig } from '$lib/api/boothClient';
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

    // Muat cache UI, aset lokal yang sudah ter-download, & pengaturan lokal langsung tanpa melakukan network sync/download aset saat startup
    boothConfig.init(activation.boothId);
    uiConfig.init(activation.boothId);
    ready = true;

    // Segarkan metadata JSON UI terbaru di background (tanpa mendownload ulang aset media saat startup)
    void fetchAndCacheUiConfig(true).catch(() => {});

    // Siapkan kamera di background tanpa memblokir render awal (download/sync aset hanya dijalankan saat tombol Sync ditekan)
    void (async () => {
      await cameraStore.checkDevMode();
      const targetMode =
        isDevWebcamEnabled() || cameraStore.isDevMode
          ? 'webcam'
          : (boothConfig.config.cameraMode || 'usb');
      await cameraStore.connect(targetMode);
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
