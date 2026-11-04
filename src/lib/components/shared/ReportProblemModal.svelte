<script lang="ts">
  import { X, Check, Send, RefreshCw, CalendarDays, CloudOff } from '@lucide/svelte';
  import { sendProblemReport } from '$lib/utils/problemReports';
  import { updaterStore } from '$lib/utils/updater.svelte';

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  const BG = '#ebf0f7';
  const NAVY = '#2a2873';
  const sh = {
    card: '14px 14px 34px rgba(163,177,198,0.65), -14px -14px 34px rgba(255,255,255,0.95)',
    btn: '6px 6px 14px rgba(163,177,198,0.55), -5px -5px 12px rgba(255,255,255,0.85)',
    inset: 'inset 5px 5px 12px rgba(163,177,198,0.7), inset -5px -5px 12px rgba(255,255,255,0.9)'
  };
  const MAX_CHARS = 500;

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  let date = $state(todayISO());
  let detail = $state('');
  let sending = $state(false);
  // 'sent' = diterima server, 'queued' = disimpan di perangkat (endpoint belum ada / offline)
  let result = $state<'sent' | 'queued' | null>(null);
  let valid = $derived(detail.trim().length >= 10 && !!date);

  async function submit() {
    if (!valid || sending) return;
    sending = true;
    const ok = await sendProblemReport({
      incident_date: date,
      detail: detail.trim(),
      app_version: updaterStore.currentVersion || '',
      reported_at: new Date().toISOString()
    });
    sending = false;
    result = ok ? 'sent' : 'queued';
  }

  const labelStyle = 'font-size: 13px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.08em;';
  const btnStyle = (primary: boolean, disabled = false) => `
    flex: ${primary ? 1.5 : 1}; min-height: 68px; border-radius: 20px; border: none;
    cursor: ${disabled ? 'not-allowed' : 'pointer'}; font-family: 'Poppins', sans-serif; font-weight: 700; font-size: 18px;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    background: ${primary ? `linear-gradient(135deg, #3d3aa0, ${NAVY})` : BG};
    color: ${primary ? '#fff' : '#334155'};
    box-shadow: ${primary ? '0 8px 20px rgba(42,40,115,0.38)' : sh.btn};
    opacity: ${disabled ? 0.45 : 1}; touch-action: manipulation;`;
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onclick={onClose}
  style="position: fixed; inset: 0; z-index: 1000; background: rgba(30,28,80,0.5); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 24px; font-family: 'Poppins', sans-serif;"
  class="rp-fade"
>
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Laporkan Masalah"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    style="width: 100%; max-width: 560px; max-height: 100%; overflow-y: auto; background: {BG}; border-radius: 32px; box-shadow: {sh.card}; padding: 36px; position: relative;"
    class="rp-pop"
  >
    {#if result}
      <div style="display: flex; flex-direction: column; align-items: center; gap: 20px; text-align: center;">
        <div
          class="rp-check"
          style="width: 112px; height: 112px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
            background: {result === 'sent' ? 'linear-gradient(145deg,#34d27b,#16a34a)' : 'linear-gradient(145deg,#fbbf24,#d97706)'};
            box-shadow: {result === 'sent' ? '0 12px 26px rgba(22,163,74,0.4)' : '0 12px 26px rgba(217,119,6,0.4)'};"
        >
          {#if result === 'sent'}
            <Check size={64} color="#fff" strokeWidth={3.5} />
          {:else}
            <CloudOff size={56} color="#fff" strokeWidth={2.5} />
          {/if}
        </div>
        <div>
          {#if result === 'sent'}
            <h2 style="margin: 0; font-size: 26px; font-weight: 700; color: #1e293b;">Laporan Terkirim</h2>
            <p style="margin: 8px 0 0; font-size: 16px; color: #475569; line-height: 1.5;">Terima kasih. Tim teknis akan segera menindaklanjuti.</p>
          {:else}
            <h2 style="margin: 0; font-size: 26px; font-weight: 700; color: #1e293b;">Laporan Tersimpan</h2>
            <p style="margin: 8px 0 0; font-size: 16px; color: #475569; line-height: 1.5;">
              Laporan belum bisa dikirim ke server dan disimpan di perangkat ini. Laporan akan dikirim otomatis saat menu petugas dibuka lagi dan server sudah siap.
            </p>
          {/if}
        </div>
        <div style="width: 100%; display: flex;">
          <button class="rp-btn" style={btnStyle(true)} onclick={onClose}>Tutup</button>
        </div>
      </div>
    {:else}
      <button
        class="rp-btn"
        aria-label="Tutup"
        onclick={onClose}
        style="position: absolute; top: 20px; right: 20px; width: 52px; height: 52px; border-radius: 16px; border: none; background: {BG}; box-shadow: {sh.btn}; color: #475569; display: flex; align-items: center; justify-content: center; cursor: pointer;"
      >
        <X size={24} />
      </button>

      <div style="display: flex; flex-direction: column; gap: 22px;">
        <div style="padding-right: 64px;">
          <h2 style="margin: 0; font-size: 26px; font-weight: 700; color: #1e293b;">Laporkan Masalah</h2>
          <p style="margin: 4px 0 0; font-size: 15px; color: #475569;">Ceritakan kendala yang terjadi pada mesin ini.</p>
        </div>

        <label style="display: flex; flex-direction: column; gap: 10px;">
          <span style={labelStyle}>Tanggal Kejadian</span>
          <div style="position: relative;">
            <CalendarDays size={24} color={NAVY} style="position: absolute; left: 20px; top: 50%; transform: translateY(-50%); pointer-events: none;" />
            <input
              type="date"
              bind:value={date}
              max={todayISO()}
              style="width: 100%; height: 68px; box-sizing: border-box; background: {BG}; box-shadow: {sh.inset}; border: none; outline: none; border-radius: 20px; padding: 0 20px 0 58px; font-family: 'Poppins', sans-serif; font-size: 18px; font-weight: 600; color: #334155;"
            />
          </div>
        </label>

        <label style="display: flex; flex-direction: column; gap: 10px;">
          <span style={labelStyle}>Detail Masalah</span>
          <textarea
            bind:value={detail}
            maxlength={MAX_CHARS}
            placeholder="Contoh: Printer berhenti mencetak setelah foto ke-3, lampu indikator berkedip merah."
            style="width: 100%; height: 190px; box-sizing: border-box; resize: none; background: {BG}; box-shadow: {sh.inset}; border: none; outline: none; border-radius: 20px; padding: 18px 20px; font-family: 'Poppins', sans-serif; font-size: 17px; line-height: 1.5; color: #334155;"
          ></textarea>
          <span style="align-self: flex-end; font-size: 13px; font-variant-numeric: tabular-nums; color: {detail.length >= MAX_CHARS ? '#ef4444' : '#5b6b82'};">
            {detail.length}/{MAX_CHARS}{detail.trim().length < 10 ? ' · minimal 10 karakter' : ''}
          </span>
        </label>

        <div style="display: flex; gap: 16px;">
          <button class="rp-btn" style={btnStyle(false)} onclick={onClose}>Batal</button>
          <button class="rp-btn" style={btnStyle(true, !valid || sending)} disabled={!valid || sending} onclick={submit}>
            {#if sending}
              <RefreshCw size={22} class="animate-spin" />
              Mengirim…
            {:else}
              <Send size={22} />
              Kirim Laporan
            {/if}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .rp-fade {
    animation: rp-fade 0.2s ease;
  }
  .rp-pop {
    animation: rp-pop 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.1);
  }
  .rp-check {
    animation: rp-check 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  .rp-btn {
    transition: transform 0.12s, box-shadow 0.15s, opacity 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .rp-btn:active:not(:disabled) {
    transform: scale(0.97);
  }
  @keyframes rp-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes rp-pop {
    0% { opacity: 0; transform: translateY(24px) scale(0.96); }
    100% { opacity: 1; transform: none; }
  }
  @keyframes rp-check {
    0% { transform: scale(0) rotate(-20deg); }
    60% { transform: scale(1.15) rotate(4deg); }
    100% { transform: scale(1) rotate(0); }
  }
</style>
