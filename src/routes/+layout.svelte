<script lang="ts">
  import '../globals.css';
  import { onMount } from 'svelte';
  import { networkStatus } from '$lib/stores/networkStatus.svelte';
  import { printerStore } from '$lib/printer.svelte';
  import { syncBoothSettings } from '$lib/api/boothClient';
  import { updaterStore } from '$lib/utils/updater.svelte';
  import { startIdleQueueWatcher } from '$lib/utils/idleCoordinator';
  import GlobalOperatorModal from '$lib/components/shared/GlobalOperatorModal.svelte';

  let { children } = $props();

  onMount(() => {
    networkStatus.init();
    void printerStore.loadPrinters();
    startIdleQueueWatcher();

    const updateTimer = setTimeout(() => {
      void updaterStore.checkForUpdates(true);
    }, 2500);

    // Background sync periodik (tiap 10 menit) bila online
    const interval = setInterval(() => {
      if (networkStatus.isOnline) {
        void syncBoothSettings().catch((e) =>
          console.warn('[PeriodicSync] Gagal sync background:', e)
        );
      }
    }, 10 * 60 * 1000);

    return () => {
      clearTimeout(updateTimer);
      clearInterval(interval);
    };
  });
</script>

{@render children()}
<GlobalOperatorModal />
