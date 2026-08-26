<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import QRCode from 'qrcode';
  import { Printer, Send, Delete } from '@lucide/svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { sendSoftFile, formatTime } from '$lib/utils/shared';

  interface Props {
    photos?: string[];
    onNewSession: () => void;
  }

  let { photos = [], onNewSession }: Props = $props();

  let email = $state('');
  let sent = $state(false);
  let secs = $state(5 * 60);
  let kbOpen = $state(false);
  let caps = $state(false);
  let numMode = $state(false);
  let timer: any = null;
  let qrDataUrl = $state('');

  const ADMIN_DASHBOARD_PUBLIC_URL = (import.meta.env as Record<string, string>).VITE_ADMIN_DASHBOARD_URL ?? 'http://localhost:5173';

  $effect(() => {
    const sessionId = boothFlow.sessionId || 'demo-session';
    const softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/s/${sessionId}`;
    QRCode.toDataURL(softfileUrl, { margin: 1, width: 200 })
      .then((url) => {
        qrDataUrl = url;
      })
      .catch((err) => {
        console.error('Failed to generate QR code:', err);
      });
  });

  const PLACEHOLDER = 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=500&fit=crop&auto=format';
  let displayPhotos = $derived(photos.length > 0 ? photos.slice(0, 4) : Array(4).fill(PLACEHOLDER));

  onMount(() => {
    timer = setInterval(() => {
      if (secs > 0) secs--;
      else {
        clearInterval(timer);
        onNewSession();
      }
    }, 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  // Stub softfile send implementation - see §0 item 5
  async function handleSend() {
    if (!email.trim() || sent) return;
    // TODO: integrasikan ke API pembayaran/softfile setelah gap backend selesai
    await sendSoftFile(email, () => {
      sent = true;
      kbOpen = false;
    });
  }

  const ROWS_ALPHA = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫']
  ];
  const ROWS_NUM = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['-', '_', '.', '@', '#', '!', '&', '*', '(', ')'],
    ['ABC', '/', '\\', ':', ';', "'", '"', ',', '⌫']
  ];

  let currentKbRows = $derived(numMode ? ROWS_NUM : ROWS_ALPHA);

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
  class="w-full h-full flex flex-col items-center justify-center select-none relative overflow-hidden text-[#e6e1e5]"
  style="background: #0d0d0d; font-family: 'Poppins', sans-serif;"
>
  <!-- Timer pill -->
  <div class="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white/80 rounded-full px-5 py-2.5 text-sm font-semibold border border-white/10 z-10">
    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6h4.5" stroke-linecap="round" />
    </svg>
    {formatTime(secs)}
  </div>

  <!-- Main content -->
  <div
    class="flex items-center gap-10 transition-transform duration-300"
    style="transform: {kbOpen ? 'translateY(-120px)' : 'translateY(0)'};"
  >
    <!-- Left: film strip mockup -->
    <div class="flex flex-col items-center shrink-0">
      <div
        class="flex flex-col overflow-hidden bg-[#1a1a1a] border-[3px] border-[#e8e8e8] rounded-[24px] w-[200px] shadow-[0_24px_64px_rgba(0,0,0,0.7)]"
      >
        <div class="flex flex-col gap-[3px] p-2.5 bg-[#111]">
          <div class="flex gap-2">
            <div class="flex flex-col justify-evenly py-2 shrink-0 w-2.5 gap-[6px]">
              {#each Array(displayPhotos.length * 2) as _, i}
                <div class="w-2 h-2 rounded-full bg-white/70 shrink-0"></div>
              {/each}
            </div>
            <div class="flex flex-col gap-1.5 flex-1">
              {#each displayPhotos as src, i}
                <div class="rounded-md overflow-hidden bg-[#2a2825] h-[80px]">
                  <img {src} alt={`Foto ${i + 1}`} class="w-full h-full object-cover block" />
                </div>
              {/each}
            </div>
            <div class="flex flex-col justify-evenly py-2 shrink-0 w-2.5 gap-[6px]">
              {#each Array(displayPhotos.length * 2) as _, i}
                <div class="w-2 h-2 rounded-full bg-white/70 shrink-0"></div>
              {/each}
            </div>
          </div>
        </div>
        <div class="flex flex-col items-center gap-2 py-3 px-3 bg-[#111]">
          <span class="text-white/80 text-[11px] font-black tracking-[0.25em] uppercase">
            {uiConfig.config.boothName}
          </span>
        </div>
      </div>
    </div>

    <!-- Right: cards -->
    <div class="flex flex-col gap-4 w-[340px]">
      <div class="rounded-2xl p-6 flex flex-col gap-4 bg-white text-gray-900 shadow-xl">
        {#if sent}
          <div class="flex flex-col items-center gap-3">
            <div class="flex items-center gap-2 w-full">
              <div class="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shrink-0 text-white font-bold">
                ✓
              </div>
              <div>
                <p class="font-black text-[#111] text-sm leading-tight m-0">Softfile Dikirim!</p>
                <p class="text-[#888] text-[11px] leading-tight truncate max-w-[220px] m-0">{email}</p>
              </div>
            </div>
            <div class="w-full h-px bg-gray-100"></div>
            <p class="text-[11px] text-gray-400 font-semibold tracking-wider uppercase m-0">Scan untuk Download</p>
            <div class="p-3 rounded-2xl bg-white border border-gray-100 flex items-center justify-center">
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
            <p class="text-[10px] text-gray-400 text-center m-0">
              File tersedia 30 hari. Scan dengan kamera HP kamu.
            </p>
          </div>
        {:else}
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center shrink-0 text-white">
              <Send size={16} />
            </div>
            <div>
              <p class="font-black text-[#111] text-base leading-tight m-0">Scan QR / Email</p>
              <p class="text-[#888] text-[12px] leading-tight mt-0.5 m-0">Dapatkan softfile foto kamu</p>
            </div>
          </div>

          {#if qrDataUrl}
            <div class="p-2 rounded-xl border border-gray-100 bg-gray-50 flex flex-col items-center justify-center">
              <img src={qrDataUrl} alt="Softfile QR Code" class="w-[130px] h-[130px] object-contain" />
              <p class="text-[10px] text-gray-400 text-center font-semibold mt-1 m-0">Scan dengan kamera HP</p>
            </div>
          {/if}

          <button
            type="button"
            onclick={() => (kbOpen = true)}
            class="w-full rounded-xl px-4 py-3 text-sm cursor-text border-2 text-left bg-[#f2f2f2]"
            style="border-color: {kbOpen ? '#2563eb' : 'transparent'};"
          >
            {email || 'nama@email.com'}
          </button>

          <!-- TODO: integrasikan ke API pembayaran/softfile setelah gap backend selesai -->
          <button
            type="button"
            onclick={handleSend}
            disabled={!email.trim()}
            class="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all border-0"
            style="
              background: {email.trim() ? '#111' : '#e0e0e0'};
              color: {email.trim() ? '#fff' : '#999'};
              cursor: {email.trim() ? 'pointer' : 'default'};
            "
          >
            Kirim Softfile (Local State)
          </button>
        {/if}
      </div>

      <!-- Print status card -->
      <div class="rounded-2xl px-5 py-4 flex items-center gap-4 bg-[#1c1c1e] border border-[#2a2a2a]">
        <div class="w-11 h-11 rounded-full bg-[#2a2a2a] flex items-center justify-center text-white/80 shrink-0">
          <Printer size={20} />
        </div>
        <div>
          <p class="text-white font-bold text-sm leading-tight m-0">Fotomu sedang dicetak</p>
          <p class="text-white/40 text-[12px] mt-0.5 m-0">Harap tunggu beberapa saat lagi...</p>
        </div>
      </div>

      <!-- Selesai button -->
      <button
        onclick={() => {
          kbOpen = false;
          onNewSession();
        }}
        class="w-full py-4 rounded-2xl font-bold text-base tracking-wide bg-[#1c1c1e] text-white border border-[#333] cursor-pointer hover:bg-[#2a2a2a]"
      >
        Selesai
      </button>
    </div>
  </div>

  <!-- On-Screen Keyboard -->
  {#if kbOpen}
    <div
      class="absolute bottom-0 left-0 right-0 flex flex-col gap-2 px-3 pb-4 pt-3 z-50 bg-[rgba(20,20,20,0.97)] backdrop-blur-md border-t border-white/10"
    >
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
              class="rounded-lg flex items-center justify-center font-semibold transition-all select-none border-0"
              style="
                height: 50px;
                flex: {isSpecial ? '0 0 9%' : '1 1 0'};
                background: {isShiftActive ? '#ffffff' : isSpecial ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)'};
                color: {isShiftActive ? '#111' : '#fff'};
                font-size: {key === '⌫' ? '14px' : '17px'};
              "
            >
              {#if key === '⌫'}
                <Delete size={16} />
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
          class="rounded-lg flex items-center justify-center font-semibold text-white border-0 bg-white/12 text-sm"
          style="height: 50px; flex: 0 0 9%;"
        >
          {numMode ? 'ABC' : '123'}
        </button>

        <button
          onpointerdown={(e) => {
            e.preventDefault();
            email = email + ' ';
          }}
          class="rounded-lg flex-1 flex items-center justify-center text-white border-0 bg-white/18 text-sm"
          style="height: 50px;"
        >
          spasi
        </button>

        {#each ['@', '.'] as ch}
          <button
            onpointerdown={(e) => {
              e.preventDefault();
              email = email + ch;
            }}
            class="rounded-lg flex items-center justify-center font-bold text-white border-0 bg-white/18 text-lg"
            style="height: 50px; flex: 0 0 7%;"
          >
            {ch}
          </button>
        {/each}

        <button
          onpointerdown={(e) => {
            e.preventDefault();
            kbOpen = false;
          }}
          class="rounded-lg flex items-center justify-center font-bold text-white border-0 bg-blue-600 text-sm"
          style="height: 50px; flex: 0 0 12%;"
        >
          Selesai
        </button>
      </div>
    </div>
  {/if}
</div>
