<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import {
    Monitor,
    ClockCheck,
    ChevronLeft,
    ChevronDown,
    CheckCircle2,
    Save,
    FlipHorizontal2,
    Printer,
    RotateCw,
    Eye,
    Camera,
    X,
    Settings,
    RefreshCw,
    Layers
  } from '@lucide/svelte';
  import UpdateModal from '$lib/components/shared/UpdateModal.svelte';
  import { updaterStore } from '$lib/utils/updater.svelte';
  import { goto } from '$app/navigation';
  import { boothConfig, type BoothCfg } from '$lib/stores/boothConfig.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { syncBoothSettings, getActiveBoothId } from '$lib/api/boothClient';
  import { networkStatus } from '$lib/stores/networkStatus.svelte';
  import { countPendingOutboxJobs } from '$lib/db/local';
  import { cameraStore } from '$lib/camera.svelte';
  import { printerStore } from '$lib/printer.svelte';
  import { getLiveviewTransformStyle } from '$lib/utils/shared';

  interface Props {
    onBack: () => void;
    onLogout: () => void;
  }

  let { onBack, onLogout }: Props = $props();

  let syncStatus = $state<string | null>(null);
  let lastSyncedAt = $state<string | null>(null);
  let boothName = $state<string | null>(null);
  let fallbackMode = $state<'demo' | null>(null);
  let saveNotice = $state<string | null>(null);
  let pendingJobs = $state(0);

  const NEU_BG = '#ebf0f7';
  const NEU_PRIMARY = '#2a2873';
  const neuCfg = {
    card: '8px 8px 20px rgba(163,177,198,0.6), -8px -8px 20px rgba(255,255,255,0.9)',
    inset: 'inset 4px 4px 10px rgba(163,177,198,0.7), inset -4px -4px 10px rgba(255,255,255,0.9)',
    btn: '5px 5px 12px rgba(163,177,198,0.55), -4px -4px 10px rgba(255,255,255,0.85)',
    btnSm: '3px 3px 8px rgba(163,177,198,0.55), -3px -3px 8px rgba(255,255,255,0.85)'
  };

  function update<K extends keyof BoothCfg>(key: K, val: BoothCfg[K]) {
    boothConfig.save({ [key]: val });
    if (key === 'cameraMode') {
      cameraStore.connect(val as 'usb' | 'webcam' | 'demo');
    }
  }

  function handleManualSave() {
    boothConfig.save();
    saveNotice = 'Pengaturan Berhasil Disimpan!';
    setTimeout(() => {
      saveNotice = null;
    }, 2500);
  }

  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  async function handleSync() {
    syncStatus = 'Syncing...';
    try {
      const res = await syncBoothSettings();
      await networkStatus.verifyAndMaybeFlush();

      if (res.booth_name) boothName = res.booth_name;
      lastSyncedAt = res.last_sync_at ? formatDate(res.last_sync_at) : lastSyncedAt;
      syncStatus = res.last_sync_at ? formatDate(res.last_sync_at) : 'Tersinkronisasi';
    } catch (e) {
      syncStatus = e instanceof Error ? e.message : 'Sync gagal';
    } finally {
      pendingJobs = await countPendingOutboxJobs().catch(() => 0);
    }
    setTimeout(() => {
      syncStatus = null;
    }, 3000);
  }

  async function handleConnectDetected() {
    fallbackMode = null;
    await update('cameraMode', 'usb');
  }

  async function handleUseWebcam() {
    fallbackMode = null;
    await update('cameraMode', 'webcam');
  }

  async function handleUseUsb() {
    fallbackMode = null;
    await update('cameraMode', 'usb');
  }

  async function handleUseFallback(mode: 'demo') {
    fallbackMode = mode;
    await update('cameraMode', mode);
  }

  function handleOpenManualSettings() {
    goto('/camera-manual-settings');
  }

  // State & Handlers untuk Dialog Live Preview Kamera
  let isPreviewOpen = $state(false);
  let previewFrameSrc = $state<string | null>(null);
  let previewInterval: ReturnType<typeof setInterval> | null = null;
  let previewVideoEl = $state<HTMLVideoElement | null>(null);

  async function openPreviewDialog() {
    if (cameraStore.status !== 'connected') return;
    isPreviewOpen = true;
    previewFrameSrc = null;

    await tick();

    try {
      if (cameraStore.cameraMode === 'webcam') {
        await cameraStore.startLiveview(previewVideoEl);
      } else {
        await cameraStore.startLiveview();
        const firstFrame = await cameraStore.getLiveviewFrame();
        if (firstFrame) previewFrameSrc = firstFrame;

        previewInterval = setInterval(async () => {
          if (!isPreviewOpen) return;
          const frame = await cameraStore.getLiveviewFrame();
          if (frame) previewFrameSrc = frame;
        }, 120);
      }
    } catch (err) {
      console.error('Gagal membuka preview liveview kamera:', err);
    }
  }

  async function closePreviewDialog() {
    isPreviewOpen = false;
    if (previewInterval) {
      clearInterval(previewInterval);
      previewInterval = null;
    }
    previewFrameSrc = null;
    await cameraStore.stopLiveview();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isPreviewOpen) {
      void closePreviewDialog();
    }
  }

  onMount(async () => {
    window.addEventListener('keydown', handleKeydown);
    const boothId = await getActiveBoothId();
    if (boothId) {
      await boothConfig.init(boothId);
    }
    boothName = uiConfig.config.boothName || boothName;
    pendingJobs = await countPendingOutboxJobs().catch(() => 0);
    void handleSync();
    await cameraStore.checkDevMode();
    void cameraStore.detect();
    void printerStore.loadPrinters();
    void updaterStore.checkForUpdates(true);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    if (previewInterval) {
      clearInterval(previewInterval);
      previewInterval = null;
    }
    if (isPreviewOpen) {
      void cameraStore.stopLiveview();
    }
  });

  const ROTATE_OPTS = ['0° (Default)', '90° CW', '180°', '90° CCW'];
