# Instruksi Perbaikan — Repo `desktop-app` (SvelteKit + Tauri)

**Konteks:** 1 dari 3 instruksi terpisah (admin-dashboard, api, desktop-app). Backend (`api`) sudah diverifikasi benar & lengkap — perbaikan di dokumen ini murni di sisi desktop app. Urutan pengerjaan di bawah ini **penting**: §1 adalah blocker untuk §2, karena §2 (posisi elemen) tidak akan pernah terlihat kalau §1 (mapping response) belum benar.

---

## 0. Jawaban untuk pertanyaan: apakah v1-v3 tetap mendukung customize manual elemen lain?

**Jawaban jujur: saat ini tidak, dan ini bukan cuma soal tombol Start.** Temuan konkret dari audit:

- `V1Landing.svelte`: tombol Start pakai `class="absolute bottom-[clamp(40px,8vh,88px)] left-1/2 -translate-x-1/2 ..."` — posisi **hardcoded lewat Tailwind class**, bukan dari data.
- `V3Start.svelte`: tombol Start malah **bukan `position: absolute` sama sekali** — posisinya ditentukan oleh flex layout container (`flex flex-col items-center`), bukan koordinat x/y. Supaya elemen ini bisa di-drag bebas, dia harus direstrukturisasi jadi `absolute` dulu.
- `BoothUIConfig` interface di `src/lib/stores/uiConfig.svelte.ts` **tidak punya field posisi elemen sama sekali** — tidak ada tempat untuk penyimpanan `elementPositions` bahkan sebelum bicara render.

**Implikasi:** menambah elemen draggable baru (tagline, logo, dst) **tidak otomatis** hanya karena backend sudah generik (`booth_ui_element_positions` per `screen_key`+`element_key`). Setiap komponen V1/V2/V3 yang elemennya mau di-drag harus:
1. Diubah ke `position: absolute` dengan koordinat dari data (kalau belum, seperti kasus V3), dan
2. Baca posisi dari store `uiConfig.config.elementPositions` (field baru, lihat §2) alih-alih hardcode class Tailwind.

Ini bukan pekerjaan sekali jalan untuk "semua elemen" — perlu dikerjakan **satu per satu, per-elemen, per-variant**. §2 di bawah adalah langkah pertama (tombol Start di V1) sebagai pola yang bisa direplikasi ke elemen/variant lain nanti.

---

## 1. 🔴 PRIORITAS TERTINGGI — Perbaiki mapping response `ui-customize/public`

### Masalah

`fetchAndCacheUiConfig()` di `src/lib/api/boothClient.ts` melempar response API **mentah-mentah** ke `uiConfig.save()`:

```ts
// SALAH — data dari API berbentuk nested snake_case (general.booth_name, text_styles[], dst),
// sedangkan BoothUIConfig di store berbentuk flat camelCase (boothName, tagline, dst).
// Spread ini TIDAK PERNAH benar-benar mengisi field yang dipakai V1/V2/V3 Landing.
const data = await res.json();
uiConfig.save(data);
```

Response asli dari `GET /booths/{boothId}/ui-customize/public` berbentuk:

```json
{
  "booth_id": "...",
  "template_variant": "v1",
  "general": { "booth_name": "OUR PICS", "tagline": "tell a story", "bg_type": "color", "bg_value": "#121212", ... },
  "text_styles": [{ "element_key": "booth_name", "font_size": "besar", "font_family": "serif", "color": "#ffffff" }, ...],
  "payment_methods": [{ "name": "Gopay", "logo_asset_id": "...", "position": 1, "is_active": true }, ...],
  "element_positions": [{ "screen_key": "start", "element_key": "start_button", "x_percent": 50, "y_percent": 82, ... }]
}
```

Sedangkan `BoothUIConfig` yang dipakai `V1Landing.svelte` dkk butuh bentuk flat (`config.boothName`, `config.tagline`, dst). **Akibatnya: hampir seluruh fitur UI Customize (nama booth, tagline, warna, text style, payment methods) kemungkinan besar TIDAK PERNAH benar-benar ter-apply ke booth client**, bukan cuma soal posisi elemen. Ini temuan penting di luar scope pertanyaan awal, tapi krusial untuk diperbaiki dulu.

### Perbaikan

**a. Tambahkan field `elementPositions` ke `BoothUIConfig`** di `src/lib/stores/uiConfig.svelte.ts`:

