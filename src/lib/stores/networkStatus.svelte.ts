import { flushOutbox } from '$lib/utils/offlineOutbox';
import { getActivation, getOrCreateDeviceId, countPendingOutboxJobs } from '$lib/db/local';
import { printerStore } from '$lib/printer.svelte';
import { cameraStore } from '$lib/camera.svelte';

const envs = import.meta.env as Record<string, string>;
const rawBase =
  envs.VITE_API_BASE_URL || envs.PUBLIC_API_BASE_URL || 'http://localhost:8080/api';
const API_BASE = rawBase.replace(/\/+$/, '');
const HEALTH_URL = `${API_BASE}/health`;

const PING_TIMEOUT_MS = 3500;
const HEARTBEAT_ONLINE_BASE_MS = 60000; // 60 detik saat online
const HEARTBEAT_JITTER_RANGE_MS = 10000; // ±10 detik jitter
const HEARTBEAT_OFFLINE_MS = 5000;     // 5 detik saat offline
const OS_OFFLINE_DEBOUNCE_MS = 3000;

class NetworkStatusStore {
  isOnline = $state(true); // Default optimis untuk mencegah freeze UI pada awal start
  isVerifying = $state(false);
  lastCheckedAt = $state<number | null>(null);
  offlineSince = $state<number | null>(null);

  private listenersBound = false;
  private heartbeatTimer: any = null;
  private offlineDebounceTimer: any = null;
  private consecutiveFailures = 0;

  init() {
    if (typeof window === 'undefined' || this.listenersBound) return;
    this.listenersBound = true;

    // 1) Sinyal dari OS / Browser
    window.addEventListener('online', () => this.handleOsOnline());
    window.addEventListener('offline', () => this.handleOsOffline());

    // 2) Jalankan verifikasi & heartbeat awal saat startup
    void this.verifyAndMaybeFlush();

    // 3) Mulai heartbeat loop adaptif
    this.startHeartbeatLoop();
  }

  private handleOsOnline() {
    console.log('[NetworkStatus] OS memicu event online. Memverifikasi & mengirim heartbeat...');
    if (this.offlineDebounceTimer) {
      clearTimeout(this.offlineDebounceTimer);
      this.offlineDebounceTimer = null;
    }
    void this.verifyAndMaybeFlush();
  }

  private handleOsOffline() {
    console.log('[NetworkStatus] OS memicu event offline. Menunggu verifikasi...');
    if (this.offlineDebounceTimer) clearTimeout(this.offlineDebounceTimer);
    this.offlineDebounceTimer = setTimeout(async () => {
      const actuallyOnline = await this.pingServer();
      if (!actuallyOnline) {
        console.warn('[NetworkStatus] Terkonfirmasi offline setelah verifikasi.');
        this.markOffline();
      } else {
        console.log('[NetworkStatus] Event offline diabaikan: Server tetap dapat dijangkau.');
      }
    }, OS_OFFLINE_DEBOUNCE_MS);
  }

  /**
   * Mengirim heartbeat terautentikasi ke endpoint /api/booths/{boothId}/heartbeat
   * menyertakan telemetry hardware (kamera, printer, outbox queue).
   */
  async sendHeartbeat(mode: 'normal' | 'local_mode_recovery' = 'normal'): Promise<boolean> {
    const activation = await getActivation().catch(() => null);
    if (!activation || !activation.boothId) {
      // Fallback ke ping anonim jika booth belum diaktivasi
      return this.pingServer();
    }

    const identity = await getOrCreateDeviceId().catch(() => ({
      deviceId: 'unknown-device',
      deviceName: 'Kiosk-Client',
      createdAt: Date.now(),
    }));

    const pendingOutbox = await countPendingOutboxJobs().catch(() => 0);

    const offlineDuration = this.offlineSince
      ? Math.floor((Date.now() - this.offlineSince) / 1000)
      : null;

    const cameraStatus = cameraStore.status === 'connected' ? 'CONNECTED' : 'DISCONNECTED';
    const printerStatus = printerStore.status?.has_error
      ? 'ERROR'
      : printerStore.status?.is_online
        ? 'READY'
        : 'OFFLINE';

    const payload = {
      device_id: identity.deviceId,
      app_version: '0.1.0',
      mode: mode,
      camera_status: cameraStatus,
      printer_status: printerStatus,
      remaining_paper: printerStore.status?.paper_remaining ?? null,
      pending_outbox_count: pendingOutbox,
      offline_duration_seconds: offlineDuration,
    };

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
      const res = await fetch(`${API_BASE}/booths/${activation.boothId}/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activation.token ? { Authorization: `Bearer ${activation.token}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Ping ringan anonim ke /health (dipakai saat booth belum teraktivasi)
   */
  async pingServer(): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
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
  }

  /**
   * Verifikasi status jaringan, kirim konfirmasi recovery jika sebelumnya offline, dan kuras outbox.
   */
  async verifyAndMaybeFlush() {
    if (this.isVerifying) return;
    this.isVerifying = true;
    try {
      const wasOffline = !this.isOnline || this.offlineSince !== null;
      const mode = wasOffline ? 'local_mode_recovery' : 'normal';
      const ok = await this.sendHeartbeat(mode);
      this.lastCheckedAt = Date.now();

      if (ok) {
        this.consecutiveFailures = 0;
        if (wasOffline) {
          console.log('[NetworkStatus] Koneksi pulih! Mengonfirmasi recovery ke server & menguras outbox...');
        }
        this.isOnline = true;
        this.offlineSince = null;
        await flushOutbox();
      } else {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= 2) {
          this.markOffline();
        }
      }
    } finally {
      this.isVerifying = false;
      this.resetHeartbeatLoop();
    }
  }

  markOfflineDueToFailure() {
    this.markOffline();
  }

  private markOffline() {
    if (this.isOnline || this.offlineSince === null) {
      console.warn('[NetworkStatus] Terkonfirmasi offline. Menandai offline mode lokal.');
      this.isOnline = false;
      if (!this.offlineSince) this.offlineSince = Date.now();
      this.resetHeartbeatLoop();
    }
  }

  private startHeartbeatLoop() {
    this.stopHeartbeatLoop();
    // Beri jitter acak (±10s) saat online agar kiosk tidak mengirim heartbeat serentak
    const jitter = (Math.random() * 2 - 1) * HEARTBEAT_JITTER_RANGE_MS;
    const intervalMs = this.isOnline
      ? Math.max(15000, HEARTBEAT_ONLINE_BASE_MS + jitter)
      : HEARTBEAT_OFFLINE_MS;

    this.heartbeatTimer = setTimeout(() => {
      void this.verifyAndMaybeFlush();
    }, intervalMs);
  }

  private stopHeartbeatLoop() {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private resetHeartbeatLoop() {
    this.startHeartbeatLoop();
  }
}

export const networkStatus = new NetworkStatusStore();
