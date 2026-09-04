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
  if (!sessionId || sessionId === '00000000-0000-0000-0000-000000000000') {
    console.warn('[sendSoftfileEmail] Invalid or missing sessionId:', sessionId);
    return false;
  }
  try {
    const res = await fetch(`${API_BASE}/public/softfile/send-email`, {
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
        console.log('[sendSoftfileEmail] Softfile email request sent successfully');
        await delay(300);
        onSent(true);
        return true;
      } else {
        console.warn('[sendSoftfileEmail] Server returned failure:', data.message);
      }
    } else {
      console.warn('[sendSoftfileEmail] Request failed with status:', res.status);
    }
  } catch (err) {
    console.warn('[sendSoftfileEmail] Request failed:', err);
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
  if (!sessionId || sessionId === '00000000-0000-0000-0000-000000000000') {
    console.warn('[sendSoftfileWA] Invalid or missing sessionId:', sessionId);
    return false;
  }
  try {
    const res = await fetch(`${API_BASE}/public/softfile/send-wa`, {
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
        console.log('[sendSoftfileWA] Softfile WhatsApp request sent successfully');
        await delay(300);
        onSent(true);
        return true;
      } else {
        console.warn('[sendSoftfileWA] Server returned failure:', data.message);
      }
    } else {
      console.warn('[sendSoftfileWA] Request failed with status:', res.status);
    }
  } catch (err) {
    console.warn('[sendSoftfileWA] Request failed:', err);
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
  if (config.flipVertical) {
    parts.push('scaleY(-1)');
  }
  return parts.length > 0 ? parts.join(' ') : 'none';
}
