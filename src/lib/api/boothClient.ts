import { uiConfig, DEFAULT_UI_CONFIG, type TextStyle, type BoothUIConfig } from '$lib/stores/uiConfig.svelte';

const API_BASE = (import.meta.env as Record<string, string>).VITE_API_BASE_URL ?? 'http://localhost:8080/api';

export interface PublicUIConfigResponse {
  booth_id: string;
  template_variant: 'v1' | 'v2' | 'v3';
  general: {
    booth_name: string;
    tagline: string | null;
  };
  text_styles: Array<{
    element_key: string;
    font_size: 'kecil' | 'sedang' | 'besar';
    font_family: 'sans_serif' | 'serif' | 'monospace';
    color: string;
  }>;
  payment_methods: Array<{
    id: string;
    name: string;
    logo_asset_id: string | null;
    position: number;
    is_active: boolean;
  }>;
  element_positions: Array<{
    screen_key: string;
    element_key: string;
    x_percent: number;
    y_percent: number;
  }>;
  step_styles?: Array<{
    step: string;
    bg_type: 'color' | 'gradient' | 'none';
    bg_value: string | null;
  }>;
}

const SIZE_MAP: Record<string, TextStyle['size']> = { kecil: 'Kecil', sedang: 'Sedang', besar: 'Besar' };
const FONT_MAP: Record<string, TextStyle['font']> = { sans_serif: 'Sans Serif', serif: 'Serif', monospace: 'Monospace' };

function mapTextStyle(
  styles: PublicUIConfigResponse['text_styles'],
  elementKey: string,
  fallback: TextStyle
): TextStyle {
  const s = styles.find((x) => x.element_key === elementKey);
  if (!s) return fallback;
  return { size: SIZE_MAP[s.font_size] ?? fallback.size, font: FONT_MAP[s.font_family] ?? fallback.font, color: s.color };
}

function mapPublicConfigToBoothUIConfig(data: PublicUIConfigResponse): Partial<BoothUIConfig> {
  return {
    boothName: data.general.booth_name,
    tagline: data.general.tagline ?? '',
    templateVariant: data.template_variant,
    primaryColor: DEFAULT_UI_CONFIG.primaryColor,
    boothNameStyle: mapTextStyle(data.text_styles, 'booth_name', DEFAULT_UI_CONFIG.boothNameStyle),
    taglineStyle: mapTextStyle(data.text_styles, 'tagline', DEFAULT_UI_CONFIG.taglineStyle),
    paymentTitleStyle: mapTextStyle(data.text_styles, 'payment_title', DEFAULT_UI_CONFIG.paymentTitleStyle),
    frameTitleStyle: mapTextStyle(data.text_styles, 'frame_title', DEFAULT_UI_CONFIG.frameTitleStyle),
    paymentMethods: data.payment_methods
      .filter((p) => p.is_active)
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.id, name: p.name, logoUrl: p.logo_asset_id ?? '' })),
    elementPositions: data.element_positions.map((p) => ({
      screenKey: p.screen_key,
      elementKey: p.element_key,
      xPercent: p.x_percent,
      yPercent: p.y_percent,
    })),
    stepStyles: (data.step_styles ?? []).map((s) => ({
      step: s.step,
      bgType: s.bg_type,
      bgValue: s.bg_value,
    })),
  };
}

export async function activateBooth(activationCode: string) {
  const res = await fetch(`${API_BASE}/booths/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activation_code: activationCode })
  });
  if (!res.ok) throw new Error('Aktivasi gagal');
  const data = await res.json();
  // data: { booth_id, name, branch_id, status, settings, ui_template_variant }
  localStorage.setItem('booth_id', data.booth_id);
  if (data.ui_template_variant) {
    localStorage.setItem('ui_template_variant', data.ui_template_variant);
    uiConfig.save({ templateVariant: data.ui_template_variant });
  }
  return data;
}

export async function fetchAndCacheUiConfig() {
  const boothId = localStorage.getItem('booth_id') || 'default';
  try {
    const res = await fetch(`${API_BASE}/booths/${boothId}/ui-customize/public`);
    if (!res.ok) {
      uiConfig.init(boothId);
      return;
    }
    const data: PublicUIConfigResponse = await res.json();
    uiConfig.save(mapPublicConfigToBoothUIConfig(data));
  } catch {
    // offline fallback to local cache / default v1
    uiConfig.init(boothId);
  }
}

export interface BoothCategory {
  id: string;
  name: string;
  base_price: number;
  extra_price: number;
  position: number;
  banner_url: string | null;
}

export interface BoothTemplate {
  id: string;
  category_id: string;
  name: string;
  width: number;
  height: number;
  paper_size: string;
  frame_image_url: string | null;
  design_data: Array<{ x: number; y: number; w: number; h: number }>;
  is_active: boolean;
}

export async function fetchCategories(boothId: string): Promise<BoothCategory[]> {
  const res = await fetch(`${API_BASE}/booths/${boothId}/categories`);
  if (!res.ok) throw new Error('Gagal memuat kategori');
  return res.json();
}

export async function fetchTemplates(boothId: string, categoryId?: string): Promise<BoothTemplate[]> {
  const qs = categoryId ? `?category_id=${categoryId}&is_active=true` : '?is_active=true';
  const res = await fetch(`${API_BASE}/booths/${boothId}/templates${qs}`);
  if (!res.ok) throw new Error('Gagal memuat template');
  return res.json();
}

export async function syncBoothSettings() {
  const boothId = localStorage.getItem('booth_id') || 'default';
  try {
    const res = await fetch(`${API_BASE}/booths/${boothId}/settings/sync`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Sync gagal');
    const data = await res.json();
    await fetchAndCacheUiConfig();
    return data;
  } catch {
    // Graceful offline mock sync timestamp
    const now = new Date().toLocaleTimeString();
    return { booth_id: boothId, last_sync_at: now, settings: {} };
  }
}
