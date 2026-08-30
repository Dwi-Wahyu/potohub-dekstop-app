# Instruksi: Sinkronisasi UI Customization (API + Admin Dashboard) di `dekstop-app`

**Target repo:** `dekstop-app` (Tauri v2 + SvelteKit + Svelte 5).

**Batasan penting (wajib dipatuhi):**
- `api`, `admin-dashboard`, dan `dekstop-app` adalah **3 repo Git terpisah** — TIDAK boleh import file dari repo lain. Semua tipe/fungsi yang dibutuhkan desktop harus didefinisikan ulang di repo ini.
- Hormati pemisahan yang sudah ada:
  - `src/lib/api/*` → network + mapping payload API.
  - `src/lib/stores/*` → state aplikasi (Svelte runes).
  - `src/lib/utils/*` → fungsi murni/utilitas (tanpa DOM/state global).
  - `src/lib/components/**` → tampilan (hanya render, ambil data dari store/props).
- Jangan mengubah kontrak API (backend sudah selesai); desktop hanya menyesuaikan konsumsi response.

**Referensi backend yang sudah live:**
- `GET /booths/{boothId}/ui-customize/public` mengembalikan `general` (termasuk `template_variant`, `show_step_indicator`), `text_styles`, `payment_methods`, `element_positions`, `element_styles` (termasuk `label`), `step_styles` (`bg_type` bisa `color|gradient|image|none`).
- `general.template_variant` = `v1|v2|v3|custom`.

---

## 0. Tujuan

1. Desktop mengkonsumsi semua field baru API (`show_step_indicator`, `element_styles[].label`, `step_styles` tipe `image`) dan menerapkannya ke layout V1/V2/V3/Custom.
2. Customer journey desktop menjadi **sumber kebenaran** — preview admin-dashboard harus 1:1 dengan journey desktop untuk booth yang sama (lihat §5).
3. Tidak ada perubahan visual besar di luar penerapan field di atas; V1/V2/V3/Custom yang sudah ada dipertahankan.

---

## 1. Keadaan Sekarang (yang sudah benar, jangan dirombak)

- `src/lib/api/boothClient.ts` sudah punya `fetchAndCacheUiConfig()`, `PublicUIConfigResponse`, dan `mapPublicConfigToBoothUIConfig()`.
- `src/lib/stores/uiConfig.svelte.ts` sudah punya `BoothUIConfig`, `TextStyle`, `ElementStyle`, `ElementPosition`, `StepStyle`, `getStepStyle()`, `getElementPosition()`, `getElementStyle()`.
- `src/routes/+page.svelte` sudah dispatch `templateVariant` → `V1Layout | V2Layout | V3Layout | CustomLayout`.
- Semua layout sudah memanggil `uiConfig.getStepStyle(step).background` pada root div.
- Layout custom (`CustomLayout.svelte`) sudah reuse flow V1 + `CustomLanding.svelte`.

Yang kurang adalah: field `show_step_indicator`, `label`, dan penanganan `bg_type: 'image'` belum sampai ke store/komponen.

---

## 2. Phase 1 — Perluas mapping API (`src/lib/api/boothClient.ts`)

### 2.1 Perluas `PublicUIConfigResponse`

```ts
export interface PublicUIConfigResponse {
  booth_id: string;
  template_variant: 'v1' | 'v2' | 'v3' | 'custom';
  general: {
    booth_name: string;
    tagline: string | null;
    show_step_indicator: boolean;          // TAMBAH
  };
  // ... (field lain tetap)
  element_styles?: Array<{
    screen_key: string;
    element_key: string;
    bg_color: string | null;
    text_color: string | null;
    font_size: 'kecil' | 'sedang' | 'besar' | null;
    font_family: 'sans_serif' | 'serif' | 'monospace' | null;
    label: string | null;                  // TAMBAH
  }>;
  step_styles?: Array<{
    step: string;
    bg_type: 'color' | 'gradient' | 'image' | 'none';  // TAMBAH 'image'
    bg_value: string | null;
  }>;
}
```

### 2.2 Perluas `mapPublicConfigToBoothUIConfig`

Tambahkan di object return:

