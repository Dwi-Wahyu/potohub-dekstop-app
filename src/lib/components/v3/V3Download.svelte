<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import QRCode from 'qrcode';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { sendSoftFile, generateSessionCode } from '$lib/utils/shared';
  import { Delete } from '@lucide/svelte';

  import { compositeTemplateImage } from '$lib/utils/templateComposite';
  import { saveSessionAssets } from '$lib/utils/sessionAssets';
  import {
    fetchTemplates,
    createTransactionSession,
    getActiveBoothId,
    type BoothTemplate
  } from '$lib/api/boothClient';

  interface Props {
    selectedFrame?: string;
    onDone: () => void;
  }

  let { selectedFrame = '', onDone }: Props = $props();

  let email = $state('');
  let sent = $state(false);
  let error = $state(false);
  let timer = $state(60);
  let kbOpen = $state(false);
  let caps = $state(false);
  let numMode = $state(false);
  let interval: any = null;
  let qrDataUrl = $state('');
  let isSaving = $state(false);
  let compositeUrl = $state<string | null>(null);
  let selectedTemplate = $state<BoothTemplate | null>(null);

  const ADMIN_DASHBOARD_PUBLIC_URL = (import.meta.env as Record<string, string>).VITE_ADMIN_DASHBOARD_URL ?? 'http://localhost:5173';

  onMount(async () => {
    interval = setInterval(() => {
      if (sent && timer > 0) {
        timer--;
      }
    }, 1000);

    const boothId = (await getActiveBoothId()) || localStorage.getItem('booth_id') || 'default';

    try {
      const templates = await fetchTemplates(boothId);
      const matched = templates.find((t) => t.id === selectedFrame) || templates[0];
      if (matched) {
        selectedTemplate = matched;
        compositeUrl = await compositeTemplateImage(
          matched,
          boothFlow.photosTaken,
          boothFlow.selectedFilterId
        );
      }
    } catch (err) {
      console.error('Failed to composite template in V3Download:', err);
    }

    try {
      isSaving = true;
      const session = await createTransactionSession(
        boothId,
        selectedTemplate?.category_id,
        boothFlow.printQty,
        'cashless',
        selectedFrame
      );
      const sessId = session.session_id || session.id || 'demo-session';
      boothFlow.sessionId = sessId;

      const softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/s/${sessId}`;
      qrDataUrl = await QRCode.toDataURL(softfileUrl, { margin: 1, width: 200 });

      await saveSessionAssets(
        boothId,
        sessId,
        compositeUrl,
        selectedTemplate?.width || 1200,
        selectedTemplate?.height || 1800,
        (selectedTemplate?.design_data || []).filter((l) => !l.isBackground && !l.isQr),
        selectedTemplate?.frame_image_url || selectedTemplate?.design_data?.find((l) => l.isBackground)?.imageUrl
      );
    } catch (err) {
      console.error('Failed to create session / save assets in V3Download:', err);
      const fallbackUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/s/${boothFlow.sessionId || 'demo-session'}`;
      qrDataUrl = await QRCode.toDataURL(fallbackUrl, { margin: 1, width: 200 }).catch(() => '');
    } finally {
      isSaving = false;
    }
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });

  $effect(() => {
    if (timer === 0) onDone();
  });

  // Stub softfile send implementation - see §0 item 5
  async function handleSend() {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!valid) {
      error = true;
      setTimeout(() => (error = false), 1600);
      return;
    }
    // TODO: integrasikan ke API pembayaran/softfile setelah gap backend selesai
    await sendSoftFile(email, () => {
      sent = true;
      kbOpen = false;
    });
  }

  let sessionCode = $derived(generateSessionCode(uiConfig.config.boothName));

  const V3_KB_ALPHA = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫']
  ];
  const V3_KB_NUM = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['-', '_', '.', '@', '#', '!', '&', '*', '(', ')'],
    ['ABC', '/', '\\', ':', ';', "'", '"', ',', '⌫']
  ];

  let currentKbRows = $derived(numMode ? V3_KB_NUM : V3_KB_ALPHA);

  function pressKey(key: string) {
    if (key === '⌫') {
      email = email.slice(0, -1);
      return;
    }
    if (key === 'SHIFT') {
      caps = !caps;
      return;
    }
    if (key === 'ABC') {
      numMode = false;
      return;
    }
    if (key === '123') {
      numMode = true;
      return;
    }
    const ch = caps && !numMode ? key.toUpperCase() : key;
    email = email + ch;
    if (caps) caps = false;
  }
