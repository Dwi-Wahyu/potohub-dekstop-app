# API Specification & Master Documentation — Photobooth Management Platform

**Base URL**: `http://localhost:8080` (Development) / `https://api.photobooth.com` (Production)  
**Authentication**: HTTP Bearer Token (`Authorization: Bearer <JWT_TOKEN>`)  
**Content-Type**: `application/json`  
**API Version**: `v1` (Actix Web Backend)

---

## 1. Directory of Modular API Specifications

Untuk memudahkan pemeliharaan dan pemahaman yang mendalam, dokumentasi endpoint API dipecah menjadi modul-modul spesifik di direktori [docs/api/](/api/docs/api/).

| No     | Modul & Fitur                       | File Spesifikasi Lengkap                                       | Cakupan Endpoint & Ringkasan                                                                                                                     |
| :----- | :---------------------------------- | :------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| **01** | **Authentication**                  | [01_auth.md](/api/docs/api/01_auth.md)                         | `/api/auth/login`, `/me`, `/refresh`, `/forgot-password`, `/reset-password`, `/logout` (Manajemen JWT, Refresh Token, dan RBAC).                 |
| **02** | **Organization**                    | [02_organization.md](/api/docs/api/02_organization.md)         | `/api/organization/profile`, `/payment-config` (Profil tenant).                                                                                  |
| **03** | **Booth Management**                | [03_booths.md](/api/docs/api/03_booths.md)                     | `/api/booths`, `/activate`, `/{id}/activation-code` (Registrasi stasiun booth fisik & pairing desktop).                                          |
| **04** | **Frame Categories**                | [04_categories.md](/api/docs/api/04_categories.md)             | `/api/categories`, `/api/booths/{id}/categories`, `/upload-url`, `/link`, `/unlink` (Master kategori, upload R2 banner, & pemetaan multi-booth). |
| **05** | **Frame Templates & Canvas**        | [05_templates.md](/api/docs/api/05_templates.md)               | `/api/booths/{boothId}/templates` (Ukuran kertas 4R/6x8/2x6/6x6, slot layer foto, dan aset frame).                                               |
| **06** | **Booth Settings & Sync**           | [06_settings.md](/api/docs/api/06_settings.md)                 | `/api/booths/{boothId}/settings`, `/{group}`, `/sync` (Konfigurasi timer, printer, kamera, softfile).                                            |
| **07** | **Transactions & Payments**         | [07_transactions.md](/api/docs/api/07_transactions.md)         | `/api/booths/{boothId}/transactions` (Sesi pemesanan, kalkulasi harga, Dynamic QRIS DOKU).                                                       |
| **08** | **Payment Webhooks**                | [08_payments_webhook.md](/api/docs/api/08_payments_webhook.md) | `/api/payments/webhook` (Verifikasi signature HMAC SHA256 & auto-unlock booth client).                                                           |
| **09** | **Photo Gallery & Uploads**         | [09_gallery.md](/api/docs/api/09_gallery.md)                   | `/api/booths/{boothId}/gallery`, `/upload-url` (Presigned S3 PUT URL ke Cloudflare R2).                                                          |
| **10** | **Hardware Telemetry & Command**    | [10_devices.md](/api/docs/api/10_devices.md)                   | `/api/booths/{boothId}/device-status`, `/command` (Monitoring printer/kamera/kertas & remote action).                                            |
| **11** | **Analytics & Reports**             | [11_analytics.md](/api/docs/api/11_analytics.md)               | `/api/booths/{boothId}/analytics/revenue` (Laporan omset harian, jumlah sesi foto, performa booth).                                              |
| **12** | **CRM & Customers**                 | [12_customers.md](/api/docs/api/12_customers.md)               | `/api/customers` (Database pelanggan, riwayat kunjungan, penerima softfile WA & Email).                                                          |
| **13** | **Discount Vouchers**               | [13_vouchers.md](/api/docs/api/13_vouchers.md)                 | `/api/vouchers`, `/{code}/validate` (Kode kupon diskon nominal/persentase & validasi instan).                                                    |
| **14** | **Subscription Paywall**            | [14_subscriptions.md](/api/docs/api/14_subscriptions.md)       | `/api/subscription` (Status lisensi SaaS multi-booth & pengecekan fitur aktif).                                                                  |
| **15** | **WebSocket Real-time Sync**        | [15_websocket.md](/api/docs/api/15_websocket.md)               | `/sync` (Koneksi full-duplex realtime event unlock pembayaran, telemetri, dan notifikasi).                                                       |
| **16** | **UI Customization (Booth Client)** | [16_ui_customization.md](/api/docs/api/16_ui_customization.md) | `/api/booths/{boothId}/ui-customize/*` (Tema, latar belakang booth, tipografi, dan metode pembayaran).                                           |
| **17** | **Emots & Stickers (Booth Client)** | [17_emots.md](/api/docs/api/17_emots.md)                       | `/api/booths/{boothId}/emots/*` (CRUD Emot/Stiker, emoji unicode, upload gambar R2 & link eksternal).                                            |
| **18** | **Promo Banners (Multi-Booth)**     | [18_banners.md](/api/docs/api/18_banners.md)                   | `/api/banners`, `/api/booths/{boothId}/banners/*` (Master Banner, Many-to-Many mapping booth, jadwal aktif & R2 upload).                         |
| **21** | **QR Tickets Management**           | [21_qr_tickets.md](/api/docs/api/21_qr_tickets.md)             | `/api/booths/{boothId}/qr-tickets`, `/api/qr-tickets/validate`, `/redeem` (Generasi tiket QR, kasir manual, validasi & klaim booth).             |

---

## 2. Sorotan Utama: Fitur UI Customization

Dokumentasi lengkap dan arsitektur teknis untuk **UI Customization** dapat dilihat pada:
👉 **[16_UI_CUSTOMIZATION.md](/api/docs/api/16_ui_customization.md)**

### Fitur Kunci:

1. **Latar Belakang Booth Client (Per-Step)**:
   - **None / Default**: Background transparan / default layout (`none`).
   - **Warna Solid**: Kode HEX standar (misal `#121212`, `#0F172A`).
   - **Gradient CSS**: Formula gradient modern (misal `linear-gradient(135deg, #1f1c2c 0%, #928dab 100%)`).
   - **Pengaturan Per Step**: Kustomisasi spesifik untuk masing-masing step (`start`, `tutorial`, `package`, `payment`, `ticket`, `frame`, `session`, `filter`, `loading`, `download`, `softfile`).
2. **Kustomisasi Tipografi Elemen**:
   - Pengaturan ukuran font (`kecil`, `sedang`, `besar`), font family (`sans_serif`, `serif`, `monospace`), dan warna font per elemen kunci (`booth_name`, `tagline`, `payment_title`, dsb.).
3. **Daftar & Urutan Pembayaran**:
   - Mengatur metode pembayaran yang aktif dan urutan tampilan visual pada layar transaksi desktop client.
4. **Posisi Elemen (Drag & Drop)**:
   - Menyimpan posisi X/Y (persentase, anchor tengah) per elemen visual, dimulai dari tombol Start.
   - Mendukung guideline snap-to-center horizontal & vertikal di sisi Admin Dashboard.

---

## 3. OpenAPI (Swagger UI) & Interactive Docs

Backend menyediakan dokumentasi Swagger UI interaktif yang dapat diakses langsung pada:

- **URL**: `http://localhost:8080/docs/`
- **OpenAPI JSON Spec**: `http://localhost:8080/api-docs/openapi.json`
