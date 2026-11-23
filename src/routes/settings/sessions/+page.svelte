<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    RefreshCw,
    Printer,
    CheckCircle2,
    AlertCircle,
    Clock,
    FileText,
    Image as ImageIcon,
    Mail,
    Phone,
    FolderOpen,
    Search,
    X,
    CheckSquare,
    Square,
    MinusSquare,
    MoreVertical,
    Trash2,
    Ban
  } from '@lucide/svelte';
  import { invoke } from '@tauri-apps/api/core';
  import {
    getActivation,
    listSessionOutboxJobsPaginated,
    markOutboxJobDone,
    markOutboxJobsDoneBulk,
    markSessionsPrintedBulk,
    deleteLocalSessionsBulk,
    resetOutboxJobForRetry,
    updateSessionPrintStatus,
    cancelPendingPrintJobsBySessionCode,
    countPendingPrintJobs,
    type SessionHistoryItem,
    type SessionHistoryFilter,
  } from '$lib/db/local';
  import { getActiveBoothId } from '$lib/api/boothClient';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { processSingleJobById, type JobProcessOutcome } from '$lib/utils/offlineOutbox';
  import { reprintSessionDirectly } from '$lib/utils/printQueue';
  import { setWindowDecorations } from '$lib/utils/windowControl';
  import { clearActiveCheckpointIfMatches } from '$lib/utils/activeSessionCheckpoint';

  const NEU_BG = '#ebf0f7';
  const NEU_PRIMARY = '#2a2873';
  const neuCfg = {
    card: '8px 8px 20px rgba(163,177,198,0.6), -8px -8px 20px rgba(255,255,255,0.9)',
    inset: 'inset 4px 4px 10px rgba(163,177,198,0.7), inset -4px -4px 10px rgba(255,255,255,0.9)',
    btn: '5px 5px 12px rgba(163,177,198,0.55), -4px -4px 10px rgba(255,255,255,0.85)',
    btnSm: '3px 3px 8px rgba(163,177,198,0.55), -3px -3px 8px rgba(255,255,255,0.85)',
  };

  const PAGE_SIZE_OPTIONS = [10, 20, 50];

  let activeBoothId = $state<string | null>(null);
  let boothName = $state<string>('Booth');
  let sessionsDirPath = $state<string>('');

  let sessions = $state<SessionHistoryItem[]>([]);
  let isLoading = $state(false);
  let activeFilter = $state<SessionHistoryFilter>('all');
  let searchInput = $state('');
  let debouncedSearch = $state('');
  let currentPage = $state(1);
  let pageSize = $state(10);
  let totalItems = $state(0);
  let totalPages = $state(1);
  let counts = $state({ all: 0, pending: 0, printFailed: 0, done: 0 });
  let pendingPrintCount = $state(0);

  let selectedMap = $state<Record<number, boolean>>({});
  let previewUrls = $state<Record<number, string>>({});
  let uploadingMap = $state<Record<number, boolean>>({});
  let printingMap = $state<Record<number, boolean>>({});
  let feedbackMap = $state<Record<number, { type: 'success' | 'error'; text: string }>>({});
  let globalNotice = $state<{ type: 'success' | 'error'; text: string } | null>(null);
  let isBulkProcessing = $state(false);
  let lightboxItem = $state<SessionHistoryItem | null>(null);

  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  let selectedItems = $derived(sessions.filter((s) => Boolean(selectedMap[s.id])));
  let selectedCount = $derived(selectedItems.length);
  let allPageSelected = $derived(sessions.length > 0 && selectedCount === sessions.length);
  let somePageSelected = $derived(selectedCount > 0 && selectedCount < sessions.length);

  let startIndex = $derived(totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1);
  let endIndex = $derived(Math.min(totalItems, currentPage * pageSize));

  let visiblePageNumbers = $derived.by(() => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (currentPage > 3) pages.push('ellipsis');
    const from = Math.max(2, currentPage - 1);
    const to = Math.min(totalPages - 1, currentPage + 1);
    for (let i = from; i <= to; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  });

  function showGlobalNotice(type: 'success' | 'error', text: string, ms = 3500) {
    globalNotice = { type, text };
    setTimeout(() => {
      if (globalNotice?.text === text) globalNotice = null;
    }, ms);
  }

  function setItemFeedback(id: number, type: 'success' | 'error', text: string) {
    feedbackMap[id] = { type, text };
    setTimeout(() => {
      delete feedbackMap[id];
    }, 3500);
  }

  async function loadSessions(options?: { keepSelection?: boolean }) {
    isLoading = true;
    try {
      const result = await listSessionOutboxJobsPaginated({
        boothId: activeBoothId,
        filter: activeFilter,
        search: debouncedSearch,
        page: currentPage,
        pageSize,
      });

      sessions = result.items;
      totalItems = result.total;
      currentPage = result.page;
      pageSize = result.pageSize;
      totalPages = result.totalPages;
      counts = result.counts;
      pendingPrintCount = await countPendingPrintJobs().catch(() => 0);

      if (!options?.keepSelection) {
        selectedMap = {};
      } else {
        const visibleIds = new Set(result.items.map((i) => i.id));
        const next: Record<number, boolean> = {};
        for (const [k, v] of Object.entries(selectedMap)) {
          const numId = Number(k);
          if (v && visibleIds.has(numId)) next[numId] = true;
        }
        selectedMap = next;
      }

      for (const item of result.items) {
        if (item.compositePath && !previewUrls[item.id]) {
          void loadThumbnail(item);
        }
      }
    } catch (err) {
      console.error('[SessionsPage] Gagal memuat daftar riwayat sesi:', err);
      showGlobalNotice('error', `Gagal memuat data sesi: ${String(err)}`);
    } finally {
      isLoading = false;
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
    } catch {
      // File lokal mungkin belum ada / sudah dibersihkan
    }
  }

  function handleFilterChange(nextFilter: SessionHistoryFilter) {
    if (activeFilter === nextFilter) return;
    activeFilter = nextFilter;
    currentPage = 1;
    selectedMap = {};
    void loadSessions();
  }

  function handlePageSizeChange(nextSize: number) {
    if (pageSize === nextSize) return;
    pageSize = nextSize;
    currentPage = 1;
    selectedMap = {};
    void loadSessions();
  }

  function goToPage(page: number) {
    const clamped = Math.max(1, Math.min(totalPages, page));
    if (clamped === currentPage) return;
    currentPage = clamped;
    selectedMap = {};
    void loadSessions();
  }

  function handleSearchInput(val: string) {
    searchInput = val;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      debouncedSearch = val.trim();
      currentPage = 1;
      selectedMap = {};
      void loadSessions();
    }, 250);
  }

  function toggleSelectItem(id: number) {
    if (selectedMap[id]) {
      const next = { ...selectedMap };
      delete next[id];
      selectedMap = next;
    } else {
      selectedMap = { ...selectedMap, [id]: true };
    }
  }

  function toggleSelectAllPage() {
    if (allPageSelected) {
      selectedMap = {};
    } else {
      const next: Record<number, boolean> = {};
      for (const s of sessions) {
        next[s.id] = true;
      }
      selectedMap = next;
    }
  }

  async function handleBulkMarkSent() {
    if (selectedCount === 0 || isBulkProcessing) return;
    const targets = selectedItems;
    isBulkProcessing = true;
    try {
      const affected = await markOutboxJobsDoneBulk(targets.map((t) => t.id));
      selectedMap = {};
      await loadSessions();
      showGlobalNotice('success', `${affected || targets.length} sesi ditandai sudah dikirim (aset lokal tetap tersimpan).`);
    } catch (err) {
      showGlobalNotice('error', `Gagal menandai sudah dikirim: ${String(err)}`);
    } finally {
      isBulkProcessing = false;
    }
  }

  async function handleBulkMarkPrinted() {
    if (selectedCount === 0 || isBulkProcessing) return;
    const targets = selectedItems.map((t) => ({ id: t.id, sessionCode: t.sessionCode }));
    isBulkProcessing = true;
    try {
      const affected = await markSessionsPrintedBulk(targets);
      selectedMap = {};
      await loadSessions();
      showGlobalNotice('success', `${affected || targets.length} sesi ditandai sudah print.`);
    } catch (err) {
      showGlobalNotice('error', `Gagal menandai sudah print: ${String(err)}`);
    } finally {
      isBulkProcessing = false;
    }
  }

  async function handleMarkSingleSent(item: SessionHistoryItem) {
    try {
      await markOutboxJobDone(item.id);
      setItemFeedback(item.id, 'success', 'Ditandai sudah dikirim');
      await loadSessions({ keepSelection: true });
    } catch (err) {
      setItemFeedback(item.id, 'error', String(err));
    }
  }

  async function handleMarkSinglePrinted(item: SessionHistoryItem) {
    try {
      await markSessionsPrintedBulk([{ id: item.id, sessionCode: item.sessionCode }]);
      setItemFeedback(item.id, 'success', 'Ditandai sudah print');
      await loadSessions({ keepSelection: true });
    } catch (err) {
      setItemFeedback(item.id, 'error', String(err));
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
      }
      if (hasPendingPrint) {
        await cancelPendingPrintJobsBySessionCode(item.sessionCode);
      }
      await clearActiveCheckpointIfMatches(item.sessionCode);
      setItemFeedback(item.id, 'success', 'Antrian sesi dibatalkan');
      await loadSessions({ keepSelection: true });
    } catch (err) {
      setItemFeedback(item.id, 'error', `Gagal membatalkan antrian: ${String(err)}`);
    }
  }

  async function handleManualUpload(item: SessionHistoryItem) {
    if (uploadingMap[item.id]) return;
    uploadingMap[item.id] = true;
    setItemFeedback(item.id, 'success', 'Mengupload ke cloud...');

    try {
      await resetOutboxJobForRetry(item.id);
      const outcome: JobProcessOutcome = await processSingleJobById(item.id);

      if (outcome.status === 'success') {
        setItemFeedback(item.id, 'success', 'Berhasil diupload!');
        await loadSessions({ keepSelection: true });
      } else if (outcome.status === 'network_failure') {
        setItemFeedback(item.id, 'error', 'Koneksi offline');
      } else {
        setItemFeedback(item.id, 'error', outcome.reason || 'Upload gagal');
      }
    } catch (err) {
      setItemFeedback(item.id, 'error', String(err));
    } finally {
      uploadingMap[item.id] = false;
    }
  }

  async function handleManualPrint(item: SessionHistoryItem) {
    if (printingMap[item.id] || !item.compositePath) return;
    printingMap[item.id] = true;
    setItemFeedback(item.id, 'success', 'Mengirim ke printer...');

    try {
      const res = await reprintSessionDirectly(
        item.sessionCode,
        item.compositePath,
        item.printQty || 1,
        item.paperSize || '4x6',
        item.useSecondary ?? false,
      );
      if (res.ok) {
        await updateSessionPrintStatus(item.sessionCode, 'printed').catch(console.warn);
        setItemFeedback(item.id, 'success', res.message);
        await loadSessions({ keepSelection: true });
      } else {
        await updateSessionPrintStatus(item.sessionCode, 'failed', res.message).catch(console.warn);
        setItemFeedback(item.id, 'error', res.message);
      }
    } catch (err) {
      await updateSessionPrintStatus(item.sessionCode, 'failed', String(err)).catch(console.warn);
      setItemFeedback(item.id, 'error', String(err));
    } finally {
      printingMap[item.id] = false;
    }
  }

  async function handleOpenSessionsFolder(relativePath?: string | null, sessionCode?: string | null, itemId?: number) {
    try {
      await invoke('open_sessions_dir', {
        relativePath: relativePath || null,
        sessionCode: sessionCode || null,
      });
    } catch (err) {
      const msg = `Gagal membuka lokasi aset: ${String(err)}`;
      if (itemId) setItemFeedback(itemId, 'error', msg);
      else showGlobalNotice('error', msg);
    }
  }

  let openMenuId = $state<number | null>(null);

  function toggleCardMenu(id: number, e: MouseEvent) {
    e.stopPropagation();
    openMenuId = openMenuId === id ? null : id;
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
      const nextSel = { ...selectedMap };
      delete nextSel[item.id];
      selectedMap = nextSel;
      await loadSessions({ keepSelection: true });
      showGlobalNotice('success', `Sesi lokal ${item.sessionCode} berhasil dihapus.`);
    } catch (err) {
      setItemFeedback(item.id, 'error', `Gagal menghapus sesi: ${String(err)}`);
    }
  }

  async function handleBulkDeleteSessions() {
    if (selectedCount === 0 || isBulkProcessing) return;
    const targets = selectedItems;
    const ok = confirm(
      `Hapus ${targets.length} sesi lokal terpilih?\nData di database lokal dan file fotonya di komputer ini akan dihapus permanen.`
    );
    if (!ok) return;

    isBulkProcessing = true;
    try {
      const { deletedDb } = await deleteLocalSessionsBulk(
        targets.map((t) => ({
          id: t.id,
          sessionCode: t.sessionCode,
          compositePath: t.compositePath,
        }))
      );
      await clearActiveCheckpointIfMatches(targets.map((t) => t.sessionCode));
      for (const t of targets) {
        if (previewUrls[t.id]) {
          try {
            URL.revokeObjectURL(previewUrls[t.id]);
          } catch {}
          delete previewUrls[t.id];
        }
      }
      selectedMap = {};
      await loadSessions();
      showGlobalNotice('success', `${deletedDb || targets.length} sesi lokal berhasil dihapus.`);
    } catch (err) {
      showGlobalNotice('error', `Gagal menghapus sesi: ${String(err)}`);
    } finally {
      isBulkProcessing = false;
    }
  }

  function handleBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      void goto('/settings');
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
    if (e.key === 'Escape') {
      if (openMenuId !== null) openMenuId = null;
      if (lightboxItem) lightboxItem = null;
    }
  }

  onMount(async () => {
    void setWindowDecorations(true);
    const activation = await getActivation().catch(() => null);
    activeBoothId = activation?.boothId || (await getActiveBoothId().catch(() => null));
    boothName = activation?.boothName || uiConfig.config.boothName || 'Booth';
    try {
      sessionsDirPath = await invoke<string>('get_sessions_dir');
    } catch {}
    await loadSessions();
  });

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
    Object.values(previewUrls).forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
  });

  const btnBaseStyle = `min-height: 36px; padding: 0 14px; border-radius: 10px; background: ${NEU_BG}; box-shadow: ${neuCfg.btnSm}; border: none; cursor: pointer; font-family: 'Poppins',sans-serif; font-weight: 700; font-size: 12px; color: #334155; display: inline-flex; align-items: center; gap: 6px; touch-action: manipulation;`;
