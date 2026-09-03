# Instruksi Perbaikan: Urutan Foto di Slot Frame Tidak Sinkron dengan Admin Dashboard

**Untuk**: Agen CLI (Claude Code / coding agent) yang bekerja pada repo `dekstop-app` (Tauri + SvelteKit).
**Status API**: ✅ Tidak perlu diubah — lihat bagian "Diagnosis" poin 1.
**Status Desktop App**: ❌ Ada bug — perlu diperbaiki di 3+ komponen.

---

## 1. Ringkasan Masalah

User melaporkan: **urutan foto yang mengisi slot pada template frame (composition) tidak sesuai dengan urutan yang dikonfigurasi admin lewat admin dashboard.**

Setiap layer foto di `design_data` template punya atribut `order` (angka urutan pengisian foto, ditentukan admin saat mendesain frame di dashboard), terpisah dari atribut `layer` (z-index untuk urutan menggambar/stacking) dan `id` (identitas unik slot). Contoh nyata dari `hasil_template.json`:

```json
{
  "id": 11,
  "order": 11,
  "layer": 11,
  "x": 609.0,
  "y": 1277.0,
  "camera": 1,
  "name": "Photo Area 11"
}
```

`order` adalah **satu-satunya sumber kebenaran** untuk menentukan foto ke-N (hasil jepretan kamera ke-N) masuk ke slot mana di frame.

---

## 2. Diagnosis (sudah diverifikasi di source code)

### 2.1. API (`api/`) — SUDAH mendukung `order`, tidak perlu diubah

- `api/src/models/template.rs`: kolom `design_data` disimpan sebagai `serde_json::Value` mentah (JSONB), tidak di-parse ke struct kaku, tidak di-strip field, dan tidak diurutkan ulang.
- `api/src/handlers/template.rs` (`create_template`, `update_template`): hanya memvalidasi keberadaan `x, y, w, h` lewat `validate_design_data()`, lalu **bind langsung** `design_data` apa adanya ke query INSERT/UPDATE. Tidak ada sorting, tidak ada mutasi array.
- Tidak ada `ORDER BY` yang menyentuh isi `design_data` (hanya dipakai untuk list template berdasarkan `created_at`).

**Kesimpulan**: apapun urutan array dan nilai `order` yang dikirim frontend admin dashboard, API menyimpan dan mengembalikannya **persis apa adanya**. Backend bukan sumber bug ini. **Jangan ubah apapun di folder `api/`.**

### 2.2. Desktop App (`dekstop-app/`) — Ini sumber bug-nya

Ada **inkonsistensi**: sebagian komponen sudah benar mengurutkan slot foto berdasarkan `order` (fallback ke `id`), tapi komponen lain — justru komponen yang dipakai **saat sesi live capture berlangsung** — tidak melakukan sorting sama sekali, hanya `filter()` mentah dari array `design_data` (urutan asli array, bukan urutan `order`).

**Sudah BENAR (referensi pola yang harus ditiru):**

- `src/lib/utils/templateComposite.ts` — fungsi `compositeTemplateImage()` mengurutkan `photoSlots` dengan:
  ```ts
  const photoSlots = (template.design_data || [])
    .filter((l) => !l.isBackground && !l.isQr)
    .sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : typeof a.id === 'number' ? a.id : 0;
      const orderB = typeof b.order === 'number' ? b.order : typeof b.id === 'number' ? b.id : 0;
      return orderA - orderB;
    });
  ```
- `src/lib/components/v1/V1Customize.svelte` (baris ~25-33) — pola sorting yang sama persis.

**SALAH / belum diperbaiki (bug ada di sini):**

| File | Baris | Masalah |
|---|---|---|
| `src/lib/components/v1/V1Camera.svelte` | ~22 | `photoSlots` hanya `.filter(...)`, tanpa `.sort()` |
| `src/lib/components/v2/V2Session.svelte` | ~23 | `photoSlots` hanya `.filter(...)`, tanpa `.sort()` |
| `src/lib/components/v3/V3Session.svelte` | ~23 | `photoSlots` hanya `.filter(...)`, tanpa `.sort()` |

Ketiga file di atas adalah **layar sesi pengambilan foto** (live camera + preview grid template di sampingnya). Mereka memakai `photoSlots` yang tidak terurut untuk menghitung `targetIdx`, lalu me-render `boothFlow.photosTaken[targetIdx]` ke posisi slot di layar. Karena `boothFlow.photosTaken` adalah array sekuensial murni berdasarkan urutan jepretan kamera (foto ke-0 = jepretan pertama, dst), maka:

