import {
  listPendingPrintJobs,
  markPrintJobDone,
  markPrintJobFailedAttempt,
  enqueuePrintJob,
  cancelPrintJob,
  clearAllPendingPrintJobs,
  cancelPendingPrintJobsBySessionCode,
  updateSessionPrintStatus,
  type PrintJob,
} from '$lib/db/local';
import { printerStore, deductPaperCount } from '$lib/printer.svelte';
import { invoke } from '@tauri-apps/api/core';

let isFlushing = false;

// Expose helper ke window agar operator/developer bisa membatalkan antrean dari console DevTools kapan saja
if (typeof window !== 'undefined') {
  (window as any).potohubClearPrintQueue = clearAllPendingPrintJobs;
}

export {
  clearAllPendingPrintJobs,
  cancelPrintJob,
  cancelPendingPrintJobsBySessionCode,
};

export interface FlushPrintOptions {
  force?: boolean;
}

// Batas waktu maksimal sebuah antrean cetak boleh dicetak otomatis saat idle (2 jam).
// Job yang lebih tua dari batas ini (misal hasil test kemarin atau sesi yang sudah lewat berjam-jam)
// akan otomatis diabaikan & dibatalkan agar tidak membuang kertas foto booth yang mahal.
const MAX_AUTO_PRINT_AGE_MS = 2 * 60 * 60 * 1000;

export async function flushPrintQueue(options?: FlushPrintOptions): Promise<{ processed: number; errors: number }> {
  if (isFlushing) return { processed: 0, errors: 0 };
  
  // Cek apakah aplikasi idle jika tidak dipaksa secara manual oleh operator
  if (!options?.force) {
    const { isAppIdle } = await import('$lib/utils/idleCoordinator');
    if (!isAppIdle()) {
      console.log('[printQueue] Aplikasi sedang aktif dengan pelanggan. Auto-print antrean ditunda.');
      return { processed: 0, errors: 0 };
    }
  }

  // Refresh status printer
  await printerStore.refreshStatus();
  if (!printerStore.status?.is_online && !printerStore.secondaryStatus?.is_online) {
    return { processed: 0, errors: 0 };
  }

  isFlushing = true;
  let processed = 0;
  let errors = 0;

  try {
    const jobs = await listPendingPrintJobs();
    for (const job of jobs) {
      // Keamanan hemat kertas: Jangan auto-print job yang sudah kadaluarsa (> 2 jam) saat idle
      if (!options?.force && Date.now() - job.createdAt > MAX_AUTO_PRINT_AGE_MS) {
        console.log(`[printQueue] Job #${job.id} (sesi ${job.sessionCode}) kadaluarsa (> 2 jam). Auto-print dibatalkan untuk menghemat kertas.`);
        await cancelPrintJob(job.id);
        continue;
      }

      await printerStore.refreshStatus();

      const targetPrinter = printerStore.resolvePrinter(job.useSecondary);
      if (!targetPrinter) {
        continue;
      }

      const check = printerStore.canPrint(job.copies, job.useSecondary);
      if (!check.ok) {
        console.warn(`[printQueue] Skipping job #${job.id}: ${check.reason}`);
        continue;
      }

      try {
        await invoke('print_photo', {
          printerName: targetPrinter,
          imagePath: job.imagePath,
          copies: job.copies,
          paperSize: job.paperSize,
        });

        await markPrintJobDone(job.id);
        void updateSessionPrintStatus(job.sessionCode, 'printed').catch(console.warn);
        processed++;

        // Update software paper counter jika berhasil
        deductPaperCount(job.copies);
      } catch (err) {
        console.error(`[printQueue] Gagal mencetak job #${job.id}:`, err);
        await markPrintJobFailedAttempt(job.id, String(err));
        errors++;
      }
    }
  } catch (err) {
    console.error('[printQueue] Error running flushPrintQueue:', err);
  } finally {
    isFlushing = false;
  }

  return { processed, errors };
}

/**
 * Mencetak ulang strip foto secara langsung dari file lokal pada disk sesi.
 * Digunakan oleh tombol Print manual pada modal Reupload Sesi.
 */
export async function reprintSessionDirectly(
  sessionCode: string,
  compositeRelativePath: string,
  copies = 1,
  paperSize = '4x6',
  useSecondary = false,
): Promise<{ ok: boolean; message: string }> {
  try {
    // 1. Baca byte file foto strip dari direktori sesi lokal
    const bytes = await invoke<number[]>('read_session_file', {
      relativePath: compositeRelativePath,
    });
    if (!bytes || bytes.length === 0) {
      return { ok: false, message: 'File gambar komposit sesi tidak ditemukan di disk lokal.' };
    }

    // 2. Periksa kesiapan printer
    await printerStore.refreshStatus();
    const check = printerStore.canPrint(copies, useSecondary);
    if (!check.ok) {
      // Masukkan ke antrean cetak jika printer sedang tidak siap
      await enqueuePrintJob({
        sessionCode,
        imagePath: compositeRelativePath,
        copies,
        paperSize,
        useSecondary,
      });
      return {
        ok: true,
        message: `Printer belum siap (${check.reason}). Job telah dimasukkan ke antrean cetak otomatis.`,
      };
    }

    // 3. Cetak langsung dari buffer memory
    const buffer = new Uint8Array(bytes);
    await printerStore.printFromBuffer(buffer, {
      copies,
      paper_size: paperSize,
      quality: 'standard',
      useSecondary,
    });

    deductPaperCount(copies);

    return { ok: true, message: `Berhasil mengirim ${copies} lembar ke printer!` };
  } catch (err) {
    console.error('[printQueue] Gagal reprintSessionDirectly:', err);
    return { ok: false, message: `Gagal mencetak: ${String(err)}` };
  }
}
