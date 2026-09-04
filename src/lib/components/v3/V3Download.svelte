<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import QRCode from 'qrcode';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { sendSoftfileEmail, sendSoftfileWA, generateSessionCode } from '$lib/utils/shared';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { Delete, Sparkles, Clock } from '@lucide/svelte';

  import { compositeTemplateImage } from '$lib/utils/templateComposite';
  import { saveSessionAssets } from '$lib/utils/sessionAssets';
  import { cachedFetch } from '$lib/utils/offlineCache';
  import {
    fetchTemplates,
    createTransactionSession,
    requireActiveBoothId,
    type BoothTemplate
  } from '$lib/api/boothClient';

  interface Props {
    selectedFrame?: string;
    onDone: () => void;
    background?: string;
  }

  let { selectedFrame = '', onDone, background }: Props = $props();

  let email = $state('');
  let phone = $state('');
  let emailSent = $state(false);
  let waSent = $state(false);
  let activeKbTarget = $state<'email' | 'phone' | null>(null);

  let emailEnabled = $derived(boothConfig.config.emailEnabled ?? true);
  let whatsappEnabled = $derived(boothConfig.config.whatsappEnabled ?? true);

  let sent = $derived(emailSent || waSent);
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

  const envs = import.meta.env as Record<string, string>;
  const rawAdminDashboardUrl =
    envs.ADMIN_DASHBOARD_URL ||
    envs.VITE_ADMIN_DASHBOARD_URL ||
    envs.PUBLIC_ADMIN_DASHBOARD_URL ||
    'http://localhost:3000';
  const ADMIN_DASHBOARD_PUBLIC_URL = rawAdminDashboardUrl.replace(/\/+$/, '');

  onMount(async () => {
    interval = setInterval(() => {
      if (sent && timer > 0) {
        timer--;
      }
    }, 1000);

    let boothId = 'default';
    try {
      boothId = await requireActiveBoothId();
    } catch (e) {
      console.error('[V3Download] Booth tidak aktif saat simpan sesi:', e);
    }

    try {
      await cachedFetch(
        `templates:${boothId}`,
        () => fetchTemplates(boothId),
        (templates) => {
          selectedTemplate =
            templates.find((t) => t.id === selectedFrame) || templates[0] || null;
        }
      );
      if (selectedTemplate) {
        compositeUrl = await compositeTemplateImage(
          selectedTemplate,
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

      const softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/${sessId}`;
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
      const fallbackUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/${boothFlow.sessionId || 'demo-session'}`;
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

  let sendErrMsg = $state('');

  async function handleSendEmail() {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!valid) {
      error = true;
      setTimeout(() => (error = false), 1600);
      return;
    }
    sendErrMsg = '';
    const ok = await sendSoftfileEmail(
      email,
      (success) => {
        if (success) {
          emailSent = true;
          activeKbTarget = null;
          kbOpen = false;
        }
      },
      boothFlow.sessionId ?? undefined
    );
    if (!ok && !emailSent) {
      sendErrMsg = 'Gagal mengirim email. Periksa SMTP & App Password di Settings.';
      setTimeout(() => (sendErrMsg = ''), 4000);
    }
  }

  async function handleSendWA() {
    const valid = /^\+?[0-9]{8,15}$/.test(phone.trim().replace(/[\s-]/g, ''));
    if (!valid) {
      error = true;
      setTimeout(() => (error = false), 1600);
      return;
    }
    sendErrMsg = '';
    const ok = await sendSoftfileWA(
      phone,
      (success) => {
        if (success) {
          waSent = true;
          activeKbTarget = null;
          kbOpen = false;
        }
      },
      boothFlow.sessionId ?? undefined
    );
    if (!ok && !waSent) {
      sendErrMsg = 'Gagal mengirim WA. Periksa Token Fonnte & format nomor WA di Settings.';
      setTimeout(() => (sendErrMsg = ''), 4000);
    }
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
    if (activeKbTarget === 'phone') {
      if (key === '⌫') {
        phone = phone.slice(0, -1);
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
      phone += key;
    } else {
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
  }

  const DEFAULT_BG = '#fdfdfd';
  let effectiveBg = $derived(
    background ?? uiConfig.getStepStyle('download').background ?? uiConfig.getStepStyle('softfile').background ?? DEFAULT_BG
  );
</script>

<div
  class="w-full h-full flex select-none font-['Inter',sans-serif] relative overflow-hidden"
  style:background={effectiveBg}
>
  <!-- Left: result strip preview with green theme & filmbar -->
  <div class="w-[42%] h-full bg-[#0E8E5E] flex flex-col items-center justify-between relative overflow-hidden shrink-0">
    <div
      class="absolute inset-0 opacity-10 pointer-events-none"
      style="background-image: repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(255,255,255,0.5) 20px, rgba(255,255,255,0.5) 21px);"
    ></div>

    <!-- Top FilmBar -->
    <div class="w-full h-6 flex items-center bg-black/20 shrink-0 z-20">
      <div class="flex gap-2 px-3 overflow-hidden">
        {#each Array(30) as _, i}
          <div class="w-4 h-3 rounded-[2px] bg-white/10 border border-white/5 shrink-0"></div>
        {/each}
      </div>
    </div>

    <div class="flex-1 flex flex-col items-center justify-center gap-5 relative z-10 p-4">
      <p class="text-white/60 text-[9px] font-bold uppercase tracking-[0.3em] m-0">✦ Hasil Foto Kamu ✦</p>

      <div class="relative">
        <div class="bg-white p-3 shadow-2xl rounded-2xl border border-gray-100 w-[210px]">
          {#if compositeUrl}
            <img src={compositeUrl} alt="Hasil Foto Template" class="w-full h-auto max-h-[50vh] object-contain rounded-xl block" />
          {:else}
            <div class="w-[180px] h-[260px] flex items-center justify-center text-gray-400 text-xs animate-pulse font-mono">
              Memproses Foto...
            </div>
          {/if}
        </div>

        <!-- Confetti dots -->
        {#each ['-top-4 -left-4 bg-[#FFC107]', '-top-3 right-2 bg-[#CD1C33]', 'bottom-0 -left-5 bg-white', 'bottom-4 -right-4 bg-[#FFC107]'] as cls}
          <div class={`absolute w-4 h-4 rounded-full ${cls}`}></div>
        {/each}
      </div>

      <div class="flex items-center gap-2 bg-black/20 rounded-full px-4 py-1.5">
        <span class="text-white/80 text-[10px] font-bold tracking-widest uppercase">
          Filter: {boothFlow.selectedFilterId || 'Original'}
        </span>
      </div>
    </div>

    <!-- Bottom FilmBar -->
    <div class="w-full h-6 flex items-center bg-black/20 shrink-0 z-20">
      <div class="flex gap-2 px-3 overflow-hidden">
        {#each Array(30) as _, i}
          <div class="w-4 h-3 rounded-[2px] bg-white/10 border border-white/5 shrink-0"></div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Right: email + QR dark retro panel -->
  <div
    class="flex-1 flex flex-col relative overflow-hidden"
    style="background: linear-gradient(160deg,#1a0a10 0%,#2d0d1a 60%,#1a1a2e 100%);"
  >
    <!-- Watermark -->
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[180px] font-black text-white/[0.03] leading-none select-none pointer-events-none font-['Playfair_Display',serif]">
      ✦
    </div>

    <!-- Header badge -->
    <div class="flex items-center justify-between px-8 pt-6 relative z-10">
      <div class="inline-flex items-center gap-2 bg-white/10 text-white/70 text-[9px] font-bold tracking-[0.3em] uppercase px-4 py-1.5 rounded-full">
        <Sparkles size={9} /> Foto Siap Diunduh!
      </div>
      {#if sent}
        <div class="bg-black/40 text-white/60 px-3 py-1.5 rounded-md text-[9px] font-mono flex items-center gap-1.5">
          <Clock size={10} /> Home dalam {timer}s
        </div>
      {/if}
    </div>

    <!-- Main Content -->
    <div
      class="flex-1 flex flex-col items-center justify-center gap-5 px-8 relative z-10 transition-transform duration-300"
      style={`transform: ${kbOpen ? 'translateY(-80px)' : 'translateY(0)'};`}
    >
      <div class="text-center mb-1">
        <h1 class="text-4xl font-['Playfair_Display',serif] font-bold text-white tracking-widest drop-shadow-xl m-0 uppercase">
          Scan &amp; Download
        </h1>
        <p class="text-white/50 text-xs mt-1 m-0">Masukkan email atau scan QR untuk softfile kamu</p>
      </div>

      <!-- Email Card -->
      <div
        class="w-full max-w-[340px] rounded-2xl overflow-hidden"
        style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 60px rgba(0,0,0,0.5);"
      >
        {#if !sent}
          <div class="p-5 flex flex-col gap-3 font-mono">
            <p class="text-[9px] font-bold tracking-[0.3em] uppercase text-white/40 m-0">Kirim Softfile</p>

            {#if emailEnabled}
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between text-[10px] text-white/70 font-bold">
                  <span>EMAIL SOFTFILE</span>
                  {#if emailSent}<span class="text-[#FFC107] font-bold">✓ TERKIRIM</span>{/if}
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  onclick={() => { activeKbTarget = 'email'; kbOpen = true; numMode = false; }}
                  class="w-full rounded-xl px-3 py-2 cursor-text flex items-center transition-all min-h-[42px]"
                  style={`font-family: 'Space Mono', monospace; font-size: 12px; font-weight: 700; background: ${activeKbTarget === 'email' && kbOpen ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)'}; border: 1.5px solid ${activeKbTarget === 'email' && kbOpen ? '#FFC107' : 'rgba(255,255,255,0.12)'}; color: ${email ? '#fff' : 'rgba(255,255,255,0.25)'};`}
                >
                  {email || 'nama@email.com'}
                </div>
                <button
                  onclick={handleSendEmail}
                  disabled={!email.trim() || emailSent}
                  class="w-full py-2.5 rounded-xl font-black text-xs tracking-[0.15em] uppercase flex items-center justify-center gap-2 active:scale-95 transition-all border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style="background: #FFC107; color: #000;"
                >
                  {emailSent ? 'Email Terkirim' : 'Kirim Email'}
                </button>
              </div>
            {/if}

            {#if whatsappEnabled}
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between text-[10px] text-white/70 font-bold">
                  <span>WHATSAPP (FONNTE)</span>
                  {#if waSent}<span class="text-green-400 font-bold">✓ TERKIRIM</span>{/if}
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  onclick={() => { activeKbTarget = 'phone'; kbOpen = true; numMode = true; }}
                  class="w-full rounded-xl px-3 py-2 cursor-text flex items-center transition-all min-h-[42px]"
                  style={`font-family: 'Space Mono', monospace; font-size: 12px; font-weight: 700; background: ${activeKbTarget === 'phone' && kbOpen ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)'}; border: 1.5px solid ${activeKbTarget === 'phone' && kbOpen ? '#25d366' : 'rgba(255,255,255,0.12)'}; color: ${phone ? '#fff' : 'rgba(255,255,255,0.25)'};`}
                >
                  {phone || '08123456789'}
                </div>
                <button
                  onclick={handleSendWA}
                  disabled={!phone.trim() || waSent}
                  class="w-full py-2.5 rounded-xl font-black text-xs tracking-[0.15em] uppercase flex items-center justify-center gap-2 active:scale-95 transition-all border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style="background: #25d366; color: #fff;"
                >
                  {waSent ? 'WA Terkirim' : 'Kirim WhatsApp'}
                </button>
              </div>
            {/if}

            {#if error}
              <p class="text-[10px] text-red-400 font-bold tracking-wide flex items-center gap-1 m-0 font-mono">
                <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01" stroke-linecap="round"/></svg>
                Format input tidak valid
              </p>
            {/if}
            {#if sendErrMsg}
              <p class="text-[10px] text-red-400 font-bold tracking-wide flex items-center gap-1 m-0 font-mono mt-1">
                <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01" stroke-linecap="round"/></svg>
                {sendErrMsg}
              </p>
            {/if}
          </div>
        {:else}
          <div class="p-5 flex items-center gap-3 font-mono">
            <div class="w-9 h-9 rounded-full bg-[#FFC107] flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" fill="none" stroke="#000" stroke-width="2.8" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div>
              <p class="font-black text-xs text-white tracking-[0.15em] uppercase m-0">Softfile Terkirim!</p>
              {#if emailSent}<p class="text-[10px] text-white/50 mt-0.5 m-0">Email: {email}</p>{/if}
              {#if waSent}<p class="text-[10px] text-white/50 mt-0.5 m-0">WA: {phone}</p>{/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- QR Card (slides in after send) -->
      <div
        class="w-full max-w-[340px] rounded-2xl flex flex-col items-center overflow-hidden transition-all duration-700 relative"
        style={`background: #fff; max-height: ${sent ? '260px' : '0px'}; opacity: ${sent ? 1 : 0}; padding: ${sent ? '20px' : '0 20px'}; box-shadow: ${sent ? '0 20px 60px rgba(0,0,0,0.5)' : 'none'};`}
      >
        <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FFC107] text-black text-[8px] font-black tracking-widest px-4 py-1 rounded-full uppercase shadow font-mono">
          Gratis Download!
        </div>
        <p class="text-[9px] font-black tracking-[0.3em] uppercase text-gray-400 mb-3 mt-1 m-0">Scan to Download</p>
        <div class="p-3 rounded-xl bg-gray-50 border-2 border-[#FFC107]">
          {#if qrDataUrl}
            <img src={qrDataUrl} alt="Softfile QR Code" class="w-[130px] h-[130px] object-contain block" />
          {/if}
        </div>
        <p class="text-[9px] text-gray-400 tracking-widest uppercase text-center font-bold mt-3 m-0 font-mono">
          potohub.com/download
        </p>
      </div>

      <!-- Finish CTA -->
      <button
        onclick={onDone}
        class="bg-white text-[#CD1C33] px-10 py-3 rounded-full font-black shadow-2xl hover:scale-105 active:scale-95 transition-all text-sm tracking-widest uppercase border-none cursor-pointer"
      >
        {sent ? '✦ Selesai' : '✦ Lewati'}
      </button>
    </div>

    <!-- On-screen keyboard -->
    <div
      class="absolute bottom-0 left-0 right-0 z-50 transition-transform duration-300"
      style={`transform: ${kbOpen ? 'translateY(0)' : 'translateY(100%)'};`}
    >
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="flex items-center justify-between px-5 py-2 cursor-pointer"
        style="background: rgba(10,10,15,0.98); border-top: 1px solid rgba(255,255,255,0.1);"
        onclick={() => (kbOpen = false)}
      >
        <span class="text-[9px] font-bold tracking-[0.3em] uppercase text-white/30 font-mono">Keyboard</span>
        <span class="text-[9px] font-bold text-white/30">✕ Tutup</span>
      </div>

      <!-- V3 Keyboard keycaps -->
      <div class="flex flex-col gap-1.5 px-3 pb-4 pt-3 bg-[#0a0a0f] border-t border-white/10 backdrop-blur-xl">
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
                class="rounded-lg flex items-center justify-center font-semibold transition-all border border-white/10 cursor-pointer"
                style={`height: 46px; flex: ${isSpecial ? '0 0 9%' : '1 1 0'}; background: ${isShiftActive ? '#FFC107' : isSpecial ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)'}; color: ${isShiftActive ? '#000' : '#fff'}; font-size: ${key === '⌫' ? '14px' : '16px'};`}
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
            class="rounded-lg flex items-center justify-center font-semibold border border-white/10 bg-white/10 text-white text-xs cursor-pointer"
            style="height: 46px; flex: 0 0 9%;"
          >
            {numMode ? 'ABC' : '123'}
          </button>
          <button
            onpointerdown={(e) => {
              e.preventDefault();
              email = email + ' ';
            }}
            class="rounded-lg flex-1 flex items-center justify-center border border-white/10 bg-white/12 text-white text-xs cursor-pointer"
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
              class="rounded-lg flex items-center justify-center font-bold border border-white/10 bg-white/12 text-white text-base cursor-pointer"
              style="height: 46px; flex: 0 0 7%;"
            >
              {ch}
            </button>
          {/each}
          <button
            onpointerdown={(e) => {
              e.preventDefault();
              if (activeKbTarget === 'email') handleSendEmail();
              else handleSendWA();
            }}
            class="rounded-lg flex items-center justify-center font-black bg-[#FFC107] text-black text-xs border-none cursor-pointer"
            style="height: 46px; flex: 0 0 13%;"
          >
            Kirim
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
