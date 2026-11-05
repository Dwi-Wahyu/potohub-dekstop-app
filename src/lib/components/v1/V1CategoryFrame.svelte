<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { formatTime, getLiveviewTransformStyle } from '$lib/utils/shared';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { fetchCategories, fetchTemplates, requireActiveBoothId, type BoothCategory, type BoothTemplate } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';
  import ProgressiveImage from '$lib/components/shared/ProgressiveImage.svelte';
  import {
    getTemplateLayers,
    getTotalPhotosNeeded,
    getLayerZIndex,
    getTemplatePreviewBoxStyle,
    preloadAndResolveTemplateAssets
  } from '$lib/utils/templateComposite';

  interface Props {
    onNext: (price: number, frameConfigId: string) => void;
    onBack: () => void;
    background?: string;
  }

  let { onNext, onBack, background }: Props = $props();

  let secs = $state(14 * 60 + 50);
  let timer: any = null;
  let categoryId = $state('');
  let frameId = $state('');

  let categoriesData = $state<BoothCategory[]>([]);
  let templatesData = $state<BoothTemplate[]>([]);
  let loadingCatalog = $state(true);
  let catalogError = $state('');

  function getGridSize(designData: Array<{ x: number; y: number; w: number; h: number; isBackground?: boolean; isQr?: boolean }> | null | undefined) {
    const photoSlots = (designData || []).filter((l) => !l.isBackground && !l.isQr);
    if (photoSlots.length === 0) return { cols: 2, rows: 2, count: 0 };
    
    const xs = new Set<number>();
    const ys = new Set<number>();
    photoSlots.forEach(d => {
      xs.add(Math.round(d.x));
      ys.add(Math.round(d.y));
    });
    
    let cols = xs.size;
    let rows = ys.size;
    
    if (cols === 0) cols = 1;
    if (rows === 0) rows = 1;
    
    if (cols * rows !== photoSlots.length) {
      const len = photoSlots.length;
      if (len === 1) { cols = 1; rows = 1; }
      else if (len === 2) { cols = 1; rows = 2; }
      else if (len === 3) { cols = 1; rows = 3; }
      else if (len === 4) { cols = 2; rows = 2; }
      else if (len === 6) { cols = 2; rows = 3; }
      else if (len === 8) { cols = 2; rows = 4; }
      else { cols = Math.ceil(Math.sqrt(len)); rows = Math.ceil(len / cols); }
    }
    
    return { cols, rows, count: photoSlots.length };
  }

  function getTemplateAccent(templateName: string, index: number): string {
    const name = templateName.toLowerCase();
    if (name.includes('strip')) return '#e2e8f0';
    if (name.includes('grid')) return '#dbeafe';
    if (name.includes('love')) return '#fce7f3';
    if (name.includes('wide')) return '#dcfce7';
    
    const ACCENTS = ['#e2e8f0', '#dbeafe', '#fce7f3', '#dcfce7', '#ede9fe'];
    return ACCENTS[index % ACCENTS.length];
  }

  let selectedCategory = $derived(categoriesData.find((c) => c.id === categoryId));
  let visibleTemplatesForCategory = $derived(templatesData.filter((t) => t.category_id === categoryId));
  let selectedFrame = $derived(templatesData.find((f) => f.id === frameId));

  // Tampilan daftar frame: slider 3D sphere (default) atau grid, sesuai desain Figma
  let viewMode = $state<'grid' | 'slider'>('slider');

  function photoCountOf(t: BoothTemplate): number {
    return getTotalPhotosNeeded(getTemplateLayers(t), 1);
  }

  // State untuk 3D Sphere Slider
  let activeCardId = $state('');
  let scrollOffset = $state(0);
  let sliderContainerEl = $state<HTMLDivElement | null>(null);
  let containerWidth = $state(700);
  let containerHeight = $state(550);
  let isDragging = $state(false);

  // Ukuran kartu proporsional: mengisi kontainer atas dan bawah dengan nyaman
  let thumbHeight = $derived(
    Math.min(340, Math.max(250, Math.round((containerHeight - 140) * 0.92)))
  );
  let thumbWidth = $derived(Math.round(thumbHeight * (205 / 290)));
  let cardWidth = $derived(thumbWidth + 28);

  let scrollTimeout: any = null;
  let wheelTimeout: any = null;
  let animFrameId: number | null = null;

  // Pointer drag dengan real-time 1:1 tracking & velocity momentum
  let startX = 0;
  let startOffset = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocityX = 0;
  let hasMoved = false;

  // Sinkronisasi activeCardId ketika frameId berubah dari luar
  $effect(() => {
    if (frameId) {
      activeCardId = frameId;
      const list = visibleTemplatesForCategory;
      const idx = list.findIndex((t) => t.id === frameId);
      if (idx !== -1 && !isDragging && animFrameId === null) {
        if (Math.abs(scrollOffset - idx) > 0.01) {
          scrollOffset = idx;
        }
      }
    }
  });

  // Debounced commit ke preview kamera di sisi kanan agar liveview tidak patah-patah saat scrolling cepat
  function commitActiveCard(targetOffset: number, immediate = false) {
    const list = visibleTemplatesForCategory;
    if (list.length === 0) return;
    const targetIdx = Math.max(0, Math.min(list.length - 1, Math.round(targetOffset)));
    const targetCard = list[targetIdx];
    if (!targetCard) return;

    if (activeCardId !== targetCard.id) {
      activeCardId = targetCard.id;
    }

    if (scrollTimeout) clearTimeout(scrollTimeout);
    if (immediate) {
      if (frameId !== targetCard.id) frameId = targetCard.id;
    } else {
      scrollTimeout = setTimeout(() => {
        if (frameId !== targetCard.id) {
          frameId = targetCard.id;
        }
      }, 160);
    }
  }

  // Smooth ease-out animation ke target slide index
  function animateToOffset(target: number, durationMs = 320) {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    const list = visibleTemplatesForCategory;
    if (list.length === 0) return;
    const clampedTarget = Math.max(0, Math.min(list.length - 1, target));
    const start = scrollOffset;
    const delta = clampedTarget - start;

    if (Math.abs(delta) < 0.001) {
      scrollOffset = clampedTarget;
      commitActiveCard(clampedTarget, true);
      return;
    }

    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      scrollOffset = start + delta * ease;

      const currentIdx = Math.max(0, Math.min(list.length - 1, Math.round(scrollOffset)));
      const currentCard = list[currentIdx];
      if (currentCard && activeCardId !== currentCard.id) {
        activeCardId = currentCard.id;
      }

      if (progress < 1) {
        animFrameId = requestAnimationFrame(step);
      } else {
        scrollOffset = clampedTarget;
        animFrameId = null;
        commitActiveCard(clampedTarget, true);
      }
    }
    animFrameId = requestAnimationFrame(step);
  }

  function goFrame(direction: -1 | 1) {
    const list = visibleTemplatesForCategory;
    if (list.length === 0) return;
    const currentIdx = Math.round(scrollOffset);
    const nextIdx = Math.max(0, Math.min(list.length - 1, currentIdx + direction));
    animateToOffset(nextIdx, 320);
  }

  function onCardClick(targetId: string, index: number) {
    if (hasMoved) {
      hasMoved = false;
      return;
    }
    animateToOffset(index, 320);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!sliderContainerEl) return;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    lastX = e.clientX;
    startOffset = scrollOffset;
    lastTime = performance.now();
    velocityX = 0;
    try {
      sliderContainerEl.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) {
      hasMoved = true;
    }
    const now = performance.now();
    const dt = now - lastTime;
    if (dt > 8) {
      velocityX = (e.clientX - lastX) / dt;
      lastX = e.clientX;
      lastTime = now;
    }

    const list = visibleTemplatesForCategory;
    const n = list.length;
    const baseStep = Math.min(200, Math.max(140, containerWidth * 0.22));
    let nextOffset = startOffset - (dx / (baseStep * 1.05));

    // Rubber-banding saat melewati batas kiri/kanan
    if (nextOffset < 0) {
      nextOffset = -Math.pow(-nextOffset, 0.75) * 0.35;
    } else if (nextOffset > n - 1) {
      const over = nextOffset - (n - 1);
      nextOffset = (n - 1) + Math.pow(over, 0.75) * 0.35;
    }

    scrollOffset = nextOffset;

    const currentIdx = Math.max(0, Math.min(n - 1, Math.round(scrollOffset)));
    const currentCard = list[currentIdx];
    if (currentCard && activeCardId !== currentCard.id) {
      activeCardId = currentCard.id;
      commitActiveCard(currentIdx, false);
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!isDragging) return;
    isDragging = false;
    if (sliderContainerEl) {
      try {
        sliderContainerEl.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }

    const list = visibleTemplatesForCategory;
    const n = list.length;
    if (n <= 1) {
      animateToOffset(0, 200);
      return;
    }

    let targetIdx = Math.round(scrollOffset);
    if (Math.abs(velocityX) > 0.3) {
      const flickDirection = -Math.sign(velocityX);
      const flickMagnitude = Math.abs(velocityX) > 1.2 ? 2 : 1;
      targetIdx = Math.round(scrollOffset + flickDirection * flickMagnitude);
    }
    targetIdx = Math.max(0, Math.min(n - 1, targetIdx));
    animateToOffset(targetIdx, 340);
  }

  function onPointerCancel(e: PointerEvent) {
    if (!isDragging) return;
    isDragging = false;
    if (sliderContainerEl) {
      try {
        sliderContainerEl.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
    const list = visibleTemplatesForCategory;
    const targetIdx = Math.max(0, Math.min(list.length - 1, Math.round(scrollOffset)));
    animateToOffset(targetIdx, 250);
  }

  function onTrackWheel(e: WheelEvent) {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : (Math.abs(e.deltaY) > 20 ? e.deltaY * 0.5 : 0));
    if (Math.abs(delta) < 2) return;
    e.preventDefault();
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    const list = visibleTemplatesForCategory;
    const n = list.length;
    const step = delta / 320;
    scrollOffset = Math.max(-0.25, Math.min(n - 0.75, scrollOffset + step));

    const currentIdx = Math.max(0, Math.min(n - 1, Math.round(scrollOffset)));
    const currentCard = list[currentIdx];
    if (currentCard && activeCardId !== currentCard.id) {
      activeCardId = currentCard.id;
      commitActiveCard(currentIdx, false);
    }

    if (wheelTimeout) clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(() => {
      const target = Math.max(0, Math.min(n - 1, Math.round(scrollOffset)));
      animateToOffset(target, 280);
    }, 100);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (viewMode !== 'slider') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goFrame(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goFrame(1);
    }
  }

  /**
   * Geometri 3D Sphere & Exponential Scaling:
   * - Center (d = 0): dominan paling besar (scale 1.0, opacity 1.0, Z=0)
   * - Samping (|d| = 1): mengecil secara eksponensial (scale = 0.76, rotY = -/+26deg, Z=-85px)
   * - Samping (|d| = 2): makin mengecil secara eksponensial (scale = 0.578, rotY = -/+39deg, Z=-202px)
   * - Maksimal 5 frame per slide: bila |d| > 2.25, kartu disembunyikan (display: none / opacity: 0)
   */
  function getCardGeom(index: number, offset: number, containerW: number) {
    const d = index - offset;
    const absD = Math.abs(d);

    if (absD > 2.25) {
      return {
        visible: false,
        scale: 0,
        rotY: 0,
        transZ: 0,
        transX: 0,
        opacity: 0,
        zIndex: 0,
        brightness: 0,
        isCenter: false
      };
    }

    // 1. Skala eksponensial: 1.0 -> 0.76 -> 0.578
    const scale = Math.pow(0.76, absD);

    // 2. Rotasi 3D melengkung sphere/silinder
    const rotY = -Math.sign(d) * Math.min(42, Math.pow(absD, 0.85) * 26);

    // 3. Kedalaman 3D Z (masuk ke dalam bola)
    const transZ = -Math.pow(absD, 1.25) * 85;

    // 4. Jarak horizontal busur bola
    const baseStep = Math.min(195, Math.max(140, containerW * 0.22));
    const transX = d * baseStep * (1 - absD * 0.035);

    // 5. Opacity memudar halus di pinggir
    let opacity = 1.0;
    if (absD <= 1.0) {
      opacity = 1.0 - absD * 0.18;
    } else if (absD <= 2.0) {
      opacity = 0.82 - (absD - 1.0) * 0.34;
    } else {
      opacity = Math.max(0, 0.48 - (absD - 2.0) * 1.92);
    }

    // 6. Penumpukan z-index (tengah paling depan)
    const zIndex = Math.round(50 - absD * 15);

    // 7. Pencahayaan spherical (tengah paling terang)
    const brightness = Math.max(0.65, 1 - absD * 0.14);

    return {
      visible: true,
      scale,
      rotY,
      transZ,
      transX,
      opacity,
      zIndex,
      brightness,
      isCenter: absD < 0.45
    };
  }

  let liveviewInterval: any = null;
  let frameSrc = $state('');
  let videoEl = $state<HTMLVideoElement | null>(null);

  function playStream(node: HTMLVideoElement, stream: MediaStream | null) {
    cameraStore.setVideoElement(node);
    if (stream && node.srcObject !== stream) {
      node.srcObject = stream;
      node.muted = true;
      node.playsInline = true;
      node.play().catch(() => {});
    }
    return {
      update(newStream: MediaStream | null) {
        cameraStore.setVideoElement(node);
        if (newStream) {
          if (node.srcObject !== newStream) {
            node.srcObject = newStream;
            node.muted = true;
            node.playsInline = true;
            node.play().catch(() => {});
          }
        } else {
          node.srcObject = null;
        }
      },
      destroy() {
        cameraStore.setVideoElement(null);
        node.srcObject = null;
      }
    };
  }

  async function loadCatalog() {
    loadingCatalog = true;
    catalogError = '';
    try {
      const boothId = await requireActiveBoothId();
      // Render instan dari cache SQLite bila ada, refresh di latar belakang
      await cachedFetch(
        `categories:${boothId}`,
        () => fetchCategories(boothId),
        (d) => {
          categoriesData = d;
          preloadAndResolveTemplateAssets(templatesData, d);
        }
      );
      await cachedFetch(
        `templates:${boothId}`,
        () => fetchTemplates(boothId),
        (d) => {
          templatesData = d;
          preloadAndResolveTemplateAssets(d, categoriesData);
          if (categoryId && !frameId) {
            const vis = d.filter((t) => t.category_id === categoryId);
            if (vis[0]) frameId = vis[0].id;
          }
        }
      );
      if (categoriesData[0]) {
        categoryId = categoriesData[0].id;
        const visible = templatesData.filter((t) => t.category_id === categoryId);
        if (visible[0]) {
          frameId = visible[0].id;
        }
      }
    } catch (err) {
      console.error('[V1CategoryFrame] Gagal memuat katalog:', err);
      catalogError = 'Gagal memuat katalog. Periksa koneksi ke server atau status aktivasi booth.';
    } finally {
      loadingCatalog = false;
    }
  }

  onMount(async () => {
    timer = setInterval(() => {
      if (secs > 0) secs--;
      else {
        clearInterval(timer);
        onBack();
      }
    }, 1000);

    const catalogPromise = loadCatalog();

    await cameraStore.startLiveview(videoEl);
    if (cameraStore.cameraMode === 'usb' || cameraStore.cameraMode === 'demo') {
      const firstFrame = await cameraStore.getLiveviewFrame();
      if (firstFrame) {
        frameSrc = firstFrame;
      }
      let fetchingFrame = false;
      liveviewInterval = setInterval(async () => {
        if (fetchingFrame) return;
        fetchingFrame = true;
        try {
          const url = await cameraStore.getLiveviewFrame();
          if (url) {
            frameSrc = url;
          }
        } finally {
          fetchingFrame = false;
        }
      }, 150);
    }

    await catalogPromise;
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (liveviewInterval) clearInterval(liveviewInterval);
    if (scrollTimeout) clearTimeout(scrollTimeout);
    if (wheelTimeout) clearTimeout(wheelTimeout);
    if (animFrameId) cancelAnimationFrame(animFrameId);
    cameraStore.stopLiveview();
  });

  const fmtPrice = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
  const DEFAULT_BG = 'linear-gradient(135deg, #1e1b4b 0%, #2a2873 50%, #312e81 100%)';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('frame').background ?? DEFAULT_BG);
