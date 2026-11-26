<script lang="ts">
  import '../globals.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { appState } from '$lib/appState.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { setKioskLockedMode } from '$lib/utils/windowControl';
  import { networkStatus } from '$lib/stores/networkStatus.svelte';
  import { printerStore } from '$lib/printer.svelte';
  import { syncBoothSettings } from '$lib/api/boothClient';
  import { updaterStore } from '$lib/utils/updater.svelte';
  import { startIdleQueueWatcher } from '$lib/utils/idleCoordinator';
  import GlobalOperatorModal from '$lib/components/shared/GlobalOperatorModal.svelte';

  let { children } = $props();

  const LANDING_STEPS = new Set(['welcome', 'landing', 'start']);

  // True ketika user sedang berada di dalam alur customer journey (setelah layar start/welcome)
  let isInCustomerJourney = $derived(
    page.url.pathname === '/' && !LANDING_STEPS.has(boothFlow.step)
  );

  // Kunci otomatis akses operator & mode kiosk saat memasuki alur customer journey
  $effect(() => {
    if (isInCustomerJourney) {
      appState.isLocked = true;
      void setKioskLockedMode(true);
    }
  });

  function handleContextMenu(event: MouseEvent) {
    if (appState.isLocked || isInCustomerJourney) {
      event.preventDefault();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!appState.isLocked && !isInCustomerJourney) return;

    const key = event.key.toLowerCase();
    const ctrlOrMeta = event.ctrlKey || event.metaKey;

    // Blokir F12, F5, Ctrl+R / Ctrl+Shift+R, dan Ctrl+Shift+I saat dalam customer journey atau akses operator terkunci
    if (
      event.key === 'F12' ||
      event.key === 'F5' ||
      (ctrlOrMeta && key === 'r') ||
      (ctrlOrMeta && event.shiftKey && key === 'i')
    ) {
      event.preventDefault();
    }
  }

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

<svelte:window oncontextmenu={handleContextMenu} onkeydown={handleKeydown} />

{@render children()}
<GlobalOperatorModal />
