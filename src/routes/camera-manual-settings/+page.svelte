<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { cameraStore } from '$lib/camera.svelte';
  import { saveCameraPreset } from '$lib/db/local';

  let isoOptions = $state<string[]>([]);
  let currentIso = $state('');
  let tvOptions = $state<string[]>([]);
  let currentTv = $state('');
  let avOptions = $state<string[]>([]);
  let currentAv = $state('');

  let frameSrc = $state('');
  let liveviewInterval: ReturnType<typeof setInterval> | null = null;
  let loadError = $state<string | null>(null);
  let saveStatus = $state<string | null>(null);

  onMount(async () => {
    // Halaman ini cuma valid kalau kamera USB sudah terhubung.
    // Kalau belum, lempar balik ke /settings supaya user connect dulu.
    if (cameraStore.status !== 'connected' || cameraStore.cameraMode !== 'usb') {
      goto('/settings');
      return;
    }

    try {
      const iso = await cameraStore.getSetting('iso');
      isoOptions = iso.ability ?? [];
      currentIso = iso.value ?? '';
    } catch (e) { loadError = String(e); }

    try {
      const tv = await cameraStore.getSetting('tv');
      tvOptions = tv.ability ?? [];
      currentTv = tv.value ?? '';
    } catch (e) { loadError = String(e); }

    try {
      const av = await cameraStore.getSetting('av');
      avOptions = av.ability ?? [];
      currentAv = av.value ?? '';
    } catch (e) { loadError = String(e); }

    await cameraStore.startLiveview();
    liveviewInterval = setInterval(async () => {
      const url = await cameraStore.getLiveviewFrame();
      if (url) frameSrc = url;
    }, 150);
  });

  onDestroy(() => {
    if (liveviewInterval) clearInterval(liveviewInterval);
    cameraStore.stopLiveview();
  });

  async function handleIsoChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    await cameraStore.setSetting('iso', value);
    currentIso = value;
  }

  async function handleTvChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    await cameraStore.setSetting('tv', value);
    currentTv = value;
  }

  async function handleAvChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    await cameraStore.setSetting('av', value);
    currentAv = value;
  }

  async function handleSaveAsDefault() {
    const model = cameraStore.device?.manufacturer ?? cameraStore.device?.productname;
    if (!model) return;
    try {
      await saveCameraPreset(model, currentIso, currentTv, currentAv);
      saveStatus = 'Tersimpan sebagai default untuk ' + model;
    } catch (e) {
      saveStatus = 'Gagal menyimpan: ' + String(e);
    }
    setTimeout(() => { saveStatus = null; }, 3000);
  }

  function handleBack() {
    goto('/settings');
  }
</script>

<div class="w-screen h-screen bg-neutral-950 text-white flex flex-col overflow-hidden">
  <div class="flex items-center gap-4 px-6 h-14 flex-shrink-0 border-b border-neutral-800">
    <button onclick={handleBack} class="text-sm text-neutral-400 hover:text-white">&larr; Kembali ke Pengaturan</button>
    <h1 class="text-sm font-semibold flex-1 text-center">
      Pengaturan Manual Kamera — {cameraStore.device?.manufacturer || cameraStore.device?.productname || 'DSLR'}
    </h1>
    <div class="w-32"></div>
  </div>

  {#if loadError}
    <p class="text-red-400 text-xs px-6 py-2">{loadError}</p>
  {/if}

  <!-- 2 Panel: kiri = kontrol, kanan = live preview -->
  <div class="flex-1 min-h-0 flex gap-4 p-4">
    <!-- Panel Kiri: Pengaturan -->
    <div class="w-80 flex-shrink-0 bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-5 overflow-y-auto">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-neutral-400">Pengaturan Eksposur</h2>

      {#if isoOptions.length > 0}
        <div class="flex flex-col gap-1">
          <label class="text-xs text-neutral-400" for="iso">ISO</label>
          <select id="iso" class="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm" value={currentIso} onchange={handleIsoChange}>
            {#each isoOptions as opt}<option value={opt}>{opt}</option>{/each}
          </select>
        </div>
      {/if}

      {#if tvOptions.length > 0}
        <div class="flex flex-col gap-1">
          <label class="text-xs text-neutral-400" for="tv">Shutter Speed (Tv)</label>
          <select id="tv" class="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm" value={currentTv} onchange={handleTvChange}>
            {#each tvOptions as opt}<option value={opt}>{opt}</option>{/each}
          </select>
        </div>
      {/if}

      {#if avOptions.length > 0}
        <div class="flex flex-col gap-1">
          <label class="text-xs text-neutral-400" for="av">Aperture (F)</label>
          <select id="av" class="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm" value={currentAv} onchange={handleAvChange}>
            {#each avOptions as opt}<option value={opt}>{opt}</option>{/each}
          </select>
        </div>
      {/if}

      {#if isoOptions.length === 0 && tvOptions.length === 0 && avOptions.length === 0 && !loadError}
        <p class="text-xs text-neutral-500">Memuat kemampuan kamera...</p>
      {/if}

      <div class="flex flex-col gap-2 mt-auto">
        <button
          onclick={handleSaveAsDefault}
          class="bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 text-xs font-medium transition cursor-pointer"
        >
          Simpan sebagai Default
        </button>
        {#if saveStatus}
          <p class="text-[10px] text-neutral-400">{saveStatus}</p>
        {/if}
        <p class="text-[10px] text-neutral-500">
          Perubahan diterapkan langsung ke kamera. Live preview di panel kanan otomatis
          menyesuaikan dalam &lt;1 detik setelah setiap perubahan.
        </p>
      </div>
    </div>

    <!-- Panel Kanan: Live Preview -->
    <div class="flex-1 bg-black border border-neutral-800 rounded-xl flex items-center justify-center overflow-hidden relative">
      {#if frameSrc}
        <img src={frameSrc} alt="Live preview kamera" class="max-w-full max-h-full object-contain" />
      {:else}
        <p class="text-neutral-600 text-sm">Menunggu frame liveview...</p>
      {/if}
      <div class="absolute top-3 left-3 bg-black/60 text-[10px] px-2 py-1 rounded text-red-400 font-semibold tracking-wide">
        ● LIVE
      </div>
    </div>
  </div>
</div>
