<script lang="ts">
  import { validateAndRedeemQrTicket } from '$lib/api/boothClient';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import QrTicketScanner from '$lib/components/shared/QrTicketScanner.svelte';
  import type { QrScanResult, QrScanStatus } from '$lib/types/qr';

  interface Props {
    boothId?: string;
    onSuccess: () => void;
    onBack: () => void;
    background?: string;
  }

  let { boothId = '', onSuccess, onBack, background }: Props = $props();

  let manualInput = $state('');
  let isVerifying = $state(false);
  let scanStatus = $state<QrScanStatus>('detecting');
  let scanStatusMessage = $state('Arahkan QR ke Kamera');
  let errorMessage = $state('');
  let successMessage = $state('');

  async function handleScanDetected(result: QrScanResult) {
    if (isVerifying) return;
    isVerifying = true;
    scanStatus = 'verifying';
    scanStatusMessage = 'QR Terdeteksi! Memverifikasi...';
    errorMessage = '';
    successMessage = 'QR Code Terdeteksi! Memverifikasi tiket…';

    try {
      await validateAndRedeemQrTicket(result.content, boothId);
      scanStatus = 'success';
      scanStatusMessage = 'Tiket Valid!';
      successMessage = 'Tiket Valid! Memulai sesi foto…';
      setTimeout(() => {
        onSuccess();
      }, 500);
    } catch (err) {
      console.error('QR Ticket verification failed:', err);
      const msg = err instanceof Error ? err.message : 'Tiket QR tidak valid atau sudah digunakan.';
      scanStatus = 'error';
      scanStatusMessage = 'Tiket Tidak Valid';
      errorMessage = msg;
      successMessage = '';
      setTimeout(() => {
        isVerifying = false;
        scanStatus = 'detecting';
        scanStatusMessage = 'Arahkan QR ke Kamera';
        errorMessage = '';
      }, 2500);
    }
  }

  async function handleManualSubmit() {
    if (!manualInput.trim() || isVerifying) return;
    isVerifying = true;
    scanStatus = 'verifying';
    scanStatusMessage = 'Memverifikasi kode tiket...';
    errorMessage = '';
    successMessage = 'Memverifikasi kode tiket…';

    try {
      await validateAndRedeemQrTicket(manualInput.trim(), boothId);
      scanStatus = 'success';
      scanStatusMessage = 'Tiket Valid!';
      successMessage = 'Tiket Valid! Memulai sesi foto…';
      setTimeout(() => {
        onSuccess();
      }, 500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kode tiket tidak valid atau sudah digunakan.';
      scanStatus = 'error';
      scanStatusMessage = 'Kode Tidak Valid';
      errorMessage = msg;
      successMessage = '';
      setTimeout(() => {
        isVerifying = false;
        scanStatus = 'detecting';
        scanStatusMessage = 'Arahkan QR ke Kamera';
        errorMessage = '';
      }, 2500);
    }
  }

  function handleScanError(err: string) {
    errorMessage = err;
    scanStatus = 'error';
    scanStatusMessage = 'Kamera bermasalah';
  }
  const DEFAULT_BG = '#090810';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('ticket').background ?? DEFAULT_BG);
</script>

<div
  class="w-full h-full text-white flex flex-col items-center justify-between p-8 select-none relative overflow-hidden font-['Plus_Jakarta_Sans',sans-serif]"
  style:background={effectiveBg}
>
  <!-- Topbar -->
  <header class="w-full flex items-center justify-between z-20">
    <button
      onclick={onBack}
      class="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold tracking-wider transition-colors cursor-pointer"
    >
      ← Kembali
    </button>
    <div class="text-right">
      <span class="text-xs font-bold uppercase tracking-[0.2em] text-[#93c5fd]">
        {uiConfig.config.boothName} — Scan Tiket QR
      </span>
    </div>
  </header>

  <!-- Main Viewport -->
  <div class="w-full max-w-lg flex flex-col items-center gap-6 z-20 my-auto">
    <div class="text-center">
      <h2 class="text-2xl font-black tracking-tight text-white mb-1">Pindai QR Code Tiket</h2>
      <p class="text-xs text-white/50">Arahkan QR Code tiket Anda ke kamera depan</p>
    </div>

    <!-- Camera Scan Box with Dynamic Bounding Box -->
    <div class="w-[340px] h-[340px] rounded-3xl overflow-hidden relative bg-black shadow-2xl border-2 border-white/20 flex items-center justify-center">
      <QrTicketScanner
        boxColor="#3b82f6"
        boxFill="rgba(59, 130, 246, 0.2)"
        boxGlow="rgba(59, 130, 246, 0.6)"
        dotColor="#ffffff"
        status={scanStatus}
        statusMessage={scanStatusMessage}
        class="w-full h-full"
        onScan={handleScanDetected}
        onError={handleScanError}
      />
    </div>

    <!-- Status Messages -->
    {#if successMessage}
      <div class="px-6 py-3 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-semibold animate-pulse text-center">
        ✓ {successMessage}
      </div>
    {:else if errorMessage}
      <div class="px-6 py-3 rounded-2xl bg-red-500/20 border border-red-500/50 text-red-300 text-xs font-semibold text-center max-w-sm">
        ⚠️ {errorMessage}
      </div>
    {/if}

    <!-- Manual Code Input Fallback -->
    <div class="w-full max-w-xs flex flex-col gap-2 mt-1">
      <p class="text-[11px] font-semibold text-white/40 text-center uppercase tracking-widest">Atau Masukkan Kode Tiket</p>
      <div class="flex gap-2">
        <input
          type="text"
          bind:value={manualInput}
          placeholder="Masukkan Kode Tiket..."
          onkeydown={(e) => e.key === 'Enter' && handleManualSubmit()}
          class="flex-1 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-xs placeholder-white/30 outline-none focus:border-[#93c5fd]"
        />
        <button
          onclick={handleManualSubmit}
          disabled={isVerifying || !manualInput.trim()}
          class="px-5 py-2.5 rounded-xl bg-[#3b82f6] hover:bg-blue-600 disabled:opacity-40 text-white font-bold text-xs cursor-pointer border-none transition-colors"
        >
          Kirim
        </button>
      </div>
    </div>
  </div>
</div>
