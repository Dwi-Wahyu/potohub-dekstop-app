<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import QRCode from 'qrcode';
  import { Printer, Delete, Film, Video } from '@lucide/svelte';
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
  import { enqueueOutboxJob, enqueuePrintJob, upsertSessionOutboxJob, updateSessionPrintStatus } from '$lib/db/local';
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

    // 1. Catat sesi ke database lokal dan picu cetak instan (< 1s)
    const copies = boothFlow.printQty || 1;
    const { useSecondary, paperSize } = resolvePrinterConfigForTemplate(selectedTemplate);
    const dateStr = new Date().toISOString().slice(0, 10);
    const boothSanitized = (uiConfig.config.boothName || 'booth')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const diskPath = `${dateStr}/${localSessionCode}_${boothSanitized}/composite/print_strip.jpg`;

    const sessionPayload = {
      boothId,
      categoryId: selectedTemplate?.category_id ?? null,
      frameId: frameConfigId,
      printQty: copies,
      paperSize,
      useSecondary,
      paymentMethod: (boothFlow.paymentMethod === 'Ticket' ? 'Ticket' : 'Cash') as 'Ticket' | 'Cash',
      softfileTarget: null,
      localSessionCode,
      backendSessionId: isValidUUID(boothFlow.sessionId) ? boothFlow.sessionId! : undefined,
      assetRelativePaths: buildAssetRelativePaths(
        localSessionCode,
        uiConfig.config.boothName,
        effectivePhotos.length,
        selectedTemplate?.width || 1200,
        selectedTemplate?.height || 1800
      ),
      printStatus: (copies === 0 ? 'printed' : 'pending') as 'printed' | 'pending' | 'failed',
      printError: null as string | null,
    };

    // Segera catat sesi ke database outbox lokal agar operator bisa melihatnya di dialog sesi
    void upsertSessionOutboxJob(localSessionCode, sessionPayload, { status: 'pending' }).catch(console.warn);

    if (copies > 0 && compositeUrl) {
      void (async () => {
        await printerStore.refreshStatus();
        const check = printerStore.canPrint(copies, useSecondary);
        if (check.ok) {
          printStatus = 'PRINTING';
          try {
            const res = await fetch(compositeUrl!);
            const buf = new Uint8Array(await res.arrayBuffer());
            await printerStore.printFromBuffer(buf, {
              copies,
              paper_size: paperSize,
              quality: 'standard',
              useSecondary,
            });
            printAbortController = new AbortController();
            const activeSignal = printAbortController.signal;
            const result = await printerStore.waitForPrintCompletion({
              copies,
              useSecondary,
              signal: activeSignal,
            });
            if (!activeSignal.aborted) {
              printStatus = 'SUCCESS';
              sessionPayload.printStatus = 'printed';
              sessionPayload.printError = null;
              void updateSessionPrintStatus(localSessionCode, 'printed').catch(console.warn);
              if (!result.completed && result.error) {
                console.warn('[V1Complete] Print completion check warning:', result.error);
              }
            }
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
            sessionPayload.printStatus = 'failed';
            sessionPayload.printError = String(err);
            void updateSessionPrintStatus(localSessionCode, 'failed', String(err)).catch(console.warn);
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
          sessionPayload.printStatus = 'failed';
          sessionPayload.printError = check.reason || null;
          void updateSessionPrintStatus(localSessionCode, 'failed', check.reason).catch(console.warn);
        }
      })();
    }

    // 2. Pembuatan Aset Sesi (Liveview Video, GIF, dan Upload R2) berjalan di Latar Belakang (Non-blocking)
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
        sessionPayload,
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

  const DEFAULT_BG = '#121114';
  let effectiveBg = $derived(
    background ?? uiConfig.getStepStyle('download').background ?? uiConfig.getStepStyle('softfile').background ?? DEFAULT_BG
  );
  let accent = $derived(uiConfig.config.primaryColor);
  let validEmail = $derived(/^\S+@\S+\.\S+$/.test(email.trim()));

  const PREVIEW_TABS = [
    { id: 'strip', label: 'Strip' },
    { id: 'gif', label: 'GIF' },
    { id: 'liveview', label: 'Live view' }
  ] as const;
</script>

<div
  class="w-full h-full flex flex-col select-none relative overflow-hidden"
  style:background={effectiveBg}
  style:font-family="'Poppins', sans-serif"
>
  <!-- Header -->
  <header class="flex items-center justify-between px-8 pt-6 shrink-0">
    <span class="text-white text-xl italic font-semibold font-['Playfair_Display',Georgia,serif]">
      {uiConfig.config.boothName}
    </span>
    <div class="flex items-center gap-2.5 bg-white rounded-xl pl-2 pr-4 py-1.5 shadow-lg">
      <span class="w-8 h-8 rounded-lg flex items-center justify-center text-white" style:background={accent}>
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path d="M10 2h4M12 14l3-3M12 22a8 8 0 100-16 8 8 0 000 16z" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <span class="flex flex-col leading-none">
        <span class="text-[9px] font-medium text-[#555]">Sisa waktu</span>
        <span class="text-lg font-bold text-[#111] tabular-nums">{formatTime(secs)}</span>
      </span>
    </div>
  </header>

  <main
    class="flex-1 min-h-0 flex items-center justify-center px-8 py-5 transition-transform duration-300"
    style="transform: {kbOpen ? 'translateY(-120px)' : 'translateY(0)'};"
  >
    <div class="w-full max-w-[860px] h-full max-h-[520px] rounded-3xl overflow-hidden grid grid-cols-[1.4fr_1fr] shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
      <!-- Left: result -->
      <section class="bg-[#1b1a1f] p-5 flex flex-col gap-3 min-h-0">
        <div class="flex items-center justify-between">
          <h2 class="m-0 text-white font-bold text-sm">Hasil fotomu</h2>
          <div class="flex items-center gap-1 bg-white/5 rounded-xl p-1">
            {#each PREVIEW_TABS as t}
              <button
                type="button"
                onclick={() => (activePreviewTab = t.id)}
                class="text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-colors border-none cursor-pointer {activePreviewTab === t.id ? 'bg-white text-[#111]' : 'bg-transparent text-white/70 hover:text-white'}"
              >
                {t.label}
              </button>
            {/each}
          </div>
        </div>

        <div class="flex-1 min-h-0 rounded-2xl bg-[#121114] flex items-center justify-center p-4">
          {#if activePreviewTab === 'strip'}
            {#if compositeUrl}
              <img src={compositeUrl} alt="Hasil Foto Template" class="max-w-full max-h-full object-contain rounded-sm block shadow-2xl" />
            {:else}
              <div class="flex flex-col items-center justify-center gap-2 text-white/65 text-xs">
                <div class="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <span>Memproses Foto...</span>
              </div>
            {/if}
          {:else if activePreviewTab === 'gif'}
            {#if boothFlow.sessionGifUrl}
              <img src={boothFlow.sessionGifUrl} alt="GIF Sesi Foto" class="max-w-full max-h-full object-contain rounded-lg block shadow-2xl" />
            {:else if boothFlow.isGeneratingGif}
              <div class="flex flex-col items-center justify-center gap-2 text-white/65 text-xs">
                <div class="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <span>Memproses GIF...</span>
              </div>
            {:else}
              <div class="flex flex-col items-center justify-center gap-2 text-white/65 text-xs text-center">
                <Film size={28} class="opacity-60" />
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
                class="max-w-full max-h-full object-contain rounded-lg block shadow-2xl"
              ></video>
            {:else if boothFlow.isGeneratingVideo}
              <div class="flex flex-col items-center justify-center gap-2 text-white/65 text-xs">
                <div class="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <span>Memproses Live View...</span>
              </div>
            {:else}
              <div class="flex flex-col items-center justify-center gap-2 text-white/65 text-xs text-center">
                <Video size={28} class="opacity-60" />
                <span>Live View tidak tersedia</span>
              </div>
            {/if}
          {/if}
        </div>
      </section>

      <!-- Right: actions -->
      <section class="bg-[#f6f4ef] p-5 flex flex-col gap-3 min-h-0 overflow-y-auto">
        <!-- Status cetak -->
        <div
          class="flex items-center gap-3 rounded-xl p-3 {printStatus === 'SUCCESS'
            ? 'bg-[#e3f1e6]'
            : printStatus === 'QUEUED'
              ? 'bg-[#fdf3dc]'
              : 'bg-[#ebe8e1]'}"
        >
          <span
            class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white {printStatus === 'SUCCESS'
              ? 'bg-[#2f9e4f]'
              : printStatus === 'QUEUED'
                ? 'bg-[#c08a12]'
                : 'bg-[#555]'}"
          >
            {#if printStatus === 'SUCCESS'}
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" /></svg>
            {:else}
              <Printer size={16} />
            {/if}
          </span>
          <div>
            {#if printStatus === 'SUCCESS'}
              <p class="m-0 text-[#111] text-xs font-bold leading-tight">Fotomu sudah dicetak</p>
              <p class="m-0 text-[#3a5a42] text-[10px] leading-tight">Ambil di tray printer, bawah booth.</p>
            {:else if printStatus === 'QUEUED'}
              <p class="m-0 text-[#111] text-xs font-bold leading-tight">Foto masuk antrean cetak</p>
              <p class="m-0 text-[#6b4e0a] text-[10px] leading-tight">Akan otomatis dicetak saat printer terhubung.</p>
            {:else}
              <p class="m-0 text-[#111] text-xs font-bold leading-tight">Fotomu sedang dicetak</p>
              <p class="m-0 text-[#555] text-[10px] leading-tight">Harap tunggu beberapa saat lagi...</p>
            {/if}
          </div>
        </div>

        {#if !networkStatus.isOnline}
          <OfflineBanner message="Sedang offline — softfile akan otomatis dikirim setelah koneksi pulih." />
        {:else if softfileQueued}
          <p class="m-0 text-[10px] text-[#8a5a00] font-semibold">Menunggu koneksi pulih untuk mengirim softfile…</p>
        {/if}

        <!-- Softfile QR -->
        <p class="m-0 text-[#111] text-xs font-bold">Simpan softfile</p>
        <div class="flex flex-col items-center gap-1.5">
          <div class="p-2.5 rounded-xl bg-white border border-[#e5e5e5]">
            {#if qrDataUrl}
              <img src={qrDataUrl} alt="Softfile QR Code" class="w-[112px] h-[112px] object-contain block" />
            {:else}
              <div class="w-[112px] h-[112px] flex items-center justify-center text-[#555] text-[10px]">Memuat QR...</div>
            {/if}
          </div>
          <p class="m-0 text-[10px] text-[#555] text-center leading-snug">
            Scan pakai kamera HP. Berisi foto, GIF, dan live view.
          </p>
        </div>

        <!-- Email -->
        {#if emailEnabled}
          <div class="flex flex-col gap-1.5">
            <p class="m-0 text-[#111] text-[10px] font-semibold">Atau kirim ke email</p>
            {#if emailSent}
              <div class="flex items-center gap-2 rounded-lg bg-[#e3f1e6] px-3 py-2.5 text-[11px] text-[#1f5d33] font-semibold">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" /></svg>
                <span class="truncate">{networkStatus.isOnline ? 'Terkirim ke' : 'Menunggu koneksi ·'} {email}</span>
              </div>
            {:else}
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={() => { activeKbTarget = 'email'; kbOpen = true; numMode = false; }}
                  class="flex-1 min-w-0 rounded-lg px-3 py-2.5 text-[11px] cursor-text bg-white border text-left truncate"
                  style:color={email ? '#111' : '#777'}
                  style:border-color={activeKbTarget === 'email' && kbOpen ? accent : '#e0e0e0'}
                >
                  {email || 'nama@email.com'}
                </button>
                <button
                  type="button"
                  onclick={handleSendEmail}
                  disabled={!validEmail}
                  class="px-4 rounded-lg text-[11px] font-bold transition-colors border-none"
                  style:background={validEmail ? '#121114' : '#dcdcdc'}
                  style:color={validEmail ? '#fff' : '#666'}
                  style:cursor={validEmail ? 'pointer' : 'default'}
                >
                  Kirim
                </button>
              </div>
            {/if}
          </div>
        {/if}

        <!-- WhatsApp (fitur tambahan di luar Figma, aktif lewat admin dashboard) -->
        {#if whatsappEnabled}
          <div class="flex flex-col gap-1.5">
            <p class="m-0 text-[#111] text-[10px] font-semibold">Atau kirim ke WhatsApp</p>
            {#if waSent}
              <div class="flex items-center gap-2 rounded-lg bg-[#e3f1e6] px-3 py-2.5 text-[11px] text-[#1f5d33] font-semibold">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" /></svg>
                <span class="truncate">{networkStatus.isOnline ? 'Terkirim ke' : 'Menunggu koneksi ·'} {phone}</span>
              </div>
            {:else}
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={() => { activeKbTarget = 'phone'; kbOpen = true; numMode = true; }}
                  class="flex-1 min-w-0 rounded-lg px-3 py-2.5 text-[11px] cursor-text bg-white border text-left truncate"
                  style:color={phone ? '#111' : '#777'}
                  style:border-color={activeKbTarget === 'phone' && kbOpen ? accent : '#e0e0e0'}
                >
                  {phone || '08123456789'}
                </button>
                <button
                  type="button"
                  onclick={handleSendWA}
                  disabled={!phone.trim()}
                  class="px-4 rounded-lg text-[11px] font-bold transition-colors border-none"
                  style:background={phone.trim() ? '#121114' : '#dcdcdc'}
                  style:color={phone.trim() ? '#fff' : '#666'}
                  style:cursor={phone.trim() ? 'pointer' : 'default'}
                >
                  Kirim
                </button>
              </div>
            {/if}
          </div>
        {/if}

        {#if sendError}
          <p class="m-0 text-[10px] text-[#b42318] font-bold">{sendError}</p>
        {/if}

        <button
          onclick={() => {
            kbOpen = false;
            onNewSession();
          }}
          class="mt-auto w-full py-3.5 rounded-xl font-bold text-sm active:scale-[0.98] transition-all border-none cursor-pointer text-white bg-[#121114] hover:bg-[#252329] shrink-0 shadow-sm"
        >
          Selesai
        </button>
      </section>
    </div>
  </main>

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
