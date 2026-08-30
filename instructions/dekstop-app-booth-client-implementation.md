# Instruksi Agent CLI — Booth Client Desktop App (SvelteKit + Tauri)

## 0. Objective

Replikasi **pixel-perfect** 3 varian tampilan Booth Client dari referensi Figma Make (React/TSX) ke dalam `dekstop-app` (SvelteKit 5 + Tauri v2 + Tailwind v4, sudah terpasang `@lucide/svelte`), sambil memperbaiki alur UX aplikasi desktop saat ini.

Sumber desain (read-only, jangan diedit, hanya dibaca untuk slicing):

```
potohub-design-from-figma-make/src/pages/BoothClient.tsx     → Varian V1
potohub-design-from-figma-make/src/pages/BoothClientV2.tsx   → Varian V2
potohub-design-from-figma-make/src/pages/BoothClientV3.tsx   → Varian V3
potohub-design-from-figma-make/src/imports/pasted_text/*.tsx → sub-layar yang dipakai V1
potohub-design-from-figma-make/src/imports/lib/photobooth.ts → helper FILTERS, delay, dll.
potohub-design-from-figma-make/src/store/uiConfigStore.ts    → bentuk data UI config
potohub-design-from-figma-make/src/store/frameStore.ts       → bentuk data kategori/frame
potohub-design-from-figma-make/src/context/BoothThemeContext.tsx
```

Target:

```
dekstop-app-context/src/...
```

### Prinsip kerja

1. **Pixel-perfect** = salin nilai style (warna hex, padding, border-radius, box-shadow, font stack, ukuran) apa adanya dari TSX. Jangan "membersihkan" ke desain generik Tailwind — kalau TSX pakai inline `style={{...}}`, pindahkan sebagai inline `style="..."` atau `<style>` block Svelte, bukan didekati dengan class Tailwind approksimasi.
2. **Modular per varian** — 3 folder komponen terpisah (v1/v2/v3), tidak saling bergantung secara visual, tapi berbagi **logic layer** yang sama (store + util functions).
3. **Fungsi yang dipakai berulang** (capture, kirim softfile, format timer, dll) **wajib** dipisah ke fungsi/store bersama, dipanggil dari ketiga varian — jangan diduplikasi copy-paste di tiap varian.
4. **Kamera**: gunakan `cameraStore` yang **sudah ada** di `src/lib/camera.svelte.ts` (mode `usb` | `webcam` | `demo` sudah diimplementasikan, termasuk fallback webcam browser via `getUserMedia`). **Jangan** menulis ulang logic capture kamera dari nol — panggil store ini dari layar session tiap varian.
5. **Payment & softfile sending SENGAJA belum berfungsi.** Buat UI-nya lengkap (tombol, state "terkirim", QR placeholder) tapi jangan hubungkan ke API sungguhan — cukup local state (mirip `handleSend` di `complete-screen.tsx` / `BoothClientV2.tsx` yang hanya `setSent(true)`). Beri komentar `// TODO: integrasikan ke API pembayaran/softfile setelah gap backend selesai` di titik yang relevan.
6. **Style booth "aggresively hardcoded"** — jangan bangun sistem theming dinamis yang njlimet. Style tetap hardcode persis seperti TSX per varian. Yang dinamis **hanya** data yang memang datanya dari config (nama booth, tagline, harga, warna primer jika dipetakan dari `uiConfig.primaryColor`, dst) — pola ini sudah ada di TSX asli (`useBoothTheme`, `getUIConfig`), ikuti pola yang sama.

---

## 1. Perbaikan Alur UX Aplikasi Desktop (fokus utama)

Kondisi `dekstop-app-context` saat ini (sudah dicek):

- `src/routes/+page.svelte` hanya halaman placeholder ("Photobooth" + 2 link).
- `src/routes/camera-config/+page.svelte` adalah panel **hardware** kamera (ISO/TV/AV/exposure) — ini **BUKAN** panel konfigurasi booth operator, biarkan tetap ada sebagai halaman developer terpisah, jangan dihapus.
- `src/routes/session/+page.svelte` sudah punya live view + shutter + print controls dasar, tapi belum terhubung ke alur step booth (langsung tampil begitu masuk, tanpa welcome/tutorial/frame selection).
- Tidak ada welcome banner, tidak ada PIN entry, tidak ada config dashboard neumorphism seperti di TSX.

