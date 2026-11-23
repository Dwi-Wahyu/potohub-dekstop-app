import { check as tauriCheck, type Update } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';

const envs = import.meta.env as Record<string, string>;
const rawBase =
  envs.VITE_API_BASE_URL || envs.PUBLIC_API_BASE_URL || 'http://localhost:8080/api';
const API_BASE = rawBase.replace(/\/+$/, '');

export type UpdatePhase = 'available' | 'loading' | 'uptodate' | 'error';

function parseChangelog(markdown: string): string[] {
  if (!markdown) return [];
  const lines = markdown.split('\n');
  const items: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const cleaned = trimmed.replace(/^[-*]\s+/, '').replace(/\*\*(.*?)\*\*/g, '$1');
      if (cleaned) items.push(cleaned);
    }
  }
  return items.length > 0 ? items : [markdown];
}

class UpdaterStore {
  phase = $state<UpdatePhase>('available');
  isChecking = $state(false);
  hasUpdate = $state(false);
  modalOpen = $state(false);
  currentVersion = $state('0.1.1');
  latestVersion = $state('0.1.1');
  versionName = $state('PotoHub Booth');
  changelog = $state<string[]>([]);
  downloadProgress = $state(0);
  isInstalled = $state(false);
  errorMessage = $state<string | null>(null);

  private tauriUpdateObj: Update | null = null;
  private simTimer: any = null;
  private versionLoaded = false;

  private isTauriRuntime(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  async syncCurrentVersion() {
    if (this.versionLoaded) return;
    if (this.isTauriRuntime()) {
      try {
        const ver = await getVersion();
        if (ver) {
          this.currentVersion = ver;
          this.versionLoaded = true;
        }
      } catch (err) {
        console.warn('[Updater] Gagal membaca versi aplikasi Tauri:', err);
      }
    }
  }

  get stage(): string {
    if (this.downloadProgress < 55) return 'Mengunduh paket pembaruan…';
    if (this.downloadProgress < 90) return 'Memasang pembaruan…';
    return 'Menyelesaikan…';
  }

  async checkForUpdates(silent = false): Promise<boolean> {
    if (this.isChecking) return this.hasUpdate;
    this.isChecking = true;
    this.errorMessage = null;

    try {
      await this.syncCurrentVersion();

      // 1. Fetch latest release info from backend API for full details (version name, description)
      try {
        const res = await fetch(`${API_BASE}/app/releases/latest`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.version) {
            this.latestVersion = data.version;
            if (data.version_name) this.versionName = data.version_name;
            if (data.description) this.changelog = parseChangelog(data.description);
          }
        }
      } catch (err) {
        console.warn('[Updater] Could not fetch latest release info from API:', err);
      }

      // 2. Check update via official Tauri plugin updater
      let updateAvailable = false;
      try {
        const update = await tauriCheck();
        if (update) {
          this.tauriUpdateObj = update;
          updateAvailable = true;
          this.latestVersion = update.version;
          if (update.body) {
            this.changelog = parseChangelog(update.body);
          }
        } else {
          this.tauriUpdateObj = null;
        }
      } catch (err) {
        console.warn('[Updater] Tauri updater check failed:', err);
        if (!this.isTauriRuntime() && this.latestVersion !== this.currentVersion && !this.isInstalled) {
          updateAvailable = true;
        } else if (this.isTauriRuntime() && !silent) {
          this.errorMessage = err instanceof Error ? err.message : String(err);
          this.phase = 'error';
          this.modalOpen = true;
          return false;
        }
      }

      this.hasUpdate = updateAvailable;
      if (updateAvailable) {
        this.phase = 'available';
        if (!silent) {
          this.modalOpen = true;
        }
      } else {
        if (!silent) {
          this.phase = 'uptodate';
          this.modalOpen = true;
        }
      }

      return updateAvailable;
    } catch (err: any) {
      this.errorMessage = err?.message || 'Gagal memeriksa pembaruan';
      if (!silent) {
        this.phase = 'error';
        this.modalOpen = true;
      }
      return false;
    } finally {
      this.isChecking = false;
    }
  }

  async startUpdate() {
    this.downloadProgress = 0;
    this.phase = 'loading';
    this.errorMessage = null;

    if (this.tauriUpdateObj) {
      try {
        let downloaded = 0;
        let contentLength = 0;

        await this.tauriUpdateObj.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength || 1;
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              if (contentLength > 0) {
                this.downloadProgress = Math.min(95, Math.floor((downloaded / contentLength) * 95));
              }
              break;
            case 'Finished':
              this.downloadProgress = 100;
              break;
          }
        });

        this.downloadProgress = 100;
        this.isInstalled = true;
        this.currentVersion = this.latestVersion;
        this.hasUpdate = false;

        // Give a short visual completion pause, then relaunch app
        setTimeout(async () => {
          try {
            await relaunch();
          } catch (e) {
            console.warn('[Updater] Relaunching error:', e);
            this.phase = 'uptodate';
          }
        }, 1200);

        return;
      } catch (err: any) {
        console.error('[Updater] Download & install failed:', err);
        this.errorMessage =
          (err instanceof Error ? err.message : typeof err === 'string' ? err : err?.message) ||
          'Proses update gagal';
        this.phase = 'error';
        return;
      }
    }

    // Pada runtime Tauri asli tanpa objek update valid, jangan jalankan simulasi palsu
    if (this.isTauriRuntime()) {
      this.errorMessage = 'Paket pembaruan belum siap atau gagal diverifikasi dari server.';
      this.phase = 'error';
      return;
    }

    // Simulated progress hanya untuk mode preview browser non-Tauri
    if (this.simTimer) clearInterval(this.simTimer);
    this.simTimer = setInterval(() => {
      this.downloadProgress = Math.min(100, this.downloadProgress + 1.2 + Math.random() * 2.8);
      if (this.downloadProgress >= 100) {
        clearInterval(this.simTimer);
        this.simTimer = null;
        setTimeout(() => {
          this.isInstalled = true;
          this.currentVersion = this.latestVersion;
          this.hasUpdate = false;
          this.phase = 'uptodate';
        }, 600);
      }
    }, 110);
  }

  openModal() {
    if (this.errorMessage && this.phase === 'error') {
      this.modalOpen = true;
      return;
    }
    this.phase = this.isInstalled || !this.hasUpdate ? 'uptodate' : 'available';
    this.modalOpen = true;
  }

  closeModal() {
    if (this.phase === 'loading') return; // Do not close while downloading/installing
    this.modalOpen = false;
  }
}

export const updaterStore = new UpdaterStore();