```ts
showStepIndicator: data.general.show_step_indicator ?? true,
```

Dan di mapping `elementStyles` tambahkan `label`:

```ts
elementStyles: (data.element_styles ?? []).map((s) => ({
  screenKey: s.screen_key,
  elementKey: s.element_key,
  bgColor: s.bg_color,
  textColor: s.text_color,
  fontSize: s.font_size ? SIZE_MAP[s.font_size] : null,
  fontFamily: s.font_family ? FONT_MAP[s.font_family] : null,
  label: s.label ?? null,                 // TAMBAH
})),
```

---

## 3. Phase 2 — Perluas store (`src/lib/stores/uiConfig.svelte.ts`)

### 3.1 Tipe

```ts
export interface ElementStyle {
  screenKey: string;
  elementKey: string;
  bgColor: string | null;
  textColor: string | null;
  fontSize: 'Kecil' | 'Sedang' | 'Besar' | null;
  fontFamily: 'Sans Serif' | 'Serif' | 'Monospace' | null;
  label: string | null;                  // TAMBAH
}

export interface StepStyle {
  step: string;
  bgType: 'color' | 'gradient' | 'image' | 'none';  // TAMBAH 'image'
  bgValue: string | null;
}

export interface BoothUIConfig {
  // ...field lama
  showStepIndicator: boolean;            // TAMBAH
  // ...
}
```

### 3.2 Default

```ts
export const DEFAULT_UI_CONFIG: BoothUIConfig = {
  // ...field lama
  showStepIndicator: true,               // TAMBAH
  // ...
};
```

### 3.3 `getStepStyle` — dukung background image

Ganti implementasi lama:

```ts
getStepStyle(step: string): { background: string | null } {
  const s = this.config.stepStyles?.find((x) => x.step === step);
  if (!s || s.bgType === 'none' || !s.bgValue) return { background: null };
  if (s.bgType === 'image' || s.bgValue.startsWith('http') || s.bgValue.startsWith('data:')) {
    return { background: `url("${s.bgValue}") center / cover no-repeat` };
  }
  return { background: s.bgValue };
}
```

### 3.4 Tambah `getElementLabel`

```ts
getElementLabel(screenKey: string, elementKey: string, fallbackLabel: string): string {
  const s = this.config.elementStyles?.find(
    (x) => x.screenKey === screenKey && x.elementKey === elementKey
  );
  return s?.label ?? fallbackLabel;
}
```

---

## 4. Phase 3 — Terapkan field baru di tampilan

### 4.1 `show_step_indicator` → step indicator di V2/V3

- Buat komponen `src/lib/components/shared/StepIndicator.svelte`:
  - Props: `labels: string[]`, `activeIndex: number`.
  - Render pill per label: selesai (check), aktif (highlight), belum (muted). Visual mengikuti referensi masing-masing variant (V2 editorial hitam/putih, V3 film-strip merah).
- Render `<StepIndicator />` di header setiap step V2/V3 **hanya jika** `uiConfig.config.showStepIndicator` bernilai true.
- Label V2 (lihat `booth-client-refference/BoothClientV2.tsx`):
  `['Tutorial', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter', 'Scan File']`
  dengan indeks aktif: tutorial=0, payment=1, qris=1, ticket=1, frame=2, session=3, filter=4, download=5. Landing tidak menampilkan indicator.
- Label V3 (lihat `booth-client-refference/BoothClientV3.tsx`):
  `['package','payment','frame','session','filter']` dirender sebagai nomor/dot; aktif/done sesuai `VISIBLE_STEPS`.

> Jika suatu step V2/V3 saat ini hanya punya header teks sederhana (mis. `V2Tutorial`), tambahkan `<StepIndicator>` di header tersebut. Jangan buat layout baru.

### 4.2 `label` → teks tombol start

Ganti teks tombol start yang masih hardcode dengan `uiConfig.getElementLabel('start', 'start_button', '<fallback>')`:

- `V1Landing.svelte`: fallback `'MULAI'`.
- `V2Landing.svelte`: fallback `'Mulai Sesi →'`.
- `V3Start.svelte`: fallback `'Mulai Sekarang'`.
- `CustomLanding.svelte`: fallback `'Mulai'`.

