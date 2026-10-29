<script lang="ts">
  import { redeemTicket } from '$lib/api/boothClient';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import QrTicketScanner from '$lib/components/shared/QrTicketScanner.svelte';
  import OnScreenKeyboard from '$lib/components/shared/OnScreenKeyboard.svelte';
  import OfflineBanner from '$lib/components/shared/OfflineBanner.svelte';
  import { Check, AlertCircle, Camera, ChevronLeft } from '@lucide/svelte';
  import type { QrScanResult, QrScanStatus } from '$lib/types/qr';

  interface Props {
    boothId?: string;
    onConfirm: () => void;
    onBack: () => void;
    background?: string;
  }

  let { boothId = '', onConfirm, onBack, background }: Props = $props();

  let effectiveBoothId = $derived(boothId || boothConfig.boothId || '');

  let scannerRef = $state<any>(null);
  let manualInputEl = $state<HTMLInputElement | null>(null);
  let code = $state('');
  let errorMsg = $state('');
  let successMsg = $state('');
  let verifying = $state(false);
  let kbOpen = $state(false);
  let scanStatus = $state<QrScanStatus>('idle');

  /**
   * Tombol "Cek Tiket" atau auto-scan:
   * Jika preScannedContent tersedia (dari auto-scan), langsung gunakan tanpa re-scan ulang.
   * Jika tidak ada, panggil scannerRef.scanFrame untuk menangkap frame segar.
   */
  async function handleCheckTicket(preScannedContent?: string | MouseEvent) {
    if (verifying) return;
    verifying = true;
    scanStatus = 'verifying';
    errorMsg = '';
    successMsg = '';

    try {
      let content = typeof preScannedContent === 'string' ? preScannedContent.trim() : undefined;
      if (!content) {
        const result = await scannerRef?.scanFrame?.(4, 110);
        content = result?.content?.trim();
      }

      if (!content) {
        scanStatus = 'error';
        errorMsg = 'QR Code tidak terdeteksi. Posisikan QR code tiket di depan kamera dan coba lagi.';
        setTimeout(() => {
          verifying = false;
          scanStatus = 'idle';
        }, 2200);
        return;
      }

      successMsg = 'QR Code Terdeteksi! Memverifikasi...';
      const res = await redeemTicket(content, effectiveBoothId);
      if (!res.valid) {
        throw new Error(res.message || 'Tiket QR tidak valid atau sudah digunakan');
      }

      scanStatus = 'success';
      successMsg = res.offline
        ? 'Tiket Valid (mode offline)! Memulai sesi foto…'
        : 'Tiket Valid! Memulai sesi foto…';

      setTimeout(() => {
        onConfirm();
      }, 600);
    } catch (e) {
      console.error('QR verification failed:', e);
      const msg = e instanceof Error ? e.message : 'Tiket QR tidak valid atau sudah digunakan';
      scanStatus = 'error';
      errorMsg = msg;
      successMsg = '';
      setTimeout(() => {
        verifying = false;
        scanStatus = 'idle';
      }, 2500);
    }
  }

  function handleAutoScan(result: QrScanResult) {
    if (!verifying && scanStatus === 'idle' && result && result.content) {
      handleCheckTicket(result.content);
    }
  }

  async function verifyManual() {
    if (verifying) return;
    const clean = code.trim();
    if (!clean) {
      errorMsg = 'Kode tiket tidak boleh kosong';
      successMsg = '';
      return;
    }

    verifying = true;
    scanStatus = 'verifying';
    errorMsg = '';
    successMsg = 'Memverifikasi tiket...';

    try {
      const res = await redeemTicket(clean, effectiveBoothId);
      if (!res.valid) {
        throw new Error(res.message || 'Kode tiket tidak valid atau sudah digunakan');
      }

      scanStatus = 'success';
      successMsg = res.offline
        ? 'Tiket Valid (mode offline)! Memulai sesi foto…'
        : 'Tiket Valid! Memulai sesi foto…';

      setTimeout(() => {
        onConfirm();
      }, 600);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Kode tiket tidak valid';
      scanStatus = 'error';
      errorMsg = msg;
      successMsg = '';
      setTimeout(() => {
        verifying = false;
        scanStatus = 'idle';
      }, 2500);
    }
  }

  function handleKeyboardPress(charOrAction: string) {
    if (errorMsg) errorMsg = '';
    const targetInput = manualInputEl;

    if (charOrAction === 'BACKSPACE') {
      if (targetInput && targetInput.selectionStart !== null && targetInput.selectionEnd !== null) {
        const start = targetInput.selectionStart;
        const end = targetInput.selectionEnd;
        if (start === end && start > 0) {
          code = code.slice(0, start - 1) + code.slice(end);
          requestAnimationFrame(() => targetInput?.setSelectionRange(start - 1, start - 1));
        } else if (start !== end) {
          code = code.slice(0, start) + code.slice(end);
          requestAnimationFrame(() => targetInput?.setSelectionRange(start, start));
        }
      } else {
        code = code.slice(0, -1);
      }
    } else if (charOrAction === 'CLEAR') {
      code = '';
      requestAnimationFrame(() => targetInput?.focus());
    } else {
      if (targetInput && targetInput.selectionStart !== null && targetInput.selectionEnd !== null) {
        const start = targetInput.selectionStart;
        const end = targetInput.selectionEnd;
        code = code.slice(0, start) + charOrAction.toUpperCase() + code.slice(end);
        const newCursor = start + charOrAction.length;
        requestAnimationFrame(() => targetInput?.setSelectionRange(newCursor, newCursor));
      } else {
        code += charOrAction.toUpperCase();
      }
    }
  }

  const VISIBLE_STEPS = ['Package', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter'];
  const activeStepIdx = 1;
  const DEFAULT_BG = '#111';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('ticket').background ?? DEFAULT_BG);
