export interface BoothCfg {
  pin: string;
  paperThreshold: number;
  paperCount: number;
  countdownSecs: number;
  firstCountdownSecs: number;
  bannerTimeSecs: number;
  procedureTimeSecs: number;
  paymentTimeSecs: number;
  photoSessionTimeSecs: number;
  endScreenTimeSecs: number;
  photoFilter: boolean;
  filterBW: boolean;
  filterSepia: boolean;
  filterVivid: boolean;
  filterRetro: boolean;
  filterCool: boolean;
  cameraRotate: string;
  mirrorOn: boolean;
  flipVertical: boolean;
  earlyPaymentPage: boolean;
  paymentPage: boolean;
  basePrice: number;
  skipPayment: boolean;
  cameraMode: 'usb' | 'webcam' | 'demo';
  bootScreen: 'welcome' | 'pin';
  liveviewClipPreSecs: number;
  liveviewClipPostSecs: number;
  enableLiveviewVideo: boolean;
  enableSessionGif: boolean;
  idleBannerTimeoutMins: number;
  enableIdleBanner: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}

export const DEFAULT_CFG: BoothCfg = {
  pin: '1234',
  paperThreshold: 20,
  paperCount: 100,
  countdownSecs: 3,
  firstCountdownSecs: 5,
  bannerTimeSecs: 10,
  procedureTimeSecs: 15,
  paymentTimeSecs: 120,
  photoSessionTimeSecs: 10,
  endScreenTimeSecs: 3,
  photoFilter: true,
  filterBW: true,
  filterSepia: true,
  filterVivid: false,
  filterRetro: true,
  filterCool: false,
  cameraRotate: '0° (Default)',
  mirrorOn: true,
  flipVertical: false,
  earlyPaymentPage: true,
  paymentPage: true,
  basePrice: 35000,
  skipPayment: false,
  cameraMode: 'usb',
  bootScreen: 'welcome',
  liveviewClipPreSecs: 2.5,
  liveviewClipPostSecs: 0.5,
  enableLiveviewVideo: true,
  enableSessionGif: true,
  idleBannerTimeoutMins: 2,
  enableIdleBanner: true,
  emailEnabled: true,
  whatsappEnabled: true,
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
        const parsed = JSON.parse(raw);
        const early = parsed.earlyPaymentPage ?? parsed.paymentPage ?? DEFAULT_CFG.earlyPaymentPage;
        const rawBase = parsed.basePrice ?? parsed.base_price;
        let baseVal = 0;
        if (rawBase !== undefined && rawBase !== null && !isNaN(Number(rawBase))) {
          baseVal = Number(rawBase);
        } else if (early) {
          baseVal = 35000;
        }
        this.config = {
          ...DEFAULT_CFG,
          ...parsed,
          earlyPaymentPage: !!early,
          paymentPage: !!early,
          basePrice: baseVal,
          skipPayment: parsed.skipPayment ?? false,
        };
      } else {
        this.config = { ...DEFAULT_CFG };
      }
    } catch {
      this.config = { ...DEFAULT_CFG };
    }
  }

  save(newCfg?: Partial<BoothCfg>) {
    if (newCfg) {
      if ('earlyPaymentPage' in newCfg && !('paymentPage' in newCfg)) {
        newCfg.paymentPage = newCfg.earlyPaymentPage;
      } else if ('paymentPage' in newCfg && !('earlyPaymentPage' in newCfg)) {
        newCfg.earlyPaymentPage = newCfg.paymentPage;
      }
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
