import {
  listPendingOutboxJobs,
  markOutboxJobDone,
  markOutboxJobFailedAttempt,
  markOutboxJobDeadLetter,
  clearCachedTicketOfflineFlag,
  getOutboxJobById,
  updateOutboxJobPayload,
  type OutboxJob,
} from '$lib/db/local';
import {
  validateAndRedeemQrTicket,
  createTransactionSession,
  uploadGalleryAsset,
  isNetworkTransportError,
} from '$lib/api/boothClient';
import { sendSoftfileEmail, sendSoftfileWA } from '$lib/utils/shared';
import { invoke } from '@tauri-apps/api/core';

let flushing = false;

interface RedeemTicketPayload {
  token: string;
  boothId: string;
}

export interface SessionSoftfilePayload {
  boothId: string;
  categoryId: string | null;
  frameId: string | null;
  printQty: number;
  paymentMethod: 'Ticket' | 'Cashless';
  softfileTarget: string | null;
  localSessionCode: string;
  backendSessionId?: string;
  assetRelativePaths: {
    role: 'composite' | 'gif' | 'video';
    path: string;
    contentType: string;
    width: number;
    height: number;
  }[];
}

export interface FlushOptions {
  force?: boolean;
}

export async function flushOutbox(options?: FlushOptions): Promise<{ processed: number; errors: number }> {
  if (flushing) return { processed: 0, errors: 0 };

  // Cek apakah aplikasi idle jika tidak dipaksa secara manual oleh operator
  if (!options?.force) {
    const { isAppIdle } = await import('$lib/utils/idleCoordinator');
    if (!isAppIdle()) {
      console.log('[offlineOutbox] Aplikasi sedang aktif dengan pelanggan. Auto-flush outbox ditunda.');
      return { processed: 0, errors: 0 };
    }
  }

  flushing = true;
  let processed = 0;
  let errors = 0;

  try {
    const jobs = await listPendingOutboxJobs();
    for (const job of jobs) {
      const result = await processJob(job);
      if (result.status === 'success') {
        processed++;
      } else if (result.status === 'network_failure') {
        errors++;
        // HANYA jika benar-benar error jaringan transport, tandai offline dan hentikan antrean
        console.warn(`[offlineOutbox] Job #${job.id} mengalami error jaringan. Menjeda outbox.`);
        const { networkStatus } = await import('$lib/stores/networkStatus.svelte');
        networkStatus.markOfflineDueToFailure();
        break;
      } else {
        errors++;
      }
      // Jika result status 'success' atau 'business_error', lanjut ke job berikutnya!
    }
  } finally {
    flushing = false;
  }

  return { processed, errors };
}

export type JobProcessOutcome = 
  | { status: 'success' }
  | { status: 'business_error'; reason: string }
  | { status: 'network_failure'; error: unknown };

/**
 * Jalankan proses satu job spesifik secara manual (misal dari tombol Reupload sesi di dialog)
 */
export async function processSingleJobById(jobId: number): Promise<JobProcessOutcome> {
  const job = await getOutboxJobById(jobId);
  if (!job) {
    return { status: 'business_error', reason: `Job #${jobId} tidak ditemukan` };
  }
  return await processJob(job);
}

export async function processJob(job: OutboxJob): Promise<JobProcessOutcome> {
  try {
    if (job.jobType === 'redeem_ticket') {
      const payload: RedeemTicketPayload = JSON.parse(job.payload);
      const result = await validateAndRedeemQrTicket(payload.token, payload.boothId);
      
      if (!result.valid) {
        console.warn(`[offlineOutbox] Tiket ${payload.token} ditolak server saat sync:`, result.message);
      }
      
      // Bersihkan flag offline & tandai job selesai terlepas tiket diterima/ditolak server
      await clearCachedTicketOfflineFlag(payload.token);
      await markOutboxJobDone(job.id);
      return { status: 'success' };
    }

    if (job.jobType === 'session_softfile') {
      const payload: SessionSoftfilePayload = JSON.parse(job.payload);

      let sessionId = payload.backendSessionId;
      if (!sessionId) {
        try {
          const session = await createTransactionSession(
            payload.boothId,
            payload.categoryId,
            payload.printQty,
            payload.paymentMethod,
            payload.frameId,
          );
          sessionId = session.session_id || (session as any).id;
          payload.backendSessionId = sessionId;
          // Simpan backendSessionId kembali ke database agar percobaan ulang tidak menduplikasi transaksi
          await updateOutboxJobPayload(job.id, JSON.stringify(payload)).catch(() => {});
        } catch (sessErr) {
          if (isNetworkTransportError(sessErr)) {
            await markOutboxJobFailedAttempt(job.id, String(sessErr));
            return { status: 'network_failure', error: sessErr };
          }
          // Jika 400/401/404 bukan error jaringan, catat sebagai dead-letter agar tidak macet selamanya
          console.error(`[offlineOutbox] createTransactionSession gagal permanen untuk Job #${job.id}:`, sessErr);
          await markOutboxJobDeadLetter(job.id, `Session create failed: ${sessErr}`);
          return { status: 'business_error', reason: String(sessErr) };
        }
      }

      if (!sessionId) {
        return { status: 'business_error', reason: 'Session ID tidak valid' };
      }

      // Upload file aset lokal yang tersimpan
      for (const asset of payload.assetRelativePaths) {
        try {
          const bytes = await invoke<number[]>('read_session_file', { relativePath: asset.path });
          const blob = new Blob([new Uint8Array(bytes)], { type: asset.contentType });
          await uploadGalleryAsset(
            payload.boothId,
            sessionId,
            asset.role === 'composite' ? 'photo' : asset.role,
            blob,
            asset.contentType.split('/')[1] || 'jpg',
            asset.contentType,
            asset.width,
            asset.height,
          );
        } catch (assetErr) {
          if (isNetworkTransportError(assetErr)) {
            await markOutboxJobFailedAttempt(job.id, String(assetErr));
            return { status: 'network_failure', error: assetErr };
          }
          console.warn(`[offlineOutbox] Asset ${asset.path} gagal dibaca/diupload:`, assetErr);
        }
      }

      // Kirim softfile jika ada target (jangan lempar fatal network error jika nomor/email gagal terkirim)
      if (payload.softfileTarget) {
        try {
          const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.softfileTarget);
          if (isEmail) {
            await sendSoftfileEmail(payload.softfileTarget, () => {}, sessionId);
          } else {
            await sendSoftfileWA(payload.softfileTarget, () => {}, sessionId);
          }
        } catch (softfileErr) {
          console.warn('[offlineOutbox] Pengiriman email/WA softfile gagal saat sync, namun sesi & aset aman:', softfileErr);
        }
      }

      await markOutboxJobDone(job.id);
      return { status: 'success' };
    }

    console.warn('[offlineOutbox] job_type tidak dikenal:', job.jobType);
    await markOutboxJobDone(job.id);
    return { status: 'success' };
  } catch (e) {
    if (isNetworkTransportError(e)) {
      await markOutboxJobFailedAttempt(job.id, String(e));
      return { status: 'network_failure', error: e };
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[offlineOutbox] Job #${job.id} (${job.jobType}) gagal non-network:`, msg);
    await markOutboxJobFailedAttempt(job.id, msg);
    return { status: 'business_error', reason: msg };
  }
}
