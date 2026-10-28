<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { cameraStore } from '$lib/camera.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { getLiveviewTransformStyle } from '$lib/utils/shared';
  import {
    detectQrFromImageElement,
    detectQrFromImageUrl,
    detectQrFromVideo
  } from '$lib/utils/qrScanner';
  import type { QrPoint, QrScanResult, QrScanStatus } from '$lib/types/qr';

  interface Props {
    boxColor?: string;
    boxFill?: string;
    boxGlow?: string;
    dotColor?: string;
    textColor?: string;
    successColor?: string;
    errorColor?: string;
    showCornerDots?: boolean;
    showCornerBrackets?: boolean;
    showLaserBeam?: boolean;
    showCenterGuide?: boolean;
    status?: QrScanStatus;
    statusMessage?: string;
    class?: string;
    saveToBackend?: boolean;
    onScan?: (result: QrScanResult) => void;
    onError?: (error: string) => void;
    onReady?: () => void;
  }

  let {
    boxColor,
    boxFill,
    boxGlow,
    dotColor,
    textColor,
    successColor = '#10b981',
    errorColor = '#ef4444',
    showCornerDots = true,
    showCornerBrackets = true,
    showLaserBeam = false,
    showCenterGuide = true,
    status = 'idle',
    statusMessage = '',
    class: className = '',
    saveToBackend = true,
    onScan,
    onError,
    onReady,
  }: Props = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let imgEl = $state<HTMLImageElement | null>(null);
  let overlayCanvas = $state<HTMLCanvasElement | null>(null);
  let frameSrc = $state<string | null>(null);
  let liveviewInterval: any = null;
  let autoScanInterval: any = null;
  let isAutoScanning = false;
  let lastDetectedPoints = $state<QrPoint[] | null>(null);

  function playStream(node: HTMLVideoElement, stream: MediaStream | null) {
    if (stream) {
      node.srcObject = stream;
      node.play().catch(() => {});
    }
    return {
      update(nextStream: MediaStream | null) {
        if (nextStream && node.srcObject !== nextStream) {
          node.srcObject = nextStream;
          node.play().catch(() => {});
        }
      }
    };
  }

  function startAutoScanner() {
    if (autoScanInterval) clearInterval(autoScanInterval);

    // Auto-scan ringan setiap 260ms saat dalam status 'idle'
    autoScanInterval = setInterval(async () => {
      if (status !== 'idle' || isAutoScanning || !cameraStore.isLiveviewActive) return;

      isAutoScanning = true;
      try {
        let result: QrScanResult | null = null;
        if (cameraStore.cameraMode === 'webcam' && videoEl) {
          result = await detectQrFromVideo(videoEl);
        } else if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
          result = await detectQrFromImageElement(imgEl);
        }

        if (result && result.content && status === 'idle') {
          lastDetectedPoints = result.cornerPoints;
          if (overlayCanvas) {
            overlayCanvas.width = overlayCanvas.clientWidth || 640;
            overlayCanvas.height = overlayCanvas.clientHeight || 480;
            drawBoundingBox(result.cornerPoints, result.sourceWidth, result.sourceHeight);
          }

          if (saveToBackend) {
            invoke('save_qr_result', {
              data: {
                content: result.content,
                corner_points: result.cornerPoints
              }
            }).catch(() => {});
          }

          onScan?.(result);
        }
      } catch {
        // Abaikan error background auto-scan
      } finally {
        isAutoScanning = false;
      }
    }, 260);
  }

  function stopAutoScanner() {
    if (autoScanInterval) {
      clearInterval(autoScanInterval);
      autoScanInterval = null;
    }
  }

  async function startCameraLiveview() {
    try {
      if (cameraStore.status === 'idle' || cameraStore.status === 'error') {
        await cameraStore.connect(
          cameraStore.isDevMode ? 'webcam' : (boothConfig.config.cameraMode || 'usb')
        );
      }

      await cameraStore.startLiveview(videoEl);

      if (cameraStore.cameraMode === 'usb' || cameraStore.cameraMode === 'demo') {
        // Ambil frame awal langsung
        const initialFrame = await cameraStore.getLiveviewFrame();
        if (initialFrame) frameSrc = initialFrame;

        // Interval liveview frame (~10-12 FPS)
        liveviewInterval = setInterval(async () => {
          const url = await cameraStore.getLiveviewFrame();
          if (url) {
            frameSrc = url;
          }
        }, 100);
      }

      startAutoScanner();
      onReady?.();
    } catch (err) {
      console.error('[QrTicketScanner] Gagal memulai liveview kamera:', err);
      const msg = err instanceof Error ? err.message : 'Kamera tidak dapat diakses';
      onError?.(msg);
    }
  }

  function stopCameraLiveview() {
    stopAutoScanner();
    if (liveviewInterval) {
      clearInterval(liveviewInterval);
      liveviewInterval = null;
    }
    cameraStore.stopLiveview();
    clearOverlay();
  }

  function getThemeColors() {
    let resolvedBox = boxColor;
    let resolvedFill = boxFill;
    let resolvedGlow = boxGlow;
    let resolvedDot = dotColor;
    let resolvedText = textColor;

    if (typeof document !== 'undefined') {
      const styles = getComputedStyle(document.documentElement);
      if (!resolvedBox) resolvedBox = styles.getPropertyValue('--qr-box-color').trim() || '#3b82f6';
      if (!resolvedFill) resolvedFill = styles.getPropertyValue('--qr-box-fill').trim() || 'rgba(59, 130, 246, 0.18)';
      if (!resolvedGlow) resolvedGlow = styles.getPropertyValue('--qr-box-glow').trim() || 'rgba(59, 130, 246, 0.5)';
      if (!resolvedDot) resolvedDot = styles.getPropertyValue('--qr-corner-dot-color').trim() || '#ffffff';
      if (!resolvedText) resolvedText = styles.getPropertyValue('--qr-text-color').trim() || '#ffffff';
    }

    if (status === 'success') {
      return {
        box: successColor,
        fill: 'rgba(16, 185, 129, 0.25)',
        glow: 'rgba(16, 185, 129, 0.65)',
        dot: '#ffffff',
        text: '#ffffff'
      };
    }

    if (status === 'error') {
      return {
        box: errorColor,
        fill: 'rgba(239, 68, 68, 0.25)',
        glow: 'rgba(239, 68, 68, 0.65)',
        dot: '#ffffff',
        text: '#ffffff'
      };
    }

    return {
      box: resolvedBox || '#3b82f6',
      fill: resolvedFill || 'rgba(59, 130, 246, 0.18)',
      glow: resolvedGlow || 'rgba(59, 130, 246, 0.5)',
      dot: resolvedDot || '#ffffff',
      text: resolvedText || '#ffffff'
    };
  }

  export function drawBoundingBox(points: QrPoint[], sourceW?: number, sourceH?: number) {
    if (!overlayCanvas || points.length < 4) return;
    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    const colors = getThemeColors();

    const canvasW = overlayCanvas.width;
    const canvasH = overlayCanvas.height;

    // Normalisasi skala koordinat jika resolusi native frame berbeda dengan resolusi tampilan canvas
    const rawW = sourceW || (cameraStore.cameraMode === 'webcam' ? videoEl?.videoWidth : imgEl?.naturalWidth) || canvasW;
    const rawH = sourceH || (cameraStore.cameraMode === 'webcam' ? videoEl?.videoHeight : imgEl?.naturalHeight) || canvasH;

    const scaleX = canvasW / rawW;
    const scaleY = canvasH / rawH;

    const scaledPoints = points.map((p) => ({
      x: p.x * scaleX,
      y: p.y * scaleY
    }));

    // 1. Draw polygon path
    ctx.beginPath();
    ctx.moveTo(scaledPoints[0].x, scaledPoints[0].y);
    for (let i = 1; i < scaledPoints.length; i++) {
      ctx.lineTo(scaledPoints[i].x, scaledPoints[i].y);
    }
    ctx.closePath();

    ctx.fillStyle = colors.fill;
    ctx.fill();

    ctx.save();
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = status === 'verifying' || status === 'success' ? 24 : 14;
    ctx.lineWidth = status === 'verifying' || status === 'success' ? 4 : 3;
    ctx.strokeStyle = colors.box;
    ctx.stroke();
    ctx.restore();

    // 2. Corner Bracket Reticles
    if (showCornerBrackets) {
      const bracketLen = 18;
      for (let i = 0; i < 4; i++) {
        const curr = scaledPoints[i];
        const prev = scaledPoints[(i + 3) % 4];
        const next = scaledPoints[(i + 1) % 4];

        const vPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
        const dPrev = Math.hypot(vPrev.x, vPrev.y) || 1;
        const lenPrev = Math.min(bracketLen, dPrev * 0.45);
        const p1 = { x: curr.x + (vPrev.x / dPrev) * lenPrev, y: curr.y + (vPrev.y / dPrev) * lenPrev };

        const vNext = { x: next.x - curr.x, y: next.y - curr.y };
        const dNext = Math.hypot(vNext.x, vNext.y) || 1;
        const lenNext = Math.min(bracketLen, dNext * 0.45);
        const p2 = { x: curr.x + (vNext.x / dNext) * lenNext, y: curr.y + (vNext.y / dNext) * lenNext };

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = colors.box;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }

    // 3. Corner Dots
    if (showCornerDots) {
      scaledPoints.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = colors.dot;
        ctx.fill();
        ctx.strokeStyle = colors.box;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
  }

  export function clearOverlay() {
    if (!overlayCanvas) return;
    const ctx = overlayCanvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }
    lastDetectedPoints = null;
  }

  /**
   * Mengambil frame liveview kamera dan memindai QR Code.
   * Menggunakan strategi burst (multi-sampling hingga 4x dalam ~360ms)
   * untuk mengatasi frame motion blur / noise saat tombol ditekan.
   */
  export async function scanFrame(burstCount = 4, burstDelayMs = 110): Promise<QrScanResult | null> {
    for (let attempt = 0; attempt < burstCount; attempt++) {
      let result: QrScanResult | null = null;

      if (cameraStore.cameraMode === 'webcam' && videoEl) {
        result = await detectQrFromVideo(videoEl);
      } else if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
        result = await detectQrFromImageElement(imgEl);
      } else if (frameSrc) {
        result = await detectQrFromImageUrl(frameSrc);
      }

      // Jika pada frame cache belum terdeteksi, coba ambil frame segar dari backend
      if (!result && (cameraStore.cameraMode === 'usb' || cameraStore.cameraMode === 'demo')) {
        const freshUrl = await cameraStore.getLiveviewFrame();
        if (freshUrl) {
          frameSrc = freshUrl;
          if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
            result = await detectQrFromImageElement(imgEl);
          } else {
            result = await detectQrFromImageUrl(freshUrl);
          }
        }
      }

      if (result && result.content) {
        lastDetectedPoints = result.cornerPoints;
        if (overlayCanvas) {
          overlayCanvas.width = overlayCanvas.clientWidth || 640;
          overlayCanvas.height = overlayCanvas.clientHeight || 480;
          drawBoundingBox(result.cornerPoints, result.sourceWidth, result.sourceHeight);
        }

        if (saveToBackend) {
          invoke('save_qr_result', {
            data: {
              content: result.content,
              corner_points: result.cornerPoints
            }
          }).catch(() => {});
        }

        onScan?.(result);
        return result;
      }

      if (attempt < burstCount - 1) {
        await new Promise((r) => setTimeout(r, burstDelayMs));
      }
    }

    clearOverlay();
    return null;
  }

  onMount(() => {
    startCameraLiveview();
  });

  onDestroy(() => {
    stopCameraLiveview();
  });