### Urutan alur yang harus dibangun (sesuai prioritas user):

1. **Welcome banner** (layar utama saat aplikasi idle) — ini adalah layar `IDLE`/`landing` di ketiga varian TSX (`LandingScreen` untuk V1, blok `step === 'landing'` di V2, `step === 'start'` di V3). Ini yang tampil begitu app dibuka — **bukan** PIN screen.
2. **PIN entering** — bukan layar terpisah yang muncul otomatis, tapi **gerbang tersembunyi** menuju config: taruh trigger kecil di welcome banner (mis. tap logo/brand mark 5x berturut, atau ikon kecil di pojok — cek referensi `PinPad` dipanggil dari layar `LOGIN` di `BoothClient.tsx` baris ~869–902 untuk styling PIN pad neumorphism-nya). Saat trigger, tampilkan modal/layar `PinPad` bergaya neumorphism dari TSX (`NEU_BG`, `NEU_PRIMARY`, `neuCfg.card/inset/btn`). PIN dibaca dari config booth lokal (default `"1234"` mengikuti `DEFAULT_CFG.pin` di `BoothClient.tsx`), lihat §3.2.
   > Catatan: TSX referensi (V1) justru mem-boot langsung ke `LOGIN` sebelum `IDLE`. Untuk kiosk yang dipakai pelanggan tanpa pengawasan terus-menerus, boot-ke-welcome + PIN tersembunyi lebih aman secara UX (pelanggan tidak disodori layar PIN staff). Ikuti urutan ini kecuali user memutuskan lain — beri jalan mudah untuk membalik urutan lewat satu flag di store (`bootScreen: 'welcome' | 'pin'`) supaya keputusan ini gampang diubah tanpa refactor besar.
3. **Configuration panel** — persis `ConfigDashboard` di `BoothClient.tsx` (baris ~108–380-an): header ungu gradient dengan tombol back & logout, info card (Nama Device, PIC, Expired, Version, tombol **Sync**), dua kolom (Fitur Aktif: toggle payment/filter/mirror/flip; General Setting: rotasi kamera, countdown, stok kertas, PIN admin, session pending softfile). Tambahkan **satu field baru** di sini yang tidak ada di TSX asli: **pilihan mode kamera** (`usb` / `webcam` / `demo`) — reuse `cameraStore.connect(mode)` yang sudah ada, supaya operator bisa pindah ke fallback webcam laptop langsung dari panel ini tanpa buka halaman developer `/camera-config`.
4. **Photo session display** — gabungkan `session/+page.svelte` yang sudah ada dengan `camera-screen.tsx` / `photo-session-camera.tsx` (countdown ring SVG, film strip panel, multi-shot sesuai jumlah slot frame) supaya tampilannya pixel-perfect per varian, bukan generic seperti sekarang.

### Struktur route baru yang disarankan

```
src/routes/
├── +page.svelte                # Director: baca template_variant, render V1Layout/V2Layout/V3Layout
├── camera-config/+page.svelte  # TETAP — panel hardware kamera developer (tidak diubah)
└── session/+page.svelte        # DIHAPUS isinya, digantikan oleh alur step di dalam V*Layout (lihat §2)
```

`session/+page.svelte` sebaiknya **tidak lagi jadi halaman terpisah** — layar session/capture menjadi salah satu `step` di dalam booth flow (welcome → tutorial → payment → frame → **session** → filter → download), persis seperti struktur `Step`/`AppState` di TSX. Kalau ingin tetap mempertahankan route `/session` untuk keperluan lain (mis. debug cepat), boleh, tapi **jangan jadikan itu satu-satunya jalur** — flow utama harus dimulai dari `/` (welcome banner).

---

## 2. Struktur Folder Frontend

