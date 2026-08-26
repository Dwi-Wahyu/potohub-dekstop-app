# Instruksi: Terapkan Background Per-Step di Booth Client + QR Softfile

Target repo: **dekstop-app** (SvelteKit, kios/booth client — v1/v2/v3)

> **Prasyarat:** jalankan instruksi repo `api` (migrasi + endpoint baru) dan repo
> `admin-dashboard` (halaman publik `/s/:sessionId`) terlebih dahulu.

## 0. Diagnosis

- `uiConfig.svelte.ts` (store) **sama sekali tidak punya field background** —
  tidak per-step, tidak juga global. Field `primaryColor` yang ada dipetakan dari
  `general.bg_value` di `boothClient.ts` dengan komentar eksplisit "jangan asal
  pakai, ini keputusan produk yang belum final". Backend sekarang menghapus
  `general.bg_value` sepenuhnya (lihat instruksi `api`), jadi mapping ambigu ini
  **harus dibersihkan**, bukan dipertahankan.
- `V1Layout.svelte` / `V2Layout.svelte` / `V3Layout.svelte` **hardcode**
  `bg-black` (V1) dkk — tidak ada satupun yang membaca warna/gradient dari
  config secara dinamis per step.
- Step V3 (`type Step = 'start' | 'tutorial' | 'package' | 'payment' | 'ticket' |
  'frame' | 'session' | 'filter' | 'loading' | 'download'`) **sudah match persis**
  dengan enum `ui_step` di database — V3 adalah target utama fitur ini. V1
  (`welcome/config/tutorial/method_select/category_frame/print_qty/payment/
  camera/customize/complete`) dan V2 punya penamaan substep berbeda, perlu
  mapping manual ke 10 step kanonik.
- Step "download" (V3Download.svelte) saat ini cuma stub kirim email
  (`sendSoftFile`), **tidak generate QR/link apapun** ke halaman softfile. Ini
  fitur baru yang harus disambungkan.

---

## 1. Store `uiConfig.svelte.ts` — tambah `stepStyles`

```ts
export interface StepStyle {
  step: string;               // 'start' | 'tutorial' | ... | 'download' (10 step kanonik)
  bgType: 'color' | 'gradient' | 'none';
  bgValue: string | null;
}

export interface BoothUIConfig {
  // ...field yang sudah ada TETAP, KECUALI:
  // - HAPUS `primaryColor` mapping ambigu dari bg_value (lihat §2) — field
  //   `primaryColor` boleh tetap ada sebagai warna aksen tombol, tapi sumbernya
  //   BUKAN LAGI dari general.bg_value karena field itu sudah tidak ada di API.
  stepStyles: StepStyle[];    // BARU
}

export const DEFAULT_UI_CONFIG: BoothUIConfig = {
  // ...
  primaryColor: '#f5d9cc',   // tetap sebagai default warna aksen, sekarang independen dari bg
  stepStyles: [],             // BARU — kosong = semua step pakai default hardcode masing-masing
};
```

Tambah helper di class `UIConfigStore`:
```ts
getStepStyle(step: string): { background: string | null } {
  const s = this.config.stepStyles?.find((x) => x.step === step);
  if (!s || s.bgType === 'none') return { background: null }; // null = biarkan default komponen
  return { background: s.bgValue ?? null };
}
```

---

## 2. `boothClient.ts` — update mapping

### 2.1 `PublicUIConfigResponse` — sesuaikan dengan bentuk baru dari backend
```ts
export interface PublicUIConfigResponse {
  booth_id: string;
  template_variant: 'v1' | 'v2' | 'v3';
  general: {
    booth_name: string;
    tagline: string | null;
    // bg_type/bg_value DIHAPUS dari sini — sudah tidak dikirim backend lagi
  };
  text_styles: Array<{ element_key: string; font_size: string; font_family: string; color: string }>;
  payment_methods: Array<{ id: string; name: string; logo_asset_id: string | null; position: number; is_active: boolean }>;
  element_positions: Array<{ screen_key: string; element_key: string; x_percent: number; y_percent: number }>;
  step_styles: Array<{ step: string; bg_type: 'color' | 'gradient' | 'none'; bg_value: string | null }>;  // BARU
}
```

