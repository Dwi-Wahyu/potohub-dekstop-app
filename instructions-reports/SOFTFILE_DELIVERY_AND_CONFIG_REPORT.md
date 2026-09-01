# Laporan Implementasi Konfigurasi & Pengiriman Softfile (Per-Booth)

## Ringkasan Eksekutif

Telah diimplementasikan fitur manajemen dan pengiriman **Softfile & Digital Download** berbasis per-booth pada ekosistem **PotoHub** (Backend API, Admin Dashboard, dan Kios Desktop App).

Pengaturan softfile kini sepenuhnya fleksibel: setiap booth/kios dapat mengonfigurasi kredensial SMTP Email, token WhatsApp Gateway Fonnte, template pesan otomatis, serta mengontrol visibilitas form input Email dan WhatsApp di layar kios secara terpisah.

---

## 1. Pembaruan Backend API (`potohub-api`)

### A. Skema Data & Konfigurasi Per-Booth (`booths.settings["softfile"]`)
Konfigurasi softfile dipindahkan dari level organisasi ke skala per-booth (`booths.settings["softfile"]`), sehingga setiap lokasi photobooth memiliki branding, email pengirim, dan nomor/token WA Gateway yang berbeda.

Struct `SoftfileConfig` (Rust):
```rust
pub struct SoftfileConfig {
    pub whatsapp_enabled: Option<bool>,
    pub email_enabled: Option<bool>,
    pub softfile_expiry_days: Option<i64>,
    pub send_via_email: bool,
    pub send_via_wa: bool,
    pub smtp_host: Option<String>,
    pub smtp_port: Option<u16>,
    pub smtp_username: Option<String>,
    pub app_password: Option<String>,
    pub email_from_name: Option<String>,
    pub wa_provider: Option<String>,
    pub wa_api_token: Option<String>,
    pub wa_gateway_url: Option<String>,
    pub email_subject_template: Option<String>,
    pub email_body_template: Option<String>,
    pub wa_message_template: Option<String>,
}
```

### B. Pemisahan Endpoint Pengiriman API
Backend kini menyediakan endpoint terpisah untuk memfasilitasi kebutuhan booth client yang hanya mengirim Email, hanya WhatsApp, atau keduanya:

1. **`GET /api/booths/{boothId}/softfile-config`** & **`PUT /api/booths/{boothId}/softfile-config`**
   * Endpoint manajemen untuk Admin Dashboard dalam membaca & menyimpan konfigurasi softfile booth.
2. **`POST /api/public/softfile/send-email`**
   * Endpoint khusus untuk pengiriman link softfile ke email pelanggan via SMTP async (`lettre` crate).
3. **`POST /api/public/softfile/send-wa`**
   * Endpoint khusus untuk pengiriman pesan WA ke pelanggan via Fonnte Gateway API (`reqwest` HTTP form submission ke `https://api.fonnte.com/send`).
4. **`POST /api/public/softfile/send`**
   * Endpoint terpadu/wrapper yang menerima opsi email dan phone sekaligus.

### C. Templating Variabel Pesan Otomatis
Backend secara otomatis melakukan substitusi tag variabel pada subjek/body email dan pesan WhatsApp:
* `{customer_name}`: Nama / Kontak Pelanggan
* `{booth_name}`: Nama Booth / Brand Studio
* `{softfile_url}`: URL Halaman Web Public Softfile (`/s/{sessionId}`)
* `{expiry_days}`: Masa Retensi File (Default: 30 Hari)

---

## 2. Pembaruan Admin Dashboard (`admin-dashboard`)

### A. Tab Softfile pada `SettingsPage.svelte`
Halaman pengaturan booth (`/booths/{boothId}/settings`) pada **Tab Softfile** kini menyediakan UI pengaturan lengkap:

* **Opsi Pengiriman Kios**:
  * Toggle *Tampilkan Opsi Input Email di Kios* (`email_enabled`)
  * Toggle *Tampilkan Opsi Input WA di Kios* (`whatsapp_enabled`)
  * Quick-pick masa retensi file (`7d`, `14d`, `30d`, `60d`)
