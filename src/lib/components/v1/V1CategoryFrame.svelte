<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { formatTime } from '$lib/utils/shared';
  import { fetchCategories, fetchTemplates, type BoothCategory, type BoothTemplate } from '$lib/api/boothClient';

  interface Props {
    onNext: (price: number, frameConfigId: string) => void;
    onBack: () => void;
  }

  let { onNext, onBack }: Props = $props();

  let secs = $state(14 * 60 + 50);
  let timer: any = null;
  let categoryId = $state('');
  let frameId = $state('');

  let categoriesData = $state<BoothCategory[]>([]);
  let templatesData = $state<BoothTemplate[]>([]);
  let loadingCatalog = $state(true);
  let catalogError = $state('');

  function getGridSize(designData: Array<{ x: number; y: number; w: number; h: number }> | null | undefined) {
    if (!designData || designData.length === 0) return { cols: 2, rows: 2, count: 0 };
    
    const xs = new Set<number>();
    const ys = new Set<number>();
    designData.forEach(d => {
      xs.add(Math.round(d.x));
      ys.add(Math.round(d.y));
    });
    
    let cols = xs.size;
    let rows = ys.size;
    
    if (cols === 0) cols = 1;
    if (rows === 0) rows = 1;
    
    if (cols * rows !== designData.length) {
      const len = designData.length;
      if (len === 1) { cols = 1; rows = 1; }
      else if (len === 2) { cols = 1; rows = 2; }
      else if (len === 3) { cols = 1; rows = 3; }
      else if (len === 4) { cols = 2; rows = 2; }
      else if (len === 6) { cols = 2; rows = 3; }
      else if (len === 8) { cols = 2; rows = 4; }
      else { cols = Math.ceil(Math.sqrt(len)); rows = Math.ceil(len / cols); }
    }
    
    return { cols, rows, count: designData.length };
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

  let liveviewInterval: any = null;
  let frameSrc = $state('');
  let videoEl = $state<HTMLVideoElement | null>(null);

  function playStream(node: HTMLVideoElement, stream: MediaStream | null) {
    if (stream) {
      node.srcObject = stream;
      node.muted = true;
      node.playsInline = true;
      node.play().catch(() => {});
    }
    return {
      update(newStream: MediaStream | null) {
        if (newStream) {
          node.srcObject = newStream;
          node.muted = true;
          node.playsInline = true;
          node.play().catch(() => {});
        } else {
          node.srcObject = null;
        }
      },
      destroy() {
        node.srcObject = null;
      }
    };
  }

  onMount(async () => {
    const boothId = localStorage.getItem('booth_id') || 'default';
    try {
      categoriesData = await fetchCategories(boothId);
      templatesData = await fetchTemplates(boothId);
      if (categoriesData[0]) {
        categoryId = categoriesData[0].id;
        const visible = templatesData.filter((t) => t.category_id === categoryId);
        if (visible[0]) {
          frameId = visible[0].id;
        }
      }
    } catch (err) {
      catalogError = 'Gagal memuat katalog. Periksa koneksi ke server.';
    } finally {
      loadingCatalog = false;
    }

    await cameraStore.startLiveview(videoEl);
    timer = setInterval(() => {
      if (secs > 0) secs--;
      else {
        clearInterval(timer);
        onBack();
      }
    }, 1000);

    if (cameraStore.cameraMode === 'usb' || cameraStore.cameraMode === 'demo') {
      liveviewInterval = setInterval(async () => {
        const url = await cameraStore.getLiveviewFrame();
        if (url) {
          frameSrc = url;
        }
      }, 150);
    }
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
    if (liveviewInterval) clearInterval(liveviewInterval);
    cameraStore.stopLiveview();
  });

  const fmtPrice = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
</script>

<div
  class="w-full h-full overflow-hidden flex flex-col font-['Plus_Jakarta_Sans',sans-serif] text-[#f0edf8] relative"
  style="background: linear-gradient(135deg, #1e1b4b 0%, #2a2873 50%, #312e81 100%);"
>
  <!-- Watermark -->
  <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
    <span class="text-[clamp(180px,22vw,380px)] font-black text-white/[0.028] tracking-[-0.04em] whitespace-nowrap leading-none select-none">
      {uiConfig.config.boothName}
    </span>
  </div>

  <!-- Top bar -->
  <div class="flex justify-between items-center px-10 pt-7 pb-5 shrink-0 relative z-10">
    <button
      onclick={onBack}
      class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-transparent border border-white/10 text-white/30 cursor-pointer transition-colors duration-150 hover:border-white/20 hover:text-white/50"
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
        <div class="text-xs text-white/40 mt-1">Mengambil data kategori dan template</div>
      </div>
    {:else if catalogError}
      <div class="flex-1 flex flex-col items-center justify-center bg-[#111117]/80 rounded-[20px] border border-red-500/20 shadow-[0_24px_80px_rgba(0,0,0,0.6)] p-6">
        <svg width="48" height="48" fill="none" stroke="#ef4444" stroke-width="2" viewBox="0 0 24 24" class="mb-4">
          <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div class="text-base font-bold text-red-400 mb-1">{catalogError}</div>
        <div class="text-xs text-white/50 mb-6 text-center max-w-md">Koneksi ke server API gagal. Anda bisa menggunakan data default dengan menekan tombol di bawah.</div>
        <button
          onclick={() => {
            // Load defaults
            categoriesData = [
              { id: 'solo', name: 'Solo', base_price: 35000, extra_price: 10000, position: 1, banner_url: null },
              { id: 'couple', name: 'Couple', base_price: 50000, extra_price: 15000, position: 2, banner_url: null },
              { id: 'group', name: 'Group', base_price: 65000, extra_price: 20000, position: 3, banner_url: null },
              { id: 'family', name: 'Family', base_price: 70000, extra_price: 25000, position: 4, banner_url: null }
            ];
            templatesData = [
              { id: 'strip2', category_id: 'solo', name: 'Strip 2', width: 2, height: 6, paper_size: '4x6', frame_image_url: null, design_data: [ {x:0,y:0,w:1,h:1}, {x:0,y:1,w:1,h:1} ], is_active: true },
              { id: 'strip4', category_id: 'solo', name: 'Strip 4', width: 2, height: 6, paper_size: '4x6', frame_image_url: null, design_data: [ {x:0,y:0,w:1,h:1}, {x:0,y:1,w:1,h:1}, {x:0,y:2,w:1,h:1}, {x:0,y:3,w:1,h:1} ], is_active: true },
              { id: 'grid4', category_id: 'couple', name: 'Grid 2x2', width: 4, height: 6, paper_size: '4x6', frame_image_url: null, design_data: [ {x:0,y:0,w:1,h:1}, {x:1,y:0,w:1,h:1}, {x:0,y:1,w:1,h:1}, {x:1,y:1,w:1,h:1} ], is_active: true },
              { id: 'grid6', category_id: 'group', name: 'Grid 2x3', width: 4, height: 6, paper_size: '4x6', frame_image_url: null, design_data: [ {x:0,y:0,w:1,h:1}, {x:1,y:0,w:1,h:1}, {x:0,y:1,w:1,h:1}, {x:1,y:1,w:1,h:1}, {x:0,y:2,w:1,h:1}, {x:1,y:2,w:1,h:1} ], is_active: true },
              { id: 'love4', category_id: 'couple', name: 'Love 4', width: 4, height: 6, paper_size: '4x6', frame_image_url: null, design_data: [ {x:0,y:0,w:1,h:1}, {x:1,y:0,w:1,h:1}, {x:0,y:1,w:1,h:1}, {x:1,y:1,w:1,h:1} ], is_active: true },
              { id: 'wide3', category_id: 'family', name: 'Wide 3', width: 6, height: 4, paper_size: '4x6', frame_image_url: null, design_data: [ {x:0,y:0,w:1,h:1}, {x:1,y:0,w:1,h:1}, {x:2,y:0,w:1,h:1} ], is_active: true }
            ];
            categoryId = 'solo';
            frameId = 'strip2';
            catalogError = '';
          }}
          class="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border-none text-[#f0edf8] cursor-pointer font-bold text-sm transition-colors duration-150"
        >
          Gunakan Mode Offline
        </button>
      </div>
    {:else}
      <!-- Left: Pilih Kategori -->
      <div class="w-[220px] shrink-0 bg-[#111117] rounded-[20px] border border-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden">
        <div class="px-5 pt-[18px] pb-3.5 border-b border-white/5">
          <div class="text-[15px] font-bold text-[#f0edf8] mb-0.5">Pilih Kategori</div>
          <div class="text-xs text-white/[0.35]">Pilih tema untuk sesi foto</div>
        </div>
        <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
          {#each categoriesData as cat}
            {@const sel = cat.id === categoryId}
            <button
              onclick={() => {
                categoryId = cat.id;
                const visible = templatesData.filter((t) => t.category_id === cat.id);
                if (visible.length > 0) {
                  if (!visible.some((t) => t.id === frameId)) {
                    frameId = visible[0].id;
                  }
                } else {
                  frameId = '';
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
              <div class="w-[52px] h-[52px] rounded-xl shrink-0 flex items-center justify-center overflow-hidden bg-[#313135]">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" class="text-slate-400">
                  <circle cx="24" cy="20" r="8" fill="currentColor" />
                  <path d="M12 40 C12 30 36 30 36 40" fill="currentColor" />
                </svg>
              </div>
              <div>
                <div class="text-sm font-bold" style="color: {sel ? uiConfig.config.primaryColor : '#f0edf8'}">
                  {cat.name}
                </div>
                <div class="text-[11px] text-white/[0.35] mt-0.5">Sesi {cat.name}</div>
              </div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Center: Pilih Frame grid -->
      <div class="flex-1 min-w-0 bg-[#111117] rounded-[20px] border border-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden">
        <div class="px-6 pt-[18px] pb-3.5 border-b border-white/5">
          <div class="text-[15px] font-bold text-[#f0edf8] mb-0.5">Pilih Frame</div>
          <div class="text-xs text-white/[0.35]">Tentukan jumlah dan susunan foto</div>
        </div>
        <div class="flex-1 overflow-y-auto px-6 py-5">
          {#if visibleTemplatesForCategory.length === 0}
            <div class="w-full h-full flex items-center justify-center text-center text-white/30 text-sm">
              Tidak ada template untuk kategori ini
            </div>
          {:else}
            <div class="grid grid-cols-3 gap-3.5 content-start">
              {#each visibleTemplatesForCategory as f, index}
                {@const sel = f.id === frameId}
                {@const grid = getGridSize(f.design_data)}
                {@const accent = getTemplateAccent(f.name, index)}
                <button
                  onclick={() => (frameId = f.id)}
                  class={`flex flex-col items-center gap-2.5 p-4 rounded-2xl cursor-pointer transition-colors duration-150 ${
                    sel ? '' : 'bg-[#1a1824] hover:bg-[#22202a]'
                  }`}
                  style="
                    background-color: {sel ? `${uiConfig.config.primaryColor}1F` : undefined};
                    border: 1.5px solid {sel ? uiConfig.config.primaryColor : 'transparent'};
                  "
                >
                  <div class="w-[88px] h-[88px] rounded-xl p-2 flex flex-col justify-between" style="background-color: {accent}">
                    <div class="grid gap-1 h-full" style="grid-template-columns: repeat({grid.cols}, 1fr); grid-template-rows: repeat({grid.rows}, 1fr);">
                      {#each Array(grid.count) as _}
                        <div class="bg-white/80 rounded-sm"></div>
                      {/each}
                    </div>
                  </div>
                  <div class="text-center">
                    <div class="text-[13px] font-semibold" style="color: {sel ? uiConfig.config.primaryColor : '#f0edf8'}">
                      {f.name}
                    </div>
                    <div class="text-[11px] text-white/[0.35] mt-0.5">{grid.count} foto</div>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Right: Preview + price + button -->
      <div class="w-[340px] shrink-0 bg-[#111117] rounded-[20px] border border-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden">
        <div class="px-6 pt-[18px] pb-3.5 border-b border-white/5">
          <div class="text-[15px] font-bold text-[#f0edf8] mb-0.5">Preview</div>
          <div class="text-xs text-white/[0.35]">Tampilan hasil foto kamu</div>
        </div>

        <div class="flex-1 min-h-0 flex flex-col pt-4 px-5">
          {#if selectedFrame}
            {@const grid = getGridSize(selectedFrame.design_data)}
            {@const accent = getTemplateAccent(selectedFrame.name, templatesData.indexOf(selectedFrame))}
            <div class="w-full flex-1 min-h-0 rounded-2xl overflow-hidden flex flex-col p-3.5 gap-2.5 relative" style="background-color: {accent};">
              <div class="flex-1 grid gap-1.5" style="grid-template-columns: repeat({grid.cols}, 1fr); grid-template-rows: repeat({grid.rows}, 1fr);">
                {#each Array(grid.count) as _}
                  <div class="rounded-lg overflow-hidden bg-black/25 relative">
                    {#if cameraStore.isLiveviewActive}
                      {#if cameraStore.cameraMode === 'webcam'}
                        <video
                          use:playStream={cameraStore.stream}
                          autoplay
                          playsinline
                          muted
                          class="w-full h-full object-cover"
                          style="transform: scaleX(-1);"
                        ></video>
                      {:else if frameSrc}
                        <img
                          src={frameSrc}
                          alt="Live view"
                          class="w-full h-full object-cover"
                        />
                      {:else}
                        <div class="w-full h-full flex items-center justify-center text-white/40 text-xs animate-pulse">
                          Loading...
                        </div>
                      {/if}
                    {:else}
                      <div class="w-full h-full flex items-center justify-center text-white/40 text-xs">
                        Live View
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
              <div class="shrink-0 text-center text-[10px] font-extrabold tracking-widest text-black/30 lowercase">
                {uiConfig.config.boothName}
              </div>
            </div>
          {:else}
            <div class="w-full flex-1 min-h-0 rounded-2xl bg-[#1a1824] flex items-center justify-center text-white/30 text-sm">
              Pilih frame untuk melihat preview
            </div>
          {/if}
        </div>

        <div class="px-6 py-5 border-t border-white/5 mt-4">
          <div class="flex justify-between items-center mb-3.5">
            {#if selectedCategory && selectedFrame}
              {@const grid = getGridSize(selectedFrame.design_data)}
              <div>
                <div class="text-[11px] text-white/[0.35] mb-0.5">Total harga</div>
                <div class="text-2xl font-extrabold text-[#f0edf8]">{fmtPrice(selectedCategory.base_price)}</div>
              </div>
              <div class="text-xs text-white/[0.35] text-right">
                {grid.count} foto<br />
                <span class="text-[11px]">{selectedCategory.name}</span>
              </div>
            {:else}
              <div>
                <div class="text-[11px] text-white/[0.35] mb-0.5">Total harga</div>
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
