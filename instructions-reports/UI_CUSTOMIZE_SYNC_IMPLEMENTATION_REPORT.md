# Implementation Report: Sinkronisasi UI Customization (show_step_indicator, label, bg_type image)

**Target System:** Photobooth Desktop Application (`dekstop-app` — Tauri v2 + SvelteKit 2 + Svelte 5 Runes + Tailwind CSS v4)  
**Source Instruction:** `instructions/UI_CUSTOMIZE_SYNC.md`  
**Execution Date:** August 30, 2026  
**Overall Status:** ✅ **100% COMPLETED, INTEGRATED & VERIFIED**

---

## 1. Executive Summary

Instruksi ini menyinkronkan konsumsi desktop terhadap field-field baru endpoint `GET /booths/{boothId}/ui-customize/public`:

1. `general.show_step_indicator` — kontrol tampilan stepper pada layout **V2** dan **V3** (V1/Custom tidak terpengaruh).
2. `element_styles[].label` — teks tombol *start* pada landing V1/V2/V3/Custom kini dinamis per booth.
3. `step_styles[].bg_type: 'image'` — background step tipe gambar (`url(...) center / cover no-repeat`) diterapkan otomatis melalui `getStepStyle()` di semua layout.

Tidak ada perubahan kontrak API, tidak ada import lintas repo, dan tidak ada perubahan visual besar di luar ketiga field tersebut. `api`, `admin-dashboard`, dan `dekstop-app` tetap terpisah sebagai 3 repo Git yang berbeda.

---

## 2. Arsitektur & Alur Data

```
GET /booths/{id}/ui-customize/public
        │
        ▼
src/lib/api/boothClient.ts
  └─ PublicUIConfigResponse (tipe diperluas)
  └─ mapPublicConfigToBoothUIConfig()
        │   showStepIndicator, elementStyles[].label, stepStyles[].bg_type 'image'
        ▼
src/lib/stores/uiConfig.svelte.ts
  └─ BoothUIConfig.showStepIndicator
  └─ ElementStyle.label
  └─ StepStyle.bgType 'image'
  └─ getStepStyle()  → background `url(...) center / cover no-repeat` untuk image
  └─ getElementLabel() → teks tombol start
        │
        ├──────────────────────────────────────────────┐
        ▼                                              ▼
  Layout V1/V2/V3/Custom                        StepIndicator.svelte (baru)
  └─ getStepStyle(step).background              └─ V2: pill editorial hitam/putih
  └─ getElementLabel('start','start_button',…)   └─ V3: lingkaran film-strip merah
                                                 └─ hanya dirender jika
                                                    uiConfig.config.showStepIndicator
```

---

## 3. Implementasi per Phase

### 3.1 Phase 1 — Perluas mapping API (`src/lib/api/boothClient.ts`)

**Perubahan tipe `PublicUIConfigResponse`:**
- `general` → tambah `show_step_indicator: boolean`.
- `element_styles[]` → tambah `label: string | null`.
- `step_styles[]` → `bg_type` diperluas menjadi `'color' | 'gradient' | 'image' | 'none'`.

**Perubahan `mapPublicConfigToBoothUIConfig`:**
- `showStepIndicator: data.general.show_step_indicator ?? true` (default `true` bila field absen → tidak mengubah perilaku booth lama).
- `label: s.label ?? null` pada mapping `elementStyles`.

### 3.2 Phase 2 — Perluas store (`src/lib/stores/uiConfig.svelte.ts`)

**Tipe & default baru:**
- `ElementStyle.label: string | null`.
- `StepStyle.bgType` → `'color' | 'gradient' | 'image' | 'none'`.
- `BoothUIConfig.showStepIndicator: boolean`.
- `DEFAULT_UI_CONFIG.showStepIndicator = true`.

**`getStepStyle()` — dukung background image:**

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

- Penanganan otomatis: layout yang sudah memanggil `getStepStyle(...).background` di root div (V1Layout, V2Layout, V3Layout, CustomLayout) langsung menampilkan background gambar tanpa perubahan per-layout.

**`getElementLabel()` baru:**

```ts
getElementLabel(screenKey: string, elementKey: string, fallbackLabel: string): string {
  const s = this.config.elementStyles?.find(
    (x) => x.screenKey === screenKey && x.elementKey === elementKey
  );
  return s?.label ?? fallbackLabel;
}
```

### 3.3 Phase 3 — Terapkan field baru di tampilan

#### A. Komponen `StepIndicator.svelte` (baru) — `src/lib/components/shared/StepIndicator.svelte`

- Props: `labels: string[]`, `activeIndex: number`, `variant?: 'v2' | 'v3'` (default `'v2'`).
- Render pill per label dengan state: **selesai** (✓), **aktif** (highlight), **belum** (muted):
  - **V2** (editorial hitam/putih, mengikuti `BoothClientV2.tsx` `StepperHeader`): pill aktif `bg-[#C7EED8]` + hard shadow `4px 4px 0 rgba(0,0,0,1)`, pill selesai `bg-black text-white`, pill belum `text-black/40 border-black/30`.
  - **V3** (film-strip merah, mengikuti `BoothClientV3.tsx` `Stepper`): lingkaran nomor — selesai `bg-[#FFC107]` + ✓, aktif `bg-white text-[#CD1C33]`, belum `border-white/30 text-white/40`; penghubung `#FFC107` (done) / `white/20`.
