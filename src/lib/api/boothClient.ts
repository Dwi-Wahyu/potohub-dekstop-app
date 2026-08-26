import { uiConfig, DEFAULT_UI_CONFIG, type TextStyle, type BoothUIConfig } from '$lib/stores/uiConfig.svelte';
import { boothConfig } from '$lib/stores/boothConfig.svelte';
import { getActivation, saveActivation } from '$lib/db/local';

const envs = import.meta.env as Record<string, string>;
const rawBase = envs.VITE_API_BASE_URL || envs.PUBLIC_API_BASE_URL || 'http://localhost:8080/api';
const API_BASE = rawBase.replace(/\/+$/, '');

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

export function isValidUUID(str: string | null | undefined): boolean {
  if (!str) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
}

export async function getActiveBoothId(): Promise<string | null> {
  const activation = await getActivation();
  return activation?.boothId ?? null;
}

export async function activateBooth(activationCode: string) {
  const res = await fetch(`${API_BASE}/booths/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activation_code: activationCode })
  });
  if (!res.ok) {
    const msg = res.status === 404 ? 'Kode aktivasi tidak valid.' : 'Aktivasi gagal, coba lagi.';
    throw new Error(msg);
  }
  const json = await res.json();
  const data = json.data ?? json;

  await saveActivation({
    boothId: data.booth_id,
    activationCode,
    boothName: data.name ?? data.booth_name ?? 'Booth',
    organizationId: data.organization_id ?? null,
    templateVariant: data.ui_template_variant ?? 'v1',
    activatedAt: new Date().toISOString()
  });

  uiConfig.save({ templateVariant: data.ui_template_variant ?? 'v1' });
  return data;
}

export async function fetchAndCacheUiConfig() {
  const boothId = await getActiveBoothId();
  if (!boothId || !isValidUUID(boothId)) {
    uiConfig.init('default');
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/booths/${boothId}/ui-customize/public`);
    if (!res.ok) {
      uiConfig.init(boothId);
      return;
    }
    const json = await res.json();
    const data: PublicUIConfigResponse = json.data ?? json;
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

export async function fetchCategories(boothId?: string): Promise<BoothCategory[]> {
  const targetBoothId = boothId || (await getActiveBoothId());
  if (!targetBoothId || !isValidUUID(targetBoothId)) {
    throw new Error('Booth belum teraktivasi (ID tidak valid)');
  }
  const res = await fetch(`${API_BASE}/booths/${targetBoothId}/categories`);
  if (!res.ok) throw new Error('Gagal memuat kategori');
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? json.categories ?? []);
}

export async function fetchTemplates(boothId?: string, categoryId?: string): Promise<BoothTemplate[]> {
  const targetBoothId = boothId || (await getActiveBoothId());
  if (!targetBoothId || !isValidUUID(targetBoothId)) {
    throw new Error('Booth belum teraktivasi (ID tidak valid)');
  }
  const qs = categoryId ? `?category_id=${categoryId}&is_active=true` : '?is_active=true';
  const res = await fetch(`${API_BASE}/booths/${targetBoothId}/templates${qs}`);
  if (!res.ok) throw new Error('Gagal memuat template');
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? json.templates ?? []);
}

const CAMERA_ROTATE_MAP: Record<number, string> = {
  0: '0° (Default)',
  90: '90° CW',
  180: '180°',
  270: '90° CCW'
};

function applyRemoteSettings(settings: Record<string, any>) {
  const general = settings?.general ?? {};
  const timer = settings?.timer ?? {};
  boothConfig.save({
    pin: general.pin ?? boothConfig.config.pin,
    cameraRotate: CAMERA_ROTATE_MAP[general.camera_rotate] ?? boothConfig.config.cameraRotate,
    mirrorOn: general.mirror ?? boothConfig.config.mirrorOn,
    paymentPage: general.payment_page ?? boothConfig.config.paymentPage,
    photoFilter: general.photo_filter ?? boothConfig.config.photoFilter,
    countdownSecs: timer.first_countdown_time ?? boothConfig.config.countdownSecs
  });
}

export async function syncBoothSettings() {
  const boothId = await getActiveBoothId();
  if (!boothId) throw new Error('Booth belum teraktivasi.');
  try {
    const res = await fetch(`${API_BASE}/booths/${boothId}/settings/sync`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Sync gagal');
    const data = await res.json();
    applyRemoteSettings(data.settings ?? {});
    await fetchAndCacheUiConfig();
    return data;
  } catch (e) {
    throw e instanceof Error ? e : new Error('Sync gagal');
  }
}
