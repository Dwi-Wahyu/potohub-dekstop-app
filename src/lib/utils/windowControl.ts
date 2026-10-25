import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Mengatur mode Kiosk Terkunci (Locked) vs Terbuka (Operator Unlocked) pada aplikasi Desktop.
 * - Saat locked = true: Fullscreen penuh (menutup Taskbar / bottom navigation Windows), tanpa dekorasi titlebar, dan tidak bisa diminimize.
 * - Saat locked = false: Keluar dari Fullscreen (Taskbar / bottom navigation Windows muncul kembali), jendela dimaximize di atas taskbar, dan mengizinkan tombol minimize.
 */
export async function setKioskLockedMode(locked: boolean): Promise<void> {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const appWindow = getCurrentWindow();
      if (locked) {
        await appWindow.setDecorations(false);
        if ('setMinimizable' in appWindow && typeof appWindow.setMinimizable === 'function') {
          await appWindow.setMinimizable(false);
        }
        await appWindow.setFullscreen(true);
      } else {
        await appWindow.setFullscreen(false);
        await appWindow.setDecorations(false);
        if ('setMinimizable' in appWindow && typeof appWindow.setMinimizable === 'function') {
          await appWindow.setMinimizable(true);
        }
        if ('maximize' in appWindow && typeof appWindow.maximize === 'function') {
          await appWindow.maximize();
        }
      }
    }
  } catch (e) {
    console.warn('Gagal mengatur mode kiosk jendela Tauri:', e);
  }
}

/**
 * Dinamis mengatur ketersediaan dekorasi jendela (tombol close, minimize, maximize, & titlebar)
 * @param enable true untuk menampilkan tombol/titlebar & taskbar (mode halaman admin/onboarding), false untuk mode kiosk fullscreen
 */
export async function setWindowDecorations(enable: boolean): Promise<void> {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const appWindow = getCurrentWindow();
      if (enable) {
        await appWindow.setFullscreen(false);
        await appWindow.setDecorations(true);
        if ('setMinimizable' in appWindow && typeof appWindow.setMinimizable === 'function') {
          await appWindow.setMinimizable(true);
        }
        if ('maximize' in appWindow && typeof appWindow.maximize === 'function') {
          await appWindow.maximize();
        }
      } else {
        await appWindow.setDecorations(false);
        await appWindow.setFullscreen(true);
      }
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
      await appWindow.setFullscreen(false);
      if ('setMinimizable' in appWindow && typeof appWindow.setMinimizable === 'function') {
        await appWindow.setMinimizable(true);
      }
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
