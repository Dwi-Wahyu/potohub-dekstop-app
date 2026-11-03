import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { info as logInfo, warn as logWarn } from '@tauri-apps/plugin-log';
import { printerStore } from '$lib/printer.svelte';

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function formatTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function generateSessionCode(boothName: string = 'POTOHUB'): string {
  const sanitized = boothName.replace(/\s+/g, '').toUpperCase();
  return `${sanitized}-${Date.now().toString(36).toUpperCase()}`;
}

const envs = import.meta.env as Record<string, string>;
const rawBase =
  envs.VITE_API_BASE_URL ||
  envs.PUBLIC_API_BASE_URL ||
  "http://localhost:8080/api";
const API_BASE = rawBase.replace(/\/+$/, "");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sendSoftfileEmail(
  email: string,
  onSent: (success?: boolean) => void,
  sessionId?: string
): Promise<boolean> {
  const trimmed = email.trim();
  if (!trimmed) {
    onSent(false);
    return false;
  }
  if (!sessionId || !UUID_REGEX.test(sessionId) || sessionId === '00000000-0000-0000-0000-000000000000') {
    console.warn('[sendSoftfileEmail] Invalid or missing sessionId:', sessionId);
    await logWarn(`[sendSoftfileEmail] Invalid or missing sessionId: ${sessionId}`).catch(() => {});
    return false;
  }
  try {
    const res = await tauriFetch(`${API_BASE}/public/softfile/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        email: trimmed,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.email_sent || data.success) {
        await logInfo(`[sendSoftfileEmail] Softfile email sent successfully for session=${sessionId}`).catch(() => {});
        await delay(300);
        onSent(true);
        return true;
      } else {
        await logWarn(`[sendSoftfileEmail] Server returned failure: ${data.message}`).catch(() => {});
      }
    } else {
      const errBody = await res.text().catch(() => '');
      await logWarn(`[sendSoftfileEmail] Request failed with status=${res.status}: ${errBody}`).catch(() => {});
    }
  } catch (err) {
    await logWarn(`[sendSoftfileEmail] Request exception: ${String(err)}`).catch(() => {});
  }
  return false;
}

export async function sendSoftfileWA(
  phone: string,
  onSent: (success?: boolean) => void,
  sessionId?: string
): Promise<boolean> {
  const trimmed = phone.trim();
  if (!trimmed) {
    onSent(false);
    return false;
  }
  if (!sessionId || !UUID_REGEX.test(sessionId) || sessionId === '00000000-0000-0000-0000-000000000000') {
    console.warn('[sendSoftfileWA] Invalid or missing sessionId:', sessionId);
    await logWarn(`[sendSoftfileWA] Invalid or missing sessionId: ${sessionId}`).catch(() => {});
    return false;
  }
  try {
    const res = await tauriFetch(`${API_BASE}/public/softfile/send-wa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        phone: trimmed,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.wa_sent || data.success) {
        await logInfo(`[sendSoftfileWA] Softfile WhatsApp sent successfully for session=${sessionId}`).catch(() => {});
        await delay(300);
        onSent(true);
        return true;
      } else {
        await logWarn(`[sendSoftfileWA] Server returned failure: ${data.message}`).catch(() => {});
      }
    } else {
      const errBody = await res.text().catch(() => '');
      await logWarn(`[sendSoftfileWA] Request failed with status=${res.status}: ${errBody}`).catch(() => {});
    }
  } catch (err) {
    await logWarn(`[sendSoftfileWA] Request exception: ${String(err)}`).catch(() => {});
  }
  return false;
}

export async function sendSoftFile(
  target: string,
  onSent: (success?: boolean) => void,
  sessionId?: string
): Promise<boolean> {
  const trimmed = target.trim();
  if (!trimmed) {
    onSent(false);
    return false;
  }

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  if (isEmail) {
    return sendSoftfileEmail(trimmed, onSent, sessionId);
  } else {
    return sendSoftfileWA(trimmed, onSent, sessionId);
  }
}

export function getLiveviewTransformStyle(
  config: {
    mirrorOn?: boolean;
    flipVertical?: boolean;
    cameraRotate?: string;
  },
  cameraMode: 'usb' | 'webcam' | 'demo' = 'usb'
): string {
  const parts: string[] = [];
  if (config.cameraRotate === '90° CW') {
    parts.push('rotate(90deg)');
  } else if (config.cameraRotate === '180°') {
    parts.push('rotate(180deg)');
  } else if (config.cameraRotate === '90° CCW') {
    parts.push('rotate(270deg)');
  }
  if (config.mirrorOn) {
    parts.push('scaleX(-1)');
  }
  return parts.length > 0 ? parts.join(' ') : 'none';
}

/**
 * Transform CSS untuk foto di slot: crop (pan & zoom) diterapkan di ruang layar
 * SETELAH mirror/rotasi kamera, sehingga sama persis dengan urutan di
 * `compositeTemplateImage` (crop dulu di context, baru mirror).
 */
export function getPhotoSlotTransformStyle(
  crop: { x: number; y: number; zoom: number },
  liveviewTransform: string
): string {
  const parts: string[] = [];
  if (crop.x !== 0 || crop.y !== 0 || crop.zoom !== 1) {
    parts.push(`translate(${crop.x * 100}%, ${crop.y * 100}%) scale(${crop.zoom})`);
  }
  if (liveviewTransform && liveviewTransform !== 'none') {
    parts.push(liveviewTransform);
  }
  return parts.length > 0 ? parts.join(' ') : 'none';
}

export interface TemplatePrinterConfig {
  useSecondary: boolean;
  targetPrinter: string | null;
  paperSize: string;
}

/**
 * Shared function untuk menentukan konfigurasi printer yang tepat berdasarkan frame / template
 * yang dipilih (otomatis memilih Primary Printer atau Secondary Printer untuk 2-inch cut strip).
 */
export function resolvePrinterConfigForTemplate(
  template: { paper_size?: string; use_secondary_printer?: boolean } | null | undefined
): TemplatePrinterConfig {
  const paperSize = template?.paper_size || '4x6';
  const useSecondary = Boolean(template?.use_secondary_printer);
  const targetPrinter = printerStore.resolvePrinter(useSecondary);
  return {
    useSecondary,
    targetPrinter,
    paperSize,
  };
}
