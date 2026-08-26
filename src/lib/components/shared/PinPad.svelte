<script lang="ts">
  import { Lock } from '@lucide/svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';

  interface Props {
    title?: string;
    subtitle?: string;
    onSuccess: () => void;
    onCancel?: () => void;
  }

  let {
    title = 'Login Petugas',
    subtitle = 'Masukkan PIN untuk mengakses pengaturan mesin',
    onSuccess,
    onCancel
  }: Props = $props();

  let pinInput = $state('');
  let pinError = $state(false);
  let pinShake = $state(false);

  function handlePinDigit(d: string) {
    if (pinInput.length >= 4) return;
    const next = pinInput + d;
    pinInput = next;
    pinError = false;

    if (next.length === 4) {
      setTimeout(() => {
        if (next === boothConfig.config.pin) {
          onSuccess();
        } else {
          pinError = true;
          pinShake = true;
          setTimeout(() => {
            pinInput = '';
            pinShake = false;
          }, 600);
        }
      }, 200);
    }
  }

  function handleBackspace() {
    pinInput = pinInput.slice(0, -1);
    pinError = false;
  }
</script>

<div
  onclick={(e) => e.stopPropagation()}
  role="presentation"
  style="
    background: #ebf0f7;
    border-radius: 24px;
    padding: 36px 32px;
    width: 320px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.4);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    font-family: 'Poppins', sans-serif;
  "
>
  <div
    style="
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: #ebf0f7;
      box-shadow: 6px 6px 14px #c8d2e0, -6px -6px 14px #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
    "
  >
    <Lock size={24} class="text-[#2a2873]" />
  </div>

  <div style="text-align: center;">
    <p style="font-weight: 700; font-size: 1rem; color: #334155; margin: 0;">
      {title}
    </p>
    <p style="font-size: 12px; color: #94a3b8; margin-top: 4px; margin-bottom: 0;">
      {subtitle}
    </p>
  </div>

  <div
    style="
      display: flex;
      gap: 12px;
      animation: {pinShake ? 'shake 0.5s ease' : 'none'};
    "
  >
    {#each [0, 1, 2, 3] as i}
      <div
        style="
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: {pinInput.length > i ? (pinError ? '#ef4444' : '#2a2873') : '#d1d9e6'};
          transition: background 0.15s;
          box-shadow: {pinInput.length > i ? 'none' : 'inset 2px 2px 4px #c8d2e0, inset -2px -2px 4px #ffffff'};
        "
      ></div>
    {/each}
  </div>

  {#if pinError}
    <p style="font-size: 12px; color: #ef4444; font-weight: 600; margin: -12px 0 0 0;">
      PIN salah, coba lagi
    </p>
  {/if}

  <div
    style="
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      width: 100%;
    "
  >
    {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as d, idx}
      {#if d === ''}
        <div></div>
      {:else}
        <button
          onclick={() => (d === '⌫' ? handleBackspace() : handlePinDigit(d))}
          style="
            height: 52px;
            border-radius: 12px;
            background: #ebf0f7;
            box-shadow: 4px 4px 10px #c8d2e0, -4px -4px 10px #ffffff;
            border: none;
            cursor: pointer;
            font-size: {d === '⌫' ? '1.1rem' : '1.2rem'};
            font-weight: 700;
            color: #334155;
            font-family: 'Poppins', sans-serif;
            transition: box-shadow 0.1s, transform 0.1s;
          "
        >
          {d}
        </button>
      {/if}
    {/each}
  </div>

  {#if onCancel}
    <button
      onclick={onCancel}
      style="
        background: transparent;
        border: none;
        color: #64748b;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        margin-top: -8px;
      "
    >
      Batal
    </button>
  {/if}
</div>

<style>
  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    20% {
      transform: translateX(-8px);
    }
    40% {
      transform: translateX(8px);
    }
    60% {
      transform: translateX(-6px);
    }
    80% {
      transform: translateX(6px);
    }
  }
</style>
