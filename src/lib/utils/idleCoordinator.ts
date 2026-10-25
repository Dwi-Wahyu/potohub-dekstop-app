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
 * Jalankan pengecekan dan flush antrean outbox & print queue HANYA jika aplikasi idle.
 * Tidak akan pernah menginterupsi interaksi user atau sesi foto yang sedang aktif.
 */
export async function checkAndFlushQueuesIfIdle(): Promise<void> {
  if (!isAppIdle()) {
    console.log('[idleCoordinator] Aplikasi sedang aktif dengan pelanggan. Auto-sync & auto-print ditunda.');
    return;
  }

  // Jika online, kuras outbox (upload aset & softfile yang tertunda)
  if (networkStatus.isOnline) {
    try {
      await flushOutbox({ force: false });
    } catch (e) {
      console.warn('[idleCoordinator] Gagal menguras outbox saat idle:', e);
    }
  }

  // Kuras print queue jika printer siap
  try {
    await flushPrintQueue({ force: false });
  } catch (e) {
    console.warn('[idleCoordinator] Gagal menguras print queue saat idle:', e);
  }
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
