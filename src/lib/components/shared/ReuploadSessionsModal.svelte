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
    FolderOpen,
    Trash2,
    ArrowRight,
    MoreVertical,
    Ban
  } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { invoke } from '@tauri-apps/api/core';
  import {
    listAllSessionOutboxJobs,
    resetOutboxJobForRetry,
    updateSessionPrintStatus,
    countPendingPrintJobs,
    clearAllPendingPrintJobs,
    cancelPendingPrintJobsBySessionCode,
    markOutboxJobDone,
    markOutboxJobsDoneBulk,
    markSessionsPrintedBulk,
    deleteLocalSessionsBulk,
    type SessionHistoryItem,
  } from '$lib/db/local';
  import { getActiveBoothId } from '$lib/api/boothClient';
  import { processSingleJobById, type JobProcessOutcome } from '$lib/utils/offlineOutbox';
  import { reprintSessionDirectly } from '$lib/utils/printQueue';
  import { clearActiveCheckpointIfMatches } from '$lib/utils/activeSessionCheckpoint';

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
  let openMenuId = $state<number | null>(null);

  function toggleCardMenu(id: number, e: MouseEvent) {
    e.stopPropagation();
    openMenuId = openMenuId === id ? null : id;
  }

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

  let pendingUploadCount = $derived(
    sessions.filter((s) => s.status === 'pending' || s.status === 'dead_letter').length
  );
  let pendingPrintCount = $state(0);

  async function loadSessions() {
    isLoading = true;
    try {
      const boothId = await getActiveBoothId().catch(() => null);
      sessions = await listAllSessionOutboxJobs(50, boothId);
      pendingPrintCount = await countPendingPrintJobs().catch(() => 0);
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

  function handleOpenAllSessionsPage() {
    onClose();
    void goto('/settings/sessions');
  }

  async function handleClearAllPrints() {
    if (pendingPrintCount === 0) return;
    const ok = confirm(`Batalkan seluruh ${pendingPrintCount} antrean cetak foto yang tertunda?`);
    if (!ok) return;

    try {
      await clearAllPendingPrintJobs();
      pendingPrintCount = 0;
      await loadSessions();
      onUpdated?.();
    } catch (err) {
      console.error('[ReuploadModal] Gagal membatalkan semua antrean cetak:', err);
    }
  }

  async function handleCancelSessionQueue(item: SessionHistoryItem) {
    openMenuId = null;
    const hasPendingUpload = item.status !== 'done';
    const hasPendingPrint = item.printStatus === 'pending';
    if (!hasPendingUpload && !hasPendingPrint) return;

    const ok = confirm(
      `Batalkan antrian untuk sesi "${item.sessionCode}"?\n${hasPendingUpload ? '- Antrian upload cloud akan dibatalkan\n' : ''}${hasPendingPrint ? '- Antrian cetak foto akan dibatalkan\n' : ''}(File foto lokal tetap tersimpan.)`
    );
    if (!ok) return;

    try {
      if (hasPendingUpload) {
        await markOutboxJobDone(item.id);
        item.status = 'done';
        item.lastError = null;
      }
      if (hasPendingPrint) {
        await cancelPendingPrintJobsBySessionCode(item.sessionCode);
        item.printStatus = 'failed';
        item.printError = 'Dibatalkan oleh operator';
      }
      await clearActiveCheckpointIfMatches(item.sessionCode);
      feedbackMap[item.id] = { type: 'success', text: 'Antrian sesi dibatalkan' };
      pendingPrintCount = await countPendingPrintJobs().catch(() => 0);
      onUpdated?.();
    } catch (err) {
      feedbackMap[item.id] = { type: 'error', text: String(err) };
    } finally {
      setTimeout(() => {
        delete feedbackMap[item.id];
      }, 3500);
    }
  }

  async function handleDeleteSingleSession(item: SessionHistoryItem) {
    openMenuId = null;
    const ok = confirm(
      `Hapus sesi lokal "${item.sessionCode}"?\nData sesi di database lokal dan file fotonya di komputer ini akan dihapus permanen (sesi yang sudah terupload di server tidak terpengaruh).`
    );
    if (!ok) return;

    try {
      await deleteLocalSessionsBulk([
        { id: item.id, sessionCode: item.sessionCode, compositePath: item.compositePath },
      ]);
      await clearActiveCheckpointIfMatches(item.sessionCode);
      if (previewUrls[item.id]) {
        try {
          URL.revokeObjectURL(previewUrls[item.id]);
        } catch {}
        delete previewUrls[item.id];
      }
      sessions = sessions.filter((s) => s.id !== item.id);
      pendingPrintCount = await countPendingPrintJobs().catch(() => 0);
      onUpdated?.();
    } catch (err) {
      feedbackMap[item.id] = { type: 'error', text: `Gagal menghapus sesi: ${String(err)}` };
      setTimeout(() => {
        delete feedbackMap[item.id];
      }, 3500);
    }
  }

  async function handleMarkSent(item: SessionHistoryItem) {
    try {
      await markOutboxJobDone(item.id);
      item.status = 'done';
      item.lastError = null;
      feedbackMap[item.id] = { type: 'success', text: 'Ditandai sudah dikirim' };
      onUpdated?.();
    } catch (err) {
      feedbackMap[item.id] = { type: 'error', text: String(err) };
    } finally {
      setTimeout(() => {
        delete feedbackMap[item.id];
      }, 3500);
    }
  }

  async function handleMarkPrinted(item: SessionHistoryItem) {
    try {
      await markSessionsPrintedBulk([{ id: item.id, sessionCode: item.sessionCode }]);
      item.printStatus = 'printed';
      item.printError = null;
      feedbackMap[item.id] = { type: 'success', text: 'Ditandai sudah print' };
      pendingPrintCount = await countPendingPrintJobs().catch(() => 0);
      onUpdated?.();
    } catch (err) {
      feedbackMap[item.id] = { type: 'error', text: String(err) };
    } finally {
      setTimeout(() => {
        delete feedbackMap[item.id];
      }, 3500);
    }
  }

  async function handleMarkAllSent() {
    const pendingItems = sessions.filter((s) => s.status === 'pending' || s.status === 'dead_letter');
    if (pendingItems.length === 0) return;
    const ok = confirm(`Tandai ${pendingItems.length} sesi yang tertunda sebagai sudah dikirim (tanpa menghapus file lokal)?`);
    if (!ok) return;

    try {
      await markOutboxJobsDoneBulk(pendingItems.map((s) => s.id));
      for (const s of pendingItems) {
        s.status = 'done';
        s.lastError = null;
      }
      onUpdated?.();
    } catch (err) {
      console.error('[ReuploadModal] Gagal menandai semua sudah dikirim:', err);
    }
  }

  async function handleOpenSessionsFolder(relativePath?: string | null, sessionCode?: string | null) {
    try {
      await invoke('open_sessions_dir', { relativePath: relativePath || null, sessionCode: sessionCode || null });
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
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      if (openMenuId !== null) {
        openMenuId = null;
        return;
      }
      onClose();
    }
  }

  $effect(() => {
    if (open) {
      openMenuId = null;
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

<svelte:window
  onkeydown={handleKeydown}
  onclick={() => {
    if (openMenuId !== null) openMenuId = null;
  }}
/>

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
          {#if pendingPrintCount > 0}
            <button
              type="button"
              onclick={handleClearAllPrints}
              style="
                padding: 7px 12px;
                border-radius: 10px;
                background: rgba(239, 68, 68, 0.35);
                border: 1px solid rgba(254, 202, 202, 0.4);
                display: flex;
                align-items: center;
                gap: 6px;
                color: #fee2e2;
                cursor: pointer;
                font-size: 11px;
                font-weight: 600;
                transition: background 0.15s ease;
              "
              title="Batalkan seluruh antrean cetak foto yang belum diproses"
            >
              <Trash2 size={13} />
              <span>Batalkan Cetak ({pendingPrintCount})</span>
            </button>
          {/if}

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
            Pending / Gagal ({sessions.filter((s) => s.status === 'pending' || s.status === 'dead_letter' || s.printStatus === 'failed').length})
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

        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          {#if pendingUploadCount > 0}
            <button
              type="button"
              onclick={handleMarkAllSent}
              style="
                padding: 6px 14px;
                border-radius: 10px;
                background: {NEU_BG};
                box-shadow: {neuCfg.btnSm};
                border: 1px solid rgba(16,185,129,0.35);
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                font-weight: 700;
                color: #047857;
                cursor: pointer;
                transition: all 0.15s ease;
              "
              title="Tandai sesi yang tertunda sebagai sudah dikirim tanpa menghapus file lokal"
              onmousedown={(e) => (e.currentTarget.style.boxShadow = neuCfg.inset)}
              onmouseup={(e) => (e.currentTarget.style.boxShadow = neuCfg.btnSm)}
            >
              <CheckCircle2 size={15} class="text-emerald-600" />
              <span>Tandai Sudah Dikirim ({pendingUploadCount})</span>
            </button>
          {/if}

          <button
            type="button"
            onclick={handleOpenAllSessionsPage}
            style="
              padding: 6px 14px;
              border-radius: 10px;
              background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY});
              box-shadow: 0 3px 10px rgba(42,40,115,0.28);
              border: none;
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 11px;
              font-weight: 700;
              color: white;
              cursor: pointer;
              transition: all 0.15s ease;
            "
            title="Buka halaman riwayat lengkap seluruh sesi booth (pagination, checklist, & pemulihan)"
          >
            <span>Lihat Semua Sesi</span>
            <ArrowRight size={14} />
          </button>

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
              {@const isMenuOpen = openMenuId === item.id}
              {@const canCancelQueue = item.status !== 'done' || item.printStatus === 'pending'}
              <div
                style="
                  position: relative;
                  z-index: {isMenuOpen ? 30 : 1};
                  background: {NEU_BG};
                  box-shadow: {neuCfg.card};
                  border-radius: 18px;
                  padding: 12px;
                  display: flex;
                  flex-direction: column;
                  gap: 10px;
                  border: 1px solid rgba(255,255,255,0.75);
                  transition: transform 0.15s ease;
                "
              >
                <!-- Card Top Row: Timestamp + Ellipsis Menu -->
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; position: relative;">
                  <span style="font-size: 11px; font-weight: 700; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    {formatDate(item.createdAt)}
                  </span>

                  <div style="position: relative; flex-shrink: 0;">
                    <button
                      type="button"
                      onclick={(e) => toggleCardMenu(item.id, e)}
                      aria-label="Menu aksi sesi {item.sessionCode}"
                      aria-expanded={isMenuOpen}
                      style="
                        width: 28px;
                        height: 28px;
                        border-radius: 8px;
                        background: {NEU_BG};
                        box-shadow: {isMenuOpen ? neuCfg.inset : neuCfg.btnSm};
                        border: none;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: {isMenuOpen ? NEU_PRIMARY : '#475569'};
                      "
                      title="Opsi sesi (Upload, Print, Lokasi Aset, Hapus)"
                    >
                      <MoreVertical size={15} />
                    </button>

                    {#if isMenuOpen}
                      <div
                        role="menu"
                        tabindex="-1"
                        onclick={(e) => e.stopPropagation()}
                        onkeydown={(e) => {
                          if (e.key === 'Escape') openMenuId = null;
                        }}
                        style="
                          position: absolute;
                          top: calc(100% + 6px);
                          right: 0;
                          min-width: 195px;
                          background: {NEU_BG};
                          box-shadow: 0 12px 28px rgba(15,23,42,0.22), {neuCfg.card};
                          border: 1px solid rgba(255,255,255,0.85);
                          border-radius: 14px;
                          padding: 6px;
                          display: flex;
                          flex-direction: column;
                          gap: 3px;
                          z-index: 50;
                        "
                      >
                        <button
                          type="button"
                          role="menuitem"
                          disabled={uploadingMap[item.id]}
                          onclick={() => {
                            openMenuId = null;
                            void handleManualUpload(item);
                          }}
                          style="
                            width: 100%;
                            padding: 8px 10px;
                            border-radius: 9px;
                            border: none;
                            background: transparent;
                            cursor: {uploadingMap[item.id] ? 'not-allowed' : 'pointer'};
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            font-size: 12px;
                            font-weight: 600;
                            color: #1e293b;
                            text-align: left;
                          "
                          class="hover:bg-black/5"
                        >
                          <RefreshCw size={14} class={uploadingMap[item.id] ? 'animate-spin text-indigo-600' : ''} />
                          <span>{uploadingMap[item.id] ? 'Mengupload...' : 'Upload Ulang'}</span>
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          disabled={printingMap[item.id] || !item.compositePath}
                          onclick={() => {
                            openMenuId = null;
                            void handleManualPrint(item);
                          }}
                          style="
                            width: 100%;
                            padding: 8px 10px;
                            border-radius: 9px;
                            border: none;
                            background: transparent;
                            cursor: {printingMap[item.id] || !item.compositePath ? 'not-allowed' : 'pointer'};
                            opacity: {!item.compositePath ? 0.5 : 1};
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            font-size: 12px;
                            font-weight: 600;
                            color: #1e293b;
                            text-align: left;
                          "
                          class="hover:bg-black/5"
                        >
                          <Printer size={14} />
                          <span>{printingMap[item.id] ? 'Mencetak...' : 'Print Ulang'}</span>
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          onclick={() => {
                            openMenuId = null;
                            void handleOpenSessionsFolder(item.compositePath, item.sessionCode);
                          }}
                          style="
                            width: 100%;
                            padding: 8px 10px;
                            border-radius: 9px;
                            border: none;
                            background: transparent;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            font-size: 12px;
                            font-weight: 600;
                            color: {NEU_PRIMARY};
                            text-align: left;
                          "
                          class="hover:bg-black/5"
                        >
                          <FolderOpen size={14} />
                          <span>Buka Lokasi Aset</span>
                        </button>

                        {#if item.status !== 'done'}
                          <button
                            type="button"
                            role="menuitem"
                            onclick={() => {
                              openMenuId = null;
                              void handleMarkSent(item);
                            }}
                            style="
                              width: 100%;
                              padding: 8px 10px;
                              border-radius: 9px;
                              border: none;
                              background: transparent;
                              cursor: pointer;
                              display: flex;
                              align-items: center;
                              gap: 8px;
                              font-size: 12px;
                              font-weight: 600;
                              color: #047857;
                              text-align: left;
                            "
                            class="hover:bg-emerald-500/10"
                          >
                            <CheckCircle2 size={14} />
                            <span>Tandai Sudah Dikirim</span>
                          </button>
                        {/if}

                        {#if item.printStatus !== 'printed'}
                          <button
                            type="button"
                            role="menuitem"
                            onclick={() => {
                              openMenuId = null;
                              void handleMarkPrinted(item);
                            }}
                            style="
                              width: 100%;
                              padding: 8px 10px;
                              border-radius: 9px;
                              border: none;
                              background: transparent;
                              cursor: pointer;
                              display: flex;
                              align-items: center;
                              gap: 8px;
                              font-size: 12px;
                              font-weight: 600;
                              color: #4338ca;
                              text-align: left;
                            "
                            class="hover:bg-indigo-500/10"
                          >
                            <Printer size={14} />
                            <span>Tandai Sudah Print</span>
                          </button>
                        {/if}

                        <button
                          type="button"
                          role="menuitem"
                          disabled={!canCancelQueue}
                          onclick={() => void handleCancelSessionQueue(item)}
                          style="
                            width: 100%;
                            padding: 8px 10px;
                            border-radius: 9px;
                            border: none;
                            background: transparent;
                            cursor: {canCancelQueue ? 'pointer' : 'not-allowed'};
                            opacity: {canCancelQueue ? 1 : 0.45};
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            font-size: 12px;
                            font-weight: 600;
                            color: #d97706;
                            text-align: left;
                          "
                          title={canCancelQueue ? 'Batalkan antrian upload / cetak untuk sesi ini' : 'Tidak ada antrian aktif pada sesi ini'}
                          class="hover:bg-amber-500/10"
                        >
                          <Ban size={14} />
                          <span>Batalkan Antrian</span>
                        </button>

                        <div style="height: 1px; background: rgba(148,163,184,0.3); margin: 2px 4px;"></div>

                        <button
                          type="button"
                          role="menuitem"
                          onclick={() => void handleDeleteSingleSession(item)}
                          style="
                            width: 100%;
                            padding: 8px 10px;
                            border-radius: 9px;
                            border: none;
                            background: transparent;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            font-size: 12px;
                            font-weight: 700;
                            color: #dc2626;
                            text-align: left;
                          "
                          class="hover:bg-red-500/10"
                        >
                          <Trash2 size={14} />
                          <span>Hapus Sesi Lokal</span>
                        </button>
                      </div>
                    {/if}
                  </div>
                </div>

                <!-- Thumbnail Preview Frame -->
                <div
                  style="
                    width: 100%;
                    height: 220px;
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
                </div>

                <!-- Status Badges (Upload & Print) di bawah Preview Template Frame -->
                <div
                  style="
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex-wrap: wrap;
                  "
                >
                  <div
                    style="
                      padding: 4px 10px;
                      border-radius: 9999px;
                      font-size: 10px;
                      font-weight: 700;
                      display: inline-flex;
                      align-items: center;
                      gap: 4px;
                      background: {item.status === 'done'
                        ? 'rgba(34, 197, 94, 0.14)'
                        : item.status === 'dead_letter'
                          ? 'rgba(239, 68, 68, 0.14)'
                          : 'rgba(245, 158, 11, 0.16)'};
                      color: {item.status === 'done'
                        ? '#15803d'
                        : item.status === 'dead_letter'
                          ? '#b91c1c'
                          : '#b45309'};
                    "
                    title={item.lastError || ''}
                  >
                    {#if item.status === 'done'}
                      <CheckCircle2 size={11} />
                      <span>Cloud: Terkirim</span>
                    {:else if item.status === 'dead_letter'}
                      <AlertCircle size={11} />
                      <span>Cloud: Gagal ({item.attempts}x)</span>
                    {:else}
                      <Clock size={11} />
                      <span>Cloud: Pending</span>
                    {/if}
                  </div>

                  <div
                    style="
                      padding: 4px 10px;
                      border-radius: 9999px;
                      font-size: 10px;
                      font-weight: 700;
                      display: inline-flex;
                      align-items: center;
                      gap: 4px;
                      background: {item.printStatus === 'printed'
                        ? 'rgba(34, 197, 94, 0.14)'
                        : item.printStatus === 'failed'
                          ? 'rgba(239, 68, 68, 0.14)'
                          : 'rgba(100, 116, 139, 0.14)'};
                      color: {item.printStatus === 'printed'
                        ? '#15803d'
                        : item.printStatus === 'failed'
                          ? '#b91c1c'
                          : '#475569'};
                    "
                    title={item.printError || ''}
                  >
                    <Printer size={11} />
                    {#if item.printStatus === 'printed'}
                      <span>Print: OK</span>
                    {:else if item.printStatus === 'failed'}
                      <span>Print: Gagal</span>
                    {:else}
                      <span>Print: Belum</span>
                    {/if}
                  </div>
                </div>

                <!-- Target Softfile (Email / Phone jika ada) & Feedback -->
                {#if item.softfileTarget || (item.lastError && item.status !== 'done') || feedbackMap[item.id]}
                  <div style="display: flex; flex-direction: column; gap: 4px; padding: 0 2px;">
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
                          <Mail size={11} color="#6366f1" style="flex-shrink: 0;" />
                        {:else}
                          <Phone size={11} color="#10b981" style="flex-shrink: 0;" />
                        {/if}
                        <span style="overflow: hidden; text-overflow: ellipsis;">{item.softfileTarget}</span>
                      </div>
                    {/if}

                    {#if item.lastError && item.status !== 'done'}
                      <p
                        style="margin: 0; font-size: 10px; color: #b91c1c; background: rgba(239,68,68,0.08); padding: 4px 8px; border-radius: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                        title={item.lastError}
                      >
                        {item.lastError}
                      </p>
                    {/if}

                    {#if feedbackMap[item.id]}
                      <div
                        style="
                          padding: 3px 8px;
                          border-radius: 6px;
                          font-size: 9px;
                          font-weight: 600;
                          background: {feedbackMap[item.id].type === 'success' ? '#dcfce7' : '#fee2e2'};
                          color: {feedbackMap[item.id].type === 'success' ? '#15803d' : '#b91c1c'};
                        "
                      >
                        {feedbackMap[item.id].text}
                      </div>
                    {/if}
                  </div>
                {/if}
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
          gap: 12px;
          flex-wrap: wrap;
        "
      >
        <span style="font-size: 11px; color: #64748b;">
          Menampilkan: <strong>{filteredSessions.length}</strong> sesi (maks. 50 terbaru di dialog)
        </span>

        <div style="display: flex; align-items: center; gap: 10px;">
          <button
            type="button"
            onclick={handleOpenAllSessionsPage}
            style="
              padding: 8px 18px;
              border-radius: 12px;
              background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY});
              box-shadow: 0 4px 12px rgba(42,40,115,0.28);
              border: none;
              cursor: pointer;
              font-size: 12px;
              font-weight: 700;
              color: white;
              display: flex;
              align-items: center;
              gap: 6px;
            "
          >
            <span>Lihat Semua Riwayat Sesi</span>
            <ArrowRight size={14} />
          </button>

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
  </div>
{/if}