</script>

<div
  class="w-screen h-screen bg-[#0a0a0f] text-white flex flex-col justify-between select-none relative overflow-hidden font-['Inter',sans-serif]"
>
  <!-- Header -->
  <div class="w-full flex justify-between items-center p-8 relative z-10">
    <span class="font-extrabold text-sm tracking-[0.2em] text-[#FFC107] uppercase">
      {uiConfig.config.boothName} — Softfile Download
    </span>
    {#if sent}
      <span class="text-xs font-bold text-white/50">Auto Reset ({timer}s)</span>
    {/if}
  </div>

  <!-- Content -->
  <div
    class="relative z-10 flex-1 flex items-center justify-center gap-10 max-w-4xl mx-auto w-full my-auto px-6 transition-transform duration-300"
    style="transform: {kbOpen ? 'translateY(-60px)' : 'translateY(0)'};"
  >
    <!-- Left: composited frame mockup -->
    <div class="flex flex-col items-center shrink-0">
      <div
        class="flex flex-col overflow-hidden bg-white/5 border border-white/20 rounded-[24px] w-[240px] shadow-[0_16px_40px_rgba(0,0,0,0.6)] p-3 backdrop-blur-md"
      >
        {#if compositeUrl}
          <img
            src={compositeUrl}
            alt="Hasil Foto Template"
            class="w-full h-auto max-h-[52vh] object-contain rounded-xl block"
          />
        {:else}
          <div class="w-[200px] h-[300px] flex items-center justify-center text-white/30 text-xs animate-pulse font-mono">
            Memproses Foto...
          </div>
        {/if}
      </div>
    </div>

    <!-- Right: QR & Action card -->
    <div class="border border-white/10 rounded-3xl bg-white/5 p-8 max-w-md w-full flex flex-col items-center gap-6 backdrop-blur-xl">
      {#if !sent}
        <div class="text-center">
          <span class="text-xs font-black uppercase tracking-[0.3em] text-[#FFC107] mb-1 block">
            Softfile Gratis
          </span>
          <h2 class="text-2xl font-black uppercase text-white">Scan QR / Kirim Email</h2>
        </div>

        {#if qrDataUrl}
          <div class="p-3 bg-white rounded-2xl border border-white/20 flex flex-col items-center">
            <img src={qrDataUrl} alt="Softfile QR Code" class="w-[140px] h-[140px] object-contain rounded-lg" />
            <p class="text-[10px] font-mono tracking-widest text-black/60 mt-1 m-0">SCAN UNTUK SOFTFILE</p>
          </div>
        {/if}

        <button
          type="button"
          onclick={() => (kbOpen = true)}
          class="w-full border border-white/20 rounded-xl px-4 py-3 cursor-text text-left font-mono font-bold text-sm min-h-[48px] bg-white/10 text-white"
        >
          {email || 'nama@email.com'}
          {#if kbOpen}
            <span class="ml-0.5 inline-block w-0.5 h-4 bg-[#FFC107] animate-pulse align-middle"></span>
          {/if}
        </button>

        {#if error}
          <p class="text-xs text-red-400 font-bold tracking-wide m-0">Format email tidak valid</p>
        {/if}

        <!-- TODO: integrasikan ke API pembayaran/softfile setelah gap backend selesai -->
        <button
          onclick={handleSend}
          class="w-full py-3.5 bg-[#FFC107] text-black font-black uppercase tracking-widest rounded-full hover:bg-yellow-300 transition-all cursor-pointer border-none shadow-[0_0_20px_rgba(255,193,7,0.4)]"
        >
          Kirim Softfile (Local State)
        </button>
      {:else}
        <div class="flex flex-col items-center gap-4 text-center">
          <div class="w-12 h-12 rounded-full bg-[#FFC107] text-black flex items-center justify-center font-bold text-xl">
            ✓
          </div>
          <div>
            <h3 class="font-black text-base uppercase tracking-wider text-white m-0">
              Softfile Dikirim!
            </h3>
            <p class="text-xs text-white/50 mt-1 m-0">{email}</p>
          </div>

          <div class="p-4 bg-white rounded-2xl border border-white/20 mt-2">
            {#if qrDataUrl}
              <img src={qrDataUrl} alt="Softfile QR Code" class="w-[140px] h-[140px] object-contain rounded-lg" />
            {:else}
              <svg width="140" height="140" viewBox="0 0 100 100" fill="none">
                <rect width="100" height="100" fill="white" />
                <rect x="5" y="5" width="25" height="25" fill="black" />
                <rect x="70" y="5" width="25" height="25" fill="black" />
                <rect x="5" y="70" width="25" height="25" fill="black" />
                <rect x="40" y="40" width="20" height="20" fill="black" />
              </svg>
            {/if}
          </div>
          <p class="text-[10px] font-mono tracking-widest text-white/40 m-0">
            CODE: {sessionCode}
          </p>
        </div>
      {/if}

      <button
        onclick={onDone}
        class="text-xs font-bold text-white/40 hover:text-white uppercase tracking-widest bg-transparent border-none cursor-pointer mt-2"
      >
        {sent ? 'Selesai' : 'Lewati →'}
      </button>
    </div>
  </div>

  <!-- Keyboard V3 Dark Retro -->
  {#if kbOpen}
    <div
      class="absolute bottom-0 left-0 right-0 z-50 flex flex-col gap-1.5 px-3 pb-4 pt-3 bg-[#0a0a0f] border-t border-white/10 backdrop-blur-xl"
    >
      <div
        class="flex items-center justify-between px-3 py-1 text-xs text-white/40 font-bold uppercase cursor-pointer"
        onclick={() => (kbOpen = false)}
        role="presentation"
      >
        <span>Dark Retro Keyboard</span>
        <span>✕ Tutup</span>
      </div>

      {#each currentKbRows as row, ri}
        <div class="flex gap-1.5 w-full">
          {#each row as key}
            {@const isSpecial = key === 'SHIFT' || key === '⌫' || key === 'ABC' || key === '123'}
            {@const isShiftActive = key === 'SHIFT' && caps}
            <button
              onpointerdown={(e) => {
                e.preventDefault();
                pressKey(key);
              }}
              class="rounded-lg flex items-center justify-center font-semibold transition-all border border-white/10"
              style="
                height: 46px;
                flex: {isSpecial ? '0 0 9%' : '1 1 0'};
                background: {isShiftActive ? '#FFC107' : isSpecial ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)'};
                color: {isShiftActive ? '#000' : '#fff'};
                font-size: {key === '⌫' ? '14px' : '16px'};
              "
            >
              {#if key === '⌫'}
                <Delete size={15} />
              {:else}
                {caps && !numMode && key.length === 1 ? key.toUpperCase() : key}
              {/if}
            </button>
          {/each}
        </div>
      {/each}

      <div class="flex w-full gap-1.5">
        <button
          onpointerdown={(e) => {
            e.preventDefault();
            numMode = !numMode;
          }}
          class="rounded-lg flex items-center justify-center font-semibold border border-white/10 bg-white/10 text-white text-xs"
          style="height: 46px; flex: 0 0 9%;"
        >
          {numMode ? 'ABC' : '123'}
        </button>
        <button
          onpointerdown={(e) => {
            e.preventDefault();
            email = email + ' ';
          }}
          class="rounded-lg flex-1 flex items-center justify-center border border-white/10 bg-white/12 text-white text-xs"
          style="height: 46px;"
        >
          spasi
        </button>
        {#each ['@', '.'] as ch}
          <button
            onpointerdown={(e) => {
              e.preventDefault();
              email = email + ch;
            }}
            class="rounded-lg flex items-center justify-center font-bold border border-white/10 bg-white/12 text-white text-base"
            style="height: 46px; flex: 0 0 7%;"
          >
            {ch}
          </button>
        {/each}
        <button
          onpointerdown={(e) => {
            e.preventDefault();
            handleSend();
          }}
          class="rounded-lg flex items-center justify-center font-black bg-[#FFC107] text-black text-xs border-none"
          style="height: 46px; flex: 0 0 13%;"
        >
          Kirim
        </button>
      </div>
    </div>
  {/if}
</div>
