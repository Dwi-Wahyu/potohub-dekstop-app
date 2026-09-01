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
  onSent: () => void,
  sessionId?: string
): Promise<void> {
  const trimmed = email.trim();
  if (!trimmed) {
    onSent();
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/public/softfile/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId || '00000000-0000-0000-0000-000000000000',
        email: trimmed,
      }),
    });
    if (res.ok) {
      console.log('[sendSoftfileEmail] Softfile email request sent successfully');
    }
  } catch (err) {
    console.warn('[sendSoftfileEmail] Request failed:', err);
  } finally {
    await delay(300);
    onSent();
  }
}

export async function sendSoftfileWA(
  phone: string,
  onSent: () => void,
  sessionId?: string
): Promise<void> {
  const trimmed = phone.trim();
  if (!trimmed) {
    onSent();
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/public/softfile/send-wa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId || '00000000-0000-0000-0000-000000000000',
        phone: trimmed,
      }),
    });
    if (res.ok) {
      console.log('[sendSoftfileWA] Softfile WhatsApp request sent successfully');
    }
  } catch (err) {
    console.warn('[sendSoftfileWA] Request failed:', err);
  } finally {
    await delay(300);
    onSent();
  }
}

export async function sendSoftFile(
  target: string,
  onSent: () => void,
  sessionId?: string
): Promise<void> {
  const trimmed = target.trim();
  if (!trimmed) {
    onSent();
    return;
  }

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  if (isEmail) {
    return sendSoftfileEmail(trimmed, onSent, sessionId);
  } else {
    return sendSoftfileWA(trimmed, onSent, sessionId);
  }
}
