import { getActiveBoothId, submitProblemReport, type ProblemReportPayload } from '$lib/api/boothClient';

/**
 * Antrean lokal laporan masalah dari menu petugas.
 * Endpoint API belum tersedia, jadi laporan yang gagal terkirim (endpoint belum ada / offline)
 * disimpan di perangkat dan dicoba ulang lewat flushProblemReports().
 */
const STORE_KEY = 'potohub_pending_problem_reports';

type QueuedReport = ProblemReportPayload & { booth_id: string };

function readQueue(): QueuedReport[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedReport[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('[problemReports] Gagal menyimpan antrean laporan:', e);
  }
}

export function countPendingProblemReports(): number {
  return readQueue().length;
}

/** Kirim laporan; true = terkirim ke server, false = disimpan di perangkat untuk dikirim nanti. */
export async function sendProblemReport(payload: ProblemReportPayload): Promise<boolean> {
  const boothId = (await getActiveBoothId()) ?? 'default';
  try {
    await submitProblemReport(boothId, payload);
    return true;
  } catch (e) {
    console.warn('[problemReports] Laporan diantrekan lokal:', e);
    writeQueue([...readQueue(), { ...payload, booth_id: boothId }]);
    return false;
  }
}

/** Coba kirim ulang semua laporan yang tertunda. Mengembalikan jumlah yang berhasil terkirim. */
export async function flushProblemReports(): Promise<number> {
  const queue = readQueue();
  if (queue.length === 0) return 0;
  const remaining: QueuedReport[] = [];
  let sent = 0;
  for (const item of queue) {
    const { booth_id, ...payload } = item;
    try {
      await submitProblemReport(booth_id, payload);
      sent++;
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  return sent;
}
