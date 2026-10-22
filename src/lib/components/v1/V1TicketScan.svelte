<script lang="ts">
  import { redeemTicket } from '$lib/api/boothClient';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import QrTicketScanner from '$lib/components/shared/QrTicketScanner.svelte';
  import OnScreenKeyboard from '$lib/components/shared/OnScreenKeyboard.svelte';
  import OfflineBanner from '$lib/components/shared/OfflineBanner.svelte';
  import { QrCode, ArrowRight, Check, AlertCircle, Camera } from '@lucide/svelte';
  import type { QrScanStatus } from '$lib/types/qr';

  interface Props {
    boothId?: string;
    onSuccess: () => void;
    onBack: () => void;
    background?: string;
  }

  let { boothId = '', onSuccess, onBack, background }: Props = $props();

  let effectiveBoothId = $derived(boothId || boothConfig.boothId || '');

  let scannerRef = $state<any>(null);
  let manualInputEl = $state<HTMLInputElement | null>(null);
  let manualInput = $state('');
  let isVerifying = $state(false);
  let kbOpen = $state(false);
  let scanStatus = $state<QrScanStatus>('idle');
  let errorMessage = $state('');
  let successMessage = $state('');

  /**
   * Tombol "Cek Tiket": Memindai frame liveview dari kamera booth
   * dan memvalidasi QR Code terhadap data tiket yang sudah sync atau online.
   */
  async function handleCheckTicket() {
    if (isVerifying) return;
    errorMessage = '';
    successMessage = '';
    isVerifying = true;
    scanStatus = 'verifying';

    try {
      const result = await scannerRef?.scanFrame?.();
      if (!result || !result.content) {
        scanStatus = 'error';
        errorMessage = 'QR Code tidak terdeteksi. Posisikan QR code tiket di depan kamera dan coba lagi.';
        setTimeout(() => {
          isVerifying = false;
          scanStatus = 'idle';
        }, 2200);
        return;
      }

      // Validasi token QR Code
      const res = await redeemTicket(result.content, effectiveBoothId);
      if (!res.valid) {
        throw new Error(res.message || 'Tiket QR tidak valid atau sudah digunakan.');
      }

      scanStatus = 'success';
      successMessage = res.offline
        ? 'Tiket Valid (mode offline)! Memulai sesi foto…'
        : 'Tiket Valid! Memulai sesi foto…';

      setTimeout(() => {
        onSuccess();
      }, 600);
    } catch (err) {
      console.error('QR Ticket verification failed:', err);
      const msg = err instanceof Error ? err.message : 'Tiket QR tidak valid atau sudah digunakan.';
      scanStatus = 'error';
      errorMessage = msg;
      successMessage = '';
      setTimeout(() => {
        isVerifying = false;
        scanStatus = 'idle';
      }, 2500);
    }
  }

  async function handleManualSubmit() {
    if (isVerifying) return;
    const clean = manualInput.trim();
    if (!clean) {
      errorMessage = 'Kode tiket tidak boleh kosong.';
      return;
    }

    isVerifying = true;
    scanStatus = 'verifying';
    errorMessage = '';
    successMessage = 'Memverifikasi kode tiket…';

    try {
      const res = await redeemTicket(clean, effectiveBoothId);
      if (!res.valid) {
        throw new Error(res.message || 'Kode tiket tidak valid atau sudah digunakan.');
      }

      scanStatus = 'success';
      successMessage = res.offline
        ? 'Tiket Valid (mode offline)! Memulai sesi foto…'
        : 'Tiket Valid! Memulai sesi foto…';

      setTimeout(() => {
        onSuccess();
      }, 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kode tiket tidak valid atau sudah digunakan.';
      scanStatus = 'error';
      errorMessage = msg;
      successMessage = '';
      setTimeout(() => {
        isVerifying = false;
        scanStatus = 'idle';
      }, 2500);
    }
  }

  function handleKeyboardPress(charOrAction: string) {
    if (errorMessage) errorMessage = '';
    const targetInput = manualInputEl;

    if (charOrAction === 'BACKSPACE') {
      if (targetInput && targetInput.selectionStart !== null && targetInput.selectionEnd !== null) {
        const start = targetInput.selectionStart;
        const end = targetInput.selectionEnd;
        if (start === end && start > 0) {
          manualInput = manualInput.slice(0, start - 1) + manualInput.slice(end);
          requestAnimationFrame(() => targetInput?.setSelectionRange(start - 1, start - 1));
        } else if (start !== end) {
          manualInput = manualInput.slice(0, start) + manualInput.slice(end);
          requestAnimationFrame(() => targetInput?.setSelectionRange(start, start));
        }
      } else {
        manualInput = manualInput.slice(0, -1);
      }
    } else if (charOrAction === 'CLEAR') {
      manualInput = '';
      requestAnimationFrame(() => targetInput?.focus());
    } else {
      if (targetInput && targetInput.selectionStart !== null && targetInput.selectionEnd !== null) {
        const start = targetInput.selectionStart;
        const end = targetInput.selectionEnd;
        manualInput = manualInput.slice(0, start) + charOrAction + manualInput.slice(end);
        const newCursor = start + charOrAction.length;
        requestAnimationFrame(() => targetInput?.setSelectionRange(newCursor, newCursor));
      } else {
        manualInput += charOrAction;
      }
    }
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
      class="flex items-center gap-1.5 border border-white/10 text-white/50 px-5 py-[9px] rounded-full bg-transparent cursor-pointer font-['Plus_Jakarta_Sans',sans-serif] text-sm font-medium transition-colors duration-150 hover:text-white hover:border-white/30"
    >
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path d="M15.75 19.5L8.25 12l7.5-7.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      Kembali
    </button>
  </header>

  <!-- Main Viewport -->
  <div
    class="w-full max-w-md flex flex-col items-center gap-4 z-20 my-auto transition-transform duration-300"
    style={kbOpen ? 'transform: translateY(-80px);' : ''}
  >
    <div class="text-center flex flex-col items-center gap-1">
      <h2 class="text-2xl font-black tracking-tight text-white m-0">Pindai QR Code Tiket</h2>
      <p class="text-xs text-white/60 m-0">Arahkan QR Code tiket ke kamera booth lalu tekan "Cek Tiket"</p>
      <div class="mt-1">
        <OfflineBanner message="Offline — tiket akan diverifikasi dari data lokal booth." />
      </div>
    </div>

    <!-- Camera Liveview Scan Box -->
    <div class="w-[300px] h-[240px] rounded-3xl overflow-hidden relative bg-black shadow-2xl border-2 border-white/20 flex items-center justify-center">
      <QrTicketScanner
        bind:this={scannerRef}
        boxColor="#3b82f6"
        boxFill="rgba(59, 130, 246, 0.2)"
        boxGlow="rgba(59, 130, 246, 0.6)"
        dotColor="#ffffff"
        status={scanStatus}
        class="w-full h-full"
      />
    </div>

    <!-- Tombol Cek Tiket Kamera -->
    <button
      type="button"
      onclick={handleCheckTicket}
      disabled={isVerifying}
      class="w-[300px] py-3.5 px-6 rounded-2xl bg-[#3b82f6] hover:bg-blue-600 active:scale-95 text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition-all cursor-pointer border-none disabled:opacity-50"
    >
      {#if isVerifying}
        <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        <span>Memverifikasi...</span>
      {:else}
        <Camera size={18} />
        <span>Cek Tiket</span>
      {/if}
    </button>

    <!-- Status Messages -->
    {#if successMessage}
      <div class="w-[300px] px-4 py-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2 text-center animate-pulse">
        <Check size={16} />
        <span>{successMessage}</span>
      </div>
    {:else if errorMessage}
      <div class="w-[300px] px-4 py-2.5 rounded-2xl bg-red-500/20 border border-red-500/50 text-red-300 text-xs font-semibold flex items-center justify-center gap-2 text-center">
        <AlertCircle size={16} class="shrink-0" />
        <span>{errorMessage}</span>
      </div>
    {/if}

    <!-- Manual Code Input Section -->
    <div class="w-[300px] flex flex-col gap-2 pt-2 border-t border-white/10">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Atau Masukkan Kode Tiket</span>
        <button
          type="button"
          onclick={() => (kbOpen = !kbOpen)}
          class="text-[11px] text-blue-400 hover:text-blue-300 font-medium cursor-pointer bg-transparent border-none"
        >
          {kbOpen ? 'Sembunyikan' : 'Buka Keyboard'}
        </button>
      </div>
      <div class="flex gap-2">
        <input
          bind:this={manualInputEl}
          type="text"
          bind:value={manualInput}
          onfocus={() => (kbOpen = true)}
          onclick={() => (kbOpen = true)}
          placeholder="Contoh: TKT-12345"
          onkeydown={(e) => e.key === 'Enter' && handleManualSubmit()}
          class="flex-1 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-xs placeholder-white/30 outline-none focus:border-blue-400 focus:bg-white/15 uppercase font-mono tracking-wider"
        />
        <button
          type="button"
          onclick={handleManualSubmit}
          disabled={isVerifying || !manualInput.trim()}
          class="px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 disabled:opacity-40 text-white font-bold text-xs cursor-pointer border-none transition-colors flex items-center gap-1"
        >
          <span>Kirim</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  </div>

  <!-- On-Screen Virtual Keyboard Drawer -->
  <OnScreenKeyboard
    open={kbOpen}
    activeField="ticket"
    availableFields={[{ id: 'ticket', label: 'Kode Tiket' }]}
    onKeyPress={handleKeyboardPress}
    onSubmit={handleManualSubmit}
    onClose={() => (kbOpen = false)}
  />
</div>
