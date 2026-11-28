import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getAssetCacheMeta } from '$lib/db/local';
import {
  collectDesignBlockAssetUrls,
  loadCustomFonts,
  migrateLegacyConfigToDesignBlocks,
  normalizeSessionScreenBlocks,
  type DesignBlocksDocument,
} from '@potohub/booth-ui';

export interface TextStyle {
  size: 'Kecil' | 'Sedang' | 'Besar';
  font: 'Sans Serif' | 'Serif' | 'Monospace';
  color: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  logoUrl: string;
}

export interface StoreCategory {
  id: string;
  name: string;
  basePrice: number;
  extraPrintPrice: number;
  color: string;
}

export interface ElementPosition {
  screenKey: string;
  elementKey: string;
  xPercent: number;
  yPercent: number;
}

export interface ElementStyle {
  screenKey: string;
  elementKey: string;
  bgColor: string | null;
  textColor: string | null;
  fontSize: 'Kecil' | 'Sedang' | 'Besar' | null;
  fontFamily: 'Sans Serif' | 'Serif' | 'Monospace' | null;
  label: string | null;
}

export interface StepStyle {
  step: string;
  bgType: 'color' | 'gradient' | 'image' | 'none';
  bgValue: string | null;
  bgBlur?: string | null;
}

export interface BoothUIConfig {
  boothName: string;
  tagline: string;
  templateVariant: 'v1' | 'v2' | 'v3' | 'custom';
  primaryColor: string;
  showStepIndicator: boolean;
  paymentMethods: PaymentMethod[];
  frameCategories: string[];
  frameTitleStyle: TextStyle;
  tutorialImageUrl: string;
  boothNameStyle: TextStyle;
  taglineStyle: TextStyle;
  paymentTitleStyle: TextStyle;
  categories: StoreCategory[];
  elementPositions: ElementPosition[];
  elementStyles: ElementStyle[];
  stepStyles: StepStyle[];
  layoutVersion: number;
  layoutSchemaVersion: number;
  designBlocks: DesignBlocksDocument | null;
}

export const DEFAULT_TEXT_STYLE: TextStyle = { size: 'Sedang', font: 'Sans Serif', color: '#ffffff' };

export const DEFAULT_CATEGORIES: StoreCategory[] = [
  { id: 'basic', name: 'Basic Frames', basePrice: 35000, extraPrintPrice: 10000, color: '#dbeafe' },
  { id: 'premium', name: 'Premium Seasonal', basePrice: 75000, extraPrintPrice: 20000, color: '#fce7f3' },
  { id: 'wedding', name: 'Wedding Series', basePrice: 120000, extraPrintPrice: 35000, color: '#d1fae5' },
  { id: 'birthday', name: 'Birthday Bash', basePrice: 55000, extraPrintPrice: 15000, color: '#ede9fe' }
];

export const DEFAULT_UI_CONFIG: BoothUIConfig = {
  boothName: 'OUR PICS',
  tagline: 'tell a story',
  templateVariant: 'v1',
  primaryColor: '#f5d9cc',
  showStepIndicator: true,
  paymentMethods: [
    { id: '1', name: 'Gopay', logoUrl: '' },
    { id: '2', name: 'BNI', logoUrl: '' },
    { id: '3', name: 'BRI', logoUrl: '' }
  ],
  frameCategories: ['VINTAGE', 'BASIC', 'THEMATIC', 'COLLAB'],
  frameTitleStyle: { size: 'Sedang', font: 'Serif', color: '#ffffff' },
  tutorialImageUrl: '',
  boothNameStyle: { ...DEFAULT_TEXT_STYLE, size: 'Besar', font: 'Serif', color: '#ffffff' },
  taglineStyle: { ...DEFAULT_TEXT_STYLE, size: 'Kecil', font: 'Serif', color: 'rgba(255,255,255,0.8)' },
  paymentTitleStyle: { ...DEFAULT_TEXT_STYLE, size: 'Sedang', font: 'Serif', color: '#ffffff' },
  categories: DEFAULT_CATEGORIES,
  elementPositions: [],
  elementStyles: [],
  stepStyles: [],
  layoutVersion: 1,
  layoutSchemaVersion: 1,
  designBlocks: null,
};