- Jika urutan objek di array `design_data` (urutan penyisipan/edit terakhir di admin dashboard) **tidak sama** dengan urutan `order` yang di-assign admin, preview live capture akan menampilkan foto di slot yang salah dibanding yang sebetulnya dikonfigurasi admin (`compositeTemplateImage` yang dipakai untuk hasil akhir sudah benar, tapi preview session tidak — ini yang bikin "urutan tidak sesuai").
- Ini kemungkinan besar adalah regresi: dari `instructions-reports/TEMPLATE_COMPOSITE_R2_STORAGE_AND_SOFTFILE_REPORT.md`, sorting `order`-based awalnya hanya diterapkan ke `templateComposite.ts` dan filmstrip `V1Customize.svelte`, tapi **lupa diterapkan** ke layar sesi capture (`V1Camera.svelte`, dan versi v2/v3 yang mirip: `V2Session.svelte`, `V3Session.svelte`).

### 2.3. Root cause

**Logic sorting `order` (dengan fallback `id`) tidak konsisten diterapkan di semua tempat yang membaca `design_data` untuk memetakan foto ke slot.** Ada 4 tempat yang butuh logic ini (`templateComposite.ts`, `V1Customize.svelte`, `V1Camera.svelte`, `V2Session.svelte`, `V3Session.svelte`), tapi hanya 2 yang mengimplementasikannya, dan tidak ada satu fungsi bersama (shared helper) — sehingga rawan drift lagi di masa depan.

---

## 3. Rencana Perbaikan

### Langkah A — Ekstrak helper terpusat (agar tidak drift lagi)

Di `src/lib/utils/templateComposite.ts`, tambahkan fungsi yang diekspor dan dipakai ulang di semua tempat:

```ts
export interface TemplateDesignLayer {
  id?: number;
  order?: number;
  layer?: number;
  isBackground?: boolean;
  isQr?: boolean;
  x?: number;
  y?: number;
  [key: string]: unknown;
}

/**
 * Mengurutkan layer foto (bukan background, bukan QR) berdasarkan atribut `order`
 * yang di-assign admin di dashboard. Fallback ke `id` jika `order` tidak ada.
 * SATU-SATUNYA sumber kebenaran untuk urutan pengisian foto ke slot template —
 * jangan buat logic sorting duplikat di komponen lain, selalu import fungsi ini.
 */
export function getSortedPhotoSlots<T extends TemplateDesignLayer>(
  designData: T[] | null | undefined
): T[] {
  return (designData || [])
    .filter((l) => !l.isBackground && !l.isQr)
    .sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : typeof a.id === 'number' ? a.id : 0;
      const orderB = typeof b.order === 'number' ? b.order : typeof b.id === 'number' ? b.id : 0;
      return orderA - orderB;
    });
}
```

Lalu, di dalam `compositeTemplateImage()` pada file yang sama, ganti blok sorting inline yang sudah ada dengan pemanggilan fungsi baru ini:

```ts
// SEBELUM
const photoSlots = (template.design_data || [])
  .filter((l) => !l.isBackground && !l.isQr)
  .sort((a, b) => {
    const orderA = typeof a.order === 'number' ? a.order : typeof a.id === 'number' ? a.id : 0;
    const orderB = typeof b.order === 'number' ? b.order : typeof b.id === 'number' ? b.id : 0;
    return orderA - orderB;
  });

// SESUDAH
const photoSlots = getSortedPhotoSlots(template.design_data);
```

### Langkah B — Perbaiki `V1Camera.svelte`

Tambahkan import, lalu ganti definisi `photoSlots`:

```ts
// tambahkan import
import { getSortedPhotoSlots } from '$lib/utils/templateComposite';
```

```ts
// SEBELUM
let photoSlots = $derived(selectedTemplate?.design_data?.filter((l) => !l.isBackground && !l.isQr) ?? []);

// SESUDAH
let photoSlots = $derived(getSortedPhotoSlots(selectedTemplate?.design_data));
```

Biarkan sisa logic (`slotIdx`, `targetIdx`, render preview) tetap sama — mereka sudah benar secara struktur, cuma butuh `photoSlots` yang terurut dengan benar.

### Langkah C — Perbaiki `V2Session.svelte`

Sama persis polanya dengan Langkah B:

```ts
import { getSortedPhotoSlots } from '$lib/utils/templateComposite';
```

```ts
// SEBELUM
let photoSlots = $derived(selectedTemplate?.design_data?.filter((l) => !l.isBackground && !l.isQr) ?? []);

// SESUDAH
let photoSlots = $derived(getSortedPhotoSlots(selectedTemplate?.design_data));
```

### Langkah D — Perbaiki `V3Session.svelte`

Sama persis polanya dengan Langkah B & C:

```ts
import { getSortedPhotoSlots } from '$lib/utils/templateComposite';
```

```ts
// SEBELUM
let photoSlots = $derived(selectedTemplate?.design_data?.filter((l) => !l.isBackground && !l.isQr) ?? []);

// SESUDAH
let photoSlots = $derived(getSortedPhotoSlots(selectedTemplate?.design_data));
```

### Langkah E — Rapikan `V1Customize.svelte` agar pakai helper yang sama (opsional tapi disarankan)

File ini sudah benar secara hasil, tapi punya logic sorting inline yang terpisah (duplikat). Ganti agar konsisten dan tidak drift lagi:

