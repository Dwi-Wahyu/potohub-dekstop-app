import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

/**
 * Mengatur mode Kiosk Terkunci (Locked) vs Terbuka (Operator Unlocked) pada aplikasi Desktop.
 * - Saat locked = true:
 *   1. Memanggil Win32 native lock di Rust untuk menyembunyikan & menonaktifkan Taskbar Windows (Shell_TrayWnd).
 *   2. Fullscreen penuh dan Always On Top (HWND_TOPMOST) sehingga swipe dari bawah layar tidak memicu taskbar.
 *   3. Tanpa dekorasi titlebar dan tombol minimize dinonaktifkan.
 * - Saat locked = false:
 *   1. Memulihkan Taskbar Windows normal via Win32 di Rust.
 *   2. Melepas status Always On Top & Fullscreen agar operator leluasa mengakses taskbar/desktop/Windows+L.
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
        if ('setAlwaysOnTop' in appWindow && typeof appWindow.setAlwaysOnTop === 'function') {
          await appWindow.setAlwaysOnTop(true);
        }
      } else {
        if ('setAlwaysOnTop' in appWindow && typeof appWindow.setAlwaysOnTop === 'function') {
          await appWindow.setAlwaysOnTop(false);
        }
        await appWindow.setFullscreen(false);
        await appWindow.setDecorations(false);
        if ('setMinimizable' in appWindow && typeof appWindow.setMinimizable === 'function') {
          await appWindow.setMinimizable(true);
        }
        if ('maximize' in appWindow && typeof appWindow.maximize === 'function') {
          await appWindow.maximize();
        }
      }

      // Panggil penguncian native Win32 (Hide & Disable Taskbar Shell_TrayWnd pada Windows)
      try {
        await invoke('set_kiosk_system_lock', { locked });
      } catch (err) {
        console.warn('[windowControl] Gagal invoke set_kiosk_system_lock:', err);
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
      // Pastikan taskbar Windows dipulihkan sebelum jendela ditutup
      try {
        await invoke('set_kiosk_system_lock', { locked: false });
      } catch {}

      const appWindow = getCurrentWindow();
      await appWindow.close();
    }
  } catch (e) {
    console.warn('Gagal menutup jendela Tauri:', e);
  }
}
