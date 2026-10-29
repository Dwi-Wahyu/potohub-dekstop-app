import { boothFlow } from '$lib/stores/booth.svelte';
import { networkStatus } from '$lib/stores/networkStatus.svelte';
import { flushOutbox } from '$lib/utils/offlineOutbox';
import { flushPrintQueue } from '$lib/utils/printQueue';

/**
 * Memeriksa apakah aplikasi sedang dalam keadaan IDLE (siaga).
 * Aplikasi dianggap idle jika:
 * 1. Sedang berada di layar welcome / standby awal tanpa interaksi pelanggan aktif.
 * 2. Tidak ada proses pembuatan liveview/gif/video yang sedang berjalan.
 * 3. Berada di halaman pengaturan admin (/settings).
 */
export function isAppIdle(): boolean {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/settings')) {
    return true;
  }

  const isAtWelcome = boothFlow.step === 'welcome';
  const hasNoActiveSession = !boothFlow.sessionCode && boothFlow.photosTaken.length === 0;
  const notGenerating = !boothFlow.isGeneratingGif && !boothFlow.isGeneratingVideo;

  return isAtWelcome && hasNoActiveSession && notGenerating;
}

/**
 * Pengecekan antrean idle.
 * Sesuai preferensi operator, auto-sync push & auto-print latar belakang dinonaktifkan
 * agar seluruh proses pengiriman softfile dan pencetakan fisik terverifikasi secara manual
 * oleh operator melalui tombol Upload & Cetak di ConfigDashboard / Dialog Sesi.
 */
export async function checkAndFlushQueuesIfIdle(): Promise<void> {
  // Auto-sync & auto-print dinonaktifkan per permintaan operator.
  // Eksekusi print & upload tertunda hanya dilakukan manual via operator dashboard.
}

let watcherStarted = false;

/**
 * Inisialisasi background watcher berkala (tiap 30 detik).
 * Jika aplikasi dalam keadaan idle, otomatis periksa dan kuras antrean.
 */
export function startIdleQueueWatcher(): void {
  if (watcherStarted || typeof window === 'undefined') return;
  watcherStarted = true;

  setInterval(() => {
    void checkAndFlushQueuesIfIdle();
  }, 30_000);
}