```ts
import { getSortedPhotoSlots } from '$lib/utils/templateComposite';
```

```ts
// SEBELUM
let photoSlots = $derived(
  selectedTemplate?.design_data
    ?.filter((l) => !l.isBackground && !l.isQr)
    ?.sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : typeof a.id === 'number' ? a.id : 0;
      const orderB = typeof b.order === 'number' ? b.order : typeof b.id === 'number' ? b.id : 0;
      return orderA - orderB;
    }) ?? []
);

// SESUDAH
let photoSlots = $derived(getSortedPhotoSlots(selectedTemplate?.design_data));
```

> Sesuaikan pola exact match `SEBELUM` dengan isi file aktual saat mengedit (variasi whitespace/optional chaining mungkin sedikit berbeda) — cari definisi `photoSlots` di file tersebut dan ganti isinya sesuai `SESUDAH`.

### Langkah F — Cek pemakaian `photoSlots` lain (thumbnail/preview kategori) — tidak wajib, tapi cek konsistensi

`V1CategoryFrame.svelte` (baris ~281-282) dan `V2Frame.svelte` (baris ~370) juga punya `photoSlots` versi `.filter()` tanpa sort, tapi dipakai **hanya untuk menghitung jumlah slot** (grid kosong sebagai preview kategori/template sebelum sesi dimulai — belum ada foto asli yang di-assign). Karena tidak memetakan foto sungguhan ke slot tertentu, ini **bukan bug fungsional**. Boleh dibiarkan, tapi jika ingin konsisten penuh, silakan ganti juga ke `getSortedPhotoSlots(...)` — cukup ubah `count`/grid agar tetap render sesuai jumlah, tidak ada perubahan perilaku yang terlihat user.

---

## 4. Verifikasi Setelah Perubahan

1. **Build check**: jalankan `pnpm check` (atau `npm run check`) di `dekstop-app/` untuk memastikan tidak ada type error dari import baru.
2. **Grep konsistensi**: pastikan tidak ada lagi definisi `photoSlots` yang memakai `.filter(...)` tanpa `.sort(...)` atau tanpa memanggil `getSortedPhotoSlots`:
   ```bash
   grep -rn "design_data?.filter((l) => !l.isBackground" src/lib/components
   ```
   Setiap hasil yang muncul harus dipastikan memang untuk keperluan non-fungsional (grid/thumbnail kosong), bukan pemetaan foto aktual.
3. **Manual test skenario** (pakai booth demo/webcam mode jika tersedia):
   - Pilih template yang punya banyak slot foto (mis. `Red Spiderman 1`, 12 slot) di mana urutan objek `design_data` dari API **tidak** sama dengan urutan `order` (bisa disimulasikan dengan menambahkan template baru di admin dashboard: buat 4 slot, lalu drag-reorder salah satu slot sehingga field `order`-nya berubah tapi posisi objeknya di JSON tidak dipindah — atau minta backend dev mengubah urutan array manual untuk keperluan test).
   - Jalankan sesi capture penuh (V1/V2/V3 sesuai versi UI yang aktif).
   - Pastikan **preview di layar saat sesi berlangsung** menampilkan foto ke-N tepat di slot dengan `order = N`, sama seperti hasil akhir composite (download/print).
   - Bandingkan hasil akhir (download) dengan preview session — keduanya harus identik posisi fotonya.

---

## 5. File yang Diubah (ringkasan untuk laporan)

- `src/lib/utils/templateComposite.ts` — tambah `export function getSortedPhotoSlots()`, refactor `compositeTemplateImage()` untuk memakainya.
- `src/lib/components/v1/V1Camera.svelte` — pakai `getSortedPhotoSlots()` untuk `photoSlots`.
- `src/lib/components/v2/V2Session.svelte` — pakai `getSortedPhotoSlots()` untuk `photoSlots`.
- `src/lib/components/v3/V3Session.svelte` — pakai `getSortedPhotoSlots()` untuk `photoSlots`.
- `src/lib/components/v1/V1Customize.svelte` — refactor logic sorting inline agar pakai `getSortedPhotoSlots()` (menghapus duplikasi).
- *(Tidak ada perubahan di folder `api/` — backend sudah benar.)*

---

## 6. Setelah Selesai

Buat laporan implementasi di `dekstop-app/instructions-reports/FRAME_SLOT_ORDER_SYNC_FIX_REPORT.md` mengikuti format laporan yang sudah ada di folder tersebut (lihat `TEMPLATE_COMPOSITE_R2_STORAGE_AND_SOFTFILE_REPORT.md` sebagai contoh format), berisi:

- Ringkasan bug & root cause (inkonsistensi sorting `order` antar komponen).
- Daftar file yang diubah beserta perubahan logic-nya.
- Konfirmasi bahwa API (`api/`) tidak disentuh karena sudah mendukung `order` secara pass-through.
- Hasil verifikasi manual (langkah 4 di atas).