* **Konfigurasi SMTP Email**:
  * Toggle *Kirim Email Otomatis*
  * Nama Pengirim Email (`email_from_name`)
  * Server SMTP Host & Port (`smtp_host`, `smtp_port`)
  * Username Email & App Password Gmail/SMTP
  * Template Subjek & Template Body Email
* **Konfigurasi WhatsApp Gateway (Fonnte)**:
  * Toggle *Kirim WhatsApp Otomatis*
  * WA Provider (`fonnte`)
  * Fonnte API Token per booth
  * Endpoint WA Gateway URL (`https://api.fonnte.com/send`)
  * Template Pesan WhatsApp
* **Box Petunjuk Variabel**:
  * Menampilkan panduan penggunaan tag `{customer_name}`, `{booth_name}`, `{softfile_url}`, `{expiry_days}`.

### B. Perbaikan Browser Error
* **Isu**: Terjadi `Uncaught ReferenceError: booth_name is not defined` saat membuka tab Softfile karena tag `{booth_name}` pada atribut placeholder di-parse Svelte sebagai variabel JavaScript.
* **Perbaikan**: Meng-escape kurung kurawal pada atribut HTML menggunakan HTML entity (`placeholder="Softfile Foto Kamu dari &#123;booth_name&#125;"`).

---

## 3. Pembaruan Kios Desktop App (`dekstop-app`)

### A. Utilitas Pengiriman (`$lib/utils/shared.ts`)
Fungsi dipisahkan secara eksplisit:
```typescript
export async function sendSoftfileEmail(email: string, onSent: () => void, sessionId?: string): Promise<void>;
export async function sendSoftfileWA(phone: string, onSent: () => void, sessionId?: string): Promise<void>;
export async function sendSoftFile(target: string, onSent: () => void, sessionId?: string): Promise<void>;
```

### B. Pemetaan Sync Remote Settings (`boothClient.ts` & `boothConfig.svelte.ts`)
`applyRemoteSettings()` memetakan status `softfile.email_enabled` dan `softfile.whatsapp_enabled` dari handshake `/api/booths/{boothId}/settings/sync` ke dalam `boothConfig` kios.

### C. Pemisahan Form UI Kios (`V1Complete`, `V2Download`, `V3Download`)
Pada layar unduh/selesai di seluruh versi tampilan kios (`V1`, `V2`, `V3`):
* **Form Email**: Menampilkan kolom input email dan tombol **"Kirim Email"** secara independen **hanya jika `emailEnabled` bernilai `true`**.
* **Form WhatsApp**: Menampilkan kolom input nomor WA (dengan numpad) dan tombol **"Kirim WA"** secara independen **hanya jika `whatsappEnabled` bernilai `true`**.
* Jika kedua opsi diaktifkan di Admin Dashboard, kios akan menampilkan kedua form input tersebut secara terpisah.

---

## 4. Hasil Verifikasi Live API & Server Test

| Endpoint | Method | Payload Test | Result |
| :--- | :--- | :--- | :--- |
| `/api/booths/{id}/softfile-config` | `GET` | Header Bearer Token | `200 OK` (Mengembalikan `SoftfileConfig` JSON) |
| `/api/booths/{id}/softfile-config` | `PUT` | Config JSON (SMTP + Fonnte) | `200 OK` (Berhasil memperbarui settings booth) |
| `/api/public/softfile/send-email` | `POST` | `{"session_id": "...", "email": "customer@example.com"}` | `200 OK` (Memproses kirim via SMTP) |
| `/api/public/softfile/send-wa` | `POST` | `{"session_id": "...", "phone": "081234567890"}` | `200 OK` (Memproses kirim via Fonnte WA) |
| `/api/public/softfile/send` | `POST` | `{"session_id": "...", "email": "...", "phone": "..."}` | `200 OK` (Memproses kedua saluran sekaligus) |

---

## Kesimpulan

Semua komponen pengiriman softfile (SMTP Email & WhatsApp Fonnte) telah berhasil terintegrasi, dipisahkan fungsinya di kode backend & frontend, serta terhubung dengan pengaturan per-booth pada Admin Dashboard. Biner API server telah di-build dan berjalan dengan lancar.
