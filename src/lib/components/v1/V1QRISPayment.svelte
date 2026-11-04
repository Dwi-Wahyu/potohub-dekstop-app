<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import QRCode from 'qrcode';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { formatTime } from '$lib/utils/shared';
  import { createTransactionSession, requireActiveBoothId, checkPaymentStatus } from '$lib/api/boothClient';

  interface Props {
    totalPrice: number;
    onSuccess: () => void;
    onBack: () => void;
    background?: string;
  }

  let { totalPrice, onSuccess, onBack, background }: Props = $props();

  let secs = $state(boothConfig.config.paymentTimeSecs || 120);
  let qrSecs = $state(5 * 60);
  let paid = $state(false);
  let qrDataUrl = $state('');
  let orderId = $state('');
  let loadingQr = $state(true);
  let errorMessage = $state('');
  let timer: any = null;
  let pollTimer: any = null;

  import { buildDynamicQrisString } from '$lib/utils/qrisBuilder';

  onMount(async () => {
    timer = setInterval(() => {
      if (secs > 0) secs--;
      else {
        clearInterval(timer);
        onBack();
      }
      if (qrSecs > 0) qrSecs--;
    }, 1000);

    // Generate dynamic QRIS
    try {
      const boothId = await requireActiveBoothId();
      const sess = await createTransactionSession(
        boothId,
        null,
        boothFlow.printQty || 1,
        'Cashless',
        boothFlow.selectedFrameId,
        totalPrice
      );
      if (sess && sess.qr_content) {
        boothFlow.sessionId = sess.session_id || sess.id || null;
        boothFlow.sessionCode = sess.order_id || null;
        orderId = sess.order_id || '';
        
        qrDataUrl = await QRCode.toDataURL(sess.qr_content, { margin: 1, width: 220 });

        // Mulai polling status pembayaran otomatis
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
      console.error('[V1QRISPayment] Gagal memuat QRIS resmi:', e);
      errorMessage = e?.message || 'Gagal memuat QRIS';
    } finally {
      loadingQr = false;
    }
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (pollTimer) clearInterval(pollTimer);
  });

  const QR_TOTAL_SECS = 5 * 60;
  const fmtPrice = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
  const DEFAULT_BG = '#121114';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('payment').background ?? DEFAULT_BG);
  let expired = $derived(qrSecs === 0);
  let qrPct = $derived((qrSecs / QR_TOTAL_SECS) * 100);
  let accent = $derived(uiConfig.config.primaryColor);
  let summary = $derived(`Sesi foto photobooth · ${boothFlow.printQty || 1} cetak`);
</script>

<div
  class="w-full h-full overflow-hidden flex flex-col select-none font-['Poppins',sans-serif]"
  style:background={effectiveBg}