### 2.2 `mapPublicConfigToBoothUIConfig` — hapus mapping ambigu, tambah step styles
```ts
function mapPublicConfigToBoothUIConfig(data: PublicUIConfigResponse): Partial<BoothUIConfig> {
  return {
    boothName: data.general.booth_name,
    tagline: data.general.tagline ?? '',
    templateVariant: data.template_variant,
    // primaryColor TIDAK LAGI di-override dari bg_value (field itu sudah hilang
    // dari API). Biarkan tetap pakai DEFAULT_UI_CONFIG.primaryColor kecuali
    // nanti ada keputusan produk eksplisit untuk field accent_color terpisah.
    boothNameStyle: mapTextStyle(data.text_styles, 'booth_name', DEFAULT_UI_CONFIG.boothNameStyle),
    taglineStyle: mapTextStyle(data.text_styles, 'tagline', DEFAULT_UI_CONFIG.taglineStyle),
    paymentTitleStyle: mapTextStyle(data.text_styles, 'payment_title', DEFAULT_UI_CONFIG.paymentTitleStyle),
    frameTitleStyle: mapTextStyle(data.text_styles, 'frame_title', DEFAULT_UI_CONFIG.frameTitleStyle),
    paymentMethods: data.payment_methods
      .filter((p) => p.is_active)
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.id, name: p.name, logoUrl: p.logo_asset_id ?? '' })),
    elementPositions: data.element_positions.map((p) => ({
      screenKey: p.screen_key, elementKey: p.element_key,
      xPercent: p.x_percent, yPercent: p.y_percent,
    })),
    stepStyles: data.step_styles.map((s) => ({
      step: s.step, bgType: s.bg_type, bgValue: s.bg_value,
    })),  // BARU
  };
}
```

`fetchAndCacheUiConfig()` **tidak perlu diubah** — sudah memanggil
`uiConfig.save(mapPublicConfigToBoothUIConfig(data))`, otomatis ikut membawa
`stepStyles` begitu mapping di atas selesai.

---

## 3. Terapkan background per step di masing-masing layout

### 3.1 V3 (prioritas utama — step key sudah match langsung)
Di `V3Layout.svelte`, bungkus tiap screen dengan wrapper yang membaca
`uiConfig.getStepStyle(currentStep)`:
```svelte
<div
  class="w-screen h-screen overflow-hidden"
  style:background={uiConfig.getStepStyle(currentStep).background ?? undefined}
>
  {#if currentStep === 'start'}
    <V3Start ... />
  {:else if currentStep === 'tutorial'}
    <V3Tutorial ... />
  <!-- dst, tidak ada perubahan pada masing-masing screen component itu sendiri -->
  {/if}
</div>
```
`?? undefined` penting: kalau `background` null (step di-reset / `none`),
`style:background` tidak ditulis sama sekali → CSS fallback komponen anak yang
berlaku (bukan dipaksa transparent), sesuai instruksi "kosongkan background
setiap step agar dapat memulai dari awal" — reset artinya kembali ke desain
asli komponen, bukan background hitam polos.

### 3.2 V1 & V2 — mapping substep ke step kanonik
Tambahkan fungsi mapping kecil di masing-masing `V1Layout.svelte` /
`V2Layout.svelte`:
```ts
// V1Layout.svelte
const SUBSTEP_TO_UI_STEP: Record<typeof currentSubStep, string> = {
  welcome: 'start',
  config: 'start',          // config dashboard tidak dikustomisasi, tapi tetap butuh fallback
  tutorial: 'tutorial',
  method_select: 'payment',
  category_frame: 'frame',
  print_qty: 'frame',
  payment: 'payment',
  camera: 'session',
  customize: 'filter',
  complete: 'download',
};
```
Terapkan dengan cara yang sama seperti §3.1 (`style:background` di root div,
memakai `uiConfig.getStepStyle(SUBSTEP_TO_UI_STEP[currentSubStep]).background`).
Buat mapping serupa untuk V2 sesuai substep V2 masing-masing (cek
`V2Layout.svelte` untuk nama-nama substep-nya, ikuti pola yang sama — jangan
duplikasi definisi, taruh mapping di file layout masing-masing supaya scope-nya
jelas per variant).

