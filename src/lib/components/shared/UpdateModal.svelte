<script lang="ts">
  import { Sparkles, Download, RefreshCw, ShieldAlert, Check, X } from '@lucide/svelte';
  import { updaterStore } from '$lib/utils/updater.svelte';

  const BG = '#ebf0f7';
  const NAVY = '#2a2873';
  const FONT = "'Poppins', sans-serif";
  const sh = {
    card: '14px 14px 34px rgba(163,177,198,0.65), -14px -14px 34px rgba(255,255,255,0.95)',
    btn: '6px 6px 14px rgba(163,177,198,0.55), -5px -5px 12px rgba(255,255,255,0.85)',
    inset: 'inset 5px 5px 12px rgba(163,177,198,0.7), inset -5px -5px 12px rgba(255,255,255,0.9)',
  };

  function handleClose() {
    updaterStore.closeModal();
  }

  function handleStartUpdate() {
    updaterStore.startUpdate();
  }
</script>

{#if updaterStore.modalOpen}
  <div
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => {
      if (e.target === e.currentTarget && updaterStore.phase !== 'loading') {
        handleClose();
      }
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape' && updaterStore.phase !== 'loading') {
        handleClose();
      }
    }}
    style="
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(30, 28, 80, 0.5);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      animation: mm-fade 0.2s ease;
      font-family: {FONT};
    "
  >
    <div
      role="document"
      style="
        width: 100%;
        max-width: 580px;
        max-height: 90vh;
        overflow-y: auto;
        background: {BG};
        border-radius: 32px;
        box-shadow: {sh.card};
        padding: 36px;
        animation: mm-pop 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.1);
        position: relative;
      "
    >
      <!-- Close button (hidden while downloading/installing) -->
      {#if updaterStore.phase !== 'loading'}
        <button
          type="button"
          aria-label="Tutup"
          onclick={handleClose}
          class="mm-btn"
          style="
            position: absolute;
            top: 20px;
            right: 20px;
            width: 52px;
            height: 52px;
            border-radius: 16px;
            border: none;
            background: {BG};
            box-shadow: {sh.btn};
            color: #64748b;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          "
        >
          <X size={24} />
        </button>
      {/if}

      <!-- Phase: Available -->
      {#if updaterStore.phase === 'available'}
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <div style="display: flex; align-items: center; gap: 18px; padding-right: 64px;">
            <div
              style="
                width: 72px;
                height: 72px;
                border-radius: 22px;
                background: {BG};
                box-shadow: {sh.btn};
                display: flex;
                align-items: center;
                justify-content: center;
                color: {NAVY};
                flex-shrink: 0;
              "
            >
              <Sparkles size={34} />
            </div>
            <div>
              <h2 style="margin: 0; font-size: 26px; font-weight: 700; color: #1e293b; line-height: 1.2;">
                Pembaruan Tersedia
              </h2>
              <p style="margin: 4px 0 0; font-size: 15px; color: #64748b;">
                Versi saat ini v{updaterStore.currentVersion}
              </p>
            </div>
          </div>

          <div
            style="
              align-self: flex-start;
              padding: 10px 22px;
              border-radius: 999px;
              background: linear-gradient(135deg, #3d3aa0, {NAVY});
              color: #fff;
              font-weight: 700;
              font-size: 18px;
              letter-spacing: 0.03em;
              box-shadow: 0 6px 16px rgba(42, 40, 115, 0.35);
            "
          >
            v{updaterStore.latestVersion} · Terbaru
          </div>

          {#if updaterStore.versionName}
            <p style="margin: -8px 0 0; font-size: 14px; font-weight: 600; color: #475569;">
              {updaterStore.versionName}
            </p>
          {/if}

          <div
            class="custom-scrollbar"
            style="
              background: {BG};
              box-shadow: {sh.inset};
              border-radius: 22px;
              padding: 22px 24px;
              max-height: 250px;
              overflow-y: auto;
            "
          >
            <p
              style="
                margin: 0 0 14px;
                font-size: 12px;
                font-weight: 700;
                color: #94a3b8;
                text-transform: uppercase;
                letter-spacing: 0.1em;
              "
            >
              Yang baru
            </p>
            <ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 14px;">
              {#each updaterStore.changelog as item}
                <li style="display: flex; gap: 12px; align-items: flex-start; font-size: 15px; line-height: 1.45; color: #334155; font-weight: 500;">
                  <span
                    style="
                      width: 10px;
                      height: 10px;
                      border-radius: 50%;
                      background: {NAVY};
                      margin-top: 6px;
                      flex-shrink: 0;
                    "
                  ></span>
                  <span>{item}</span>
                </li>
              {/each}
            </ul>
          </div>

          <div style="display: flex; gap: 16px; margin-top: 4px;">
            <button
              type="button"
              onclick={handleClose}
              class="mm-btn"
              style="
                flex: 1;
                min-height: 64px;
                border-radius: 20px;
                border: none;
                cursor: pointer;
                font-family: {FONT};
                font-weight: 700;
                font-size: 17px;
                background: {BG};
                color: #334155;
                box-shadow: {sh.btn};
              "
            >
              Nanti
            </button>
            <button
              type="button"
              onclick={handleStartUpdate}
              class="mm-btn"
              style="
                flex: 1.6;
                min-height: 64px;
                border-radius: 20px;
                border: none;
                cursor: pointer;
                font-family: {FONT};
                font-weight: 700;
                font-size: 17px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                background: linear-gradient(135deg, #3d3aa0, {NAVY});
                color: #fff;
                box-shadow: 0 8px 20px rgba(42, 40, 115, 0.38);
              "
            >
              <Download size={22} />
              <span>Update Sekarang</span>
            </button>
          </div>
        </div>
      {/if}

      <!-- Phase: Loading (Downloading / Installing) -->
      {#if updaterStore.phase === 'loading'}
        <div style="display: flex; flex-direction: column; align-items: center; gap: 26px; text-align: center;">
          <div
            style="
              width: 104px;
              height: 104px;
              border-radius: 50%;
              background: {BG};
              box-shadow: {sh.btn};
              display: flex;
              align-items: center;
              justify-content: center;
            "
          >
            <RefreshCw size={46} color={NAVY} style="animation: mm-spin 1.2s linear infinite;" />
          </div>

          <div>
            <h2 style="margin: 0; font-size: 26px; font-weight: 700; color: #1e293b;">
              Memperbarui ke v{updaterStore.latestVersion}
            </h2>
            <p style="margin: 6px 0 0; font-size: 16px; color: #64748b;">
              {updaterStore.stage}
            </p>
          </div>

          <div style="width: 100%;">
            <div
              style="
                height: 28px;
                border-radius: 999px;
                background: {BG};
                box-shadow: {sh.inset};
                padding: 5px;
              "
            >
              <div
                style="
                  height: 100%;
                  width: {updaterStore.downloadProgress}%;
                  border-radius: 999px;
                  transition: width 0.15s linear;
                  background: repeating-linear-gradient(115deg, #3d3aa0 0 14px, {NAVY} 14px 28px);
                  background-size: 40px 100%;
                  animation: mm-stripe 1s linear infinite;
                  min-width: 18px;
                "
              ></div>
            </div>
            <p
              style="
                margin: 12px 0 0;
                font-size: 30px;
                font-weight: 700;
                color: {NAVY};
                font-variant-numeric: tabular-nums;
              "
            >
              {Math.floor(updaterStore.downloadProgress)}%
            </p>
          </div>

          <div
            role="alert"
            style="
              width: 100%;
              display: flex;
              gap: 14px;
              align-items: center;
              padding: 18px 22px;
              border-radius: 20px;
              background: #fff7e6;
              border: 2px solid #f5b94a;
              text-align: left;
            "
          >
            <ShieldAlert size={32} color="#b45309" style="flex-shrink: 0;" />
            <p style="margin: 0; font-size: 16px; font-weight: 800; color: #7c2d12; line-height: 1.35;">
              Proses update sedang berjalan, jangan tutup aplikasi
            </p>
          </div>
        </div>
      {/if}

      <!-- Phase: Up to date / Completed -->
      {#if updaterStore.phase === 'uptodate'}
        <div style="display: flex; flex-direction: column; align-items: center; gap: 22px; text-align: center; padding-top: 8px;">
          <div style="position: relative; width: 148px; height: 148px;">
            <span
              style="
                position: absolute;
                inset: 0;
                border-radius: 50%;
                background: rgba(34, 197, 94, 0.35);
                animation: mm-ring 1.4s ease-out 2;
              "
            ></span>
            <div
              style="
                position: relative;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                background: linear-gradient(145deg, #34d27b, #16a34a);
                box-shadow: 0 14px 30px rgba(22, 163, 74, 0.4), inset 0 -6px 12px rgba(0, 0, 0, 0.12);
                display: flex;
                align-items: center;
                justify-content: center;
                animation: mm-check 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.2);
              "
            >
              <Check size={84} color="#fff" strokeWidth={3.5} />
            </div>
          </div>

          <div>
            <h2 style="margin: 0; font-size: 26px; font-weight: 700; color: #1e293b;">
              Versi aplikasi sudah yang terbaru
            </h2>
            <p style="margin: 8px 0 0; font-size: 16px; color: #64748b;">
              Versi terpasang: <b style="color: {NAVY};">v{updaterStore.currentVersion}</b>
            </p>
          </div>

          <div style="width: 100%; display: flex; margin-top: 8px;">
            <button
              type="button"
              onclick={handleClose}
              class="mm-btn"
              style="
                flex: 1;
                min-height: 64px;
                border-radius: 20px;
                border: none;
                cursor: pointer;
                font-family: {FONT};
                font-weight: 700;
                font-size: 18px;
                background: linear-gradient(135deg, #3d3aa0, {NAVY});
                color: #fff;
                box-shadow: 0 8px 20px rgba(42, 40, 115, 0.38);
              "
            >
              Selesai
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  @keyframes mm-pop {
    0% {
      opacity: 0;
      transform: translateY(24px) scale(0.96);
    }
    100% {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes mm-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes mm-check {
    0% {
      transform: scale(0) rotate(-20deg);
    }
    60% {
      transform: scale(1.15) rotate(4deg);
    }
    100% {
      transform: scale(1) rotate(0);
    }
  }

  @keyframes mm-ring {
    0% {
      transform: scale(0.7);
      opacity: 0.7;
    }
    100% {
      transform: scale(1.5);
      opacity: 0;
    }
  }

  @keyframes mm-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes mm-stripe {
    from {
      background-position: 0 0;
    }
    to {
      background-position: 40px 0;
    }
  }

  .mm-btn {
    transition:
      transform 0.12s,
      box-shadow 0.15s,
      opacity 0.15s;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .mm-btn:active:not(:disabled) {
    transform: scale(0.97);
  }
</style>