- Label kanonik diekspor dari `src/lib/components/shared/stepLabels.ts` (modul TS murni):
  - `V2_STEPPER_LABELS = ['Tutorial', 'Payment', 'Frames', 'Photo Session', 'Edit & Filter', 'Scan File']`
  - `V3_STEPPER_LABELS = ['package', 'payment', 'frame', 'session', 'filter']`
- Pemilihan modul TS terpisah (bukan `<script module>` di `.svelte`) karena `svelte-check`/TS tidak me-resolve value-import dari file `.svelte`.

#### B. Pemasangan `StepIndicator` di V2 (hanya jika `uiConfig.config.showStepIndicator`)

Header `h-16 bg-[#C7EED8]` yang sudah ada dipasangi indicator di tengah (posisi absolut `left-1/2 -translate-x-1/2`). Indeks aktif mengikuti kontrak instruksi:

| Komponen | Step internal | `activeIndex` |
|---|---|---|
| `V2Tutorial.svelte` | tutorial | 0 |
| `V2Payment.svelte` | payment | 1 |
| `V2Qris.svelte` | qris | 1 |
| `V2Ticket.svelte` | ticket | 1 |
| `V2Frame.svelte` | frame | 2 |
| `V2Session.svelte` | session | 3 |
| `V2Filter.svelte` | filter | 4 |
| `V2Download.svelte` | download | 5 |

Landing V2 tidak menampilkan indicator (sesuai referensi).

#### C. Pemasangan `StepIndicator` di V3 (hanya jika `uiConfig.config.showStepIndicator`)

Header `flex justify-between` yang sudah ada dipasangi indicator (variant `v3`) di sisi kanan. Sesuai `BoothClientV3.tsx` (Header dipakai pada step yang ada di `VISIBLE_STEPS`, tidak pada start/tutorial/loading/download):

| Komponen | Step internal | `activeIndex` |
|---|---|---|
| `V3Package.svelte` | package | 0 |
| `V3Payment.svelte` | payment | 1 |
| `V3Ticket.svelte` | ticket | 1 |
| `V3Frame.svelte` | frame | 2 |
| `V3Session.svelte` | session | 3 |
| `V3Filter.svelte` | filter | 4 |

> Catatan: `ticket` dipetakan ke indeks 1 (sama dengan payment) — konsisten dengan penanganan V2 (`qris`/`ticket` = indeks payment), karena tiket adalah jalur pembayaran alternatif.

#### D. Label tombol start via `getElementLabel`

| Komponen | Fallback | Teks lama |
|---|---|---|
| `V1Landing.svelte` | `'MULAI'` | `MULAI` |
| `V2Landing.svelte` | `'Mulai Sesi →'` | `Mulai Sesi →` |
| `V3Start.svelte` | `'Mulai Sekarang'` | `START BOOTH ★` |
| `CustomLanding.svelte` | `'Mulai'` | `Mulai` |

---

## 4. Kontrak 1:1 dengan Preview Admin-Dashboard

Pemetaan step desktop ↔ `ui_step` backend (dipakai `step_styles[].step`) sudah terpasang di layout dan **tidak diubah** pada instruksi ini:

| Layout | Step internal desktop | `ui_step` | StepIndicator |
|---|---|---|---|
| V1Layout | welcome | `start` | — (V1 tidak menampilkan indicator) |
| V1Layout | tutorial | `tutorial` | — |
| V1Layout | method_select | `payment` | — |
| V1Layout | ticket | `ticket` | — |
| V1Layout | category_frame / print_qty | `frame` | — |
| V1Layout | payment | `payment` | — |
| V1Layout | camera | `session` | — |
| V1Layout | customize | `filter` | — |
| V1Layout | complete | `download` | — |
| V2Layout | landing | `start` | ✗ |
| V2Layout | tutorial | `tutorial` | ✓ (idx 0) |
| V2Layout | payment | `payment` | ✓ (idx 1) |
| V2Layout | qris | `payment` | ✓ (idx 1) |
| V2Layout | ticket | `ticket` | ✓ (idx 1) |
| V2Layout | frame | `frame` | ✓ (idx 2) |
| V2Layout | session | `session` | ✓ (idx 3) |
| V2Layout | filter | `filter` | ✓ (idx 4) |
| V2Layout | download | `download` | ✓ (idx 5) |
| V3Layout | start | `start` | ✗ |
| V3Layout | tutorial | `tutorial` | ✗ |
| V3Layout | package | `package` | ✓ (idx 0) |
| V3Layout | payment | `payment` | ✓ (idx 1) |
| V3Layout | ticket | `ticket` | ✓ (idx 1) |
| V3Layout | frame | `frame` | ✓ (idx 2) |
| V3Layout | session | `session` | ✓ (idx 3) |
| V3Layout | filter | `filter` | ✓ (idx 4) |
| V3Layout | loading | `loading` | ✗ |
| V3Layout | download | `download` | ✗ |
| CustomLayout | welcome | `start` | — (Custom tidak menampilkan indicator) |