</script>

<div
  class="w-full h-full flex flex-col text-white select-none font-['Inter',sans-serif] relative overflow-hidden"
  style:background={effectiveBg}
>
  <!-- Header -->
  <div class="h-[68px] bg-[#CD1C33] flex items-center justify-between px-8 shadow-lg shrink-0 z-20 relative overflow-hidden">
    <div
      class="absolute inset-0 opacity-[0.06] pointer-events-none"
      style="background-image: repeating-linear-gradient(90deg, transparent, transparent 20px, #fff 20px, #fff 40px);"
    ></div>

    <div class="relative z-10">
      <h1 class="text-xl text-white font-['Playfair_Display',serif] font-bold tracking-[0.15em] leading-none uppercase m-0">
        Scan Tiket
      </h1>
      <p class="text-white/50 text-[8px] uppercase tracking-[0.3em] mt-1 m-0">Arahkan tiket ke kamera atau masukkan kode manual</p>
    </div>

    <!-- Stepper -->
    <div class="flex items-center gap-1.5 relative z-10">
      {#each VISIBLE_STEPS as stepLabel, i}
        {@const isDone = i < activeStepIdx}
        {@const isActive = i === activeStepIdx}
        <div class="flex items-center gap-1.5">
          <div
            class={`w-7 h-7 rounded-full text-[9px] font-black flex items-center justify-center border-2 transition-all ${
              isDone
                ? 'bg-[#FFC107] border-[#FFC107] text-black'
                : isActive
                  ? 'bg-white border-white text-[#CD1C33]'
                  : 'bg-transparent border-white/30 text-white/40'
            }`}
          >
            {#if isDone}
              <Check size={10} strokeWidth={3} />
            {:else}
              {i + 1}
            {/if}
          </div>
          {#if i < VISIBLE_STEPS.length - 1}
            <div class={`w-6 h-[2px] rounded-full ${isDone ? 'bg-[#FFC107]' : 'bg-white/20'}`}></div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div
    class="flex-1 flex flex-col items-center justify-center px-8 gap-5 transition-transform duration-300 my-auto"
    style={kbOpen ? 'transform: translateY(-80px);' : ''}
  >
    <OfflineBanner message="Offline — tiket akan diverifikasi dari data lokal booth." />

    <div class="flex items-center justify-center gap-8">
      <!-- Scanner Box with Camera Liveview and Cek Tiket Button -->
      <div class="flex flex-col items-center gap-3">
        <div class="relative w-64 h-52 rounded-2xl overflow-hidden bg-black border-2 border-white/20 flex items-center justify-center shadow-2xl">
          <QrTicketScanner
            bind:this={scannerRef}
            boxColor="#FFC107"
            boxFill="rgba(255, 193, 7, 0.18)"
            boxGlow="rgba(255, 193, 7, 0.6)"
            dotColor="#ffffff"
            status={scanStatus}
            class="w-full h-full"
            onScan={handleAutoScan}
          />
        </div>

        <button
          type="button"
          onclick={handleCheckTicket}
          disabled={verifying}
          class="w-full py-3 bg-[#FFC107] hover:bg-yellow-400 active:scale-95 text-black font-black tracking-wider uppercase rounded-xl transition-all shadow-[0_0_15px_rgba(255,193,7,0.3)] cursor-pointer flex items-center justify-center gap-2 text-xs border-none disabled:opacity-50"
        >
          {#if verifying && scanStatus === 'verifying'}
            <div class="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
            <span>Memverifikasi...</span>
          {:else}
            <Camera size={16} strokeWidth={2.5} />
            <span>Cek Tiket</span>
          {/if}
        </button>
      </div>

      <!-- Divider -->
      <div class="flex flex-col items-center gap-3 text-white/20">
        <div class="w-px h-16 bg-white/15"></div>
        <span class="text-xs tracking-widest font-mono">atau</span>
        <div class="w-px h-16 bg-white/15"></div>
      </div>

      <!-- Manual input -->
      <div class="flex flex-col gap-3 w-72">
        <div class="flex items-center justify-between w-full">
          <p class="text-white/60 text-xs tracking-[0.25em] uppercase font-bold m-0 flex-1">Masukkan Kode Tiket</p>
          <button
            type="button"
            onclick={() => (kbOpen = !kbOpen)}
            class="text-[10px] font-mono tracking-wider text-white/60 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg px-2 py-0.5 cursor-pointer transition-colors shrink-0"
          >
            {kbOpen ? '✕ Tutup' : '⌨ Keyboard'}
          </button>
        </div>

        <!-- Status Alerts -->
        {#if successMsg}
          <div class="w-full px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-bold text-center flex items-center justify-center gap-1.5 animate-pulse">
            <Check size={14} /> <span>{successMsg}</span>
          </div>
        {:else if errorMsg}
          <div class="w-full px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/50 text-red-300 text-xs font-bold text-center flex items-center justify-center gap-1.5">
            <AlertCircle size={14} class="shrink-0" /> <span>{errorMsg}</span>
          </div>
        {/if}

        <div class="flex flex-col gap-2.5">
          <input
            bind:this={manualInputEl}
            type="text"
            value={code}
            onfocus={() => (kbOpen = true)}
            onclick={() => (kbOpen = true)}
            oninput={(e) => {
              code = (e.target as HTMLInputElement).value.toUpperCase();
              if (errorMsg) errorMsg = '';
            }}
            onkeydown={(e) => e.key === 'Enter' && verifyManual()}
            placeholder="XXXX-XXXX-XXXX"
            class={`w-full text-center text-base font-black tracking-[0.2em] rounded-xl px-4 py-2.5 outline-none border-2 transition-colors bg-white/10 text-white placeholder-white/20 uppercase ${
              errorMsg ? 'border-red-400 bg-red-500/10' : 'border-white/20 focus:border-[#FFC107]'
            }`}
            style="font-family: 'Space Mono', monospace;"
          />
          <button
            type="button"
            onclick={verifyManual}
            disabled={verifying || !code.trim()}
            class="w-full py-3 bg-[#FFC107] text-black font-black tracking-[0.2em] uppercase rounded-xl hover:bg-yellow-400 transition-colors shadow-md text-xs active:scale-95 cursor-pointer border-none disabled:opacity-40"
          >
            {verifying ? 'Memverifikasi...' : 'Verifikasi Tiket ✓'}
          </button>
        </div>

        <button
          onclick={onBack}
          class="text-white/40 text-xs tracking-wider hover:text-white transition-colors text-center bg-transparent border-none cursor-pointer mt-1 flex items-center justify-center gap-1 font-mono"
        >
          <ChevronLeft size={14} /> Ganti Metode Pembayaran
        </button>
      </div>
    </div>
  </div>

  <!-- On-Screen Keyboard Drawer (seperti di halaman login) -->
  <OnScreenKeyboard
    open={kbOpen}
    activeField="ticket"
    availableFields={[{ id: 'ticket', label: 'Kode Tiket' }]}
    onKeyPress={handleKeyboardPress}
    onSubmit={verifyManual}
    onClose={() => (kbOpen = false)}
  />
</div>
