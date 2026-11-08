import { invoke } from '@tauri-apps/api/core';
import { boothFlow } from '$lib/stores/booth.svelte';

export interface CapturedSlotInfo {
  slotIndex: number;
  relativePath: string;
}

export interface ActiveSessionCheckpoint {
  sessionCode: string;
  sessionId: string | null;
  paymentMethod: 'Cashless' | 'Ticket';
  selectedFrameId: string | null;
  selectedFilterId: string;
  printQty: number;
  totalSlots: number;
  status: 'capturing' | 'customizing' | 'downloading';
  createdAt: number;
  updatedAt: number;
  capturedSlots: CapturedSlotInfo[];
}

const CHECKPOINT_RELATIVE_PATH = '_active_checkpoint.json';
const DEFAULT_TTL_MINUTES = 15;

/**
 * Membaca checkpoint sesi aktif yang tersimpan di disk.
 * Mengembalikan null jika file belum ada atau terjadi error baca.
 */
export async function getActiveCheckpoint(): Promise<ActiveSessionCheckpoint | null> {
  try {
    const bytes = await invoke<number[]>('read_session_file', {
      relativePath: CHECKPOINT_RELATIVE_PATH,
    });
    if (!bytes || bytes.length === 0) return null;
    const text = new TextDecoder().decode(new Uint8Array(bytes));
    return JSON.parse(text) as ActiveSessionCheckpoint;
  } catch {
    return null;
  }
}

/**
 * Menyimpan atau memperbarui data checkpoint sesi aktif ke disk lokal.
 */
export async function saveActiveCheckpoint(
  checkpoint: ActiveSessionCheckpoint
): Promise<void> {
  try {
    const jsonStr = JSON.stringify(checkpoint, null, 2);
    const bytes = Array.from(new TextEncoder().encode(jsonStr));
    await invoke('save_session_file', {
      relativePath: CHECKPOINT_RELATIVE_PATH,
      bytes,
    });
  } catch (err) {
    console.warn('[ActiveCheckpoint] Gagal menyimpan checkpoint:', err);
  }
}

/**
 * Inisialisasi awal checkpoint saat pembayaran customer berhasil atau saat sesi foto dimulai.
 */
export async function initActiveCheckpoint(options: {
  sessionCode: string;
  sessionId?: string | null;
  paymentMethod?: 'Cashless' | 'Ticket';
  selectedFrameId?: string | null;
  totalSlots: number;
  printQty?: number;
}): Promise<ActiveSessionCheckpoint> {
  const now = Date.now();
  const checkpoint: ActiveSessionCheckpoint = {
    sessionCode: options.sessionCode,
    sessionId: options.sessionId ?? null,
    paymentMethod: options.paymentMethod ?? 'Ticket',
    selectedFrameId: options.selectedFrameId ?? null,
    selectedFilterId: 'none',
    printQty: options.printQty ?? 1,
    totalSlots: options.totalSlots,
    status: 'capturing',
    createdAt: now,
    updatedAt: now,
    capturedSlots: [],
  };
  await saveActiveCheckpoint(checkpoint);
  return checkpoint;
}

/**
 * Mencatat slot foto yang baru saja berhasil dijepret dan disimpan ke disk.
 */
export async function recordCapturedSlotToCheckpoint(
  slotIndex: number,
  relativePath: string
): Promise<void> {
  try {
    let cp = await getActiveCheckpoint();
    if (!cp) {
      cp = {
        sessionCode: boothFlow.sessionCode || `session-${Date.now()}`,
        sessionId: boothFlow.sessionId,
        paymentMethod: boothFlow.paymentMethod,
        selectedFrameId: boothFlow.selectedFrameId,
        selectedFilterId: boothFlow.selectedFilterId,
        printQty: boothFlow.printQty,
        totalSlots: 4,
        status: 'capturing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        capturedSlots: [],
      };
    }

    const filtered = cp.capturedSlots.filter((s) => s.slotIndex !== slotIndex);
    filtered.push({ slotIndex, relativePath });
    filtered.sort((a, b) => a.slotIndex - b.slotIndex);

    cp.capturedSlots = filtered;
    cp.updatedAt = Date.now();
    await saveActiveCheckpoint(cp);
  } catch (err) {
    console.warn('[ActiveCheckpoint] Gagal memperbarui slot foto pada checkpoint:', err);
  }
}