```
src/
├── lib/
│   ├── camera.svelte.ts        # SUDAH ADA — jangan ditulis ulang, hanya dipakai
│   ├── printer.svelte.ts       # SUDAH ADA — jangan ditulis ulang, hanya dipakai
│   ├── api/
│   │   └── boothClient.ts      # BARU — pemanggil API publik booth (lihat §6)
│   ├── stores/
│   │   ├── booth.svelte.ts     # BARU — state machine step, countdown, foto, dll (Svelte 5 runes)
│   │   ├── boothConfig.svelte.ts # BARU — PIN, cfg operator (paperThreshold, filter toggles, dst), persist lokal
│   │   └── uiConfig.svelte.ts  # BARU — booth_name, tagline, payment methods, frameCategories, template_variant
│   ├── utils/
│   │   ├── shared.ts           # BARU — formatTime, sendSoftFile (stub), generateSessionCode, getFilterClass
│   │   └── stickers.ts         # BARU (opsional) — logic drag emoji/stiker sederhana
│   └── components/
│       ├── shared/
│       │   ├── PinPad.svelte           # dipakai V1's LOGIN & sebagai modal gerbang di V2/V3
│       │   ├── StickerPicker.svelte
│       │   └── StickerCanvas.svelte
│       ├── v1/
│       │   ├── V1Layout.svelte         # Director internal V1: LOGIN→CONFIG→IDLE→...→COMPLETE
│       │   ├── V1ConfigDashboard.svelte
│       │   ├── V1Landing.svelte        # dari landing-screen.tsx
│       │   ├── V1Tutorial.svelte       # dari tutorial-ui.tsx
│       │   ├── V1PaymentMethod.svelte  # dari method-selection.tsx
│       │   ├── V1CategoryFrame.svelte  # dari photo-booth-config.tsx
│       │   ├── V1PrintQty.svelte       # dari print-quantity-screen.tsx
│       │   ├── V1QRISPayment.svelte    # dari payment-qr-ui.tsx (UI saja, tanpa API nyata)
│       │   ├── V1Camera.svelte         # dari camera-screen.tsx — pakai cameraStore
│       │   ├── V1Customize.svelte      # dari customize-screen.tsx
│       │   └── V1Complete.svelte       # dari complete-screen.tsx (softfile UI-only)
│       ├── v2/
│       │   ├── V2Layout.svelte         # Director internal V2 (file sumber V2 satu file besar, step-based)
│       │   ├── V2Landing.svelte
│       │   ├── V2Tutorial.svelte
│       │   ├── V2Payment.svelte
│       │   ├── V2Qris.svelte
│       │   ├── V2Ticket.svelte
│       │   ├── V2Frame.svelte
│       │   ├── V2Session.svelte        # pakai cameraStore
│       │   ├── V2Filter.svelte
│       │   └── V2Download.svelte       # softfile UI-only, pakai V2Keyboard internal
│       └── v3/
│           ├── V3Layout.svelte
│           ├── V3Start.svelte
│           ├── V3Tutorial.svelte
│           ├── V3Package.svelte
│           ├── V3Payment.svelte
│           ├── V3Ticket.svelte
│           ├── V3Frame.svelte
│           ├── V3Session.svelte        # pakai cameraStore
│           ├── V3Filter.svelte
│           ├── V3Loading.svelte
│           └── V3Download.svelte       # softfile UI-only
└── routes/
    └── +page.svelte             # Director utama: pilih V1Layout/V2Layout/V3Layout dari template_variant
```

> **Catatan slicing V2 & V3**: berbeda dari V1 yang sudah modular (import dari `imports/pasted_text/*`), file `BoothClientV2.tsx` dan `BoothClientV3.tsx` adalah **satu file besar self-contained** berisi semua layar sebagai blok `if (step === '...')`. Pecah tiap blok tersebut menjadi komponen Svelte terpisah seperti daftar di atas — jangan biarkan `V2Layout.svelte`/`V3Layout.svelte` jadi satu file raksasa 1000+ baris.

---

## 3. Logic Layer Bersama (dipakai V1, V2, V3)

### 3.1. `lib/stores/booth.svelte.ts` — state machine sesi

```ts
export type BoothStep =
  | "welcome"
  | "tutorial"
  | "payment"
  | "ticket"
  | "frame"
  | "print_qty"
  | "session"
  | "filter"
  | "customize"
  | "loading"
  | "download";

class BoothFlowStore {
  step = $state<BoothStep>("welcome");
  countdown = $state<number | null>(null);
  photosTaken = $state<string[]>([]); // dataURL / blob URL tiap jepretan
  selectedFrameId = $state<string | null>(null);
  selectedFilterId = $state<string>("none");
  printQty = $state(1);
  sessionCode = $state<string | null>(null);

  goTo(step: BoothStep) {
    this.step = step;
  }
  reset() {
    this.step = "welcome";
    this.photosTaken = [];
    this.selectedFrameId = null;
    this.selectedFilterId = "none";
    this.printQty = 1;
    this.sessionCode = null;
  }
}

export const boothFlow = new BoothFlowStore();
```

