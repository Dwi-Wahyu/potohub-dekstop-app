<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { X, RotateCcw, Settings, ShieldAlert } from '@lucide/svelte';
  import PinPad from '$lib/components/shared/PinPad.svelte';
  import { boothFlow } from '$lib/stores/booth.svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { clearActiveCheckpoint } from '$lib/utils/activeSessionCheckpoint';
  import { setKioskLockedMode } from '$lib/utils/windowControl';

  let mode = $state<'closed' | 'pin' | 'actions'>('closed');
  let intent = $state<'menu' | 'cancel_session'>('menu');
  let isProcessing = $state(false);

  // Deteksi 5x tap cepat di pojok kanan atas untuk kiosk touchscreen tanpa keyboard
  let cornerTapCount = 0;
  let cornerTapResetTimer: ReturnType<typeof setTimeout> | null = null;

  const LANDING_STEPS = new Set(['welcome', 'landing', 'start']);
  let showTouchCornerTrigger = $derived(
    page.url.pathname === '/' && !LANDING_STEPS.has(boothFlow.step) && mode === 'closed'
  );

  function openPinPrompt(nextIntent: 'menu' | 'cancel_session') {
    intent = nextIntent;
    mode = 'pin';
  }

  function closeModal() {
    if (isProcessing) return;
    mode = 'closed';
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.shiftKey && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'x' || e.key === 'Backspace') {
        e.preventDefault();
        openPinPrompt('cancel_session');
        return;
      }
      if (key === 'o' || key === 'p') {
        e.preventDefault();
        openPinPrompt('menu');
        return;
      }
    }
    if (e.key === 'Escape' && mode === 'actions') {
      e.preventDefault();
      closeModal();
    }
  }

  function handleCornerTap() {
    cornerTapCount++;
    if (cornerTapResetTimer) clearTimeout(cornerTapResetTimer);
    if (cornerTapCount >= 5) {
      cornerTapCount = 0;
      openPinPrompt('menu');
      return;
    }
    cornerTapResetTimer = setTimeout(() => {
      cornerTapCount = 0;
    }, 2500);
  }

  async function handleCancelActiveSession() {
    if (isProcessing) return;
    isProcessing = true;
    try {
      await clearActiveCheckpoint();
      await cameraStore.stopLiveview().catch(() => {});
      boothFlow.forceCancelToWelcome();
      mode = 'closed';
      if (page.url.pathname !== '/') {
        await goto('/');
      }
    } finally {
      isProcessing = false;
    }
  }

  async function handleOpenOperatorPanel() {
    if (isProcessing) return;
    isProcessing = true;
    try {
      await cameraStore.stopLiveview().catch(() => {});
      void setKioskLockedMode(false);
      mode = 'closed';
      await goto('/settings');
    } finally {
      isProcessing = false;
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if showTouchCornerTrigger}
  <button
    type="button"
    onclick={handleCornerTap}
    aria-label="Akses darurat operator (tap 5 kali)"
    title="Tap 5x cepat untuk akses operator"
    class="fixed top-2 right-2 w-14 h-14 z-[120] bg-transparent border-none outline-none cursor-default"
  ></button>
{/if}

{#if mode === 'pin'}
  <div
    class="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none"
    onclick={closeModal}
    role="presentation"
  >
    <div onclick={(e) => e.stopPropagation()} role="presentation" class="flex flex-col items-center gap-3">
      <PinPad
        title={intent === 'cancel_session' ? 'Batalkan Sesi Aktif' : 'Akses Operator'}
        subtitle="Masukkan PIN untuk membuka menu operator / batalkan sesi"
        onSuccess={() => {
          mode = 'actions';
        }}
        onCancel={closeModal}
      />
      <p class="text-[11px] text-white/75 m-0 font-['Poppins',sans-serif]">
        Shortcut: Ctrl+Shift+X (Batalkan Sesi) · Ctrl+Shift+O (Operator)
      </p>
    </div>
  </div>
{:else if mode === 'actions'}
  <div
    class="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none font-['Poppins',sans-serif]"
    onclick={closeModal}
    role="presentation"
  >
    <div
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Menu Darurat Operator"
      tabindex="-1"
      style="
        background: #ebf0f7;
        border-radius: 24px;
        padding: 28px;
        width: 100%;
        max-width: 400px;
        box-shadow: 0 24px 64px rgba(0,0,0,0.45);
        display: flex;
        flex-direction: column;
        gap: 16px;
        color: #1e293b;
      "
    >
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div
            style="
              width: 40px;
              height: 40px;
              border-radius: 12px;
              background: #fee2e2;
              color: #dc2626;
              display: flex;
              align-items: center;
              justify-content: center;
            "
          >
            <ShieldAlert size={20} />
          </div>
          <div>
            <h2 style="margin: 0; font-size: 15px; font-weight: 700; color: #1e293b;">Menu Operator Darurat</h2>
            <p style="margin: 0; font-size: 11px; color: #64748b;">
              Layar saat ini: <strong>{page.url.pathname === '/' ? boothFlow.step : page.url.pathname}</strong>
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={closeModal}
          aria-label="Tutup"
          style="
            width: 34px;
            height: 34px;
            border-radius: 10px;
            background: #e2e8f0;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #475569;
          "
        >
          <X size={16} />
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button
          type="button"
          onclick={handleCancelActiveSession}
          disabled={isProcessing}
          style="
            width: 100%;
            padding: 13px 16px;
            border-radius: 14px;
            border: none;
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white;
            font-size: 13px;
            font-weight: 700;
            cursor: {isProcessing ? 'not-allowed' : 'pointer'};
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 6px 16px rgba(220,38,38,0.3);
          "
        >
          <RotateCcw size={16} />
          <span>{isProcessing ? 'Memproses...' : 'Batalkan Sesi & Kembali ke Start'}</span>
        </button>

        <button
          type="button"
          onclick={handleOpenOperatorPanel}
          disabled={isProcessing}
          style="
            width: 100%;
            padding: 13px 16px;
            border-radius: 14px;
            border: none;
            background: linear-gradient(135deg, #3d3aa0, #2a2873);
            color: white;
            font-size: 13px;
            font-weight: 700;
            cursor: {isProcessing ? 'not-allowed' : 'pointer'};
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 6px 16px rgba(42,40,115,0.28);
          "
        >
          <Settings size={16} />
          <span>Buka Panel Operator (/settings)</span>
        </button>

        <button
          type="button"
          onclick={closeModal}
          disabled={isProcessing}
          style="
            width: 100%;
            padding: 10px 16px;
            border-radius: 12px;
            border: none;
            background: #e2e8f0;
            color: #475569;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
          "
        >
          Lanjutkan Sesi (Tutup)
        </button>
      </div>
    </div>
  </div>
{/if}
