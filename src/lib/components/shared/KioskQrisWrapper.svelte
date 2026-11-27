<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import QRCode from 'qrcode';
  import { GenericScreen, type DesignBlocksDocument } from '@potohub/booth-ui';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { formatTime } from '$lib/utils/shared';
  import {
    createTransactionSession,
    requireActiveBoothId,
    checkPaymentStatus,
    cancelTransactionSession,
  } from '$lib/api/boothClient';
  import { createDesktopUiAdapter } from '$lib/adapters/boothUiAdapter.svelte';

  interface Props {
    doc: DesignBlocksDocument;
    totalPrice: number;
    onSuccess: () => void;
    onBack: () => void;
  }

  let { doc, totalPrice, onSuccess, onBack }: Props = $props();

  const QR_TOTAL_SECS = 5 * 60;
  let secs = $state(boothConfig.config.paymentTimeSecs || 120);
  let qrSecs = $state(QR_TOTAL_SECS);
  let paid = $state(false);
  let qrDataUrl = $state('');
  let orderId = $state('');
  let loadingQr = $state(true);
  let errorMessage = $state('');
  let showCancelConfirm = $state(false);
  let isCancelling = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function handleConfirmCancel() {
    isCancelling = true;
    if (orderId) {
      try {
        const boothId = await requireActiveBoothId();
        await cancelTransactionSession(boothId, orderId);
      } catch (err) {
        console.warn('[KioskQrisWrapper] Gagal membatalkan transaksi:', err);
      }
    }
    boothFlow.sessionId = null;
    boothFlow.sessionCode = null;
    isCancelling = false;
    showCancelConfirm = false;
    onBack();
  }

  function handleBackClick() {
    if (loadingQr || !orderId || paid) {
      onBack();
      return;
    }
    showCancelConfirm = true;
  }

  async function loadQrSession() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    loadingQr = true;
    errorMessage = '';
    qrDataUrl = '';
    qrSecs = QR_TOTAL_SECS;

    try {
      const boothId = await requireActiveBoothId();
      const sess = await createTransactionSession(
        boothId,
        null,
        boothFlow.printQty || 1,
        'Cashless',
        boothFlow.selectedFrameId,
        totalPrice,
      );
      if (sess && sess.qr_content) {
        boothFlow.sessionId = sess.session_id || sess.id || null;
        boothFlow.sessionCode = sess.order_id || null;
        orderId = sess.order_id || '';
        qrDataUrl = await QRCode.toDataURL(sess.qr_content, { margin: 1, width: 240 });

        if (orderId) {
          pollTimer = setInterval(async () => {
            if (paid) return;
            try {
              const st = await checkPaymentStatus(boothId, orderId);
              if (st.is_paid || st.status === 'paid') {
                paid = true;
                if (pollTimer) clearInterval(pollTimer);
                setTimeout(() => onSuccess(), 1000);
              }
            } catch {
              // Non-blocking
            }
          }, 3000);
        }
      } else {
        throw new Error('Backend tidak mengembalikan data QR DOKU SNAP');
      }
    } catch (e: any) {
      console.error('[KioskQrisWrapper] Gagal memuat QRIS resmi:', e);
      errorMessage = e?.message || 'Gagal memuat QRIS';
    } finally {
      loadingQr = false;
    }
  }

  onMount(() => {
    timer = setInterval(() => {
      if (secs > 0) secs--;
      else {
        if (timer) clearInterval(timer);
        void handleConfirmCancel();
      }
      if (qrSecs > 0) qrSecs--;
    }, 1000);

    void loadQrSession();
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (pollTimer) clearInterval(pollTimer);
  });

  let qrPct = $derived((qrSecs / QR_TOTAL_SECS) * 100);
  let expired = $derived(qrSecs === 0);
  let printQty = $derived(boothFlow.printQty || 1);

  let adapter = $derived(
    createDesktopUiAdapter({
      categories: [],
      templates: [],
      payment: {
        totalPriceFormatted: `Rp ${totalPrice.toLocaleString('id-ID')}`,
        printQty,
        qrDataUrl,
        orderId,
        summaryText: `Sesi foto photobooth · ${printQty} cetak`,
        validityTimer: formatTime(qrSecs),
        progressPct: qrPct,
        loadingQr,
        errorMessage,
        paid,
        expired,
        onRetryQr: () => void loadQrSession(),
      },
      callbacks: {
        onBack: handleBackClick,
      },
    }),
  );
</script>

<div class="w-full h-full relative">
  <GenericScreen {doc} screenKey="qris" {adapter} interactive={true} fitMode="screen" />

  {#if showCancelConfirm}
    <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
      <div class="bg-[#1b1a23] border border-white/15 rounded-2xl p-6 max-w-sm w-full text-center text-white shadow-2xl">
        <h3 class="text-lg font-bold mb-2">Batalkan Pembayaran?</h3>
        <p class="text-xs text-white/70 mb-5">
          QRIS yang sudah dibuat akan dibatalkan jika Anda kembali ke halaman sebelumnya.
        </p>
        <div class="flex gap-3">
          <button
            type="button"
            disabled={isCancelling}
            onclick={() => (showCancelConfirm = false)}
            class="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer border-none"
          >
            Lanjut Bayar
          </button>
          <button
            type="button"
            disabled={isCancelling}
            onclick={handleConfirmCancel}
            class="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer border-none"
          >
            {isCancelling ? 'Membatalkan...' : 'Ya, Batalkan'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
