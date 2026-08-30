<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import jsQR from 'jsqr';
  import { invoke } from '@tauri-apps/api/core';
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
    mirrored?: boolean;
    status?: QrScanStatus;
    statusMessage?: string;
    class?: string;
    frameSkip?: number;
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
    showLaserBeam = true,
    showCenterGuide = true,
    mirrored = true,
    status = 'idle',
    statusMessage = '',
    class: className = '',
    frameSkip = 2,
    saveToBackend = true,
    onScan,
    onError,
    onReady,
  }: Props = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let overlayCanvas = $state<HTMLCanvasElement | null>(null);
  let hiddenCanvas = $state<HTMLCanvasElement | null>(null);

  let isStreaming = $state(false);
  let stream: MediaStream | null = null;
  let scanAnimationId: number | null = null;
  let frameCounter = 0;
  let lastDetectedPoints = $state<QrPoint[] | null>(null);

  async function startCamera() {
    try {
      if (stream) {
        stopCamera();
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (e) {
        console.warn('High resolution / facingMode constraints failed, falling back to default camera:', e);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.onloadedmetadata = () => {
          syncCanvasDimensions();
          videoEl?.play().catch((err) => console.warn('Video play error:', err));
          isStreaming = true;
          onReady?.();
          scanAnimationId = requestAnimationFrame(scanLoop);
        };
      }
    } catch (err) {
      console.error('Camera stream access failed:', err);
      const msg = err instanceof Error ? err.message : 'Kamera tidak dapat diakses';
      onError?.(msg);
    }
  }

  function stopCamera() {
    if (scanAnimationId !== null) {
      cancelAnimationFrame(scanAnimationId);
      scanAnimationId = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    isStreaming = false;
    clearOverlay();
  }

  function syncCanvasDimensions() {
    if (!videoEl) return;
    const w = videoEl.videoWidth || 640;
    const h = videoEl.videoHeight || 480;

    if (hiddenCanvas) {
      hiddenCanvas.width = w;
      hiddenCanvas.height = h;
    }
    if (overlayCanvas) {
      overlayCanvas.width = w;
      overlayCanvas.height = h;
    }
  }

  async function detectFrame(): Promise<QrScanResult | null> {
    if (!videoEl || !hiddenCanvas || videoEl.readyState < videoEl.HAVE_CURRENT_DATA) {
      return null;
    }

    const w = hiddenCanvas.width;
    const h = hiddenCanvas.height;
    if (w === 0 || h === 0) return null;

    const ctx = hiddenCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(videoEl, 0, 0, w, h);

    // 1. Native BarcodeDetector API (fastest if supported)
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        const barcodes = await detector.detect(hiddenCanvas);
        if (barcodes && barcodes.length > 0) {
          const first = barcodes[0];
          const raw = first.rawValue || '';
          if (raw.trim()) {
            const pts: QrPoint[] = (first.cornerPoints || []).map((p: any) => ({
              x: Number(p.x),
              y: Number(p.y)
            }));
            return { content: raw, cornerPoints: pts };
          }
        }
      } catch {
        // Fall back to jsQR
      }
    }

    // 2. Fallback to jsQR
    try {
      const imageData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });

      if (code && code.data && code.data.trim()) {
        const loc = code.location;
        const pts: QrPoint[] = [
          { x: loc.topLeftCorner.x, y: loc.topLeftCorner.y },
          { x: loc.topRightCorner.x, y: loc.topRightCorner.y },
          { x: loc.bottomRightCorner.x, y: loc.bottomRightCorner.y },
          { x: loc.bottomLeftCorner.x, y: loc.bottomLeftCorner.y }
        ];
        return { content: code.data, cornerPoints: pts };
      }
    } catch (e) {
      console.warn('jsQR detection error:', e);
    }

    return null;
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

  function drawBoundingBox(points: QrPoint[]) {
    if (!overlayCanvas || points.length < 4) return;
    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const colors = getThemeColors();

    // 1. Draw polygon path
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();

    // Fill
    ctx.fillStyle = colors.fill;
    ctx.fill();

    // Stroke with Outer Glow
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
        const curr = points[i];
        const prev = points[(i + 3) % 4];
        const next = points[(i + 1) % 4];

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

    // 3. Corner Dots / Nodes
    if (showCornerDots) {
      points.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = colors.dot;
        ctx.fill();
        ctx.strokeStyle = colors.box;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    // 4. Laser Scan Beam across bounding box
    if (showLaserBeam && (status === 'detecting' || status === 'verifying')) {
      const t = (Math.sin(Date.now() / 180) + 1) / 2; // 0 to 1 oscillating
      const leftBeam = {
        x: points[0].x + (points[3].x - points[0].x) * t,
        y: points[0].y + (points[3].y - points[0].y) * t
      };
      const rightBeam = {
        x: points[1].x + (points[2].x - points[1].x) * t,
        y: points[1].y + (points[2].y - points[1].y) * t
      };

      const grad = ctx.createLinearGradient(leftBeam.x, leftBeam.y, rightBeam.x, rightBeam.y);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
      grad.addColorStop(0.5, colors.box);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.1)');

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(leftBeam.x, leftBeam.y);
      ctx.lineTo(rightBeam.x, rightBeam.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();
    }
  }

  function clearOverlay() {
    if (!overlayCanvas) return;
    const ctx = overlayCanvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }
    lastDetectedPoints = null;
  }

  async function scanLoop() {
    if (!isStreaming) return;

    frameCounter = (frameCounter + 1) % (frameSkip + 1);

    if (frameCounter === 0 && status !== 'verifying' && status !== 'success') {
      const result = await detectFrame();
      if (result && result.content && result.cornerPoints.length >= 4) {
        lastDetectedPoints = result.cornerPoints;
        drawBoundingBox(result.cornerPoints);

        if (saveToBackend) {
          invoke('save_qr_result', {
            data: {
              content: result.content,
              corner_points: result.cornerPoints
            }
          }).catch(() => {
            // Optional Tauri logging fallback
          });
        }

        onScan?.(result);
      } else {
        if (lastDetectedPoints) {
          clearOverlay();
        }
      }
    } else if (lastDetectedPoints && (status === 'verifying' || status === 'success' || status === 'error')) {
      // Keep re-drawing active bounding box animation during verifying/success state
      drawBoundingBox(lastDetectedPoints);
    }

    scanAnimationId = requestAnimationFrame(scanLoop);
  }

  onMount(() => {
    startCamera();
  });

  onDestroy(() => {
    stopCamera();
  });
