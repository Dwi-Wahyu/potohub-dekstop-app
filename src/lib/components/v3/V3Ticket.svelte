<script lang="ts">
  import { validateAndRedeemQrTicket } from '$lib/api/boothClient';
  import QrTicketScanner from '$lib/components/shared/QrTicketScanner.svelte';
  import { Check, Ticket as TicketIcon } from '@lucide/svelte';
  import type { QrScanResult, QrScanStatus } from '$lib/types/qr';

  import { uiConfig } from '$lib/stores/uiConfig.svelte';

  interface Props {
    boothId?: string;
    onConfirm: () => void;
    onBack: () => void;
    background?: string;
  }

  let { boothId = '', onConfirm, onBack, background }: Props = $props();

  let code = $state('');
  let errorMsg = $state('');
  let successMsg = $state('');
  let verifying = $state(false);
  let scanStatus = $state<QrScanStatus>('detecting');
  let scanStatusMessage = $state('Arahkan QR ke Kamera');

  async function handleScanDetected(result: QrScanResult) {
    if (verifying) return;
    verifying = true;
    scanStatus = 'verifying';
    scanStatusMessage = 'Memverifikasi Tiket...';
    errorMsg = '';
    successMsg = 'QR Code Terdeteksi! Memverifikasi...';

    try {
      await validateAndRedeemQrTicket(result.content, boothId);
      scanStatus = 'success';
      scanStatusMessage = 'Tiket Valid!';
      successMsg = 'Tiket Valid! Memulai sesi foto…';
      setTimeout(() => {
        onConfirm();
      }, 500);
    } catch (e) {
      console.error('QR verification failed:', e);
      const msg = e instanceof Error ? e.message : 'Tiket QR tidak valid atau sudah digunakan';
      scanStatus = 'error';
      scanStatusMessage = 'Tiket Tidak Valid';
      errorMsg = msg;
      successMsg = '';
      setTimeout(() => {
        verifying = false;
        scanStatus = 'detecting';
        scanStatusMessage = 'Arahkan QR ke Kamera';
        errorMsg = '';
      }, 2500);
    }
  }

  async function verifyManual() {
    if (!code.trim() || verifying) return;
    verifying = true;
    scanStatus = 'verifying';
    scanStatusMessage = 'Memverifikasi...';
    errorMsg = '';
    successMsg = 'Memverifikasi tiket...';

    try {
      await validateAndRedeemQrTicket(code.trim(), boothId);
      scanStatus = 'success';
      scanStatusMessage = 'Tiket Valid!';
      successMsg = 'Tiket Valid! Memulai sesi foto…';
      setTimeout(() => {
        onConfirm();
      }, 500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Kode tiket tidak valid';
      scanStatus = 'error';
      scanStatusMessage = 'Kode Tidak Valid';
      errorMsg = msg;
      successMsg = '';
      setTimeout(() => {
        verifying = false;
        scanStatus = 'detecting';
        scanStatusMessage = 'Arahkan QR ke Kamera';
        errorMsg = '';
      }, 2500);
    }
  }

  function handleScanError(err: string) {
    errorMsg = err;
    scanStatus = 'error';
    scanStatusMessage = 'Kamera Bermasalah';
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
      <p class="text-white/50 text-[8px] uppercase tracking-[0.3em] mt-1 m-0">Tempelkan tiket ke scanner atau masukkan kode</p>
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

  <div class="flex-1 flex items-center justify-center px-8 gap-10">
    <!-- Scanner Box -->
    <div class="flex flex-col items-center gap-6">
      <div class="relative w-56 h-56 rounded-2xl overflow-hidden bg-black border-2 border-white/20 flex items-center justify-center">
        <!-- Gold corner brackets -->
        {#each [['top-3 left-3', 'border-t-4 border-l-4'], ['top-3 right-3', 'border-t-4 border-r-4'], ['bottom-3 left-3', 'border-b-4 border-l-4'], ['bottom-3 right-3', 'border-b-4 border-r-4']] as [pos, bdr]}
          <div class={`absolute ${pos} w-7 h-7 border-[#FFC107] ${bdr}`}></div>
        {/each}
        <div class="absolute inset-x-3 h-0.5 bg-[#FFC107]/80 animate-bounce rounded z-10 pointer-events-none" style="top: 48%;"></div>
        <QrTicketScanner
          boxColor="#FFC107"
          boxFill="rgba(255, 193, 7, 0.18)"
          boxGlow="rgba(255, 193, 7, 0.6)"
          dotColor="#ffffff"
          status={scanStatus}
          statusMessage={scanStatusMessage}
          class="w-full h-full"
          onScan={handleScanDetected}
          onError={handleScanError}
        />
      </div>
      <p class="text-white/40 text-xs tracking-[0.3em] uppercase m-0">Arahkan tiket ke kamera</p>
    </div>

    <!-- Divider -->
    <div class="flex flex-col items-center gap-3 text-white/20">
      <div class="w-px h-16 bg-white/15"></div>
      <span class="text-xs tracking-widest font-mono">atau</span>
      <div class="w-px h-16 bg-white/15"></div>
    </div>

    <!-- Manual input -->
    <div class="flex flex-col gap-4 w-72">
      <p class="text-white/60 text-xs tracking-[0.25em] uppercase font-bold text-center m-0">Masukkan Kode Tiket</p>

      <!-- Status Alerts -->
      {#if successMsg}
        <div class="w-full px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-bold text-center animate-pulse">
          ✓ {successMsg}
        </div>
      {:else if errorMsg}
        <div class="w-full px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/50 text-red-300 text-xs font-bold text-center">
          ⚠️ {errorMsg}
        </div>
      {/if}

      <div class="flex flex-col gap-2">
        <input
          type="text"
          value={code}
          oninput={(e) => (code = (e.target as HTMLInputElement).value.toUpperCase())}
          onkeydown={(e) => e.key === 'Enter' && verifyManual()}
          placeholder="XXXX-XXXX-XXXX"
          class="w-full text-center text-sm font-black tracking-widest rounded-xl px-4 py-3 outline-none border border-white/20 focus:border-[#FFC107] bg-white/10 text-white placeholder-white/20 uppercase transition-colors"
          style="font-family: 'Space Mono', monospace;"
        />
        <button
          onclick={verifyManual}
          disabled={verifying || !code.trim()}
          class="w-full py-3 bg-[#FFC107] text-black font-black tracking-wider uppercase rounded-xl hover:bg-yellow-300 disabled:opacity-40 transition-colors shadow-lg text-xs cursor-pointer border-none"
        >
          Verifikasi Tiket
        </button>
      </div>

      <button
        onclick={onBack}
        class="text-white/30 text-xs tracking-wider hover:text-white/60 transition-colors text-center bg-transparent border-none cursor-pointer mt-1"
      >
        ← Ganti Metode Pembayaran
      </button>
    </div>
  </div>
</div>
