<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ChevronLeft, ChevronRight } from '@lucide/svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { fetchBanners, getActiveBoothId, type BoothBanner } from '$lib/api/boothClient';
  import { readApiCache, writeApiCache, ensureAsset } from '$lib/utils/offlineCache';

  interface Props {
    disabled?: boolean;
  }

  let { disabled = false }: Props = $props();

  let banners = $state<BoothBanner[]>([]);
  let resolvedUrls = $state<Record<string, string>>({});
  let isOpen = $state(false);
  let currentIndex = $state(0);

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let slideInterval: ReturnType<typeof setInterval> | null = null;

  function isBannerValid(banner: BoothBanner): boolean {
    if (!banner.is_active) return false;
    const now = new Date();
    if (banner.start_date && new Date(banner.start_date) > now) return false;
    if (banner.end_date && new Date(banner.end_date) < now) return false;
    return true;
  }

  async function loadBanners() {
    try {
      const boothId = await getActiveBoothId();
      if (!boothId) return;

      // 1. Coba baca dari cache lokal terlebih dahulu
      const cached = await readApiCache<BoothBanner[]>(`banners:${boothId}`);
      if (cached && Array.isArray(cached)) {
        banners = cached.filter(isBannerValid).sort((a, b) => a.position - b.position);
        void prefetchResolvedUrls(banners);
        resetIdleTimer();
      }

      // 2. Fetch fresh dari jaringan
      try {
        const fresh = await fetchBanners(boothId);
        if (Array.isArray(fresh)) {
          await writeApiCache(`banners:${boothId}`, fresh);
          banners = fresh.filter(isBannerValid).sort((a, b) => a.position - b.position);
          void prefetchResolvedUrls(banners);
          resetIdleTimer();
        }
      } catch (e) {
        console.warn('[IdleBanner] Gagal fetch banner terbaru, menggunakan cache:', e);
      }
    } catch (e) {
      console.warn('[IdleBanner] Gagal memuat banner:', e);
    }
  }

  async function prefetchResolvedUrls(items: BoothBanner[]) {
    for (const b of items) {
      if (b.image_url && !resolvedUrls[b.image_url]) {
        try {
          const localUrl = await ensureAsset(b.image_url);
          if (localUrl) {
            resolvedUrls[b.image_url] = localUrl;
          }
        } catch {
          // fallback tetap gunakan URL aslinya
          resolvedUrls[b.image_url] = b.image_url;
        }
      }
    }
  }

  function startSlideTimer() {
    stopSlideTimer();
    if (banners.length > 1) {
      slideInterval = setInterval(() => {
        currentIndex = (currentIndex + 1) % banners.length;
      }, 5000);
    }
  }

  function stopSlideTimer() {
    if (slideInterval) {
      clearInterval(slideInterval);
      slideInterval = null;
    }
  }

  function nextSlide() {
    if (banners.length > 0) {
      currentIndex = (currentIndex + 1) % banners.length;
      startSlideTimer();
    }
  }

  function prevSlide() {
    if (banners.length > 0) {
      currentIndex = (currentIndex - 1 + banners.length) % banners.length;
      startSlideTimer();
    }
  }

  function resetIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }

    if (disabled || !boothConfig.config.enableIdleBanner || banners.length === 0) {
      return;
    }

    const timeoutMinutes = Math.max(1, boothConfig.config.idleBannerTimeoutMins || 2);
    const timeoutMs = timeoutMinutes * 60 * 1000;

    idleTimer = setTimeout(() => {
      if (!disabled && boothConfig.config.enableIdleBanner && banners.length > 0) {
        currentIndex = 0;
        isOpen = true;
        startSlideTimer();
      }
    }, timeoutMs);
  }

  function handleDismiss() {
    isOpen = false;
    stopSlideTimer();
    resetIdleTimer();
  }

  function handleUserActivity() {
    if (isOpen) {
      handleDismiss();
    } else {
      resetIdleTimer();
    }
  }

  // Effect saat disabled, config, atau list banner berubah
  $effect(() => {
    const isEnabled = boothConfig.config.enableIdleBanner;
    const timeout = boothConfig.config.idleBannerTimeoutMins;
    const count = banners.length;

    if (disabled || !isEnabled || count === 0) {
      if (idleTimer) clearTimeout(idleTimer);
      if (isOpen) {
        isOpen = false;
        stopSlideTimer();
      }
    } else {
      resetIdleTimer();
    }
  });

  onMount(() => {
    void loadBanners();

    const events = ['mousedown', 'pointerdown', 'touchstart', 'click', 'keydown'];
    for (const evt of events) {
      window.addEventListener(evt, handleUserActivity, { passive: true });
    }

    resetIdleTimer();

    return () => {
      for (const evt of events) {
        window.removeEventListener(evt, handleUserActivity);
      }
      if (idleTimer) clearTimeout(idleTimer);
      stopSlideTimer();
    };
  });

  onDestroy(() => {
    if (idleTimer) clearTimeout(idleTimer);
    stopSlideTimer();
  });
</script>

{#if isOpen && banners.length > 0}
  <div
    class="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 cursor-pointer select-none animate-in fade-in duration-300"
    onclick={handleDismiss}
    role="presentation"
  >
    <!-- Slide Card Container -->
    <div
      class="relative max-w-[92vw] max-h-[82vh] flex items-center justify-center rounded-3xl overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.8)] border border-white/15 bg-black/40"
      onclick={(e) => {
        e.stopPropagation();
        handleDismiss();
      }}
      role="presentation"
    >
      {#if banners[currentIndex]}
        <img
          src={resolvedUrls[banners[currentIndex].image_url] || banners[currentIndex].image_url}
          alt={banners[currentIndex].title || 'Promo Banner'}
          class="max-w-full max-h-[78vh] w-auto h-auto object-contain rounded-2xl transition-opacity duration-300"
        />
      {/if}

      <!-- Prev / Next navigation button (if multiple banners) -->
      {#if banners.length > 1}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            prevSlide();
          }}
          class="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-black/90 border border-white/25 text-white flex items-center justify-center transition-all cursor-pointer shadow-lg backdrop-blur-sm active:scale-95"
          aria-label="Previous Banner"
        >
          <ChevronLeft size={28} />
        </button>

        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            nextSlide();
          }}
          class="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-black/90 border border-white/25 text-white flex items-center justify-center transition-all cursor-pointer shadow-lg backdrop-blur-sm active:scale-95"
          aria-label="Next Banner"
        >
          <ChevronRight size={28} />
        </button>
      {/if}
    </div>

    <!-- Indicators & Prompt -->
    <div class="mt-6 flex flex-col items-center gap-3.5">
      {#if banners.length > 1}
        <div class="flex items-center gap-2">
          {#each banners as _, idx}
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                currentIndex = idx;
                startSlideTimer();
              }}
              class="transition-all duration-300 rounded-full cursor-pointer border-none p-0 {idx === currentIndex ? 'w-8 h-2.5 bg-white shadow-lg' : 'w-2.5 h-2.5 bg-white/40 hover:bg-white/70'}"
              aria-label={`Go to slide ${idx + 1}`}
            ></button>
          {/each}
        </div>
      {/if}

      <div class="flex items-center gap-2 text-white/80 font-['Poppins',sans-serif] text-sm font-semibold tracking-widest uppercase animate-pulse">
        <span class="text-amber-400">✦</span>
        <span>Sentuh layar untuk memulai</span>
        <span class="text-amber-400">✦</span>
      </div>
    </div>
  </div>
{/if}