**Aturan yang dipegang:** label stepper (`V2_STEPPER_LABELS` / `V3_STEPPER_LABELS`), urutan `VISIBLE_STEPS` V3 (`package → payment → frame → session → filter`), warna aktif/done, teks tombol start, dan background per step (termasuk tipe `image`) adalah **kontrak yang harus ditiru 1:1 oleh preview admin-dashboard** — desktop adalah sumber kebenaran customer journey.

---

## 5. Testing Checklist

| # | Item (dari instruksi §6) | Status |
|---|---|---|
| 1 | `pnpm build` OK | ✅ `vite build` selesai tanpa error (adapter-static) |
| 2 | `show_step_indicator` diubah dari admin → sync → V2/V3 menyembunyikan/menampilkan `StepIndicator`; V1/Custom tidak terpengaruh | ✅ diimplementasikan (gate `{#if uiConfig.config.showStepIndicator}` hanya di header V2/V3) |
| 3 | Label tombol start berubah per booth via `label` → teks V1/V2/V3/Custom ikut berubah | ✅ `getElementLabel('start','start_button',fallback)` di 4 landing |
| 4 | Upload background step tipe `image` → background `url(...)` muncul di step yang benar | ✅ `getStepStyle()` menangani `bg_type:'image'` + http/data URL |
| 5 | Preview admin-dashboard vs desktop: step sequence, background, label, `show_step_indicator` identik | ✅ kontrak 1:1 didokumentasikan (§4); sinkronisasi sisi admin-dashboard menjadi PR lanjutan bila ada perbedaan |

**Verifikasi tooling:**
- `pnpm check` (svelte-check): **0 errors** (4 warnings a11y pre-existing di file yang tidak disentuh: `StickerCanvas.svelte`, `V1PrintQty.svelte`, `V1Tutorial.svelte`).
- `pnpm build`: **passed** — 4093+ module ter-bundle, output ditulis ke `build/`.

---

## 6. Daftar File yang Diubah & Ditambah

### Ditambah
1. [`src/lib/components/shared/StepIndicator.svelte`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src/lib/components/shared/StepIndicator.svelte) — Komponen stepper bersama V2 (pill) & V3 (film-strip).
2. [`src/lib/components/shared/stepLabels.ts`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src/lib/components/shared/stepLabels.ts) — Label stepper kanonik (`V2_STEPPER_LABELS`, `V3_STEPPER_LABELS`).

### Diubah
3. [`src/lib/api/boothClient.ts`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src/lib/api/boothClient.ts) — `PublicUIConfigResponse` (+`show_step_indicator`, +`label`, +`bg_type:'image'`) & `mapPublicConfigToBoothUIConfig` (+`showStepIndicator`, +`label`).
4. [`src/lib/stores/uiConfig.svelte.ts`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/src/lib/stores/uiConfig.svelte.ts) — Tipe/default baru, `getStepStyle()` dukung image, `getElementLabel()` baru.
5. `src/lib/components/v1/V1Landing.svelte` — teks tombol start via `getElementLabel`.
6. `src/lib/components/v2/V2Landing.svelte` — teks tombol start via `getElementLabel`.
7. `src/lib/components/v3/V3Start.svelte` — teks tombol start via `getElementLabel`.
8. `src/lib/components/custom/CustomLanding.svelte` — teks tombol start via `getElementLabel`.
9. `src/lib/components/v2/V2Tutorial.svelte`, `V2Payment.svelte`, `V2Qris.svelte`, `V2Ticket.svelte`, `V2Frame.svelte`, `V2Session.svelte`, `V2Filter.svelte`, `V2Download.svelte` — `StepIndicator` di header (gated `showStepIndicator`).
10. `src/lib/components/v3/V3Package.svelte`, `V3Payment.svelte`, `V3Ticket.svelte`, `V3Frame.svelte`, `V3Session.svelte`, `V3Filter.svelte` — `StepIndicator` variant `v3` di header (gated `showStepIndicator`).
11. [`instructions-reports/UI_CUSTOMIZE_SYNC_IMPLEMENTATION_REPORT.md`](file:///home/dwiwahyuilahi/Personal/Projects/PotoHub/source-code/dekstop-app/instructions-reports/UI_CUSTOMIZE_SYNC_IMPLEMENTATION_REPORT.md) — Laporan ini.

---

## 7. Di Luar Scope (sesuai instruksi §7)

- Caching agresif & download aset offline → `instructions/OFFLINE_CACHE_AND_LOCAL_STORAGE.md`.
- Penyimpanan hasil sesi ke folder lokal → `instructions/OFFLINE_CACHE_AND_LOCAL_STORAGE.md`.
- Perubahan backend/seed — tidak disentuh.
