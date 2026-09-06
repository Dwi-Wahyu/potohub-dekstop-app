import {
  listPendingOutboxJobs,
  markOutboxJobDone,
  markOutboxJobFailedAttempt,
  clearCachedTicketOfflineFlag,
  type OutboxJob,
} from '$lib/db/local';
import {
  validateAndRedeemQrTicket,
  createTransactionSession,
  uploadGalleryAsset,
} from '$lib/api/boothClient';
import { sendSoftfileEmail, sendSoftfileWA } from '$lib/utils/shared';
import { invoke } from '@tauri-apps/api/core';

let flushing = false;

interface RedeemTicketPayload {
  token: string;
  boothId: string;
}

interface SessionSoftfilePayload {
  boothId: string;
  categoryId: string | null;
  frameId: string | null;
  printQty: number;
  paymentMethod: 'Ticket' | 'Cashless';
  softfileTarget: string | null; // email ATAU nomor WA, null jika customer tidak isi
  localSessionCode: string;      // sessionCode yg sudah dipakai saveLocalSessionAssets
  assetRelativePaths: {
    role: 'composite' | 'gif' | 'video';
    path: string;
    contentType: string;
    width: number;
    height: number;
  }[];
}

/**
 * Proses SEMUA job pending secara berurutan (FIFO). Berhenti SESAAT job pertama
 * gagal (mis. timeout tengah proses) — sisa job dibiarkan 'pending' utk dicoba
 * lagi pada verifikasi online berikutnya. Ini sesuai requirement: "jika di
 * tengah pengiriman antrean terjadi masalah, ubah status jadi offline dan berhenti."
 */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const jobs = await listPendingOutboxJobs();
    for (const job of jobs) {
      const ok = await processJob(job);
      if (!ok) {
        const { networkStatus } = await import('$lib/stores/networkStatus.svelte');
        networkStatus.markOfflineDueToFailure();
        break; // STOP total, jangan lanjut ke job berikutnya
      }
    }
  } finally {
    flushing = false;
  }
}

async function processJob(job: OutboxJob): Promise<boolean> {
  try {
    if (job.jobType === 'redeem_ticket') {
      const payload: RedeemTicketPayload = JSON.parse(job.payload);
      const result = await validateAndRedeemQrTicket(payload.token, payload.boothId);
      // Server adalah sumber kebenaran akhir. Kalau ternyata server bilang
      // tidak valid (mis. sudah dipakai duluan oleh booth lain), tetap tandai
      // job selesai (tidak retry selamanya) tapi catat di log utk audit manual.
      if (!result.valid) {
        console.warn(`[offlineOutbox] Tiket ${payload.token} ditolak server saat sync:`, result.message);
      }
      await clearCachedTicketOfflineFlag(payload.token);
      await markOutboxJobDone(job.id);
      return true;
    }

    if (job.jobType === 'session_softfile') {
      const payload: SessionSoftfilePayload = JSON.parse(job.payload);

      const session = await createTransactionSession(
        payload.boothId,
        payload.categoryId,
        payload.printQty,
        payload.paymentMethod,
        payload.frameId,
      );
      const sessionId = session.session_id || (session as any).id;

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
          console.warn(`[offlineOutbox] Asset ${asset.path} gagal dibaca/diupload:`, assetErr);
        }
      }

      if (payload.softfileTarget) {
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.softfileTarget);
        const sent = isEmail
          ? await sendSoftfileEmail(payload.softfileTarget, () => {}, sessionId)
          : await sendSoftfileWA(payload.softfileTarget, () => {}, sessionId);
        if (!sent) throw new Error('Softfile gagal terkirim saat sync ulang');
      }

      await markOutboxJobDone(job.id);
      return true;
    }

    console.warn('[offlineOutbox] job_type tidak dikenal:', job.jobType);
    await markOutboxJobDone(job.id); // buang job asing daripada macet selamanya
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[offlineOutbox] Job #${job.id} (${job.jobType}) gagal:`, msg);
    await markOutboxJobFailedAttempt(job.id, msg);
    return false;
  }
}
