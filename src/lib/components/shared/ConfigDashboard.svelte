<script lang="ts">
  import { onMount, onDestroy, tick, type Snippet } from 'svelte';
  import {
    Monitor,
    ClockCheck,
    Clock,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Printer,
    RotateCw,
    Eye,
    EyeOff,
    Camera,
    Settings,
    RefreshCw,
    Layers,
    UploadCloud,
    FolderOpen,
    Trash2,
    Flag
  } from '@lucide/svelte';
  import UpdateModal from '$lib/components/shared/UpdateModal.svelte';
  import ReuploadSessionsModal from '$lib/components/shared/ReuploadSessionsModal.svelte';
  import ReportProblemModal from '$lib/components/shared/ReportProblemModal.svelte';
  import { updaterStore } from '$lib/utils/updater.svelte';
  import { goto } from '$app/navigation';
  import { boothConfig, type BoothCfg } from '$lib/stores/boothConfig.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { syncBoothSettings, getActiveBoothId, pushPaperSettingsToServer, pushTimerSettingsToServer } from '$lib/api/boothClient';
  import { networkStatus } from '$lib/stores/networkStatus.svelte';
  import {
    countPendingOutboxJobs,
    countPendingSessionSoftfileJobs,
    countPendingPrintJobs,
    clearAllPendingPrintJobs,
  } from '$lib/db/local';
  import { invoke } from '@tauri-apps/api/core';
  import { flushOutbox } from '$lib/utils/offlineOutbox';
  import { flushPrintQueue } from '$lib/utils/printQueue';
  import { flushProblemReports } from '$lib/utils/problemReports';
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
  let pendingSoftfileSessions = $state(0);
  let pendingPrintJobs = $state(0);
  let isReuploadModalOpen = $state(false);
  let isUploadingPending = $state(false);
  let isPrintingQueue = $state(false);
  let isClearingPrintQueue = $state(false);
  let isReportOpen = $state(false);

  // Halaman: utama atau "Pengaturan sesi" (sesuai desain Figma)
  let view = $state<'main' | 'session'>('main');
  let sessionDraft = $state({
    photoSessionTimeSecs: 60,
    firstCountdownSecs: 5,
    countdownSecs: 3,
    idleBannerTimeoutMins: 2,
    paperCount: 100,
    paperThreshold: 20
  });

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

  function showNotice(msg: string, ms = 3500) {
    saveNotice = msg;
    setTimeout(() => {
      if (saveNotice === msg) saveNotice = null;
    }, ms);
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
      await refreshPendingCount();
    }
    setTimeout(() => {
      syncStatus = null;
    }, 3000);
  }

  async function refreshPendingCount() {
    pendingJobs = await countPendingOutboxJobs().catch(() => 0);
    pendingSoftfileSessions = await countPendingSessionSoftfileJobs().catch(() => 0);
    pendingPrintJobs = await countPendingPrintJobs().catch(() => 0);
  }

  async function handleFlushPrintQueue() {
    if (isPrintingQueue || pendingPrintJobs === 0) return;
    isPrintingQueue = true;
    try {
      const res = await flushPrintQueue({ force: true });
      await refreshPendingCount();
      showNotice(`Proses cetak selesai! ${res.processed} lembar dicetak${res.errors > 0 ? `, ${res.errors} gagal` : ''}.`);
    } catch (err) {
      showNotice(`Cetak antrean gagal: ${String(err)}`);
    } finally {
      isPrintingQueue = false;
    }
  }

  async function handleClearPrintQueue() {
    if (isClearingPrintQueue || pendingPrintJobs === 0) return;
    const ok = confirm(`Batalkan dan hapus ${pendingPrintJobs} antrean cetak foto yang tertunda?`);
    if (!ok) return;

    isClearingPrintQueue = true;
    try {
      const cleared = await clearAllPendingPrintJobs();
      await refreshPendingCount();
      showNotice(`Berhasil membatalkan ${cleared} antrean cetak foto!`);
    } catch (err) {
      showNotice(`Gagal membatalkan antrean: ${String(err)}`);
    } finally {
      isClearingPrintQueue = false;
    }
  }

  async function handleUploadAllPending() {
    if (isUploadingPending) return;
    isUploadingPending = true;
    try {
      const outboxRes = await flushOutbox({ force: true });
      await flushPrintQueue({ force: true });
      await refreshPendingCount();
      showNotice(`Sinkronisasi selesai! ${outboxRes.processed} upload diproses.`);
    } catch (err) {
      showNotice(`Sinkronisasi gagal: ${String(err)}`);
    } finally {
      isUploadingPending = false;
    }
  }

  async function handleConnectDetected() {
    fallbackMode = null;
    await update('cameraMode', 'usb');
  }

  async function handleUseFallback(mode: 'demo') {
    fallbackMode = mode;
    await update('cameraMode', mode);
  }

  async function handleOpenManualSettings() {
    await closePreview();
    goto('/camera-manual-settings');
  }

  async function handleOpenPrinterProperties(printerName: string | null) {
    if (!printerName) return;
    try {
      await printerStore.openPrinterProperties(printerName);
    } catch (err) {
      showNotice(`Gagal membuka preferensi printer: ${String(err)}`, 4000);
    }
  }

  async function handleOpenSecondaryPrinterProperties() {
    if (!printerStore.selectedPrinter) {
      showNotice('Pilih Primary Printer terlebih dahulu sebelum mengatur Secondary Printer', 4000);
      return;
    }
    try {
      await printerStore.openSecondaryPrinterProperties();
    } catch (err) {
      showNotice(`Gagal membuka preferensi secondary printer: ${String(err)}`, 4000);
    }
  }

  // Preview kamera di dalam kartu Kamera (desain Figma). Logika liveview sama dengan dialog lama.
  let isPreviewOpen = $state(false);
  let previewFrameSrc = $state<string | null>(null);
  let previewInterval: ReturnType<typeof setInterval> | null = null;
  let previewVideoEl = $state<HTMLVideoElement | null>(null);

  async function openPreview() {
    if (cameraStore.status !== 'connected' || isPreviewOpen) return;
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

  async function closePreview() {
    if (!isPreviewOpen) return;
    isPreviewOpen = false;
    if (previewInterval) {
      clearInterval(previewInterval);
      previewInterval = null;
    }
    previewFrameSrc = null;
    await cameraStore.stopLiveview();
  }

  function togglePreview() {
    if (isPreviewOpen) void closePreview();
    else void openPreview();
  }

  function openSessionSettings() {
    sessionDraft = {
      photoSessionTimeSecs: boothConfig.config.photoSessionTimeSecs || 60,
      firstCountdownSecs: boothConfig.config.firstCountdownSecs || 5,
      countdownSecs: boothConfig.config.countdownSecs || 3,
      idleBannerTimeoutMins: boothConfig.config.idleBannerTimeoutMins || 2,
      paperCount: boothConfig.config.paperCount,
      paperThreshold: boothConfig.config.paperThreshold
    };
    void closePreview();
    view = 'session';
  }

  function saveSessionSettings() {
    boothConfig.save({ ...sessionDraft });
    if (printerStore.status) {
      printerStore.status.paper_remaining = sessionDraft.paperCount;
    }
    if (printerStore.secondaryStatus) {
      printerStore.secondaryStatus.paper_remaining = sessionDraft.paperCount;
    }
    void pushPaperSettingsToServer(sessionDraft.paperCount, sessionDraft.paperThreshold);
    void pushTimerSettingsToServer({
      firstCountdownSecs: sessionDraft.firstCountdownSecs,
      countdownSecs: sessionDraft.countdownSecs,
      photoSessionTimeSecs: sessionDraft.photoSessionTimeSecs,
    });
    view = 'main';
    showNotice('Pengaturan sesi disimpan!', 2500);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && view === 'session') {
      view = 'main';
    }
  }

  onMount(async () => {
    window.addEventListener('keydown', handleKeydown);
    const boothId = await getActiveBoothId();
    if (boothId) {
      await boothConfig.init(boothId);
    }
    boothName = uiConfig.config.boothName || boothName;
    void refreshPendingCount();
    void handleSync();
    void flushProblemReports().catch(() => 0);
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
  const ROTATE_LABELS = ['0°', '90°', '180°', '270°'];
  const IDLE_OPTS = [1, 2, 3, 5, 10];
  const FILTER_OPTS: { key: keyof BoothCfg; label: string }[] = [
    { key: 'filterBW', label: 'B&W' },
    { key: 'filterSepia', label: 'Sepia' },
    { key: 'filterVivid', label: 'Vivid' },
    { key: 'filterRetro', label: 'Retro' },
    { key: 'filterCool', label: 'Cool' }
  ];

  let cameraName = $derived(
    cameraStore.cameraMode === 'webcam'
      ? 'Webcam Laptop'
      : cameraStore.detectedCameras[0]?.model || cameraStore.device?.productname || 'Belum ada kamera'
  );
  let cameraConnected = $derived(cameraStore.status === 'connected');
  let paperPct = $derived(
    Math.min(100, Math.round((boothConfig.config.paperCount / Math.max(100, boothConfig.config.paperCount)) * 100))
  );
  let lowPaper = $derived(boothConfig.config.paperCount <= boothConfig.config.paperThreshold);
  let printerReadyCount = $derived(
    (printerStore.selectedPrinter ? 1 : 0) + (printerStore.secondaryPrinter ? 1 : 0)
  );

  // Gaya bersama (diambil dari desain Figma)
  const cardStyle = `background: ${NEU_BG}; box-shadow: ${neuCfg.card}; border-radius: 20px; padding: 20px;`;
  const iconBoxStyle = `width: 42px; height: 42px; border-radius: 12px; background: ${NEU_BG}; box-shadow: ${neuCfg.btnSm}; display: flex; align-items: center; justify-content: center; color: ${NEU_PRIMARY}; flex-shrink: 0;`;
  const btnBaseStyle = `min-height: 44px; padding: 0 18px; border-radius: 12px; background: ${NEU_BG}; box-shadow: ${neuCfg.btn}; border: none; cursor: pointer; font-family: 'Poppins',sans-serif; font-weight: 700; font-size: 13px; color: #334155; display: flex; align-items: center; gap: 8px; touch-action: manipulation;`;
  const btnPrimaryStyle = `${btnBaseStyle} background: linear-gradient(135deg, #3d3aa0, ${NEU_PRIMARY}); color: white; box-shadow: 0 4px 14px rgba(42,40,115,0.35);`;
  const titleStyle = 'margin: 0; font-size: 15px; font-weight: 700; color: #1e293b;';
  const subStyle = 'margin: 0; font-size: 11px; color: #475569;';
  const headerBtnStyle = 'position: relative; height: 40px; padding: 0 16px; border-radius: 12px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); cursor: pointer; color: white; font-family: \'Poppins\',sans-serif; font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 6px;';
  const selectStyle = `width: 100%; appearance: none; background: ${NEU_BG}; box-shadow: ${neuCfg.inset}; border-radius: 12px; padding: 11px 32px 11px 14px; border: none; outline: none; font-size: 13px; font-weight: 600; color: #334155; font-family: 'Poppins',sans-serif; cursor: pointer;`;
</script>

{#snippet featureRow(label: string, value: boolean, onToggle: (() => void) | null, indent = false)}
  <div
    role="switch"
    aria-checked={value}
    aria-label={label}
    tabindex={onToggle ? 0 : -1}
    onclick={() => onToggle?.()}
    onkeydown={(e) => {
      if (onToggle && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onToggle();
      }
    }}
    style="display: flex; align-items: center; gap: 12px; padding: 9px 0; padding-left: {indent ? 22 : 0}px; cursor: {onToggle ? 'pointer' : 'default'}; user-select: none; touch-action: manipulation;"
  >
    <span style="flex: 1; font-size: 13px; font-weight: 600; color: {value ? '#1e293b' : '#5b6b82'}; transition: color .15s;">{label}</span>
    <span
      style="position: relative; width: 46px; height: 26px; border-radius: 999px; background: {value ? NEU_PRIMARY : NEU_BG}; box-shadow: {value ? 'inset 2px 2px 5px rgba(0,0,0,0.3)' : neuCfg.inset}; transition: background .2s; flex-shrink: 0; opacity: {onToggle ? 1 : 0.7};"
    >
      <span
        style="position: absolute; top: 3px; left: {value ? 23 : 3}px; width: 20px; height: 20px; border-radius: 50%; background: {value ? 'white' : '#cbd5e1'}; box-shadow: 1px 1px 4px rgba(0,0,0,0.3); transition: left .2s, background .2s;"
      ></span>
    </span>
  </div>
{/snippet}

{#snippet stepper(value: number, min: number, max: number, onChange: (v: number) => void, unit = '')}
  {@const stepBtn = `width: 44px; height: 44px; border-radius: 12px; background: ${NEU_BG}; box-shadow: ${neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 20px; color: #334155; touch-action: manipulation;`}
  <div style="display: flex; align-items: center; gap: 14px;">
    <button type="button" onclick={() => onChange(Math.max(min, value - 1))} style={stepBtn}>−</button>
    <span style="display: flex; align-items: baseline; justify-content: center; gap: 4px; min-width: 72px;">
      <input
        type="number"
        {min}
        {max}
        {value}
        oninput={(e) => {
          const v = parseInt(e.currentTarget.value, 10);
          if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        style="width: 52px; text-align: center; font-size: 17px; font-weight: 700; color: #1e293b; background: transparent; border: none; outline: none; font-family: 'Poppins', sans-serif; padding: 0;"
      />
      {#if unit}<span style="font-size: 13px; font-weight: 600; color: #475569;">{unit}</span>{/if}
    </span>
    <button type="button" onclick={() => onChange(Math.min(max, value + 1))} style={stepBtn}>+</button>
  </div>
{/snippet}

{#snippet sessionRow(name: string, desc: string, last: boolean, control: Snippet)}
  <div style="display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: {last ? 'none' : '1px solid rgba(200,210,224,0.7)'};">
    <div style="flex: 1;">
      <p style={titleStyle}>{name}</p>
      <p style={subStyle}>{desc}</p>
    </div>
    {@render control()}
  </div>
{/snippet}

<div class="w-screen h-screen overflow-hidden relative">
  <div style="width: 100%; height: 100%; background: {NEU_BG}; display: flex; flex-direction: column; font-family: 'Poppins', sans-serif; overflow: hidden;">
    {#if view === 'session'}
      <!-- ── Halaman Pengaturan Sesi ── -->
      <div style="background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY}); display: flex; align-items: center; padding: 0 24px; height: 68px; flex-shrink: 0; box-shadow: 0 4px 20px rgba(42,40,115,0.3); gap: 14px;">
        <button
          type="button"
          onclick={() => (view = 'main')}
          aria-label="Kembali"
          style="width: 40px; height: 40px; border-radius: 12px; background: rgba(255,255,255,0.15); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0;"
        >
          <ChevronLeft size={20} />
        </button>
        <div style="flex: 1; min-width: 0;">
          <h1 style="margin: 0; color: white; font-weight: 700; font-size: 1.05rem; line-height: 1.2;">Pengaturan sesi</h1>
          <p style="margin: 0; color: rgba(255,255,255,0.75); font-size: 11px;">Pengaturan Mesin › Sesi</p>
        </div>
      </div>

      <div class="custom-scrollbar" style="flex: 1; overflow-y: auto; padding: 24px;">
        <div style="max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px;">
          <div style="{cardStyle} padding: 4px 22px;">
            {#snippet sessionTimeCtl()}
              {@render stepper(sessionDraft.photoSessionTimeSecs, 15, 600, (v) => (sessionDraft.photoSessionTimeSecs = v), 'dtk')}
            {/snippet}
            {@render sessionRow('Batas waktu sesi foto', 'Total durasi di layar foto sebelum otomatis selesai.', false, sessionTimeCtl)}

            {#snippet firstCountdownCtl()}
              {@render stepper(sessionDraft.firstCountdownSecs, 1, 99, (v) => (sessionDraft.firstCountdownSecs = v), 'dtk')}
            {/snippet}
            {@render sessionRow('Countdown foto pertama', 'Hitung mundur sebelum jepretan foto pertama diambil.', false, firstCountdownCtl)}

            {#snippet countdownCtl()}
              {@render stepper(sessionDraft.countdownSecs, 1, 99, (v) => (sessionDraft.countdownSecs = v), 'dtk')}
            {/snippet}
            {@render sessionRow('Countdown antar foto', 'Jeda hitung mundur sebelum foto berikutnya diambil.', false, countdownCtl)}

            {#snippet idleCtl()}
              <div style="display: flex; gap: 4px; padding: 4px; border-radius: 14px; background: {NEU_BG}; box-shadow: {neuCfg.inset};">
                {#each IDLE_OPTS as m}
                  {@const on = sessionDraft.idleBannerTimeoutMins === m}
                  <button
                    type="button"
                    onclick={() => (sessionDraft.idleBannerTimeoutMins = m)}
                    style="min-width: 48px; height: 40px; border-radius: 10px; border: none; cursor: pointer; font-family: 'Poppins',sans-serif; font-weight: 700; font-size: 13px; background: {on ? NEU_BG : 'transparent'}; box-shadow: {on ? neuCfg.btnSm : 'none'}; color: {on ? NEU_PRIMARY : '#475569'}; touch-action: manipulation;"
                  >{m} m</button>
                {/each}
              </div>
            {/snippet}
            {@render sessionRow(
              'Banner idle muncul setelah',
              IDLE_OPTS.includes(sessionDraft.idleBannerTimeoutMins)
                ? 'Jika layar awal tidak disentuh.'
                : `Jika layar awal tidak disentuh. Saat ini: ${sessionDraft.idleBannerTimeoutMins} menit.`,
              false,
              idleCtl
            )}

            {#snippet paperCtl()}
              {@render stepper(sessionDraft.paperCount, 0, 999, (v) => (sessionDraft.paperCount = v))}
            {/snippet}
            {@render sessionRow('Stok kertas', 'Isi sesuai jumlah lembar setelah ganti roll.', false, paperCtl)}

            {#snippet thresholdCtl()}
              {@render stepper(sessionDraft.paperThreshold, 1, 100, (v) => (sessionDraft.paperThreshold = v))}
            {/snippet}
            {@render sessionRow('Peringatan kertas hampir habis', 'Muncul saat stok tersisa sebanyak ini.', true, thresholdCtl)}
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" style={btnBaseStyle} onclick={() => (view = 'main')}>Batal</button>
            <button type="button" style={btnPrimaryStyle} onclick={saveSessionSettings}>Simpan</button>
          </div>
        </div>
      </div>
    {:else}
      <!-- ── Halaman utama Pengaturan Mesin ── -->
      <div style="background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY}); display: flex; align-items: center; padding: 0 24px; height: 68px; flex-shrink: 0; box-shadow: 0 4px 20px rgba(42,40,115,0.3); gap: 14px;">
        <button
          type="button"
          onclick={onBack}
          aria-label="Kembali"
          style="width: 40px; height: 40px; border-radius: 12px; background: rgba(255,255,255,0.15); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0;"
        >
          <ChevronLeft size={20} />
        </button>
        <div style="flex: 1; min-width: 0;">
          <h1 style="margin: 0; color: white; font-weight: 700; font-size: 1.05rem; line-height: 1.2;">Pengaturan Mesin</h1>
          <p style="margin: 0; color: rgba(255,255,255,0.75); font-size: 11px;">{boothName || 'Booth'} · v{updaterStore.currentVersion}</p>
        </div>
        <button type="button" style={headerBtnStyle} onclick={() => updaterStore.checkForUpdates(false)}>
          <RefreshCw size={15} class={updaterStore.isChecking ? 'animate-spin' : ''} />Cek update
          {#if updaterStore.hasUpdate}
            <span style="position: absolute; top: -4px; right: -4px; width: 12px; height: 12px; border-radius: 50%; background: #ef4444; border: 2px solid #3d3aa0;"></span>
          {/if}
        </button>
        <button type="button" style={headerBtnStyle} onclick={() => (isReportOpen = true)}>
          <Flag size={15} />Report Problem
        </button>
        <button type="button" style={headerBtnStyle} onclick={onLogout}>Logout</button>
      </div>

      {#if pendingJobs > 0}
        <div role="alert" style="display: flex; align-items: center; gap: 12px; padding: 10px 24px; background: #fff7e0; border-bottom: 1px solid #f5d98a; flex-shrink: 0;">
          <span style="width: 10px; height: 10px; border-radius: 50%; background: #f59e0b; flex-shrink: 0;"></span>
          <div style="flex: 1;">
            <p style="margin: 0; font-size: 13px; font-weight: 700; color: #78350f;">{pendingJobs} data menunggu sync</p>
            <p style="margin: 0; font-size: 11px; color: #92400e;">Terakhir sync {lastSyncedAt ?? 'belum pernah'}</p>
          </div>
          <button type="button" style="{btnPrimaryStyle} min-height: 40px;" onclick={handleSync} disabled={syncStatus === 'Syncing...'}>
            <RefreshCw size={15} class={syncStatus === 'Syncing...' ? 'animate-spin' : ''} />
            {syncStatus === 'Syncing...' ? 'Menyinkronkan...' : `Sync sekarang (${pendingJobs})`}
          </button>
        </div>
      {/if}

      <div class="custom-scrollbar" style="flex: 1; overflow-y: auto; padding: 24px;">
        <!-- Kartu info -->
        <div style="{cardStyle} max-width: 1400px; margin: 0 auto 20px; display: flex; align-items: center; gap: 28px; padding: 14px 20px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="{iconBoxStyle} width: 36px; height: 36px;"><Monitor size={16} /></div>
            <div><p style="{subStyle} font-weight: 700;">Nama device</p><p style="{subStyle} font-size: 12px;">{boothName || '-'}</p></div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="{iconBoxStyle} width: 36px; height: 36px;"><ClockCheck size={16} /></div>
            <div>
              <p style="{subStyle} font-weight: 700;">Last synchronized at</p>
              <p style="{subStyle} font-size: 12px;">{syncStatus || lastSyncedAt || 'Belum pernah sync'}</p>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="{iconBoxStyle} width: 36px; height: 36px;"><Layers size={16} /></div>
            <div>
              <p style="{subStyle} font-weight: 700;">Version</p>
              <p style="{subStyle} font-size: 12px; display: flex; align-items: center; gap: 6px;">
                v{updaterStore.currentVersion}
                {#if updaterStore.hasUpdate}
                  <span style="padding: 1px 6px; border-radius: 999px; background: #f59e0b; color: white; font-size: 9px; font-weight: 700;">Update</span>
                {/if}
              </p>
            </div>
          </div>
          <div style="flex: 1;"></div>
          <span style="padding: 5px 12px; border-radius: 999px; background: #fff7e0; color: #78350f; font-size: 11px; font-weight: 700;">Pending sync offline: {pendingJobs}</span>
          {#if pendingPrintJobs > 0}
            <span style="padding: 5px 12px; border-radius: 999px; background: #ede9fe; color: #5b21b6; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
              <Printer size={12} />Pending cetak: {pendingPrintJobs}
            </span>
          {/if}
          <button type="button" style="{btnBaseStyle} min-height: 36px;" onclick={handleSync} disabled={syncStatus === 'Syncing...'}>
            <RefreshCw size={14} class={syncStatus === 'Syncing...' ? 'animate-spin' : ''} />Sync
          </button>
        </div>

        <div style="display: grid; grid-template-columns: 260px minmax(0,1fr) minmax(0,1fr); gap: 20px; align-items: start; max-width: 1400px; margin: 0 auto;">
          <!-- Fitur aktif -->
          <div style={cardStyle}>
            <p style="{titleStyle} margin-bottom: 6px;">Fitur aktif</p>
            {@render featureRow('Scan tiket', true, null)}
            {@render featureRow('Pop-up banner idle', boothConfig.config.enableIdleBanner, () => update('enableIdleBanner', !boothConfig.config.enableIdleBanner))}
            {@render featureRow('Pembayaran (Cashless)', !boothConfig.config.skipPayment, null)}
            {@render featureRow('Filter foto', boothConfig.config.photoFilter, () => update('photoFilter', !boothConfig.config.photoFilter))}
            {#if boothConfig.config.photoFilter}
              <div style="display: flex; flex-wrap: wrap; gap: 6px; padding-left: 22px; padding-bottom: 6px;">
                {#each FILTER_OPTS as f}
                  {@const on = Boolean(boothConfig.config[f.key])}
                  <button
                    type="button"
                    onclick={() => update(f.key, !on as never)}
                    style="padding: 5px 12px; border-radius: 999px; border: none; cursor: pointer; font-family: 'Poppins',sans-serif; font-size: 11px; font-weight: 600; background: {NEU_BG}; box-shadow: {on ? neuCfg.btnSm : neuCfg.inset}; color: {on ? NEU_PRIMARY : '#5b6b82'}; touch-action: manipulation;"
                  >{f.label}</button>
                {/each}
              </div>
            {/if}
            {@render featureRow('Mirror kamera', boothConfig.config.mirrorOn, () => update('mirrorOn', !boothConfig.config.mirrorOn))}
            {@render featureRow('Flip vertikal', boothConfig.config.flipVertical, () => update('flipVertical', !boothConfig.config.flipVertical))}
            {@render featureRow('Video liveview clip', boothConfig.config.enableLiveviewVideo, () => update('enableLiveviewVideo', !boothConfig.config.enableLiveviewVideo))}
            {@render featureRow('GIF sesi animasi', boothConfig.config.enableSessionGif, () => update('enableSessionGif', !boothConfig.config.enableSessionGif))}
            <div style="height: 1px; background: rgba(200,210,224,0.7); margin: 10px 0;"></div>
            <p style="{subStyle} font-size: 10px;">Geser toggle untuk mengaktifkan atau menonaktifkan fitur. Scan tiket & pembayaran diatur dari dashboard web.</p>
          </div>

          <!-- Kamera -->
          <div style={cardStyle}>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">
              <div style={iconBoxStyle}><Camera size={18} /></div>
              <div style="flex: 1; min-width: 0;">
                <p style={titleStyle}>Kamera</p>
                <p style="{subStyle} white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{cameraName} · {cameraStore.cameraMode === 'webcam' ? 'Webcam' : 'USB'}</p>
              </div>
              {#if cameraConnected}
                <button type="button" style="{btnBaseStyle} min-height: 34px; padding: 0 12px; font-size: 12px;" onclick={togglePreview}>
                  {#if isPreviewOpen}<EyeOff size={14} />Sembunyikan preview{:else}<Eye size={14} />Lihat preview{/if}
                </button>
              {/if}
              <span style="padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap; background: {cameraConnected ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.12)'}; color: {cameraConnected ? '#15803d' : '#b91c1c'};">
                {cameraConnected ? 'Terhubung' : cameraStore.status === 'connecting' ? 'Menghubungkan…' : 'Tidak terhubung'}
              </span>
            </div>

            {#if isPreviewOpen}
              <div style="position: relative; height: 220px; border-radius: 16px; background: #171733; box-shadow: {neuCfg.inset}; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                <span style="position: absolute; top: 10px; left: 10px; z-index: 2; padding: 3px 10px; border-radius: 8px; background: rgba(0,0,0,0.6); color: white; font-size: 11px; font-weight: 600;">
                  Rotasi {ROTATE_LABELS[Math.max(0, ROTATE_OPTS.indexOf(boothConfig.config.cameraRotate))]}
                </span>
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
                  <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; color: rgba(255,255,255,0.7); font-size: 12px;">
                    <RotateCw size={28} class="animate-spin" />
                    Mengambil liveview dari kamera...
                  </div>
                {/if}
                <span style="position: absolute; bottom: 10px; right: 10px; z-index: 2; padding: 3px 10px; border-radius: 8px; background: rgba(0,0,0,0.6); color: white; font-size: 11px; font-family: monospace;">
                  {cameraStore.cameraMode.toUpperCase()} · Mirror {boothConfig.config.mirrorOn ? 'on' : 'off'}
                </span>
              </div>
            {:else if !cameraConnected}
              <div style="border-radius: 16px; background: {NEU_BG}; box-shadow: {neuCfg.inset}; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
                {#if cameraStore.detectedCameras.length > 0}
                  <span style="font-size: 12px; font-weight: 700; color: #16a34a;">{cameraStore.detectedCameras[0].model}</span>
                  <span style="font-size: 10px; color: #5b6b82; font-family: monospace;">{cameraStore.detectedCameras[0].port}</span>
                  <button type="button" style="{btnPrimaryStyle} justify-content: center;" onclick={handleConnectDetected} disabled={cameraStore.status === 'connecting'}>
                    {cameraStore.status === 'connecting' ? 'Menghubungkan...' : 'Hubungkan Kamera Ini'}
                  </button>
                {:else}
                  <p style="{subStyle} font-size: 12px;">{cameraStore.isDetecting ? 'Mencari kamera via USB…' : 'Tidak ada kamera USB terdeteksi.'}</p>
                  {#if cameraStore.detectError}
                    <p style="font-size: 10px; color: #dc2626; margin: 0;">{cameraStore.detectError}</p>
                  {/if}
                {/if}
              </div>
            {/if}

            <div style="display: flex; gap: 10px; margin-top: 14px;">
              <button
                type="button"
                style="{btnPrimaryStyle} flex: 1; justify-content: center; opacity: {cameraConnected && cameraStore.cameraMode === 'usb' ? 1 : 0.5};"
                onclick={handleOpenManualSettings}
                disabled={!(cameraConnected && cameraStore.cameraMode === 'usb')}
              >
                Atur ISO / Shutter / F
              </button>
              <button
                type="button"
                style="{btnBaseStyle} flex: 0 0 auto; justify-content: center;"
                onclick={() => cameraStore.detect()}
                disabled={cameraStore.isDetecting}
                title="Deteksi ulang kamera USB"
              >
                <RotateCw size={14} class={cameraStore.isDetecting ? 'animate-spin' : ''} />
                {cameraStore.isDetecting ? 'Mendeteksi...' : 'Refresh'}
              </button>
            </div>

            <div style="display: flex; align-items: center; gap: 12px; margin-top: 16px;">
              <span style="font-size: 13px; font-weight: 600; color: #334155; flex: 0 0 auto;">Rotasi tampilan</span>
              <div style="flex: 1; display: flex; gap: 4px; padding: 4px; border-radius: 14px; background: {NEU_BG}; box-shadow: {neuCfg.inset};">
                {#each ROTATE_OPTS as o, i}
                  {@const on = boothConfig.config.cameraRotate === o}
                  <button
                    type="button"
                    onclick={() => update('cameraRotate', o)}
                    style="flex: 1; height: 40px; border-radius: 10px; border: none; cursor: pointer; font-family: 'Poppins',sans-serif; font-weight: 700; font-size: 13px; background: {on ? NEU_BG : 'transparent'}; box-shadow: {on ? neuCfg.btnSm : 'none'}; color: {on ? NEU_PRIMARY : '#475569'}; touch-action: manipulation;"
                  >{ROTATE_LABELS[i]}</button>
                {/each}
              </div>
            </div>
          </div>

          <!-- Printer / stok kertas -->
          <div style={cardStyle}>
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">
              <div style={iconBoxStyle}><Printer size={18} /></div>
              <div style="flex: 1;">
                <p style={titleStyle}>Printer</p>
                <p style={subStyle}>{printerReadyCount === 0 ? 'Belum ada printer dipilih' : `${printerReadyCount} printer siap cetak`}</p>
              </div>
              <button
                type="button"
                onclick={() => printerStore.loadPrinters()}
                disabled={printerStore.isDetecting}
                style="{btnBaseStyle} min-height: 34px; padding: 0 12px; font-size: 12px;"
                title="Deteksi ulang printer"
              >
                <RotateCw size={13} class={printerStore.isDetecting ? 'animate-spin' : ''} />
                {printerStore.isDetecting ? 'Mendeteksi...' : 'Refresh'}
              </button>
            </div>

            {#if printerStore.printers.length > 0}
              {#each [1, 2] as n}
                {@const isPrimary = n === 1}
                {@const model = isPrimary ? printerStore.selectedPrinter : printerStore.secondaryPrinter}
                {@const off = !model}
                {@const ready = isPrimary ? printerStore.status?.is_ready : printerStore.secondaryStatus?.is_ready}
                <div style="border-radius: 16px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; padding: 14px; margin-bottom: 14px;">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                    <span style="width: 22px; height: 22px; border-radius: 7px; background: {isPrimary ? NEU_PRIMARY : 'rgba(42,40,115,0.1)'}; color: {isPrimary ? 'white' : NEU_PRIMARY}; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center;">{n}</span>
                    <span style="flex: 1; font-size: 13px; font-weight: 700; color: #1e293b;">
                      {#if isPrimary}Printer utama{:else}Printer kedua <span style="font-weight: 400; color: #475569;">(opsional)</span>{/if}
                    </span>
                    <span style="font-size: 11px; font-weight: 700; color: {off ? '#5b6b82' : ready ? '#15803d' : '#b45309'};">
                      {off ? 'Nonaktif' : ready ? 'Siap' : 'Offline'}
                    </span>
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <div style="position: relative; flex: 1;">
                      <select
                        value={model ?? ''}
                        onchange={(e) => {
                          const val = e.currentTarget.value || null;
                          if (isPrimary) {
                            printerStore.selectedPrinter = val;
                            boothConfig.save({ primaryPrinter: val || '' });
                          } else {
                            printerStore.secondaryPrinter = val;
                            boothConfig.save({ secondaryPrinter: val || '' });
                          }
                          printerStore.refreshStatus();
                        }}
                        style={selectStyle}
                      >
                        {#if !isPrimary}<option value="">Tidak digunakan</option>{/if}
                        {#each printerStore.printers as p}
                          <option value={p}>{p}</option>
                        {/each}
                      </select>
                      <ChevronDown size={14} color="#5b6b82" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none;" />
                    </div>
                    <button
                      type="button"
                      title={isPrimary ? 'Buka Preferensi Printer Utama (Standard 4x6 / Tanpa Cut)' : 'Buka Preferensi Printer Kedua (Aktifkan 2-inch Cut untuk Strip 2x6)'}
                      disabled={!printerStore.selectedPrinter}
                      onclick={() => (isPrimary ? handleOpenPrinterProperties(printerStore.selectedPrinter) : handleOpenSecondaryPrinterProperties())}
                      style="width: 44px; height: 44px; border-radius: 12px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: {printerStore.selectedPrinter ? 'pointer' : 'not-allowed'}; color: {printerStore.selectedPrinter ? '#334155' : '#5b6b82'}; opacity: {printerStore.selectedPrinter ? 1 : 0.5};"
                    >
                      <Settings size={16} />
                    </button>
                  </div>
                  {#if !isPrimary && !off}
                    <p style="{subStyle} margin-top: 8px;">Klik ⚙ untuk mengaktifkan 2-inch cut (strip 2x6).</p>
                  {:else if isPrimary && !off}
                    <p style="{subStyle} margin-top: 8px;">Printer utama untuk ukuran penuh (4x6 / 4R tanpa potongan 2-inch).</p>
                  {/if}
                </div>
              {/each}
            {:else}
              <div style="border-radius: 16px; background: {NEU_BG}; box-shadow: {neuCfg.inset}; padding: 14px 16px; margin-bottom: 14px;">
                <p style="{subStyle} font-size: 12px;">{printerStore.isDetecting ? 'Mencari printer via USB…' : 'Tidak ada printer terdeteksi.'}</p>
                {#if printerStore.errorMessage}
                  <p style="font-size: 10px; color: #dc2626; margin: 4px 0 0;">{printerStore.errorMessage}</p>
                {/if}
              </div>
            {/if}

            <div style="display: flex; align-items: baseline; justify-content: space-between;">
              <span style="font-size: 13px; color: #334155;">Stok kertas</span>
              <span style="font-size: 16px; font-weight: 700; color: {lowPaper ? '#ef4444' : '#1e293b'};">{boothConfig.config.paperCount} lembar</span>
            </div>
            <div style="height: 10px; border-radius: 999px; background: {NEU_BG}; box-shadow: {neuCfg.inset}; margin: 10px 0 8px; overflow: hidden;">
              <div style="width: {paperPct}%; height: 100%; border-radius: 999px; background: {lowPaper ? '#ef4444' : `linear-gradient(90deg, #3d3aa0, ${NEU_PRIMARY})`};"></div>
            </div>
            <p style={subStyle}>Peringatan muncul di {boothConfig.config.paperThreshold} lembar.</p>
          </div>
        </div>

        <div style="max-width: 1400px; margin: 20px auto 0; display: flex; flex-direction: column; gap: 16px;">
          <!-- Softfile: blok "Session Pending Softfile Upload" + dialog 7 sesi terakhir dipertahankan apa adanya (permintaan Wahyu) -->
          <div style={cardStyle}>
            <!-- Session Pending Softfile Upload (Sesuai Referensi Layout) -->
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em; margin: 0;">
                  Session Pending Softfile Upload
                </h1>
                {#if pendingSoftfileSessions > 0}
                  <span
                    style="
                      font-size: 10px;
                      font-weight: 700;
                      color: #b45309;
                      background: #fef3c7;
                      padding: 2px 8px;
                      border-radius: 9999px;
                    "
                  >
                    {pendingSoftfileSessions} antrean
                  </span>
                {/if}
              </div>

              <div style="display: flex; gap: 8px; align-items: center;">
                <!-- Count Box / Display Input -->
                <div
                  style="
                    flex: 1;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.inset};
                    border-radius: 12px;
                    padding: 9px 14px;
                    font-size: 13px;
                    font-weight: 700;
                    color: {pendingSoftfileSessions > 0 ? '#d97706' : '#64748b'};
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                  "
                >
                  <span>{pendingSoftfileSessions}</span>
                  {#if pendingSoftfileSessions > 0}
                    <span style="font-size: 10px; font-weight: 500; color: #94a3b8;">Tertunda</span>
                  {:else}
                    <span style="font-size: 10px; font-weight: 500; color: #16a34a;">Semua Terkirim</span>
                  {/if}
                </div>

                <!-- Tombol Upload (Manual Trigger Upload Semua) -->
                <button
                  type="button"
                  onclick={handleUploadAllPending}
                  disabled={isUploadingPending || pendingSoftfileSessions === 0}
                  style="
                    padding: 9px 18px;
                    border-radius: 12px;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.btnSm};
                    border: none;
                    cursor: {isUploadingPending || pendingSoftfileSessions === 0 ? 'not-allowed' : 'pointer'};
                    opacity: {isUploadingPending || pendingSoftfileSessions === 0 ? 0.6 : 1};
                    font-family: 'Poppins', sans-serif;
                    font-weight: 700;
                    font-size: 12px;
                    color: #1e293b;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    white-space: nowrap;
                    transition: all 0.15s ease;
                  "
                  title="Upload antrean sesi yang tertunda ke server sekarang"
                  onmousedown={(e) => {
                    if (!isUploadingPending && pendingSoftfileSessions > 0) e.currentTarget.style.boxShadow = neuCfg.inset;
                  }}
                  onmouseup={(e) => {
                    if (!isUploadingPending && pendingSoftfileSessions > 0) e.currentTarget.style.boxShadow = neuCfg.btnSm;
                  }}
                >
                  <UploadCloud size={15} class={isUploadingPending ? 'animate-bounce text-indigo-600' : ''} />
                  <span>{isUploadingPending ? 'Uploading...' : 'Upload'}</span>
                </button>

                <!-- Tombol Dialog Reupload Sesi Foto (Icon Refresh/List sesuai arrow referensi) -->
                <button
                  type="button"
                  onclick={() => (isReuploadModalOpen = true)}
                  style="
                    width: 40px;
                    height: 40px;
                    border-radius: 12px;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.btnSm};
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #2a2873;
                    position: relative;
                    transition: all 0.15s ease;
                  "
                  title="Buka Dialog Daftar Sesi Foto (7 Sesi Terakhir, Upload Ulang & Print Manual)"
                  onmousedown={(e) => (e.currentTarget.style.boxShadow = neuCfg.inset)}
                  onmouseup={(e) => (e.currentTarget.style.boxShadow = neuCfg.btnSm)}
                >
                  <RotateCw size={17} />
                  {#if pendingSoftfileSessions > 0}
                    <span
                      style="
                        position: absolute;
                        top: -2px;
                        right: -2px;
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: #ef4444;
                        box-shadow: 0 0 6px rgba(239, 68, 68, 0.8);
                      "
                    ></span>
                  {/if}
                </button>

                <!-- Tombol Buka Folder Penyimpanan Sesi Lokal di Windows Explorer -->
                <button
                  type="button"
                  onclick={async () => {
                    try {
                      await invoke('open_sessions_dir', { relativePath: null });
                    } catch (e) {
                      console.error('Gagal buka folder sesi:', e);
                    }
                  }}
                  style="
                    width: 40px;
                    height: 40px;
                    border-radius: 12px;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.btnSm};
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #2a2873;
                    transition: all 0.15s ease;
                  "
                  title="Buka Folder Penyimpanan Sesi Foto Lokal di Windows Explorer"
                  onmousedown={(e) => (e.currentTarget.style.boxShadow = neuCfg.inset)}
                  onmouseup={(e) => (e.currentTarget.style.boxShadow = neuCfg.btnSm)}
                >
                  <FolderOpen size={17} />
                </button>
              </div>

              <p style="font-size: 10px; color: #94a3b8; margin: 0;">
                Klik tombol <strong>Upload</strong> untuk sinkronisasi manual, icon putar untuk <strong>7 sesi terakhir</strong> (print/upload ulang), atau icon folder untuk membuka file foto lokal di Windows Explorer.
              </p>
            </div>
          </div>

          <!-- Antrean cetak offline (tidak ada di Figma, dipertahankan) -->
          <div style={cardStyle}>
            <!-- Antrean Cetak Foto Offline (Print Queue) -->
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em; margin: 0;">
                  Antrean Cetak Foto Offline
                </h1>
                {#if pendingPrintJobs > 0}
                  <span
                    style="
                      font-size: 10px;
                      font-weight: 700;
                      color: #7c2d12;
                      background: #ffedd5;
                      padding: 2px 8px;
                      border-radius: 9999px;
                    "
                  >
                    {pendingPrintJobs} lembar antre
                  </span>
                {/if}
              </div>

              <div style="display: flex; gap: 8px; align-items: center;">
                <!-- Count Box -->
                <div
                  style="
                    flex: 1;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.inset};
                    border-radius: 12px;
                    padding: 9px 14px;
                    font-size: 13px;
                    font-weight: 700;
                    color: {pendingPrintJobs > 0 ? '#ea580c' : '#64748b'};
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                  "
                >
                  <span>{pendingPrintJobs} lembar</span>
                  {#if pendingPrintJobs > 0}
                    <span style="font-size: 10px; font-weight: 500; color: #ea580c;">Tertunda</span>
                  {:else}
                    <span style="font-size: 10px; font-weight: 500; color: #16a34a;">Antrean Bersih</span>
                  {/if}
                </div>

                <!-- Tombol Cetak Antrean Manual -->
                <button
                  type="button"
                  onclick={handleFlushPrintQueue}
                  disabled={isPrintingQueue || pendingPrintJobs === 0}
                  style="
                    padding: 9px 14px;
                    border-radius: 12px;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.btnSm};
                    border: none;
                    cursor: {isPrintingQueue || pendingPrintJobs === 0 ? 'not-allowed' : 'pointer'};
                    opacity: {isPrintingQueue || pendingPrintJobs === 0 ? 0.6 : 1};
                    font-family: 'Poppins', sans-serif;
                    font-weight: 700;
                    font-size: 12px;
                    color: #1e293b;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    white-space: nowrap;
                    transition: all 0.15s ease;
                  "
                  title="Cetak semua antrean foto sekarang"
                  onmousedown={(e) => {
                    if (!isPrintingQueue && pendingPrintJobs > 0) e.currentTarget.style.boxShadow = neuCfg.inset;
                  }}
                  onmouseup={(e) => {
                    if (!isPrintingQueue && pendingPrintJobs > 0) e.currentTarget.style.boxShadow = neuCfg.btnSm;
                  }}
                >
                  <Printer size={15} class={isPrintingQueue ? 'animate-bounce text-indigo-600' : ''} />
                  <span>{isPrintingQueue ? 'Mencetak...' : 'Cetak'}</span>
                </button>

                <!-- Tombol Kosongkan / Batalkan Antrean -->
                <button
                  type="button"
                  onclick={handleClearPrintQueue}
                  disabled={isClearingPrintQueue || pendingPrintJobs === 0}
                  style="
                    padding: 9px 14px;
                    border-radius: 12px;
                    background: {NEU_BG};
                    box-shadow: {neuCfg.btnSm};
                    border: none;
                    cursor: {isClearingPrintQueue || pendingPrintJobs === 0 ? 'not-allowed' : 'pointer'};
                    opacity: {isClearingPrintQueue || pendingPrintJobs === 0 ? 0.6 : 1};
                    font-family: 'Poppins', sans-serif;
                    font-weight: 700;
                    font-size: 12px;
                    color: #dc2626;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    white-space: nowrap;
                    transition: all 0.15s ease;
                  "
                  title="Kosongkan antrean cetak agar foto lama tidak tercetak otomatis"
                  onmousedown={(e) => {
                    if (!isClearingPrintQueue && pendingPrintJobs > 0) e.currentTarget.style.boxShadow = neuCfg.inset;
                  }}
                  onmouseup={(e) => {
                    if (!isClearingPrintQueue && pendingPrintJobs > 0) e.currentTarget.style.boxShadow = neuCfg.btnSm;
                  }}
                >
                  <Trash2 size={15} />
                  <span>Kosongkan Antrean</span>
                </button>
              </div>

              <p style="font-size: 10px; color: #94a3b8; margin: 0;">
                Gunakan <strong>Kosongkan Antrean</strong> untuk membatalkan seluruh print tertunda dari sesi sebelumnya agar tidak menghabiskan kertas foto.
              </p>
            </div>
          </div>

          <!-- Pengaturan sesi -->
          <button
            type="button"
            onclick={openSessionSettings}
            style="{cardStyle} display: flex; align-items: center; gap: 14px; padding: 16px 20px; border: none; cursor: pointer; text-align: left; font-family: 'Poppins',sans-serif; width: 100%; touch-action: manipulation;"
          >
            <div style={iconBoxStyle}><Clock size={18} /></div>
            <div style="flex: 1;">
              <p style={titleStyle}>Pengaturan sesi</p>
              <p style={subStyle}>
                Waktu sesi {boothConfig.config.photoSessionTimeSecs || 60} dtk · Foto 1: {boothConfig.config.firstCountdownSecs || 5} dtk · Lanjutan: {boothConfig.config.countdownSecs} dtk · Banner idle {boothConfig.config.idleBannerTimeoutMins} menit · Peringatan kertas {boothConfig.config.paperThreshold}
              </p>
            </div>
            <ChevronRight size={18} color="#475569" />
          </button>
        </div>
      </div>
    {/if}
  </div>

  {#if saveNotice}
    <div
      style="position: fixed; bottom: 24px; right: 28px; z-index: 50; background: #22c55e; color: white; padding: 10px 18px; border-radius: 12px; font-size: 12px; font-weight: 700; box-shadow: 0 4px 16px rgba(34, 197, 94, 0.35); font-family: 'Poppins', sans-serif;"
    >
      {saveNotice}
    </div>
  {/if}

  <UpdateModal />
  <ReuploadSessionsModal
    bind:open={isReuploadModalOpen}
    onClose={() => (isReuploadModalOpen = false)}
    onUpdated={refreshPendingCount}
  />
  {#if isReportOpen}
    <ReportProblemModal onClose={() => (isReportOpen = false)} />
  {/if}
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
