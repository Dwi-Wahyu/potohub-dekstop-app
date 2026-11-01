<script lang="ts">
  import { onMount } from 'svelte';
  import { AlertTriangle, Camera, Printer, RotateCw, Settings, ChevronRight } from '@lucide/svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { printerStore } from '$lib/printer.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';

  interface Props {
    variant?: 'v1' | 'v2' | 'v3' | 'custom';
    onOpenConfig?: () => void;
  }

  let { variant = 'v1', onOpenConfig }: Props = $props();

  let settled = $state(false);
  let isChecking = $state(false);

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
      void handleRefresh();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', handleFocus);
    };
  });

  async function handleRefresh() {
    if (isChecking) return;
    isChecking = true;
    try {
      await Promise.allSettled([
        (async () => {
          if (cameraStore.status !== 'connected') {
            await cameraStore.detect();
            if (boothConfig.config.cameraMode) {
              await cameraStore.connect(boothConfig.config.cameraMode);
            }
          }
        })(),
        printerStore.loadPrinters()
      ]);
    } finally {
      isChecking = false;
    }
  }

  // Cek apakah kamera sudah siap / online
  let isCameraOffline = $derived(
    cameraStore.status !== 'connected' &&
    cameraStore.status !== 'connecting' &&
    !cameraStore.isDetecting
  );

  // Cek apakah printer sudah siap / online
  let isPrinterOffline = $derived(
    !printerStore.isDetecting &&
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
      class="fixed bottom-5 left-5 z-[90] w-80 max-w-[calc(100vw-40px)] bg-white border-[2.5px] border-black rounded-2xl p-3.5 shadow-[5px_5px_0px_0px_#000] select-none font-['Nunito',sans-serif] animate-in fade-in slide-in-from-bottom-3 duration-200"
    >
      <!-- Header -->
      <div class="flex items-center justify-between pb-2 mb-2.5 border-b-2 border-black/10">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-amber-300 border-2 border-black flex items-center justify-center shrink-0 shadow-[1.5px_1.5px_0_0_#000]">
            <AlertTriangle size={15} class="text-black" strokeWidth={2.5} />
          </div>
          <div>
            <h4 class="text-xs font-black tracking-wider uppercase text-black m-0 leading-tight">
              Perangkat Belum Siap
            </h4>
            <span class="text-[10px] font-bold text-black/50">Cek koneksi alat</span>
          </div>
        </div>

        <button
          type="button"
          onclick={handleRefresh}
          disabled={isChecking}
          title="Segarkan status perangkat"
          class="w-7 h-7 rounded-lg bg-white border-2 border-black flex items-center justify-center text-black cursor-pointer hover:bg-black hover:text-white transition-colors shadow-[1.5px_1.5px_0_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shrink-0"
        >
          <RotateCw size={13} class={isChecking ? 'animate-spin' : ''} strokeWidth={2.5} />
        </button>
      </div>

      <!-- Problem List -->
      <div class="flex flex-col gap-1.5 mb-2.5">
        {#if isCameraOffline}
          <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border-[1.5px] border-black bg-rose-50 text-rose-900 text-xs font-bold">
            <Camera size={14} class="shrink-0 text-rose-600" strokeWidth={2.5} />
            <span class="flex-1 truncate">Kamera belum terhubung</span>
            <span class="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
          </div>
        {/if}

        {#if isPrinterOffline}
          <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border-[1.5px] border-black bg-amber-50 text-amber-900 text-xs font-bold">
            <Printer size={14} class="shrink-0 text-amber-600" strokeWidth={2.5} />
            <span class="flex-1 truncate">Printer offline / belum siap</span>
            <span class="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
          </div>
        {/if}
      </div>

      {#if onOpenConfig}
        <button
          type="button"
          onclick={onOpenConfig}
          class="w-full py-1.5 px-3 bg-black text-white rounded-xl text-xs font-black tracking-wider uppercase flex items-center justify-center gap-1.5 hover:bg-neutral-800 transition-transform active:scale-95 cursor-pointer border-none"
        >
          <Settings size={13} />
          <span>Buka Config Dashboard</span>
        </button>
      {/if}
    </div>

  {:else if variant === 'v3'}
    <!-- ==================== V3: FILM & PHOTO STUDIO DARK / GOLD ==================== -->
    <div
      class="fixed bottom-8 left-6 z-[90] w-80 max-w-[calc(100vw-48px)] bg-neutral-900/95 backdrop-blur-md border border-[#FFC107]/40 rounded-2xl p-3.5 shadow-2xl shadow-black/80 select-none font-['Inter',sans-serif] text-white animate-in fade-in slide-in-from-bottom-3 duration-200"
      style="box-shadow: 0 16px 36px rgba(0,0,0,0.65), 0 0 16px rgba(205, 28, 51, 0.25);"
    >
      <!-- Header -->
      <div class="flex items-center justify-between pb-2 mb-2.5 border-b border-white/10">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-xl bg-[#CD1C33] border border-white/20 flex items-center justify-center shrink-0 shadow-md">
            <AlertTriangle size={15} class="text-[#FFC107]" strokeWidth={2.3} />
          </div>
          <div>
            <h4 class="text-[11px] font-bold tracking-widest text-[#FFC107] uppercase font-mono m-0 leading-tight">
              ✦ PERANGKAT BELUM SIAP
            </h4>
            <span class="text-[10px] text-white/50 font-sans">Periksa status perangkat</span>
          </div>
        </div>

        <button
          type="button"
          onclick={handleRefresh}
          disabled={isChecking}
          title="Segarkan status perangkat"
          class="w-7 h-7 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white/80 cursor-pointer hover:bg-white/20 hover:text-white transition-all active:scale-95 shrink-0"
        >
          <RotateCw size={13} class={isChecking ? 'animate-spin' : ''} strokeWidth={2.2} />
        </button>
      </div>

      <!-- Problem List -->
      <div class="flex flex-col gap-1.5 mb-2.5">
        {#if isCameraOffline}
          <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/5 border border-rose-500/30 text-rose-200 text-xs font-medium">
            <Camera size={14} class="shrink-0 text-rose-400" strokeWidth={2.2} />
            <span class="flex-1 truncate">Kamera belum terhubung</span>
            <span class="w-2 h-2 rounded-full bg-rose-500 shrink-0 shadow-[0_0_6px_#f43f5e]"></span>
          </div>
        {/if}

        {#if isPrinterOffline}
          <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/5 border border-amber-500/30 text-amber-200 text-xs font-medium">
            <Printer size={14} class="shrink-0 text-amber-400" strokeWidth={2.2} />
            <span class="flex-1 truncate">Printer offline / belum siap</span>
            <span class="w-2 h-2 rounded-full bg-amber-400 shrink-0 shadow-[0_0_6px_#f59e0b]"></span>
          </div>
        {/if}
      </div>

      {#if onOpenConfig}
        <button
          type="button"
          onclick={onOpenConfig}
          class="w-full py-1.5 px-3 bg-gradient-to-r from-[#CD1C33] to-[#a31526] hover:from-[#e0203a] hover:to-[#b8182b] text-white rounded-xl text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer border border-white/20 shadow-md font-mono"
        >
          <Settings size={13} />
          <span>Config Dashboard</span>
        </button>
      {/if}
    </div>

  {:else}
    <!-- ==================== V1 & CUSTOM: SOFT NEUMORPHISM ==================== -->
    <div
      class="fixed bottom-5 left-5 z-[90] w-80 max-w-[calc(100vw-40px)] rounded-[22px] p-3.5 select-none font-['Poppins',sans-serif] animate-in fade-in slide-in-from-bottom-3 duration-200 text-slate-700"
      style="
        background: #ebf0f7;
        box-shadow: 6px 6px 18px rgba(0, 0, 0, 0.28), -4px -4px 14px rgba(255, 255, 255, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.7);
      "
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between pb-2 mb-2.5"
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
            <AlertTriangle size={16} class="text-amber-600" strokeWidth={2.4} />
          </div>
          <div>
            <h4 class="text-xs font-bold text-[#2a2873] m-0 leading-tight">
              Perangkat Belum Siap
            </h4>
            <span class="text-[10px] text-slate-500 font-medium">Periksa status perangkat</span>
          </div>
        </div>

        <button
          type="button"
          onclick={handleRefresh}
          disabled={isChecking}
          title="Segarkan status perangkat"
          class="w-7 h-7 rounded-xl flex items-center justify-center text-[#2a2873] cursor-pointer transition-all active:scale-95 shrink-0"
          style="
            background: #ebf0f7;
            box-shadow: 2px 2px 5px rgba(163,177,198,0.6), -2px -2px 5px rgba(255,255,255,0.9);
            border: none;
          "
        >
          <RotateCw size={13} class={isChecking ? 'animate-spin' : ''} strokeWidth={2.3} />
        </button>
      </div>

      <!-- Problem List -->
      <div class="flex flex-col gap-1.5 mb-2.5">
        {#if isCameraOffline}
          <div
            class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700"
            style="
              background: #ebf0f7;
              box-shadow: inset 2px 2px 4px rgba(163,177,198,0.5), inset -2px -2px 4px rgba(255,255,255,0.9);
            "
          >
            <Camera size={14} class="shrink-0 text-rose-600" strokeWidth={2.3} />
            <span class="flex-1 truncate">Kamera belum terhubung</span>
            <span class="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
          </div>
        {/if}

        {#if isPrinterOffline}
          <div
            class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-700"
            style="
              background: #ebf0f7;
              box-shadow: inset 2px 2px 4px rgba(163,177,198,0.5), inset -2px -2px 4px rgba(255,255,255,0.9);
            "
          >
            <Printer size={14} class="shrink-0 text-amber-600" strokeWidth={2.3} />
            <span class="flex-1 truncate">Printer offline / belum siap</span>
            <span class="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
          </div>
        {/if}
      </div>

      {#if onOpenConfig}
        <button
          type="button"
          onclick={onOpenConfig}
          class="w-full py-1.5 px-3 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-transform active:scale-95 border-none"
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