export function isLocalAssetUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('asset:') ||
    url.startsWith('http://asset.localhost') ||
    url.startsWith('https://asset.localhost') ||
    url.startsWith('tauri://')
  );
}

class UIConfigStore {
  config = $state<BoothUIConfig>({ ...DEFAULT_UI_CONFIG });
  boothId = $state<string>('default');
  resolvedBackgrounds = $state<Record<string, string>>({});
  private decodedAssetUrls = new Set<string>();
  private resolvePromise: Promise<void> | null = null;
  private resolveNeedsRerun = false;

  get templateVariant() {
    return this.config.templateVariant;
  }

  get resolvedDesignBlocks(): DesignBlocksDocument {
    const fallback = migrateLegacyConfigToDesignBlocks({
      template_variant: this.config.templateVariant,
      booth_name: this.config.boothName,
      tagline: this.config.tagline,
      show_step_indicator: this.config.showStepIndicator,
      tutorial_image_url: this.tutorialImageUrl || this.config.tutorialImageUrl,
      primary_color: this.config.primaryColor,
      text_styles: [
        {
          element_key: 'booth_name',
          font_size: this.config.boothNameStyle.size,
          font_family: this.config.boothNameStyle.font,
          color: this.config.boothNameStyle.color,
        },
        {
          element_key: 'tagline',
          font_size: this.config.taglineStyle.size,
          font_family: this.config.taglineStyle.font,
          color: this.config.taglineStyle.color,
        },
        {
          element_key: 'frame_title',
          font_size: this.config.frameTitleStyle.size,
          font_family: this.config.frameTitleStyle.font,
          color: this.config.frameTitleStyle.color,
        },
      ],
      element_positions: (this.config.elementPositions ?? []).map((p) => ({
        screen_key: p.screenKey,
        element_key: p.elementKey,
        x_percent: p.xPercent,
        y_percent: p.yPercent,
      })),
      element_styles: (this.config.elementStyles ?? []).map((s) => ({
        screen_key: s.screenKey,
        element_key: s.elementKey,
        bg_color: s.bgColor,
        text_color: s.textColor,
        font_size: s.fontSize,
        font_family: s.fontFamily,
        label: s.label,
      })),
      step_styles: (this.config.stepStyles ?? []).map((s) => ({
        step: s.step,
        bg_type: s.bgType,
        bg_value: s.bgValue,
        bg_blur: s.bgBlur,
      })),
    });

    const rawDoc = this.config.designBlocks;
    if (!rawDoc || !rawDoc.screens) return normalizeSessionScreenBlocks(fallback);

    return normalizeSessionScreenBlocks({
      ...fallback,
      ...rawDoc,
      screens: {
        ...fallback.screens,
        ...rawDoc.screens,
      },
    });
  }

  get tutorialImageUrl(): string {
    const raw = this.config.tutorialImageUrl;
    if (!raw) return '';
    return this.resolvedBackgrounds[raw] || raw;
  }

  getTutorialImageUrl(): string {
    return this.tutorialImageUrl;
  }

  private decodedImageRefs = new Map<string, HTMLImageElement>();

  isAssetDecoded(url: string | null | undefined): boolean {
    if (!url) return false;
    const resolved = this.resolveAssetUrl(url);
    return this.decodedAssetUrls.has(url) || this.decodedAssetUrls.has(resolved);
  }