</script>

<svelte:window onkeydown={onKeyDown} />

<div
  class="w-full h-full overflow-hidden flex flex-col font-['Plus_Jakarta_Sans',sans-serif] text-[#f0edf8] relative"
  style:background={effectiveBg}
>
  <!-- Watermark -->
  <!-- <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
    <span class="text-[clamp(180px,22vw,380px)] font-black text-white/[0.028] tracking-[-0.04em] whitespace-nowrap leading-none select-none">
      {uiConfig.config.boothName}
    </span>
  </div> -->

  <!-- Top bar -->
  <div class="flex justify-between items-center px-10 pt-7 pb-5 shrink-0 relative z-10">
    <button
      onclick={onBack}
      class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-transparent border border-white/25 text-white/65 cursor-pointer transition-colors duration-150 hover:border-white/40 hover:text-white"
    >
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path d="M15.75 19.5L8.25 12l7.5-7.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      Kembali
    </button>

    <div class="flex items-center gap-2 bg-white/95 text-[#0f0e14] px-[22px] py-[11px] rounded-full font-bold text-base shadow-[0_6px_24px_rgba(0,0,0,0.4)]">
      <svg width="15" height="15" fill="none" stroke={uiConfig.config.primaryColor} stroke-width="2.5" viewBox="0 0 24 24">
        <path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="tabular-nums">{formatTime(secs)}</span>
    </div>
  </div>

  <!-- Main content -->
  <div class="flex-grow min-h-0 flex gap-4 px-10 pb-7 relative z-10">
    {#if loadingCatalog}
      <div class="flex-1 flex flex-col items-center justify-center bg-[#111117]/80 rounded-[20px] border border-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        <div class="w-12 h-12 rounded-full border-4 border-white/10 border-t-white animate-spin mb-4"></div>
        <div class="text-sm font-bold text-[#f0edf8]">Memuat Katalog...</div>
        <div class="text-xs text-white/65 mt-1">Mengambil data kategori dan template</div>
      </div>
    {:else if catalogError}
      <div class="flex-1 flex flex-col items-center justify-center bg-[#111117]/80 rounded-[20px] border border-red-500/20 shadow-[0_24px_80px_rgba(0,0,0,0.6)] p-6">
        <svg width="48" height="48" fill="none" stroke="#ef4444" stroke-width="2" viewBox="0 0 24 24" class="mb-4">
          <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div class="text-base font-bold text-red-400 mb-1">{catalogError}</div>
        <div class="text-xs text-white/65 mb-6 text-center max-w-md">Koneksi ke server API gagal atau booth belum teraktivasi. Silakan periksa koneksi atau aktivasi ulang booth.</div>
        <button
          onclick={() => loadCatalog()}
          class="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border-none text-[#f0edf8] cursor-pointer font-bold text-sm transition-colors duration-150"
        >
          Coba Lagi
        </button>
      </div>
    {:else}
      <!-- Left: Pilih Kategori -->
      <div class="w-[220px] shrink-0 bg-[#111117] rounded-[20px] border border-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden">
        <div class="px-5 pt-[18px] pb-3.5 border-b border-white/5">
          <div class="text-[15px] font-bold text-[#f0edf8] mb-0.5">Pilih Kategori</div>
          <div class="text-xs text-white/65">Pilih tema untuk sesi foto</div>
        </div>
        <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
          {#each categoriesData as cat}
            {@const sel = cat.id === categoryId}
            {@const firstTemplate = templatesData.find((t) => t.category_id === cat.id)}
            {@const bgLayer = firstTemplate?.design_data?.find((l) => l.isBackground)}
            {@const catImg = cat.banner_url || (cat as any).image_url || (cat as any).icon_url || firstTemplate?.preview_image_url || firstTemplate?.frame_image_url || bgLayer?.imageUrl}
            <button
              onclick={() => {
                categoryId = cat.id;
                const visible = templatesData.filter((t) => t.category_id === cat.id);
                if (visible.length > 0) {
                  if (!visible.some((t) => t.id === frameId)) {
                    frameId = visible[0].id;
                    activeCardId = visible[0].id;
                  }
                } else {
                  frameId = '';
                  activeCardId = '';
                }
              }}
              class={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl cursor-pointer text-left transition-colors duration-150 relative ${
                sel ? '' : 'bg-[#1a1824] hover:bg-[#22202a]'
              }`}
              style="
                background-color: {sel ? `${uiConfig.config.primaryColor}1F` : undefined};
                border: 1.5px solid {sel ? uiConfig.config.primaryColor : 'transparent'};
              "
            >
              <div class="w-[52px] h-[52px] rounded-xl shrink-0 flex items-center justify-center overflow-hidden bg-[#313135] relative border border-white/10">
                {#if catImg}
                  <ProgressiveImage
                    src={catImg}
                    blurSrc={cat.banner_blur}
                    alt={cat.name}
                    class="w-full h-full"
                    objectFit="cover"
                  />
                {:else}
                  <div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-white/70 font-bold text-lg uppercase">
                    {cat.name.charAt(0)}
                  </div>
                {/if}
              </div>
              <div>
                <div class="text-sm font-bold" style="color: {sel ? uiConfig.config.primaryColor : '#f0edf8'}">
                  {cat.name}
                </div>
                <div class="text-[11px] text-white/65 mt-0.5">Sesi {cat.name}</div>
              </div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Center: Pilih Frame (Grid / Slider) -->
      <div class="flex-1 min-w-0 bg-[#111117] rounded-[20px] border border-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden">
        <div class="px-6 pt-[18px] pb-3.5 border-b border-white/5 flex items-center justify-between gap-3">
          <div>
            <div class="text-[15px] font-bold text-[#f0edf8] mb-0.5">Pilih Frame</div>
            <div class="text-xs text-white/65">Tentukan jumlah dan susunan foto</div>
          </div>
          <div class="flex gap-1 p-1 rounded-xl bg-black/40 shrink-0" role="tablist" aria-label="Tampilan frame">
            <button
              role="tab"
              aria-selected={viewMode === 'grid'}
              aria-label="Grid"
              onclick={() => (viewMode = 'grid')}
              class="w-11 h-10 rounded-lg flex items-center justify-center border-none cursor-pointer transition-colors {viewMode === 'grid' ? 'bg-white text-[#111117]' : 'bg-transparent text-white/65 hover:text-white'}"
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" stroke-linejoin="round" /></svg>
            </button>
            <button
              role="tab"
              aria-selected={viewMode === 'slider'}
              aria-label="Slider"
              onclick={() => {
                viewMode = 'slider';
                const list = visibleTemplatesForCategory;
                const idx = list.findIndex((t) => t.id === frameId);
                if (idx !== -1) {
                  scrollOffset = idx;
                  activeCardId = frameId;
                }
              }}
              class="w-11 h-10 rounded-lg flex items-center justify-center border-none cursor-pointer transition-colors {viewMode === 'slider' ? 'bg-white text-[#111117]' : 'bg-transparent text-white/65 hover:text-white'}"
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 5h8v14H8zM3 8v8M21 8v8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </div>
        </div>

        {#snippet frameThumb(f: BoothTemplate, boxW: number, boxH: number)}
          {@const tLayers = getTemplateLayers(f)}
          {@const bgLayer = tLayers.find((l) => l.isBackground)}
          {@const bgUrl = bgLayer?.imageUrl || f.frame_image_url}
          {@const tW = f.width || 1200}
          {@const tH = f.height || 1800}
          <div
            class="relative flex items-center justify-center shrink-0 pointer-events-none select-none bg-transparent"
            style="width: {boxW}px; height: {boxH}px; container-type: size; -webkit-user-drag: none; user-select: none;"
          >
            <div
              class="relative overflow-hidden rounded-xl border-[1.5px] border-white/40 shadow-md flex items-center justify-center pointer-events-none select-none"
              style={getTemplatePreviewBoxStyle(tW, tH)}
            >
              {#if f.preview_image_url}
                <ProgressiveImage
                  src={f.preview_image_url}
                  blurSrc={f.preview_blur}
                  alt={f.name}
                  class="w-full h-full pointer-events-none select-none rounded-[10px]"
                  objectFit="fill"
                />
              {:else if tLayers.length > 0}
                {#each tLayers.filter((l) => !l.isQr) as layer, idx (layer.id ?? idx)}
                  <div
                    class="absolute overflow-hidden pointer-events-none select-none"
                    style="
                      left: {((layer.x || 0) / tW) * 100}%;
                      top: {((layer.y || 0) / tH) * 100}%;
                      width: {((layer.w || 200) / tW) * 100}%;
                      height: {((layer.h || 200) / tH) * 100}%;
                      transform: rotate({layer.rot || 0}deg);
                      z-index: {getLayerZIndex(layer, tLayers)};
                    "
                  >
                    {#if layer.isBackground}
                      {@const layerBgUrl = uiConfig.resolveAssetUrl(layer.imageUrl || bgUrl)}
                      {#if layerBgUrl}
                        <img
                          src={layerBgUrl}
                          alt="Template Frame"
                          draggable="false"
                          class="w-full h-full object-fill block pointer-events-none select-none rounded-[10px]"
                        />
                      {/if}
                    {:else}
                      <div class="w-full h-full bg-white/20 rounded-[2px] flex items-center justify-center text-[8px] text-white/70 pointer-events-none select-none">📷</div>
                    {/if}
                  </div>
                {/each}
              {:else if bgUrl}
                <img
                  src={uiConfig.resolveAssetUrl(bgUrl)}
                  alt="Template Frame"
                  draggable="false"
                  class="w-full h-full object-fill block pointer-events-none select-none rounded-[10px]"
                />
              {:else}
                <div class="text-white/65 text-[10px] pointer-events-none select-none">No Preview</div>
              {/if}
            </div>
          </div>
        {/snippet}

        {#if visibleTemplatesForCategory.length === 0}
          <div class="flex-1 flex items-center justify-center text-center text-white/65 text-sm px-6">
            Tidak ada template untuk kategori ini
          </div>
        {:else if viewMode === 'slider'}
          {@const list = visibleTemplatesForCategory}
          {@const n = list.length}
          {@const currentActiveIdx = Math.max(0, Math.min(n - 1, Math.round(scrollOffset)))}
          <div
            bind:this={sliderContainerEl}
            bind:clientWidth={containerWidth}
            bind:clientHeight={containerHeight}
            role="presentation"
            onwheel={onTrackWheel}
            onpointerdown={onPointerDown}
            onpointermove={onPointerMove}
            onpointerup={onPointerUp}
            onpointercancel={onPointerCancel}
            class="relative flex-1 min-h-0 w-full flex flex-col justify-between items-center overflow-hidden py-3 select-none outline-none cursor-grab active:cursor-grabbing"
            style="touch-action: pan-y;"
          >
            <!-- Tombol Panah Kiri -->
            <button
              type="button"
              onclick={(e) => { e.stopPropagation(); goFrame(-1); }}
              disabled={list.length <= 1 || currentActiveIdx <= 0}
              class="absolute left-3.5 top-1/2 -translate-y-1/2 z-40 w-12 h-12 rounded-full bg-white text-[#111117] flex items-center justify-center border-none cursor-pointer shrink-0 active:scale-95 hover:scale-105 transition-all shadow-[0_8px_24px_rgba(0,0,0,0.5)] disabled:opacity-20 disabled:pointer-events-none"
              aria-label="Sebelumnya"
            >
              <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M15.75 19.5L8.25 12l7.5-7.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <!-- 3D Sphere Carousel Stage -->
            <div
              class="relative flex-1 w-full min-h-0 flex items-center justify-center pointer-events-none"
              style="
                perspective: 1200px;
                perspective-origin: 50% 50%;
                transform-style: preserve-3d;
              "
            >
              {#each list as t, i (t.id)}
                {@const geom = getCardGeom(i, scrollOffset, containerWidth)}
                {#if geom.visible}
                  <div
                    data-card-id={t.id}
                    class="absolute top-1/2 left-1/2 pointer-events-auto select-none"
                    style="
                      width: {cardWidth}px;
                      transform: translate(-50%, -50%) translate3d({geom.transX}px, 0px, {geom.transZ}px) rotateY({geom.rotY}deg) scale({geom.scale});
                      opacity: {geom.opacity};
                      filter: brightness({geom.brightness});
                      z-index: {geom.zIndex};
                      transform-origin: center center;
                      transform-style: preserve-3d;
                      will-change: transform, opacity;
                      transition: {isDragging ? 'none' : 'transform 0.08s ease-out, opacity 0.08s ease-out'};
                    "
                  >
                    <button
                      type="button"
                      draggable="false"
                      ondragstart={(e) => e.preventDefault()}
                      onclick={() => onCardClick(t.id, i)}
                      aria-label={`Pilih template ${t.name}`}
                      class="w-full flex flex-col items-center gap-3 p-3.5 rounded-2xl cursor-pointer text-left select-none outline-none transition-all duration-200"
                      style="
                        background-color: {geom.isCenter ? `${uiConfig.config.primaryColor}1F` : '#1a1824'};
                        border: 2px solid {geom.isCenter ? uiConfig.config.primaryColor : 'rgba(255,255,255,0.08)'};
                        box-shadow: {geom.isCenter ? `0 16px 45px -6px ${uiConfig.config.primaryColor}65, 0 0 24px -2px ${uiConfig.config.primaryColor}35` : '0 8px 24px rgba(0,0,0,0.35)'};
                        user-select: none;
                        -webkit-user-select: none;
                        -webkit-user-drag: none;
                      "
                    >
                      {@render frameThumb(t, thumbWidth, thumbHeight)}
                      <div class="text-center w-full px-1">
                        <div
                          class="text-[14px] font-bold truncate transition-colors duration-200"
                          style="color: {geom.isCenter ? uiConfig.config.primaryColor : '#f0edf8'}"
                        >
                          {t.name}
                        </div>
                        <div class="text-[11px] text-white/60 mt-0.5">
                          {photoCountOf(t)} foto
                        </div>
                      </div>
                    </button>
                  </div>
                {/if}
              {/each}
            </div>

            <!-- Tombol Panah Kanan -->
            <button
              type="button"
              onclick={(e) => { e.stopPropagation(); goFrame(1); }}
              disabled={list.length <= 1 || currentActiveIdx >= list.length - 1}
              class="absolute right-3.5 top-1/2 -translate-y-1/2 z-40 w-12 h-12 rounded-full bg-white text-[#111117] flex items-center justify-center border-none cursor-pointer shrink-0 active:scale-95 hover:scale-105 transition-all shadow-[0_8px_24px_rgba(0,0,0,0.5)] disabled:opacity-20 disabled:pointer-events-none"
              aria-label="Berikutnya"
            >
              <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M8.25 4.5l7.5 7.5-7.5 7.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <!-- Dots Indicator -->
            <div class="flex items-center gap-1.5 pt-2 relative z-30 pointer-events-auto">
              {#each list as t, i (t.id)}
                {@const isDotActive = i === currentActiveIdx}
                <button
                  type="button"
                  onclick={(e) => { e.stopPropagation(); animateToOffset(i); }}
                  aria-label={t.name}
                  class="h-1.5 rounded-full border-none cursor-pointer p-0 transition-all duration-300"
                  style="width: {isDotActive ? 24 : 6}px; background-color: {isDotActive ? uiConfig.config.primaryColor : 'rgba(255,255,255,0.25)'};"
                ></button>
              {/each}
              <span class="ml-2 text-[11px] text-white/60 tabular-nums">
                {currentActiveIdx + 1}/{n}
              </span>
            </div>
          </div>
        {:else}
          <div class="flex-1 overflow-y-auto px-6 py-5">
            <div class="grid grid-cols-3 gap-3.5 content-start">
              {#each visibleTemplatesForCategory as f (f.id)}
                {@const sel = f.id === frameId}
                <button
                  onclick={() => (frameId = f.id)}
                  class={`flex flex-col items-center gap-2.5 p-3 rounded-2xl cursor-pointer transition-colors duration-150 ${
                    sel ? '' : 'bg-[#1a1824] hover:bg-[#22202a]'
                  }`}
                  style="
                    background-color: {sel ? `${uiConfig.config.primaryColor}1F` : undefined};
                    border: 1.5px solid {sel ? uiConfig.config.primaryColor : 'transparent'};
                  "
                >
                  {@render frameThumb(f, 100, 130)}
                  <div class="text-center">
                    <div class="text-[13px] font-semibold" style="color: {sel ? uiConfig.config.primaryColor : '#f0edf8'}">
                      {f.name}
                    </div>
                    <div class="text-[11px] text-white/65 mt-0.5">{photoCountOf(f)} foto</div>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Right: Preview + price + button -->
      <div class="w-[340px] shrink-0 bg-[#111117] rounded-[20px] border border-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden">
        <div class="px-6 pt-[18px] pb-3.5 border-b border-white/5">
          <div class="text-[15px] font-bold text-[#f0edf8] mb-0.5">Preview</div>
          <div class="text-xs text-white/65">Tampilan hasil foto kamu</div>
        </div>

        <div class="flex-1 min-h-0 flex flex-col pt-4 px-5">
          {#if selectedFrame}
            {@const templateLayers = getTemplateLayers(selectedFrame)}
            {@const bgLayer = templateLayers.find((l) => l.isBackground)}
            {@const bgUrl = bgLayer?.imageUrl || selectedFrame.frame_image_url}
            {@const tWidth = selectedFrame.width || 1200}
            {@const tHeight = selectedFrame.height || 1800}

            <div class="w-full flex-1 min-h-0 flex items-center justify-center p-1" style="container-type: size;">
              <div
                class="relative overflow-hidden rounded-xl border-[1.5px] border-white/30 shadow-xl"
                style={getTemplatePreviewBoxStyle(tWidth, tHeight)}
              >
                {#if templateLayers.length > 0}
                  {#each templateLayers.filter((l) => !l.isQr) as layer, idx (layer.isBackground ? 'bg-frame-layer' : `slot-${idx}`)}
                    {@const layerZIndex = getLayerZIndex(layer, templateLayers)}
                    <div
                      class={`absolute overflow-hidden ${layer.isBackground ? 'pointer-events-none' : ''}`}
                      style="
                        left: {((layer.x || 0) / tWidth) * 100}%;
                        top: {((layer.y || 0) / tHeight) * 100}%;
                        width: {((layer.w || 200) / tWidth) * 100}%;
                        height: {((layer.h || 200) / tHeight) * 100}%;
                        transform: rotate({layer.rot || 0}deg);
                        z-index: {layerZIndex};
                        pointer-events: {layer.isBackground ? 'none' : 'auto'};
                        transition: left 0.15s ease-out, top 0.15s ease-out, width 0.15s ease-out, height 0.15s ease-out;
                      "
                    >
                      {#if layer.isBackground}
                        {@const layerBgUrl = uiConfig.resolveAssetUrl(layer.imageUrl || bgUrl)}
                        {#if layerBgUrl}
                          <img
                            src={layerBgUrl}
                            alt="Frame Overlay"
                            loading="eager"
                            decoding="async"
                            class="w-full h-full object-fill pointer-events-none block"
                          />
                        {/if}
                      {:else}
                        <div class="w-full h-full bg-black/40 relative">
                          {#if cameraStore.isLiveviewActive || frameSrc}
                            {#if cameraStore.cameraMode === 'webcam'}
                              <video
                                use:playStream={cameraStore.stream}
                                autoplay
                                playsinline
                                muted
                                class="w-full h-full object-cover"
                                style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
                              ></video>
                            {:else if frameSrc}
                              <img
                                src={frameSrc}
                                alt="Live view"
                                class="w-full h-full object-cover block"
                                style="transform: {getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode)};"
                              />
                            {:else}
                              <div class="w-full h-full flex items-center justify-center text-white/65 text-[10px] animate-pulse">
                                Live View...
                              </div>
                            {/if}
                          {:else}
                            <div class="w-full h-full flex items-center justify-center text-white/65 text-[10px]">
                              Live View
                            </div>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-white/65 text-xs">
                    Format template tidak valid
                  </div>
                {/if}
              </div>
            </div>
          {:else}
            <div class="w-full flex-1 min-h-0 rounded-2xl bg-[#1a1824] flex items-center justify-center text-white/65 text-sm">
              Pilih frame untuk melihat preview
            </div>
          {/if}
        </div>

        <div class="px-6 py-5 border-t border-white/5 mt-4">
          <div class="flex justify-between items-center mb-3.5">
            {#if selectedCategory && selectedFrame}
              {@const grid = getGridSize(selectedFrame.design_data)}
              <div>
                <div class="text-[11px] text-white/65 mb-0.5">Total harga</div>
                <div class="text-2xl font-extrabold text-[#f0edf8]">{fmtPrice(selectedCategory.base_price)}</div>
              </div>
              <div class="text-xs text-white/65 text-right">
                {photoCountOf(selectedFrame)} foto<br />
                <span class="text-[11px]">{selectedCategory.name}</span>
              </div>
            {:else}
              <div>
                <div class="text-[11px] text-white/65 mb-0.5">Total harga</div>
                <div class="text-2xl font-extrabold text-[#f0edf8]">-</div>
              </div>
            {/if}
          </div>

          <button
            onclick={() => selectedCategory && selectedFrame && onNext(selectedCategory.base_price, selectedFrame.id)}
            disabled={!selectedCategory || !selectedFrame}
            class="w-full py-4 rounded-full font-bold text-[17px] flex items-center justify-center gap-2.5 border-none cursor-pointer transition-all duration-150 hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style="
              background-color: {uiConfig.config.primaryColor};
              color: #1a0a00;
            "
          >
            Lanjut
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
              <path d="M8.25 4.5l7.5 7.5-7.5 7.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  img {
    -webkit-user-drag: none;
    user-select: none;
    -webkit-user-select: none;
  }

  @keyframes slideFromRight {
    0% {
      transform: translateX(40px) scale(0.93);
      opacity: 0.45;
    }
    100% {
      transform: translateX(0) scale(1);
      opacity: 1;
    }
  }

  @keyframes slideFromLeft {
    0% {
      transform: translateX(-40px) scale(0.93);
      opacity: 0.45;
    }
    100% {
      transform: translateX(0) scale(1);
      opacity: 1;
    }
  }

  .animate-slide-left {
    animation: slideFromRight 0.28s cubic-bezier(0.2, 0.9, 0.35, 1) forwards;
  }

  .animate-slide-right {
    animation: slideFromLeft 0.28s cubic-bezier(0.2, 0.9, 0.35, 1) forwards;
  }
</style>
