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

  const isAtWelcome =
    boothFlow.step === 'welcome' ||
    (boothFlow.step as string) === 'landing' ||
    (boothFlow.step as string) === 'start';
  const hasNoActiveSession = !boothFlow.sessionCode && boothFlow.photosTaken.length === 0;
  const notGenerating = !boothFlow.isGeneratingGif && !boothFlow.isGeneratingVideo;

  return isAtWelcome && hasNoActiveSession && notGenerating;
}

/**
 * Pengecekan antrean idle.
 * Auto-print antrean foto fisik otomatis dieksekusi HANYA jika aplikasi berada dalam kondisi IDLE
 * (layar awal/standby tanpa sesi pelanggan aktif).
 */
export async function checkAndFlushQueuesIfIdle(): Promise<void> {
  if (!isAppIdle()) {
    return;
  }

  try {
    const res = await flushPrintQueue();
    if (res.processed > 0) {
      console.log(`[idleCoordinator] Sukses auto-print ${res.processed} job antrean saat idle.`);
    }
  } catch (err) {
    console.warn('[idleCoordinator] Gagal flushPrintQueue saat idle:', err);
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
