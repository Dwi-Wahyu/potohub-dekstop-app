import { listPendingPrintJobs, markPrintJobDone, markPrintJobFailedAttempt } from '$lib/db/local';
import { printerStore } from '$lib/printer.svelte';
import { invoke } from '@tauri-apps/api/core';

let isFlushing = false;

export async function flushPrintQueue(): Promise<{ processed: number; errors: number }> {
  if (isFlushing) return { processed: 0, errors: 0 };
  
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
        processed++;

        // Update software paper counter jika ada
        const st =
          job.useSecondary && printerStore.secondaryPrinter === targetPrinter
            ? printerStore.secondaryStatus
            : printerStore.status;
        if (st?.paper_remaining !== undefined) {
          st.paper_remaining = Math.max(0, st.paper_remaining - job.copies);
        }
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
