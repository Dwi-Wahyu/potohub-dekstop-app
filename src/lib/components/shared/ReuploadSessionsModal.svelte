<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    X,
    RefreshCw,
    Printer,
    UploadCloud,
    CheckCircle2,
    AlertCircle,
    Clock,
    FileText,
    Image as ImageIcon,
    Mail,
    Phone,
    Layers,
    Filter,
    FolderOpen
  } from '@lucide/svelte';
  import { invoke } from '@tauri-apps/api/core';
  import {
    listAllSessionOutboxJobs,
    resetOutboxJobForRetry,
    updateSessionPrintStatus,
    type SessionHistoryItem,
  } from '$lib/db/local';
  import { processSingleJobById, type JobProcessOutcome } from '$lib/utils/offlineOutbox';
  import { reprintSessionDirectly } from '$lib/utils/printQueue';

  interface Props {
    open: boolean;
    onClose: () => void;
    onUpdated?: () => void;
  }

  let { open = $bindable(), onClose, onUpdated }: Props = $props();

  const NEU_BG = '#ebf0f7';
  const NEU_PRIMARY = '#2a2873';
  const neuCfg = {
    card: '8px 8px 20px rgba(163,177,198,0.6), -8px -8px 20px rgba(255,255,255,0.9)',
    inset: 'inset 4px 4px 10px rgba(163,177,198,0.7), inset -4px -4px 10px rgba(255,255,255,0.9)',
    btn: '5px 5px 12px rgba(163,177,198,0.55), -4px -4px 10px rgba(255,255,255,0.85)',
    btnSm: '3px 3px 8px rgba(163,177,198,0.55), -3px -3px 8px rgba(255,255,255,0.85)'
  };

  let sessions = $state<SessionHistoryItem[]>([]);
  let isLoading = $state(false);
  let activeFilter = $state<'recent' | 'all' | 'pending' | 'done'>('recent');
  let sessionsDirPath = $state<string>('');
  let previewUrls = $state<Record<number, string>>({});
  let uploadingMap = $state<Record<number, boolean>>({});
  let printingMap = $state<Record<number, boolean>>({});
  let feedbackMap = $state<Record<number, { type: 'success' | 'error'; text: string }>>({});

  let filteredSessions = $derived.by(() => {
    if (activeFilter === 'recent') {
      return sessions.slice(0, 7);
    }
    if (activeFilter === 'pending') {
      return sessions.filter((s) => s.status === 'pending' || s.status === 'dead_letter' || s.printStatus === 'failed');
    }
    if (activeFilter === 'done') {
      return sessions.filter((s) => s.status === 'done');
    }
    return sessions;
  });

  let pendingCount = $derived(
    sessions.filter((s) => s.status === 'pending' || s.status === 'dead_letter' || s.printStatus === 'failed').length
  );

  async function loadSessions() {
    isLoading = true;
    try {
      sessions = await listAllSessionOutboxJobs(50);
      // Muat preview thumbnail untuk sesi yang ada
      for (const item of sessions) {
        if (item.compositePath && !previewUrls[item.id]) {
          void loadThumbnail(item);
        }
      }
      try {
        sessionsDirPath = await invoke<string>('get_sessions_dir');
      } catch {}
    } catch (err) {
      console.error('[ReuploadModal] Gagal memuat daftar sesi:', err);
    } finally {
      isLoading = false;
    }
  }

  async function handleOpenSessionsFolder(relativePath?: string | null) {
    try {
      await invoke('open_sessions_dir', { relativePath: relativePath || null });
    } catch (err) {
      console.error('[ReuploadModal] Gagal membuka folder sesi:', err);
    }
  }

  async function loadThumbnail(item: SessionHistoryItem) {
    if (!item.compositePath) return;
    try {
      const bytes = await invoke<number[]>('read_session_file', {
        relativePath: item.compositePath,
      });
      if (bytes && bytes.length > 0) {
        const blob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
        previewUrls[item.id] = URL.createObjectURL(blob);
      }
    } catch (err) {
      console.warn(`[ReuploadModal] Gagal membaca file gambar sesi #${item.id}:`, err);
    }
  }

  async function handleManualUpload(item: SessionHistoryItem) {
    if (uploadingMap[item.id]) return;
    uploadingMap[item.id] = true;
    feedbackMap[item.id] = { type: 'success', text: 'Mengupload ke cloud...' };

    try {
      await resetOutboxJobForRetry(item.id);
      const outcome: JobProcessOutcome = await processSingleJobById(item.id);

      if (outcome.status === 'success') {
        item.status = 'done';
        item.lastError = null;
        feedbackMap[item.id] = { type: 'success', text: 'Berhasil diupload!' };
        onUpdated?.();
      } else if (outcome.status === 'network_failure') {
        feedbackMap[item.id] = { type: 'error', text: 'Koneksi offline' };
      } else {
        feedbackMap[item.id] = { type: 'error', text: outcome.reason || 'Upload gagal' };
      }
    } catch (err) {
      feedbackMap[item.id] = { type: 'error', text: String(err) };
    } finally {
      uploadingMap[item.id] = false;
      setTimeout(() => {
        delete feedbackMap[item.id];
      }, 3500);
    }
  }

  async function handleManualPrint(item: SessionHistoryItem) {
    if (printingMap[item.id] || !item.compositePath) return;
    printingMap[item.id] = true;
    feedbackMap[item.id] = { type: 'success', text: 'Mengirim ke printer...' };

    try {
      const res = await reprintSessionDirectly(
        item.sessionCode,
        item.compositePath,
        item.printQty || 1,
        item.paperSize || '4x6',
        item.useSecondary ?? false,
      );
      if (res.ok) {
        item.printStatus = 'printed';
        item.printError = null;
        void updateSessionPrintStatus(item.sessionCode, 'printed').catch(console.warn);
        feedbackMap[item.id] = { type: 'success', text: res.message };
      } else {
        item.printStatus = 'failed';
        item.printError = res.message;
        void updateSessionPrintStatus(item.sessionCode, 'failed', res.message).catch(console.warn);
        feedbackMap[item.id] = { type: 'error', text: res.message };
      }
    } catch (err) {
      item.printStatus = 'failed';
      item.printError = String(err);
      void updateSessionPrintStatus(item.sessionCode, 'failed', String(err)).catch(console.warn);
      feedbackMap[item.id] = { type: 'error', text: String(err) };
    } finally {
      printingMap[item.id] = false;
      setTimeout(() => {
        delete feedbackMap[item.id];
      }, 3500);
    }
  }

  function formatDate(timestamp: number): string {
    const d = new Date(timestamp);
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      onClose();
    }
  }

  $effect(() => {
    if (open) {
      void loadSessions();
    }
  });

  onDestroy(() => {
    Object.values(previewUrls).forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') onClose();
    }}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Dialog Reupload Sesi Foto"
  >
    <!-- Modal Card (Neumorphic) -->
    <div
      style="
        width: 100%;
        max-width: 960px;
        max-height: 88vh;
        background: {NEU_BG};
        box-shadow: 0 25px 60px rgba(0,0,0,0.35), {neuCfg.card};
        border-radius: 24px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        border: 1px solid rgba(255,255,255,0.6);
        font-family: 'Poppins', sans-serif;
      "
    >
      <!-- Modal Header -->
      <div
        style="
          background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY});
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: white;
          box-shadow: 0 4px 16px rgba(42,40,115,0.25);
          flex-shrink: 0;
        "
      >
        <div style="display: flex; align-items: center; gap: 12px;">
          <div
            style="
              width: 38px;
              height: 38px;
              border-radius: 12px;
              background: rgba(255,255,255,0.18);
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
            "
          >
            <UploadCloud size={20} />
          </div>
          <div>
            <h2 style="margin: 0; font-size: 15px; font-weight: 700; letter-spacing: 0.02em;">
              Reupload Sesi Foto
            </h2>
            <p style="margin: 0; font-size: 11px; opacity: 0.85;">
              Daftar antrean sesi lokal &bull; Upload ulang cloud & cetak manual
            </p>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <button
            type="button"
            onclick={loadSessions}
            disabled={isLoading}
            style="
              padding: 7px 12px;
              border-radius: 10px;
              background: rgba(255,255,255,0.15);
              border: none;
              display: flex;
              align-items: center;
              gap: 6px;
              color: white;
              cursor: pointer;
              font-size: 11px;
              font-weight: 600;
              transition: background 0.15s ease;
            "
            title="Muat Ulang Daftar Sesi"
          >
            <RefreshCw size={13} class={isLoading ? 'animate-spin' : ''} />
            <span>Segarkan</span>
          </button>

          <button
            type="button"
            onclick={onClose}
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
            title="Tutup (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <!-- Filter Tabs & Stats Bar -->
      <div
        style="
          padding: 12px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: {NEU_BG};
          border-bottom: 1px solid rgba(200,210,224,0.6);
          flex-shrink: 0;
          gap: 12px;
          flex-wrap: wrap;
        "
      >
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <button
            type="button"
            onclick={() => (activeFilter = 'recent')}
            style="
              padding: 6px 14px;
              border-radius: 9999px;
              border: none;
              cursor: pointer;
              font-size: 11px;
              font-weight: 700;
              background: {NEU_BG};
              box-shadow: {activeFilter === 'recent' ? neuCfg.inset : neuCfg.btnSm};
              color: {activeFilter === 'recent' ? NEU_PRIMARY : '#64748b'};
              display: flex;
              align-items: center;
              gap: 6px;
              transition: all 0.15s ease;
            "
          >
            <span>⏱️</span>
            <span>7 Sesi Terakhir</span>
          </button>

          <button
            type="button"
            onclick={() => (activeFilter = 'all')}
            style="
              padding: 6px 14px;
              border-radius: 9999px;
              border: none;
              cursor: pointer;
              font-size: 11px;
              font-weight: 700;
              background: {NEU_BG};
              box-shadow: {activeFilter === 'all' ? neuCfg.inset : neuCfg.btnSm};
              color: {activeFilter === 'all' ? NEU_PRIMARY : '#64748b'};
              transition: all 0.15s ease;
            "
          >
            Semua ({sessions.length})
          </button>

          <button
            type="button"
            onclick={() => (activeFilter = 'pending')}
            style="
              padding: 6px 14px;
              border-radius: 9999px;
              border: none;
              cursor: pointer;
              font-size: 11px;
              font-weight: 700;
              background: {NEU_BG};
              box-shadow: {activeFilter === 'pending' ? neuCfg.inset : neuCfg.btnSm};
              color: {activeFilter === 'pending' ? '#d97706' : '#64748b'};
              display: flex;
              align-items: center;
              gap: 6px;
              transition: all 0.15s ease;
            "
          >
            <span style="width: 7px; height: 7px; border-radius: 50%; background: #f59e0b;"></span>
            Pending / Gagal ({pendingCount})
          </button>

          <button
            type="button"
            onclick={() => (activeFilter = 'done')}
            style="
              padding: 6px 14px;
              border-radius: 9999px;
              border: none;
              cursor: pointer;
              font-size: 11px;
              font-weight: 700;
              background: {NEU_BG};
              box-shadow: {activeFilter === 'done' ? neuCfg.inset : neuCfg.btnSm};
              color: {activeFilter === 'done' ? '#16a34a' : '#64748b'};
              transition: all 0.15s ease;
            "
          >
            Sukses Terupload ({sessions.filter((s) => s.status === 'done').length})
          </button>
        </div>

        <button
          type="button"
          onclick={() => handleOpenSessionsFolder(null)}
          style="
            padding: 6px 14px;
            border-radius: 10px;
            background: {NEU_BG};
            box-shadow: {neuCfg.btnSm};
            border: none;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 700;
            color: #1e293b;
            cursor: pointer;
            transition: all 0.15s ease;
          "
          title={sessionsDirPath ? `Lokasi lokal: ${sessionsDirPath}` : 'Buka folder penyimpanan sesi lokal di Windows Explorer'}
          onmousedown={(e) => (e.currentTarget.style.boxShadow = neuCfg.inset)}
          onmouseup={(e) => (e.currentTarget.style.boxShadow = neuCfg.btnSm)}
        >
          <FolderOpen size={15} class="text-indigo-600" />
          <span>Buka Folder Sesi Lokal</span>
        </button>
      </div>

      <!-- Modal Body: Scrollable Session Grid / List -->
      <div
        class="custom-scrollbar"
        style="
          padding: 20px 24px;
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 16px;
        "
      >
        {#if isLoading && sessions.length === 0}
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; color: #94a3b8; gap: 12px;">
            <RefreshCw size={28} class="animate-spin text-indigo-500" />
            <span style="font-size: 12px; font-weight: 600;">Memuat sesi tersimpan...</span>
          </div>
        {:else if filteredSessions.length === 0}
          <div
            style="
              background: {NEU_BG};
              box-shadow: {neuCfg.inset};
              border-radius: 18px;
              padding: 48px 24px;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 10px;
              color: #94a3b8;
            "
          >
            <FileText size={36} class="text-slate-400" />
            <p style="font-size: 13px; font-weight: 600; margin: 0; color: #475569;">
              Tidak ada sesi yang sesuai pada filter ini
            </p>
            <p style="font-size: 11px; margin: 0;">
              Semua sesi foto lokal telah terunggah atau belum ada sesi tersimpan.
            </p>
          </div>
        {:else}
          <!-- Cards Grid matching the Reference Design -->
          <div
            style="
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
              gap: 20px;
            "
          >
            {#each filteredSessions as item (item.id)}
              <div
                style="
                  background: {NEU_BG};
                  box-shadow: {neuCfg.card};
                  border-radius: 18px;
                  padding: 12px;
                  display: flex;
                  flex-direction: column;
                  gap: 10px;
                  border: 1px solid rgba(255,255,255,0.7);
                  transition: transform 0.15s ease;
                "
              >
                <!-- Thumbnail Preview Frame (AspectRatio ~ 2:3 or photostrip) -->
                <div
                  style="
                    width: 100%;
                    height: 260px;
                    background: #1e293b;
                    box-shadow: {neuCfg.inset};
                    border-radius: 12px;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                  "
                >
                  {#if previewUrls[item.id]}
                    <img
                      src={previewUrls[item.id]}
                      alt="Strip Foto Sesi {item.sessionCode}"
                      class="w-full h-full object-contain"
                    />
                  {:else}
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; color: #64748b;">
                      <ImageIcon size={28} />
                      <span style="font-size: 10px; font-weight: 500;">Memuat gambar...</span>
                    </div>
                  {/if}

                  <!-- Status Overlay Badges (Cloud Upload & Cetak Fisik) -->
                  <div
                    style="
                      position: absolute;
                      top: 8px;
                      right: 8px;
                      display: flex;
                      flex-direction: column;
                      gap: 4px;
                      align-items: flex-end;
                    "
                  >
                    <!-- Badge Cloud Upload -->
                    <div
                      style="
                        padding: 3px 8px;
                        border-radius: 9999px;
                        font-size: 9px;
                        font-weight: 700;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        backdrop-filter: blur(4px);
                        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                        background: {item.status === 'done'
                          ? 'rgba(34, 197, 94, 0.9)'
                          : item.status === 'dead_letter'
                            ? 'rgba(239, 68, 68, 0.9)'
                            : 'rgba(245, 158, 11, 0.9)'};
                        color: white;
                      "
                      title={item.lastError || ''}
                    >
                      {#if item.status === 'done'}
                        <CheckCircle2 size={10} />
                        <span>Cloud: Terkirim</span>
                      {:else if item.status === 'dead_letter'}
                        <AlertCircle size={10} />
                        <span>Cloud: Gagal ({item.attempts}x)</span>
                      {:else}
                        <Clock size={10} />
                        <span>Cloud: Pending</span>
                      {/if}
                    </div>

                    <!-- Badge Print Status -->
                    <div
                      style="
                        padding: 3px 8px;
                        border-radius: 9999px;
                        font-size: 9px;
                        font-weight: 700;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        backdrop-filter: blur(4px);
                        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                        background: {item.printStatus === 'printed'
                          ? 'rgba(34, 197, 94, 0.9)'
                          : item.printStatus === 'failed'
                            ? 'rgba(239, 68, 68, 0.9)'
                            : 'rgba(100, 116, 139, 0.85)'};
                        color: white;
                      "
                      title={item.printError || ''}
                    >
                      <Printer size={10} />
                      {#if item.printStatus === 'printed'}
                        <span>Print: OK</span>
                      {:else if item.printStatus === 'failed'}
                        <span>Print: Gagal</span>
                      {:else}
                        <span>Print: Belum</span>
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- Session Meta Info -->
                <div style="display: flex; flex-direction: column; gap: 4px; padding: 0 2px;">
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
                      {item.sessionCode}
                    </span>
                    <span style="font-size: 9px; color: #94a3b8;">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>

                  <!-- Target Softfile (Email / Phone) -->
                  {#if item.softfileTarget}
                    <div
                      style="
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 10px;
                        font-weight: 600;
                        color: #334155;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                      "
                      title={item.softfileTarget}
                    >
                      {#if item.softfileTarget.includes('@')}
                        <Mail size={11} color="#6366f1" />
                      {:else}
                        <Phone size={11} color="#10b981" />
                      {/if}
                      <span style="overflow: hidden; text-overflow: ellipsis;">{item.softfileTarget}</span>
                    </div>
                  {:else}
                    <span style="font-size: 10px; color: #94a3b8; font-style: italic;">
                      Tanpa Target Softfile (Offline)
                    </span>
                  {/if}

                  <!-- Feedback Notice on action -->
                  {#if feedbackMap[item.id]}
                    <div
                      style="
                        padding: 3px 8px;
                        border-radius: 6px;
                        font-size: 9px;
                        font-weight: 600;
                        margin-top: 2px;
                        background: {feedbackMap[item.id].type === 'success' ? '#dcfce7' : '#fee2e2'};
                        color: {feedbackMap[item.id].type === 'success' ? '#15803d' : '#b91c1c'};
                      "
                    >
                      {feedbackMap[item.id].text}
                    </div>
                  {/if}
                </div>

                <!-- Bottom Action Buttons (Upload, Print, & Folder) -->
                <div style="display: flex; gap: 6px; margin-top: auto; padding-top: 4px;">
                  <!-- Tombol Upload (Icon ⟳ / Refresh) -->
                  <button
                    type="button"
                    onclick={() => handleManualUpload(item)}
                    disabled={uploadingMap[item.id]}
                    style="
                      flex: 1;
                      height: 38px;
                      border-radius: 10px;
                      background: {NEU_BG};
                      box-shadow: {neuCfg.btnSm};
                      border: none;
                      cursor: {uploadingMap[item.id] ? 'not-allowed' : 'pointer'};
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      gap: 4px;
                      color: #1e293b;
                      font-weight: 700;
                      font-size: 11px;
                      transition: transform 0.1s ease, box-shadow 0.1s ease;
                    "
                    title="Upload / Sinkronkan Sesi Ini ke Cloud"
                    onmousedown={(e) => {
                      if (!uploadingMap[item.id]) e.currentTarget.style.boxShadow = neuCfg.inset;
                    }}
                    onmouseup={(e) => {
                      if (!uploadingMap[item.id]) e.currentTarget.style.boxShadow = neuCfg.btnSm;
                    }}
                  >
                    <RefreshCw
                      size={14}
                      class={uploadingMap[item.id] ? 'animate-spin text-indigo-600' : ''}
                    />
                    <span>{uploadingMap[item.id] ? '...' : 'Upload'}</span>
                  </button>

                  <!-- Tombol Cetak (Icon 🖨️ / Printer) -->
                  <button
                    type="button"
                    onclick={() => handleManualPrint(item)}
                    disabled={printingMap[item.id] || !item.compositePath}
                    style="
                      flex: 1;
                      height: 38px;
                      border-radius: 10px;
                      background: {NEU_BG};
                      box-shadow: {neuCfg.btnSm};
                      border: none;
                      cursor: {printingMap[item.id] || !item.compositePath ? 'not-allowed' : 'pointer'};
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      gap: 4px;
                      color: #1e293b;
                      font-weight: 700;
                      font-size: 11px;
                      transition: transform 0.1s ease, box-shadow 0.1s ease;
                      opacity: {!item.compositePath ? 0.5 : 1};
                    "
                    title="Cetak Ulang Strip Foto ke Printer"
                    onmousedown={(e) => {
                      if (!printingMap[item.id] && item.compositePath) e.currentTarget.style.boxShadow = neuCfg.inset;
                    }}
                    onmouseup={(e) => {
                      if (!printingMap[item.id] && item.compositePath) e.currentTarget.style.boxShadow = neuCfg.btnSm;
                    }}
                  >
                    <Printer
                      size={14}
                      class={printingMap[item.id] ? 'animate-bounce text-emerald-600' : ''}
                    />
                    <span>{printingMap[item.id] ? '...' : 'Print'}</span>
                  </button>

                  <!-- Tombol Buka Folder Sesi Lokal di Windows Explorer (Icon Folder) -->
                  <button
                    type="button"
                    onclick={() => handleOpenSessionsFolder(item.compositePath)}
                    style="
                      width: 38px;
                      height: 38px;
                      border-radius: 10px;
                      background: {NEU_BG};
                      box-shadow: {neuCfg.btnSm};
                      border: none;
                      cursor: pointer;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      color: #475569;
                      transition: transform 0.1s ease, box-shadow 0.1s ease;
                    "
                    title="Buka Folder File Foto Sesi Ini di Windows Explorer"
                    onmousedown={(e) => (e.currentTarget.style.boxShadow = neuCfg.inset)}
                    onmouseup={(e) => (e.currentTarget.style.boxShadow = neuCfg.btnSm)}
                  >
                    <FolderOpen size={16} />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Modal Footer -->
      <div
        style="
          padding: 14px 24px;
          background: {NEU_BG};
          border-top: 1px solid rgba(200,210,224,0.6);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        "
      >
        <span style="font-size: 11px; color: #64748b;">
          Total sesi ditemukan: <strong>{filteredSessions.length}</strong> sesi
        </span>

        <button
          type="button"
          onclick={onClose}
          style="
            padding: 8px 22px;
            border-radius: 12px;
            background: {NEU_BG};
            box-shadow: {neuCfg.btnSm};
            border: none;
            cursor: pointer;
            font-size: 12px;
            font-weight: 700;
            color: #334155;
            transition: all 0.15s ease;
          "
        >
          Tutup
        </button>
      </div>
    </div>
  </div>
{/if}
