<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import QRCode from 'qrcode';
  import {
    GenericScreen,
    type AdapterTemplate,
    type DesignBlocksDocument,
    type SoftfilePreviewTab,
  } from '@potohub/booth-ui';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import {
    sendSoftfileEmail,
    sendSoftfileWA,
    resolvePrinterConfigForTemplate,
    generateSessionCode,
  } from '$lib/utils/shared';
  import { compositeTemplateImage } from '$lib/utils/templateComposite';
  import { saveSessionAssets, type SaveSessionAssetsResult } from '$lib/utils/sessionAssets';
  import { cachedFetch } from '$lib/utils/offlineCache';
  import {
    fetchTemplates,
    createTransactionSession,
    requireActiveBoothId,
    isValidUUID,
    type BoothTemplate,
  } from '$lib/api/boothClient';
  import { networkStatus } from '$lib/stores/networkStatus.svelte';
  import {
    enqueuePrintJob,
    upsertSessionOutboxJob,
    updateSessionPrintStatus,
  } from '$lib/db/local';
  import { printerStore, deductPaperCount } from '$lib/printer.svelte';
  import OfflineBanner from '$lib/components/shared/OfflineBanner.svelte';
  import OnScreenKeyboard from '$lib/components/shared/OnScreenKeyboard.svelte';
  import { buildAssetRelativePaths } from '$lib/utils/localSessionStorage';
  import { clearActiveCheckpoint } from '$lib/utils/activeSessionCheckpoint';
  import { createDesktopUiAdapter } from '$lib/adapters/boothUiAdapter.svelte';

  interface Props {
    doc: DesignBlocksDocument;
    photos?: string[];
    frameConfigId?: string;
    onDone: () => void;
  }

  let { doc, photos = [], frameConfigId = '', onDone }: Props = $props();

  let email = $state('');
  let phone = $state('');
  let emailSent = $state(false);
  let waSent = $state(false);
  let isSendingEmail = $state(false);
  let isSendingWa = $state(false);
  let sendError = $state('');
  let printStatus = $state<'IDLE' | 'PRINTING' | 'SUCCESS' | 'QUEUED'>('IDLE');
  let activeKbTarget = $state<'email' | 'phone' | null>(null);
  let kbOpen = $state(false);

  let secs = $state(5 * 60);
  let timer: ReturnType<typeof setInterval> | null = null;
  let printAbortController: AbortController | null = null;
  let qrDataUrl = $state('');
  let downloadUrl = $state('');
  let compositeUrl = $state<string | null>(null);
  let selectedTemplate = $state<BoothTemplate | null>(null);
  let activePreviewTab = $state<SoftfilePreviewTab>('strip');

  let activeLocalSessionCode = $state('');
  let activeBackendSessionId: string | null = null;

  const envs = import.meta.env as Record<string, string>;
  const rawSoftfileUrl =
    envs.SOFTFILE_BASE_URL ||
    envs.VITE_SOFTFILE_BASE_URL ||
    envs.ADMIN_DASHBOARD_URL ||
    envs.VITE_ADMIN_DASHBOARD_URL ||
    envs.PUBLIC_ADMIN_DASHBOARD_URL ||
    'http://localhost:3000';
  const ADMIN_DASHBOARD_PUBLIC_URL = rawSoftfileUrl.replace(/\/+$/, '');

  let sent = $derived(emailSent || waSent);
  let validEmail = $derived(/^\S+@\S+\.\S+$/.test(email.trim()));

  $effect(() => {
    if (sent && secs > (boothConfig.config.endScreenTimeSecs || 3)) {
      secs = boothConfig.config.endScreenTimeSecs || 3;
    }
  });

  onMount(async () => {
    timer = setInterval(() => {
      if (secs > 0) secs--;
      else {
        if (timer) clearInterval(timer);
        finishSession();
      }
    }, 1000);

    let boothId = 'default';
    try {
      boothId = await requireActiveBoothId();
    } catch (e) {
      console.error('[KioskSoftfileWrapper] Booth tidak aktif saat simpan sesi:', e);
    }

    try {
      await cachedFetch(
        `templates:${boothId}`,
        () => fetchTemplates(boothId),
        (templates) => {
          const targetId = frameConfigId || boothFlow.selectedFrameId;
          const matched = templates.find((t) => t.id === targetId);
          if (matched) {
            selectedTemplate = matched;
          } else if (templates.length > 0) {
            selectedTemplate = {
              ...templates[0],
              id: targetId || templates[0].id,
              paper_size: '4x6',
              use_secondary_printer: false,
            };
          } else {
            selectedTemplate = null;
          }
        },
      );
    } catch (err) {
      console.error('[KioskSoftfileWrapper] Failed to fetch template:', err);
    }

    const localSessionCode = generateSessionCode(uiConfig.config.boothName);
    activeLocalSessionCode = localSessionCode;
    boothFlow.sessionCode = localSessionCode;

    let softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/pending-${localSessionCode}`;
    let targetSessionIdentifier = localSessionCode;
    let sessionCreateError: string | null = null;
    const effectivePhotos = photos.length > 0 ? [...photos] : [...boothFlow.photosTaken];
    const targetFrameId = frameConfigId || boothFlow.selectedFrameId;

    if (isValidUUID(boothFlow.sessionId)) {
      const existingSessId = boothFlow.sessionId!;
      softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/${existingSessId}`;
      targetSessionIdentifier = existingSessId;
    } else if (networkStatus.isOnline && isValidUUID(boothId)) {
      try {
        const sessionMethod = boothFlow.paymentMethod === 'Cashless' ? 'Cashless' : 'Ticket';
        const session = await createTransactionSession(
          boothId,
          selectedTemplate?.category_id,
          boothFlow.printQty,
          sessionMethod,
          targetFrameId,
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
        boothFlow.sessionId = null;
      }
    } else {
      boothFlow.sessionId = null;
    }

    activeBackendSessionId = isValidUUID(boothFlow.sessionId) ? boothFlow.sessionId! : null;
    downloadUrl = softfileUrl;
    qrDataUrl = await QRCode.toDataURL(softfileUrl, { margin: 1, width: 220 }).catch(() => '');

    if (selectedTemplate) {
      try {
        compositeUrl = await compositeTemplateImage(
          selectedTemplate,
          effectivePhotos,
          boothFlow.selectedFilterId,
          softfileUrl,
          boothFlow.stickers,
        );
        boothFlow.compositeStripUrl = compositeUrl;
      } catch (err) {
        console.error('[KioskSoftfileWrapper] Failed to composite template:', err);
      }
    }

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
      frameId: targetFrameId,
      printQty: copies,
      paperSize,
      useSecondary,
      paymentMethod: (boothFlow.paymentMethod === 'Cashless' ? 'Cashless' : 'Ticket') as
        | 'Ticket'
        | 'Cashless',
      softfileTarget: null,
      localSessionCode,
      backendSessionId: activeBackendSessionId ?? undefined,
      assetRelativePaths: buildAssetRelativePaths(
        localSessionCode,
        uiConfig.config.boothName,
        effectivePhotos.length,
        selectedTemplate?.width || 1200,
        selectedTemplate?.height || 1800,
      ),
      printStatus: (copies === 0 ? 'printed' : 'pending') as 'printed' | 'pending' | 'failed',
      printError: null as string | null,
      uploadedRoles: [] as ('composite' | 'raw_photo' | 'gif' | 'video')[],
    };

    await upsertSessionOutboxJob(localSessionCode, sessionPayload, { status: 'pending' }).catch(
      console.warn,
    );
    void clearActiveCheckpoint();

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
            await printerStore.waitForPrintCompletion({
              copies,
              useSecondary,
              signal: activeSignal,
            });
            if (!activeSignal.aborted) {
              printStatus = 'SUCCESS';
              sessionPayload.printStatus = 'printed';
              sessionPayload.printError = null;
              deductPaperCount(copies);
              void updateSessionPrintStatus(localSessionCode, 'printed').catch(console.warn);
            }
          } catch (err) {
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
            void updateSessionPrintStatus(localSessionCode, 'failed', String(err)).catch(
              console.warn,
            );
          }
        } else {
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
          void updateSessionPrintStatus(localSessionCode, 'failed', check.reason).catch(
            console.warn,
          );
        }
      })();
    }

    let assetResult: SaveSessionAssetsResult | null = null;
    try {
      assetResult = await saveSessionAssets(
        boothId,
        targetSessionIdentifier,
        compositeUrl,
        selectedTemplate?.width || 1200,
        selectedTemplate?.height || 1800,
        (selectedTemplate?.design_data || []).filter((l) => !l.isBackground && !l.isQr),
        selectedTemplate?.frame_image_url ||
          selectedTemplate?.design_data?.find((l) => l.isBackground)?.imageUrl,
        effectivePhotos,
        [...boothFlow.liveviewClips],
        boothFlow.sessionCode,
        selectedTemplate,
        softfileUrl,
      );
    } catch (err) {
      console.error('[KioskSoftfileWrapper] Failed to save session assets:', err);
    } finally {
      sessionPayload.uploadedRoles = assetResult?.uploadedRoles ?? [];
      const allGeneratedUploaded = Boolean(
        assetResult?.compositeUploaded &&
          (!assetResult.gifBlob || assetResult.gifUploaded) &&
          (!assetResult.compositeVideoBlob || assetResult.videoUploaded),
      );
      const isSyncedOnline = Boolean(isValidUUID(activeBackendSessionId) && allGeneratedUploaded);
      const syncError = isSyncedOnline
        ? null
        : assetResult?.lastUploadError ||
          sessionCreateError ||
          (!networkStatus.isOnline
            ? 'Booth sedang offline saat sesi selesai'
            : 'Gagal unggah softfile ke server');

      void upsertSessionOutboxJob(localSessionCode, sessionPayload, {
        status: isSyncedOnline ? 'done' : 'pending',
        lastError: syncError,
      }).catch(console.warn);
    }
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (printAbortController) printAbortController.abort();
  });

  async function enqueueSoftfileJob(target: string) {
    const sCode =
      activeLocalSessionCode ||
      boothFlow.sessionCode ||
      generateSessionCode(uiConfig.config.boothName);
    const resolvedSessionId = activeBackendSessionId ?? boothFlow.sessionId;
    const effectiveCount = (photos.length > 0 ? photos : boothFlow.photosTaken).length;
    await upsertSessionOutboxJob(
      sCode,
      {
        boothId: await requireActiveBoothId().catch(() => 'default'),
        categoryId: selectedTemplate?.category_id ?? null,
        frameId: frameConfigId || boothFlow.selectedFrameId,
        printQty: boothFlow.printQty,
        paymentMethod: boothFlow.paymentMethod === 'Cashless' ? 'Cashless' : 'Ticket',
        softfileTarget: target,
        localSessionCode: sCode,
        backendSessionId: isValidUUID(resolvedSessionId) ? resolvedSessionId! : undefined,
        assetRelativePaths: buildAssetRelativePaths(
          sCode,
          uiConfig.config.boothName,
          effectiveCount,
          selectedTemplate?.width || 1200,
          selectedTemplate?.height || 1800,
        ),
      },
      { status: 'pending' },
    );
    emailSent = target === email.trim();
    waSent = target === phone.trim();
  }

  async function handleSendEmail() {
    if (!email.trim() || emailSent || isSendingEmail) return;
    sendError = '';
    isSendingEmail = true;
    const targetSessionId = activeBackendSessionId ?? boothFlow.sessionId;

    try {
      if (!networkStatus.isOnline || !isValidUUID(targetSessionId)) {
        await enqueueSoftfileJob(email.trim());
        kbOpen = false;
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
        targetSessionId ?? undefined,
      );
      if (!ok && !emailSent) {
        sendError = 'Gagal mengirim Email. Periksa konfigurasi SMTP.';
        setTimeout(() => (sendError = ''), 4000);
      }
    } finally {
      isSendingEmail = false;
    }
  }

  async function handleSendWA() {
    if (!phone.trim() || waSent || isSendingWa) return;
    sendError = '';
    isSendingWa = true;
    const targetSessionId = activeBackendSessionId ?? boothFlow.sessionId;

    try {
      if (!networkStatus.isOnline || !isValidUUID(targetSessionId)) {
        await enqueueSoftfileJob(phone.trim());
        kbOpen = false;
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
        targetSessionId ?? undefined,
      );
      if (!ok && !waSent) {
        sendError = 'Gagal mengirim WhatsApp. Periksa nomor WA.';
        setTimeout(() => (sendError = ''), 4000);
      }
    } finally {
      isSendingWa = false;
    }
  }

  function finishSession() {
    kbOpen = false;
    if (email.trim() && !emailSent && validEmail) {
      void handleSendEmail();
    }
    if (phone.trim() && !waSent) {
      void handleSendWA();
    }
    onDone();
  }

  let adapterTemplate = $derived<AdapterTemplate | null>(
    selectedTemplate
      ? {
          id: selectedTemplate.id,
          category_id: selectedTemplate.category_id,
          name: selectedTemplate.name,
          width: selectedTemplate.width || 1200,
          height: selectedTemplate.height || 1800,
          design_data: selectedTemplate.design_data || [],
          frame_image_url: selectedTemplate.frame_image_url,
          preview_image_url: selectedTemplate.preview_image_url,
        }
      : null,
  );

  let adapter = $derived(
    createDesktopUiAdapter({
      categories: [],
      templates: adapterTemplate ? [adapterTemplate] : [],
      session: {
        sessionSecs: secs,
        capturedPhotos: photos.length > 0 ? photos : boothFlow.photosTaken,
        activeTemplate: adapterTemplate,
      },
      softfile: {
        activeTab: activePreviewTab,
        printStatus,
        qrDataUrl,
        downloadUrl,
        sessionCode: activeLocalSessionCode,
        compositeUrl,
        gifUrl: boothFlow.sessionGifUrl,
        videoUrl: boothFlow.sessionVideoUrl,
        isGeneratingGif: boothFlow.isGeneratingGif,
        isGeneratingVideo: boothFlow.isGeneratingVideo,
        email,
        phone,
        emailSent,
        waSent,
        isSendingEmail,
        isSendingWa,
        errorMessage: sendError,
        keyboardOpen: kbOpen,
        activeInput: activeKbTarget,
      },
      callbacks: {
        onNext: finishSession,
        onFinishSession: finishSession,
        onSelectSoftfileTab: (tab) => (activePreviewTab = tab),
        onInputSoftfileEmail: (val) => {
          email = val;
          emailSent = false;
        },
        onSubmitSoftfileEmail: () => void handleSendEmail(),
        onInputSoftfilePhone: (val) => {
          phone = val;
          waSent = false;
        },
        onSubmitSoftfilePhone: () => void handleSendWA(),
        onFocusSoftfileInput: (target) => {
          activeKbTarget = target;
          kbOpen = true;
        },
      },
    }),
  );
