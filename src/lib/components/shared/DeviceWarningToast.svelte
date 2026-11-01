<script lang="ts">
  import { onMount } from 'svelte';
  import { AlertTriangle, Camera, Printer, RotateCw, Settings, Info, RefreshCw } from '@lucide/svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { printerStore } from '$lib/printer.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';

  interface Props {
    variant?: 'v1' | 'v2' | 'v3' | 'custom';
    onOpenConfig?: () => void;
  }

  let { variant = 'v1', onOpenConfig }: Props = $props();

  let settled = $state(false);
  let isCheckingAll = $state(false);
  let isConnectingCamera = $state(false);
  let isConnectingPrinter = $state(false);

  let cameraFailedMessage = $state<string | null>(null);
  let printerFailedMessage = $state<string | null>(null);

  onMount(() => {
    // Grace period 2.5 detik saat startup untuk mencegah false alarm saat probe perangkat
    const timer = setTimeout(() => {
      settled = true;
    }, 2500);

    // Jika printer belum dimuat, panggil loadPrinters
    if (printerStore.status === null && !printerStore.isDetecting) {
      void printerStore.loadPrinters();
    }

    // Refresh status saat window kembali aktif (misal setelah operator kembali dari Config Dashboard)
    const handleFocus = () => {
      void handleRefreshAll();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', handleFocus);
    };
  });

  // Re-koneksi manual khusus Kamera (misal kamera sleep / busy)
  async function handleConnectCamera() {
    if (isConnectingCamera) return;
    isConnectingCamera = true;
    cameraFailedMessage = null;
    try {
      // Putuskan koneksi lama jika kamera dalam status busy/lock
      await cameraStore.disconnect().catch(() => {});
      // Deteksi ulang port USB
      await cameraStore.detect();
      // Hubungkan kembali kamera sesuai mode
      const mode = boothConfig.config.cameraMode || 'usb';
      await cameraStore.connect(mode);

      if (cameraStore.status !== 'connected') {
        cameraFailedMessage = 'Tidak berhasil mendeteksi kamera, silakan cek koneksi USB';
      }
    } catch (err) {
      console.warn('Gagal rekoneksi kamera:', err);
      cameraFailedMessage = 'Tidak berhasil mendeteksi kamera, silakan cek koneksi USB';
    } finally {
      isConnectingCamera = false;
    }
  }

  // Re-koneksi manual khusus Printer
  async function handleConnectPrinter() {
    if (isConnectingPrinter) return;
    isConnectingPrinter = true;
    printerFailedMessage = null;
    try {
      await printerStore.loadPrinters();
      await printerStore.refreshStatus();

      const isReady =
        printerStore.printers.length > 0 &&
        !!printerStore.selectedPrinter &&
        printerStore.status?.is_online === true &&
        printerStore.status?.is_ready === true &&
        !printerStore.status?.has_error;

      if (!isReady) {
        printerFailedMessage =
          printerStore.errorMessage || 'Tidak berhasil mendeteksi printer, silakan cek koneksi USB / power';
      }
    } catch (err) {
      console.warn('Gagal rekoneksi printer:', err);
      printerFailedMessage = 'Tidak berhasil mendeteksi printer, silakan cek koneksi USB / power';
    } finally {
      isConnectingPrinter = false;
    }
  }

  // Segarkan semua perangkat
  async function handleRefreshAll() {
    if (isCheckingAll) return;
    isCheckingAll = true;
    try {
      await Promise.allSettled([
        (async () => {
          if (isCameraOffline) {
            await handleConnectCamera();
          }
        })(),
        (async () => {
          if (isPrinterOffline) {
            await handleConnectPrinter();
          }
        })()
      ]);
    } finally {
      isCheckingAll = false;
    }
  }

  // Cek apakah kamera sudah siap / online
  let isCameraOffline = $derived(
    cameraStore.status !== 'connected' &&
    cameraStore.status !== 'connecting' &&
    !cameraStore.isDetecting &&
    !isConnectingCamera
  );

  // Cek apakah printer sudah siap / online
  let isPrinterOffline = $derived(
    !printerStore.isDetecting &&
    !isConnectingPrinter &&
    printerStore.status !== null &&
    (
      printerStore.printers.length === 0 ||
      !printerStore.selectedPrinter ||
      !printerStore.status.is_online ||
      !printerStore.status.is_ready ||
      printerStore.status.has_error
    )
  );

  // Hanya tampilkan jika sudah melewati grace period startup dan terdapat perangkat offline
  let shouldShow = $derived(
    settled &&
    (isCameraOffline || isPrinterOffline)
  );