Contoh (`V1Landing.svelte`):

```svelte
{uiConfig.getElementLabel('start', 'start_button', 'MULAI')}
```

### 4.3 `bg_type: 'image'` sudah tertangani otomatis

Setelah §3.3, semua layout yang memakai `getStepStyle(...).background` akan otomatis menampilkan background gambar dari `step_styles`. Tidak perlu perubahan per-layout.

---

## 5. Kontrak 1:1 dengan preview admin-dashboard (WAJIB dibaca)

Preview admin-dashboard (`BoothClientPage` hasil instruksi `admin-dashboard/instructions/BOOTH_CLIENT_TEMPLATE_VARIANTS.md`) HARUS menghasilkan journey yang sama persis dengan desktop untuk `booth` + `template_variant` + konfigurasi yang sama.

Pemetaan step desktop ↔ UI step backend ↔ preview admin-dashboard:

| Layout desktop | Step internal desktop | `ui_step` backend | Catatan |
|---|---|---|---|
| V1Layout | welcome | `start` | landing V1 |
| V1Layout | tutorial | `tutorial` | |
| V1Layout | method_select | `payment` | pilih QRIS/ticket |
| V1Layout | ticket | `ticket` | scan tiket |
| V1Layout | category_frame | `frame` | pilih frame |
| V1Layout | print_qty | `frame` | jumlah cetak |
| V1Layout | payment | `payment` | QRIS |
| V1Layout | camera | `session` | sesi foto |
| V1Layout | customize | `filter` | filter/stiker |
| V1Layout | complete | `download` | selesai |
| V2Layout | landing | `start` | |
| V2Layout | tutorial | `tutorial` | |
| V2Layout | payment | `payment` | pilih metode |
| V2Layout | qris | `payment` | QRIS |
| V2Layout | ticket | `ticket` | |
| V2Layout | frame | `frame` | |
| V2Layout | session | `session` | |
| V2Layout | filter | `filter` | |
| V2Layout | download | `download` | softfile |
| V3Layout | start | `start` | |
| V3Layout | tutorial | `tutorial` | |
| V3Layout | package | `package` | pilih paket/metode |
| V3Layout | payment | `payment` | QRIS |
| V3Layout | ticket | `ticket` | |
| V3Layout | frame | `frame` | |
| V3Layout | session | `session` | |
| V3Layout | filter | `filter` | |
| V3Layout | loading | `loading` | |
| V3Layout | download | `download` | softfile |
| CustomLayout | welcome | `start` | landing neumorphism |

**Aturan:**
- Key `ui_step` di atas adalah nilai yang dipakai `step_styles[].step`, jadi background per step harus jatuh ke step yang sama di kedua sisi.
- Setiap perubahan visual pada desktop (mis. penambahan `StepIndicator`) harus dicatat sebagai kontrak yang harus diikuti admin-dashboard preview. Jika admin-dashboard preview berbeda, perbaiki sisi admin-dashboard (desktop adalah referensi customer journey).

---

## 6. Testing Checklist

1. `pnpm build` / `cargo build` OK.
2. Ubah `show_step_indicator` dari admin dashboard → sync → desktop V2/V3 menyembunyikan/menampilkan `StepIndicator`; V1/Custom tidak terpengaruh.
3. Ubah label tombol start (via admin-dashboard, setelah backend `label` tersedia) → sync → teks tombol start di desktop V1/V2/V3/Custom berubah sesuai booth.
4. Upload background step tipe `image` dari admin-dashboard → sync → background `url(...)` muncul di step yang benar pada semua layout.
5. Bandingkan preview admin-dashboard vs desktop untuk booth yang sama: step sequence, background, label tombol, dan `show_step_indicator` harus identik.

---

## 7. Di Luar Scope Instruksi Ini

- Caching agresif & download aset offline → lihat `instructions/OFFLINE_CACHE_AND_LOCAL_STORAGE.md`.
- Penyimpanan hasil sesi ke folder lokal → lihat `instructions/OFFLINE_CACHE_AND_LOCAL_STORAGE.md`.
- Perubahan backend/seed.