### 3.3 Referensi komponen tombol & card
Instruksi user: **komponen tombol/card yang BARU dibuat untuk fitur ini
mengacu ke V1** (`V1Landing.svelte`, dst). Ini HANYA relevan kalau langkah di
atas butuh menambah elemen UI baru (mis. badge kecil "background custom aktif"
saat development/testing) — untuk penerapan background per-step murni (§3.1-3.2)
tidak perlu komponen UI baru sama sekali, cukup CSS `background` di root div.
Jangan menambah komponen yang tidak diminta.

---

## 4. Step "download" — sambungkan ke halaman softfile

`V3Download.svelte` (dan padanannya di V1/V2) saat ini hanya stub
`sendSoftFile(email, ...)`. Tambahkan generate QR code yang mengarah ke halaman
publik admin-dashboard:

```ts
// Setelah sesi selesai & session_id tersedia dari boothFlow/session store:
const softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/s/${sessionId}`;
```

- `ADMIN_DASHBOARD_PUBLIC_URL` harus jadi env var baru (`VITE_ADMIN_DASHBOARD_URL`
  di `.env` / `import.meta.env`), **jangan hardcode domain**, karena tiap
  deployment booth beda subdomain/tenant.
- Render `QRCodeSVG` (package `qrcode.react`/`qrcode` yang sudah dipakai di
  layar lain seperti `QRISPaymentScreen`) dengan value `softfileUrl`, tampilkan
  berdampingan dengan opsi kirim email yang sudah ada (jangan hapus fitur email
  — QR ini fitur tambahan, bukan pengganti).
- `sessionId` harus berasal dari session/transaksi yang sudah tercatat backend
  (bukan `generateSessionCode` lokal yang ada sekarang — itu cuma kode display,
  bukan UUID sungguhan dari tabel `sessions`). Cek alur pembuatan sesi saat ini
  di `src/routes/session/+page.svelte` — pastikan `session_id` hasil response
  backend disimpan di store yang bisa diakses `V3Download.svelte` saat step ini
  dirender (kemungkinan perlu diteruskan lewat `boothFlow` store, cek dulu
  apakah field ini sudah ada sebelum menambah field baru).

---

## 5. Verifikasi Alur Sesi Foto

Pastikan urutan fetch berikut benar-benar terjadi tanpa flicker/step tanpa
background sesaat (mirip semangat perbaikan skeleton loading sebelumnya):
1. `activateBooth()` dipanggil saat aktivasi awal → set `templateVariant`.
2. `fetchAndCacheUiConfig()` dipanggil setelah aktivasi DAN di setiap start
   sesi baru / tombol "Sync" (`syncBoothSettings()` yang sudah memanggilnya) →
   `stepStyles` ter-cache di `localStorage` via `uiConfig.save()`.
3. Karena `uiConfig.load()` membaca dari `localStorage` saat init, booth yang
   offline/restart tetap dapat `stepStyles` terakhir yang berhasil di-sync
   (tidak perlu perubahan tambahan di `load()`/`save()` — keduanya sudah
   generic terhadap seluruh isi `BoothUIConfig`, otomatis ikut menyimpan field
   baru ini).
4. Test manual: ubah background salah satu step di admin dashboard → klik
   "Sync" di booth client → pastikan background berubah tanpa perlu restart
   aplikasi.

---

## 6. Post-Implementation

1. `npm run build` (atau `bun run build` sesuai `package.json`) — pastikan tidak
   ada TypeScript error dari field yang dihapus/ditambah.
2. Uji manual seluruh 10 step di V3 (prioritas), lalu V1 & V2 minimal untuk step
   yang mapping-nya paling berisiko salah (`payment`, `frame`, `session`).
3. Uji step "download": QR ter-render, scan dengan HP beneran (atau buka URL
   manual) mengarah ke `/s/{sessionId}` di admin-dashboard dan menampilkan
   galeri sesi yang baru selesai.
4. Buat laporan di `instruction-reports/BOOTH_UI_STEP_BACKGROUND_AND_SOFTFILE_PAGE.md`
   — sertakan tabel step × variant (V1/V2/V3) yang menandai mana yang sudah
   diverifikasi background-nya berubah dengan benar, supaya tidak ada step yang
   terlewat (pola checklist yang sama dipakai laporan perbaikan skeleton
   sebelumnya).
