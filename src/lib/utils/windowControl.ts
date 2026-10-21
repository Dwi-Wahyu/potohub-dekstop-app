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

/**
 * Mengatur apakah jendela dapat diminimize oleh OS (misal Windows)
 */
export async function setWindowMinimizable(enable: boolean): Promise<void> {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const appWindow = getCurrentWindow();
      if ('setMinimizable' in appWindow && typeof appWindow.setMinimizable === 'function') {
        await appWindow.setMinimizable(enable);
      }
    }
  } catch (e) {
    console.warn('Gagal mengatur minimizable jendela Tauri:', e);
  }
}

/**
 * Minimize jendela aplikasi Tauri ke taskbar Windows
 */
export async function minimizeWindow(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    }
  } catch (e) {
    console.warn('Gagal minimize jendela Tauri:', e);
  }
}

/**
 * Menutup jendela aplikasi Tauri (Close application)
 */
export async function closeWindow(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    }
  } catch (e) {
    console.warn('Gagal menutup jendela Tauri:', e);
  }
}
