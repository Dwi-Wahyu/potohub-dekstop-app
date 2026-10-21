<script lang="ts">
  import { Minus, X, Settings, Lock, LockOpen } from '@lucide/svelte';
  import { minimizeWindow, closeWindow } from '$lib/utils/windowControl';

  interface Props {
    showPinModal?: boolean;
    isOperatorUnlocked: boolean;
    onTriggerPin: () => void;
    onOpenConfig: () => void;
  }

  let {
    showPinModal = $bindable(false),
    isOperatorUnlocked = $bindable(false),
    onTriggerPin,
    onOpenConfig
  }: Props = $props();

  function handleLockClick() {
    if (isOperatorUnlocked) {
      // Menutup akses operator / kunci kembali booth
      isOperatorUnlocked = false;
    } else {
      // Buka modal PIN password untuk touchscreen kiosk
      onTriggerPin();
    }
  }
</script>

<!-- Top Left: Minimize (-) & Close (x) Icon-only Buttons (HANYA muncul saat akses operator SUDAH diberikan) -->
{#if isOperatorUnlocked}
  <div class="fixed top-4 left-4 z-[100] flex items-center gap-2.5 animate-in fade-in duration-200 select-none">
    <button
      type="button"
      onclick={minimizeWindow}
      title="Minimize"
      aria-label="Minimize"
      class="neu-white-btn w-11 h-11 rounded-2xl text-slate-700 hover:text-slate-900 flex items-center justify-center cursor-pointer"
    >
      <Minus size={19} strokeWidth={2.8} />
    </button>

    <button
      type="button"
      onclick={closeWindow}
      title="Tutup Aplikasi"
      aria-label="Tutup Aplikasi"
      class="neu-white-btn w-11 h-11 rounded-2xl text-rose-600 hover:text-rose-700 flex items-center justify-center cursor-pointer"
    >
      <X size={19} strokeWidth={2.8} />
    </button>
  </div>
{/if}

<!-- Top Right: Icon Gembok di ujung kanan
     - Saat locked: Gembok tertutup (ditekan membuka PIN password)
     - Saat akses operator terbuka: Gembok terbuka (ditekan untuk menutup akses operator)
-->
<button
  type="button"
  onclick={handleLockClick}
  title={isOperatorUnlocked ? 'Tutup Akses Operator' : 'Buka Pengaturan Booth (PIN)'}
  aria-label={isOperatorUnlocked ? 'Tutup Akses Operator' : 'Buka Pengaturan Booth'}
  class="fixed top-4 right-4 z-[90] w-11 h-11 rounded-2xl flex items-center justify-center cursor-pointer select-none {isOperatorUnlocked
    ? 'neu-white-active text-amber-600'
    : 'neu-white-btn text-[#2a2873]'}"
>
  {#if isOperatorUnlocked}
    <LockOpen size={20} strokeWidth={2.5} />
  {:else}
    <Lock size={19} strokeWidth={2.3} />
  {/if}
</button>

<!-- Bottom Right: Tombol Membuka Config Dashboard (Hanya muncul saat akses operator aktif) -->
{#if isOperatorUnlocked}
  <div class="fixed bottom-5 right-5 z-[100] flex items-center animate-in fade-in slide-in-from-bottom-4 duration-200 select-none font-sans">
    <button
      type="button"
      onclick={onOpenConfig}
      title="Buka Config Dashboard"
      class="neu-white-btn flex items-center gap-2.5 px-5 py-3 rounded-2xl text-[#2a2873] text-sm font-extrabold tracking-wide cursor-pointer select-none"
    >
      <Settings size={18} class="animate-spin-slow text-[#3d3aa0]" />
      <span>Config Dashboard</span>
    </button>
  </div>
{/if}

<style>
  .neu-white-btn {
    background: #ffffff;
    box-shadow: 4px 4px 10px rgba(0, 0, 0, 0.12), -2px -2px 6px rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.9);
    transition: all 0.15s ease;
  }
  .neu-white-btn:hover {
    box-shadow: 5px 5px 14px rgba(0, 0, 0, 0.16), -3px -3px 8px rgba(255, 255, 255, 1);
    transform: translateY(-1px);
  }
  .neu-white-btn:active {
    box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.14), inset -2px -2px 5px rgba(255, 255, 255, 0.9);
    transform: translateY(0) scale(0.95);
  }

  .neu-white-active {
    background: #ffffff;
    box-shadow: inset 3px 3px 6px rgba(217, 119, 6, 0.25), inset -2px -2px 5px rgba(255, 255, 255, 0.9), 0 0 0 2px rgba(245, 158, 11, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.9);
    transition: all 0.15s ease;
  }
  .neu-white-active:active {
    transform: scale(0.95);
  }

  @keyframes spin-slow {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  :global(.animate-spin-slow) {
    animation: spin-slow 12s linear infinite;
  }
</style>