</script>

<div class={`relative overflow-hidden bg-black flex items-center justify-center ${className}`}>
  <!-- Camera Liveview Feed Layer -->
  {#if cameraStore.isLiveviewActive}
    {#if cameraStore.cameraMode === 'webcam'}
      <video
        bind:this={videoEl}
        use:playStream={cameraStore.stream}
        autoplay
        playsinline
        muted
        class="absolute inset-0 w-full h-full object-cover block"
        style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
      ></video>
    {:else if frameSrc}
      <img
        bind:this={imgEl}
        src={frameSrc}
        alt="Camera liveview"
        class="absolute inset-0 w-full h-full object-cover block"
        style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
      />
    {:else}
      <div class="flex flex-col items-center justify-center gap-2 text-white/50 text-xs">
        <div class="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        <span>Memuat Kamera...</span>
      </div>
    {/if}
  {:else}
    <div class="flex flex-col items-center justify-center gap-2 text-white/50 text-xs">
      <div class="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
      <span>Menghubungkan Kamera...</span>
    </div>
  {/if}

  <!-- Overlay Canvas for Bounding Box Animation -->
  <canvas
    bind:this={overlayCanvas}
    class="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
  ></canvas>

  <!-- Central Guide Reticle (Clean, text removed) -->
  {#if showCenterGuide && !lastDetectedPoints}
    <div class="absolute inset-10 pointer-events-none z-10 flex items-center justify-center">
      <!-- Reticle corner markers -->
      <div class="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-white/80 rounded-tl-sm"></div>
      <div class="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-white/80 rounded-tr-sm"></div>
      <div class="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-white/80 rounded-bl-sm"></div>
      <div class="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-white/80 rounded-br-sm"></div>
    </div>
  {/if}

  <!-- Scanning Indicator Animation if status is verifying -->
  {#if status === 'verifying'}
    <div class="absolute inset-0 bg-blue-500/10 pointer-events-none z-20 flex items-center justify-center">
      <div class="w-full h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-pulse shadow-[0_0_12px_#60a5fa]"></div>
    </div>
  {/if}
</div>
