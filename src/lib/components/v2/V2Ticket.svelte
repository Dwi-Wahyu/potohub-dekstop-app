<script lang="ts">
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { validateAndRedeemQrTicket } from '$lib/api/boothClient';
  import QrTicketScanner from '$lib/components/shared/QrTicketScanner.svelte';
  import { QrCode, ChevronLeft, Ticket as TicketIcon } from '@lucide/svelte';
  import type { QrScanResult, QrScanStatus } from '$lib/types/qr';

  interface Props {
    boothId?: string;
    onConfirm: () => void;
    onBack: () => void;
  }

  let { boothId = '', onConfirm, onBack }: Props = $props();

  let code = $state('');
  let errorMsg = $state('');
  let successMsg = $state('');
  let verifying = $state(false);
  let scanStatus = $state<QrScanStatus>('detecting');
  let scanStatusMessage = $state('Arahkan QR Tiket');

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
      const msg = e instanceof Error ? e.message : 'Kode tiket tidak valid atau telah digunakan';
      scanStatus = 'error';
      scanStatusMessage = 'Tiket Tidak Valid';
      errorMsg = msg;
      successMsg = '';
      setTimeout(() => {
        verifying = false;
        scanStatus = 'detecting';
        scanStatusMessage = 'Arahkan QR Tiket';
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
        scanStatusMessage = 'Arahkan QR Tiket';
        errorMsg = '';
      }, 2500);
    }
  }

  function handleScanError(err: string) {
    errorMsg = err;
    scanStatus = 'error';
    scanStatusMessage = 'Kamera Bermasalah';
  }

  const STEPPER_LABELS = ['Tutorial', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter', 'Scan File'];
  const activeIdx = 1;
</script>

<div
  class="w-screen h-screen bg-[#fafafa] flex flex-col relative overflow-hidden select-none"
  style="font-family: 'Playfair Display', Georgia, serif;"
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
  <div class="relative z-10 flex flex-col items-center flex-1 justify-center gap-0">
    <p class="text-xs tracking-[0.35em] uppercase text-black/40 mb-3 font-['Nunito',sans-serif] font-black">Scan or Enter Code</p>
    <h2 class="text-3xl font-bold mb-1">Scan Tiket</h2>
    <div class="w-16 h-[2px] bg-black mb-8"></div>

    <div
      class="bg-white border-[3px] border-black rounded-3xl shadow-[10px_10px_0_0_#000] p-8 flex flex-col items-center gap-6 w-[380px]"
    >
      <!-- scanner viewfinder box -->
      <div
        class="relative w-52 h-52 border-[3px] border-black rounded-2xl overflow-hidden bg-black/5 flex items-center justify-center"
      >
        <!-- corner brackets -->
        {#each [['top-2 left-2', 'border-t-4 border-l-4'], ['top-2 right-2', 'border-t-4 border-r-4'], ['bottom-2 left-2', 'border-b-4 border-l-4'], ['bottom-2 right-2', 'border-b-4 border-r-4']] as [pos, bdr]}
          <div class={`absolute ${pos} w-6 h-6 border-black ${bdr}`}></div>
        {/each}
        <!-- scan line animation -->
        <div
          class="absolute inset-x-2 h-0.5 bg-black/70 rounded animate-bounce z-10 pointer-events-none"
          style="top: 45%;"
        ></div>
        <QrTicketScanner
          boxColor="#000000"
          boxFill="rgba(0,0,0,0.1)"
          boxGlow="rgba(0,0,0,0.3)"
          dotColor="#000000"
          status={scanStatus}
          statusMessage={scanStatusMessage}
          class="w-full h-full"
          onScan={handleScanDetected}
          onError={handleScanError}
        />
      </div>

      <p class="text-xs text-black/40 tracking-widest font-['Nunito',sans-serif] m-0">— atau masukkan kode manual —</p>

      <!-- Status alerts -->
      {#if successMsg}
        <div class="w-full px-4 py-2 bg-[#C7EED8] border-2 border-black rounded-xl text-center text-xs font-black font-['Nunito',sans-serif] text-emerald-900 shadow-[3px_3px_0_0_rgba(0,0,0,1)]">
          ✓ {successMsg}
        </div>
      {:else if errorMsg}
        <div class="w-full px-4 py-2 bg-red-100 border-2 border-red-500 rounded-xl text-center text-xs font-bold font-['Nunito',sans-serif] text-red-600">
          ⚠️ {errorMsg}
        </div>
      {/if}

      <!-- Manual input form -->
      <div class="flex flex-col items-center gap-3 w-full font-['Nunito',sans-serif]">
        <input
          value={code}
          oninput={(e) => (code = (e.target as HTMLInputElement).value.toUpperCase())}
          onkeydown={(e) => e.key === 'Enter' && verifyManual()}
          placeholder="XXXX-XXXX-XXXX"
          class={`w-full text-center text-xl font-black tracking-[0.25em] border-[2.5px] rounded-2xl px-4 py-3 outline-none transition-colors border-black bg-white focus:bg-gray-50`}
          style="font-family: 'Courier New', monospace;"
        />
        <button
          onclick={verifyManual}
          disabled={verifying || !code.trim()}
          class="w-full py-4 bg-black text-white text-base font-bold tracking-[0.2em] uppercase rounded-full hover:bg-gray-900 transition-all shadow-[6px_6px_0_0_rgba(0,0,0,0.25)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] active:scale-95 cursor-pointer border-none"
        >
          Verifikasi Tiket ✓
        </button>
      </div>
    </div>

    <button
      onclick={onBack}
      class="mt-6 flex items-center gap-2 text-sm text-black/40 hover:text-black transition-colors cursor-pointer bg-transparent border-none font-['Nunito',sans-serif]"
    >
      <ChevronLeft size={14} /> Ganti Metode
    </button>
  </div>
</div>