```ts
export interface ElementPosition {
  screenKey: string;
  elementKey: string;
  xPercent: number;
  yPercent: number;
}

export interface BoothUIConfig {
  boothName: string;
  tagline: string;
  templateVariant: 'v1' | 'v2' | 'v3';
  primaryColor: string;
  paymentMethods: PaymentMethod[];
  frameCategories: string[];
  frameTitleStyle: TextStyle;
  tutorialImageUrl: string;
  boothNameStyle: TextStyle;
  taglineStyle: TextStyle;
  paymentTitleStyle: TextStyle;
  categories: StoreCategory[];
  elementPositions: ElementPosition[]; // BARU
}
```

Tambahkan default kosong di `DEFAULT_UI_CONFIG`:

```ts
export const DEFAULT_UI_CONFIG: BoothUIConfig = {
  // ...field lain tetap sama
  elementPositions: [],
};
```

**b. Buat fungsi mapper baru** di `src/lib/api/boothClient.ts` (jangan modifikasi `BoothUIConfig` shape lebih jauh dari ini — cukup terjemahkan bentuknya):

```ts
interface PublicUIConfigResponse {
  booth_id: string;
  template_variant: 'v1' | 'v2' | 'v3';
  general: {
    booth_name: string;
    tagline: string | null;
    bg_type: 'color' | 'gradient' | 'image';
    bg_value: string | null;
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
    // CATATAN: backend belum punya field khusus "primaryColor" (warna aksen tombol) —
    // general.bg_value saat ini semantiknya WARNA BACKGROUND booth, bukan warna tombol.
    // Sementara fallback ke bg_value; perlu didiskusikan dengan tim apakah butuh
    // field baru `accent_color` di BoothUIConfig backend, atau primaryColor dihapus
    // dari desktop app dan diganti turunan dari palet lain. Jangan asal pakai
    // bg_value tanpa keputusan produk — beri tahu user, jangan tebak sendiri.
    primaryColor: data.general.bg_value ?? DEFAULT_UI_CONFIG.primaryColor,
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
  };
}
```

**c. Pakai mapper ini di `fetchAndCacheUiConfig`:**

```ts
export async function fetchAndCacheUiConfig() {
  const boothId = localStorage.getItem('booth_id') || 'default';
  try {
    const res = await fetch(`${API_BASE}/booths/${boothId}/ui-customize/public`);
    if (!res.ok) {
      uiConfig.init(boothId);
      return;
    }
    const data: PublicUIConfigResponse = await res.json();
    uiConfig.save(mapPublicConfigToBoothUIConfig(data)); // GANTI: uiConfig.save(data) -> pakai mapper
  } catch {
    uiConfig.init(boothId);
  }
}
```

---

## 2. Baca posisi Start Button dari `elementPositions` di `V1Landing.svelte`

Setelah §1 selesai, `uiConfig.config.elementPositions` sudah terisi dengan benar. Update `V1Landing.svelte`:

**a. Tambahkan helper untuk cari posisi elemen tertentu** (bisa taruh di `uiConfig.svelte.ts` sebagai method, supaya reusable untuk elemen lain nanti):

```ts
// di uiConfig.svelte.ts, dalam class UIConfigStore
getElementPosition(screenKey: string, elementKey: string, fallback: { x: number; y: number }) {
  const pos = this.config.elementPositions.find(
    (p) => p.screenKey === screenKey && p.elementKey === elementKey
  );
  return { x: pos?.xPercent ?? fallback.x, y: pos?.yPercent ?? fallback.y };
}
```

**b. Ganti class hardcoded pada tombol MULAI** di `V1Landing.svelte`:

```svelte
<script lang="ts">
  // ...kode lain tetap

  let startBtnPos = $derived(uiConfig.getElementPosition('start', 'start_button', { x: 50, y: 82 }));
</script>

<!-- GANTI dari class "absolute bottom-[clamp(...)] left-1/2 -translate-x-1/2" -->
<button
  onclick={onStart}
  style="
    background-color: {uiConfig.config.primaryColor};
    color: #1a0a00;
    box-shadow: 0 8px 32px {uiConfig.config.primaryColor}50, 0 2px 8px rgba(0,0,0,0.4);
    position: absolute;
    left: {startBtnPos.x}%;
    top: {startBtnPos.y}%;
    transform: translate(-50%, -50%);
  "
  class="px-9 py-2.5 rounded-full min-w-[120px] border-none font-['Plus_Jakarta_Sans',sans-serif] font-bold text-[clamp(11px,1vw,14px)] tracking-[0.2em] uppercase cursor-pointer touch-manipulation transition-transform duration-150 ease-out active:scale-95"
>
  MULAI
</button>
```

> Perhatikan: class Tailwind `absolute bottom-[...] left-1/2 -translate-x-1/2` dihapus dari `class`, diganti `position/left/top/transform` inline yang dinamis dari data. Sisa class (padding, warna teks, font, dst) tetap dipertahankan apa adanya.