</script>

{#if shouldShow}
  {#if variant === 'v2'}
    <!-- ==================== V2: CLASSIC NEO-BRUTALIST MONOCHROME ==================== -->
    <div
      class="fixed bottom-5 left-5 z-[90] w-96 max-w-[calc(100vw-40px)] bg-white border-[2.5px] border-black rounded-2xl p-4 shadow-[6px_6px_0px_0px_#000] select-none font-['Nunito',sans-serif] animate-in fade-in slide-in-from-bottom-3 duration-200"
    >
      <!-- Header -->
      <div class="flex items-center justify-between pb-2 mb-3 border-b-2 border-black/10">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-amber-300 border-2 border-black flex items-center justify-center shrink-0 shadow-[2px_2px_0_0_#000]">
            <AlertTriangle size={17} class="text-black" strokeWidth={2.6} />
          </div>
          <div>
            <h4 class="text-xs font-black tracking-wider uppercase text-black m-0 leading-tight">
              Perangkat Belum Siap
            </h4>
            <span class="text-[10px] font-bold text-black/50">Cek atau hubungkan perangkat</span>
          </div>
        </div>

        <button
          type="button"
          onclick={handleRefreshAll}
          disabled={isCheckingAll || isConnectingCamera || isConnectingPrinter}
          title="Segarkan semua perangkat"
          class="w-8 h-8 rounded-xl bg-white border-2 border-black flex items-center justify-center text-black cursor-pointer hover:bg-black hover:text-white transition-colors shadow-[2px_2px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shrink-0"
        >
          <RotateCw size={14} class={isCheckingAll ? 'animate-spin' : ''} strokeWidth={2.5} />
        </button>
      </div>

      <!-- Problem List with Action Buttons -->
      <div class="flex flex-col gap-2 mb-3">
        {#if isCameraOffline}
          <div class="flex flex-col gap-1.5 p-2.5 rounded-xl border-2 border-black bg-rose-50 text-rose-950">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <Camera size={15} class="shrink-0 text-rose-600" strokeWidth={2.5} />
                <span class="text-xs font-black truncate">Kamera DSLR / USB</span>
              </div>
              <button
                type="button"
                onclick={handleConnectCamera}
                disabled={isConnectingCamera}
                class="px-2.5 py-1 rounded-lg text-[11px] font-black uppercase text-black bg-amber-300 border-[1.5px] border-black flex items-center gap-1.5 shadow-[1.5px_1.5px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer hover:bg-amber-400 shrink-0"
              >
                {#if isConnectingCamera}
                  <RotateCw size={11} class="animate-spin text-black" strokeWidth={2.5} />
                  <span>Menghubungkan...</span>
                {:else}
                  <span>Hubungkan</span>
                {/if}
              </button>
            </div>
            {#if cameraFailedMessage}
              <div class="text-[10.5px] font-bold text-rose-700 bg-rose-100/80 px-2 py-1 rounded-md flex items-center gap-1.5 leading-snug">
                <Info size={12} class="shrink-0 text-rose-600" />
                <span>{cameraFailedMessage}</span>
              </div>
            {:else}
              <span class="text-[10px] text-rose-800 font-bold">Kamera terputus atau mode tidur (sleep)</span>
            {/if}
          </div>
        {/if}

        {#if isPrinterOffline}
          <div class="flex flex-col gap-1.5 p-2.5 rounded-xl border-2 border-black bg-amber-50 text-amber-950">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <Printer size={15} class="shrink-0 text-amber-600" strokeWidth={2.5} />
                <span class="text-xs font-black truncate">Printer Foto</span>
              </div>
              <button
                type="button"
                onclick={handleConnectPrinter}
                disabled={isConnectingPrinter}
                class="px-2.5 py-1 rounded-lg text-[11px] font-black uppercase text-black bg-amber-300 border-[1.5px] border-black flex items-center gap-1.5 shadow-[1.5px_1.5px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer hover:bg-amber-400 shrink-0"
              >
                {#if isConnectingPrinter}
                  <RotateCw size={11} class="animate-spin text-black" strokeWidth={2.5} />
                  <span>Menghubungkan...</span>
                {:else}
                  <span>Hubungkan</span>
                {/if}
              </button>
            </div>
            {#if printerFailedMessage}
              <div class="text-[10.5px] font-bold text-amber-800 bg-amber-100/80 px-2 py-1 rounded-md flex items-center gap-1.5 leading-snug">
                <Info size={12} class="shrink-0 text-amber-700" />
                <span>{printerFailedMessage}</span>
              </div>
            {:else}
              <span class="text-[10px] text-amber-800 font-bold">Printer offline atau belum siap</span>
            {/if}
          </div>
        {/if}
      </div>

      {#if onOpenConfig}
        <button
          type="button"
          onclick={onOpenConfig}
          class="w-full py-2 px-3 bg-black text-white rounded-xl text-xs font-black tracking-wider uppercase flex items-center justify-center gap-1.5 hover:bg-neutral-800 transition-transform active:scale-95 cursor-pointer border-none shadow-[2px_2px_0_0_rgba(0,0,0,0.3)]"
        >
          <Settings size={13} />
          <span>Buka Config Dashboard</span>
        </button>
      {/if}
    </div>

  {:else if variant === 'v3'}
    <!-- ==================== V3: FILM & PHOTO STUDIO DARK / GOLD ==================== -->
    <div
      class="fixed bottom-8 left-6 z-[90] w-96 max-w-[calc(100vw-48px)] bg-neutral-900/95 backdrop-blur-md border border-[#FFC107]/40 rounded-2xl p-4 shadow-2xl select-none font-['Inter',sans-serif] text-white animate-in fade-in slide-in-from-bottom-3 duration-200"
      style="box-shadow: 0 16px 36px rgba(0,0,0,0.7), 0 0 16px rgba(205, 28, 51, 0.25);"
    >
      <!-- Header -->
      <div class="flex items-center justify-between pb-2 mb-3 border-b border-white/10">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-[#CD1C33] border border-white/20 flex items-center justify-center shrink-0 shadow-md">
            <AlertTriangle size={16} class="text-[#FFC107]" strokeWidth={2.4} />
          </div>
          <div>
            <h4 class="text-[11px] font-bold tracking-widest text-[#FFC107] uppercase font-mono m-0 leading-tight">
              ✦ PERANGKAT BELUM SIAP
            </h4>
            <span class="text-[10px] text-white/50 font-sans">Hubungkan kembali perangkat</span>
          </div>
        </div>

        <button
          type="button"
          onclick={handleRefreshAll}
          disabled={isCheckingAll || isConnectingCamera || isConnectingPrinter}
          title="Segarkan semua perangkat"
          class="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white/80 cursor-pointer hover:bg-white/20 hover:text-white transition-all active:scale-95 shrink-0"
        >
          <RotateCw size={14} class={isCheckingAll ? 'animate-spin' : ''} strokeWidth={2.3} />
        </button>
      </div>

      <!-- Problem List with Action Buttons -->
      <div class="flex flex-col gap-2 mb-3">
        {#if isCameraOffline}
          <div class="flex flex-col gap-1.5 p-2.5 rounded-xl bg-white/5 border border-rose-500/30 text-rose-100">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <Camera size={15} class="shrink-0 text-rose-400" strokeWidth={2.3} />
                <span class="text-xs font-semibold truncate">Kamera DSLR / USB</span>
              </div>
              <button
                type="button"
                onclick={handleConnectCamera}
                disabled={isConnectingCamera}
                class="px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase font-mono text-black bg-[#FFC107] hover:bg-[#ffcd38] flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer border-none shadow-sm shrink-0"
              >
                {#if isConnectingCamera}
                  <RotateCw size={11} class="animate-spin text-black" strokeWidth={2.5} />
                  <span>Menghubungkan...</span>
                {:else}
                  <span>Hubungkan</span>
                {/if}
              </button>
            </div>
            {#if cameraFailedMessage}
              <div class="text-[10.5px] text-rose-300 bg-rose-950/60 border border-rose-500/30 px-2 py-1 rounded-md flex items-center gap-1.5 leading-snug">
                <Info size={12} class="shrink-0 text-rose-400" />
                <span>{cameraFailedMessage}</span>
              </div>
            {:else}
              <span class="text-[10px] text-rose-300/80">Kamera terputus atau mode tidur (sleep)</span>
            {/if}
          </div>
        {/if}

        {#if isPrinterOffline}
          <div class="flex flex-col gap-1.5 p-2.5 rounded-xl bg-white/5 border border-amber-500/30 text-amber-100">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <Printer size={15} class="shrink-0 text-amber-400" strokeWidth={2.3} />
                <span class="text-xs font-semibold truncate">Printer Foto</span>
              </div>
              <button
                type="button"
                onclick={handleConnectPrinter}
                disabled={isConnectingPrinter}
                class="px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase font-mono text-black bg-[#FFC107] hover:bg-[#ffcd38] flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer border-none shadow-sm shrink-0"
              >
                {#if isConnectingPrinter}
                  <RotateCw size={11} class="animate-spin text-black" strokeWidth={2.5} />
                  <span>Menghubungkan...</span>
                {:else}
                  <span>Hubungkan</span>
                {/if}
              </button>
            </div>
            {#if printerFailedMessage}
              <div class="text-[10.5px] text-amber-300 bg-amber-950/60 border border-amber-500/30 px-2 py-1 rounded-md flex items-center gap-1.5 leading-snug">
                <Info size={12} class="shrink-0 text-amber-400" />
                <span>{printerFailedMessage}</span>
              </div>
            {:else}
              <span class="text-[10px] text-amber-300/80">Printer offline atau belum siap</span>
            {/if}
          </div>
        {/if}
      </div>

      {#if onOpenConfig}
        <button
          type="button"
          onclick={onOpenConfig}
          class="w-full py-2 px-3 bg-gradient-to-r from-[#CD1C33] to-[#a31526] hover:from-[#e0203a] hover:to-[#b8182b] text-white rounded-xl text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer border border-white/20 shadow-md font-mono"
        >
          <Settings size={13} />
          <span>Config Dashboard</span>
        </button>
      {/if}
    </div>

  {:else}
    <!-- ==================== V1 & CUSTOM: SOFT NEUMORPHISM ==================== -->
    <div
      class="fixed bottom-5 left-5 z-[90] w-96 max-w-[calc(100vw-40px)] rounded-[24px] p-4 select-none font-['Poppins',sans-serif] animate-in fade-in slide-in-from-bottom-3 duration-200 text-slate-700"
      style="
        background: #ebf0f7;
        box-shadow: 6px 6px 18px rgba(0, 0, 0, 0.28), -4px -4px 14px rgba(255, 255, 255, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.7);
      "
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between pb-2 mb-3"
        style="border-bottom: 1px solid rgba(200, 210, 224, 0.7);"
      >
        <div class="flex items-center gap-2.5">
          <div
            class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style="
              background: #ebf0f7;
              box-shadow: 3px 3px 7px rgba(163,177,198,0.6), -3px -3px 7px rgba(255,255,255,0.9);
            "
          >
            <AlertTriangle size={17} class="text-amber-600" strokeWidth={2.5} />
          </div>
          <div>
            <h4 class="text-xs font-bold text-[#2a2873] m-0 leading-tight">
              Perangkat Belum Siap
            </h4>
            <span class="text-[10px] text-slate-500 font-medium">Hubungkan kembali perangkat</span>
          </div>
        </div>

        <button
          type="button"
          onclick={handleRefreshAll}
          disabled={isCheckingAll || isConnectingCamera || isConnectingPrinter}
          title="Segarkan semua perangkat"
          class="w-8 h-8 rounded-xl flex items-center justify-center text-[#2a2873] cursor-pointer transition-all active:scale-95 shrink-0"
          style="
            background: #ebf0f7;
            box-shadow: 2px 2px 5px rgba(163,177,198,0.6), -2px -2px 5px rgba(255,255,255,0.9);
            border: none;
          "
        >
          <RotateCw size={14} class={isCheckingAll ? 'animate-spin' : ''} strokeWidth={2.4} />
        </button>
      </div>

      <!-- Problem List with Action Buttons -->
      <div class="flex flex-col gap-2 mb-3">
        {#if isCameraOffline}
          <div
            class="flex flex-col gap-1.5 p-2.5 rounded-xl text-xs font-semibold text-rose-700"
            style="
              background: #ebf0f7;
              box-shadow: inset 2px 2px 4px rgba(163,177,198,0.5), inset -2px -2px 4px rgba(255,255,255,0.9);
            "
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <Camera size={15} class="shrink-0 text-rose-600" strokeWidth={2.4} />
                <span class="truncate font-bold">Kamera DSLR / USB</span>
              </div>
              <button
                type="button"
                onclick={handleConnectCamera}
                disabled={isConnectingCamera}
                class="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#2a2873] flex items-center gap-1.5 transition-all active:scale-95 shrink-0 cursor-pointer"
                style="
                  background: #ebf0f7;
                  box-shadow: 2px 2px 5px rgba(163,177,198,0.6), -2px -2px 5px rgba(255,255,255,0.9);
                  border: none;
                "
              >
                {#if isConnectingCamera}
                  <RotateCw size={11} class="animate-spin text-[#2a2873]" strokeWidth={2.5} />
                  <span>Menghubungkan...</span>
                {:else}
                  <span>Hubungkan</span>
                {/if}
              </button>
            </div>
            {#if cameraFailedMessage}
              <div class="text-[10.5px] font-medium text-rose-700 bg-rose-100/60 px-2 py-1 rounded-lg flex items-center gap-1.5 leading-snug">
                <Info size={12} class="shrink-0 text-rose-600" />
                <span>{cameraFailedMessage}</span>
              </div>
            {:else}
              <span class="text-[10px] text-slate-500 font-normal">Kamera terputus atau mode tidur (sleep)</span>
            {/if}
          </div>
        {/if}

        {#if isPrinterOffline}
          <div
            class="flex flex-col gap-1.5 p-2.5 rounded-xl text-xs font-semibold text-amber-800"
            style="
              background: #ebf0f7;
              box-shadow: inset 2px 2px 4px rgba(163,177,198,0.5), inset -2px -2px 4px rgba(255,255,255,0.9);
            "
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <Printer size={15} class="shrink-0 text-amber-600" strokeWidth={2.4} />
                <span class="truncate font-bold">Printer Foto</span>
              </div>
              <button
                type="button"
                onclick={handleConnectPrinter}
                disabled={isConnectingPrinter}
                class="px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#2a2873] flex items-center gap-1.5 transition-all active:scale-95 shrink-0 cursor-pointer"
                style="
                  background: #ebf0f7;
                  box-shadow: 2px 2px 5px rgba(163,177,198,0.6), -2px -2px 5px rgba(255,255,255,0.9);
                  border: none;
                "
              >
                {#if isConnectingPrinter}
                  <RotateCw size={11} class="animate-spin text-[#2a2873]" strokeWidth={2.5} />
                  <span>Menghubungkan...</span>
                {:else}
                  <span>Hubungkan</span>
                {/if}
              </button>
            </div>
            {#if printerFailedMessage}
              <div class="text-[10.5px] font-medium text-amber-800 bg-amber-100/60 px-2 py-1 rounded-lg flex items-center gap-1.5 leading-snug">
                <Info size={12} class="shrink-0 text-amber-700" />
                <span>{printerFailedMessage}</span>
              </div>
            {:else}
              <span class="text-[10px] text-slate-500 font-normal">Printer offline atau belum siap</span>
            {/if}
          </div>
        {/if}
      </div>

      {#if onOpenConfig}
        <button
          type="button"
          onclick={onOpenConfig}
          class="w-full py-2 px-3 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-transform active:scale-95 border-none"
          style="
            background: linear-gradient(135deg, #3d3aa0, #2a2873);
            box-shadow: 3px 3px 8px rgba(42,40,115,0.35);
          "
        >
          <Settings size={13} />
          <span>Config Dashboard</span>
        </button>
      {/if}
    </div>
  {/if}
{/if}