</script>

<div class="w-full h-full relative overflow-hidden">
  {#if !networkStatus.isOnline}
    <div class="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <OfflineBanner />
    </div>
  {/if}

  {#if sendError}
    <div class="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-rose-600 text-white text-xs font-bold shadow-lg">
      {sendError}
    </div>
  {/if}

  <div
    class="w-full h-full transition-transform duration-300"
    style="transform: {kbOpen ? 'translateY(-110px)' : 'translateY(0)'};"
  >
    <GenericScreen {doc} screenKey="softfile" {adapter} interactive={true} fitMode="screen" />
  </div>

  {#if kbOpen}
    <OnScreenKeyboard
      open={kbOpen}
      activeField={activeKbTarget === 'phone' ? 'code' : 'email'}
      onKeyPress={(key) => {
        if (activeKbTarget === 'phone') {
          if (key === 'BACKSPACE') phone = phone.slice(0, -1);
          else if (key === 'CLEAR') phone = '';
          else if (phone.length < 18) phone += key;
          waSent = false;
        } else {
          if (key === 'BACKSPACE') email = email.slice(0, -1);
          else if (key === 'CLEAR') email = '';
          else if (email.length < 100) email += key;
          emailSent = false;
        }
      }}
      onSubmit={() => {
        if (activeKbTarget === 'phone') void handleSendWA();
        else void handleSendEmail();
      }}
      onClose={() => {
        kbOpen = false;
        activeKbTarget = null;
      }}
    />
  {/if}
</div>
