export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function formatTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function generateSessionCode(boothName: string = 'OURPICS'): string {
  const sanitized = boothName.replace(/\s+/g, '').toUpperCase();
  return `${sanitized}-${Date.now().toString(36).toUpperCase()}`;
}

// Stub function as required by §0 item 5 & §3.3
export async function sendSoftFile(
  email: string,
  onSent: () => void
): Promise<void> {
  if (!email.trim()) return;
  // TODO: integrasikan ke API pembayaran/softfile setelah endpoint tersedia.
  // Local state stub feedback
  await delay(500);
  onSent();
}
