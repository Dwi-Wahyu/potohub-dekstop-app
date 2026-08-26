export interface BoothCfg {
  pin: string;
  paperThreshold: number;
  paperCount: number;
  countdownSecs: number;
  photoFilter: boolean;
  filterBW: boolean;
  filterSepia: boolean;
  filterVivid: boolean;
  filterRetro: boolean;
  filterCool: boolean;
  cameraRotate: string;
  mirrorOn: boolean;
  flipVertical: boolean;
  paymentPage: boolean;
  cameraMode: 'usb' | 'webcam' | 'demo';
  bootScreen: 'welcome' | 'pin';
}

export const DEFAULT_CFG: BoothCfg = {
  pin: '1234',
  paperThreshold: 20,
  paperCount: 100,
  countdownSecs: 5,
  photoFilter: true,
  filterBW: true,
  filterSepia: true,
  filterVivid: false,
  filterRetro: true,
  filterCool: false,
  cameraRotate: '0° (Default)',
  mirrorOn: true,
  flipVertical: false,
  paymentPage: true,
  cameraMode: 'usb',
  bootScreen: 'welcome'
};

class BoothConfigStore {
  config = $state<BoothCfg>({ ...DEFAULT_CFG });
  boothId = $state<string>('default');

  init(boothId: string = 'default') {
    this.boothId = boothId;
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(`booth_settings_${this.boothId}`);
      if (raw) {
        this.config = { ...DEFAULT_CFG, ...JSON.parse(raw) };
      } else {
        this.config = { ...DEFAULT_CFG };
      }
    } catch {
      this.config = { ...DEFAULT_CFG };
    }
  }

  save(newCfg?: Partial<BoothCfg>) {
    if (newCfg) {
      this.config = { ...this.config, ...newCfg };
    }
    try {
      localStorage.setItem(`booth_settings_${this.boothId}`, JSON.stringify(this.config));
    } catch (e) {
      console.error('Failed to save booth config:', e);
    }
  }

  reset() {
    this.config = { ...DEFAULT_CFG };
    this.save();
  }
}

export const boothConfig = new BoothConfigStore();
