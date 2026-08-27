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
      console.error('Failed to composite template in V2Download:', err);
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
      console.error('Failed to create session / save assets in V2Download:', err);
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

  const KB_ROWS_ALPHA = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫']
  ];
  const KB_ROWS_NUM = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['-', '_', '.', '@', '#', '!', '&', '*', '(', ')'],
    ['ABC', '/', '\\', ':', ';', "'", '"', ',', '⌫']
  ];

  let currentKbRows = $derived(numMode ? KB_ROWS_NUM : KB_ROWS_ALPHA);

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
  class="w-screen h-screen bg-[#fafafa] flex flex-col select-none relative overflow-hidden"
  style="font-family: 'Playfair Display', Georgia, serif;"
>
  <!-- Header -->
  <div class="w-full h-16 flex items-center justify-between px-10 border-b-2 border-black shrink-0 relative z-20 bg-[#C7EED8]">
    <div class="flex items-center gap-2">
      <span class="font-['Nunito',sans-serif] font-black text-xs tracking-widest uppercase">
        {uiConfig.config.boothName} — Scan & Download Softfile
      </span>
    </div>
  </div>

  <!-- Content -->
  <div
    class="relative z-10 flex-1 flex items-center justify-center gap-12 px-16 py-8 transition-transform duration-300"
    style="transform: {kbOpen ? 'translateY(-60px)' : 'translateY(0)'};"
  >
    <!-- Left copy -->
    <div class="flex flex-col max-w-[300px]">
      <p class="text-xs tracking-[0.35em] uppercase text-black/30 mb-4 font-['Nunito',sans-serif] font-black">
        Session Complete
      </p>
      <h2 class="text-[56px] font-black uppercase tracking-tight leading-[0.9] mb-3">
        Thank<br />You
      </h2>
      <h3 class="text-xl font-bold italic text-black/50 mb-5">for printing with us!</h3>
      <div class="w-16 h-[3px] bg-black mb-5"></div>
      <p class="text-sm text-black/40 leading-relaxed font-['Nunito',sans-serif] font-bold">
        Fotomu sedang dicetak. Scan QR atau masukkan email untuk mendapatkan softfile.
      </p>
      {#if sent}
        <div class="mt-5 flex items-center gap-2 text-black/50 text-xs font-['Nunito',sans-serif] font-black tracking-[0.15em] uppercase">
          Home dalam {timer}s
        </div>
      {/if}
      <button
        onclick={onDone}
        class="mt-6 self-start px-7 py-2.5 text-xs font-bold border-[2px] border-black rounded-full uppercase tracking-[0.18em] hover:bg-black hover:text-white transition-all cursor-pointer font-['Nunito',sans-serif] bg-transparent"
      >
        {sent ? 'Selesai' : 'Lewati →'}
      </button>
    </div>

    <!-- Center: composited frame mockup -->
    <div class="flex flex-col items-center shrink-0">
      <div
        class="flex flex-col overflow-hidden bg-white border-[3px] border-black rounded-[24px] w-[240px] shadow-[10px_10px_0_0_rgba(0,0,0,1)] p-3"
      >
        {#if compositeUrl}
          <img
            src={compositeUrl}
            alt="Hasil Foto Template"
            class="w-full h-auto max-h-[52vh] object-contain rounded-xl block"
          />
        {:else}
          <div class="w-[200px] h-[300px] flex items-center justify-center text-black/30 text-xs animate-pulse font-['Nunito',sans-serif]">
            Memproses Foto...
          </div>
        {/if}
      </div>
    </div>

    <!-- Right card -->
    <div class="flex flex-col gap-5">
      <div
        class="border-[3px] border-black rounded-3xl bg-white p-7 w-[380px] shadow-[12px_12px_0_0_rgba(0,0,0,1)]"
      >
        {#if !sent}
          <p class="text-xs font-black uppercase tracking-[0.25em] mb-1 text-black/40 font-['Nunito',sans-serif]">
            Scan QR / Kirim Softfile
          </p>
          <p class="text-[13px] text-black/40 mb-4 font-['Nunito',sans-serif]">
            Scan QR dengan kamera HP atau ketuk kolom email
          </p>

          {#if qrDataUrl}
            <div class="border-2 border-black rounded-2xl p-3 bg-white mb-4 flex flex-col items-center">
              <img src={qrDataUrl} alt="Softfile QR Code" class="w-[130px] h-[130px] object-contain" />
              <p class="text-[10px] font-black tracking-[0.2em] text-black/40 font-['Nunito',sans-serif] mt-1 m-0">
                SCAN ME · {sessionCode}
              </p>
            </div>
          {/if}

          <div class="flex flex-col gap-3">
            <button
              type="button"
              onclick={() => (kbOpen = true)}
              class="w-full border-[2.5px] border-black rounded-2xl px-4 py-3 cursor-text text-left font-mono font-bold text-base min-h-[50px] bg-gray-50 text-gray-900"
            >
              {email || 'nama@email.com'}
              {#if kbOpen}
                <span class="ml-0.5 inline-block w-0.5 h-5 bg-black animate-pulse align-middle"></span>
              {/if}
            </button>

            {#if error}
              <p class="text-xs text-red-500 font-bold tracking-wide font-['Nunito',sans-serif] m-0">
                Format email tidak valid
              </p>
            {/if}

            <!-- TODO: integrasikan ke API pembayaran/softfile setelah gap backend selesai -->
            <button
              onclick={handleSend}
              class="w-full py-3 bg-black text-white font-black uppercase text-sm tracking-[0.18em] rounded-2xl cursor-pointer border-none font-['Nunito',sans-serif] shadow-[4px_4px_0_0_rgba(0,0,0,0.25)]"
            >
              Kirim Email (Local State)
            </button>
          </div>
        {:else}
          <div class="flex flex-col items-center gap-4 text-center">
            <div class="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center font-bold text-xl">
              ✓
            </div>
            <div>
              <p class="font-black text-sm uppercase tracking-[0.15em] font-['Nunito',sans-serif] m-0">
                Email Terkirim!
              </p>
              <p class="text-xs text-black/40 mt-1 font-['Nunito',sans-serif] m-0">{email}</p>
            </div>

            <div class="border-2 border-black rounded-2xl p-4 bg-white mt-2">
              {#if qrDataUrl}
                <img src={qrDataUrl} alt="Softfile QR Code" class="w-[140px] h-[140px] object-contain" />
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
            <p class="text-[10px] font-black tracking-[0.2em] text-black/40 font-['Nunito',sans-serif] m-0">
              SCAN ME · {sessionCode}
            </p>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- On-Screen Keyboard -->
  {#if kbOpen}
    <div class="absolute bottom-0 left-0 right-0 z-50 bg-white border-t-[3px] border-black">
      <div
        class="flex items-center justify-between px-5 py-2 border-b-[2px] border-black bg-gray-100 cursor-pointer"
        onclick={() => (kbOpen = false)}
        role="presentation"
      >
        <span class="text-xs font-black uppercase tracking-[0.2em] text-black/40 font-['Nunito',sans-serif]">Keyboard V2</span>
        <span class="text-xs font-black text-black/40 font-['Nunito',sans-serif]">✕ Tutup</span>
      </div>

      <div class="flex flex-col gap-1.5 px-3 pb-4 pt-3">
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
                class="rounded-lg flex items-center justify-center font-bold border-2 border-black font-['Nunito',sans-serif]"
                style="
                  height: 46px;
                  flex: {isSpecial ? '0 0 9%' : '1 1 0'};
                  background: {isShiftActive ? '#000' : isSpecial ? '#f0f0f0' : '#fff'};
                  color: {isShiftActive ? '#fff' : '#000'};
                  box-shadow: 2px 2px 0 0 #000;
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
            class="rounded-lg flex items-center justify-center font-bold border-2 border-black bg-gray-100 font-['Nunito',sans-serif] text-xs"
            style="height: 46px; flex: 0 0 9%; box-shadow: 2px 2px 0 0 #000;"
          >
            {numMode ? 'ABC' : '123'}
          </button>
          <button
            onpointerdown={(e) => {
              e.preventDefault();
              email = email + ' ';
            }}
            class="rounded-lg flex-1 flex items-center justify-center border-2 border-black bg-white font-['Nunito',sans-serif] text-xs"
            style="height: 46px; box-shadow: 2px 2px 0 0 #000;"
          >
            spasi
          </button>
          {#each ['@', '.'] as ch}
            <button
              onpointerdown={(e) => {
                e.preventDefault();
                email = email + ch;
              }}
              class="rounded-lg flex items-center justify-center font-bold border-2 border-black bg-white font-['Nunito',sans-serif] text-base"
              style="height: 46px; flex: 0 0 7%; box-shadow: 2px 2px 0 0 #000;"
            >
              {ch}
            </button>
          {/each}
          <button
            onpointerdown={(e) => {
              e.preventDefault();
              handleSend();
            }}
            class="rounded-lg flex items-center justify-center font-black border-2 border-black bg-black text-white font-['Nunito',sans-serif] text-xs"
            style="height: 46px; flex: 0 0 13%; shadow: 2px 2px 0 0 #000;"
          >
            Kirim
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
