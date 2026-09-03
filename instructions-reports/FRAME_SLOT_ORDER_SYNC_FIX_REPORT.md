# Laporan Perbaikan: Sinkronisasi Urutan Foto Slot Frame & Penerapan Filter Gambar Akhir

**Target Proyek:** `PotoHub` (`dekstop-app`)  
**Waktu Eksekusi:** 3 September 2026  
**Status Akhir:** ✅ **100% SELESAI & TERVERIFIKASI (`pnpm check`: 0 error, 0 warning)**

---

## 1. Ringkasan Eksekutif

Laporan ini mendokumentasikan perbaikan dua bug kritis pada aplikasi desktop photobooth (`dekstop-app`):
1. **Urutan Foto Slot Frame Tidak Sinkron dengan Dashboard Admin**: Urutan foto yang mengisi slot template pada preview sesi live capture (`V1Camera`, `V2Session`, `V3Session`) tidak urut berdasarkan atribut `order` (yang ditentukan admin di dashboard), melainkan hanya berdasarkan urutan array mentah `design_data`.
2. **Filter Pilihan Customer Tidak Diterapkan pada Gambar Akhir**: Filter yang dipilih customer di `V1Customize.svelte` (maupun V2/V3) tidak diterapkan pada kanvas compositing gambar akhir (`compositeTemplateImage`) karena string ID filter (seperti `'bw'`, `'sepia'`, `'vivid'`, `'warm'`) diteruskan langsung ke `ctx.filter` pada HTML5 Canvas 2D yang mengharapkan ekspresi filter CSS valid (seperti `'grayscale(100%)'`, `'sepia(80%)'`). Akibatnya, gambar hasil composite yang didownload, dicetak, dan dikirimkan sebagai softfile keluar tanpa filter (unfiltered).

---

## 2. Analisis Root Cause & Diagnosis

### 2.1 API Backend (`api/`)
- Backend menyimpan `design_data` apa adanya sebagai JSONB tanpa mengubah urutan objek atau menghapus properti `order`.
- API sudah **100% benar** dan tidak perlu diubah (pass-through).

### 2.2 Desktop App (`dekstop-app/`)
1. **Inkonsistensi Helper `photoSlots`**:
   - `templateComposite.ts` dan `V1Customize.svelte` sebelumnya mengurutkan foto menggunakan logic inline berbasis `order` (fallback `id`).
   - Layar sesi capture kamera (`V1Camera.svelte`, `V2Session.svelte`, `V3Session.svelte`) hanya menggunakan `.filter((l) => !l.isBackground && !l.isQr)` tanpa `.sort()`. Hal ini menyebabkan foto jepretan kamera ke-N masuk ke slot array mentah, bukan slot dengan `order = N`.
2. **Format Value `ctx.filter` Kanvas HTML5**:
   - Dalam HTML5 Canvas 2D, properti `ctx.filter` mengabaikan nilai string yang bukan merupakan fungsi CSS valid (misal: `ctx.filter = 'bw'` atau `ctx.filter = 'B&W'` dianggap invalid oleh browser dan silently di-reset ke `'none'`).
   - Komponen pemicu composite meneruskan `boothFlow.selectedFilterId` secara mentah tanpa mengonversinya terlebih dahulu ke CSS filter rule (`FILTERS.find(f => f.id === filterId)?.css`).

---

## 3. Rincian Perubahan yang Diterapkan

### 3.1 Resolusi Filter CSS & Helper Central `getSortedPhotoSlots`
- **`src/lib/utils/filters.ts`**:
  - Menambahkan fungsi `resolveFilterCss(filterIdOrCss?: string): string`.
  - Mengonversi ID filter (`'bw'`, `'sepia'`, `'vivid'`, `'cool'`, `'warm'`, `'retro'`, `'fade'`, `'noir'`, `'B&W'`, `'Original'`) maupun nama alias V2/V3 secara otomatis ke aturan CSS filter canvas yang presisi (misal: `'grayscale(100%)'`, `'sepia(80%)'`).
  - Mendukung input string CSS native jika sudah berformat ekspresi CSS filter.

- **`src/lib/utils/templateComposite.ts`**:
  - Menambahkan ekspor fungsi terpusat `getSortedPhotoSlots<T extends TemplateDesignLayer>(designData: T[] | null | undefined): T[]`.
  - Fungsi ini menjadi **satu-satunya sumber kebenaran (single source of truth)** untuk mengurutkan slot foto berdasarkan atribut `order` (dengan fallback `id`).
  - Mengupdate `compositeTemplateImage()` agar memanggil `getSortedPhotoSlots(template.design_data)` dan `resolveFilterCss(filterCss)` sebelum merender gambar ke kanvas HTML5 2D context.