/**
 * Memperbarui status sesi (misal menjadi 'customizing' atau 'downloading').
 */
export async function updateCheckpointStatus(
  status: 'capturing' | 'customizing' | 'downloading'
): Promise<void> {
  try {
    const cp = await getActiveCheckpoint();
    if (cp) {
      cp.status = status;
      cp.updatedAt = Date.now();
      await saveActiveCheckpoint(cp);
    }
  } catch (err) {
    console.warn('[ActiveCheckpoint] Gagal update status checkpoint:', err);
  }
}

/**
 * Menghapus checkpoint sesi aktif dari disk saat sesi selesai atau direset ke Welcome.
 */
export async function clearActiveCheckpoint(): Promise<void> {
  try {
    await invoke('delete_session_file', {
      relativePath: CHECKPOINT_RELATIVE_PATH,
    });
  } catch (err) {
    console.warn('[ActiveCheckpoint] Gagal menghapus checkpoint:', err);
  }
}

/**
 * Memeriksa apakah checkpoint masih berlaku (dalam rentang TTL toleransi, default 15 menit).
 */
export function isCheckpointValid(
  checkpoint: ActiveSessionCheckpoint,
  maxAgeMinutes = DEFAULT_TTL_MINUTES
): boolean {
  if (!checkpoint || !checkpoint.updatedAt) return false;
  const elapsedMs = Date.now() - checkpoint.updatedAt;
  const maxMs = maxAgeMinutes * 60 * 1000;
  return elapsedMs >= 0 && elapsedMs <= maxMs;
}

/**
 * Memulihkan state boothFlow dan memuat foto-foto yang sudah tersimpan di disk.
 * Mengembalikan jumlah slot foto yang berhasil dimuat.
 */
export async function restoreActiveSession(
  checkpoint: ActiveSessionCheckpoint
): Promise<{ restoredSlotsCount: number; allSlotsRestored: boolean }> {
  // 1. Pulihkan konfigurasi transaksi & frame
  if (checkpoint.sessionCode) boothFlow.sessionCode = checkpoint.sessionCode;
  if (checkpoint.sessionId) boothFlow.sessionId = checkpoint.sessionId;
  if (checkpoint.paymentMethod) boothFlow.paymentMethod = checkpoint.paymentMethod;
  if (checkpoint.selectedFrameId) boothFlow.selectedFrameId = checkpoint.selectedFrameId;
  if (checkpoint.printQty) boothFlow.printQty = checkpoint.printQty;
  if (checkpoint.selectedFilterId) boothFlow.selectedFilterId = checkpoint.selectedFilterId;

  // 2. Baca file raw JPG tiap slot dari disk lokal
  const photos: string[] = [];
  const sorted = [...checkpoint.capturedSlots].sort((a, b) => a.slotIndex - b.slotIndex);

  for (const slot of sorted) {
    try {
      const bytes = await invoke<number[]>('read_session_file', {
        relativePath: slot.relativePath,
      });
      if (bytes && bytes.length > 0) {
        const blob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
        const objUrl = URL.createObjectURL(blob);
        photos[slot.slotIndex] = objUrl;
      }
    } catch (err) {
      console.warn(`[ActiveCheckpoint] Gagal memuat foto slot ${slot.slotIndex + 1} dari disk:`, err);
    }
  }

  // Isi slot kosong jika ada gap
  const restoredArray: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    if (photos[i]) {
      restoredArray[i] = photos[i];
    }
  }
  boothFlow.photosTaken = restoredArray;

  const validCount = restoredArray.filter(Boolean).length;
  const allSlotsRestored = validCount >= checkpoint.totalSlots;

  return {
    restoredSlotsCount: validCount,
    allSlotsRestored,
  };
}