</script>

<svelte:window
  onkeydown={handleKeydown}
  onclick={() => {
    if (openMenuId !== null) openMenuId = null;
  }}
/>

<div class="w-screen h-screen overflow-hidden flex flex-col" style="background: {NEU_BG}; font-family: 'Poppins', sans-serif;">
  <!-- Header -->
  <div
    style="
      background: linear-gradient(135deg, #3d3aa0, {NEU_PRIMARY});
      display: flex;
      align-items: center;
      padding: 0 24px;
      height: 68px;
      flex-shrink: 0;
      box-shadow: 0 4px 20px rgba(42,40,115,0.3);
      gap: 14px;
    "
  >
    <button
      type="button"
      onclick={handleBack}
      aria-label="Kembali ke Pengaturan Mesin"
      style="
        width: 40px;
        height: 40px;
        border-radius: 12px;
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

    <div style="flex: 1; min-width: 0;">
      <h1 style="margin: 0; color: white; font-weight: 700; font-size: 1.05rem; line-height: 1.2;">
        Riwayat &amp; Pemulihan Sesi
      </h1>
      <p style="margin: 0; color: rgba(255,255,255,0.8); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        Khusus Booth: <strong>{boothName}</strong> &bull; {counts.all} total sesi lokal
        {#if pendingPrintCount > 0}
          &bull; {pendingPrintCount} antrean cetak
        {/if}
      </p>
    </div>

    <button
      type="button"
      onclick={() => handleOpenSessionsFolder(null, null)}
      style="
        height: 38px;
        padding: 0 14px;
        border-radius: 10px;
        background: rgba(255,255,255,0.16);
        border: 1px solid rgba(255,255,255,0.25);
        color: white;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
      "
      title={sessionsDirPath ? `Lokasi folder root: ${sessionsDirPath}` : 'Buka folder root aset sesi lokal'}
    >
      <FolderOpen size={15} />
      <span>Folder Aset Booth</span>
    </button>

    <button
      type="button"
      onclick={() => loadSessions({ keepSelection: true })}
      disabled={isLoading}
      style="
        height: 38px;
        padding: 0 14px;
        border-radius: 10px;
        background: rgba(255,255,255,0.16);
        border: 1px solid rgba(255,255,255,0.25);
        color: white;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
      "
    >
      <RefreshCw size={14} class={isLoading ? 'animate-spin' : ''} />
      <span>Segarkan</span>
    </button>
  </div>

  <!-- Filter Tabs, Search & Page Size Toolbar -->
  <div
    style="
      padding: 14px 24px;
      background: {NEU_BG};
      border-bottom: 1px solid rgba(200,210,224,0.65);
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex-shrink: 0;
    "
  >
    <div style="max-width: 1400px; width: 100%; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
      <!-- Tabs -->
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <button
          type="button"
          onclick={() => handleFilterChange('all')}
          style="
            padding: 7px 14px;
            border-radius: 9999px;
            border: none;
            cursor: pointer;
            font-size: 12px;
            font-weight: 700;
            background: {NEU_BG};
            box-shadow: {activeFilter === 'all' ? neuCfg.inset : neuCfg.btnSm};
            color: {activeFilter === 'all' ? NEU_PRIMARY : '#64748b'};
          "
        >
          Semua ({counts.all})
        </button>

        <button
          type="button"
          onclick={() => handleFilterChange('pending')}
          style="
            padding: 7px 14px;
            border-radius: 9999px;
            border: none;
            cursor: pointer;
            font-size: 12px;
            font-weight: 700;
            background: {NEU_BG};
            box-shadow: {activeFilter === 'pending' ? neuCfg.inset : neuCfg.btnSm};
            color: {activeFilter === 'pending' ? '#d97706' : '#64748b'};
            display: flex;
            align-items: center;
            gap: 6px;
          "
        >
          <span style="width: 7px; height: 7px; border-radius: 50%; background: #f59e0b;"></span>
          <span>Gagal / Pending Kirim ({counts.pending})</span>
        </button>

        <button
          type="button"
          onclick={() => handleFilterChange('print_failed')}
          style="
            padding: 7px 14px;
            border-radius: 9999px;
            border: none;
            cursor: pointer;
            font-size: 12px;
            font-weight: 700;
            background: {NEU_BG};
            box-shadow: {activeFilter === 'print_failed' ? neuCfg.inset : neuCfg.btnSm};
            color: {activeFilter === 'print_failed' ? '#dc2626' : '#64748b'};
            display: flex;
            align-items: center;
            gap: 6px;
          "
        >
          <Printer size={13} />
          <span>Gagal / Belum Print ({counts.printFailed})</span>
        </button>

        <button
          type="button"
          onclick={() => handleFilterChange('done')}
          style="
            padding: 7px 14px;
            border-radius: 9999px;
            border: none;
            cursor: pointer;
            font-size: 12px;
            font-weight: 700;
            background: {NEU_BG};
            box-shadow: {activeFilter === 'done' ? neuCfg.inset : neuCfg.btnSm};
            color: {activeFilter === 'done' ? '#16a34a' : '#64748b'};
          "
        >
          Sudah Dikirim ({counts.done})
        </button>
      </div>

      <!-- Search + Page Limit -->
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <div
          style="
            position: relative;
            display: flex;
            align-items: center;
            background: {NEU_BG};
            box-shadow: {neuCfg.inset};
            border-radius: 12px;
            padding: 0 12px;
            height: 38px;
            min-width: 240px;
          "
        >
          <Search size={14} color="#64748b" />
          <input
            type="text"
            value={searchInput}
            oninput={(e) => handleSearchInput(e.currentTarget.value)}
            placeholder="Cari kode sesi / email / WA..."
            style="
              border: none;
              outline: none;
              background: transparent;
              padding: 0 8px;
              font-size: 12px;
              font-weight: 500;
              color: #1e293b;
              width: 100%;
              font-family: 'Poppins', sans-serif;
            "
          />
          {#if searchInput}
            <button
              type="button"
              onclick={() => handleSearchInput('')}
              aria-label="Hapus pencarian"
              style="border: none; background: transparent; cursor: pointer; color: #64748b; display: flex; padding: 2px;"
            >
              <X size={13} />
            </button>
          {/if}
        </div>

        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 11px; font-weight: 600; color: #64748b;">Per halaman:</span>
          <select
            value={pageSize}
            onchange={(e) => handlePageSizeChange(Number(e.currentTarget.value))}
            aria-label="Jumlah sesi per halaman"
            style="
              height: 38px;
              padding: 0 12px;
              border-radius: 10px;
              border: none;
              outline: none;
              background: {NEU_BG};
              box-shadow: {neuCfg.inset};
              font-size: 12px;
              font-weight: 700;
              color: #1e293b;
              cursor: pointer;
              font-family: 'Poppins', sans-serif;
            "
          >
            {#each PAGE_SIZE_OPTIONS as sizeOpt}
              <option value={sizeOpt}>{sizeOpt}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>

    <!-- Checklist & Bulk Actions Bar -->
    <div style="max-width: 1400px; width: 100%; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <button
          type="button"
          onclick={toggleSelectAllPage}
          disabled={sessions.length === 0}
          style="{btnBaseStyle} opacity: {sessions.length === 0 ? 0.5 : 1}; cursor: {sessions.length === 0 ? 'not-allowed' : 'pointer'}; color: {allPageSelected || somePageSelected ? NEU_PRIMARY : '#334155'};"
        >
          {#if allPageSelected}
            <CheckSquare size={16} color={NEU_PRIMARY} />
          {:else if somePageSelected}
            <MinusSquare size={16} color={NEU_PRIMARY} />
          {:else}
            <Square size={16} color="#64748b" />
          {/if}
          <span>Pilih Semua (Halaman Ini)</span>
        </button>

        {#if selectedCount > 0}
          <span style="font-size: 12px; font-weight: 700; color: {NEU_PRIMARY};">
            {selectedCount} sesi dipilih
          </span>
          <button
            type="button"
            onclick={() => (selectedMap = {})}
            style="border: none; background: transparent; color: #64748b; font-size: 11px; font-weight: 600; cursor: pointer; text-decoration: underline;"
          >
            Batal pilih
          </button>
        {/if}
      </div>

      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <button
          type="button"
          onclick={handleBulkMarkSent}
          disabled={selectedCount === 0 || isBulkProcessing}
          style="
            {btnBaseStyle}
            border: 1px solid rgba(16,185,129,0.35);
            color: #047857;
            opacity: {selectedCount === 0 || isBulkProcessing ? 0.5 : 1};
            cursor: {selectedCount === 0 || isBulkProcessing ? 'not-allowed' : 'pointer'};
          "
          title="Hapus warning gagal kirim pada sesi terpilih tanpa menghapus sesi atau file lokal"
        >
          <CheckCircle2 size={15} />
          <span>Tandai Sudah Dikirim{selectedCount > 0 ? ` (${selectedCount})` : ''}</span>
        </button>

        <button
          type="button"
          onclick={handleBulkMarkPrinted}
          disabled={selectedCount === 0 || isBulkProcessing}
          style="
            {btnBaseStyle}
            border: 1px solid rgba(99,102,241,0.35);
            color: #4338ca;
            opacity: {selectedCount === 0 || isBulkProcessing ? 0.5 : 1};
            cursor: {selectedCount === 0 || isBulkProcessing ? 'not-allowed' : 'pointer'};
          "
          title="Tandai sesi terpilih sudah tercetak"
        >
          <Printer size={15} />
          <span>Tandai Sudah Print{selectedCount > 0 ? ` (${selectedCount})` : ''}</span>
        </button>

        <button
          type="button"
          onclick={handleBulkDeleteSessions}
          disabled={selectedCount === 0 || isBulkProcessing}
          style="
            {btnBaseStyle}
            border: 1px solid rgba(220,38,38,0.35);
            color: #dc2626;
            opacity: {selectedCount === 0 || isBulkProcessing ? 0.5 : 1};
            cursor: {selectedCount === 0 || isBulkProcessing ? 'not-allowed' : 'pointer'};
          "
          title="Hapus permanen sesi lokal & file fotonya di komputer ini (untuk membersihkan sesi zombie)"
        >
          <Trash2 size={15} />
          <span>Hapus Sesi Lokal{selectedCount > 0 ? ` (${selectedCount})` : ''}</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Main Scrollable Content -->
  <div class="custom-scrollbar" style="flex: 1; overflow-y: auto; padding: 20px 24px;">
    <div style="max-width: 1400px; margin: 0 auto;">
      {#if isLoading && sessions.length === 0}
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 0; color: #64748b; gap: 12px;">
          <RefreshCw size={30} class="animate-spin text-indigo-500" />
          <span style="font-size: 13px; font-weight: 600;">Memuat riwayat sesi booth...</span>
        </div>
      {:else if sessions.length === 0}
        <div
          style="
            background: {NEU_BG};
            box-shadow: {neuCfg.inset};
            border-radius: 20px;
            padding: 60px 24px;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            color: #64748b;
          "
        >
          <FileText size={38} class="text-slate-400" />
          <p style="font-size: 14px; font-weight: 700; margin: 0; color: #334155;">
            Tidak ada sesi ditemukan
          </p>
          <p style="font-size: 12px; margin: 0;">
            {debouncedSearch
              ? `Tidak ada sesi yang cocok dengan kata kunci "${debouncedSearch}".`
              : 'Belum ada riwayat sesi pada filter ini untuk booth ini.'}
          </p>
        </div>
      {:else}
        <div
          style="
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 18px;
          "
        >
          {#each sessions as item (item.id)}
            {@const isChecked = Boolean(selectedMap[item.id])}
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
                border: 2px solid {isChecked ? NEU_PRIMARY : 'rgba(255,255,255,0.75)'};
                transition: border-color 0.15s ease;
              "
            >
              <!-- Card Top Row: Checklist + Timestamp + Ellipsis Menu -->
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; position: relative;">
                <button
                  type="button"
                  onclick={() => toggleSelectItem(item.id)}
                  aria-label="Pilih sesi {item.sessionCode}"
                  style="
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    border: none;
                    background: transparent;
                    padding: 2px 0;
                    cursor: pointer;
                    color: {isChecked ? NEU_PRIMARY : '#475569'};
                    font-weight: 700;
                    font-size: 11px;
                    text-align: left;
                    min-width: 0;
                    flex: 1;
                  "
                >
                  {#if isChecked}
                    <CheckSquare size={17} color={NEU_PRIMARY} style="flex-shrink: 0;" />
                  {:else}
                    <Square size={17} color="#64748b" style="flex-shrink: 0;" />
                  {/if}
                  <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    {formatDate(item.createdAt)}
                  </span>
                </button>

                <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                  <div style="position: relative;">
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
                            void handleOpenSessionsFolder(item.compositePath, item.sessionCode, item.id);
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
                          title={item.assetLocationLabel || item.sessionCode}
                          class="hover:bg-black/5"
                        >
                          <FolderOpen size={14} />
                          <span>Buka Lokasi Aset</span>
                        </button>

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
              </div>

              <!-- Thumbnail Preview -->
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
                  <button
                    type="button"
                    onclick={() => (lightboxItem = item)}
                    style="width: 100%; height: 100%; border: none; background: transparent; padding: 0; cursor: zoom-in;"
                    title="Klik untuk memperbesar preview foto"
                  >
                    <img
                      src={previewUrls[item.id]}
                      alt="Strip Foto Sesi {item.sessionCode}"
                      class="w-full h-full object-contain"
                    />
                  </button>
                {:else}
                  <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; color: #64748b;">
                    <ImageIcon size={26} />
                    <span style="font-size: 10px; font-weight: 500;">Preview tidak tersedia</span>
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

              <!-- Meta: Softfile Target (jika ada Email/WA), Error & Feedback -->
              {#if item.softfileTarget || (item.lastError && item.status !== 'done') || feedbackMap[item.id]}
                <div style="display: flex; flex-direction: column; gap: 5px;">
                  {#if item.softfileTarget}
                    <div
                      style="display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: #334155;"
                      title={item.softfileTarget}
                    >
                      {#if item.softfileTarget.includes('@')}
                        <Mail size={12} color="#6366f1" style="flex-shrink: 0;" />
                      {:else}
                        <Phone size={12} color="#10b981" style="flex-shrink: 0;" />
                      {/if}
                      <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        {item.softfileTarget}
                      </span>
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
                        padding: 4px 8px;
                        border-radius: 6px;
                        font-size: 10px;
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

              <!-- Narrative Mark Actions: Tandai Sudah Dikirim / Tandai Sudah Print -->
              {#if item.status !== 'done' || item.printStatus !== 'printed'}
                <div style="display: flex; flex-direction: column; gap: 6px; margin-top: auto;">
                  {#if item.status !== 'done'}
                    <button
                      type="button"
                      onclick={() => handleMarkSingleSent(item)}
                      style="
                        width: 100%;
                        height: 32px;
                        border-radius: 10px;
                        background: {NEU_BG};
                        box-shadow: {neuCfg.btnSm};
                        border: 1px solid rgba(16,185,129,0.3);
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        color: #047857;
                        font-weight: 700;
                        font-size: 11px;
                      "
                      title="Hapus warning gagal kirim tanpa menghapus sesi di lokal"
                    >
                      <CheckCircle2 size={13} />
                      <span>Tandai Sudah Dikirim</span>
                    </button>
                  {/if}

                  {#if item.printStatus !== 'printed'}
                    <button
                      type="button"
                      onclick={() => handleMarkSinglePrinted(item)}
                      style="
                        width: 100%;
                        height: 32px;
                        border-radius: 10px;
                        background: {NEU_BG};
                        box-shadow: {neuCfg.btnSm};
                        border: 1px solid rgba(99,102,241,0.3);
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        color: #4338ca;
                        font-weight: 700;
                        font-size: 11px;
                      "
                      title="Tandai sesi ini sudah tercetak"
                    >
                      <Printer size={13} />
                      <span>Tandai Sudah Print</span>
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Pagination Footer -->
  <div
    style="
      padding: 12px 24px;
      background: {NEU_BG};
      border-top: 1px solid rgba(200,210,224,0.65);
      flex-shrink: 0;
    "
  >
    <div style="max-width: 1400px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
      <span style="font-size: 12px; color: #475569;">
        Menampilkan <strong>{startIndex}–{endIndex}</strong> dari <strong>{totalItems}</strong> sesi (Halaman {currentPage} / {totalPages})
      </span>

      <div style="display: flex; align-items: center; gap: 6px;">
        <button
          type="button"
          onclick={() => goToPage(1)}
          disabled={currentPage <= 1 || isLoading}
          aria-label="Halaman pertama"
          style="{btnBaseStyle} padding: 0 10px; opacity: {currentPage <= 1 ? 0.45 : 1}; cursor: {currentPage <= 1 ? 'not-allowed' : 'pointer'};"
        >
          <ChevronsLeft size={15} />
        </button>

        <button
          type="button"
          onclick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          aria-label="Halaman sebelumnya"
          style="{btnBaseStyle} padding: 0 10px; opacity: {currentPage <= 1 ? 0.45 : 1}; cursor: {currentPage <= 1 ? 'not-allowed' : 'pointer'};"
        >
          <ChevronLeft size={15} />
        </button>

        {#each visiblePageNumbers as p}
          {#if p === 'ellipsis'}
            <span style="padding: 0 6px; font-size: 12px; color: #64748b;">…</span>
          {:else}
            <button
              type="button"
              onclick={() => goToPage(p)}
              disabled={isLoading}
              style="
                min-width: 36px;
                height: 36px;
                padding: 0 10px;
                border-radius: 10px;
                border: none;
                cursor: pointer;
                font-size: 12px;
                font-weight: 700;
                background: {p === currentPage ? `linear-gradient(135deg, #3d3aa0, ${NEU_PRIMARY})` : NEU_BG};
                box-shadow: {p === currentPage ? '0 3px 10px rgba(42,40,115,0.3)' : neuCfg.btnSm};
                color: {p === currentPage ? 'white' : '#334155'};
              "
            >
              {p}
            </button>
          {/if}
        {/each}

        <button
          type="button"
          onclick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages || isLoading}
          aria-label="Halaman berikutnya"
          style="{btnBaseStyle} padding: 0 10px; opacity: {currentPage >= totalPages ? 0.45 : 1}; cursor: {currentPage >= totalPages ? 'not-allowed' : 'pointer'};"
        >
          <ChevronRight size={15} />
        </button>

        <button
          type="button"
          onclick={() => goToPage(totalPages)}
          disabled={currentPage >= totalPages || isLoading}
          aria-label="Halaman terakhir"
          style="{btnBaseStyle} padding: 0 10px; opacity: {currentPage >= totalPages ? 0.45 : 1}; cursor: {currentPage >= totalPages ? 'not-allowed' : 'pointer'};"
        >
          <ChevronsRight size={15} />
        </button>
      </div>
    </div>
  </div>

  <!-- Global Notice Toast -->
  {#if globalNotice}
    <div
      style="
        position: fixed;
        bottom: 72px;
        right: 28px;
        z-index: 60;
        background: {globalNotice.type === 'success' ? '#16a34a' : '#dc2626'};
        color: white;
        padding: 10px 18px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 700;
        box-shadow: 0 6px 20px rgba(0,0,0,0.22);
      "
    >
      {globalNotice.text}
    </div>
  {/if}

  <!-- Lightbox Preview Modal -->
  {#if lightboxItem && previewUrls[lightboxItem.id]}
    <div
      class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6"
      onclick={(e) => {
        if (e.target === e.currentTarget) lightboxItem = null;
      }}
      onkeydown={(e) => {
        if (e.key === 'Escape') lightboxItem = null;
      }}
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label="Preview foto sesi"
    >
      <div
        style="
          max-width: 720px;
          max-height: 90vh;
          background: {NEU_BG};
          border-radius: 20px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        "
      >
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <div>
            <p style="margin: 0; font-size: 13px; font-weight: 700; color: #1e293b;">{lightboxItem.sessionCode}</p>
            <p style="margin: 0; font-size: 11px; color: #64748b;">{formatDate(lightboxItem.createdAt)}</p>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button
              type="button"
              onclick={() => handleOpenSessionsFolder(lightboxItem!.compositePath, lightboxItem!.sessionCode, lightboxItem!.id)}
              style={btnBaseStyle}
            >
              <FolderOpen size={14} />
              <span>Buka Lokasi Aset</span>
            </button>
            <button
              type="button"
              onclick={() => (lightboxItem = null)}
              aria-label="Tutup preview"
              style="{btnBaseStyle} padding: 0 10px;"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div style="background: #0f172a; border-radius: 12px; overflow: hidden; display: flex; align-items: center; justify-content: center; max-height: 75vh;">
          <img
            src={previewUrls[lightboxItem.id]}
            alt="Preview {lightboxItem.sessionCode}"
            style="max-width: 100%; max-height: 75vh; object-fit: contain;"
          />
        </div>
      </div>
    </div>
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
