<script lang="ts">
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { redeemTicket } from '$lib/api/boothClient';
  import QrTicketScanner from '$lib/components/shared/QrTicketScanner.svelte';
  import OnScreenKeyboard from '$lib/components/shared/OnScreenKeyboard.svelte';
  import OfflineBanner from '$lib/components/shared/OfflineBanner.svelte';
  import { QrCode, ChevronLeft, Check, AlertCircle, Camera } from '@lucide/svelte';
  import type { QrScanStatus } from '$lib/types/qr';

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
   * Tombol "Cek Tiket": Memindai frame liveview dari kamera booth
   * dan memvalidasi QR Code terhadap tiket yang sudah sync atau online.
   */
  async function handleCheckTicket() {
    if (verifying) return;
    verifying = true;
    scanStatus = 'verifying';
    errorMsg = '';
    successMsg = '';

    try {
      const result = await scannerRef?.scanFrame?.();
      if (!result || !result.content) {
        scanStatus = 'error';
        errorMsg = 'QR Code tidak terdeteksi. Posisikan QR code tiket di depan kamera dan coba lagi.';
        setTimeout(() => {
          verifying = false;
          scanStatus = 'idle';
        }, 2200);
        return;
      }

      successMsg = 'QR Code Terdeteksi! Memverifikasi tiket…';
      const res = await redeemTicket(result.content, effectiveBoothId);
      if (!res.valid) {
        throw new Error(res.message || 'Kode tiket tidak valid atau telah digunakan');
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
      const msg = e instanceof Error ? e.message : 'Kode tiket tidak valid atau telah digunakan';
      scanStatus = 'error';
      errorMsg = msg;
      successMsg = '';
      setTimeout(() => {
        verifying = false;
        scanStatus = 'idle';
      }, 2500);
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
        throw new Error(res.message || 'Kode tiket tidak valid');
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

  const STEPPER_LABELS = ['Tutorial', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter', 'Scan File'];
  const activeIdx = 1;
  const DEFAULT_BG = '#fafafa';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('ticket').background ?? DEFAULT_BG);
</script>

<div
  class="w-full h-full flex flex-col relative overflow-hidden select-none"
  style:background={effectiveBg}
  style:font-family="'Playfair Display', Georgia, serif"
>
  <!-- StepperHeader -->
  <div
    class="w-full h-16 flex items-center justify-between px-10 border-b-2 border-black shrink-0 relative z-20 select-none"
    style="background: #C7EED8;"
  >
    <!-- dot pattern -->
    <div
      class="absolute inset-0 opacity-10 pointer-events-none"
      style="background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.5) 1px, transparent 0); background-size: 24px 24px;"
    ></div>

    <!-- stepper pills -->
    <div class="flex items-center gap-1 relative z-10 font-['Nunito',sans-serif]">
      {#each STEPPER_LABELS as label, i}
        {@const isActive = i === activeIdx}
        {@const isDone = i < activeIdx}
        <div class="flex items-center">
          <div
            class={`px-4 py-1.5 rounded-full border-2 border-black font-bold text-xs transition-all ${
              isActive
                ? 'bg-[#C7EED8] text-black shadow-[4px_4px_0_0_rgba(0,0,0,1)]'
                : isDone
                  ? 'bg-black text-white border-black'
                  : 'text-black/40 border-black/30 bg-transparent'
            }`}
          >
            {label}
          </div>
          {#if i < STEPPER_LABELS.length - 1}
            <div
              class={`w-6 h-px border-t border-black mx-0.5 ${isDone ? 'opacity-100' : 'opacity-30'}`}
            ></div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- brand -->
    <div class="flex items-center gap-2 relative z-10 font-['Nunito',sans-serif]">
      <div
        class="w-8 h-8 rounded-xl border-2 border-black bg-white flex items-center justify-center text-[#2a2873] shadow-inner"
      >
        <QrCode size={18} strokeWidth={2.5} />
      </div>
      <h1 class="text-black font-black text-xl m-0 tracking-wide drop-shadow-sm uppercase">
        {uiConfig.config.boothName || 'POTOHUB'}
      </h1>
    </div>
  </div>

  <!-- ClassicBorder -->
  <div class="absolute inset-5 pointer-events-none z-0">
    <div class="absolute inset-0 border-[3px] border-black rounded-[28px]"></div>
    <div class="absolute inset-[6px] border border-black/20 rounded-[23px]"></div>
    {#each ['top-3 left-3', 'top-3 right-3', 'bottom-3 left-3', 'bottom-3 right-3'] as pos}
      <div class="absolute {pos} w-4 h-4">
        <div
          class="w-2 h-2 border-t-2 border-l-2 border-black absolute top-0 left-0"
          style="border-radius: 2px 0 0 0;"
        ></div>
      </div>
    {/each}
  </div>

  <!-- Content -->
  <div
    class="relative z-10 flex flex-col items-center flex-1 justify-center gap-0 transition-transform duration-300 my-auto py-2"
    style={kbOpen ? 'transform: translateY(-90px);' : ''}
  >
    <p class="text-xs tracking-[0.35em] uppercase text-black/40 mb-1 font-['Nunito',sans-serif] font-black">Scan or Enter Code</p>
    <h2 class="text-2xl font-bold mb-1">Scan Tiket</h2>
    <div class="mb-2">
      <OfflineBanner message="Offline — tiket akan diverifikasi dari data lokal booth." />
    </div>

    <div
      class="bg-white border-[3px] border-black rounded-3xl shadow-[8px_8px_0_0_#000] p-6 flex flex-col items-center gap-4 w-[380px]"
    >
      <!-- scanner viewfinder box with live camera feed -->
      <div
        class="relative w-56 h-44 border-[3px] border-black rounded-2xl overflow-hidden bg-black shadow-inner flex items-center justify-center"
      >
        <QrTicketScanner
          bind:this={scannerRef}
          boxColor="#10b981"
          boxFill="rgba(16, 185, 129, 0.2)"
          boxGlow="rgba(16, 185, 129, 0.6)"
          dotColor="#ffffff"
          status={scanStatus}
          class="w-full h-full"
        />
      </div>

      <!-- Tombol Cek Tiket -->
      <button
        type="button"
        onclick={handleCheckTicket}
        disabled={verifying}
        class="w-full py-3 bg-[#C7EED8] hover:bg-[#aee6c4] text-black text-xs font-black tracking-wider uppercase rounded-xl border-2 border-black transition-all shadow-[4px_4px_0_0_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_#000] cursor-pointer flex items-center justify-center gap-2 font-['Nunito',sans-serif] disabled:opacity-50"
      >
        {#if verifying && scanStatus === 'verifying'}
          <div class="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          <span>Memverifikasi...</span>
        {:else}
          <Camera size={16} strokeWidth={2.5} />
          <span>Cek Tiket</span>
        {/if}
      </button>

      <!-- Status alerts -->
      {#if successMsg}
        <div class="w-full px-3 py-2 bg-[#C7EED8] border-2 border-black rounded-xl text-center text-xs font-black font-['Nunito',sans-serif] text-emerald-900 shadow-[3px_3px_0_0_rgba(0,0,0,1)] flex items-center justify-center gap-1.5">
          <Check size={16} /> <span>{successMsg}</span>
        </div>
      {:else if errorMsg}
        <div class="w-full px-3 py-2 bg-red-100 border-2 border-red-500 rounded-xl text-center text-xs font-bold font-['Nunito',sans-serif] text-red-600 shadow-[3px_3px_0_0_rgba(239,68,68,0.3)] flex items-center justify-center gap-1.5">
          <AlertCircle size={16} class="shrink-0" /> <span>{errorMsg}</span>
        </div>
      {/if}

      <!-- Manual input form -->
      <div class="flex flex-col items-center gap-2 w-full font-['Nunito',sans-serif] pt-1 border-t border-black/10">
        <div class="flex items-center justify-between w-full">
          <p class="text-[11px] text-black/50 tracking-wider font-bold m-0 uppercase">— Atau Kode Manual —</p>
          <button
            type="button"
            onclick={() => (kbOpen = !kbOpen)}
            class="text-[11px] font-bold text-black/70 bg-gray-100 hover:bg-gray-200 border border-black/30 rounded-md px-2 py-0.5 cursor-pointer transition-colors"
          >
            {kbOpen ? 'Tutup Keyboard' : '⌨ Buka Keyboard'}
          </button>
        </div>

        <div class="flex gap-2 w-full">
          <input
            bind:this={manualInputEl}
            value={code}
            onfocus={() => (kbOpen = true)}
            onclick={() => (kbOpen = true)}
            oninput={(e) => {
              code = (e.target as HTMLInputElement).value.toUpperCase();
              if (errorMsg) errorMsg = '';
            }}
            onkeydown={(e) => e.key === 'Enter' && verifyManual()}
            placeholder="XXXX-XXXX-XXXX"
            class={`flex-1 text-center text-base font-black tracking-widest border-2 rounded-xl px-3 py-2 outline-none transition-colors ${
              errorMsg ? 'border-red-500 bg-red-50/60 text-red-900' : 'border-black bg-white focus:bg-gray-50'
            }`}
            style="font-family: 'Courier New', monospace;"
          />
          <button
            type="button"
            onclick={verifyManual}
            disabled={verifying || !code.trim()}
            class="px-4 py-2 bg-black text-white text-xs font-bold uppercase rounded-xl hover:bg-gray-900 transition-all shadow-[3px_3px_0_0_rgba(0,0,0,0.2)] active:scale-95 cursor-pointer border-none disabled:opacity-40"
          >
            Kirim
          </button>
        </div>
      </div>
    </div>

    <button
      onclick={onBack}
      class="mt-4 flex items-center gap-1.5 text-xs text-black/50 hover:text-black transition-colors cursor-pointer bg-transparent border-none font-['Nunito',sans-serif] font-bold uppercase tracking-wider"
    >
      <ChevronLeft size={14} /> Ganti Metode
    </button>
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
