# Early Payment Page, Base Price, & Bypass Payment — Desktop App Report

## 1. Ringkasan Fitur & Perbaikan Bug Terkini

Implementasi fungsionalitas dan perbaikan bug alur pembayaran pada aplikasi kiosk desktop (`dekstop-app`):
1. **Perbaikan Bug Base Price Reset (35.000 $\rightarrow$ Nilai Remote)**:
   - **Penyebab**: Fungsi `applyRemoteSettings()` pada `boothClient.ts` dan `load()` pada `boothConfig.svelte.ts` sebelumnya menggunakan pengecekan tipe ketat `typeof general.base_price === 'number'`. Ketika API mengirim data dalam format serialisasi string atau ketika properti `basePrice` dibaca bergantian dengan `base_price`, kondisi tersebut mengevaluasi ke `false` sehingga jatuh ke fallback default `35000`.
   - **Solusi**: Membaca nilai dari `general.base_price ?? general.basePrice` dan mengonversi dengan `Number(...)`. Nilai hanya menggunakan default jika properti tersebut benar-benar belum pernah disetel di remote server.
2. **Pembersihan Kontrol Pembayaran dari ConfigDashboard**:
   - Sesuai instruksi, kontrol pengaturan Early Payment Page, Base Price, dan Lewati Pembayaran tidak ditempatkan di `ConfigDashboard.svelte`.
   - Pengaturan pembayaran dikelola secara terpusat melalui `admin-dashboard` (`SettingsPage.svelte`) dan otomatis diselaraskan ke desktop client saat sinkronisasi (`syncBoothSettings()`).
3. **Perbaikan Bug Tombol Kembali (Navigasi Pengaturan Mesin)**:
   - **Masalah**: Ketika menekan tombol kembali (`<` Chevron) pada `ConfigDashboard`, aplikasi kembali ke halaman login/onboarding pertama sehingga operator harus memasukkan kode aktivasi/login ulang.
   - **Analisis Root Cause**: Bukan karena token autentikasi yang gagal di-refresh. Penyebab aslinya adalah implementasi `handleBack()` pada [dekstop-app/src/routes/settings/+page.svelte](/src/routes/settings/+page.svelte) sebelumnya di-hardcode ke `goto('/onboarding')`.
   - **Solusi**: Memperbarui `handleBack()` untuk memanfaatkan riwayat navigasi (`window.history.length > 1 ? window.history.back() : goto(boothActive ? '/?journey=1' : '/onboarding')`). Navigasi kini kembali secara mulus ke layar asal (misal `/?journey=1` atau layar tes kamera) tanpa keluar dari sesi booth aktif.

---

## 2. Penyimpanan Lokal & Sinkronisasi

1. **Local State & Storage (`boothConfig.svelte.ts`)**:
   - Properti pada interface `BoothCfg`:
     - `earlyPaymentPage: boolean` (default: `true`)
     - `paymentPage: boolean` (diselaraskan)
     - `basePrice: number` (nominal Rupiah ketika early payment aktif)
     - `skipPayment: boolean` (mode pengujian / bypass)
   - Disimpan secara persisten pada `localStorage` webview (`booth_settings_{boothId}`).
2. **Sinkronisasi Otomatis & Manual (`boothClient.ts`)**:
   - Fungsi `syncBoothSettings()` mengambil response `/booths/{boothId}/settings/sync`.
   - `applyRemoteSettings()` memetakan payload `settings.general` tanpa menimpa nilai kustom yang sudah diset pengguna.

---

## 3. Komponen Acuan Harga yang Terpengaruh

| Komponen | Penanganan Harga (`basePrice`) |
| :--- | :--- |
| **`V1QRISPayment.svelte`** | Menghitung tagihan berdasarkan `effectiveBasePrice * printQty` dan menampilkan label nominal acuan. |
| **`V1PaymentMethod.svelte`** | Menampilkan badge harga paket di header dan subteks nominal pada tombol metode *Cashless*. |
| **`V2Payment.svelte`** | Menghitung `priceBase` dari `boothConfig.config.basePrice`, memperbarui total biaya pada modal kuantitas cetak (`priceBase * qty`). |
| **`V2Qris.svelte`** | Menggunakan `basePrice` untuk pembuatan QR string pembayaran dan rincian total tagihan. |
| **`V3Package.svelte`** | Menampilkan teks *"Mulai dari Rp {basePrice}"* dan mengkalkulasi nominal tagihan pada modal pemilihan kuantitas cetak. |
| **`V3Payment.svelte`** | Menggunakan `basePrice` sebagai `priceBase` tagihan QRIS dan tabel rincian harga satuan. |

---

## 4. Pengaruh Terhadap Alur Transisi Langkah (Step Flow)

### A. Versi 1 (`V1Layout.svelte`) & Custom (`CustomLayout.svelte`)
- **Bypass Payment (`skipPayment = true`)**: Langsung ke `Category Frame` $\rightarrow$ `Print Qty` $\rightarrow$ ⏭️ `Camera`.
- **Early Payment Aktif (`earlyPaymentPage = true`)**: `Welcome` $\rightarrow$ `Tutorial` $\rightarrow$ **`Method Select`** $\rightarrow$ **`Payment (QRIS / Ticket)`** $\rightarrow$ `Category Frame` $\rightarrow$ `Print Qty` $\rightarrow$ `Camera`.
- **Early Payment Nonaktif (`earlyPaymentPage = false`)**: `Welcome` $\rightarrow$ `Tutorial` $\rightarrow$ `Category Frame` $\rightarrow$ `Print Qty` $\rightarrow$ **`Method Select`** $\rightarrow$ **`Payment (QRIS / Ticket)`** $\rightarrow$ `Camera`.

### B. Versi 2 (`V2Layout.svelte`)
- **Bypass Payment (`skipPayment = true`)**: ⏭️ Langsung ke pemilihan `Frame` $\rightarrow$ `Session`.
- **Early Payment Aktif (`earlyPaymentPage = true`)**: `Payment` diawal $\rightarrow$ `Frame` $\rightarrow$ `Session`.
- **Early Payment Nonaktif (`earlyPaymentPage = false`)**: `Frame` dipilih lebih dulu $\rightarrow$ `Payment` $\rightarrow$ `Session`.

### C. Versi 3 (`V3Layout.svelte`)
- **Bypass Payment (`skipPayment = true`)**: ⏭️ Langsung ke pemilihan `Frame` $\rightarrow$ `Session`.
- **Early Payment Aktif (`earlyPaymentPage = true`)**: `Package & Payment` diawal $\rightarrow$ `Frame` $\rightarrow$ `Session`.
- **Early Payment Nonaktif (`earlyPaymentPage = false`)**: `Frame` dipilih lebih dulu $\rightarrow$ `Package & Payment` $\rightarrow$ `Session`.

---

## 5. Hasil Verifikasi & Kompilasi
- Perintah build: `npm run build` pada folder `dekstop-app`.
- Hasil: **Sukses tanpa error (Exit Code 0)**, build output tersimpan pada direktori `build/`.
