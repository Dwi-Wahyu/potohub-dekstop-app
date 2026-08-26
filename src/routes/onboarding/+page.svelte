<script lang="ts">
  import { goto } from '$app/navigation';
  import { activateBooth } from '$lib/api/boothClient';

  let step = $state<'welcome' | 'activation'>('welcome');
  let code = $state('');
  let error = $state('');
  let loading = $state(false);

  const BG = '#ebf0f7';
  const NAVY = '#2a2873';

  const neu = {
    raised: '24px 24px 48px #c0cad8, -24px -24px 48px #ffffff',
    raisedSm: '8px 8px 18px #c8d2e0, -8px -8px 18px #ffffff',
    inset: 'inset 4px 4px 10px rgba(163,177,198,0.7), inset -4px -4px 10px rgba(255,255,255,0.9)',
    insetPill: 'inset 4px 4px 8px #c8d2e0, inset -4px -4px 8px #ffffff'
  };

  async function handleActivate() {
    if (!code.trim()) {
      error = 'Masukkan kode aktivasi.';
      return;
    }
    loading = true;
    error = '';
    try {
      await activateBooth(code.trim());
      await goto('/settings?firstRun=1');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Aktivasi gagal.';
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && step === 'activation' && !loading) {
      handleActivate();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  style="
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: {BG};
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Poppins', sans-serif;
    position: relative;
  "
>
  <!-- Decorative neumorphic circles background -->
  {#each [
    { size: 340, top: '-80px', left: '-80px', opacity: 1 },
    { size: 220, top: '-40px', right: '-60px', opacity: 1 },
    { size: 280, bottom: '-90px', left: '35%', opacity: 1 },
    { size: 180, bottom: '-50px', right: '-40px', opacity: 1 },
    { size: 120, top: '42%', left: '40px', opacity: 0.7 },
    { size: 90, top: '25%', right: '80px', opacity: 0.6 }
  ] as c}
    <div
      style="
        position: absolute;
        width: {c.size}px;
        height: {c.size}px;
        border-radius: 50%;
        background: {BG};
        box-shadow: {c.size / 14}px {c.size / 14}px {c.size / 5}px #c8d2e0, -{c.size / 14}px -{c.size / 14}px {c.size / 5}px #ffffff;
        opacity: {c.opacity};
        top: {c.top ?? 'auto'};
        left: {c.left ?? 'auto'};
        right: {c.right ?? 'auto'};
        bottom: {c.bottom ?? 'auto'};
        pointer-events: none;
      "
    ></div>
  {/each}

  <!-- Center card panel -->
  <div
    style="
      position: relative;
      z-index: 5;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 64px;
      border-radius: 40px;
      background: {BG};
      box-shadow: {neu.raised};
      max-width: 680px;
      width: 90%;
    "
  >
    {#if step === 'welcome'}
      <!-- Icon badge -->
      <div
        style="
          width: 80px;
          height: 80px;
          border-radius: 24px;
          background: {BG};
          box-shadow: {neu.raisedSm};
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 28px;
        "
      >
        <div
          style="
            width: 56px;
            height: 56px;
            border-radius: 16px;
            background: linear-gradient(135deg, #3d3aa0, {NAVY});
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 4px 4px 10px rgba(42,40,115,0.35);
          "
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </div>
      </div>

      <!-- Brand title -->
      <h1
        style="
          margin: 0 0 10px;
          font-size: clamp(48px, 8vw, 84px);
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1;
          color: {NAVY};
          text-shadow: 3px 3px 6px #c0cad8, -2px -2px 5px rgba(255,255,255,0.95), 0 0 40px rgba(42,40,115,0.08);
          user-select: none;
        "
      >
        Potohub
      </h1>

      <!-- Tagline pill -->
      <div
        style="
          padding: 6px 20px;
          border-radius: 999px;
          margin-bottom: 36px;
          background: {BG};
          box-shadow: {neu.insetPill};
        "
      >
        <p style="margin: 0; font-size: 0.78rem; font-weight: 600; color: #7c8faa; letter-spacing: 0.12em; text-transform: uppercase;">
          Abadikan Momenmu · Booth Client
        </p>
      </div>

      <!-- Divider -->
      <div style="width: 100%; height: 1px; background: linear-gradient(90deg,transparent,#d0d8e4,transparent); margin-bottom: 32px;"></div>

      <!-- MULAI button -->
      <button
        type="button"
        onclick={() => (step = 'activation')}
        style="
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 18px 56px;
          border-radius: 999px;
          background: linear-gradient(135deg, #3d3aa0, {NAVY});
          border: none;
          cursor: pointer;
          color: #fff;
          font-family: 'Poppins', sans-serif;
          font-size: 1rem;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          box-shadow: 8px 8px 20px #c0cad8, -4px -4px 10px #ffffff, 0 4px 20px rgba(42,40,115,0.3);
          transition: transform 0.15s, box-shadow 0.15s;
          margin-bottom: 18px;
        "
      >
        Mulai
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>

      <p style="margin: 0; font-size: 0.65rem; font-weight: 600; color: #a8b4c4; letter-spacing: 0.16em; text-transform: uppercase; text-align: center;">
        Sentuh Layar atau Tekan Tombol untuk Memulai
      </p>

    {:else}
      <!-- Activation step -->
      <div
        style="
          width: 80px;
          height: 80px;
          border-radius: 24px;
          background: {BG};
          box-shadow: {neu.raisedSm};
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
        "
      >
        <div
          style="
            width: 56px;
            height: 56px;
            border-radius: 16px;
            background: linear-gradient(135deg, #3d3aa0, {NAVY});
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 4px 4px 10px rgba(42,40,115,0.35);
          "
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
      </div>

      <h2
        style="
          margin: 0 0 8px;
          font-size: 1.8rem;
          font-weight: 800;
          color: #334155;
          letter-spacing: -0.02em;
        "
      >
        Kode Aktivasi
      </h2>

      <div
        style="
          padding: 6px 20px;
          border-radius: 999px;
          margin-bottom: 28px;
          background: {BG};
          box-shadow: {neu.insetPill};
        "
      >
        <p style="margin: 0; font-size: 0.72rem; font-weight: 600; color: #7c8faa; letter-spacing: 0.12em; text-transform: uppercase;">
          Verifikasi Perangkat · Kode Aktivasi
        </p>
      </div>

      <div style="width: 100%; display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
        <input
          type="text"
          bind:value={code}
          placeholder="Masukkan Kode Aktivasi"
          disabled={loading}
          style="
            width: 100%;
            background: {BG};
            box-shadow: {neu.inset};
            border-radius: 16px;
            padding: 16px 20px;
            border: none;
            outline: none;
            font-size: 1rem;
            font-weight: 600;
            color: #2a2873;
            font-family: 'Poppins', sans-serif;
            text-align: center;
            letter-spacing: 0.05em;
            box-sizing: border-box;
          "
        />

        {#if error}
          <div
            style="
              background: #fef2f2;
              border: 1px solid #fecaca;
              color: #dc2626;
              padding: 10px 16px;
              border-radius: 12px;
              font-size: 0.85rem;
              font-weight: 600;
              text-align: center;
            "
          >
            {error}
          </div>
        {/if}
      </div>

      <div style="display: flex; gap: 14px; width: 100%;">
        <button
          type="button"
          onclick={() => {
            step = 'welcome';
            error = '';
          }}
          disabled={loading}
          style="
            flex: 1;
            padding: 14px 20px;
            border-radius: 16px;
            background: {BG};
            box-shadow: {neu.raisedSm};
            border: none;
            cursor: loading ? 'not-allowed' : 'pointer';
            font-family: 'Poppins', sans-serif;
            font-size: 0.9rem;
            font-weight: 700;
            color: #64748b;
          "
        >
          Kembali
        </button>

        <button
          type="button"
          onclick={handleActivate}
          disabled={loading}
          style="
            flex: 2;
            padding: 14px 20px;
            border-radius: 16px;
            background: linear-gradient(135deg, #3d3aa0, {NAVY});
            border: none;
            cursor: loading ? 'not-allowed' : 'pointer';
            color: #fff;
            font-family: 'Poppins', sans-serif;
            font-size: 0.95rem;
            font-weight: 800;
            letter-spacing: 0.05em;
            box-shadow: 4px 4px 14px rgba(42,40,115,0.3);
            opacity: {loading ? 0.7 : 1};
          "
        >
          {loading ? 'Memverifikasi...' : 'Aktivasi'}
        </button>
      </div>
    {/if}
  </div>
</div>