>
  <!-- Header -->
  <header class="flex items-center justify-between px-8 pt-6 shrink-0">
    <div class="flex items-center gap-4">
      <button
        onclick={onBack}
        class="flex items-center gap-1 pl-2.5 pr-4 py-2 rounded-xl bg-white/10 text-white/90 text-xs font-semibold hover:bg-white/15 transition-colors border-none cursor-pointer"
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path d="M15.75 19.5L8.25 12l7.5-7.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Kembali
      </button>
      <span class="text-white text-xl italic font-semibold font-['Playfair_Display',Georgia,serif]">
        {uiConfig.config.boothName}
      </span>
    </div>
    <div class="flex items-center gap-2.5 bg-white rounded-xl pl-2 pr-4 py-1.5 shadow-lg">
      <span class="w-8 h-8 rounded-lg flex items-center justify-center text-white" style:background={accent}>
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path d="M10 2h4M12 14l3-3M12 22a8 8 0 100-16 8 8 0 000 16z" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <span class="flex flex-col leading-none">
        <span class="text-[9px] font-medium text-[#555]">Sisa waktu sesi</span>
        <span class="text-lg font-bold text-[#111] tabular-nums">{formatTime(secs)}</span>
      </span>
    </div>
  </header>

  <!-- Card -->
  <main class="flex-1 min-h-0 flex items-center justify-center px-8 py-6">
    <div
      class="bg-white rounded-3xl w-full max-w-[860px] grid grid-cols-[1.05fr_1fr] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.6)] transition-all duration-500 relative {paid ? 'scale-[0.98]' : ''}"
    >
      {#if paid}
        <div class="absolute inset-0 z-10 bg-white/85 flex flex-col items-center justify-center gap-3">
          <div class="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_32px_rgba(34,197,94,0.5)]">
            <svg width="38" height="38" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24">
              <path d="M4.5 12.75l6 6 9-13.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <p class="m-0 text-[#111] font-bold">Pembayaran berhasil</p>
        </div>
      {/if}

      <!-- Left: QR -->
      <section class="p-7 flex flex-col gap-4 border-r border-[#ececec]">
        <div class="flex items-center justify-between">
          <span class="text-[#111] font-extrabold text-lg tracking-wide">QRIS</span>
          <span class="text-[#444] text-[11px] font-semibold">{uiConfig.config.boothName} Photobooth</span>
        </div>
        <div class="border border-[#e5e5e5] rounded-2xl p-5 flex items-center justify-center flex-1 min-h-[240px]">
          {#if loadingQr}
            <div class="flex flex-col items-center justify-center gap-2 text-[#555] text-xs">
              <div class="w-6 h-6 border-2 border-[#ddd] border-t-[#d0342c] rounded-full animate-spin"></div>
              <span>Membuat QRIS...</span>
            </div>
          {:else if qrDataUrl}
            <img
              src={qrDataUrl}
              alt="QRIS"
              class="w-[210px] h-[210px] object-contain transition-opacity {expired ? 'opacity-20' : ''}"
            />
          {:else}
            <div class="text-xs text-[#b42318] text-center">
              <span class="font-bold block mb-1">Gagal Memuat QRIS</span>
              <span class="text-[10px] text-[#555]">{errorMessage || 'Koneksi ke gateway gagal'}</span>
            </div>
          {/if}
        </div>
        {#if orderId}
          <p class="m-0 text-center text-[10px] text-[#555] font-mono tracking-wide">Ref: {orderId}</p>
        {/if}
      </section>

      <!-- Right: details -->
      <section class="p-7 flex flex-col gap-4">
        <div>
          <p class="m-0 text-[11px] text-[#444] font-medium">Total bayar</p>
          <p class="m-0 text-[#111] font-bold text-4xl tracking-tight leading-tight">{fmtPrice(totalPrice)}</p>
          <p class="m-0 text-[11px] text-[#555] mt-0.5">{summary}</p>
        </div>

        <div class="rounded-xl p-3.5 bg-[#fdecec]">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-[#8f1d1d]">{expired ? 'QR kedaluwarsa' : 'QR berlaku'}</span>
            <span class="text-2xl font-bold text-[#b42318] tabular-nums">{formatTime(qrSecs)}</span>
          </div>
          <div class="h-1.5 rounded-full bg-[#f5c6c6] mt-2 overflow-hidden">
            <div class="h-full rounded-full bg-[#d0342c] transition-all duration-1000 ease-linear" style:width="{qrPct}%"></div>
          </div>
          <p class="m-0 flex items-center gap-1.5 text-[10px] text-[#8f1d1d] mt-2">
            <span class="w-1.5 h-1.5 rounded-full bg-[#d0342c] animate-pulse"></span>
            Menunggu pembayaran. Konfirmasi otomatis.
          </p>
        </div>

        <ol class="m-0 list-decimal pl-4 text-xs text-[#222] space-y-1.5">
          <li>Buka e-wallet atau mobile banking.</li>
          <li>Scan kode QRIS di samping.</li>
          <li>Cek nominal, lalu bayar.</li>
        </ol>
        <p class="m-0 text-[10px] text-[#555] leading-relaxed">
          Bisa pakai GoPay, OVO, DANA, ShopeePay, LinkAja, BCA, BRI, Mandiri, BNI, dan aplikasi lain yang mendukung QRIS.
        </p>
      </section>
    </div>
  </main>
</div>