**c. Untuk V2 dan V3:** cek dulu apakah tombol Start di sana juga `position: absolute` — kalau tidak (seperti `V3Start.svelte` yang pakai flex layout), elemen itu **belum bisa** menerima drag position tanpa restrukturisasi layout dulu. Jangan paksa terapkan `left/top` ke elemen yang masih di dalam flex container tanpa `position: absolute` — hasilnya tidak akan sesuai. Laporkan ke user kalau ini ditemukan, dan tanyakan apakah V2/V3 memang perlu didukung sekarang atau V1 dulu cukup untuk tahap ini (sesuai instruksi awal: "tahap pertama").

---

## 3. Kategori & Template masih hardcode — sambungkan ke API

### Masalah

`V1CategoryFrame.svelte` (dipakai lewat `V1Layout.svelte`) punya data statis:

```ts
const CATEGORIES = [
  { id: 'solo', label: 'Solo', sublabel: 'Sesi foto sendiri', price: 35000 },
  // ...
];
const FRAME_CONFIGS = [
  { id: 'strip2', label: 'Strip 2', cols: 1, rows: 2, accent: '#e2e8f0' },
  // ...
];
```

Padahal `GET /api/booths/{boothId}/categories` dan `GET /api/booths/{boothId}/templates` sudah tersedia dan dipakai di admin-dashboard.

### Perbaikan

**a. Tambahkan fungsi fetch di `src/lib/api/boothClient.ts`:**

```ts
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
```

**b. Update `V1CategoryFrame.svelte`** — ganti `const CATEGORIES`/`const FRAME_CONFIGS` jadi state yang di-fetch di `onMount`:

```ts
import { fetchCategories, fetchTemplates, type BoothCategory, type BoothTemplate } from '$lib/api/boothClient';

let categoriesData = $state<BoothCategory[]>([]);
let templatesData = $state<BoothTemplate[]>([]);
let loadingCatalog = $state(true);
let catalogError = $state('');

onMount(async () => {
  const boothId = localStorage.getItem('booth_id') || 'default';
  try {
    categoriesData = await fetchCategories(boothId);
    templatesData = await fetchTemplates(boothId);
    if (categoriesData[0]) categoryId = categoriesData[0].id;
  } catch (err) {
    catalogError = 'Gagal memuat katalog. Periksa koneksi ke server.';
  } finally {
    loadingCatalog = false;
  }
  // ...kode onMount lain yang sudah ada (cameraStore.startLiveview, dst) tetap di sini
});

let visibleTemplatesForCategory = $derived(templatesData.filter((t) => t.category_id === categoryId));
```

Lalu ganti semua referensi ke `CATEGORIES`/`FRAME_CONFIGS`/`selectedCategory`/`selectedFrame` di markup agar memakai `categoriesData`/`templatesData` — termasuk `price` yang sekarang datang dari `base_price` (angka dari API, bukan hardcoded), dan grid frame (`cols`/`rows`) yang perlu diturunkan dari `design_data` template (jumlah slot foto) alih-alih field `cols`/`rows` yang tidak ada di model backend. Karena ini perubahan struktural yang cukup besar pada markup, lakukan bertahap dan test render setiap kategori/template sebelum lanjut ke bagian selanjutnya, jangan sekali ganti semua tanpa verifikasi visual.

**c. Tampilkan state loading & error** di markup (`loadingCatalog`/`catalogError`) alih-alih langsung asumsi data selalu siap — booth client jalan offline-first, jadi kalau fetch gagal (booth belum online saat startup), tampilkan pesan yang jelas ke operator, bukan layar kosong.

---

## 4. Camera — tidak ada tindakan

Dikonfirmasi koneksi kamera USB sudah berhasil. Tidak ada perubahan yang diperlukan untuk poin ini di sesi ini.

---

## 5. Post-Implementation Protocol

```bash
npm run check   # svelte-check untuk TypeScript/Svelte errors
npm run tauri dev   # test manual di app desktop
```

Test manual checklist:
- [ ] Ubah nama booth & tagline di UI Customize (admin-dashboard) → reload booth client → nama & tagline berubah (memverifikasi fix §1)
- [ ] Drag tombol Start di UI Customize → reload booth client → tombol MULAI di V1 pindah posisi sesuai drag (memverifikasi fix §2)
- [ ] Buka layar pilih kategori di booth client → kategori & harga sesuai data admin dashboard, bukan Solo/Couple/Group/Family hardcoded (memverifikasi fix §3)
- [ ] Matikan koneksi backend sementara → buka booth client → pastikan fallback ke `DEFAULT_UI_CONFIG`/pesan error yang jelas, tidak crash
