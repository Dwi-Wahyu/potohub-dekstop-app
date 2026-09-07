import { flushOutbox } from '$lib/utils/offlineOutbox';

const envs = import.meta.env as Record<string, string>;
const rawBase =
  envs.VITE_API_BASE_URL || envs.PUBLIC_API_BASE_URL || 'http://localhost:8080/api';
const API_BASE = rawBase.replace(/\/+$/, '');
const HEALTH_URL = `${API_BASE}/health`;

const PING_TIMEOUT_MS = 3500;
const HEARTBEAT_OFFLINE_MS = 5000;  // saat offline, cek tiap 5 detik
const HEARTBEAT_ONLINE_MS = 30000;  // saat online, cek tiap 30 detik
const OS_OFFLINE_DEBOUNCE_MS = 3000;

class NetworkStatusStore {
  isOnline = $state(true); // Default optimis untuk mencegah freeze UI pada awal start
  isVerifying = $state(false);
  lastCheckedAt = $state<number | null>(null);

  private listenersBound = false;
  private heartbeatTimer: any = null;
  private offlineDebounceTimer: any = null;

  init() {
    if (typeof window === 'undefined' || this.listenersBound) return;
    this.listenersBound = true;

    // 1) Sinyal dari OS / Browser
    window.addEventListener('online', () => this.handleOsOnline());
    window.addEventListener('offline', () => this.handleOsOffline());

    // 2) Jalankan verifikasi awal saat startup tanpa memblokir
    void this.verifyAndMaybeFlush();

    // 3) Mulai heartbeat loop adaptif
    this.startHeartbeat();
  }

  private handleOsOnline() {
    console.log('[NetworkStatus] OS memicu event online. Memverifikasi server...');
    if (this.offlineDebounceTimer) {
      clearTimeout(this.offlineDebounceTimer);
      this.offlineDebounceTimer = null;
    }
    void this.verifyAndMaybeFlush();
  }

  private handleOsOffline() {
    console.log('[NetworkStatus] OS memicu event offline. Menunggu verifikasi...');
    // JANGAN LANGSUNG SET FALSE! Beri jeda 3 detik lalu verifikasi via ping
    if (this.offlineDebounceTimer) clearTimeout(this.offlineDebounceTimer);
    this.offlineDebounceTimer = setTimeout(async () => {
      const actuallyOnline = await this.pingServer();
      if (!actuallyOnline) {
        console.warn('[NetworkStatus] Terkonfirmasi offline setelah verifikasi.');
        this.isOnline = false;
        this.resetHeartbeat();
      } else {
        console.log('[NetworkStatus] Event offline diabaikan: Server tetap dapat dijangkau.');
      }
    }, OS_OFFLINE_DEBOUNCE_MS);
  }

  /**
   * Ping ringan ke server backend dengan 2x percobaan cepat.
   * Tidak bergantung pada navigator.onLine yang sering keliru di WebView.
   */
  async pingServer(): Promise<boolean> {
    const attempt = async (): Promise<boolean> => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
        // Tambahkan query parameter timestamp untuk mencegah cache WebView
        const res = await fetch(`${HEALTH_URL}?_t=${Date.now()}`, {
          method: 'GET',
          signal: ctrl.signal,
          cache: 'no-store',
        });
        clearTimeout(t);
        return res.ok;
      } catch {
        return false;
      }
    };

    // Percobaan 1
    const okFirst = await attempt();
    if (okFirst) return true;

    // Percobaan 2 (retry cepat jeda 300ms jika percobaan 1 gagal/jitter)
    await new Promise((r) => setTimeout(r, 300));
    return await attempt();
  }

  /**
   * Verifikasi status jaringan dan kuras antrean outbox jika online.
   */
  async verifyAndMaybeFlush() {
    if (this.isVerifying) return;
    this.isVerifying = true;
    try {
      const wasOffline = !this.isOnline;
      const ok = await this.pingServer();
      this.lastCheckedAt = Date.now();
      this.isOnline = ok;

      if (ok) {
        if (wasOffline) {
          console.log('[NetworkStatus] Koneksi pulih! Memproses antrean offline...');
        }
        // Kosongkan antrean SQLite setelah koneksi terkonfirmasi
        await flushOutbox();
      }
    } finally {
      this.isVerifying = false;
      this.resetHeartbeat();
    }
  }

  /**
   * Dipanggil oleh outbox worker HANYA saat terjadi kegagalan jaringan transport murni.
   */
  markOfflineDueToFailure() {
    if (this.isOnline) {
      console.warn('[NetworkStatus] Koneksi terputus saat transfer data. Menandai offline.');
      this.isOnline = false;
      this.resetHeartbeat();
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    const intervalMs = this.isOnline ? HEARTBEAT_ONLINE_MS : HEARTBEAT_OFFLINE_MS;
    this.heartbeatTimer = setInterval(() => {
      void this.verifyAndMaybeFlush();
    }, intervalMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private resetHeartbeat() {
    this.startHeartbeat();
  }
}

export const networkStatus = new NetworkStatusStore();
