import { flushOutbox } from '$lib/utils/offlineOutbox';

const envs = import.meta.env as Record<string, string>;
const rawBase =
  envs.VITE_API_BASE_URL || envs.PUBLIC_API_BASE_URL || 'http://localhost:8080/api';
const API_BASE = rawBase.replace(/\/+$/, '');
const HEALTH_URL = `${API_BASE}/health`;
const PING_TIMEOUT_MS = 4000;

class NetworkStatusStore {
  // 'online' hanya true SETELAH ping health-check sukses, bukan cuma navigator.onLine.
  isOnline = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);
  isVerifying = $state(false);
  lastCheckedAt = $state<number | null>(null);

  private listenersBound = false;

  init() {
    if (typeof window === 'undefined' || this.listenersBound) return;
    this.listenersBound = true;

    // 1) Sakelar utama: sinyal dari OS/WebView.
    window.addEventListener('online', () => this.handleOsOnline());
    window.addEventListener('offline', () => this.handleOsOffline());

    // Cek awal saat app dibuka.
    if (navigator.onLine) {
      void this.verifyAndMaybeFlush();
    } else {
      this.isOnline = false;
    }
  }

  private handleOsOffline() {
    this.isOnline = false;
  }

  private async handleOsOnline() {
    // JANGAN langsung anggap online — verifikasi dulu ke server sendiri (bukan Google).
    await this.verifyAndMaybeFlush();
  }

  /** Ping ringan ke server sendiri. True hanya jika server benar-benar merespons. */
  async pingServer(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
      const res = await fetch(HEALTH_URL, { method: 'GET', signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Dipanggil saat OS bilang online, atau bisa dipanggil manual (mis. tombol retry). */
  async verifyAndMaybeFlush() {
    if (this.isVerifying) return;
    this.isVerifying = true;
    try {
      const ok = await this.pingServer();
      this.lastCheckedAt = Date.now();
      this.isOnline = ok;
      if (ok) {
        // 2) Baru setelah ping sukses, kosongkan antrean SQLite.
        await flushOutbox();
      }
    } finally {
      this.isVerifying = false;
    }
  }

  /** Dipanggil oleh outbox worker: jika di tengah proses flush terjadi timeout,
   *  turunkan status jadi offline dan hentikan proses (persis requirement #4 user). */
  markOfflineDueToFailure() {
    this.isOnline = false;
  }
}

export const networkStatus = new NetworkStatusStore();