  private isImageAssetUrl(url: string): boolean {
    if (!url) return false;
    const clean = url.split(/[?#]/)[0].toLowerCase();
    if (
      clean.endsWith('.mp4') ||
      clean.endsWith('.webm') ||
      clean.endsWith('.woff2') ||
      clean.endsWith('.woff') ||
      clean.endsWith('.ttf') ||
      clean.endsWith('.otf')
    ) {
      return false;
    }
    return true;
  }

  private async preloadSingleImage(url: string): Promise<void> {
    if (typeof window === 'undefined' || typeof Image === 'undefined') return;
    if (!url || !this.isImageAssetUrl(url)) return;
    if (this.decodedAssetUrls.has(url)) return;

    await new Promise<void>((resolve) => {
      const img = new Image();
      img.decoding = 'sync';
      img.src = url;
      const done = () => {
        this.decodedAssetUrls.add(url);
        if (this.decodedImageRefs.size < 80) {
          this.decodedImageRefs.set(url, img);
        }
        resolve();
      };
      if (typeof img.decode === 'function') {
        img.decode().then(done).catch(() => {
          if (img.complete) done();
          else {
            img.onload = done;
            img.onerror = () => resolve();
          }
        });
      } else if (img.complete) {
        done();
      } else {
        img.onload = done;
        img.onerror = () => resolve();
      }
    });
  }

  async preloadImages(urls: Iterable<string>): Promise<void> {
    const list = [...new Set([...urls].filter((u) => Boolean(u) && this.isImageAssetUrl(u)))];
    if (list.length === 0) return;
    await Promise.allSettled(list.map((u) => this.preloadSingleImage(u)));
  }

  private persistResolvedAssetsMap() {
    if (typeof localStorage === 'undefined') return;
    try {
      const compact: Record<string, string> = {};
      for (const [k, v] of Object.entries(this.resolvedBackgrounds)) {
        if (v && (v.startsWith('asset:') || v.startsWith('http://asset.localhost') || v.startsWith('https://asset.localhost'))) {
          compact[k] = v;
        }
      }
      localStorage.setItem(`potohub_resolved_assets_${this.boothId}`, JSON.stringify(compact));
    } catch {}
  }

  private loadResolvedAssetsMap() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(`potohub_resolved_assets_${this.boothId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.resolvedBackgrounds = { ...parsed, ...this.resolvedBackgrounds };
      }
    } catch {}
  }

  setResolvedBackground(url: string, resolvedUrl: string) {
    this.resolvedBackgrounds[url] = resolvedUrl;
    this.persistResolvedAssetsMap();
    if (resolvedUrl && isLocalAssetUrl(resolvedUrl)) {
      void this.preloadSingleImage(resolvedUrl);
    }
  }

  resolveAssetUrl(url: string | null | undefined): string {
    if (!url) return '';
    return this.resolvedBackgrounds[url] || url;
  }

  private collectStartAssetUrls(): string[] {
    const urls = new Set<string>();
    const startImg = this.getStepImageSrc('start');
    if (startImg) urls.add(startImg);
    const startScreen = this.resolvedDesignBlocks.screens?.start;
    if (startScreen?.background?.value) {
      const val = startScreen.background.value;
      if (startScreen.background.type === 'image' || val.startsWith('http://') || val.startsWith('https://') || isLocalAssetUrl(val)) {
        urls.add(this.resolveAssetUrl(val));
      }
    }
    for (const blk of startScreen?.blocks ?? []) {
      const imgUrl = blk.props?.imageUrl;
      if (typeof imgUrl === 'string' && imgUrl) {
        urls.add(this.resolveAssetUrl(imgUrl));
      }
    }
    return [...urls];
  }

  async preloadStartAssets(): Promise<void> {
    const localUrls = this.collectStartAssetUrls().filter((u) => isLocalAssetUrl(u));
    await this.preloadImages(localUrls);
  }

  async resolveCachedAssets(): Promise<void> {
    if (this.resolvePromise) {
      this.resolveNeedsRerun = true;
      return this.resolvePromise;
    }

    this.resolvePromise = (async () => {
      do {
        this.resolveNeedsRerun = false;
        const urlsToResolve = new Set<string>();
        for (const s of this.config.stepStyles ?? []) {
          if (s.bgType === 'image' && s.bgValue) urlsToResolve.add(s.bgValue);
        }
        if (this.config.tutorialImageUrl) {
          urlsToResolve.add(this.config.tutorialImageUrl);
        }
        for (const p of this.config.paymentMethods ?? []) {
          if (p.logoUrl) urlsToResolve.add(p.logoUrl);
        }
        for (const u of collectDesignBlockAssetUrls(this.resolvedDesignBlocks)) {
          urlsToResolve.add(u);
        }

        const targets = [...urlsToResolve].filter((rawUrl) => rawUrl && !isLocalAssetUrl(rawUrl));
        let changed = false;

        await Promise.allSettled(
          targets.map(async (rawUrl) => {
            try {
              const meta = await getAssetCacheMeta(rawUrl);
              if (meta) {
                const filePath = await invoke<string | null>('get_cached_asset_path', {
                  cacheKey: meta.cache_key,
                });
                if (filePath) {
                  const localUrl = convertFileSrc(filePath);
                  if (this.resolvedBackgrounds[rawUrl] !== localUrl) {
                    this.resolvedBackgrounds[rawUrl] = localUrl;
                    changed = true;
                  }
                } else {
                  const dataUrl = await invoke<string | null>('read_cached_asset', {
                    cacheKey: meta.cache_key,
                  });
                  if (dataUrl && this.resolvedBackgrounds[rawUrl] !== dataUrl) {
                    this.resolvedBackgrounds[rawUrl] = dataUrl;
                    changed = true;
                  } else if (!dataUrl && this.resolvedBackgrounds[rawUrl]) {
                    delete this.resolvedBackgrounds[rawUrl];
                    changed = true;
                  }
                }
              } else if (this.resolvedBackgrounds[rawUrl]) {
                delete this.resolvedBackgrounds[rawUrl];
                changed = true;
              }
            } catch (e) {
              console.warn('[uiConfig] Gagal resolve asset cache:', e);
            }
          }),
        );

        if (changed) {
          this.persistResolvedAssetsMap();
        }

        // Pre-decode seluruh background/aset lokal di background agar perpindahan halaman Svelte instan 0ms tanpa blur/loading
        const resolvedUrlsToDecode = [...urlsToResolve]
          .map((u) => this.resolveAssetUrl(u))
          .filter((u) => Boolean(u) && isLocalAssetUrl(u));
        void this.preloadImages(resolvedUrlsToDecode);

        const customFonts = this.resolvedDesignBlocks.theme?.custom_fonts;
        if (customFonts && customFonts.length > 0) {
          void loadCustomFonts(customFonts, (u) => this.resolveAssetUrl(u));
        }
      } while (this.resolveNeedsRerun);
    })().finally(() => {
      this.resolvePromise = null;
    });

    return this.resolvePromise;
  }

  private resolveDesignScreenBg(step: string): { type: string; value: string | null; blur?: string | null } | null {
    const key =
      step === 'download'
        ? 'softfile'
        : step === 'package'
          ? 'payment'
          : step;
    const screen = (this.resolvedDesignBlocks?.screens as Record<string, { background?: { type: string; value: string | null; blur?: string | null } }> | undefined)?.[key];
    if (screen?.background && screen.background.type !== 'none' && screen.background.value) {
      return screen.background;
    }
    return null;
  }

  getStepBlur(step: string): string | null {
    const screenBg = this.resolveDesignScreenBg(step);
    if (screenBg?.blur) return screenBg.blur;
    const s = this.config.stepStyles?.find(
      (x) =>
        x.step === step ||
        (step === 'download' && x.step === 'softfile') ||
        (step === 'softfile' && x.step === 'download') ||
        (step === 'payment' && x.step === 'package') ||
        (step === 'package' && x.step === 'payment')
    );
    return s?.bgBlur ?? null;
  }

  getStepImageSrc(step: string): string | null {
    const screenBg = this.resolveDesignScreenBg(step);
    if (screenBg && (screenBg.type === 'image' || screenBg.value?.startsWith('http://') || screenBg.value?.startsWith('https://') || screenBg.value?.startsWith('data:') || screenBg.value?.startsWith('asset:') || screenBg.value?.startsWith('tauri://'))) {
      const val = this.resolvedBackgrounds[screenBg.value!] || screenBg.value!;
      if (val.startsWith('url(')) {
        const match = val.match(/url\(['"]?(.*?)['"]?\)/);
        return match ? match[1] : val;
      }
      return val;
    }
    const s = this.config.stepStyles?.find(
      (x) =>
        x.step === step ||
        (step === 'download' && x.step === 'softfile') ||
        (step === 'softfile' && x.step === 'download') ||
        (step === 'payment' && x.step === 'package') ||
        (step === 'package' && x.step === 'payment')
    );
    if (!s || s.bgType !== 'image' || !s.bgValue) return null;
    const val = this.resolvedBackgrounds[s.bgValue] || s.bgValue;
    if (val.startsWith('url(')) {
      const match = val.match(/url\(['"]?(.*?)['"]?\)/);
      return match ? match[1] : val;
    }
    return val;
  }

  getStepStyle(step: string): { background: string | null } {
    const screenBg = this.resolveDesignScreenBg(step);
    if (screenBg && screenBg.value) {
      if (screenBg.value.startsWith('url(')) {
        return { background: screenBg.value };
      }
      const val = this.resolvedBackgrounds[screenBg.value] || screenBg.value;
      if (
        screenBg.type === 'image' ||
        val.startsWith('http://') ||
        val.startsWith('https://') ||
        val.startsWith('data:') ||
        val.startsWith('blob:') ||
        val.startsWith('asset:') ||
        val.startsWith('tauri://')
      ) {
        return { background: `url("${val}") center / cover no-repeat` };
      }
      return { background: val };
    }
    const s = this.config.stepStyles?.find(
      (x) =>
        x.step === step ||
        (step === 'download' && x.step === 'softfile') ||
        (step === 'softfile' && x.step === 'download') ||
        (step === 'payment' && x.step === 'package') ||
        (step === 'package' && x.step === 'payment')
    );
    if (!s || s.bgType === 'none' || !s.bgValue) return { background: null };
    if (s.bgValue.startsWith('url(')) {
      return { background: s.bgValue };
    }
    const val = (s.bgValue && this.resolvedBackgrounds[s.bgValue]) ? this.resolvedBackgrounds[s.bgValue] : s.bgValue;
    if (
      s.bgType === 'image' ||
      val.startsWith('http://') ||
      val.startsWith('https://') ||
      val.startsWith('data:') ||
      val.startsWith('blob:') ||
      val.startsWith('asset:') ||
      val.startsWith('tauri://')
    ) {
      return { background: `url("${val}") center / cover no-repeat` };
    }
    return { background: val };
  }

  async getResolvedStepBackground(step: string): Promise<string | null> {
    const s = this.config.stepStyles?.find(
      (x) =>
        x.step === step ||
        (step === 'download' && x.step === 'softfile') ||
        (step === 'softfile' && x.step === 'download') ||
        (step === 'payment' && x.step === 'package') ||
        (step === 'package' && x.step === 'payment')
    );
    if (!s || s.bgType === 'none' || !s.bgValue) return null;
    if (this.resolvedBackgrounds[s.bgValue]) {
      return `url("${this.resolvedBackgrounds[s.bgValue]}") center / cover no-repeat`;
    }
    try {
      const meta = await getAssetCacheMeta(s.bgValue);
      if (meta) {
        const filePath = await invoke<string | null>('get_cached_asset_path', {
          cacheKey: meta.cache_key,
        });
        if (filePath) {
          const assetUrl = convertFileSrc(filePath);
          this.setResolvedBackground(s.bgValue, assetUrl);
          return `url("${assetUrl}") center / cover no-repeat`;
        }
        const dataUrl = await invoke<string | null>('read_cached_asset', {
          cacheKey: meta.cache_key,
        });
        if (dataUrl) {
          this.setResolvedBackground(s.bgValue, dataUrl);
          return `url("${dataUrl}") center / cover no-repeat`;
        }
      }
    } catch (e) {
      console.warn('[uiConfig] getResolvedStepBackground error:', e);
    }
    return this.getStepStyle(step).background;
  }

  getElementLabel(screenKey: string, elementKey: string, fallbackLabel: string): string {
    const s = this.config.elementStyles?.find(
      (x) => x.screenKey === screenKey && x.elementKey === elementKey
    );
    return s?.label ?? fallbackLabel;
  }

  getElementPosition(screenKey: string, elementKey: string, fallback: { x: number; y: number }) {
    const pos = this.config.elementPositions?.find(
      (p) => p.screenKey === screenKey && p.elementKey === elementKey
    );
    return { x: pos?.xPercent ?? fallback.x, y: pos?.yPercent ?? fallback.y };
  }

  getElementStyle(screenKey: string, elementKey: string, fallback: {
    bgColor: string; textColor: string; fontSize: TextStyle['size']; fontFamily: TextStyle['font'];
  }) {
    const s = this.config.elementStyles?.find(
      (x) => x.screenKey === screenKey && x.elementKey === elementKey
    );
    return {
      bgColor: s?.bgColor ?? fallback.bgColor,
      textColor: s?.textColor ?? fallback.textColor,
      fontSize: s?.fontSize ?? fallback.fontSize,
      fontFamily: s?.fontFamily ?? fallback.fontFamily,
    };
  }

  init(boothId: string = 'default') {
    this.boothId = boothId;
    this.load(false);
    void this.resolveCachedAssets();
  }

  async initAsync(boothId: string = 'default'): Promise<void> {
    this.boothId = boothId;
    this.load(false);

    const startUrls = this.collectStartAssetUrls();
    const allStartLocal = startUrls.every((u) => isLocalAssetUrl(u));

    if (allStartLocal) {
      // Cache lokal sudah tersedia sinkron dari localStorage -> decode gambar start screen,
      // lalu verifikasi & pre-decode aset halaman journey lain secara paralel di latar belakang.
      await this.preloadStartAssets();
      void this.resolveCachedAssets();
    } else {
      await this.resolveCachedAssets();
      await this.preloadStartAssets();
    }
  }

  load(triggerResolve = true) {
    try {
      const storedVariant = localStorage.getItem('ui_template_variant') as 'v1' | 'v2' | 'v3' | 'custom' | null;
      const raw = localStorage.getItem(`potohub_ui_config_${this.boothId}`);
      let parsedCfg = raw ? JSON.parse(raw) : {};
      
      if (storedVariant && ['v1', 'v2', 'v3', 'custom'].includes(storedVariant)) {
        parsedCfg.templateVariant = storedVariant;
      }

      const localAssetsRaw = localStorage.getItem(`potohub.ui-customize-local.${this.boothId}`) || localStorage.getItem(`potohub.ui-customize-local.default`);
      let localTutorialImg = '';
      if (localAssetsRaw) {
        try {
          localTutorialImg = JSON.parse(localAssetsRaw)?.tutorialImageUrl || '';
        } catch {}
      }
      if (!localTutorialImg) {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('potohub.ui-customize-local.')) {
              const item = localStorage.getItem(k);
              if (item) {
                const parsed = JSON.parse(item);
                if (parsed?.tutorialImageUrl) {
                  localTutorialImg = parsed.tutorialImageUrl;
                  break;
                }
              }
            }
          }
        } catch {}
      }
      if (localTutorialImg && !parsedCfg.tutorialImageUrl) {
        parsedCfg.tutorialImageUrl = localTutorialImg;
      }

      this.config = { ...DEFAULT_UI_CONFIG, ...parsedCfg };
    } catch {
      this.config = { ...DEFAULT_UI_CONFIG };
    }
    this.loadResolvedAssetsMap();
    if (triggerResolve) {
      void this.resolveCachedAssets();
    }
  }

  save(newCfg?: Partial<BoothUIConfig>) {
    if (newCfg) {
      this.config = { ...this.config, ...newCfg };
    }
    try {
      if (this.config.templateVariant) {
        localStorage.setItem('ui_template_variant', this.config.templateVariant);
      }
      localStorage.setItem(`potohub_ui_config_${this.boothId}`, JSON.stringify(this.config));
    } catch (e) {
      console.error('Failed to save UI config:', e);
    }
    void this.resolveCachedAssets();
  }
}

export const uiConfig = new UIConfigStore();
