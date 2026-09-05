<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { activateBooth, loginUser, isTokenValid } from '$lib/api/boothClient';
  import { prefetchBoothAssets } from '$lib/api/prefetch';
  import { getActivation, saveActivation } from '$lib/db/local';
  import { Eye, EyeOff, Camera, Settings, ArrowRight } from '@lucide/svelte';
  import { setWindowDecorations } from '$lib/utils/windowControl';

  let step = $state<'welcome' | 'login' | 'activation' | 'destination'>('welcome');
  let email = $state('');
  let password = $state('');
  let showPassword = $state(false);
  let code = $state('');
  let error = $state('');
  let loading = $state(false);
  let isActivated = $state(false);

  const BG = '#ebf0f7';
  const NAVY = '#2a2873';

  const neu = {
    raised: '24px 24px 48px #c0cad8, -24px -24px 48px #ffffff',
    raisedSm: '8px 8px 18px #c8d2e0, -8px -8px 18px #ffffff',
    inset: 'inset 4px 4px 10px rgba(163,177,198,0.7), inset -4px -4px 10px rgba(255,255,255,0.9)',
    insetPill: 'inset 4px 4px 8px #c8d2e0, inset -4px -4px 8px #ffffff'
  };

  onMount(async () => {
    void setWindowDecorations(true);
    const activation = await getActivation();
    isActivated = Boolean(activation && activation.boothId);

    const urlParams = new URLSearchParams(window.location.search);
    const stepParam = urlParams.get('step');

    if (stepParam === 'destination') {
      const tokenValid = await isTokenValid(activation?.token);
      if (tokenValid && isActivated) {
        step = 'destination';
      } else {
        step = isActivated ? 'login' : 'welcome';
      }
    }
  });

  async function handleLogin() {
    if (!email.trim() || !password) {
      error = 'Email dan password wajib diisi.';
      return;
    }
    loading = true;
    error = '';
    try {
      const data = await loginUser(email.trim(), password);
      const activation = await getActivation();
      if (activation && activation.boothId) {
        // App already activated -> move to destination choice step
        if (data.token) {
          await saveActivation({
            ...activation,
            token: data.token
          });
        }
        step = 'destination';
      } else {
        // Newly installed / not activated app -> proceed to activation code step
        step = 'activation';
      }
    } catch (e) {
      console.error(e);
      error = e instanceof Error ? e.message : 'Login gagal.';
    } finally {
      loading = false;
    }
  }

  async function handleActivate() {
    if (!code.trim()) {
      error = 'Masukkan kode aktivasi.';
      return;
    }
    loading = true;
    error = '';
    try {
      const data = await activateBooth(code.trim());
      // Prefetch aset booth (background download) — tidak memblokir navigasi
      void prefetchBoothAssets(data.booth_id ?? code.trim()).catch((e) =>
        console.warn('Prefetch aset booth gagal:', e)
      );
      step = 'destination';
    } catch (e) {
      console.error(e);
      error = e instanceof Error ? e.message : 'Aktivasi gagal.';
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !loading) {
      if (step === 'login') {
        handleLogin();
      } else if (step === 'activation') {
        handleActivate();
      }
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
        onclick={() => {
          step = 'login';
          error = '';
        }}
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
        <ArrowRight size={18} />
      </button>

      <p style="margin: 0; font-size: 0.65rem; font-weight: 600; color: #a8b4c4; letter-spacing: 0.16em; text-transform: uppercase; text-align: center;">
        Sentuh Layar atau Tekan Tombol untuk Memulai
      </p>

    {:else if step === 'login'}
      <!-- Login step -->
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
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
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
        Login Petugas
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
          Verifikasi Akun · Email & Password
        </p>
      </div>

      <div style="width: 100%; display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
        <input
          type="email"
          bind:value={email}
          placeholder="Email"
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
            box-sizing: border-box;
          "
        />

        <div style="position: relative; width: 100%;">
          <input
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            placeholder="Password"
            disabled={loading}
            style="
              width: 100%;
              background: {BG};
              box-shadow: {neu.inset};
              border-radius: 16px;
              padding: 16px 50px 16px 20px;
              border: none;
              outline: none;
              font-size: 1rem;
              font-weight: 600;
              color: #2a2873;
              font-family: 'Poppins', sans-serif;
              box-sizing: border-box;
            "
          />
          <button
            type="button"
            onclick={() => (showPassword = !showPassword)}
            tabindex="-1"
            title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
            style="
              position: absolute;
              right: 14px;
              top: 50%;
              transform: translateY(-50%);
              background: none;
              border: none;
              cursor: pointer;
              color: #7c8faa;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 6px;
              border-radius: 8px;
            "
          >
            {#if showPassword}
              <EyeOff size={20} />
            {:else}
              <Eye size={20} />
            {/if}
          </button>
        </div>

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
          onclick={handleLogin}
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
          {loading ? 'Memproses...' : 'Login'}
        </button>
      </div>

    {:else if step === 'activation'}
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
            step = 'login';
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

    {:else if step === 'destination'}
      <!-- Destination / Navigation Choice step -->
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
          <ArrowRight size={26} color="white" />
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
        Pilih Navigasi
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
          Verifikasi Sukses · Pilih Halaman Tujuan
        </p>
      </div>

      <div style="width: 100%; display: flex; flex-direction: column; gap: 16px;">
        <!-- Option 1: Sesi Foto (Customer Journey) -->
        <button
          type="button"
          onclick={() => goto('/?journey=1')}
          style="
            width: 100%;
            display: flex;
            align-items: center;
            gap: 20px;
            padding: 20px 24px;
            border-radius: 24px;
            background: {BG};
            box-shadow: {neu.raisedSm};
            border: none;
            cursor: pointer;
            text-align: left;
            box-sizing: border-box;
            transition: transform 0.15s, box-shadow 0.15s;
          "
        >
          <div
            style="
              width: 52px;
              height: 52px;
              border-radius: 16px;
              background: linear-gradient(135deg, #3d3aa0, {NAVY});
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              box-shadow: 4px 4px 10px rgba(42,40,115,0.3);
            "
          >
            <Camera size={26} color="white" />
          </div>
          <div style="flex: 1;">
            <h3 style="margin: 0 0 4px; font-size: 1.05rem; font-weight: 800; color: {NAVY}; font-family: 'Poppins', sans-serif;">
              Sesi Foto (Customer Journey)
            </h3>
            <p style="margin: 0; font-size: 0.8rem; font-weight: 600; color: #64748b;">
              Masuk ke layar utama booth untuk pelanggan
            </p>
          </div>
          <ArrowRight size={22} color="#7c8faa" />
        </button>

        <!-- Option 2: Pengaturan Aplikasi -->
        <button
          type="button"
          onclick={() => goto('/settings')}
          style="
            width: 100%;
            display: flex;
            align-items: center;
            gap: 20px;
            padding: 20px 24px;
            border-radius: 24px;
            background: {BG};
            box-shadow: {neu.raisedSm};
            border: none;
            cursor: pointer;
            text-align: left;
            box-sizing: border-box;
            transition: transform 0.15s, box-shadow 0.15s;
          "
        >
          <div
            style="
              width: 52px;
              height: 52px;
              border-radius: 16px;
              background: linear-gradient(135deg, #475569, #1e293b);
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              box-shadow: 4px 4px 10px rgba(30,41,59,0.3);
            "
          >
            <Settings size={26} color="white" />
          </div>
          <div style="flex: 1;">
            <h3 style="margin: 0 0 4px; font-size: 1.05rem; font-weight: 800; color: #1e293b; font-family: 'Poppins', sans-serif;">
              Pengaturan Aplikasi
            </h3>
            <p style="margin: 0; font-size: 0.8rem; font-weight: 600; color: #64748b;">
              Konfigurasi booth, kamera, printer, & sistem
            </p>
          </div>
          <ArrowRight size={22} color="#7c8faa" />
        </button>
      </div>
    {/if}
  </div>
</div>
