# Instruksi Implementasi: Rendering QR Link Softfile Langsung pada Strip Komposisi Template Frame (Desktop App)

**Target Repositori:** `dekstop-app` (Tauri + Svelte 5 + TypeScript)  
**Berkas Terkait:**  
- [`src/lib/utils/templateComposite.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/utils/templateComposite.ts)
- [`src/lib/components/v1/V1Complete.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v1/V1Complete.svelte)
- [`src/lib/components/v2/V2Download.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v2/V2Download.svelte)
- [`src/lib/components/v3/V3Download.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/v3/V3Download.svelte)

---

## 1. Ringkasan & Akar Masalah

Fungsi utama yang diharapkan: **Menempatkan QR Code hasil tautan softfile admin dashboard langsung di atas strip gambar komposisi template frame (bersama foto capture kamera, stiker, dan filter yang dipilih) setelah sesi foto selesai pada aplikasi desktop kios, di posisi yang telah diatur oleh admin di Admin Dashboard.**

### Investigasi Kode Saat Ini:
1. **Shared Function Sudah Ada & Siap**:
   Di [`src/lib/utils/templateComposite.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/utils/templateComposite.ts), fungsi `compositeTemplateImage()` sudah memiliki parameter `qrCodeText?: string` dan blok rendering:
   ```typescript
   } else if (layer.isQr) {
     if (qrCodeText) {
       // QRCode.toDataURL(qrCodeText, ...) -> ctx.drawImage(...)
     }
   }
   ```
2. **Akar Masalah (Kenapa QR Belum Masuk ke Strip Komposisi)**:
   Pada komponen akhir seluruh versi tampilan kios (`V1Complete.svelte`, `V2Download.svelte`, `V3Download.svelte`):
   - Pemanggilan `compositeTemplateImage()` dilakukan **di awal sekali** sebelum sesi transaksi database dibuat (`createTransactionSession`) dan sebelum `softfileUrl` terbentuk.
   - Parameter ke-4 (`qrCodeText`) **tidak pernah diteruskan** (bernilai `undefined`).
   - Akibatnya:
     1. Blok `layer.isQr` dilewati (tidak menggambar apapun).
     2. `compositeUrl` yang dihasilkan tidak memiliki QR Code.
     3. Gambar strip yang disimpan ke disk lokal, dicetak ke printer fisik, dan diunggah ke Cloudflare R2 via `saveSessionAssets()` tidak memiliki QR Code softfile.

---

## 2. Solusi Arsitektur: Rekayasa Urutan Eksekusi (Order of Operations)

Agar QR Code softfile tercetak langsung pada strip gambar final:
1. **Tentukan Tautan Softfile Terlebih Dahulu**:
   - **Mode Online**:
     Jalankan `createTransactionSession()` untuk memperoleh `sessionId`, lalu bentuk tautan:
     ```typescript
     const softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/${sessId}`;
     ```
   - **Mode Offline**:
     Bentuk tautan berbasis kode sesi lokal unik:
     ```typescript
     const softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/pending-${localSessionCode}`;
     ```
2. **Jalankan `compositeTemplateImage` dengan `softfileUrl`**:
   Teruskan `softfileUrl` sebagai parameter `qrCodeText`:
   ```typescript
   compositeUrl = await compositeTemplateImage(
     selectedTemplate,
     photos,
     boothFlow.selectedFilterId,
     softfileUrl,
     boothFlow.stickers
   );
   ```
3. **Simpan Aset Sesi (`saveSessionAssets`)**:
   Gambar komposit yang disimpan dan diunggah kini **sudah menyatu secara permanen** dengan QR Code di posisi `(x, y, w, h, rot)` yang dikonfigurasi admin.
4. **Cetak Printer & Tampilan Layar**:
   Hasil cetak printer otomatis memuat QR Code softfile, dan kartu QR di layar kios tetap menampilkan QR yang sama untuk kemudahan pelanggan.

---

## 3. Langkah Modifikasi Terperinci

### Langkah A — Sempurnakan Rendering QR di `src/lib/utils/templateComposite.ts`
Pastikan area di bawah QR Code selalu diberi latar belakang putih bersih (`#ffffff`) agar QR Code selalu dapat dipindai (*scannable*) meskipun ditempatkan di atas bingkai frame yang gelap, bergradasi, atau memiliki pola grafis ramai.

