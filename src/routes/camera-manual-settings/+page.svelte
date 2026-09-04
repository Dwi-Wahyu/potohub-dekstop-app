<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { ChevronLeft, ChevronDown, Save, Camera } from '@lucide/svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { getLiveviewTransformStyle } from '$lib/utils/shared';
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

  const NEU_BG = '#ebf0f7';
  const NEU_PRIMARY = '#2a2873';
  const neuCfg = {
    card: '8px 8px 20px rgba(163,177,198,0.6), -8px -8px 20px rgba(255,255,255,0.9)',
    inset: 'inset 4px 4px 10px rgba(163,177,198,0.7), inset -4px -4px 10px rgba(255,255,255,0.9)',
    btn: '5px 5px 12px rgba(163,177,198,0.55), -4px -4px 10px rgba(255,255,255,0.85)',
    btnSm: '3px 3px 8px rgba(163,177,198,0.55), -3px -3px 8px rgba(255,255,255,0.85)'
  };

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

  async function handleBack() {
    if (liveviewInterval) {
      clearInterval(liveviewInterval);
      liveviewInterval = null;
    }
    await cameraStore.stopLiveview();
    goto('/settings');
  }
</script>

<div class="w-screen h-screen overflow-hidden">
  <div
    style="
      width: 100%;
      height: 100%;
      background: {NEU_BG};
      display: flex;
      flex-direction: column;
      font-family: 'Poppins', sans-serif;
      overflow: hidden;
    "
  >
    <!-- Header bar -->
    <div
      style="
        background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY});
        display: flex;
        align-items: center;
        padding: 0 28px;
        height: 60px;
        flex-shrink: 0;
        box-shadow: 0 4px 20px rgba(42,40,115,0.3);
        gap: 16px;
      "
    >
      <button
        onclick={handleBack}
        style="
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(255,255,255,0.15);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
        "
        title="Kembali ke Pengaturan"
      >
        <ChevronLeft size={20} />
      </button>
      <h1
        style="
          flex: 1;
          margin: 0;
          color: white;
          font-weight: 700;
          font-size: 1rem;
          letter-spacing: 0.02em;
        "
      >
        Pengaturan Manual Kamera — {cameraStore.device?.manufacturer || cameraStore.device?.productname || 'DSLR'}
      </h1>
    </div>

    <!-- Main Content Area -->
    <div
      style="
        flex: 1;
        overflow: hidden;
        display: flex;
        padding: 20px 24px;
        gap: 16px;
      "
    >
      <!-- Panel Kiri: Pengaturan Eksposur -->
      <div style="width: 340px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px;">
        <p style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 4px 0 0 0;">
          Pengaturan Eksposur
        </p>

        <div
          style="
            flex: 1;
            background: {NEU_BG};
            box-shadow: {neuCfg.card};
            border-radius: 20px;
            padding: 18px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 14px;
          "
        >
          {#if loadError}
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 12px; padding: 10px 14px; color: #dc2626; font-size: 11px;">
              {loadError}
            </div>
          {/if}

          <!-- ISO -->
          {#if isoOptions.length > 0}
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em; margin: 0;">
                ISO
              </h1>
              <div style="position: relative;">
                <select
                  id="iso"
                  value={currentIso}
                  onchange={handleIsoChange}
                  style="
                    width: 100%;
                    appearance: none;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.inset};
                    border-radius: 12px;
                    padding: 10px 36px 10px 14px;
                    border: none;
                    outline: none;
                    font-size: 12px;
                    font-weight: 500;
                    color: #475569;
                    font-family: 'Poppins', sans-serif;
                    cursor: pointer;
                  "
                >
                  {#each isoOptions as opt}
                    <option value={opt}>{opt}</option>
                  {/each}
                </select>
                <ChevronDown size={14} color="#94a3b8" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none;" />
              </div>
            </div>

            <div style="height: 1px; background: rgba(200,210,224,0.7);"></div>
          {/if}

          <!-- Shutter Speed (Tv) -->
          {#if tvOptions.length > 0}
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em; margin: 0;">
                Shutter Speed (Tv)
              </h1>
              <div style="position: relative;">
                <select
                  id="tv"
                  value={currentTv}
                  onchange={handleTvChange}
                  style="
                    width: 100%;
                    appearance: none;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.inset};
                    border-radius: 12px;
                    padding: 10px 36px 10px 14px;
                    border: none;
                    outline: none;
                    font-size: 12px;
                    font-weight: 500;
                    color: #475569;
                    font-family: 'Poppins', sans-serif;
                    cursor: pointer;
                  "
                >
                  {#each tvOptions as opt}
                    <option value={opt}>{opt}</option>
                  {/each}
                </select>
                <ChevronDown size={14} color="#94a3b8" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none;" />
              </div>
            </div>

            <div style="height: 1px; background: rgba(200,210,224,0.7);"></div>
          {/if}

          <!-- Aperture (Av) -->
          {#if avOptions.length > 0}
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em; margin: 0;">
                Aperture (F)
              </h1>
              <div style="position: relative;">
                <select
                  id="av"
                  value={currentAv}
                  onchange={handleAvChange}
                  style="
                    width: 100%;
                    appearance: none;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.inset};
                    border-radius: 12px;
                    padding: 10px 36px 10px 14px;
                    border: none;
                    outline: none;
                    font-size: 12px;
                    font-weight: 500;
                    color: #475569;
                    font-family: 'Poppins', sans-serif;
                    cursor: pointer;
                  "
                >
                  {#each avOptions as opt}
                    <option value={opt}>{opt}</option>
                  {/each}
                </select>
                <ChevronDown size={14} color="#94a3b8" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none;" />
              </div>
            </div>

            <div style="height: 1px; background: rgba(200,210,224,0.7);"></div>
          {/if}

          {#if isoOptions.length === 0 && tvOptions.length === 0 && avOptions.length === 0 && !loadError}
            <div style="background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 12px; padding: 16px; text-align: center; color: #64748b; font-size: 12px; font-weight: 500;">
              Memuat kemampuan kamera...
            </div>
          {/if}

          <div style="margin-top: auto; display: flex; flex-direction: column; gap: 10px;">
            <button
              type="button"
              onclick={handleSaveAsDefault}
              style="
                width: 100%;
                padding: 12px 18px;
                border-radius: 12px;
                background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY});
                border: none;
                cursor: pointer;
                font-family: 'Poppins', sans-serif;
                font-weight: 700;
                font-size: 13px;
                color: white;
                box-shadow: 0 4px 14px rgba(42,40,115,0.35);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
              "
            >
              <Save size={16} />
              <span>Simpan sebagai Default</span>
            </button>

            {#if saveStatus}
              <div style="background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 10px; padding: 8px 12px; font-size: 11px; font-weight: 600; color: #15803d; text-align: center;">
                {saveStatus}
              </div>
            {/if}

            <p style="font-size: 10px; color: #94a3b8; margin: 0; line-height: 1.4;">
              Perubahan diterapkan langsung ke kamera. Live preview di panel kanan otomatis menyesuaikan dalam &lt;1 detik setelah setiap perubahan.
            </p>
          </div>
        </div>
      </div>

      <!-- Panel Kanan: Live Preview Kamera -->
      <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
        <p style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 4px 0 0 0;">
          Live Preview Kamera
        </p>

        <div
          style="
            flex: 1;
            background: {NEU_BG};
            box-shadow: {neuCfg.card};
            border-radius: 20px;
            padding: 14px;
            display: flex;
            flex-direction: column;
          "
        >
          <div
            style="
              flex: 1;
              background: {NEU_BG};
              box-shadow: {neuCfg.inset};
              border-radius: 16px;
              padding: 10px;
              display: flex;
              align-items: center;
              justify-content: center;
              position: relative;
              overflow: hidden;
            "
          >
            <!-- Screen container -->
            <div
              style="
                width: 100%;
                height: 100%;
                background: #0f172a;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                overflow: hidden;
              "
            >
              {#if frameSrc}
                <img src={frameSrc} alt="Live preview kamera" class="max-w-full max-h-full object-contain" style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};" />
              {:else}
                <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; color: #64748b;">
                  <div
                    style="
                      width: 56px;
                      height: 56px;
                      border-radius: 16px;
                      background: rgba(255, 255, 255, 0.05);
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      color: #94a3b8;
                    "
                  >
                    <Camera size={28} />
                  </div>
                  <p style="font-size: 13px; font-weight: 500; margin: 0;">Menunggu frame liveview...</p>
                </div>
              {/if}

              <!-- Live Indicator Overlay Badge -->
              <div
                style="
                  position: absolute;
                  top: 14px;
                  left: 14px;
                  background: rgba(15, 23, 42, 0.75);
                  backdrop-filter: blur(8px);
                  padding: 5px 12px;
                  border-radius: 20px;
                  border: 1px solid rgba(255,255,255,0.15);
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  z-index: 10;
                "
              >
                <div
                  style="
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #ef4444;
                    box-shadow: 0 0 8px #ef4444;
                  "
                ></div>
                <span style="font-size: 10px; font-weight: 700; color: white; letter-spacing: 0.08em;">LIVE VIEW</span>
              </div>

              <!-- Camera exposure values overlay bar at bottom -->
              <div
                style="
                  position: absolute;
                  bottom: 14px;
                  right: 14px;
                  background: rgba(15, 23, 42, 0.75);
                  backdrop-filter: blur(8px);
                  padding: 6px 14px;
                  border-radius: 12px;
                  border: 1px solid rgba(255,255,255,0.15);
                  display: flex;
                  align-items: center;
                  gap: 12px;
                  z-index: 10;
                "
              >
                <span style="font-size: 11px; font-weight: 600; color: #94a3b8;">
                  ISO: <strong style="color: #ffffff;">{currentIso || '-'}</strong>
                </span>
                <span style="font-size: 11px; font-weight: 600; color: #94a3b8;">
                  Tv: <strong style="color: #ffffff;">{currentTv || '-'}</strong>
                </span>
                <span style="font-size: 11px; font-weight: 600; color: #94a3b8;">
                  Av: <strong style="color: #ffffff;">{currentAv || '-'}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
