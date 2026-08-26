<script lang="ts">
  import { onMount } from "svelte";
  import { cameraStore } from "$lib/camera.svelte";
  import { printerStore } from "$lib/printer.svelte";

  let selectedMode = $state<"usb" | "webcam" | "demo">("usb");

  let isoOptions = $state<string[]>([]);
  let currentIso = $state("");

  let tvOptions = $state<string[]>([]);
  let currentTv = $state("");

  let avOptions = $state<string[]>([]);
  let currentAv = $state("");

  let exposureOptions = $state<string[]>([]);
  let currentExposure = $state("");

  onMount(() => {
    printerStore.loadPrinters();
    selectedMode = cameraStore.cameraMode;
  });

  async function handleConnect() {
    await cameraStore.connect(selectedMode);
    if (cameraStore.status === "connected" && selectedMode === "usb") {
      try {
        const iso = await cameraStore.getSetting("iso");
        isoOptions = iso.ability ?? [];
        currentIso = iso.value ?? "";
      } catch {}

      try {
        const tv = await cameraStore.getSetting("tv");
        tvOptions = tv.ability ?? [];
        currentTv = tv.value ?? "";
      } catch {}

      try {
        const av = await cameraStore.getSetting("av");
        avOptions = av.ability ?? [];
        currentAv = av.value ?? "";
      } catch {}

      try {
        const exp = await cameraStore.getSetting("exposure");
        exposureOptions = exp.ability ?? [];
        currentExposure = exp.value ?? "";
      } catch {}
    }
  }

  async function handleIsoChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    await cameraStore.setSetting("iso", value);
    currentIso = value;
  }

  async function handleTvChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    await cameraStore.setSetting("tv", value);
    currentTv = value;
  }

  async function handleAvChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    await cameraStore.setSetting("av", value);
    currentAv = value;
  }

  async function handleExposureChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    await cameraStore.setSetting("exposure", value);
    currentExposure = value;
  }
</script>

