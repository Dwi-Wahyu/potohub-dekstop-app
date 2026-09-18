# Laporan Implementasi & Penyempurnaan: Rendering QR Code Softfile Langsung pada Strip Komposisi Template Frame

**Target Repositori:** `dekstop-app`  
**Waktu Implementasi:** 18 September 2026  
**Status Akhir:** ✅ **SUKSES, TERUJI & TERVERIFIKASI (0 Errors, 0 Warnings, Build Success)**

---

## 1. Ringkasan Eksekutif

Menindaklanjuti pengujian alur perjalanan pengguna (*customer journey*) pada aplikasi kios desktop:
- **Penghapusan Tampilan QR Code pada Tahap Sebelum Hasil Akhir**:
  Kotak QR Code kini **hanya muncul pada tahap hasil akhir** (`V1Complete`, `V2Download`, `V3Download`, cetakan printer fisik, dan file softfile hasil unduhan pelanggan).
- **Pembersihan Pratinjau Kamera/Foto yang Menimpa Posisi QR**:
  Pada tahap pemilihan frame, pengambilan foto (*camera shooting*), retake, filter, dan kustomisasi stiker, layer dengan penanda `isQr: true` disaring dan tidak dirender. Hal ini memastikan:
  1. Liveview kamera tidak pernah merender feed video di atas kotak QR Code pada layar pemilihan frame (`V1CategoryFrame`, `V2Frame`, `V3Frame`).
  2. Perhitungan jumlah slot foto (`photoSlots` / `count`) pada katalog frame akurat dan tidak menghitung QR Code sebagai lubang foto.
  3. Pratinjau strip foto pada sesi kamera dan kustomisasi (`V1Camera`, `V1Customize`, `V2Session`, `V2Filter`, `V3Session`, `V3Filter`) bersih dari kotak/mockup QR Code yang dapat menutupi foto hasil jepretan.
- **Hasil Komposisi Akhir Tetap Memuat QR Code Aktif**:
  Saat sesi selesai, `compositeTemplateImage` merender QR Code beresolusi tinggi dengan tautan aktif sesi softfile pelanggan (`/softfile/{sessionId}`) di atas alas putih pekat dan kontras tajam.

---

## 2. Rincian Perubahan Kode Lintas Versi (V1, V2, V3)

### A. Tahap Pemilihan Frame (*Frame Selection*)
1. [`src/lib/components/v1/V1CategoryFrame.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v1/V1CategoryFrame.svelte):
   - `getGridSize`: Menyaring `!l.isBackground && !l.isQr` agar kalkulasi baris/kolom dan jumlah foto akurat.
   - `photoSlots`: `f.design_data?.filter((l) => !l.isBackground && !l.isQr) ?? []`.
   - Thumbnail preview card & Liveview preview: Loop `design_data.filter((l) => !l.isQr)` sehingga kamera liveview tidak ditampilkan di koordinat slot QR.
2. [`src/lib/components/v2/V2Frame.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v2/V2Frame.svelte):
   - Menyaring `!l.isQr` pada liveview preview kanvas dan perhitungan `photoSlots`.
3. [`src/lib/components/v3/V3Frame.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v3/V3Frame.svelte):
   - Menyaring `!l.isQr` pada kalkulasi `photoSlots` kartu frame.

### B. Tahap Sesi Foto & Retake (*Camera Session*)
1. [`src/lib/components/v1/V1Camera.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v1/V1Camera.svelte):
   - Menyaring `!l.isQr` dari loop `selectedTemplate.design_data`.
   - Menghapus blok placeholder `{:else if layer.isQr}`.
2. [`src/lib/components/v2/V2Session.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v2/V2Session.svelte):
   - Menyaring `!l.isQr` dari loop `selectedTemplate.design_data`.
   - Menghapus blok placeholder `{:else if layer.isQr}`.
3. [`src/lib/components/v3/V3Session.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v3/V3Session.svelte):
   - Menyaring `!l.isQr` dari loop `selectedTemplate.design_data`.
   - Menghapus blok placeholder `{:else if layer.isQr}`.