</script>

<div class="w-screen h-screen overflow-hidden relative">
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
        onclick={onBack}
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
        Pengaturan Mesin
      </h1>
      <button
        onclick={onLogout}
        style="
          padding: 8px 20px;
          border-radius: 10px;
          background: rgba(255,255,255,0.15);
          border: 1px solid rgba(255,255,255,0.25);
          cursor: pointer;
          color: white;
          font-family: 'Poppins',sans-serif;
          font-weight: 600;
          font-size: 13px;
        "
      >
        Logout
      </button>
    </div>

    <!-- Body -->
    <div
      style="
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        padding: 20px 24px;
        gap: 16px;
      "
    >
      <!-- Info card -->
      <div
        style="
          background: {NEU_BG};
          box-shadow: {neuCfg.card};
          border-radius: 20px;
          padding: 14px 22px;
          display: flex;
          align-items: center;
          gap: 24px;
          flex-wrap: wrap;
          flex-shrink: 0;
        "
      >
        <div style="display: flex; align-items: center; gap: 10px;">
          <div
            style="
              width: 40px;
              height: 40px;
              border-radius: 12px;
              background: {NEU_BG};
              box-shadow: {neuCfg.btn};
              display: flex;
              align-items: center;
              justify-content: center;
              color: {NEU_PRIMARY};
              flex-shrink: 0;
            "
          >
            <Monitor size={17} />
          </div>
          <div>
            <p style="font-size: 11px; font-weight: 700; color: #334155; margin: 0;">Nama Device</p>
            <p style="font-size: 11px; color: #64748b; margin: 0;">{boothName}</p>
          </div>
        </div>

        <div style="width: 1px; height: 30px; background: rgba(200,210,224,0.7); flex-shrink: 0;"></div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <div
            style="
              width: 40px;
              height: 40px;
              border-radius: 12px;
              background: {NEU_BG};
              box-shadow: {neuCfg.btn};
              display: flex;
              align-items: center;
              justify-content: center;
              color: {NEU_PRIMARY};
              flex-shrink: 0;
            "
          >
            <ClockCheck size={17} />
          </div>
          <div>
            <p style="font-size: 11px; font-weight: 700; color: #334155; margin: 0;">Last Synchronized At</p>
            <p style="font-size: 11px; color: #64748b; margin: 0;">
                {#if syncStatus}
                 {syncStatus}
                {:else if lastSyncedAt}
                 {lastSyncedAt}
                {:else}
                 Belum pernah sync
                {/if}
            </p>
          </div>
        </div>

        <div style="width: 1px; height: 30px; background: rgba(200,210,224,0.7); flex-shrink: 0;"></div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <div
            style="
              width: 40px;
              height: 40px;
              border-radius: 12px;
              background: {NEU_BG};
              box-shadow: {neuCfg.btn};
              display: flex;
              align-items: center;
              justify-content: center;
              color: {NEU_PRIMARY};
              flex-shrink: 0;
            "
          >
            <Layers size={17} />
          </div>
          <div>
            <p style="font-size: 11px; font-weight: 700; color: #334155; margin: 0;">Version</p>
            <p style="font-size: 11px; color: #64748b; margin: 0; display: flex; align-items: center; gap: 6px;">
              v{updaterStore.currentVersion}
              {#if updaterStore.hasUpdate}
                <span
                  style="
                    padding: 1px 6px;
                    border-radius: 999px;
                    background: #f59e0b;
                    color: white;
                    font-size: 9px;
                    font-weight: 700;
                  "
                >
                  Update
                </span>
              {/if}
            </p>
          </div>
        </div>

        <div style="flex: 1;"></div>

        {#if pendingJobs > 0}
          <div
            style="
              padding: 6px 14px;
              border-radius: 9999px;
              background: #fef3c7;
              color: #92400e;
              font-size: 11px;
              font-weight: 700;
              display: flex;
              align-items: center;
              gap: 6px;
            "
          >
            <span style="width: 8px; height: 8px; border-radius: 9999px; background: #f59e0b;"></span>
            Pending Sync Offline: {pendingJobs}
          </div>
        {/if}

        <button
          onclick={() => updaterStore.checkForUpdates(false)}
          style="
            position: relative;
            padding: 8px 18px;
            border-radius: 12px;
            background: {NEU_BG};
            box-shadow: {neuCfg.btn};
            border: none;
            cursor: pointer;
            font-family: 'Poppins', sans-serif;
            font-weight: 700;
            font-size: 13px;
            color: #334155;
            display: flex;
            align-items: center;
            gap: 8px;
          "
        >
          <RefreshCw size={15} class={updaterStore.isChecking ? 'animate-spin' : ''} />
          Check Updates
          {#if updaterStore.hasUpdate}
            <span
              style="
                position: absolute;
                top: 4px;
                right: 4px;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #ef4444;
                box-shadow: 0 0 6px rgba(239, 68, 68, 0.7);
              "
            ></span>
          {/if}
        </button>

        <button
          onclick={handleSync}
          style="
            padding: 8px 20px;
            border-radius: 12px;
            background: {NEU_BG};
            box-shadow: {neuCfg.btn};
            border: none;
            cursor: pointer;
            font-family: 'Poppins',sans-serif;
            font-weight: 700;
            font-size: 13px;
            color: #334155;
          "
        >
          Sync
        </button>
      </div>

      <!-- Two-column content -->
      <div style="flex: 1; min-height: 0; display: flex; gap: 16px;">
        <!-- Left: Fitur Aktif -->
        <div style="width: 34%; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px;">
          <p style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 4px 0 0 0;">
            Fitur Aktif
          </p>
          <div
            class="custom-scrollbar"
            style="
              flex: 1;
              background: {NEU_BG};
              box-shadow: {neuCfg.card};
              border-radius: 20px;
              padding: 14px 14px 72px 14px;
              overflow-y: auto;
              display: flex;
              flex-direction: column;
              gap: 8px;
            "
          >
            <div
              style="
                display: flex;
                align-items: center;
                gap: 10px;
                background: {NEU_BG};
                box-shadow: {neuCfg.btnSm};
                border-radius: 12px;
                padding: 10px 14px;
              "
            >
              <div style="width: 17px; height: 17px; border-radius: 50%; border: 2px solid #22c55e; background: #22c55e; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <div style="width: 6px; height: 6px; border-radius: 50%; background: white;"></div>
              </div>
              <span style="font-size: 13px; font-weight: 600; color: #334155; flex: 1;">Scan Ticket</span>
            </div>

            <button
              type="button"
              onclick={() => update('enableIdleBanner', !boothConfig.config.enableIdleBanner)}
              style="
                display: flex;
                align-items: center;
                gap: 10px;
                background: {NEU_BG};
                box-shadow: {neuCfg.btnSm};
                border-radius: 12px;
                padding: 10px 14px;
                border: none;
                cursor: pointer;
                text-align: left;
                width: 100%;
              "
            >
              <div style="width: 17px; height: 17px; border-radius: 50%; border: 2px solid {boothConfig.config.enableIdleBanner ? '#22c55e' : '#c8d2e0'}; background: {boothConfig.config.enableIdleBanner ? '#22c55e' : 'transparent'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                {#if boothConfig.config.enableIdleBanner}
                  <div style="width: 6px; height: 6px; border-radius: 50%; background: white;"></div>
                {/if}
              </div>
              <span style="font-size: 13px; font-weight: 600; color: {boothConfig.config.enableIdleBanner ? '#334155' : '#94a3b8'}; flex: 1;">
                Pop-up Banner Idle
              </span>
            </button>

            <!-- Take Photo group -->
            <div
              style="
                background: {NEU_BG};
                box-shadow: {neuCfg.inset};
                border-radius: 14px;
                padding: 10px 12px;
                display: flex;
                flex-direction: column;
                gap: 6px;
              "
            >
              <div style="display: flex; align-items: center; gap: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(200,210,224,0.5);">
                <CheckCircle2 size={16} class="text-[#22c55e]" strokeWidth={2.5} />
                <span style="font-size: 13px; font-weight: 600; color: #334155;">Take Photo</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px; padding-top: 2px;">
                <button
                  type="button"
                  onclick={() => update('photoFilter', !boothConfig.config.photoFilter)}
                  style="display: flex; align-items: center; gap: 10px; background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 10px; padding: 7px 12px; border: none; cursor: pointer; text-align: left;"
                >
                  <div style="width: 14px; height: 14px; border-radius: 50%; border: 2px solid {boothConfig.config.photoFilter ? '#22c55e' : '#c8d2e0'}; background: {boothConfig.config.photoFilter ? '#22c55e' : 'transparent'}; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                    {#if boothConfig.config.photoFilter}
                      <div style="width: 6px; height: 6px; border-radius: 50%; background: white;"></div>
                    {/if}
                  </div>
                  <span style="font-size: 12px; font-weight: 500; color: {boothConfig.config.photoFilter ? '#334155' : '#94a3b8'}; flex: 1;">Filter Foto</span>
                </button>

                {#if boothConfig.config.photoFilter}
                  <div style="padding-left: 22px; display: flex; flex-direction: column; gap: 3px;">
                    {#each [
                      { key: 'filterBW', label: 'Black & White' },
                      { key: 'filterSepia', label: 'Sepia' },
                      { key: 'filterVivid', label: 'Vivid' },
                      { key: 'filterRetro', label: 'Retro' },
                      { key: 'filterCool', label: 'Cool' }
                    ] as f}
                      <button
                        type="button"
                        onclick={() => update(f.key as keyof BoothCfg, !boothConfig.config[f.key as keyof BoothCfg])}
                        style="display: flex; align-items: center; gap: 10px; background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 10px; padding: 5px 10px; border: none; cursor: pointer; text-align: left;"
                      >
                        <div style="width: 12px; height: 12px; border-radius: 50%; border: 2px solid {boothConfig.config[f.key as keyof BoothCfg] ? '#22c55e' : '#c8d2e0'}; background: {boothConfig.config[f.key as keyof BoothCfg] ? '#22c55e' : 'transparent'}; flex-shrink: 0;"></div>
                        <span style="font-size: 11px; color: #475569;">{f.label}</span>
                      </button>
                    {/each}
                  </div>
                {/if}

                <button
                  type="button"
                  onclick={() => update('mirrorOn', !boothConfig.config.mirrorOn)}
                  style="display: flex; align-items: center; gap: 10px; background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 10px; padding: 7px 12px; border: none; cursor: pointer; text-align: left;"
                >
                  <div style="width: 14px; height: 14px; border-radius: 50%; border: 2px solid {boothConfig.config.mirrorOn ? '#22c55e' : '#c8d2e0'}; background: {boothConfig.config.mirrorOn ? '#22c55e' : 'transparent'}; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                    {#if boothConfig.config.mirrorOn}
                      <div style="width: 6px; height: 6px; border-radius: 50%;"></div>
                    {/if}
                  </div>
                  <span style="font-size: 12px; font-weight: 500; color: #334155;">Mirror Kamera</span>
                </button>

                <button
                  type="button"
                  onclick={() => update('enableLiveviewVideo', !boothConfig.config.enableLiveviewVideo)}
                  style="display: flex; align-items: center; gap: 10px; background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 10px; padding: 7px 12px; border: none; cursor: pointer; text-align: left;"
                >
                  <div style="width: 14px; height: 14px; border-radius: 50%; border: 2px solid {boothConfig.config.enableLiveviewVideo ? '#22c55e' : '#c8d2e0'}; background: {boothConfig.config.enableLiveviewVideo ? '#22c55e' : 'transparent'}; flex-shrink: 0;"></div>
                  <span style="font-size: 12px; font-weight: 500; color: #334155;">Video Liveview Clip</span>
                </button>

                <button
                  type="button"
                  onclick={() => update('enableSessionGif', !boothConfig.config.enableSessionGif)}
                  style="display: flex; align-items: center; gap: 10px; background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 10px; padding: 7px 12px; border: none; cursor: pointer; text-align: left;"
                >
                  <div style="width: 14px; height: 14px; border-radius: 50%; border: 2px solid {boothConfig.config.enableSessionGif ? '#22c55e' : '#c8d2e0'}; background: {boothConfig.config.enableSessionGif ? '#22c55e' : 'transparent'}; flex-shrink: 0;"></div>
                  <span style="font-size: 12px; font-weight: 500; color: #334155;">GIF Sesi Animasi</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: General Setting -->
        <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
          <p style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 4px 0 0 0;">
            General Setting
          </p>
          <div
            class="custom-scrollbar"
            style="
              flex: 1;
              background: {NEU_BG};
              box-shadow: {neuCfg.card};
              border-radius: 20px;
              padding: 18px 18px 72px 18px;
              overflow-y: auto;
              display: flex;
              flex-direction: column;
              gap: 14px;
            "
          >
            <!-- Mode Kamera: auto-detect via libgphoto2, bukan pilihan manual -->
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em; margin: 0;">
                  Kamera Terdeteksi
                </h1>
                <button
                  type="button"
                  onclick={() => cameraStore.detect()}
                  disabled={cameraStore.isDetecting}
                  style="
                    font-size: 10px;
                    font-weight: 600;
                    color: #2a2873;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.btnSm};
                    border: none;
                    border-radius: 8px;
                    padding: 4px 10px;
                    cursor: pointer;
                  "
                >
                  {cameraStore.isDetecting ? 'Mendeteksi...' : 'Refresh'}
                </button>
              </div>

              {#if cameraStore.detectedCameras.length > 0}
                <!-- Kamera USB ketemu: tampilkan nama model langsung dengan tombol preview di sampingnya -->
                <div style="display: flex; align-items: stretch; gap: 8px;">
                  <div style="flex: 1; background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 12px; padding: 10px 14px; display: flex; flex-direction: column; justify-content: center; gap: 4px;">
                    <span style="font-size: 12px; font-weight: 700; color: #16a34a;">
                      {cameraStore.detectedCameras[0].model}
                    </span>
                    <span style="font-size: 10px; color: #94a3b8; font-family: monospace;">
                      {cameraStore.detectedCameras[0].port}
                    </span>
                  </div>

                  {#if cameraStore.status === 'connected'}
                    <button
                      type="button"
                      onclick={openPreviewDialog}
                      style="
                        background: {NEU_BG};
                        box-shadow: {neuCfg.btn};
                        border: none;
                        border-radius: 12px;
                        padding: 0 14px;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 11px;
                        font-weight: 700;
                        color: {NEU_PRIMARY};
                        cursor: pointer;
                        font-family: 'Poppins', sans-serif;
                        white-space: nowrap;
                        flex-shrink: 0;
                        transition: transform 0.15s ease, box-shadow 0.15s ease;
                      "
                      title="Buka dialog preview kamera langsung"
                    >
                      <Eye size={15} />
                      <span>Lihat Preview</span>
                    </button>
                  {/if}
                </div>

                {#if boothConfig.config.cameraMode === 'usb' && cameraStore.status === 'connected'}
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 11px; color: #16a34a; flex: 1;">Kamera aktif & terhubung</span>
                    <button
                      type="button"
                      onclick={handleOpenManualSettings}
                      style="
                        font-size: 11px; font-weight: 700; color: white;
                        background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY});
                        border: none; border-radius: 10px; padding: 8px 14px; cursor: pointer;
                      "
                    >
                      Atur ISO / Shutter / F
                    </button>
                  </div>
                {:else}
                  <button
                    type="button"
                    onclick={handleConnectDetected}
                    disabled={cameraStore.status === 'connecting'}
                    style="
                      font-size: 12px; font-weight: 700; color: white;
                      background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY});
                      border: none; border-radius: 12px; padding: 10px 14px; cursor: pointer;
                    "
                  >
                    {cameraStore.status === 'connecting' ? 'Menghubungkan...' : 'Hubungkan Kamera Ini'}
                  </button>
                {/if}
              {:else}
                <!-- Tidak ada DSLR terdeteksi via USB -->
                <p style="font-size: 11px" class="text-gray-400">
                  {cameraStore.isDetecting ? 'Mencari kamera via USB…' : 'Tidak ada kamera USB terdeteksi.'}
                </p>
                {#if cameraStore.detectError}
                  <p style="font-size: 10px; color: #dc2626; margin: 0;">{cameraStore.detectError}</p>
                {/if}

                {#if cameraStore.isDevMode || boothConfig.config.cameraMode === 'webcam'}
                  <div style="background: rgba(59, 130, 246, 0.08); border: 1px dashed rgba(59, 130, 246, 0.4); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                      <span style="font-size: 11px; font-weight: 700; color: #2563eb;">
                        🛠 Mode Pengembang (Webcam)
                      </span>
                      {#if boothConfig.config.cameraMode === 'webcam' && cameraStore.status === 'connected'}
                        <span style="font-size: 10px; font-weight: 600; color: #16a34a; background: #dcfce7; padding: 2px 6px; border-radius: 6px;">
                          Webcam Aktif
                        </span>
                      {/if}
                    </div>
                    <p style="font-size: 10px; color: #64748b; margin: 0; line-height: 1.4;">
                      Kamera laptop siap digunakan untuk capture foto, liveframe, animasi GIF, dan pengujian cetak photo strip.
                    </p>
                    <div style="display: flex; gap: 8px;">
                      {#if boothConfig.config.cameraMode === 'webcam' && cameraStore.status === 'connected'}
                        <button
                          type="button"
                          onclick={openPreviewDialog}
                          style="
                            font-size: 11px; font-weight: 700; color: white;
                            background: linear-gradient(135deg, #2563eb, #1d4ed8);
                            border: none; border-radius: 8px;
                            padding: 6px 14px; cursor: pointer;
                            display: flex; align-items: center; gap: 6px;
                          "
                        >
                          <Eye size={14} />
                          <span>Lihat Preview</span>
                        </button>
                        <button
                          type="button"
                          onclick={handleUseUsb}
                          style="
                            font-size: 11px; font-weight: 600; color: #475569;
                            background: white; border: 1px solid #cbd5e1; border-radius: 8px;
                            padding: 6px 12px; cursor: pointer;
                          "
                        >
                          Beralih ke DSLR (USB)
                        </button>
                      {:else}
                        <button
                          type="button"
                          onclick={handleUseWebcam}
                          disabled={cameraStore.status === 'connecting'}
                          style="
                            font-size: 11px; font-weight: 700; color: white;
                            background: linear-gradient(135deg, #2563eb, #1d4ed8);
                            border: none; border-radius: 8px; padding: 6px 12px; cursor: pointer;
                          "
                        >
                          {cameraStore.status === 'connecting' ? 'Menghubungkan...' : 'Aktifkan Webcam Laptop'}
                        </button>
                      {/if}
                    </div>
                  </div>
                {/if}
              {/if}
            </div>

            <div style="height: 1px; background: rgba(200,210,224,0.7);"></div>

            <!-- Printer Terdeteksi -->
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em; margin: 0; display: flex; align-items: center; gap: 5px;">
                  <Printer size={13} color="#475569" />
                  Konfigurasi Printer
                </h1>
                <button
                  type="button"
                  onclick={() => printerStore.loadPrinters()}
                  disabled={printerStore.isDetecting}
                  style="
                    font-size: 10px;
                    font-weight: 600;
                    color: #2a2873;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.btnSm};
                    border: none;
                    border-radius: 8px;
                    padding: 4px 10px;
                    cursor: {printerStore.isDetecting ? 'not-allowed' : 'pointer'};
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    opacity: {printerStore.isDetecting ? 0.7 : 1};
                  "
                >
                  <RotateCw size={11} class={printerStore.isDetecting ? 'animate-spin' : ''} />
                  <span>{printerStore.isDetecting ? 'Mendeteksi...' : 'Refresh'}</span>
                </button>
              </div>

              {#if printerStore.printers.length > 0}
                <!-- Primary Printer Dropdown -->
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <span style="font-size: 10px; font-weight: 600; color: #64748b;">Primary Printer (Default):</span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="position: relative; flex: 1;">
                      <select
                        value={printerStore.selectedPrinter ?? ''}
                        onchange={(e) => {
                          const val = e.currentTarget.value || null;
                          printerStore.selectedPrinter = val;
                          boothConfig.save({ primaryPrinter: val || '' });
                          printerStore.refreshStatus();
                        }}
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
                          font-weight: 600;
                          color: {printerStore.status?.is_ready ? '#16a34a' : '#475569'};
                          font-family: 'Poppins',sans-serif;
                          cursor: pointer;
                        "
                      >
                        {#each printerStore.printers as p}
                          <option value={p}>
                            {p} {printerStore.selectedPrinter === p && printerStore.status?.is_ready ? '(Ready)' : printerStore.selectedPrinter === p ? '(Offline)' : ''}
                          </option>
                        {/each}
                      </select>
                      <ChevronDown size={14} color="#94a3b8" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none;" />
                    </div>

                    <!-- Tombol Pengaturan Printer (Gear) -->
                    <button
                      type="button"
                      title="Buka Pengaturan Printer Properties & Preferences (Aktifkan 2-Inch Cut)"
                      disabled={!printerStore.selectedPrinter}
                      onclick={() => printerStore.openPrinterProperties(printerStore.selectedPrinter)}
                      style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 38px;
                        height: 38px;
                        border-radius: 10px;
                        background: {NEU_BG};
                        box-shadow: {neuCfg.btnSm};
                        border: none;
                        cursor: {printerStore.selectedPrinter ? 'pointer' : 'not-allowed'};
                        color: {printerStore.selectedPrinter ? '#334155' : '#94a3b8'};
                        opacity: {printerStore.selectedPrinter ? 1 : 0.5};
                        flex-shrink: 0;
                        transition: all 0.15s ease;
                      "
                      onmousedown={(e) => {
                        if (printerStore.selectedPrinter) e.currentTarget.style.boxShadow = neuCfg.inset;
                      }}
                      onmouseup={(e) => {
                        if (printerStore.selectedPrinter) e.currentTarget.style.boxShadow = neuCfg.btnSm;
                      }}
                    >
                      <Settings size={16} />
                    </button>
                  </div>
                </div>

                <!-- Secondary Printer Dropdown -->
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <span style="font-size: 10px; font-weight: 600; color: #64748b;">Secondary Printer (Opsional):</span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="position: relative; flex: 1;">
                      <select
                        value={printerStore.secondaryPrinter ?? ''}
                        onchange={(e) => {
                          const val = e.currentTarget.value || null;
                          printerStore.secondaryPrinter = val;
                          boothConfig.save({ secondaryPrinter: val || '' });
                          printerStore.refreshStatus();
                        }}
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
                          font-weight: 600;
                          color: {printerStore.secondaryPrinter && printerStore.secondaryStatus?.is_ready ? '#16a34a' : '#475569'};
                          font-family: 'Poppins',sans-serif;
                          cursor: pointer;
                        "
                      >
                        <option value="">-- Nonaktif (Gunakan Primary) --</option>
                        {#each printerStore.printers as p}
                          <option value={p}>
                            {p} {printerStore.secondaryPrinter === p && printerStore.secondaryStatus?.is_ready ? '(Ready)' : printerStore.secondaryPrinter === p ? '(Offline)' : ''}
                          </option>
                        {/each}
                      </select>
                      <ChevronDown size={14} color="#94a3b8" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none;" />
                    </div>

                    <!-- Tombol Pengaturan Printer (Gear) -->
                    <button
                      type="button"
                      title="Buka Pengaturan Printer Properties & Preferences (Aktifkan 2-Inch Cut)"
                      disabled={!printerStore.secondaryPrinter}
                      onclick={() => printerStore.openPrinterProperties(printerStore.secondaryPrinter)}
                      style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 38px;
                        height: 38px;
                        border-radius: 10px;
                        background: {NEU_BG};
                        box-shadow: {neuCfg.btnSm};
                        border: none;
                        cursor: {printerStore.secondaryPrinter ? 'pointer' : 'not-allowed'};
                        color: {printerStore.secondaryPrinter ? '#334155' : '#94a3b8'};
                        opacity: {printerStore.secondaryPrinter ? 1 : 0.5};
                        flex-shrink: 0;
                        transition: all 0.15s ease;
                      "
                      onmousedown={(e) => {
                        if (printerStore.secondaryPrinter) e.currentTarget.style.boxShadow = neuCfg.inset;
                      }}
                      onmouseup={(e) => {
                        if (printerStore.secondaryPrinter) e.currentTarget.style.boxShadow = neuCfg.btnSm;
                      }}
                    >
                      <Settings size={16} />
                    </button>
                  </div>
                </div>

                <p style="font-size: 10px; color: #64748b; margin: 2px 0 0 0; line-height: 1.4;">
                  💡 <em>Klik tombol icon gear (⚙️) untuk membuka Printer Properties / Preferences Windows guna mengaktifkan fitur <strong>2 inch cut</strong> (photo strip).</em>
                </p>
              {:else}
                <p style="font-size: 11px; margin: 4px 0;" class="text-gray-400">
                  {printerStore.isDetecting ? 'Mencari printer via USB…' : 'Tidak ada printer terdeteksi.'}
                </p>
                {#if printerStore.errorMessage}
                  <p style="font-size: 10px; color: #dc2626; margin: 0;">{printerStore.errorMessage}</p>
                {/if}
              {/if}
            </div>

            <div style="height: 1px; background: rgba(200,210,224,0.7);"></div>

            <!-- Rotasi Kamera -->
            <div style="display: flex; flex-direction: column; gap: 5px;">
              <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em;">
                Rotasi Tampilan Kamera
              </h1>
              <div style="position: relative;">
                <select
                  value={boothConfig.config.cameraRotate}
                  onchange={(e) => update('cameraRotate', e.currentTarget.value)}
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
                    font-family: 'Poppins',sans-serif;
                    cursor: pointer;
                  "
                >
                  {#each ROTATE_OPTS as o}
                    <option value={o}>{o}</option>
                  {/each}
                </select>
                <ChevronDown size={14} color="#94a3b8" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none;" />
              </div>
            </div>

            <div style="height: 1px; background: rgba(200,210,224,0.7);"></div>

            <!-- Countdown + Paper counts -->
            <div style="display: flex; gap: 12px;">
              <!-- Countdown -->
              <div style="display: flex; flex-direction: column; gap: 5px; flex: 1;">
                <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em;">Next Countdown (dtk)</h1>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button onclick={() => update('countdownSecs', Math.max(1, boothConfig.config.countdownSecs - 1))} style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;">−</button>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={boothConfig.config.countdownSecs}
                    oninput={(e) => {
                      const val = parseInt(e.currentTarget.value, 10);
                      if (!isNaN(val) && val >= 1) {
                        update('countdownSecs', val);
                      }
                    }}
                    style="
                      flex: 1;
                      width: 100%;
                      background: {NEU_BG};
                      box-shadow: {neuCfg.inset};
                      border-radius: 10px;
                      padding: 6px 0;
                      text-align: center;
                      font-size: 13px;
                      font-weight: 700;
                      color: #334155;
                      border: none;
                      outline: none;
                      font-family: 'Poppins', sans-serif;
                    "
                  />
                  <button onclick={() => update('countdownSecs', Math.min(99, boothConfig.config.countdownSecs + 1))} style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;">+</button>
                </div>
              </div>

              <!-- Stok Kertas -->
              <div style="display: flex; flex-direction: column; gap: 5px; flex: 1;">
                <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em;">Stok Kertas</h1>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button onclick={() => update('paperCount', Math.max(0, boothConfig.config.paperCount - 1))} style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;">−</button>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={boothConfig.config.paperCount}
                    oninput={(e) => {
                      const val = parseInt(e.currentTarget.value, 10);
                      if (!isNaN(val) && val >= 0) {
                        update('paperCount', val);
                      }
                    }}
                    style="
                      flex: 1;
                      width: 100%;
                      background: {NEU_BG};
                      box-shadow: {neuCfg.inset};
                      border-radius: 10px;
                      padding: 6px 0;
                      text-align: center;
                      font-size: 13px;
                      font-weight: 700;
                      color: #334155;
                      border: none;
                      outline: none;
                      font-family: 'Poppins', sans-serif;
                    "
                  />
                  <button onclick={() => update('paperCount', Math.min(999, boothConfig.config.paperCount + 1))} style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;">+</button>
                </div>
              </div>

              <!-- Batas Peringatan -->
              <div style="display: flex; flex-direction: column; gap: 5px; flex: 1;">
                <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em;">Batas Peringatan</h1>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button onclick={() => update('paperThreshold', Math.max(1, boothConfig.config.paperThreshold - 1))} style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;">−</button>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={boothConfig.config.paperThreshold}
                    oninput={(e) => {
                      const val = parseInt(e.currentTarget.value, 10);
                      if (!isNaN(val) && val >= 1) {
                        update('paperThreshold', val);
                      }
                    }}
                    style="
                      flex: 1;
                      width: 100%;
                      background: {NEU_BG};
                      box-shadow: {neuCfg.inset};
                      border-radius: 10px;
                      padding: 6px 0;
                      text-align: center;
                      font-size: 13px;
                      font-weight: 700;
                      color: #334155;
                      border: none;
                      outline: none;
                      font-family: 'Poppins', sans-serif;
                    "
                  />
                  <button onclick={() => update('paperThreshold', Math.min(100, boothConfig.config.paperThreshold + 1))} style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;">+</button>
                </div>
              </div>
            </div>

            <div style="height: 1px; background: rgba(200,210,224,0.7);"></div>

            <!-- Timeout Banner Idle -->
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em; margin: 0;">
                  Timeout Pop-up Banner Idle
                </h1>
                <span style="font-size: 11px; font-weight: 600; color: #64748b;">
                  {boothConfig.config.idleBannerTimeoutMins} Menit
                </span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 6px; flex: 1;">
                  <button
                    onclick={() => update('idleBannerTimeoutMins', Math.max(1, boothConfig.config.idleBannerTimeoutMins - 1))}
                    style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;"
                  >−</button>
                  <div
                    style="flex: 1; background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 10px; padding: 6px 0; text-align: center; font-size: 13px; font-weight: 700; color: #334155;"
                  >
                    {boothConfig.config.idleBannerTimeoutMins} Menit
                  </div>
                  <button
                    onclick={() => update('idleBannerTimeoutMins', Math.min(60, boothConfig.config.idleBannerTimeoutMins + 1))}
                    style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;"
                  >+</button>
                </div>
                <!-- Quick presets -->
                <div style="display: flex; gap: 4px;">
                  {#each [1, 2, 3, 5, 10] as m}
                    <button
                      type="button"
                      onclick={() => update('idleBannerTimeoutMins', m)}
                      style="
                        padding: 6px 9px;
                        border-radius: 8px;
                        background: {NEU_BG};
                        box-shadow: {boothConfig.config.idleBannerTimeoutMins === m ? neuCfg.inset : neuCfg.btnSm};
                        border: none;
                        cursor: pointer;
                        font-size: 11px;
                        font-family: 'Poppins', sans-serif;
                        font-weight: {boothConfig.config.idleBannerTimeoutMins === m ? 700 : 500};
                        color: {boothConfig.config.idleBannerTimeoutMins === m ? '#2a2873' : '#64748b'};
                      "
                    >
                      {m}m
                    </button>
                  {/each}
                </div>
              </div>
              <p style="font-size: 10px; color: #94a3b8; margin: 0;">
                Pop-up slider banner muncul otomatis saat tidak ada interaksi / klik pada layar awal.
              </p>
            </div>

            <div style="height: 1px; background: rgba(200,210,224,0.7);"></div>

            <!-- PIN change -->
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em;">PIN Admin</h1>
              <div style="display: flex; gap: 10px;">
                <input
                  type="password"
                  maxLength={4}
                  value={boothConfig.config.pin}
                  oninput={(e) => {
                    const v = e.currentTarget.value;
                    if (/^\d{0,4}$/.test(v)) update('pin', v);
                  }}
                  placeholder="••••"
                  style="
                    flex: 1;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.inset};
                    border-radius: 12px;
                    padding: 10px 14px;
                    border: none;
                    outline: none;
                    font-size: 14px;
                    font-weight: 700;
                    color: #334155;
                    font-family: 'Poppins',sans-serif;
                    letter-spacing: 0.2em;
                  "
                />
              </div>
              <p style="font-size: 10px; color: #94a3b8; margin: 0;">Masukkan 4 digit PIN baru. Perubahan tersimpan otomatis.</p>
            </div>

            <div style="height: 1px; background: rgba(200,210,224,0.7);"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Floating Save Button -->
  <div
    style="
      position: fixed;
      bottom: 24px;
      right: 28px;
      z-index: 50;
      display: flex;
      align-items: center;
      gap: 10px;
    "
  >
    {#if saveNotice}
      <div
        style="
          background: #22c55e;
          color: white;
          padding: 10px 18px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
          box-shadow: 0 4px 16px rgba(34, 197, 94, 0.35);
        "
      >
        {saveNotice}
      </div>
    {/if}

    <button
      type="button"
      onclick={handleManualSave}
      style="
        padding: 14px 26px;
        border-radius: 16px;
        background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY});
        border: none;
        cursor: pointer;
        font-family: 'Poppins', sans-serif;
        font-weight: 700;
        font-size: 13px;
        color: white;
        box-shadow: 0 8px 24px rgba(42,40,115,0.4);
        display: flex;
        align-items: center;
        gap: 10px;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      "
      onmouseenter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
      onmouseleave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <Save size={18} />
      <span>Simpan Pengaturan</span>
    </button>
  </div>

  <!-- Dialog Live Preview Kamera -->
  {#if isPreviewOpen}
    <div
      class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200"
      onclick={(e) => {
        if (e.target === e.currentTarget) closePreviewDialog();
      }}
      onkeydown={handleKeydown}
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label="Dialog Live Preview Kamera"
    >
      <div
        style="
          width: 100%;
          max-width: 680px;
          background: {NEU_BG};
          box-shadow: 0 25px 60px rgba(0,0,0,0.4), {neuCfg.card};
          border-radius: 24px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(255,255,255,0.4);
        "
      >
        <!-- Dialog Header -->
        <div
          style="
            background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY});
            padding: 16px 22px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            color: white;
            box-shadow: 0 4px 16px rgba(42,40,115,0.25);
          "
        >
          <div style="display: flex; align-items: center; gap: 12px;">
            <div
              style="
                width: 36px;
                height: 36px;
                border-radius: 12px;
                background: rgba(255,255,255,0.18);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
              "
            >
              <Camera size={19} />
            </div>
            <div>
              <h3 style="margin: 0; font-size: 14px; font-weight: 700; letter-spacing: 0.02em;">
                Live Preview Kamera Langsung
              </h3>
              <p style="margin: 0; font-size: 11px; opacity: 0.85;">
                {cameraStore.device?.manufacturer || cameraStore.device?.productname || cameraStore.detectedCameras[0]?.model || 'Kamera Terhubung'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onclick={closePreviewDialog}
            style="
              width: 34px;
              height: 34px;
              border-radius: 10px;
              background: rgba(255,255,255,0.15);
              border: none;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              cursor: pointer;
              transition: background 0.15s ease;
            "
            title="Tutup Preview (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        <!-- Dialog Body: Screen Display -->
        <div style="padding: 20px; display: flex; flex-direction: column; gap: 14px;">
          <div
            style="
              width: 100%;
              height: 400px;
              background: #090d16;
              box-shadow: {neuCfg.inset};
              border-radius: 18px;
              display: flex;
              align-items: center;
              justify-content: center;
              position: relative;
              overflow: hidden;
              border: 1px solid rgba(0,0,0,0.1);
            "
          >
            <!-- Live Indicator Badge -->
            <div
              style="
                position: absolute;
                top: 14px;
                left: 14px;
                background: rgba(15, 23, 42, 0.75);
                backdrop-filter: blur(6px);
                padding: 4px 10px;
                border-radius: 9999px;
                display: flex;
                align-items: center;
                gap: 6px;
                z-index: 10;
                border: 1px solid rgba(255,255,255,0.15);
              "
            >
              <span style="width: 8px; height: 8px; border-radius: 9999px; background: #22c55e; box-shadow: 0 0 8px #22c55e;" class="animate-pulse"></span>
              <span style="font-size: 10px; font-weight: 700; color: white; text-transform: uppercase; letter-spacing: 0.05em;">Live View</span>
            </div>

            <!-- Video / Image Preview Frame -->
            {#if cameraStore.cameraMode === 'webcam'}
              <video
                bind:this={previewVideoEl}
                autoplay
                playsinline
                muted
                class="max-w-full max-h-full object-contain"
                style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
              ></video>
            {:else if previewFrameSrc}
              <img
                src={previewFrameSrc}
                alt="Live preview kamera"
                class="max-w-full max-h-full object-contain"
                style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
              />
            {:else}
              <!-- Loading state -->
              <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; color: #94a3b8;">
                <RotateCw size={32} class="animate-spin text-indigo-400" />
                <span style="font-size: 12px; font-weight: 600;">Mengambil liveview dari kamera...</span>
              </div>
            {/if}
          </div>

          <!-- Info status bar -->
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #64748b; padding: 0 4px;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <span>Mode: <strong class="text-slate-800 uppercase">{cameraStore.cameraMode}</strong></span>
              <span>Rotasi: <strong class="text-slate-800">{boothConfig.config.cameraRotate || '0°'}</strong></span>
              <span>Mirror: <strong class="text-slate-800">{boothConfig.config.mirrorOn ? 'Aktif' : 'Nonaktif'}</strong></span>
            </div>
            <button
              type="button"
              onclick={closePreviewDialog}
              style="
                padding: 8px 18px;
                border-radius: 12px;
                background: {NEU_BG};
                box-shadow: {neuCfg.btnSm};
                border: none;
                font-family: 'Poppins', sans-serif;
                font-size: 11px;
                font-weight: 700;
                color: #475569;
                cursor: pointer;
              "
            >
              Tutup Preview
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <UpdateModal />
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.35);
    border-radius: 10px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(148, 163, 184, 0.6);
  }
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(148, 163, 184, 0.35) transparent;
  }
</style>