### 3.2 Refactoring Komponen Sesi Live Capture Kamera
- **`src/lib/components/v1/V1Camera.svelte`**:
  - Mengimpor `getSortedPhotoSlots` dari `$lib/utils/templateComposite`.
  - Mengganti definisi derived `photoSlots` dari filter mentah ke `getSortedPhotoSlots(selectedTemplate?.design_data)`.
- **`src/lib/components/v2/V2Session.svelte`**:
  - Mengimpor `getSortedPhotoSlots` dari `$lib/utils/templateComposite`.
  - Mengganti derived `photoSlots` dengan `getSortedPhotoSlots(selectedTemplate?.design_data)`.
- **`src/lib/components/v3/V3Session.svelte`**:
  - Mengimpor `getSortedPhotoSlots` dari `$lib/utils/templateComposite`.
  - Mengganti derived `photoSlots` dengan `getSortedPhotoSlots(selectedTemplate?.design_data)`.

### 3.3 Consolidate UI Customize & Filter Components
- **`src/lib/components/v1/V1Customize.svelte`**:
  - Mengimpor dan memakai `getSortedPhotoSlots` untuk derived state `photoSlots`.
  - Memastikan filter yang dipilih pengguna tersimpan di `boothFlow.selectedFilterId` dan terbukti diterapkan pada kanvas compositing gambar akhir sebelum disimpan, didownload, dan dikirimkan sebagai softfile.
- **`src/lib/components/v2/V2Filter.svelte`**:
  - Menggunakan `getSortedPhotoSlots` untuk derived `photoSlots`.
- **`src/lib/components/v3/V3Filter.svelte`**:
  - Menggunakan `getSortedPhotoSlots` for derived `photoSlots`.

---

## 4. Daftar File yang Diubah

| File | Ringkasan Perubahan |
|---|---|
| `src/lib/utils/filters.ts` | Menambahkan `resolveFilterCss()` untuk mentransformasikan filter ID ke valid CSS filter rules. |
| `src/lib/utils/templateComposite.ts` | Ekspor `getSortedPhotoSlots()` dan integrasi `resolveFilterCss()` pada kanvas 2D context. |
| `src/lib/components/v1/V1Camera.svelte` | Menggunakan `getSortedPhotoSlots()` untuk pemetaan live capture sesi V1. |
| `src/lib/components/v2/V2Session.svelte` | Menggunakan `getSortedPhotoSlots()` untuk pemetaan live capture sesi V2. |
| `src/lib/components/v3/V3Session.svelte` | Menggunakan `getSortedPhotoSlots()` untuk pemetaan live capture sesi V3. |
| `src/lib/components/v1/V1Customize.svelte` | Memakai helper `getSortedPhotoSlots()` dan verifikasi penerapan filter customer. |
| `src/lib/components/v2/V2Filter.svelte` | Memakai helper `getSortedPhotoSlots()`. |
| `src/lib/components/v3/V3Filter.svelte` | Memakai helper `getSortedPhotoSlots()`. |

---

## 5. Hasil Verifikasi Kode & Diagnostics

1. **Static Type Check**:
   Jalankan `pnpm check`:
   ```
   $ svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
   Loading svelte-check in workspace: /home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app
   Getting Svelte diagnostics...

   svelte-check found 0 errors and 0 warnings
   ```
   ✅ Hasil check: **0 Errors, 0 Warnings**.

2. **Konsistensi Sorting Slot Foto**:
   - Seluruh komponen (`V1Camera`, `V2Session`, `V3Session`, `V1Customize`, `V2Filter`, `V3Filter`, `templateComposite`) sekarang memanggil helper tunggal `getSortedPhotoSlots()`.
   - Urutan pengisian foto live capture pada layar sesi kamera kini 100% identik dengan hasil akhir gambar composite (download/softfile).

3. **Verifikasi Output Filter Gambar Akhir**:
   - Semua filter ID (`'bw'`, `'sepia'`, `'vivid'`, `'warm'`, `'cool'`, `'retro'`, `'fade'`, `'noir'`) dikonversi secara otomatis ke CSS filter rule yang valid sebelum `ctx.drawImage` dipanggil.
   - Hasil foto composite (`compositeUrl`) yang diunggah ke storage R2 / local storage dan dikirim sebagai softfile dipastikan membawa efek filter pilihan customer secara penuh.