Ketiga varian **wajib** memakai `boothFlow` yang sama untuk pindah step — jangan bikin `let step = $state(...)` lokal terpisah di tiap `V*Layout.svelte`. Nilai `BoothStep` di atas adalah union dari step V1/V2/V3 (namanya sengaja dinetralkan; tiap `V*Layout.svelte` memetakan step generik ini ke label/blok tampilannya sendiri sesuai TSX aslinya).

### 3.2. `lib/stores/boothConfig.svelte.ts` — pengaturan operator (PIN, dsb)

Mengikuti persis bentuk `BoothCfg` di `BoothClient.tsx`:

```ts
export interface BoothCfg {
  pin: string;
  paperThreshold: number;
  paperCount: number;
  countdownSecs: number;
  photoFilter: boolean;
  filterBW: boolean;
  filterSepia: boolean;
  filterVivid: boolean;
  filterRetro: boolean;
  filterCool: boolean;
  cameraRotate: string;
  mirrorOn: boolean;
  flipVertical: boolean;
  paymentPage: boolean;
  cameraMode: "usb" | "webcam" | "demo"; // BARU dibanding TSX asli — lihat §1 poin 3
}

export const DEFAULT_CFG: BoothCfg = {
  pin: "1234",
  paperThreshold: 20,
  paperCount: 100,
  countdownSecs: 5,
  photoFilter: true,
  filterBW: true,
  filterSepia: true,
  filterVivid: false,
  filterRetro: true,
  filterCool: false,
  cameraRotate: "0° (Default)",
  mirrorOn: true,
  flipVertical: false,
  paymentPage: true,
  cameraMode: "usb",
};
```

Persist ke `localStorage` per booth id (`booth_settings_${boothId}`), sama seperti `loadCfg`/`saveCfg` di TSX. **Jangan** panggil API dari sini langsung — pemanggilan API (sync) dipisah ke `lib/api/boothClient.ts` dan dipanggil eksplisit saat tombol **Sync** ditekan di config panel (lihat §6).

### 3.3. `lib/utils/shared.ts` — fungsi lintas varian

