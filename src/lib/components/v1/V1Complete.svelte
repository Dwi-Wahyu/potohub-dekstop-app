<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import QRCode from 'qrcode';
  import { Printer, Send, Delete, Image, Film, Video } from '@lucide/svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { sendSoftfileEmail, sendSoftfileWA, formatTime, resolvePrinterConfigForTemplate } from '$lib/utils/shared';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { compositeTemplateImage } from '$lib/utils/templateComposite';
  import { saveSessionAssets, type SaveSessionAssetsResult } from '$lib/utils/sessionAssets';
  import { cachedFetch } from '$lib/utils/offlineCache';
  import {
    fetchTemplates,
    createTransactionSession,
    requireActiveBoothId,
    isValidUUID,
    type BoothTemplate
  } from '$lib/api/boothClient';
  import { networkStatus } from '$lib/stores/networkStatus.svelte';
  import { enqueueOutboxJob, enqueuePrintJob, upsertSessionOutboxJob } from '$lib/db/local';
  import { printerStore } from '$lib/printer.svelte';
  import OfflineBanner from '$lib/components/shared/OfflineBanner.svelte';
  import { buildAssetRelativePaths } from '$lib/utils/localSessionStorage';
  import { generateSessionCode } from '$lib/utils/shared';

  interface Props {
    photos?: string[];
    frameConfigId?: string;
    onNewSession: () => void;
    background?: string;
  }

  let { photos = [], frameConfigId = '', onNewSession, background }: Props = $props();

  let email = $state('');
  let phone = $state('');
  let emailSent = $state(false);
  let waSent = $state(false);
  let sent = $derived(emailSent || waSent);
  let softfileQueued = $state(false);
  let printStatus = $state<'IDLE' | 'PRINTING' | 'SUCCESS' | 'QUEUED'>('IDLE');
  let activeKbTarget = $state<'email' | 'phone' | null>(null);

  let emailEnabled = $derived(boothConfig.config.emailEnabled ?? true);
  let whatsappEnabled = $derived(boothConfig.config.whatsappEnabled ?? true);

  let secs = $state(5 * 60);
  let kbOpen = $state(false);
  let caps = $state(false);
  let numMode = $state(false);
  let timer: any = null;
  let printAbortController: AbortController | null = null;
  let qrDataUrl = $state('');
  let compositeUrl = $state<string | null>(null);
  let isSavingSession = $state(false);
  let selectedTemplate = $state<BoothTemplate | null>(null);
  let activePreviewTab = $state<'strip' | 'gif' | 'liveview'>('strip');

  const envs = import.meta.env as Record<string, string>;
  const rawSoftfileUrl =
    envs.SOFTFILE_BASE_URL ||
    envs.VITE_SOFTFILE_BASE_URL ||
    envs.ADMIN_DASHBOARD_URL ||
    envs.VITE_ADMIN_DASHBOARD_URL ||
    envs.PUBLIC_ADMIN_DASHBOARD_URL ||
    'http://localhost:3000';
  const SOFTFILE_PUBLIC_URL = rawSoftfileUrl.replace(/\/+$/, '');
  const ADMIN_DASHBOARD_PUBLIC_URL = SOFTFILE_PUBLIC_URL;

  $effect(() => {
    if (sent && secs > (boothConfig.config.endScreenTimeSecs || 3)) {
      secs = boothConfig.config.endScreenTimeSecs || 3;
    }
  });

  onMount(async () => {
    timer = setInterval(() => {
      if (secs > 0) secs--;
      else {
        clearInterval(timer);
        onNewSession();
      }
    }, 1000);

    let boothId = 'default';
    try {
      boothId = await requireActiveBoothId();
    } catch (e) {
      console.error('[V1Complete] Booth tidak aktif saat simpan sesi:', e);
    }

    try {
      await cachedFetch(
        `templates:${boothId}`,
        () => fetchTemplates(boothId),
        (templates) => {
          const targetId = frameConfigId || boothFlow.selectedFrameId;
          selectedTemplate =
            templates.find((t) => t.id === targetId) || templates[0] || null;
        }
      );
    } catch (err) {
      console.error('Failed to fetch template:', err);
    }

    const localSessionCode = generateSessionCode(uiConfig.config.boothName);
    boothFlow.sessionCode = localSessionCode;

    let softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/pending-${localSessionCode}`;
    let targetSessionIdentifier = localSessionCode;
    let sessionCreateError: string | null = null;
    const effectivePhotos = photos.length > 0 ? [...photos] : [...boothFlow.photosTaken];

    if (isValidUUID(boothFlow.sessionId)) {
      const existingSessId = boothFlow.sessionId!;
      softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/${existingSessId}`;
      targetSessionIdentifier = existingSessId;
    } else if (networkStatus.isOnline && isValidUUID(boothId)) {
      isSavingSession = true;
      try {
        const sessionMethod = boothFlow.paymentMethod === 'Ticket' ? 'Ticket' : 'Cash';
        const session = await createTransactionSession(
          boothId,
          selectedTemplate?.category_id,
          boothFlow.printQty,
          sessionMethod,
          frameConfigId
        );
        const sessId = session.session_id || session.id;
        if (isValidUUID(sessId)) {
          boothFlow.sessionId = sessId;
          softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/${sessId}`;
          targetSessionIdentifier = sessId;
        } else {
          sessionCreateError = `Session ID tidak valid: ${sessId}`;
          boothFlow.sessionId = null;
        }
      } catch (err) {
        sessionCreateError = String(err);
        console.error('[V1Complete] Failed to create transaction session online, using local code:', err);
        boothFlow.sessionId = null;
      }
    } else {
      boothFlow.sessionId = null;
    }

    qrDataUrl = await QRCode.toDataURL(softfileUrl, { margin: 1, width: 200 }).catch(() => '');

    if (selectedTemplate) {
      try {
        compositeUrl = await compositeTemplateImage(
          selectedTemplate,
          effectivePhotos,
          boothFlow.selectedFilterId,
          softfileUrl,
          boothFlow.stickers
        );
        boothFlow.compositeStripUrl = compositeUrl;
      } catch (err) {
        console.error('Failed to composite template:', err);
      }
    }

    let assetResult: SaveSessionAssetsResult | null = null;
    try {
      isSavingSession = true;
      assetResult = await saveSessionAssets(
        boothId,
        targetSessionIdentifier,
        compositeUrl,
        selectedTemplate?.width || 1200,
        selectedTemplate?.height || 1800,
        (selectedTemplate?.design_data || []).filter((l) => !l.isBackground && !l.isQr),
        selectedTemplate?.frame_image_url || selectedTemplate?.design_data?.find((l) => l.isBackground)?.imageUrl,
        effectivePhotos,
        [...boothFlow.liveviewClips],
        boothFlow.sessionCode,
        selectedTemplate,
        softfileUrl
      );

      // Programmatic Auto-Print Flow
      const copies = boothFlow.printQty || 1;
      const { useSecondary, paperSize } = resolvePrinterConfigForTemplate(selectedTemplate);
      const dateStr = new Date().toISOString().slice(0, 10);
      const boothSanitized = (uiConfig.config.boothName || 'booth')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const diskPath = `${dateStr}/${localSessionCode}_${boothSanitized}/composite/print_strip.jpg`;

      if (copies > 0 && compositeUrl) {
        await printerStore.refreshStatus();
        const check = printerStore.canPrint(copies, useSecondary);
        if (check.ok) {
          printStatus = 'PRINTING';
          try {
            const res = await fetch(compositeUrl);
            const buf = new Uint8Array(await res.arrayBuffer());
            await printerStore.printFromBuffer(buf, {
              copies,
              paper_size: paperSize,
              quality: 'standard',
              useSecondary,
            });
            printAbortController = new AbortController();
            const activeSignal = printAbortController.signal;
            void printerStore
              .waitForPrintCompletion({
                copies,
                useSecondary,
                signal: activeSignal,
              })
              .then((result) => {
                if (activeSignal.aborted) return;
                if (result.completed) {
                  printStatus = 'SUCCESS';
                } else {
                  console.warn('[V1Complete] Print completion check reported issue:', result.error);
                }
              });
          } catch (err) {
            console.warn('[V1Complete] Direct print failed, fallback enqueueing:', err);
            await enqueuePrintJob({
              sessionCode: localSessionCode,
              imagePath: diskPath,
              copies,
              paperSize,
              useSecondary,
            });
            printStatus = 'QUEUED';
          }
        } else {
          console.warn('[V1Complete] Printer check failed, enqueueing job:', check.reason);
          await enqueuePrintJob({
            sessionCode: localSessionCode,
            imagePath: diskPath,
            copies,
            paperSize,
            useSecondary,
          });
          printStatus = 'QUEUED';
        }
      }
    } catch (err) {
      console.error('Failed to save session assets:', err);
    } finally {
      isSavingSession = false;
      const sCode = boothFlow.sessionCode || localSessionCode;
      const isSyncedOnline = Boolean(isValidUUID(boothFlow.sessionId) && assetResult?.compositeUploaded);
      const syncError = isSyncedOnline
        ? null
        : assetResult?.lastUploadError ||
          sessionCreateError ||
          (!networkStatus.isOnline ? 'Booth sedang offline saat sesi selesai' : 'Gagal unggah softfile ke server');

      void upsertSessionOutboxJob(
        sCode,
        {
          boothId,
          categoryId: selectedTemplate?.category_id ?? null,
          frameId: frameConfigId,
          printQty: boothFlow.printQty,
          paymentMethod: boothFlow.paymentMethod === 'Ticket' ? 'Ticket' : 'Cash',
          softfileTarget: null,
          localSessionCode: sCode,
          backendSessionId: isValidUUID(boothFlow.sessionId) ? boothFlow.sessionId! : undefined,
          assetRelativePaths: buildAssetRelativePaths(
            sCode,
            uiConfig.config.boothName,
            effectivePhotos.length,
            selectedTemplate?.width || 1200,
            selectedTemplate?.height || 1800
          ),
        },
        {
          status: isSyncedOnline ? 'done' : 'pending',
          lastError: syncError,
        }
      ).catch(console.warn);
    }
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (printAbortController) printAbortController.abort();
  });

  let sendError = $state('');

  async function enqueueSoftfileJob(target: string) {
    const sCode = boothFlow.sessionCode || generateSessionCode(uiConfig.config.boothName);
    const effectiveCount = (photos.length > 0 ? photos : boothFlow.photosTaken).length;
    await upsertSessionOutboxJob(
      sCode,
      {
        boothId: await requireActiveBoothId().catch(() => 'default'),
        categoryId: selectedTemplate?.category_id ?? null,
        frameId: frameConfigId,
        printQty: boothFlow.printQty,
        paymentMethod: boothFlow.paymentMethod === 'Ticket' ? 'Ticket' : 'Cash',
        softfileTarget: target,
        localSessionCode: sCode,
        backendSessionId: isValidUUID(boothFlow.sessionId) ? boothFlow.sessionId! : undefined,
        assetRelativePaths: buildAssetRelativePaths(
          sCode,
          uiConfig.config.boothName,
          effectiveCount,
          selectedTemplate?.width || 1200,
          selectedTemplate?.height || 1800
        ),
      },
      { status: 'pending' }
    );
    softfileQueued = true;
    emailSent = target === email.trim();
    waSent = target === phone.trim();
  }

  async function handleSendEmail() {
    if (!email.trim() || emailSent) return;
    sendError = '';

    if (!networkStatus.isOnline || !isValidUUID(boothFlow.sessionId)) {
      await enqueueSoftfileJob(email.trim());
      return;
    }

    const ok = await sendSoftfileEmail(
      email,
      (success) => {
        if (success) {
          emailSent = true;
          activeKbTarget = null;
          kbOpen = false;
        }
      },
      boothFlow.sessionId ?? undefined
    );
    if (!ok && !emailSent) {
      sendError = 'Gagal mengirim Email. Periksa konfigurasi SMTP / App Password.';
      setTimeout(() => (sendError = ''), 4000);
    }
  }

  async function handleSendWA() {
    if (!phone.trim() || waSent) return;
    sendError = '';

    if (!networkStatus.isOnline || !isValidUUID(boothFlow.sessionId)) {
      await enqueueSoftfileJob(phone.trim());
      return;
    }

    const ok = await sendSoftfileWA(
      phone,
      (success) => {
        if (success) {
          waSent = true;
          activeKbTarget = null;
          kbOpen = false;
        }
      },
      boothFlow.sessionId ?? undefined
    );
    if (!ok && !waSent) {
      sendError = 'Gagal mengirim WhatsApp. Periksa token Fonnte & format nomor WA.';
      setTimeout(() => (sendError = ''), 4000);
    }
  }

  const ROWS_ALPHA = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫']
  ];
  const ROWS_NUM = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['-', '_', '.', '@', '#', '!', '&', '*', '(', ')'],
    ['ABC', '/', '\\', ':', ';', "'", '"', ',', '⌫']
  ];

  let currentKbRows = $derived(numMode ? ROWS_NUM : ROWS_ALPHA);

  function pressKey(key: string) {
    if (activeKbTarget === 'phone') {
      if (key === '⌫') {
        phone = phone.slice(0, -1);
        return;
      }
      if (key === 'SHIFT') {
        caps = !caps;
        return;
      }
      if (key === 'ABC') {
        numMode = false;
        return;
      }
      if (key === '123') {
        numMode = true;
        return;
      }
      phone += key;
    } else {
      if (key === '⌫') {
        email = email.slice(0, -1);
        return;
      }
      if (key === 'SHIFT') {
        caps = !caps;
        return;
      }
      if (key === 'ABC') {
        numMode = false;
        return;
      }
      if (key === '123') {
        numMode = true;
        return;
      }
      const ch = caps && !numMode ? key.toUpperCase() : key;
      email = email + ch;
      if (caps) caps = false;
    }
  }

  const DEFAULT_BG = '#0d0d0d';
  let effectiveBg = $derived(
    background ?? uiConfig.getStepStyle('download').background ?? uiConfig.getStepStyle('softfile').background ?? DEFAULT_BG
  );
</script>

<div
  class="w-full h-full flex flex-col items-center justify-center select-none relative overflow-hidden text-[#e6e1e5]"
  style:background={effectiveBg}
  style:font-family="'Poppins', sans-serif"
>
  <!-- Timer pill -->
  <div class="absolute top-6 right-6 -translate-x-1/2 flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white/80 rounded-full px-5 py-2.5 text-sm font-semibold border border-white/10 z-10">
    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6h4.5" stroke-linecap="round" />
    </svg>
    {formatTime(secs)}
  </div>

  <!-- Main content -->
  <div
    class="flex items-center gap-10 transition-transform duration-300"
    style="transform: {kbOpen ? 'translateY(-120px)' : 'translateY(0)'};"
  >
    <!-- Left: composited photo frame mockup with Toggle -->
    <div class="flex flex-col items-center shrink-0">
      <div
        class="flex flex-col overflow-hidden bg-[#1a1a1a] border-[3px] border-[#e8e8e8] rounded-[24px] w-[280px] xl:w-[320px] max-w-[85vw] shadow-[0_24px_64px_rgba(0,0,0,0.7)]"
      >
        <div class="p-3 bg-[#111] flex items-center justify-center min-h-[380px]">
          {#if activePreviewTab === 'strip'}
            {#if compositeUrl}
              <img
                src={compositeUrl}
                alt="Hasil Foto Template"
                class="w-full h-auto max-h-[60vh] object-contain rounded-xl block shadow-md"
              />
            {:else}
              <div class="w-[200px] h-[300px] flex flex-col items-center justify-center gap-2 text-white/30 text-xs">
                <div class="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <span>Memproses Foto...</span>
              </div>
            {/if}
          {:else if activePreviewTab === 'gif'}
            {#if boothFlow.sessionGifUrl}
              <img
                src={boothFlow.sessionGifUrl}
                alt="GIF Sesi Foto"
                class="w-full h-auto max-h-[60vh] object-contain rounded-xl block shadow-md"
              />
            {:else if boothFlow.isGeneratingGif}
              <div class="w-[200px] h-[300px] flex flex-col items-center justify-center gap-2 text-white/30 text-xs">
                <div class="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <span>Memproses GIF...</span>
              </div>
            {:else}
              <div class="w-[200px] h-[300px] flex flex-col items-center justify-center gap-2 text-white/30 text-xs p-4 text-center">
                <Film size={28} class="opacity-40" />
                <span>GIF tidak tersedia</span>
              </div>
            {/if}
          {:else if activePreviewTab === 'liveview'}
            {#if boothFlow.sessionVideoUrl}
              <video
                src={boothFlow.sessionVideoUrl}
                autoplay
                loop
                muted
                playsinline
                class="w-full h-auto max-h-[60vh] object-contain rounded-xl block shadow-md"
              ></video>
            {:else if boothFlow.isGeneratingVideo}
              <div class="w-[200px] h-[300px] flex flex-col items-center justify-center gap-2 text-white/30 text-xs">
                <div class="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <span>Memproses Live View...</span>
              </div>
            {:else}
              <div class="w-[200px] h-[300px] flex flex-col items-center justify-center gap-2 text-white/30 text-xs p-4 text-center">
                <Video size={28} class="opacity-40" />
                <span>Live View tidak tersedia</span>
              </div>
            {/if}
          {/if}
        </div>
      </div>

      <!-- Toggle buttons below card preview -->
      <div class="mt-4 flex items-center gap-1.5 p-1 bg-white/10 backdrop-blur-md rounded-full border border-white/10 shadow-lg">
        <button
          type="button"
          onclick={() => (activePreviewTab = 'strip')}
          class="px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all {activePreviewTab === 'strip' ? 'bg-white text-black shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'}"
        >
          <Image size={14} />
          <span>Strip</span>
        </button>
        <button
          type="button"
          onclick={() => (activePreviewTab = 'gif')}
          class="px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all {activePreviewTab === 'gif' ? 'bg-white text-black shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'}"
        >
          <Film size={14} />
          <span>GIF</span>
        </button>
        <button
          type="button"
          onclick={() => (activePreviewTab = 'liveview')}
          class="px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all {activePreviewTab === 'liveview' ? 'bg-white text-black shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'}"
        >
          <Video size={14} />
          <span>Live View</span>
        </button>
      </div>
    </div>

    <!-- Right: cards -->
    <div class="flex flex-col gap-4 w-[340px]">
      <div class="rounded-2xl p-6 flex flex-col gap-4 bg-white text-gray-900 shadow-xl">
        {#if sent}
          <div class="flex flex-col items-center gap-3">
            <div class="flex items-center gap-2 w-full">
              <div class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shrink-0 text-white font-bold">
                ✓
              </div>
              <div>
                <p class="font-black text-[#111] text-sm leading-tight m-0">Softfile Dikirim!</p>
                <p class="text-[#888] text-[11px] leading-tight truncate max-w-[220px] m-0">{email}</p>
              </div>
            </div>
            <div class="w-full h-px bg-gray-100"></div>
            <p class="text-[11px] text-gray-400 font-semibold tracking-wider uppercase m-0">Scan untuk Download</p>
            <div class="p-3 rounded-2xl bg-white border border-gray-100 flex items-center justify-center">
              {#if qrDataUrl}
                <img src={qrDataUrl} alt="Softfile QR Code" class="w-[140px] h-[140px] object-contain" />
              {:else}
                <div class="w-[140px] h-[140px] flex items-center justify-center text-gray-400 text-xs">Loading QR...</div>
              {/if}
            </div>
            <p class="text-[10px] text-gray-400 text-center m-0">
              File tersedia 30 hari. Scan dengan kamera HP kamu.
            </p>
          </div>
        {:else}
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center shrink-0 text-white">
              <Send size={16} />
            </div>
            <div>
              <p class="font-black text-[#111] text-base leading-tight m-0">Download Softfile</p>
              <p class="text-[#888] text-[12px] leading-tight mt-0.5 m-0">Pilih metode pengiriman file</p>
            </div>
          </div>

          {#if !networkStatus.isOnline}
            <div class="mt-1">
              <OfflineBanner message="Sedang offline — softfile akan otomatis dikirim setelah koneksi pulih." />
            </div>
          {:else if softfileQueued}
            <div class="text-xs text-amber-600 font-semibold mt-1">Menunggu koneksi pulih untuk mengirim softfile…</div>
          {/if}

          {#if qrDataUrl}
            <div class="p-2 rounded-xl border border-gray-100 bg-gray-50 flex flex-col items-center justify-center">
              <img src={qrDataUrl} alt="Softfile QR Code" class="w-[130px] h-[130px] object-contain" />
              <p class="text-[10px] text-gray-400 text-center font-semibold mt-1 m-0">Scan dengan kamera HP</p>
            </div>
          {/if}

          <!-- Form Email (Jika Aktif di Admin Dashboard) -->
          {#if emailEnabled}
            <div class="flex flex-col gap-1.5 w-full">
              <div class="flex items-center justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <span>Email</span>
                {#if emailSent}
                  <span class="text-green-600 font-bold">
                    {networkStatus.isOnline ? '✓ Terkirim' : '⏳ Menunggu Koneksi'}
                  </span>
                {/if}
              </div>
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={() => { activeKbTarget = 'email'; kbOpen = true; numMode = false; }}
                  class="flex-1 rounded-xl px-3 py-2.5 text-xs cursor-text border-2 text-left bg-[#f2f2f2] truncate"
                  style="border-color: {activeKbTarget === 'email' && kbOpen ? '#2563eb' : 'transparent'};"
                >
                  {email || 'nama@email.com'}
                </button>
                <button
                  type="button"
                  onclick={handleSendEmail}
                  disabled={!email.trim() || emailSent}
                  class="px-3 py-2.5 rounded-xl text-xs font-bold transition-all border-0 shrink-0"
                  style="
                    background: {email.trim() && !emailSent ? '#111' : '#e0e0e0'};
                    color: {email.trim() && !emailSent ? '#fff' : '#999'};
                    cursor: {email.trim() && !emailSent ? 'pointer' : 'default'};
                  "
                >
                  {emailSent ? (networkStatus.isOnline ? 'Terkirim' : 'Menunggu Koneksi') : 'Kirim Email'}
                </button>
              </div>
            </div>
          {/if}

          <!-- Form WhatsApp (Jika Aktif di Admin Dashboard) -->
          {#if whatsappEnabled}
            <div class="flex flex-col gap-1.5 w-full">
              <div class="flex items-center justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <span>WhatsApp</span>
                {#if waSent}
                  <span class="text-green-600 font-bold">
                    {networkStatus.isOnline ? '✓ Terkirim' : '⏳ Menunggu Koneksi'}
                  </span>
                {/if}
              </div>
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={() => { activeKbTarget = 'phone'; kbOpen = true; numMode = true; }}
                  class="flex-1 rounded-xl px-3 py-2.5 text-xs cursor-text border-2 text-left bg-[#f2f2f2] truncate"
                  style="border-color: {activeKbTarget === 'phone' && kbOpen ? '#2563eb' : 'transparent'};"
                >
                  {phone || '08123456789'}
                </button>
                <button
                  type="button"
                  onclick={handleSendWA}
                  disabled={!phone.trim() || waSent}
                  class="px-3 py-2.5 rounded-xl text-xs font-bold transition-all border-0 shrink-0"
                  style="
                    background: {phone.trim() && !waSent ? '#16a34a' : '#e0e0e0'};
                    color: {phone.trim() && !waSent ? '#fff' : '#999'};
                    cursor: {phone.trim() && !waSent ? 'pointer' : 'default'};
                  "
                >
                  {waSent ? (networkStatus.isOnline ? 'Terkirim' : 'Menunggu Koneksi') : 'Kirim WA'}
                </button>
              </div>
            </div>
          {/if}

          {#if sendError}
            <p class="text-[11px] text-red-500 font-bold m-0 mt-1">{sendError}</p>
          {/if}
        {/if}
      </div>

      <!-- Print status card -->
      <div class="rounded-2xl px-5 py-4 flex items-center gap-4 bg-[#1c1c1e] border border-[#2a2a2a]">
        <div class="w-11 h-11 rounded-full {printStatus === 'SUCCESS' ? 'bg-green-500/20 text-green-400' : printStatus === 'QUEUED' ? 'bg-amber-500/20 text-amber-400' : 'bg-[#2a2a2a] text-white/80'} flex items-center justify-center shrink-0">
          {#if printStatus === 'SUCCESS'}
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          {:else}
            <Printer size={20} />
          {/if}
        </div>
        <div>
          {#if printStatus === 'SUCCESS'}
            <p class="text-white font-bold text-sm leading-tight m-0">Fotomu berhasil dicetak!</p>
            <p class="text-green-400 text-[12px] mt-0.5 m-0">Silakan ambil fotomu di tray printer.</p>
          {:else if printStatus === 'QUEUED'}
            <p class="text-white font-bold text-sm leading-tight m-0">Foto masuk antrean cetak</p>
            <p class="text-amber-400 text-[12px] mt-0.5 m-0">Akan otomatis dicetak saat printer terhubung.</p>
          {:else}
            <p class="text-white font-bold text-sm leading-tight m-0">Fotomu sedang dicetak</p>
            <p class="text-white/40 text-[12px] mt-0.5 m-0">Harap tunggu beberapa saat lagi...</p>
          {/if}
        </div>
      </div>

      <!-- Selesai button -->
      <button
        onclick={() => {
          kbOpen = false;
          onNewSession();
        }}
        class="w-full py-4 rounded-2xl font-bold text-base tracking-wide bg-[#1c1c1e] text-white border border-[#333] cursor-pointer hover:bg-[#2a2a2a]"
      >
        Selesai
      </button>
    </div>
  </div>

  <!-- On-Screen Keyboard -->
  {#if kbOpen}
    <div
      class="absolute bottom-0 left-0 right-0 flex flex-col gap-2 px-3 pb-4 pt-3 z-50 bg-[rgba(20,20,20,0.97)] backdrop-blur-md border-t border-white/10"
    >
      {#each currentKbRows as row, ri}
        <div class="flex gap-1.5 w-full">
          {#each row as key}
            {@const isSpecial = key === 'SHIFT' || key === '⌫' || key === 'ABC' || key === '123'}
            {@const isShiftActive = key === 'SHIFT' && caps}
            <button
              onpointerdown={(e) => {
                e.preventDefault();
                pressKey(key);
              }}
              class="rounded-lg flex items-center justify-center font-semibold transition-all select-none border-0"
              style="
                height: 50px;
                flex: {isSpecial ? '0 0 9%' : '1 1 0'};
                background: {isShiftActive ? '#ffffff' : isSpecial ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)'};
                color: {isShiftActive ? '#111' : '#fff'};
                font-size: {key === '⌫' ? '14px' : '17px'};
              "
            >
              {#if key === '⌫'}
                <Delete size={16} />
              {:else}
                {caps && !numMode && key.length === 1 ? key.toUpperCase() : key}
              {/if}
            </button>
          {/each}
        </div>
      {/each}

      <div class="flex w-full gap-1.5">
        <button
          onpointerdown={(e) => {
            e.preventDefault();
            numMode = !numMode;
          }}
          class="rounded-lg flex items-center justify-center font-semibold text-white border-0 bg-white/12 text-sm"
          style="height: 50px; flex: 0 0 9%;"
        >
          {numMode ? 'ABC' : '123'}
        </button>

        <button
          onpointerdown={(e) => {
            e.preventDefault();
            email = email + ' ';
          }}
          class="rounded-lg flex-1 flex items-center justify-center text-white border-0 bg-white/18 text-sm"
          style="height: 50px;"
        >
          spasi
        </button>

        {#each ['@', '.'] as ch}
          <button
            onpointerdown={(e) => {
              e.preventDefault();
              email = email + ch;
            }}
            class="rounded-lg flex items-center justify-center font-bold text-white border-0 bg-white/18 text-lg"
            style="height: 50px; flex: 0 0 7%;"
          >
            {ch}
          </button>
        {/each}

        <button
          onpointerdown={(e) => {
            e.preventDefault();
            kbOpen = false;
          }}
          class="rounded-lg flex items-center justify-center font-bold text-white border-0 bg-blue-600 text-sm"
          style="height: 50px; flex: 0 0 12%;"
        >
          Selesai
        </button>
      </div>
    </div>
  {/if}
</div>
