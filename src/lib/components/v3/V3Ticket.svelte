<script lang="ts">
  import { redeemTicket } from '$lib/api/boothClient';
  import QrTicketScanner from '$lib/components/shared/QrTicketScanner.svelte';
  import OfflineBanner from '$lib/components/shared/OfflineBanner.svelte';
  import { Check, Ticket as TicketIcon, Delete } from '@lucide/svelte';
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
  let kbOpen = $state(false);
  let scanStatus = $state<QrScanStatus>('detecting');
  let scanStatusMessage = $state('Arahkan QR ke Kamera');

  const TICKET_KB_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['-', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
  ];

  function pressKey(key: string) {
    if (errorMsg === 'Kode tiket tidak boleh kosong') {
      errorMsg = '';
    }
    if (key === '⌫') {
      code = code.slice(0, -1);
      return;
    }
    code += key;
  }

  async function handleScanDetected(result: QrScanResult) {
    if (verifying) return;
    verifying = true;
    scanStatus = 'verifying';
    scanStatusMessage = 'Memverifikasi Tiket...';
    errorMsg = '';
    successMsg = 'QR Code Terdeteksi! Memverifikasi...';

    try {
      const res = await redeemTicket(result.content, boothId);
      if (!res.valid) {
        throw new Error(res.message);
      }
      scanStatus = 'success';
      scanStatusMessage = res.offline ? 'Tiket Valid (Offline)!' : 'Tiket Valid!';
      successMsg = res.offline
        ? 'Tiket Valid (mode offline)! Memulai sesi foto…'
        : 'Tiket Valid! Memulai sesi foto…';
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
    if (verifying) return;
    if (!code.trim()) {
      errorMsg = 'Kode tiket tidak boleh kosong';
      successMsg = '';
      return;
    }
    verifying = true;
    scanStatus = 'verifying';
    scanStatusMessage = 'Memverifikasi...';
    errorMsg = '';
    successMsg = 'Memverifikasi tiket...';

    try {
      const res = await redeemTicket(code.trim(), boothId);
      if (!res.valid) {
        throw new Error(res.message);
      }
      scanStatus = 'success';
      scanStatusMessage = res.offline ? 'Tiket Valid (Offline)!' : 'Tiket Valid!';
      successMsg = res.offline
        ? 'Tiket Valid (mode offline)! Memulai sesi foto…'
        : 'Tiket Valid! Memulai sesi foto…';
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

  <div
    class="flex-1 flex flex-col items-center justify-center px-8 gap-6 transition-transform duration-300"
    style={kbOpen ? 'transform: translateY(-80px);' : ''}
  >
    <OfflineBanner message="Offline — tiket akan diverifikasi dari data lokal booth." />

    <div class="flex items-center justify-center gap-10">
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
      <div class="flex items-center justify-between w-full">
        <p class="text-white/60 text-xs tracking-[0.25em] uppercase font-bold m-0">Kode Tiket</p>
        <button
          type="button"
          onclick={() => (kbOpen = !kbOpen)}
          class="text-[10px] font-mono tracking-wider text-white/60 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg px-2 py-0.5 cursor-pointer transition-colors"
        >
          {kbOpen ? 'Tutup Keyboard' : '⌨ Buka Keyboard'}
        </button>
      </div>

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
          onfocus={() => (kbOpen = true)}
          onclick={() => (kbOpen = true)}
          oninput={(e) => {
            code = (e.target as HTMLInputElement).value.toUpperCase();
            if (errorMsg === 'Kode tiket tidak boleh kosong') errorMsg = '';
          }}
          onkeydown={(e) => e.key === 'Enter' && verifyManual()}
          placeholder="XXXX-XXXX-XXXX"
          class={`w-full text-center text-sm font-black tracking-widest rounded-xl px-4 py-3 outline-none border transition-colors bg-white/10 text-white placeholder-white/20 uppercase ${
            errorMsg ? 'border-red-500 bg-red-500/10' : 'border-white/20 focus:border-[#FFC107]'
          }`}
          style="font-family: 'Space Mono', monospace;"
        />
        <button
          type="button"
          onclick={verifyManual}
          disabled={verifying}
          class="w-full py-3 bg-[#FFC107] text-black font-black tracking-wider uppercase rounded-xl hover:bg-yellow-300 disabled:opacity-40 transition-colors shadow-lg text-xs cursor-pointer border-none"
        >
          {verifying ? 'Memverifikasi...' : 'Verifikasi Tiket'}
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

  <!-- On-screen keyboard -->
  <div
    class="absolute bottom-0 left-0 right-0 z-50 transition-transform duration-300 font-['Inter',sans-serif]"
    style={`transform: ${kbOpen ? 'translateY(0)' : 'translateY(100%)'};`}
  >
    <!-- Close strip -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex items-center justify-between px-5 py-2 cursor-pointer"
      style="background: rgba(10,10,15,0.98); border-top: 1px solid rgba(255,255,255,0.1);"
      onclick={() => (kbOpen = false)}
    >
      <span class="text-[9px] font-bold tracking-[0.3em] uppercase text-white/40 font-mono">Keyboard Kode Tiket</span>
      <span class="text-[9px] font-bold text-white/40 hover:text-white transition-colors">✕ Tutup</span>
    </div>

    <!-- V3 Keyboard keycaps -->
    <div class="flex flex-col gap-1.5 px-3 pb-4 pt-3 bg-[#0a0a0f] border-t border-white/10 backdrop-blur-xl">
      {#each TICKET_KB_ROWS as row}
        <div class="flex gap-1.5 w-full justify-center">
          {#each row as key}
            <button
              type="button"
              onpointerdown={(e) => {
                e.preventDefault();
                pressKey(key);
              }}
              class="rounded-lg flex items-center justify-center font-bold transition-all border border-white/10 cursor-pointer bg-white/10 hover:bg-white/20 active:scale-95 text-white"
              style={`height: 44px; flex: ${key === '⌫' ? '0 0 12%' : '1 1 0'}; max-width: 68px; min-width: 0; font-size: ${key === '⌫' ? '14px' : '16px'}; font-family: 'Space Mono', monospace;`}
            >
              {#if key === '⌫'}
                <Delete size={16} />
              {:else}
                {key}
              {/if}
            </button>
          {/each}
        </div>
      {/each}

      <!-- Bottom action row -->
      <div class="flex w-full gap-1.5 justify-center mt-0.5">
        <button
          type="button"
          onpointerdown={(e) => {
            e.preventDefault();
            code = '';
            if (errorMsg) errorMsg = '';
          }}
          class="rounded-lg flex items-center justify-center font-semibold border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 text-xs cursor-pointer"
          style="height: 44px; flex: 0 0 14%;"
        >
          Hapus
        </button>
        <button
          type="button"
          onpointerdown={(e) => {
            e.preventDefault();
            code += ' ';
          }}
          class="rounded-lg flex-1 flex items-center justify-center font-bold border border-white/10 bg-white/10 hover:bg-white/20 text-white text-xs uppercase tracking-wider cursor-pointer"
          style="height: 44px;"
        >
          Spasi
        </button>
        <button
          type="button"
          onpointerdown={(e) => {
            e.preventDefault();
            verifyManual();
          }}
          disabled={verifying}
          class="rounded-lg flex items-center justify-center font-black bg-[#FFC107] text-black text-xs uppercase tracking-wider border-none hover:bg-yellow-300 cursor-pointer disabled:opacity-40"
          style="height: 44px; flex: 0 0 28%;"
        >
          {verifying ? 'Memverifikasi...' : 'Verifikasi Tiket'}
        </button>
      </div>
    </div>
  </div>
</div>
