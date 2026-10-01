import { listPendingPrintJobs, markPrintJobDone, markPrintJobFailedAttempt } from '$lib/db/local';
import { printerStore } from '$lib/printer.svelte';
import { invoke } from '@tauri-apps/api/core';

let isFlushing = false;

export async function flushPrintQueue(): Promise<{ processed: number; errors: number }> {
  if (isFlushing) return { processed: 0, errors: 0 };
  
  // Refresh status printer & pastikan online + ready
  await printerStore.refreshStatus();
  if (!printerStore.status?.is_online || !printerStore.status?.is_ready) {
    return { processed: 0, errors: 0 };
  }

  isFlushing = true;
  let processed = 0;
  let errors = 0;

  try {
    const jobs = await listPendingPrintJobs();
    for (const job of jobs) {
      // Re-check printer status sebelum cetak tiap job
      await printerStore.refreshStatus();
      if (!printerStore.status?.is_online || !printerStore.status?.is_ready) {
        break;
      }

      try {
        await invoke('print_photo', {
          printerName: printerStore.selectedPrinter,
          imagePath: job.imagePath,
          copies: job.copies,
          paperSize: job.paperSize,
        });

        await markPrintJobDone(job.id);
        processed++;
        // Update software paper counter lokal
        if (printerStore.status?.paper_remaining) {
          printerStore.status.paper_remaining = Math.max(0, printerStore.status.paper_remaining - job.copies);
        }
      } catch (err) {
        console.error(`[printQueue] Gagal mencetak job #${job.id}:`, err);
        await markPrintJobFailedAttempt(job.id, String(err));
        errors++;
        
        await printerStore.refreshStatus();
        if (!printerStore.status?.is_online) break;
      }
    }
  } catch (err) {
    console.error('[printQueue] Error running flushPrintQueue:', err);
  } finally {
    isFlushing = false;
  }

  return { processed, errors };
}