</script>

<div class={`relative overflow-hidden ${className}`}>
  <!-- Camera Video Stream -->
  <video
    bind:this={videoEl}
    autoplay
    playsinline
    muted
    class={`absolute inset-0 w-full h-full object-cover transition-transform duration-300 ${
      mirrored ? 'transform -scale-x-100' : ''
    }`}
  ></video>

  <!-- Overlay Canvas for Dynamic Bounding Box -->
  <canvas
    bind:this={overlayCanvas}
    class={`absolute inset-0 w-full h-full object-cover pointer-events-none z-10 ${
      mirrored ? 'transform -scale-x-100' : ''
    }`}
  ></canvas>

  <!-- Hidden Processing Canvas -->
  <canvas bind:this={hiddenCanvas} class="hidden"></canvas>

  <!-- Idle / Search Central Guide Reticle -->
  {#if showCenterGuide && !lastDetectedPoints && status !== 'error'}
    <div class="absolute inset-10 border-2 border-dashed border-white/25 rounded-2xl pointer-events-none z-10 flex items-center justify-center">
      <!-- Animated Scan Line -->
      <div class="w-full h-0.5 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-pulse"></div>

      <!-- Reticle corner markers -->
      <div class="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-white/70"></div>
      <div class="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-white/70"></div>
      <div class="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-white/70"></div>
      <div class="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-white/70"></div>
    </div>
  {/if}

  <!-- Status HUD Badge -->
  {#if statusMessage}
    <div
      class={`absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs font-semibold tracking-wide backdrop-blur-md z-20 flex items-center gap-2 shadow-lg border transition-all duration-200 ${
        status === 'success'
          ? 'bg-emerald-500/30 border-emerald-400/60 text-emerald-300'
          : status === 'error'
          ? 'bg-red-500/30 border-red-400/60 text-red-300'
          : status === 'verifying'
          ? 'bg-blue-500/30 border-blue-400/60 text-blue-200'
          : 'bg-black/70 border-white/20 text-white'
      }`}
    >
      {#if status === 'verifying'}
        <span class="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
      {:else if status === 'success'}
        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
      {:else if status === 'error'}
        <span class="w-2 h-2 rounded-full bg-red-400"></span>
      {:else}
        <span class="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
      {/if}
      <span>{statusMessage}</span>
    </div>
  {/if}
</div>
