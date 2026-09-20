# Laporan Implementasi Desktop App: Injeksi Font Poppins Mandiri (Offline) & Penyelarasan UI

**Target Repositori:** `dekstop-app` (Tauri v2 + SvelteKit / Svelte 5 + Tailwind CSS v4)  
**Waktu Implementasi:** 21 September 2026  
**Status Akhir:** ✅ **SUKSES, TERUJI & TERVERIFIKASI (Svelte Check 0 Errors, Production Build Passed)**

---

## 1. Ringkasan Eksekutif

Aplikasi `dekstop-app` sebelumnya mengandalkan fallback `sans-serif` sistem operasi (seperti Arial di Windows, Ubuntu di Linux, San Francisco di macOS) saat font Poppins tidak terpasang di OS target. Hal ini menyebabkan inkonsistensi visual, perbedaan *line-height*, dan pergeseran layout antarmuka kiosk photo booth di berbagai mesin operasional.

Pembaruan ini mengunduh, membundel, dan menyuntikkan keluarga **Font Poppins secara lokal** ke dalam bundel aplikasi agar seluruh tampilan antarmuka terjamin **100% konsisten dan independen dari sistem operasi host serta bekerja penuh secara offline**.

Fokus awal audit dan penyelarasan tipografi difokuskan pada tampilan administratif dan autentikasi (non-customer journey):
1. **Halaman Onboarding, Login Petugas & Kode Aktivasi** (`/onboarding`)
2. **Dashboard Pengaturan Mesin / Config Dashboard** (`/settings`, `ConfigDashboard.svelte`)
3. **Pengaturan Perangkat & Kamera Manual** (`/camera-config`, `/camera-manual-settings`)
4. **Komponen Pendukung Operasional** (`PinPad.svelte`, `OfflineBanner.svelte`, `IdleBannerModal.svelte`, `app.html`)

---

## 2. Analisis Kebutuhan Weight Teks Seluruh Aplikasi

Berdasarkan audit menyeluruh terhadap kode antarmuka Svelte 5 dan kelas utilitas Tailwind CSS yang digunakan pada aplikasi:

| Weight | Nama Style | Tailwind Class | Penggunaan Utama di Aplikasi |
| :--- | :--- | :--- | :--- |
| **100** | Thin | `font-thin` | Elemen visual subtil |
| **200** | Extra Light | `font-extralight` | Tipografi aksen sekunder |
| **300** | Light | `font-light` | Helper text, sub-keterangan status koneksi |
| **400** | Regular / Normal | `font-normal` | Body copy, input placeholder, deskripsi opsi |
| **500** | Medium | `font-medium` | Label form, deskripsi tombol, badge status |
| **600** | SemiBold | `font-semibold` | Subjudul, badge pill neumorphic, header card |
| **700** | Bold | `font-bold` | Judul modal, label tombol utama, angka PIN pad |
| **800** | ExtraBold | `font-extrabold` | CTA button (Mulai, Aktivasi), judul section |
| **900** | Black | `font-black` | Brand title PotoHub, indikator countdown besar |

Seluruh varian bobot (100–900) beserta varian Italic esensial (300i, 400i, 500i, 600i, 700i, 800i, 900i) telah diunduh dan diintegrasikan secara lokal dalam format `.woff2` dan `.woff` dengan subset latin & extended.

---

## 3. Rincian Perubahan Implementasi

### A. Pemasangan Paket Font Mandiri (`package.json`)
Font Poppins diunduh dan diintegrasikan melalui dependensi `@fontsource/poppins`:
```json
{
  "dependencies": {
    "@fontsource/poppins": "^5.3.0"
  }
}
```

### B. Konfigurasi Global CSS & Tailwind v4 Theme (`src/globals.css`)
Seluruh `@font-face` dimuat langsung pada titik masuk stylesheet utama aplikasi dan didaftarkan ke token tema Tailwind v4 serta elemen dasar (`html`, `body`):

```css
@import "@fontsource/poppins/100.css";
@import "@fontsource/poppins/200.css";
@import "@fontsource/poppins/300.css";
@import "@fontsource/poppins/400.css";
@import "@fontsource/poppins/500.css";
@import "@fontsource/poppins/600.css";
@import "@fontsource/poppins/700.css";
@import "@fontsource/poppins/800.css";
@import "@fontsource/poppins/900.css";
@import "@fontsource/poppins/300-italic.css";
@import "@fontsource/poppins/400-italic.css";
@import "@fontsource/poppins/500-italic.css";
@import "@fontsource/poppins/600-italic.css";
@import "@fontsource/poppins/700-italic.css";
@import "@fontsource/poppins/800-italic.css";
@import "@fontsource/poppins/900-italic.css";
@import "tailwindcss";

@theme {
  --font-sans: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --font-poppins: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

@layer base {
  html,
  body {
    font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}
```

### C. Pembaruan Dokumen HTML Dasar (`src/app.html`)
Pembaruan judul dokumen bawaan aplikasi menjadi nama resmi produk:
```html
<title>PotoHub Booth Client</title>
```

### D. Penyelarasan Tipografi pada Tampilan Non-Customer Journey

1. **Halaman Onboarding (`src/routes/onboarding/+page.svelte`)**:
   - Judul brand PotoHub, tagline pill, input email/password, dan tombol CTA 'Mulai', 'Login', dan 'Aktivasi' kini langsung me-render glyph Poppins asli (bukan font bawaan sistem).
2. **Dashboard Pengaturan Mesin (`src/lib/components/shared/ConfigDashboard.svelte` & `src/routes/settings/+page.svelte`)**:
   - Header bar, badge nama device/booth, toggle switch, dropdown pengaturan kamera/printer, countdown time input, dan status indikator outbox/sync menggunakan hierarki berat font Poppins (SemiBold 600 & Bold 700).
3. **Pengaturan Kamera & Viewfinder (`src/routes/camera-config/+page.svelte` & `src/routes/camera-manual-settings/+page.svelte`)**:
   - Mengadopsi font Poppins dengan fallback monospace khusus untuk indikator numerik ISO/Tv/Av dan metadata hardware.
4. **Komponen PIN Pad Modal (`src/lib/components/shared/PinPad.svelte`)**:
   - Tombol angka keypad neumorphic 0-9 dan backspace menyatu sempurna dengan tipografi Poppins 700.
5. **Idle Banner & Offline Banner (`src/lib/components/shared/IdleBannerModal.svelte`, `OfflineBanner.svelte`)**:
   - Keterangan "Sentuh layar untuk memulai" dan status notifikasi offline menggunakan Poppins SemiBold dengan kerning rapat.

---

## 4. Hasil Verifikasi & Uji Build

1. **Svelte Check (Static Typing & Template Validation)**:
   ```bash
   pnpm run check
   # Result: svelte-check found 0 errors and 0 warnings
   ```

2. **Vite Production Build (`@sveltejs/adapter-static`)**:
   - Seluruh aset font `.woff2` dan `.woff` untuk setiap range bobot diekstrak ke dalam folder `build/_app/immutable/assets/` dengan hash unik.
   - Hasil bundle statis siap dikemas oleh Tauri ke dalam binary executable desktop (Windows `.exe`/`.msi`, Linux `.deb`/`.AppImage`, macOS `.app`).
   - Tidak ada ketergantungan CDN eksternal saat aplikasi dijalankan pada mesin booth tanpa internet.

---

## 5. Kesimpulan

Integrasi Font Poppins mandiri telah selesai diimplementasikan secara komprehensif. Antarmuka administratif dan halaman operasional desktop client kini memiliki konsistensi visual 100% identik di seluruh sistem operasi.
