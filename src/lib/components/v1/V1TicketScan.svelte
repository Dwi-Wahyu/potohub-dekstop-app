<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import jsQR from 'jsqr';
  import { validateAndRedeemQrTicket } from '$lib/api/boothClient';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';

  interface Props {
    boothId?: string;
    onSuccess: () => void;
    onBack: () => void;
  }

  let { boothId = '', onSuccess, onBack }: Props = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let canvasEl = $state<HTMLCanvasElement | null>(null);

  let isScanning = $state(true);
  let manualInput = $state('');
  let isVerifying = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');
  let stream = $state<MediaStream | null>(null);
  let scanAnimationId: number | null = null;

  async function startCamera() {
    try {
      errorMessage = '';
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.onloadedmetadata = () => {
          videoEl?.play();
          requestAnimationFrame(scanLoop);
        };
      }
    } catch (err) {
      console.warn('Initial camera constraints failed, trying basic video constraint:', err);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.onloadedmetadata = () => {
            videoEl?.play();
            requestAnimationFrame(scanLoop);
          };
        }
      } catch (err2) {
        console.error('Failed to open front camera:', err2);
        errorMessage = 'Kamera depan tidak dapat diakses. Pastikan izin kamera aktif & kamera tidak dipakai aplikasi lain.';
        isScanning = false;
      }
    }
  }

  function stopCamera() {
    if (scanAnimationId) {
      cancelAnimationFrame(scanAnimationId);
      scanAnimationId = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }

  function scanLoop() {
    if (!isScanning || isVerifying) return;

    if (videoEl && canvasEl && videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
      const width = videoEl.videoWidth;
      const height = videoEl.videoHeight;
      canvasEl.width = width;
      canvasEl.height = height;

      const ctx = canvasEl.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data && code.data.trim()) {
          console.log('QR Code detected:', code.data);
          handleQrDetected(code.data);
          return;
        }
      }
    }

    scanAnimationId = requestAnimationFrame(scanLoop);
  }

  async function handleQrDetected(token: string) {
    if (isVerifying) return;
    isVerifying = true;
    errorMessage = '';
    successMessage = 'QR Code Terdeteksi! Memverifikasi tiket…';

    try {
      await validateAndRedeemQrTicket(token, boothId);
      successMessage = 'Tiket Valid! Memulai sesi foto…';
      stopCamera();
      setTimeout(() => {
        onSuccess();
      }, 400);
    } catch (err) {
      console.error('QR Ticket verification failed:', err);
      errorMessage = err instanceof Error ? err.message : 'Tiket QR tidak valid atau sudah digunakan.';
      successMessage = '';
      setTimeout(() => {
        isVerifying = false;
        errorMessage = '';
        if (videoEl && isScanning) {
          requestAnimationFrame(scanLoop);
        }
      }, 2500);
    }
  }

  async function handleManualSubmit() {
    if (!manualInput.trim() || isVerifying) return;
    isVerifying = true;
    errorMessage = '';
    successMessage = 'Memverifikasi kode tiket…';

    try {
      await validateAndRedeemQrTicket(manualInput.trim(), boothId);
      successMessage = 'Tiket Valid! Memulai sesi foto…';
      stopCamera();
      setTimeout(() => {
        onSuccess();
      }, 400);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Kode tiket tidak valid atau sudah digunakan.';
      successMessage = '';
      isVerifying = false;
    }
  }

  onMount(() => {
    startCamera();
  });

  onDestroy(() => {
    stopCamera();
  });
</script>

<canvas bind:this={canvasEl} class="hidden"></canvas>

<div class="w-screen h-screen bg-[#090810] text-white flex flex-col items-center justify-between p-8 select-none relative overflow-hidden font-['Plus_Jakarta_Sans',sans-serif]">
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
      <p class="text-xs text-white/50">Arahkan QR Code tiket Anda ke kamera depan laptop</p>
    </div>

    <!-- Camera Scan Box -->
    <div class="w-[320px] h-[320px] rounded-3xl overflow-hidden relative bg-black shadow-2xl border-2 border-white/20 flex items-center justify-center">
      {#if isScanning}
        <video
          bind:this={videoEl}
          autoplay
          playsinline
          muted
          class="w-full h-full object-cover transform -scale-x-100"
        ></video>

        <!-- Scanning reticle / frame overlay -->
        <div class="absolute inset-8 border-2 border-dashed border-[#93c5fd]/70 rounded-2xl pointer-events-none flex items-center justify-center">
          <div class="w-full h-0.5 bg-gradient-to-r from-transparent via-[#3b82f6] to-transparent animate-pulse"></div>
        </div>
      {:else}
        <div class="p-6 text-center text-white/50 text-xs">
          Kamera scanner nonaktif
        </div>
      {/if}
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
    <div class="w-full max-w-xs flex flex-col gap-2 mt-2">
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
