<script lang="ts">
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { redeemTicket } from '$lib/api/boothClient';
  import QrTicketScanner from '$lib/components/shared/QrTicketScanner.svelte';
  import OfflineBanner from '$lib/components/shared/OfflineBanner.svelte';
  import { QrCode, ChevronLeft, Ticket as TicketIcon, Check, FileExclamationPoint, Delete } from '@lucide/svelte';
  import type { QrScanResult, QrScanStatus } from '$lib/types/qr';

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
  let scanStatusMessage = $state('Arahkan QR Tiket');

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
    class="relative z-10 flex flex-col items-center flex-1 justify-center gap-0 transition-transform duration-300"
    style={kbOpen ? 'transform: translateY(-90px);' : ''}
  >
    <h2 class="text-3xl font-bold mb-1">Scan Tiket</h2>
    <div class="mb-3">
      <OfflineBanner message="Offline — tiket akan diverifikasi dari data lokal booth." />
    </div>
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

      <div class="flex items-center justify-between w-full">
        <p class="text-xs text-black/40 tracking-widest font-['Nunito',sans-serif] m-0">— atau kode manual —</p>
        <button
          type="button"
          onclick={() => (kbOpen = !kbOpen)}
          class="text-[11px] font-bold text-black/70 bg-gray-100 hover:bg-gray-200 border border-black/30 rounded-lg px-2.5 py-1 cursor-pointer font-['Nunito',sans-serif] transition-colors"
        >
          {kbOpen ? 'Tutup Keyboard' : '⌨ Buka Keyboard'}
        </button>
      </div>

      <!-- Status alerts -->
      {#if successMsg}
        <div class="w-full px-4 py-2 bg-[#C7EED8] border-2 border-black rounded-xl text-center text-xs font-black font-['Nunito',sans-serif] text-emerald-900 shadow-[3px_3px_0_0_rgba(0,0,0,1)]">
          <Check /> {successMsg}
        </div>
      {:else if errorMsg}
        <div class="w-full px-4 py-2 bg-red-100 border-2 border-red-500 rounded-xl text-center text-xs font-bold font-['Nunito',sans-serif] text-red-600 shadow-[3px_3px_0_0_rgba(239,68,68,0.3)]">
          <FileExclamationPoint /> {errorMsg}
        </div>
      {/if}

      <!-- Manual input form -->
      <div class="flex flex-col items-center gap-3 w-full font-['Nunito',sans-serif]">
        <input
          value={code}
          onfocus={() => (kbOpen = true)}
          onclick={() => (kbOpen = true)}
          oninput={(e) => {
            code = (e.target as HTMLInputElement).value.toUpperCase();
            if (errorMsg === 'Kode tiket tidak boleh kosong') errorMsg = '';
          }}
          onkeydown={(e) => e.key === 'Enter' && verifyManual()}
          placeholder="XXXX-XXXX-XXXX"
          class={`w-full text-center text-xl font-black tracking-[0.25em] border-[2.5px] rounded-2xl px-4 py-3 outline-none transition-colors ${
            errorMsg ? 'border-red-500 bg-red-50/60 text-red-900' : 'border-black bg-white focus:bg-gray-50'
          }`}
          style="font-family: 'Courier New', monospace;"
        />
        <button
          type="button"
          onclick={verifyManual}
          disabled={verifying}
          class="w-full py-4 bg-black text-white text-base font-bold tracking-[0.2em] uppercase rounded-full hover:bg-gray-900 transition-all shadow-[6px_6px_0_0_rgba(0,0,0,0.25)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] active:scale-95 cursor-pointer border-none disabled:opacity-50"
        >
          {verifying ? 'Memverifikasi...' : 'Verifikasi Tiket ✓'}
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

  <!-- On-Screen Keyboard -->
  <div
    class="absolute bottom-0 left-0 right-0 z-50 transition-transform duration-300 font-['Nunito',sans-serif]"
    style={`transform: ${kbOpen ? 'translateY(0)' : 'translateY(100%)'};`}
  >
    <!-- Close strip -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex items-center justify-between px-5 py-2 border-t-[3px] border-black bg-[#C7EED8] cursor-pointer"
      onclick={() => (kbOpen = false)}
    >
      <span class="text-xs font-black uppercase tracking-[0.2em] text-black">Keyboard Kode Tiket</span>
      <span class="text-xs font-black text-black hover:underline">✕ Tutup</span>
    </div>

    <!-- V2 Keyboard -->
    <div class="flex flex-col gap-1.5 px-3 pb-4 pt-3 bg-white border-t-[3px] border-black shadow-[0_-4px_16px_rgba(0,0,0,0.1)]">
      {#each TICKET_KB_ROWS as row}
        <div class="flex gap-1.5 w-full justify-center">
          {#each row as key}
            <button
              type="button"
              onpointerdown={(e) => {
                e.preventDefault();
                pressKey(key);
              }}
              class="rounded-lg flex items-center justify-center font-black transition-all border-[2px] border-black cursor-pointer bg-white hover:bg-gray-100 active:translate-x-[1px] active:translate-y-[1px]"
              style={`height: 44px; flex: ${key === '⌫' ? '0 0 12%' : '1 1 0'}; max-width: 68px; min-width: 0; font-size: ${key === '⌫' ? '14px' : '17px'}; box-shadow: 2px 2px 0 0 #000;`}
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
          class="rounded-lg flex items-center justify-center font-bold border-[2px] border-black bg-[#f0f0f0] hover:bg-gray-200 cursor-pointer text-xs"
          style="height: 44px; flex: 0 0 14%; box-shadow: 2px 2px 0 0 #000;"
        >
          Hapus
        </button>
        <button
          type="button"
          onpointerdown={(e) => {
            e.preventDefault();
            code += ' ';
          }}
          class="rounded-lg flex-1 flex items-center justify-center font-bold border-[2px] border-black bg-white hover:bg-gray-100 cursor-pointer text-xs uppercase tracking-wider"
          style="height: 44px; box-shadow: 2px 2px 0 0 #000;"
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
          class="rounded-lg flex items-center justify-center font-black border-[2px] border-black bg-black text-white hover:bg-gray-900 cursor-pointer text-xs uppercase tracking-wider disabled:opacity-50"
          style="height: 44px; flex: 0 0 28%; box-shadow: 2px 2px 0 0 rgba(0,0,0,0.35);"
        >
          {verifying ? 'Memverifikasi...' : 'Verifikasi Tiket ✓'}
        </button>
      </div>
    </div>
  </div>
</div>