<main class="min-h-screen bg-neutral-950 text-white p-8 flex flex-col gap-6 max-w-md mx-auto">
  <a href="/" class="text-sm text-neutral-400 hover:text-white">&larr; Kembali</a>
  <h1 class="text-xl font-semibold">Konfigurasi Perangkat</h1>

  <!-- SECTION KAMERA -->
  <section class="flex flex-col gap-3">
    <h2 class="text-lg font-medium text-neutral-200 border-b border-neutral-800 pb-2">📷 Kamera & Viewfinder</h2>

    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <label class="text-xs text-neutral-400" for="camera-mode-select">Pilih Jenis Kamera</label>
        <select
          id="camera-mode-select"
          class="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          bind:value={selectedMode}
        >
          <option value="usb">Kamera DSLR USB (libgphoto2)</option>
          <option value="webcam">Webcam Laptop (WebRTC)</option>
          <option value="demo">Demo / Mock Camera</option>
        </select>
      </div>

      {#if selectedMode === "usb"}
        <p class="text-xs text-neutral-400">
          Pastikan DSLR terhubung via kabel USB dan tidak sedang dimount oleh aplikasi lain.
        </p>
      {:else if selectedMode === "webcam"}
        <p class="text-xs text-neutral-400">
          Menggunakan kamera bawaan laptop Anda via WebRTC.
        </p>
      {:else}
        <p class="text-xs text-neutral-400">
          Mode simulasi / demo. Menghasilkan frame buatan untuk testing tanpa hardware.
        </p>
      {/if}

      <button
        class="mt-1 bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 disabled:opacity-50 font-medium transition text-sm"
        onclick={handleConnect}
        disabled={cameraStore.status === "connecting"}
      >
        {cameraStore.status === "connecting" ? "Menghubungkan..." : "Hubungkan Perangkat"}
      </button>

      {#if cameraStore.errorMessage}
        <p class="text-red-400 text-sm mt-1">{cameraStore.errorMessage}</p>
      {/if}
    </div>

    {#if cameraStore.status === "connected"}
      <div class="bg-neutral-900 border border-neutral-800 p-4 rounded-lg flex flex-col gap-3 mt-2">
        <p class="text-xs text-neutral-400">Kamera terhubung:</p>
        <p class="font-mono text-sm text-green-400">
          {cameraStore.device?.productname || cameraStore.device?.manufacturer || "Digital Camera (USB)"}
        </p>

        {#if cameraStore.cameraMode === "usb"}
          {#if isoOptions.length > 0}
            <div class="flex flex-col gap-1">
              <label class="text-xs text-neutral-400" for="iso">ISO</label>
              <select id="iso" class="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm" value={currentIso} onchange={handleIsoChange}>
                {#each isoOptions as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
            </div>
          {/if}

          {#if tvOptions.length > 0}
            <div class="flex flex-col gap-1">
              <label class="text-xs text-neutral-400" for="tv">Shutter Speed (Tv)</label>
              <select id="tv" class="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm" value={currentTv} onchange={handleTvChange}>
                {#each tvOptions as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
            </div>
          {/if}

          {#if avOptions.length > 0}
            <div class="flex flex-col gap-1">
              <label class="text-xs text-neutral-400" for="av">Aperture (Av)</label>
              <select id="av" class="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm" value={currentAv} onchange={handleAvChange}>
                {#each avOptions as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
            </div>
          {/if}

          {#if exposureOptions.length > 0}
            <div class="flex flex-col gap-1">
              <label class="text-xs text-neutral-400" for="exposure">Exposure Compensation</label>
              <select id="exposure" class="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm" value={currentExposure} onchange={handleExposureChange}>
                {#each exposureOptions as opt}
                  <option value={opt}>{opt}</option>
                {/each}
              </select>
            </div>
          {/if}
        {/if}

        <button class="mt-2 bg-neutral-800 hover:bg-neutral-700 rounded px-4 py-2 text-xs text-neutral-300 transition" onclick={() => cameraStore.disconnect()}>
          Putuskan Koneksi Kamera
        </button>
      </div>
    {/if}
  </section>

  <!-- SECTION PRINTER -->
  <section class="flex flex-col gap-3 border-t border-neutral-800 pt-6">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-medium text-neutral-200">🖨️ Printer (DNP DS-RX1HS)</h2>
      <button
        class="text-xs bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded text-neutral-300 transition"
        onclick={() => printerStore.loadPrinters()}
      >
        Refresh Printer
      </button>
    </div>

    <div class="flex flex-col gap-3">
      {#if printerStore.printers.length === 0}
        <p class="text-sm text-neutral-500 bg-neutral-900 border border-neutral-800 p-4 rounded-lg">
          Tidak ada printer terdeteksi. Pastikan driver printer terinstal dan terhubung via USB.
        </p>
      {:else}
        <div class="flex flex-col gap-1">
          <label class="text-sm text-neutral-400" for="printer-select">Pilih Printer</label>
          <select
            id="printer-select"
            class="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm"
            bind:value={printerStore.selectedPrinter}
            onchange={() => printerStore.refreshStatus()}
          >
            {#each printerStore.printers as p}
              <option value={p}>{p}</option>
            {/each}
          </select>
        </div>

        {#if printerStore.status}
          <div class="bg-neutral-900 border border-neutral-800 p-4 rounded-lg flex flex-col gap-2 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-neutral-400">Status Printer:</span>
              <span class={printerStore.status.is_ready ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                {printerStore.status.is_ready ? "✅ Siap (Ready)" : "❌ Tidak Siap"}
              </span>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-neutral-400">Estimasi Sisa Kertas:</span>
              <span class="font-mono">{printerStore.status.paper_remaining ?? "?"} lembar</span>
            </div>

            {#if printerStore.status.paper_remaining && printerStore.status.paper_remaining <= printerStore.paperLimitAlert}
              <p class="text-yellow-400 text-xs bg-yellow-950/40 border border-yellow-800/50 p-2 rounded mt-1">
                ⚠️ Peringatan: Kertas menipis! Sisa {printerStore.status.paper_remaining} lembar.
              </p>
            {/if}

            {#if printerStore.status.has_error}
              <p class="text-red-400 text-xs bg-red-950/40 border border-red-800/50 p-2 rounded mt-1">
                ❌ Error: {printerStore.status.error_message || "Terjadi kesalahan pada printer."}
              </p>
            {/if}
          </div>
        {/if}

        <!-- PENGATURAN PERINGATAN KERTAS -->
        <div class="bg-neutral-900/60 border border-neutral-800 p-4 rounded-lg flex flex-col gap-3 mt-1">
          <h3 class="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Pengaturan Peringatan Kertas</h3>

          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" class="accent-blue-600 rounded" bind:checked={printerStore.paperReminder} />
            Aktifkan Paper Out Reminder
          </label>

          <div class="flex items-center gap-3">
            <label class="text-xs text-neutral-400" for="limit-alert">Batas Peringatan Kertas:</label>
            <input
              id="limit-alert"
              type="number"
              min="5"
              max="200"
              class="bg-neutral-900 border border-neutral-700 rounded px-3 py-1 text-sm w-24 font-mono"
              bind:value={printerStore.paperLimitAlert}
            />
            <span class="text-xs text-neutral-400">lembar</span>
          </div>
        </div>
      {/if}

      {#if printerStore.errorMessage}
        <p class="text-red-400 text-sm mt-1">{printerStore.errorMessage}</p>
      {/if}
    </div>
  </section>
</main>