Ganti blok `layer.isQr` di [`src/lib/utils/templateComposite.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/utils/templateComposite.ts) baris ~273–285 menjadi:

```typescript
} else if (layer.isQr) {
  // Draw QR Code slot if softfile url/text is provided
  if (qrCodeText) {
    try {
      const qrSize = Math.max(1, Math.round(Math.max(layerW, layerH)));
      
      // 1. Gambar alas background putih bersih di bawah QR Code
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(drawX, drawY, layerW, layerH);

      // 2. Generate data URL QR Code dengan margin rapat dan ketajaman tinggi
      const qrDataUrl = await QRCode.toDataURL(qrCodeText, {
        margin: 1,
        width: qrSize,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      // 3. Render gambar QR ke kanvas
      const qrImg = await loadImage(qrDataUrl);
      if (qrImg) {
        ctx.drawImage(qrImg, drawX, drawY, layerW, layerH);
      }
    } catch (e) {
      console.warn('[templateComposite] Failed to draw QR code on canvas:', e);
    }
  }
}
```

---

### Langkah B — Perbarui Komponen `src/lib/components/v1/V1Complete.svelte`

Ubah alur di dalam `onMount` (baris ~84–160):

```typescript
onMount(async () => {
  // 1. Inisialisasi boothId & sessionCode
  try {
    boothId = await requireActiveBoothId();
  } catch (e) {
    console.error('[V1Complete] Booth tidak aktif saat simpan sesi:', e);
  }

  const localSessionCode = generateSessionCode(uiConfig.config.boothName);
  boothFlow.sessionCode = localSessionCode;

  // 2. Ambil data template
  try {
    await cachedFetch(
      `templates:${boothId}`,
      () => fetchTemplates(boothId),
      (templates) => {
        selectedTemplate =
          templates.find((t) => t.id === frameConfigId) || templates[0] || null;
      }
    );
  } catch (err) {
    console.error('Failed to fetch template:', err);
  }

  // 3. Tentukan URL Softfile (Online vs Offline)
  let softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/pending-${localSessionCode}`;
  let sessId: string | null = null;

  if (networkStatus.isOnline) {
    try {
      isSavingSession = true;
      const session = await createTransactionSession(
        boothId,
        selectedTemplate?.category_id,
        boothFlow.printQty,
        'cashless',
        frameConfigId
      );
      sessId = session.session_id || session.id || 'demo-session';
      boothFlow.sessionId = sessId;
      softfileUrl = `${ADMIN_DASHBOARD_PUBLIC_URL}/softfile/${sessId}`;
    } catch (err) {
      console.error('[V1Complete] Gagal buat sesi transaksi online, beralih ke offline code:', err);
      boothFlow.sessionId = null;
    }
  } else {
    boothFlow.sessionId = null;
  }

  // 4. Generate QR Data URL untuk kartu UI layar kios
  qrDataUrl = await QRCode.toDataURL(softfileUrl, { margin: 1, width: 200 }).catch(() => '');

  // 5. Komposisi gambar strip frame DENGAN QR Code terintegrasi
  if (selectedTemplate) {
    try {
      compositeUrl = await compositeTemplateImage(
        selectedTemplate,
        photos,
        boothFlow.selectedFilterId,
        softfileUrl,
        boothFlow.stickers
      );
    } catch (err) {
      console.error('Failed to composite template with QR:', err);
    }
  }

  // 6. Simpan aset sesi (ke disk lokal & upload Cloudflare R2)
  try {
    isSavingSession = true;
    const targetSessionIdentifier = sessId || localSessionCode;
    await saveSessionAssets(
      boothId,
      targetSessionIdentifier,
      compositeUrl,
      selectedTemplate?.width || 1200,
      selectedTemplate?.height || 1800,
      (selectedTemplate?.design_data || []).filter((l) => !l.isBackground && !l.isQr),
      selectedTemplate?.frame_image_url || selectedTemplate?.design_data?.find((l) => l.isBackground)?.imageUrl
    );
  } catch (err) {
    console.error('Failed to save session assets:', err);
  } finally {
    isSavingSession = false;
  }
});
```

---

### Langkah C — Perbarui Komponen `src/lib/components/v2/V2Download.svelte`

Terapkan restrukturisasi urutan yang sama persis seperti pada Langkah B:
1. Bentuk `localSessionCode` dan dapatkan `selectedTemplate`.
2. Jika online, jalankan `createTransactionSession` terlebih dahulu untuk mendapatkan `sessId` dan `softfileUrl`. Jika offline, gunakan `pending-${localSessionCode}`.
3. Buat kartu `qrDataUrl` untuk tampilan layar kios.
4. Panggil `compositeTemplateImage(selectedTemplate, boothFlow.photosTaken, boothFlow.selectedFilterId, softfileUrl, boothFlow.stickers)`.
5. Panggil `saveSessionAssets(...)` dengan `compositeUrl` hasil komposisi yang sudah memuat QR Code.

---

### Langkah D — Perbarui Komponen `src/lib/components/v3/V3Download.svelte`

Terapkan restrukturisasi urutan yang sama persis seperti pada Langkah B:
1. Bentuk `localSessionCode` dan dapatkan `selectedTemplate`.
2. Resolusikan `softfileUrl` (online via `createTransactionSession` atau offline fallback).
3. Panggil `compositeTemplateImage(selectedTemplate, boothFlow.photosTaken, boothFlow.selectedFilterId, softfileUrl, boothFlow.stickers)`.
4. Teruskan `compositeUrl` ke `saveSessionAssets(...)`.

---

## 4. Penanganan Kasus Khusus (Edge Cases)

1. **Template Tanpa Layer QR (`isQr` tidak diaktifkan admin)**:
   - `compositeTemplateImage` tetap berjalan mulus: karena `allLayers` tidak memiliki layer `isQr`, string `softfileUrl` tidak digambar ke strip. Foto, stiker, dan filter tetap digambar normal.
2. **Koneksi Internet Putus Saat Sesi Berlangsung**:
   - `softfileUrl` menggunakan format `pending-${localSessionCode}`.
   - QR Code yang tercetak di strip foto akan mengarahkan pelanggan ke tautan pending. Ketika koneksi internet kios pulih dan antrean *outbox job* tersinkronisasi, file otomatis terunggah ke Cloudflare R2 dengan key yang selaras.
3. **Penyelarasan Video Liveview**:
   - Fungsi `saveSessionAssets` memfilter slot video dengan `(design_data || []).filter((l) => !l.isBackground && !l.isQr)`.
   - Hal ini memastikan video liveview tidak salah menganggap slot QR Code sebagai slot rekaman kamera.

---

## 5. Checklist Pengujian & Verifikasi

- [ ] Jalankan `pnpm check` di repositori `dekstop-app` → pastikan tidak ada error TypeScript/Svelte 5.
- [ ] Jalankan aplikasi kios dalam mode dev / live (`pnpm tauri dev`).
- [ ] Lakukan sesi foto lengkap sampai halaman akhir (Download/Complete):
  - **Uji V1 (`V1Complete.svelte`)**: Amati mockup strip foto di sebelah kiri — pastikan QR Code muncul tercetak tepat di posisi yang ditentukan admin dashboard.
  - **Uji V2 (`V2Download.svelte`)**: Pastikan mockup komposit di tengah memuat QR Code.
  - **Uji V3 (`V3Download.svelte`)**: Pastikan mockup komposit di sebelah kiri memuat QR Code.
- [ ] Pindai QR Code di strip foto menggunakan kamera smartphone:
  - Pastikan link mengarah ke `{ADMIN_DASHBOARD_PUBLIC_URL}/softfile/{sessionId}` yang valid.
  - Pastikan halaman softfile berhasil terbuka dan menampilkan foto hasil capture.
- [ ] Uji cetak kertas (print): pastikan hasil print out gambar strip memiliki QR Code yang tajam dan dapat discan dengan mudah oleh smartphone.
