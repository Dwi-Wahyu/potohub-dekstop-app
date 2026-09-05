import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Dinamis mengatur ketersediaan dekorasi jendela (tombol close, minimize, maximize, & titlebar)
 * @param enable true untuk menampilkan tombol/titlebar, false untuk menyembunyikan (kiosk mode)
 */
export async function setWindowDecorations(enable: boolean): Promise<void> {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const appWindow = getCurrentWindow();
      await appWindow.setDecorations(enable);
    }
  } catch (e) {
    console.warn('Gagal mengatur dekorasi jendela Tauri:', e);
  }
}
