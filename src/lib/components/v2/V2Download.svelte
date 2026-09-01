<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import QRCode from 'qrcode';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { sendSoftfileEmail, sendSoftfileWA, generateSessionCode } from '$lib/utils/shared';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { Delete, QrCode } from '@lucide/svelte';

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

  const ADMIN_DASHBOARD_PUBLIC_URL = (import.meta.env as Record<string, string>).VITE_ADMIN_DASHBOARD_URL ?? 'http://localhost:5173';

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
      console.error('[V2Download] Booth tidak aktif saat simpan sesi:', e);
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

  async function handleSendEmail() {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!valid) {
      error = true;
      setTimeout(() => (error = false), 1600);
      return;
    }
    await sendSoftfileEmail(
      email,
      () => {
        emailSent = true;
        activeKbTarget = null;
        kbOpen = false;
      },
      boothFlow.sessionId
    );
  }

  async function handleSendWA() {
    const valid = /^\+?[0-9]{8,15}$/.test(phone.trim().replace(/[\s-]/g, ''));
    if (!valid) {
      error = true;
      setTimeout(() => (error = false), 1600);
      return;
    }
    await sendSoftfileWA(
      phone,
      () => {
        waSent = true;
        activeKbTarget = null;
        kbOpen = false;
      },
      boothFlow.sessionId
    );
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

  const STEPPER_LABELS = ['Tutorial', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter', 'Scan File'];
  const activeIdx = 5;
  const DEFAULT_BG = '#fafafa';
  let effectiveBg = $derived(
    background ?? uiConfig.getStepStyle('download').background ?? uiConfig.getStepStyle('softfile').background ?? DEFAULT_BG
  );
</script>

<div
  class="w-full h-full flex flex-col relative overflow-hidden select-none"
  style:background={effectiveBg}
  style:font-family="'Playfair Display', Georgia, serif"
>
  <!-- StepperHeader -->
  <div
    class="w-full h-16 flex items-center justify-between px-10 border-b-2 border-black shrink-0 relative z-20 select-none"
    style="background: #C7EED8;"
  >
    <!-- dot pattern -->
    <div
      class="absolute inset-0 opacity-10 pointer-events-none"
      style="background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.5) 1px, transparent 0); background-size: 24px 24px;"
    ></div>

    <!-- stepper pills -->
    <div class="flex items-center gap-1 relative z-10 font-['Nunito',sans-serif]">
      {#each STEPPER_LABELS as label, i}
        {@const isActive = i === activeIdx}
        {@const isDone = i < activeIdx}
        <div class="flex items-center">
          <div
            class={`px-4 py-1.5 rounded-full border-2 border-black font-bold text-xs transition-all ${
              isActive
                ? 'bg-[#C7EED8] text-black shadow-[4px_4px_0_0_rgba(0,0,0,1)]'
                : isDone
                  ? 'bg-black text-white border-black'
                  : 'text-black/40 border-black/30 bg-transparent'
            }`}
          >
            {label}
          </div>
          {#if i < STEPPER_LABELS.length - 1}
            <div
              class={`w-6 h-px border-t border-black mx-0.5 ${isDone ? 'opacity-100' : 'opacity-30'}`}
            ></div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- brand -->
    <div class="flex items-center gap-2 relative z-10 font-['Nunito',sans-serif]">
      <div
        class="w-8 h-8 rounded-xl border-2 border-black bg-white flex items-center justify-center text-[#2a2873] shadow-inner"
      >
        <QrCode size={18} strokeWidth={2.5} />
      </div>
      <h1 class="text-black font-black text-xl m-0 tracking-wide drop-shadow-sm uppercase">
        {uiConfig.config.boothName || 'POTOHUB'}
      </h1>
    </div>
  </div>

  <!-- ClassicBorder -->
  <div class="absolute inset-5 pointer-events-none z-0">
    <div class="absolute inset-0 border-[3px] border-black rounded-[28px]"></div>
    <div class="absolute inset-[6px] border border-black/20 rounded-[23px]"></div>
    {#each ['top-3 left-3', 'top-3 right-3', 'bottom-3 left-3', 'bottom-3 right-3'] as pos}
      <div class="absolute {pos} w-4 h-4">
        <div
          class="w-2 h-2 border-t-2 border-l-2 border-black absolute top-0 left-0"
          style="border-radius: 2px 0 0 0;"
        ></div>
      </div>
    {/each}
  </div>

  <!-- Content -->
  <div
    class="relative z-10 flex-1 flex items-center justify-center gap-12 px-16 py-8 transition-transform duration-300"
    style={`transform: ${kbOpen ? 'translateY(-60px)' : 'translateY(0)'};`}
  >
    <!-- Left copy -->
    <div class="flex flex-col max-w-[300px]">
      <p class="text-xs tracking-[0.35em] uppercase text-black/30 mb-4 font-['Nunito',sans-serif] font-black m-0">
        Session Complete
      </p>
      <h2 class="text-[56px] font-black uppercase tracking-tight leading-[0.9] mb-3 m-0">
        Thank<br />You
      </h2>
      <h3 class="text-xl font-bold italic text-black/50 mb-5 m-0">for printing with us!</h3>
      <div class="w-16 h-[3px] bg-black mb-5"></div>
      <p class="text-sm text-black/40 leading-relaxed m-0 font-['Nunito',sans-serif]">
        Fotomu sedang dicetak. Masukkan email untuk mendapatkan softfile, atau scan QR setelah mengirim email.
      </p>
      {#if sent}
        <div class="mt-5 flex items-center gap-2 text-black/50 text-xs font-['Nunito',sans-serif] font-black tracking-[0.15em] uppercase">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"/></svg>
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

    <!-- Right cards -->
    <div class="flex flex-col gap-5">
      <!-- Email card -->
      <div
        class="border-[3px] border-black rounded-3xl bg-white p-7 w-[380px] transition-all duration-500 font-['Playfair_Display',serif]"
        style={`box-shadow: ${sent ? '4px 4px 0 0 #000' : '12px 12px 0 0 #000'};`}
      >
        {#if !sent}
          <p class="text-xs font-black uppercase tracking-[0.25em] mb-1 text-black/40 font-['Nunito',sans-serif] m-0">
            Download Softfile
          </p>
          <p class="text-[13px] text-black/40 mb-4 font-['Playfair_Display',serif] m-0">
            Pilih metode pengiriman softfile
          </p>

          <div class="flex flex-col gap-4 font-['Nunito',sans-serif]">
            {#if emailEnabled}
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between text-xs font-bold text-black/60 uppercase tracking-wider">
                  <span>Email Softfile</span>
                  {#if emailSent}<span class="text-green-600 font-black">✓ Terkirim</span>{/if}
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  onclick={() => { activeKbTarget = 'email'; kbOpen = true; numMode = false; }}
                  class="w-full border-[2.5px] rounded-2xl px-4 py-2.5 cursor-text flex items-center transition-all min-h-[46px]"
                  style={`font-family: 'Courier New', monospace; font-size: 14px; font-weight: 700; border-color: ${activeKbTarget === 'email' && kbOpen ? '#000' : '#d1d5db'}; background: ${activeKbTarget === 'email' && kbOpen ? '#fafafa' : '#f9f9f9'}; color: ${email ? '#000' : '#aaa'};`}
                >
                  {email || 'nama@email.com'}
                </div>
                <button
                  onclick={handleSendEmail}
                  disabled={!email.trim() || emailSent}
                  class="w-full py-2.5 bg-black text-white font-black uppercase text-xs tracking-[0.18em] rounded-xl hover:bg-black/80 transition-all flex items-center justify-center gap-2 cursor-pointer border-none shadow-[3px_3px_0_0_rgba(0,0,0,0.2)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {emailSent ? 'Email Terkirim' : 'Kirim Email'}
                </button>
              </div>
            {/if}

            {#if whatsappEnabled}
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between text-xs font-bold text-black/60 uppercase tracking-wider">
                  <span>WhatsApp (Fonnte)</span>
                  {#if waSent}<span class="text-green-600 font-black">✓ Terkirim</span>{/if}
                </div>
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  onclick={() => { activeKbTarget = 'phone'; kbOpen = true; numMode = true; }}
                  class="w-full border-[2.5px] rounded-2xl px-4 py-2.5 cursor-text flex items-center transition-all min-h-[46px]"
                  style={`font-family: 'Courier New', monospace; font-size: 14px; font-weight: 700; border-color: ${activeKbTarget === 'phone' && kbOpen ? '#000' : '#d1d5db'}; background: ${activeKbTarget === 'phone' && kbOpen ? '#fafafa' : '#f9f9f9'}; color: ${phone ? '#000' : '#aaa'};`}
                >
                  {phone || '08123456789'}
                </div>
                <button
                  onclick={handleSendWA}
                  disabled={!phone.trim() || waSent}
                  class="w-full py-2.5 bg-[#16a34a] text-white font-black uppercase text-xs tracking-[0.18em] rounded-xl hover:bg-[#15803d] transition-all flex items-center justify-center gap-2 cursor-pointer border-none shadow-[3px_3px_0_0_rgba(0,0,0,0.2)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {waSent ? 'WA Terkirim' : 'Kirim WhatsApp'}
                </button>
              </div>
            {/if}

            {#if error}
              <p class="text-xs text-red-500 font-bold tracking-wide flex items-center gap-1.5 font-['Nunito',sans-serif] m-0">
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01" stroke-linecap="round"/></svg>
                Format input tidak valid
              </p>
            {/if}
          </div>
        {:else}
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-full bg-black flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" fill="none" stroke="white" stroke-width="2.8" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div>
              <p class="font-black text-sm uppercase tracking-[0.15em] font-['Nunito',sans-serif] m-0">Softfile Terkirim!</p>
              {#if emailSent}<p class="text-xs text-black/40 mt-0.5 font-['Nunito',sans-serif] m-0">Email: {email}</p>{/if}
              {#if waSent}<p class="text-xs text-black/40 mt-0.5 font-['Nunito',sans-serif] m-0">WA: {phone}</p>{/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- QR Card -->
      <div
        class="border-[3px] border-black rounded-3xl bg-white flex flex-col items-center overflow-hidden transition-all duration-700 font-['Nunito',sans-serif]"
        style={`box-shadow: 12px 12px 0 0 #000; max-height: ${sent ? '320px' : '0px'}; opacity: ${sent ? 1 : 0}; padding: ${sent ? '28px' : '0 28px'}; border-width: ${sent ? 3 : 0}; width: 380px;`}
      >
        <p class="text-xs font-black uppercase tracking-[0.25em] mb-1 text-black/40 m-0">Scan to Download</p>
        <p class="text-[12px] text-black/30 mb-4 m-0">Atau buka link yang dikirim ke email kamu</p>
        <div class="border-[2.5px] border-black rounded-2xl p-3 mb-3 bg-white">
          {#if qrDataUrl}
            <img src={qrDataUrl} alt="Softfile QR Code" class="w-[140px] h-[140px] object-contain" />
          {/if}
        </div>
        <p class="text-[10px] font-black tracking-[0.3em] text-black/30 m-0">SCAN ME · {sessionCode}</p>
      </div>
    </div>
  </div>

  <!-- On-Screen Keyboard -->
  <div
    class="absolute bottom-0 left-0 right-0 z-50 transition-transform duration-300"
    style={`transform: ${kbOpen ? 'translateY(0)' : 'translateY(100%)'};`}
  >
    <!-- Close strip -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex items-center justify-between px-5 py-2 border-t-[3px] border-black bg-[#f0f0f0] cursor-pointer"
      onclick={() => (kbOpen = false)}
    >
      <span class="text-xs font-black uppercase tracking-[0.2em] text-black/40 font-['Nunito',sans-serif]">Keyboard</span>
      <span class="text-xs font-black text-black/40 font-['Nunito',sans-serif]">✕ Tutup</span>
    </div>

    <!-- V2 Keyboard -->
    <div class="flex flex-col gap-1.5 px-3 pb-4 pt-3 bg-white border-t-[3px] border-black">
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
              class="rounded-lg flex items-center justify-center font-bold transition-all border-[2px] border-black cursor-pointer font-['Nunito',sans-serif]"
              style={`height: 46px; flex: ${isSpecial ? '0 0 9%' : '1 1 0'}; min-width: 0; background: ${isShiftActive ? '#000' : isSpecial ? '#f0f0f0' : '#fff'}; color: ${isShiftActive ? '#fff' : '#000'}; font-size: ${key === '⌫' ? '14px' : '16px'}; box-shadow: 2px 2px 0 0 #000;`}
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
          class="rounded-lg flex items-center justify-center font-bold border-[2px] border-black bg-[#f0f0f0] cursor-pointer font-['Nunito',sans-serif]"
          style="height: 46px; flex: 0 0 9%; font-size: 13px; box-shadow: 2px 2px 0 0 #000;"
        >
          {numMode ? 'ABC' : '123'}
        </button>
        <button
          onpointerdown={(e) => {
            e.preventDefault();
            email = email + ' ';
          }}
          class="rounded-lg flex-1 flex items-center justify-center border-[2px] border-black bg-white cursor-pointer font-['Nunito',sans-serif]"
          style="height: 46px; box-shadow: 2px 2px 0 0 #000; font-size: 13px;"
        >
          spasi
        </button>
        {#each ['@', '.'] as ch}
          <button
            onpointerdown={(e) => {
              e.preventDefault();
              email = email + ch;
            }}
            class="rounded-lg flex items-center justify-center font-bold border-[2px] border-black bg-white cursor-pointer font-['Nunito',sans-serif]"
            style="height: 46px; flex: 0 0 7%; font-size: 17px; box-shadow: 2px 2px 0 0 #000;"
          >
            {ch}
          </button>
        {/each}
        <button
          onpointerdown={(e) => {
            e.preventDefault();
            handleSend();
          }}
          class="rounded-lg flex items-center justify-center font-black border-[2px] border-black bg-black text-white cursor-pointer font-['Nunito',sans-serif]"
          style="height: 46px; flex: 0 0 13%; font-size: 13px; box-shadow: 2px 2px 0 0 rgba(0,0,0,0.35);"
        >
          Kirim
        </button>
      </div>
    </div>
  </div>
</div>
