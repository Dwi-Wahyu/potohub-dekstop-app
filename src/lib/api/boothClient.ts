import {
  uiConfig,
  DEFAULT_UI_CONFIG,
  type TextStyle,
  type BoothUIConfig,
} from "$lib/stores/uiConfig.svelte";
import { boothConfig } from "$lib/stores/boothConfig.svelte";
import { getActivation, saveActivation } from "$lib/db/local";
import { cachedFetch, writeApiCache } from "$lib/utils/offlineCache";
import { prefetchBoothAssets } from "./prefetch";

const envs = import.meta.env as Record<string, string>;
const rawBase =
  envs.VITE_API_BASE_URL ||
  envs.PUBLIC_API_BASE_URL ||
  "http://localhost:8080/api";
const API_BASE = rawBase.replace(/\/+$/, "");

export interface PublicUIConfigResponse {
  booth_id: string;
  template_variant: "v1" | "v2" | "v3" | "custom";
  general: {
    booth_name: string;
    tagline: string | null;
    show_step_indicator: boolean;
    tutorial_asset_id?: string | null;
    tutorial_image_url?: string | null;
  };
  text_styles: Array<{
    element_key: string;
    font_size: "kecil" | "sedang" | "besar";
    font_family: "sans_serif" | "serif" | "monospace";
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
  element_styles?: Array<{
    screen_key: string;
    element_key: string;
    bg_color: string | null;
    text_color: string | null;
    font_size: "kecil" | "sedang" | "besar" | null;
    font_family: "sans_serif" | "serif" | "monospace" | null;
    label: string | null;
  }>;
  step_styles?: Array<{
    step: string;
    bg_type: "color" | "gradient" | "image" | "none";
    bg_value: string | null;
  }>;
}

const SIZE_MAP: Record<string, TextStyle["size"]> = {
  kecil: "Kecil",
  sedang: "Sedang",
  besar: "Besar",
};
const FONT_MAP: Record<string, TextStyle["font"]> = {
  sans_serif: "Sans Serif",
  serif: "Serif",
  monospace: "Monospace",
};

function mapTextStyle(
  styles: PublicUIConfigResponse["text_styles"],
  elementKey: string,
  fallback: TextStyle,
): TextStyle {
  const s = styles.find((x) => x.element_key === elementKey);
  if (!s) return fallback;
  return {
    size: SIZE_MAP[s.font_size] ?? fallback.size,
    font: FONT_MAP[s.font_family] ?? fallback.font,
    color: s.color,
  };
}

function mapPublicConfigToBoothUIConfig(
  data: PublicUIConfigResponse,
): Partial<BoothUIConfig> {
  const tutorialImg =
    data.general.tutorial_image_url ||
    data.general.tutorial_asset_id ||
    uiConfig.config.tutorialImageUrl ||
    "";
  return {
    boothName: data.general.booth_name,
    tagline: data.general.tagline ?? "",
    showStepIndicator: data.general.show_step_indicator ?? true,
    templateVariant: data.template_variant,
    primaryColor: DEFAULT_UI_CONFIG.primaryColor,
    tutorialImageUrl: tutorialImg,
    boothNameStyle: mapTextStyle(
      data.text_styles,
      "booth_name",
      DEFAULT_UI_CONFIG.boothNameStyle,
    ),
    taglineStyle: mapTextStyle(
      data.text_styles,
      "tagline",
      DEFAULT_UI_CONFIG.taglineStyle,
    ),
    paymentTitleStyle: mapTextStyle(
      data.text_styles,
      "payment_title",
      DEFAULT_UI_CONFIG.paymentTitleStyle,
    ),
    frameTitleStyle: mapTextStyle(
      data.text_styles,
      "frame_title",
      DEFAULT_UI_CONFIG.frameTitleStyle,
    ),
    paymentMethods: data.payment_methods
      .filter((p) => p.is_active)
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.id, name: p.name, logoUrl: p.logo_asset_id ?? "" })),
    elementPositions: data.element_positions.map((p) => ({
      screenKey: p.screen_key,
      elementKey: p.element_key,
      xPercent: p.x_percent,
      yPercent: p.y_percent,
    })),
    elementStyles: (data.element_styles ?? []).map((s) => ({
      screenKey: s.screen_key,
      elementKey: s.element_key,
      bgColor: s.bg_color,
      textColor: s.text_color,
      fontSize: s.font_size ? SIZE_MAP[s.font_size] : null,
      fontFamily: s.font_family ? FONT_MAP[s.font_family] : null,
      label: s.label ?? null,
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
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    str,
  );
}

export async function getActiveBoothId(): Promise<string | null> {
  const activation = await getActivation();
  return activation?.boothId ?? null;
}

/**
 * Resolve boothId aktif untuk dipakai di layar manapun. Selalu pakai SQLite
 * activation record sebagai source of truth — JANGAN pernah pakai
 * localStorage.getItem('booth_id') (key ini tidak pernah di-set di codebase).
 * Throw eksplisit bila belum ada aktivasi, supaya caller wajib menangani
 * kondisi "booth belum aktivasi" alih-alih diam-diam pakai 'default'.
 */
export async function requireActiveBoothId(): Promise<string> {
  const boothId = await getActiveBoothId();
  if (!boothId || !isValidUUID(boothId)) {
    throw new Error(
      "Booth belum teraktivasi. Silakan aktivasi ulang booth ini.",
    );
  }
  return boothId;
}

export async function getAuthHeaders(
  contentType?: string,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  const activation = await getActivation();
  if (activation?.token) {
    headers["Authorization"] = `Bearer ${activation.token}`;
  }
  return headers;
}

export async function activateBooth(activationCode: string) {
  const res = await fetch(`${API_BASE}/booths/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activation_code: activationCode }),
  });
  if (!res.ok) {
    const msg =
      res.status === 404
        ? "Kode aktivasi tidak valid."
        : "Aktivasi gagal, coba lagi.";
    throw new Error(msg);
  }
  const json = await res.json();
  const data = json.data ?? json;

  await saveActivation({
    boothId: data.booth_id,
    activationCode,
    boothName: data.name ?? data.booth_name ?? "Booth",
    organizationId: data.organization_id ?? null,
    templateVariant: data.ui_template_variant ?? "v1",
    activatedAt: new Date().toISOString(),
    token: data.token ?? null,
  });

  uiConfig.save({ templateVariant: data.ui_template_variant ?? "v1" });
  return data;
}

export async function fetchAndCacheUiConfig() {
  const boothId = await getActiveBoothId();
  if (!boothId || !isValidUUID(boothId)) {
    uiConfig.init("default");
    return;
  }
  try {
    await cachedFetch(
      `uiConfig:${boothId}`,
      async () => {
        const res = await fetch(
          `${API_BASE}/booths/${boothId}/ui-customize/public`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const data: PublicUIConfigResponse = json.data ?? json;
        return mapPublicConfigToBoothUIConfig(data);
      },
      (partial) => uiConfig.save(partial),
    );
  } catch {
    // offline & tanpa cache → fallback ke local cache / default v1
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
  preview_image_url?: string | null;
  frame_image_url: string | null;
  design_data: Array<{
    id?: number;
    order?: number;
    layer?: number;
    x: number;
    y: number;
    w: number;
    h: number;
    rot?: number;
    isBackground?: boolean;
    imageUrl?: string;
    name?: string;
    camera?: number;
    isQr?: boolean;
  }>;
  is_active: boolean;
}

export async function fetchCategories(
  boothId?: string,
): Promise<BoothCategory[]> {
  const targetBoothId = boothId || (await getActiveBoothId());
  if (!targetBoothId || !isValidUUID(targetBoothId)) {
    throw new Error("Booth belum teraktivasi (ID tidak valid)");
  }
  const res = await fetch(`${API_BASE}/booths/${targetBoothId}/categories`, {
    headers: await getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Gagal memuat kategori");
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? json.categories ?? []);
}

export async function fetchTemplates(
  boothId?: string,
  categoryId?: string,
): Promise<BoothTemplate[]> {
  const targetBoothId = boothId || (await getActiveBoothId());
  if (!targetBoothId || !isValidUUID(targetBoothId)) {
    throw new Error("Booth belum teraktivasi (ID tidak valid)");
  }
  const qs = categoryId
    ? `?category_id=${categoryId}&is_active=true`
    : "?is_active=true";
  const res = await fetch(`${API_BASE}/booths/${targetBoothId}/templates${qs}`, {
    headers: await getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Gagal memuat template");
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? json.templates ?? []);
}

export interface BoothEmot {
  id: string;
  booth_id: string;
  name: string;
  emot_type: "emoji" | "image";
  emoji_text: string | null;
  file_url: string | null;
  category?: string | null;
  position?: number;
  is_active: boolean;
}

export async function fetchEmots(boothId?: string): Promise<BoothEmot[]> {
  const targetBoothId = boothId || (await getActiveBoothId());
  if (!targetBoothId || !isValidUUID(targetBoothId)) {
    return [];
  }
  try {
    const res = await fetch(`${API_BASE}/booths/${targetBoothId}/emots?is_active=true`, {
      headers: await getAuthHeaders(),
    });
    if (!res.ok) {
      console.warn(`[fetchEmots] Endpoint emots merespon status ${res.status}, beralih ke daftar emoji bawaan.`);
      return [];
    }
    const json = await res.json();
    return Array.isArray(json) ? json : (json.data ?? json.emots ?? []);
  } catch (err) {
    console.warn(`[fetchEmots] Gagal memuat emot remote, beralih ke daftar emoji bawaan:`, err);
    return [];
  }
}

export interface BoothBanner {
  id: string;
  organization_id: string;
  title: string;
  image_url: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  position: number;
  created_at?: string;
  updated_at?: string;
}

export async function fetchBanners(boothId?: string): Promise<BoothBanner[]> {
  const targetBoothId = boothId || (await getActiveBoothId());
  if (!targetBoothId || !isValidUUID(targetBoothId)) {
    throw new Error("Booth belum teraktivasi (ID tidak valid)");
  }

  const res = await fetch(`${API_BASE}/booths/${targetBoothId}/banners`, {
    headers: await getAuthHeaders(),
  });

  if (!res.ok) throw new Error("Gagal memuat banner");
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? json.banners ?? []);
}

const CAMERA_ROTATE_MAP: Record<number, string> = {
  0: "0° (Default)",
  90: "90° CW",
  180: "180°",
  270: "90° CCW",
};

function applyRemoteSettings(settings: Record<string, any>) {
  const general = settings?.general ?? {};
  const timer = settings?.timer ?? {};
  const softfile = settings?.softfile ?? {};

  const localSaved = typeof localStorage !== 'undefined' ? localStorage.getItem(`booth_settings_${boothConfig.boothId}`) : null;
  let hasLocalConfig = false;
  if (localSaved) {
    try {
      const parsed = JSON.parse(localSaved);
      if (parsed && typeof parsed.countdownSecs === 'number') {
        hasLocalConfig = true;
      }
    } catch {}
  }

  boothConfig.save({
    pin: general.pin ?? boothConfig.config.pin,
    cameraRotate:
      CAMERA_ROTATE_MAP[general.camera_rotate] ??
      boothConfig.config.cameraRotate,
    mirrorOn: general.mirror ?? boothConfig.config.mirrorOn,
    paymentPage: general.payment_page ?? boothConfig.config.paymentPage,
    photoFilter: general.photo_filter ?? boothConfig.config.photoFilter,
    countdownSecs: hasLocalConfig
      ? boothConfig.config.countdownSecs
      : (timer.first_countdown_time ?? boothConfig.config.countdownSecs),
    emailEnabled: softfile.email_enabled ?? boothConfig.config.emailEnabled ?? true,
    whatsappEnabled: softfile.whatsapp_enabled ?? boothConfig.config.whatsappEnabled ?? true,
  });
}

export async function syncBoothSettings() {
  const boothId = await getActiveBoothId();
  if (!boothId) throw new Error("Booth belum teraktivasi.");
  try {
    const res = await fetch(`${API_BASE}/booths/${boothId}/settings/sync`, {
      method: "POST",
      headers: await getAuthHeaders(),
    });
    if (!res.ok) throw new Error("Sync gagal");
    const data = await res.json();
    applyRemoteSettings(data.settings ?? {});
    await fetchAndCacheUiConfig();
    // Fetch & cache banners untuk booth
    try {
      const banners = await fetchBanners(boothId);
      await writeApiCache(`banners:${boothId}`, banners);
    } catch (e) {
      console.warn("Sync banners gagal:", e);
    }
    // Prefetch aset booth di background (tidak memblokir sync)
    void prefetchBoothAssets(boothId).catch((e) =>
      console.warn("Prefetch aset booth gagal:", e),
    );
    return data;
  } catch (e) {
    throw e instanceof Error ? e : new Error("Sync gagal");
  }
}

export interface CreateSessionResponse {
  id?: string;
  session_id: string;
  order_id: string;
  session_code?: string;
  total_price: number | string;
  status: string;
  qris_url?: string | null;
}

export async function createTransactionSession(
  boothId: string,
  categoryId?: string | null,
  totalPrint: number = 1,
  paymentMethod: string = "Cashless",
  frameId?: string | null,
): Promise<CreateSessionResponse> {
  let method = "Cashless";
  const pm = (paymentMethod || "").toLowerCase();
  if (pm.includes("ticket")) {
    method = "Ticket";
  } else if (pm.includes("cash") && !pm.includes("cashless")) {
    method = "Cash";
  } else if (pm.includes("voucher")) {
    method = "Voucher";
  } else {
    method = "Cashless";
  }

  const res = await fetch(`${API_BASE}/booths/${boothId}/transactions`, {
    method: "POST",
    headers: await getAuthHeaders("application/json"),
    body: JSON.stringify({
      category_id: categoryId || null,
      frame_id: frameId || null,
      total_print: totalPrint,
      payment_method: method,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("createTransactionSession failed:", res.status, errText);
    throw new Error(
      `Gagal membuat sesi transaksi: ${errText || res.statusText}`,
    );
  }
  const json = await res.json();
  const data = json.data ?? json;
  return {
    ...data,
    session_id: data.session_id || data.id,
  };
}

export type GalleryFileType = "photo" | "thumbnail" | "video" | "gif";

export function toPascalCaseMediaType(
  type: string,
): "Photo" | "Thumbnail" | "Video" | "Gif" {
  switch (type.toLowerCase()) {
    case "photo":
      return "Photo";
    case "thumbnail":
      return "Thumbnail";
    case "video":
      return "Video";
    case "gif":
    case "animation":
      return "Gif";
    default:
      return "Photo";
  }
}

export interface RequestUploadUrlResponse {
  upload_url: string;
  file_url: string;
  object_key: string;
  expires_in: number;
}

export async function requestUploadUrl(
  boothId: string,
  sessionId: string,
  fileType: GalleryFileType,
  fileExtension: string,
  contentType: string,
): Promise<RequestUploadUrlResponse> {
  const pascalType = toPascalCaseMediaType(fileType);
  const res = await fetch(`${API_BASE}/booths/${boothId}/gallery/upload-url`, {
    method: "POST",
    headers: await getAuthHeaders("application/json"),
    body: JSON.stringify({
      session_id: sessionId,
      file_type: pascalType,
      media_type: pascalType,
      file_extension: fileExtension,
      content_type: contentType,
    }),
  });
  if (!res.ok) {
    console.log("Error status : " + res.statusText);

    const errText = await res.text().catch(() => "");
    throw new Error(
      `Gagal request presigned upload URL: ${errText || res.statusText}`,
    );
  }

  const json = await res.json();

  console.log(json);

  const data = json.data ?? json;
  return {
    upload_url: data.upload_url,
    file_url: data.file_url || data.public_url || "",
    object_key: data.object_key || data.file_key || "",
    expires_in: data.expires_in || data.expires_in_secs || 900,
  };
}

/**
 * Upload 1 aset biner (foto/gif/video) ke R2 via presigned PUT, lalu register
 * metadata-nya ke database. Menerima Blob atau data:/blob: URL (akan dikonversi ke Blob).
 */
export async function uploadGalleryAsset(
  boothId: string,
  sessionId: string,
  fileType: GalleryFileType,
  blobOrDataUrl: Blob | string,
  fileExtension: string,
  contentType: string,
  width: number,
  height: number,
) {
  const blob =
    typeof blobOrDataUrl === "string"
      ? await (await fetch(blobOrDataUrl)).blob()
      : blobOrDataUrl;
  console.log(
    `[uploadGalleryAsset] ${fileType} size=${blob.size} bytes, session=${sessionId}`,
  );

  const { upload_url, file_url } = await requestUploadUrl(
    boothId,
    sessionId,
    fileType,
    fileExtension,
    contentType,
  );
  console.log(
    `[uploadGalleryAsset] presigned URL diterima untuk ${fileType}: ${file_url}`,
  );

  const putRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!putRes.ok) {
    const errBody = await putRes.text().catch(() => "");
    console.error(
      `[uploadGalleryAsset] PUT ke R2 gagal (status ${putRes.status}) untuk ${fileType}:`,
      errBody,
    );
    throw new Error(
      `Gagal PUT ${fileType} ke R2 (status ${putRes.status}): ${errBody}`,
    );
  }
  console.log(`[uploadGalleryAsset] PUT ke R2 sukses untuk ${fileType}`);

  return uploadSessionMedia(
    boothId,
    sessionId,
    file_url,
    fileType,
    width,
    height,
    blob.size,
  );
}

export async function uploadSessionMedia(
  boothId: string,
  sessionId: string,
  fileUrl: string,
  fileType: GalleryFileType | "animation" = "photo",
  width: number = 1200,
  height: number = 1800,
  fileSize: number = 0,
) {
  const pascalType = toPascalCaseMediaType(fileType);
  const res = await fetch(`${API_BASE}/booths/${boothId}/gallery/upload`, {
    method: "POST",
    headers: await getAuthHeaders("application/json"),
    body: JSON.stringify({
      session_id: sessionId,
      file_url: fileUrl,
      file_type: pascalType,
      media_type: pascalType,
      width,
      height,
      file_size: fileSize,
    }),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    console.error(
      `[uploadSessionMedia] Gagal daftar metadata (status ${res.status}) untuk session=${sessionId} type=${fileType}:`,
      bodyText,
    );
    throw new Error(
      `Gagal register metadata media (status ${res.status}): ${bodyText}`,
    );
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    console.error("[uploadSessionMedia] Response bukan JSON valid:", bodyText);
    throw new Error("Response register metadata media tidak valid");
  }
}

export interface RedeemQrTicketResponse {
  valid: boolean;
  success?: boolean;
  message: string;
  ticket?: {
    id: string;
    token: string;
    ticket_type: string;
    category_id: string | null;
    status: string;
    used: boolean;
  } | null;
}

export async function validateAndRedeemQrTicket(
  token: string,
  boothId?: string,
): Promise<RedeemQrTicketResponse> {
  const cleanToken = token.includes("token=")
    ? token.split("token=")[1].split("&")[0]
    : token.trim();
  const cleanBoothId = boothId && boothId.trim() !== "" ? boothId.trim() : null;

  const res = await fetch(`${API_BASE}/qr-tickets/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: cleanToken,
      booth_id: cleanBoothId,
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    throw new Error(
      errJson?.message || "Tiket QR tidak valid atau telah digunakan",
    );
  }

  const json = await res.json();
  const isValid = Boolean(json.valid ?? json.success);
  if (!isValid) {
    throw new Error(json.message || "Tiket QR tidak dapat digunakan");
  }

  return {
    ...json,
    valid: true,
    success: true,
  };
}
