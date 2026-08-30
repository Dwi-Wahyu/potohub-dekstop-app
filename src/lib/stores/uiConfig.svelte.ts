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
  stepStyles: []
};

class UIConfigStore {
  config = $state<BoothUIConfig>({ ...DEFAULT_UI_CONFIG });
  boothId = $state<string>('default');

  get templateVariant() {
    return this.config.templateVariant;
  }

  getStepStyle(step: string): { background: string | null } {
    const s = this.config.stepStyles?.find((x) => x.step === step);
    if (!s || s.bgType === 'none' || !s.bgValue) return { background: null };
    if (s.bgType === 'image' || s.bgValue.startsWith('http') || s.bgValue.startsWith('data:')) {
      return { background: `url("${s.bgValue}") center / cover no-repeat` };
    }
    return { background: s.bgValue };
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
    this.load();
  }

  load() {
    try {
      const storedVariant = localStorage.getItem('ui_template_variant') as 'v1' | 'v2' | 'v3' | 'custom' | null;
      const raw = localStorage.getItem(`potohub_ui_config_${this.boothId}`);
      let parsedCfg = raw ? JSON.parse(raw) : {};
      
      if (storedVariant && ['v1', 'v2', 'v3', 'custom'].includes(storedVariant)) {
        parsedCfg.templateVariant = storedVariant;
      }

      this.config = { ...DEFAULT_UI_CONFIG, ...parsedCfg };
    } catch {
      this.config = { ...DEFAULT_UI_CONFIG };
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
  }
}

export const uiConfig = new UIConfigStore();