```ts
export function formatTime(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function generateSessionCode(boothName: string): string {
  return `${boothName.replace(/\s+/g, "").toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

// Stub yang disengaja — lihat §0 poin 5. Meniru handleSend() di complete-screen.tsx / BoothClientV2.tsx.
export async function sendSoftFile(
  email: string,
  onSent: () => void,
): Promise<void> {
  if (!email.trim()) return;
  // TODO: integrasikan ke API pembayaran/softfile setelah endpoint tersedia.
  // Sengaja tidak memanggil API apa pun — hanya UI feedback lokal.
  onSent();
}

export function getFilterClass(filterId: string): string {
  const map: Record<string, string> = {
    none: "",
    bw: "grayscale",
    sepia: "sepia",
    vivid: "saturate-150",
    retro: "contrast-125 sepia-[.3]",
    cool: "hue-rotate-15",
  };
  return map[filterId] ?? "";
}
```

`FILTERS` (daftar filter dengan id/label) dipindah dari `imports/lib/photobooth.ts` — salin isinya apa adanya ke `lib/utils/filters.ts` (bukan digabung ke `shared.ts` supaya tetap rapi per tanggung jawab).

### 3.4. Fungsi capture — JANGAN duplikasi

Semua layar session (V1Camera, V2Session, V3Session) **memanggil** `cameraStore.capture()` dan `cameraStore.startLiveview()/stopLiveview()` yang sudah ada di `lib/camera.svelte.ts`. Logic countdown-lalu-jepret (mis. hitung mundur 3-2-1 lalu panggil `cameraStore.capture()`, ulangi sebanyak jumlah slot di frame terpilih) ditaruh sebagai fungsi bersama:

```ts
// lib/utils/capture.ts
import { cameraStore } from "$lib/camera.svelte";
import { boothFlow } from "$lib/stores/booth.svelte";

export async function runCaptureSequence(
  slotCount: number,
  countdownSecs: number,
) {
  for (let i = 0; i < slotCount; i++) {
    for (let c = countdownSecs; c > 0; c--) {
      boothFlow.countdown = c;
      await new Promise((r) => setTimeout(r, 1000));
    }
    boothFlow.countdown = null;
    const bytes = await cameraStore.capture();
    if (bytes) {
      const blob = new Blob([bytes], { type: "image/jpeg" });
      boothFlow.photosTaken = [
        ...boothFlow.photosTaken,
        URL.createObjectURL(blob),
      ];
    }
  }
}
```

Panggil `runCaptureSequence(...)` dari `V1Camera.svelte`, `V2Session.svelte`, `V3Session.svelte` — **jangan** menulis ulang loop countdown di ketiganya secara terpisah.

---

## 4. Slicing TSX → Svelte (aturan konversi)

Prinsip: **jangan ubah struktur HTML/CSS**, cuma pindahkan sintaks.

| TSX (React)                                        | Svelte 5                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `useState(x)`                                      | `let x = $state(initial)`                                                                             |
| `useEffect(() => {...}, [deps])`                   | `$effect(() => {...})`                                                                                |
| `useMemo`/computed value                           | `$derived(...)`                                                                                       |
| `useRef` (DOM ref)                                 | `bind:this={el}`                                                                                      |
| `className={...}`                                  | `class={...}`                                                                                         |
| `style={{ key: val }}`                             | `style="key: val; ..."` (string) atau object lewat helper `styleToString()` jika kompleks/kondisional |
| `onClick={fn}`                                     | `onclick={fn}` (Svelte 5 pakai atribut lowercase, bukan `on:click`)                                   |
| `value={v} onChange={e => setV(e.target.value)}`   | `bind:value={v}`                                                                                      |
| `{cond && <div>...</div>}`                         | `{#if cond}<div>...</div>{/if}`                                                                       |
| `{arr.map((item, i) => <X key={i} .../>)}`         | `{#each arr as item, i (item.id)}<X .../>{/each}`                                                     |
| `import { Camera } from 'lucide-react'`            | `import { Camera } from '@lucide/svelte'`                                                             |
| Komponen anak menerima `children: React.ReactNode` | `let { children } = $props();` + `{@render children()}`                                               |

### Icon lucide

Semua ikon yang dipakai TSX (`QrCode`, `Camera`, `Download`, `Clock`, `Image`, `ChevronRight`, `Lock`, `Monitor`, `User`, `Calendar`, `Layers`, `CheckCircle2`, `ChevronDown`, `ChevronLeft`, `Ticket`, `Check`, `Printer`, `RefreshCcw`, `ArrowRight`, `Delete`, `Star`, `Sparkles`) sudah tersedia lewat `@lucide/svelte` (sudah ada di `package.json`). Import per-ikon persis nama yang sama, jangan ganti dengan ikon lain yang "mirip".

### QR Code

TSX pakai `qrcode.react` (`<QRCodeSVG value={...} />`). Paket ini belum ada di `package.json` desktop app — tambahkan dependency Svelte-native, mis. `qrcode` (generate ke `<canvas>`/dataURL) atau cari komponen Svelte QR yang setara, lalu `pnpm add <package>`. Karena layar ini hanya UI placeholder (softfile belum terhubung API — lihat §0 poin 5), boleh render QR statis berisi string dummy (`sessionCode` dari store), bukan URL API sungguhan.

### Font

TSX pakai kombinasi `'Poppins'`, `'Nunito'`, dan beberapa `sans-serif` fallback. Tambahkan `@font-face`/import Google Fonts di `src/app.html` (bukan di tiap komponen) supaya konsisten di ketiga varian.

---

## 5. Director Komponen (`routes/+page.svelte`)

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { fetchAndCacheUiConfig } from '$lib/api/boothClient';
  import V1Layout from '$lib/components/v1/V1Layout.svelte';
  import V2Layout from '$lib/components/v2/V2Layout.svelte';
  import V3Layout from '$lib/components/v3/V3Layout.svelte';

  onMount(async () => {
    // Best-effort: kalau offline / booth belum diaktivasi, pakai cache lokal / default v1.
    await fetchAndCacheUiConfig();
  });
</script>

{#if uiConfig.templateVariant === 'v2'}
  <V2Layout />
{:else if uiConfig.templateVariant === 'v3'}
  <V3Layout />
{:else}
  <V1Layout />
{/if}
```

Setiap `V*Layout.svelte` bertanggung jawab penuh atas urutan step internalnya sendiri (welcome → PIN → config → tutorial → ... → download), menggunakan `boothFlow` (§3.1) untuk step machine dan komponen-komponen v1/v2/v3 yang sudah dipecah di §2.

---

## 6. Integrasi API (booth-level, tanpa JWT user)

Booth Client **tidak** login sebagai user dashboard — ia hanya tervalidasi lewat `activation_code` (lihat dokumen gap-fix API, `01-api-gap-fix-ui-template-variant.md`). Buat `lib/api/boothClient.ts`:

```ts
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api";

export async function activateBooth(activationCode: string) {
  const res = await fetch(`${API_BASE}/booths/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activation_code: activationCode }),
  });
  if (!res.ok) throw new Error("Aktivasi gagal");
  const data = await res.json();
  // data: { booth_id, name, branch_id, status, settings, ui_template_variant }
  localStorage.setItem("booth_id", data.booth_id);
  localStorage.setItem("ui_template_variant", data.ui_template_variant);
  return data;
}

export async function fetchAndCacheUiConfig() {
  const boothId = localStorage.getItem("booth_id");
  if (!boothId) return; // belum diaktivasi — tetap render default v1 dari cache/local
  try {
    const res = await fetch(
      `${API_BASE}/booths/${boothId}/ui-customize/public`,
    );
    if (!res.ok) return;
    const data = await res.json();
    // simpan ke uiConfig store + localStorage cache sebagai fallback offline
    // ...
  } catch {
    // offline — biarkan pakai cache lokal terakhir, JANGAN lempar error ke UI kiosk
  }
}

// Dipanggil dari tombol "Sync" di Configuration Panel
export async function syncBoothSettings() {
  const boothId = localStorage.getItem("booth_id");
  if (!boothId) return null;
  const res = await fetch(`${API_BASE}/booths/${boothId}/settings/sync`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Sync gagal");
  return res.json(); // { booth_id, last_sync_at, settings }
}
```

> Endpoint `/ui-customize/public` dan field `ui_template_variant` pada `/activate` **belum ada** di API saat ini — ini adalah bagian yang ditambahkan lewat dokumen `01-api-gap-fix-ui-template-variant.md`. Kerjakan dokumen API tersebut dulu (atau paralel), lalu sambungkan `boothClient.ts` ke endpoint sungguhannya. Sampai endpoint itu siap, `fetchAndCacheUiConfig()` boleh fallback ke `templateVariant: 'v1'` secara default agar app tetap bisa dijalankan/di-preview.

Tombol **Sync** di Configuration Panel (§1 poin 3) memanggil `syncBoothSettings()` lalu `fetchAndCacheUiConfig()` secara berurutan, menampilkan toast/label kecil "Tersinkronisasi <waktu>" mengikuti gaya neumorphism yang sama.

---

## 7. Hal yang Harus Dihindari

- **Jangan** menyambungkan tombol pembayaran (QRIS) atau kirim softfile ke endpoint API sungguhan — itu di luar cakupan tugas ini (lihat §0 poin 5).
- **Jangan** menulis ulang `cameraStore`/`printerStore` — hanya konsumsi API publiknya.
- **Jangan** mengubah halaman `/camera-config` (panel hardware kamera) menjadi Configuration Panel booth — keduanya berbeda tujuan, biarkan terpisah.
- **Jangan** menggabungkan style 3 varian jadi satu sistem tema dinamis — tetap hardcode per varian sesuai arahan user.
- **Jangan** bikin `V2Layout.svelte`/`V3Layout.svelte` sebagai satu file monolitik — pecah sesuai daftar §2 walau TSX sumbernya satu file besar.

## 8. Checklist verifikasi

1. `pnpm install && pnpm run check` tidak ada error TypeScript baru.
2. `pnpm tauri dev` → app boot ke welcome banner (bukan langsung ke session/camera-config).
3. Trigger PIN tersembunyi di welcome banner → PIN pad neumorphism muncul → PIN benar → masuk Configuration Panel.
4. Configuration Panel: toggle mode kamera ke `webcam` → kembali ke welcome → mulai sesi → layar session pakai `getUserMedia` (webcam laptop), bukan USB.
5. Ganti `localStorage.ui_template_variant` manual ke `v2` lalu `v3`, reload app → tampilan welcome/tutorial/session berubah sesuai varian, pixel-perfect terhadap TSX rujukan masing-masing.
6. Tombol Sync di Configuration Panel memanggil endpoint tanpa error (atau gagal-lembut/offline-safe jika API belum jalan).
7. Layar Download/Complete menampilkan UI kirim softfile (email input, tombol kirim, QR placeholder) tapi tidak melakukan network call ke backend softfile/payment.