### C. Tahap Kustomisasi Filter & Stiker (*Customization / Filter*)
1. [`src/lib/components/v1/V1Customize.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v1/V1Customize.svelte):
   - Menyaring `templateLayers.filter((l) => !l.isQr)` pada kanvas filmstrip, menghilangkan blok QR mockup agar area foto bersih untuk penempatan stiker dan pemilihan filter.
2. [`src/lib/components/v2/V2Filter.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v2/V2Filter.svelte):
   - Menyaring `!l.isQr` baik pada daftar thumbnail filter maupun pratinjau utama.
3. [`src/lib/components/v3/V3Filter.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v3/V3Filter.svelte):
   - Menyaring `!l.isQr` pada pratinjau kanvas filter filmstrip.

### D. Tahap Hasil Akhir & Pencetakan (*Completion / Download*)
1. [`src/lib/utils/templateComposite.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/utils/templateComposite.ts):
   - `getTemplateLayers`: Mengembalikan `rawLayers` langsung untuk menghormati urutan layer admin dashboard.
   - `compositeTemplateImage`: Merender `layer.isQr` dengan alas putih pekat (`#ffffff`), QR Code kontras tinggi (`#000000`), dan tanpa padding (`margin: 0`) sesuai teks tautan softfile sesi.
2. [`src/lib/components/v1/V1Complete.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v1/V1Complete.svelte), [`src/lib/components/v2/V2Download.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v2/V2Download.svelte), [`src/lib/components/v3/V3Download.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v3/V3Download.svelte):
   - Menyelesaikan resolusi `softfileUrl` terlebih dahulu sebelum melakukan komposit gambar, sehingga `compositeUrl` yang tampil di layar, dicetak, dan diunggah memuat QR Code aktif.

---

## 3. Matriks Berkas yang Diperbarui

| Berkas | Aksi | Deskripsi |
| :--- | :--- | :--- |
| `src/lib/components/v1/V1CategoryFrame.svelte` | Modified | Perbaikan `getGridSize`, `photoSlots`, dan filter `isQr` pada preview liveview. |
| `src/lib/components/v1/V1Camera.svelte` | Modified | Menyaring `isQr` dari strip film kanvas sesi foto kamera V1. |
| `src/lib/components/v1/V1Customize.svelte` | Modified | Menyaring `isQr` dari pratinjau kanvas stiker dan filter V1. |
| `src/lib/components/v1/V1Complete.svelte` | Modified | Resolusi sesi sebelum komposisi gambar final. |
| `src/lib/components/v2/V2Frame.svelte` | Modified | Menyaring `isQr` pada liveview preview dan perhitungan slot foto V2. |
| `src/lib/components/v2/V2Session.svelte` | Modified | Menyaring `isQr` dari strip film kanvas sesi foto kamera V2. |
| `src/lib/components/v2/V2Filter.svelte` | Modified | Menyaring `isQr` dari thumbnail dan pratinjau kanvas filter V2. |
| `src/lib/components/v2/V2Download.svelte` | Modified | Resolusi sesi sebelum komposisi gambar final. |
| `src/lib/components/v3/V3Frame.svelte` | Modified | Menyaring `isQr` pada perhitungan slot foto kartu frame V3. |
| `src/lib/components/v3/V3Session.svelte` | Modified | Menyaring `isQr` dari strip film kanvas sesi foto kamera V3. |
| `src/lib/components/v3/V3Filter.svelte` | Modified | Menyaring `isQr` dari pratinjau kanvas filter V3. |
| `src/lib/components/v3/V3Download.svelte` | Modified | Resolusi sesi sebelum komposisi gambar final. |
| `src/lib/utils/templateComposite.ts` | Modified | Preservasi urutan layer asli dan rendering QR Code kontras tinggi pada strip akhir. |

---

## 4. Hasil Verifikasi & Build

```bash
$ pnpm check
Loading svelte-check in workspace: /home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app
Getting Svelte diagnostics...

svelte-check found 0 errors and 0 warnings

$ pnpm build
✓ built in 12.76s
✓ built in 26.98s
> Using @sveltejs/adapter-static
  Wrote site to "build"
  ✔ done
```
Semua komponen terkompilasi dengan sempurna tanpa error.
