<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Monitor,
    ClockCheck,
    ChevronLeft,
    ChevronDown,
    CheckCircle2
  } from '@lucide/svelte';
  import { boothConfig, type BoothCfg } from '$lib/stores/boothConfig.svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { syncBoothSettings } from '$lib/api/boothClient';
  import { cameraStore } from '$lib/camera.svelte';

  interface Props {
    onBack: () => void;
    onLogout: () => void;
  }

  let { onBack, onLogout }: Props = $props();

  let syncStatus = $state<string | null>(null);
  let lastSyncedAt = $state<string | null>(null);
  let boothName = $state<string | null>(null);

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

  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      // timeZone: 'Asia/Jakarta', // opsional
    }).format(date);
  }

  async function handleSync() {
    syncStatus = 'Syncing...';
    try {
      const res = await syncBoothSettings();

      if (res.booth_name) boothName = res.booth_name;
      lastSyncedAt = res.last_sync_at ? formatDate(res.last_sync_at) : lastSyncedAt;
      syncStatus = res.last_sync_at ? formatDate(res.last_sync_at) : 'Tersinkronisasi';
    } catch (e) {
      syncStatus = e instanceof Error ? e.message : 'Sync gagal';
    }
    setTimeout(() => {
      syncStatus = null;
    }, 3000);
  }

  // Isi nama device dari konfigurasi lokal yang sudah dimuat saat aplikasi
  // start, lalu auto-sync sekali saat halaman dibuka — sehingga booth name &
  // waktu sinkron terakhir langsung terisi tanpa harus klik tombol Sync dulu.
  onMount(() => {
    boothName = uiConfig.config.boothName || boothName;
    void handleSync();
  });

  const ROTATE_OPTS = ['0° (Default)', '90° CW', '180°', '90° CCW'];
  const CAMERA_MODES: Array<{ value: 'usb' | 'webcam' | 'demo'; label: string }> = [
    { value: 'usb', label: 'USB (DSLR / CCAPI / gPhoto2)' },
    { value: 'webcam', label: 'Webcam (Laptop / USB Cam)' },
    { value: 'demo', label: 'Demo Mode (Simulasi)' }
  ];
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
                <!-- Tampilkan waktu tersinkronisasi terakhir secara persisten -->
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

        <div style="flex: 1;"></div>

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
        <div style="width: 34%; flex-shrink: 0; display: flex; flex-direction: column; gap: 8%;">
          <p style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 4px 0 0 0;">
            Fitur Aktif
          </p>
          <div
            style="
              flex: 1;
              background: {NEU_BG};
              box-shadow: {neuCfg.card};
              border-radius: 20px;
              padding: 14px;
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
              onclick={() => update('paymentPage', !boothConfig.config.paymentPage)}
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
              <div style="width: 17px; height: 17px; border-radius: 50%; border: 2px solid {boothConfig.config.paymentPage ? '#22c55e' : '#c8d2e0'}; background: {boothConfig.config.paymentPage ? '#22c55e' : 'transparent'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                {#if boothConfig.config.paymentPage}
                  <div style="width: 6px; height: 6px; border-radius: 50%; background: white;"></div>
                {/if}
              </div>
              <span style="font-size: 13px; font-weight: 600; color: {boothConfig.config.paymentPage ? '#334155' : '#94a3b8'}; flex: 1;">
                Pembayaran (Cashless)
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
                  <div style="width: 14px; height: 14px; border-radius: 50%; border: 2px solid {boothConfig.config.mirrorOn ? '#22c55e' : '#c8d2e0'}; background: {boothConfig.config.mirrorOn ? '#22c55e' : 'transparent'}; flex-shrink: 0;"></div>
                  <span style="font-size: 12px; font-weight: 500; color: #334155;">Mirror</span>
                </button>

                <button
                  type="button"
                  onclick={() => update('flipVertical', !boothConfig.config.flipVertical)}
                  style="display: flex; align-items: center; gap: 10px; background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 10px; padding: 7px 12px; border: none; cursor: pointer; text-align: left;"
                >
                  <div style="width: 14px; height: 14px; border-radius: 50%; border: 2px solid {boothConfig.config.flipVertical ? '#22c55e' : '#c8d2e0'}; background: {boothConfig.config.flipVertical ? '#22c55e' : 'transparent'}; flex-shrink: 0;"></div>
                  <span style="font-size: 12px; font-weight: 500; color: #334155;">Flip Vertikal</span>
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
            <!-- Mode Kamera Baru (§1 Poin 3) -->
            <div style="display: flex; flex-direction: column; gap: 5px;">
              <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em;">
                Mode Hardware Kamera
              </h1>
              <div style="position: relative;">
                <select
                  value={boothConfig.config.cameraMode}
                  onchange={(e) => update('cameraMode', e.currentTarget.value as 'usb' | 'webcam' | 'demo')}
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
                    color: #2a2873;
                    font-family: 'Poppins',sans-serif;
                    cursor: pointer;
                  "
                >
                  {#each CAMERA_MODES as m}
                    <option value={m.value}>{m.label}</option>
                  {/each}
                </select>
                <ChevronDown size={14} color="#94a3b8" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none;" />
              </div>
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
                <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em;">Countdown (dtk)</h1>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button onclick={() => update('countdownSecs', Math.max(3, boothConfig.config.countdownSecs - 1))} style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;">−</button>
                  <div style="flex: 1; background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 10px; padding: 6px 0; text-align: center; font-size: 13px; font-weight: 700; color: #334155;">{boothConfig.config.countdownSecs}</div>
                  <button onclick={() => update('countdownSecs', Math.min(15, boothConfig.config.countdownSecs + 1))} style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;">+</button>
                </div>
              </div>

              <!-- Stok Kertas -->
              <div style="display: flex; flex-direction: column; gap: 5px; flex: 1;">
                <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em;">Stok Kertas</h1>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button onclick={() => update('paperCount', Math.max(0, boothConfig.config.paperCount - 1))} style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;">−</button>
                  <div style="flex: 1; background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 10px; padding: 6px 0; text-align: center; font-size: 13px; font-weight: 700; color: #334155;">{boothConfig.config.paperCount}</div>
                  <button onclick={() => update('paperCount', Math.min(999, boothConfig.config.paperCount + 1))} style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;">+</button>
                </div>
              </div>

              <!-- Batas Peringatan -->
              <div style="display: flex; flex-direction: column; gap: 5px; flex: 1;">
                <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em;">Batas Peringatan</h1>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <button onclick={() => update('paperThreshold', Math.max(1, boothConfig.config.paperThreshold - 1))} style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;">−</button>
                  <div style="flex: 1; background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 10px; padding: 6px 0; text-align: center; font-size: 13px; font-weight: 700; color: #334155;">{boothConfig.config.paperThreshold}</div>
                  <button onclick={() => update('paperThreshold', Math.min(100, boothConfig.config.paperThreshold + 1))} style="width: 32px; height: 32px; border-radius: 9px; background: {NEU_BG}; box-shadow: {neuCfg.btnSm}; border: none; cursor: pointer; font-weight: 700; font-size: 16px; color: #334155; display: flex; align-items: center; justify-content: center;">+</button>
                </div>
              </div>
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

            <!-- Session upload -->
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <h1 style="font-size: 10px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.06em;">Session Pending Softfile Upload</h1>
              <div style="display: flex; gap: 10px;">
                <div style="flex: 1; background: {NEU_BG}; box-shadow: {neuCfg.inset}; border-radius: 12px; padding: 10px 16px; font-size: 14px; font-weight: 700; color: #334155;">0</div>
                <button
                  style="
                    padding: 10px 24px;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY});
                    border: none;
                    cursor: pointer;
                    font-family: 'Poppins',sans-serif;
                    font-weight: 700;
                    font-size: 13px;
                    color: white;
                    box-shadow: 0 4px 14px rgba(42,40,115,0.35);
                  "
                >
                  Upload
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
