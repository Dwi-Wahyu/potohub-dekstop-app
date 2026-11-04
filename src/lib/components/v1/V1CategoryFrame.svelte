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

  // Tampilan daftar frame: grid (default) atau slider satu-per-satu, sesuai desain Figma
  let viewMode = $state<'grid' | 'slider'>('grid');

  function photoCountOf(t: BoothTemplate): number {
    return getTotalPhotosNeeded(getTemplateLayers(t), 1);
  }

  // State terpisah untuk slider UI vs preview frame live view (State Decoupling)
  let activeCardId = $state('');
  let sliderEl = $state<HTMLDivElement | null>(null);
  let scrollTimeout: any = null;

  // Pointer drag dengan momentum flick multi-card & real-time edging
  let isPointerDown = false;
  let startX = 0;
  let startScrollLeft = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocityX = 0;
  let hasMoved = false;

  // Sinkronisasi activeCardId ketika frameId berubah dari luar (misal awal katalog dimuat atau ganti kategori)
  $effect(() => {
    if (frameId) {
      activeCardId = frameId;
      if (viewMode === 'slider') {
        setTimeout(() => scrollToCard(frameId, false), 40);
      }
    }
  });

  function scrollToCard(targetId: string, smooth = true) {
    if (!sliderEl) return;
    const targetCard = sliderEl.querySelector<HTMLElement>(`[data-card-id="${targetId}"]`);
    if (targetCard) {
      const containerWidth = sliderEl.clientWidth;
      const cardLeft = targetCard.offsetLeft;
      const cardWidth = targetCard.offsetWidth;
      const targetScrollLeft = cardLeft - (containerWidth - cardWidth) / 2;
      sliderEl.scrollTo({
        left: targetScrollLeft,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }

  function getClosestCardId(): string {
    if (!sliderEl) return activeCardId;
    const containerCenter = sliderEl.scrollLeft + sliderEl.clientWidth / 2;
    const cards = sliderEl.querySelectorAll<HTMLElement>('[data-card-id]');
    let closestId = '';
    let minDistance = Infinity;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(containerCenter - cardCenter);
      if (dist < minDistance) {
        minDistance = dist;
        closestId = card.dataset.cardId || '';
      }
    }
    return closestId || activeCardId;
  }

  function onTrackScroll() {
    const closestId = getClosestCardId();
    if (closestId && closestId !== activeCardId) {
      activeCardId = closestId;
    }

    // Debounce commit ke preview live view kamera di sisi kanan (180ms)
    // Stream kamera di kanan sama sekali tidak freeze atau patah-patah selama scroll
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (closestId && frameId !== closestId) {
        frameId = closestId;
      }
    }, 180);
  }

  function onTrackScrollEnd() {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    const closestId = getClosestCardId();
    if (closestId && frameId !== closestId) {
      frameId = closestId;
    }
  }

  function goFrame(direction: -1 | 1) {
    const list = visibleTemplatesForCategory;
    if (list.length === 0) return;
    const currentId = activeCardId || frameId;
    const idx = Math.max(0, list.findIndex((t) => t.id === currentId));
    const nextIdx = Math.max(0, Math.min(list.length - 1, idx + direction));
    const nextCard = list[nextIdx];
    if (nextCard) {
      activeCardId = nextCard.id;
      scrollToCard(nextCard.id, true);
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        frameId = nextCard.id;
      }, 180);
    }
  }

  function onCardClick(targetId: string) {
    if (hasMoved) {
      hasMoved = false;
      return;
    }
    activeCardId = targetId;
    scrollToCard(targetId, true);
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      frameId = targetId;
    }, 180);
  }

  function onTrackPointerDown(e: PointerEvent) {
    if (!sliderEl) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    isPointerDown = true;
    hasMoved = false;
    startX = e.clientX;
    lastX = e.clientX;
    startScrollLeft = sliderEl.scrollLeft;
    lastTime = performance.now();
    velocityX = 0;
    try {
      sliderEl.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function onTrackPointerMove(e: PointerEvent) {
    if (!isPointerDown || !sliderEl) return;
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
    // 1:1 real-time drag (mendukung edging yang sangat natural dan halus)
    sliderEl.scrollLeft = startScrollLeft - dx;
  }

  function onTrackPointerUp(e: PointerEvent) {
    if (!isPointerDown || !sliderEl) return;
    isPointerDown = false;
    try {
      sliderEl.releasePointerCapture(e.pointerId);
    } catch (_) {}

    // Jika di-flick kencang, teruskan momentum melintasi beberapa template sekaligus
    if (Math.abs(velocityX) > 0.35) {
      const momentumDistance = -velocityX * 380;
      sliderEl.scrollBy({
        left: momentumDistance,
        behavior: 'smooth'
      });
    }
  }

  function onTrackPointerCancel(e: PointerEvent) {
    if (!isPointerDown || !sliderEl) return;
    isPointerDown = false;
    try {
      sliderEl.releasePointerCapture(e.pointerId);
    } catch (_) {}
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
    cameraStore.stopLiveview();
  });

  const fmtPrice = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
  const DEFAULT_BG = 'linear-gradient(135deg, #1e1b4b 0%, #2a2873 50%, #312e81 100%)';
  let effectiveBg = $derived(background ?? uiConfig.getStepStyle('frame').background ?? DEFAULT_BG);
</script>

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
                activeCardId = frameId;
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
          <div
            class="rounded-xl overflow-hidden relative shadow-md bg-black/40 flex items-center justify-center p-1 shrink-0 pointer-events-none select-none"
            style="width: {boxW}px; height: {boxH}px; -webkit-user-drag: none; user-select: none;"
          >
            {#if f.preview_image_url}
              <ProgressiveImage src={f.preview_image_url} blurSrc={f.preview_blur} alt={f.name} class="w-full h-full rounded-lg pointer-events-none select-none" objectFit="contain" />
            {:else if tLayers.length > 0}
              {#each tLayers.filter((l) => !l.isQr) as layer, idx (layer.id ?? idx)}
                <div
                  class="absolute overflow-hidden pointer-events-none select-none"
                  style="
                    left: {((layer.x || 0) / (f.width || 1200)) * 100}%;
                    top: {((layer.y || 0) / (f.height || 1800)) * 100}%;
                    width: {((layer.w || 200) / (f.width || 1200)) * 100}%;
                    height: {((layer.h || 200) / (f.height || 1800)) * 100}%;
                    transform: rotate({layer.rot || 0}deg);
                    z-index: {getLayerZIndex(layer, tLayers)};
                  "
                >
                  {#if layer.isBackground}
                    {@const layerBgUrl = uiConfig.resolveAssetUrl(layer.imageUrl || bgUrl)}
                    {#if layerBgUrl}
                      <img src={layerBgUrl} alt="Template Frame" draggable="false" class="w-full h-full object-fill block pointer-events-none select-none" />
                    {/if}
                  {:else}
                    <div class="w-full h-full bg-white/20 rounded-[2px] flex items-center justify-center text-[8px] text-white/65 pointer-events-none select-none">📷</div>
                  {/if}
                </div>
              {/each}
            {:else if bgUrl}
              <img src={uiConfig.resolveAssetUrl(bgUrl)} alt="Template Frame" draggable="false" class="w-full h-full object-contain block pointer-events-none select-none" />
            {:else}
              <div class="text-white/65 text-[10px] pointer-events-none select-none">No Preview</div>
            {/if}
          </div>
        {/snippet}

        {#if visibleTemplatesForCategory.length === 0}
          <div class="flex-1 flex items-center justify-center text-center text-white/65 text-sm px-6">
            Tidak ada template untuk kategori ini
          </div>
        {:else if viewMode === 'slider'}
          {@const list = visibleTemplatesForCategory}
          {@const n = list.length}
          {@const activeId = activeCardId || frameId}
          {@const activeIdx = Math.max(0, list.findIndex((t) => t.id === activeId))}
          <div
            role="region"
            aria-label="Frame Carousel Track"
            class="relative flex-1 min-h-0 flex flex-col justify-center items-center overflow-hidden py-3 select-none"
            ondragstart={(e) => e.preventDefault()}
          >
            <!-- Tombol Panah Kiri -->
            <button
              type="button"
              onclick={() => goFrame(-1)}
              disabled={list.length <= 1 || activeIdx <= 0}
              class="absolute left-3 z-30 w-12 h-12 rounded-full bg-white text-[#111117] flex items-center justify-center border-none cursor-pointer shrink-0 active:scale-95 hover:scale-105 transition-all shadow-[0_6px_20px_rgba(0,0,0,0.4)] disabled:opacity-20 disabled:pointer-events-none"
              aria-label="Sebelumnya"
            >
              <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M15.75 19.5L8.25 12l7.5-7.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <!-- Dynamic Continuous Scroll Track (3 kartu terlihat, kartu tengah dominan, momentum flick & edging) -->
            <div
              bind:this={sliderEl}
              role="presentation"
              onscroll={onTrackScroll}
              onscrollend={onTrackScrollEnd}
              onpointerdown={onTrackPointerDown}
              onpointermove={onTrackPointerMove}
              onpointerup={onTrackPointerUp}
              onpointercancel={onTrackPointerCancel}
              class="w-full flex items-center overflow-x-auto py-6 no-scrollbar select-none"
              style="
                scroll-snap-type: x mandatory;
                scroll-behavior: smooth;
                -webkit-overflow-scrolling: touch;
                padding-left: calc(50% - 90px);
                padding-right: calc(50% - 90px);
                gap: 16px;
                cursor: grab;
              "
            >
              {#each list as t (t.id)}
                {@const isActive = t.id === activeId}
                <button
                  type="button"
                  data-card-id={t.id}
                  draggable="false"
                  ondragstart={(e) => e.preventDefault()}
                  onclick={() => onCardClick(t.id)}
                  aria-label={`Pilih template ${t.name}`}
                  class="shrink-0 flex flex-col items-center gap-2.5 p-3.5 rounded-2xl cursor-pointer transition-all duration-300 ease-out select-none {isActive ? 'scale-100 opacity-100 z-10' : 'scale-[0.70] opacity-40 hover:opacity-70 z-0'}"
                  style="
                    scroll-snap-align: center;
                    scroll-snap-stop: normal;
                    width: 180px;
                    background-color: {isActive ? `${uiConfig.config.primaryColor}1F` : '#1a1824'};
                    border: 1.5px solid {isActive ? uiConfig.config.primaryColor : 'transparent'};
                    box-shadow: {isActive ? `0 12px 36px -4px ${uiConfig.config.primaryColor}50` : '0 4px 16px rgba(0,0,0,0.25)'};
                    user-select: none;
                    -webkit-user-select: none;
                    -webkit-user-drag: none;
                  "
                >
                  {@render frameThumb(t, 140, 182)}
                  <div class="text-center w-full px-1">
                    <div class="text-[13px] font-bold truncate" style="color: {isActive ? uiConfig.config.primaryColor : '#f0edf8'}">
                      {t.name}
                    </div>
                    <div class="text-[11px] text-white/60 mt-0.5">{photoCountOf(t)} foto</div>
                  </div>
                </button>
              {/each}
            </div>

            <!-- Tombol Panah Kanan -->
            <button
              type="button"
              onclick={() => goFrame(1)}
              disabled={list.length <= 1 || activeIdx >= list.length - 1}
              class="absolute right-3 z-30 w-12 h-12 rounded-full bg-white text-[#111117] flex items-center justify-center border-none cursor-pointer shrink-0 active:scale-95 hover:scale-105 transition-all shadow-[0_6px_20px_rgba(0,0,0,0.4)] disabled:opacity-20 disabled:pointer-events-none"
              aria-label="Berikutnya"
            >
              <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M8.25 4.5l7.5 7.5-7.5 7.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <!-- Dots Indicator -->
            <div class="flex items-center gap-1.5 pt-1">
              {#each list as t, i (t.id)}
                {@const isDotActive = t.id === activeId}
                <button
                  type="button"
                  onclick={() => onCardClick(t.id)}
                  aria-label={t.name}
                  class="h-1.5 rounded-full border-none cursor-pointer p-0 transition-all duration-300"
                  style="width: {isDotActive ? 24 : 6}px; background-color: {isDotActive ? uiConfig.config.primaryColor : 'rgba(255,255,255,0.25)'};"
                ></button>
              {/each}
              <span class="ml-2 text-[11px] text-white/60 tabular-nums">
                {activeIdx + 1}/{n}
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
                class="relative overflow-hidden rounded-xl bg-black/40 shadow-xl"
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
