<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { cameraStore } from "$lib/camera.svelte";
  import { printerStore } from "$lib/printer.svelte";
  import { boothConfig } from "$lib/stores/boothConfig.svelte";
  import { getLiveviewTransformStyle } from "$lib/utils/shared";

  let frameSrc = $state("");
  let videoEl = $state<HTMLVideoElement | null>(null);
  let intervalId: ReturnType<typeof setInterval> | undefined;

  let printCopies = $state(1);
  let paperSize = $state<"4x6" | "6x8" | "2x6" | "6x6">("4x6");
  let autoPrint = $state(true);
  let lastCapturedBytes = $state<Uint8Array | null>(null);

  onMount(async () => {
    printerStore.loadPrinters();

    if (cameraStore.status !== "connected") return;
    await cameraStore.startLiveview(videoEl);
    if (cameraStore.cameraMode === "usb" || cameraStore.cameraMode === "demo") {
      intervalId = setInterval(async () => {
        const url = await cameraStore.getLiveviewFrame();
        if (url) {
          frameSrc = url;
        }
      }, 150);
    }
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
    cameraStore.stopLiveview();
  });

  async function handleCapture() {
    const bytes = await cameraStore.capture();
    if (bytes) {
      lastCapturedBytes = bytes;
      if (autoPrint && printerStore.selectedPrinter) {
        await printerStore.printFromBuffer(bytes, {
          copies: printCopies,
          paper_size: paperSize,
          quality: "standard",
        });
      }
    }
  }

  async function handleManualPrint() {
    if (!printerStore.selectedPrinter || !lastCapturedBytes) return;
    await printerStore.printFromBuffer(lastCapturedBytes, {
      copies: printCopies,
      paper_size: paperSize,
      quality: "standard",
    });
  }
</script>

<main class="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-6 p-6">
  {#if cameraStore.status !== "connected"}
    <p class="text-neutral-400">
      Kamera belum terhubung. Kembali ke <a class="underline text-blue-400" href="/camera-config">Konfigurasi Kamera</a>.
    </p>
  {:else}
    <!-- LIVE VIEW DISPLAY -->
    <div class="w-full max-w-2xl aspect-video bg-neutral-900 rounded-lg overflow-hidden flex items-center justify-center border border-neutral-800 relative shadow-2xl">
      {#if cameraStore.cameraMode === "webcam"}
        <video
          bind:this={videoEl}
          autoplay
          playsinline
          muted
          class="w-full h-full object-contain scale-x-[-1]"
        ></video>
      {:else if frameSrc}
        <img src={frameSrc} alt="Live preview kamera" class="w-full h-full object-contain" style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};" />
      {:else}
        <p class="text-neutral-500">Menunggu live view...</p>
      {/if}

      {#if cameraStore.isCapturing}
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <p class="text-xl font-semibold text-white animate-pulse">Mengambil foto...</p>
        </div>
      {/if}

      {#if printerStore.isPrinting}
        <div class="absolute top-4 right-4 bg-yellow-500/90 text-black px-3 py-1.5 rounded-full text-xs font-semibold shadow flex items-center gap-2 animate-bounce">
          <span>🖨️</span> Mencetak foto...
        </div>
      {/if}
    </div>

    <!-- TRIGGER BUTTON -->
    <div class="flex flex-col items-center gap-2">
      <button
        class="w-20 h-20 rounded-full bg-white hover:bg-neutral-200 active:scale-95 disabled:opacity-40 transition shadow-lg flex items-center justify-center border-4 border-neutral-300"
        onclick={handleCapture}
        disabled={cameraStore.isCapturing || printerStore.isPrinting}
        aria-label="Ambil foto"
      >
        <span class="w-14 h-14 rounded-full border-2 border-neutral-900 block"></span>
      </button>
      <span class="text-xs text-neutral-400">Tekan untuk jepret</span>
    </div>

    <!-- PENGATURAN CETAK (PRINT CONTROLS) -->
    <div class="w-full max-w-2xl bg-neutral-900/90 border border-neutral-800 rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-4">
        <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" class="accent-blue-600 rounded" bind:checked={autoPrint} />
          <span>Cetak Otomatis</span>
        </label>

        <div class="flex items-center gap-2">
          <label class="text-xs text-neutral-400" for="copies">Jumlah:</label>
          <input
            id="copies"
            type="number"
            min="1"
            max="5"
            class="bg-neutral-800 border border-neutral-700 rounded px-3 py-1 text-sm w-16 font-mono text-center"
            bind:value={printCopies}
          />
        </div>

        <div class="flex items-center gap-2">
          <label class="text-xs text-neutral-400" for="paper-size">Ukuran:</label>
          <select
            id="paper-size"
            class="bg-neutral-800 border border-neutral-700 rounded px-3 py-1 text-sm"
            bind:value={paperSize}
          >
            <option value="4x6">4x6" (Standard)</option>
            <option value="6x8">6x8" (Large)</option>
            <option value="2x6">2x6" (Strip)</option>
            <option value="6x6">6x6" (Square)</option>
          </select>
        </div>
      </div>

      {#if lastCapturedBytes}
        <button
          class="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded text-xs font-medium text-white transition border border-neutral-700 flex items-center gap-2 disabled:opacity-50"
          onclick={handleManualPrint}
          disabled={printerStore.isPrinting}
        >
          <span>🖨️</span> Cetak Foto Terakhir
        </button>
      {/if}
    </div>

    <!-- ERROR MESSAGES -->
    {#if cameraStore.errorMessage}
      <p class="text-red-400 text-sm bg-neutral-900 px-4 py-2 rounded border border-neutral-800">{cameraStore.errorMessage}</p>
    {/if}
    {#if printerStore.errorMessage}
      <p class="text-red-400 text-sm bg-neutral-900 px-4 py-2 rounded border border-neutral-800">{printerStore.errorMessage}</p>
    {/if}
  {/if}
</main>
