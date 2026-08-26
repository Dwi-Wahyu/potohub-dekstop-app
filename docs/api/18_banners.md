# 18. Promo Banners Specification (`/api/banners`, `/api/booths/{boothId}/banners`)

## 1. Overview & Architecture

Modul **Promo Banners** memungkinkan pengelolaan banner promosi dan pengumuman visual di level organisasi yang dapat ditautkan ke **banyak booth sekaligus** (*Many-to-Many* melalui tabel `booth_banners`). 

Aplikasi **Booth Client** (Tauri Desktop App) menggunakan banner aktif ini untuk ditampilkan secara bergiliran (*slideshow carousel*) pada layar *Standby / Screensaver* saat tidak ada sesi transaksi yang berlangsung.

```mermaid
graph TD
    subgraph Admin Web Dashboard
        A[Admin / Owner] -->|1. POST /api/banners/upload-url| B[Photobooth API]
        B -->|S3 Presigned PUT URL| A
        A -->|2. Upload Image File| C[(Cloudflare R2 Storage)]
        A -->|3. POST /api/banners with booth_ids| B
        B -->|Save Master & Relasi| D[(banners & booth_banners)]
    end

    subgraph Desktop Booth Client
        E[Booth Client Standby Screen] -->|GET /api/booths/{boothId}/banners| B
        B -->|Return Active & Scheduled Banners| E
        E -->|Render Carousel Slideshow| E
    end
```

- **Base Paths**: `/api/banners` (Master Organisasi) & `/api/booths/{boothId}/banners` (Khusus Booth)
- **Security**: Bearer JWT (`Authorization: Bearer <token>`).
- **Authorization**: Endpoint pembacaan (`GET`) dapat diakses oleh user terautentikasi dan booth client. Endpoint penulisan (`POST`, `PUT`, `DELETE`) membutuhkan hak akses `Owner` atau `SuperAdmin`.

---

## 2. Struktur Data Database

### 2.1 Tabel Master `banners`
| Atribut | Tipe | Default | Deskripsi |
|---|---|---|---|
| `id` | `UUID` | UUID v7 | Identifier unik banner promo |
| `organization_id` | `UUID` | - | Relasi foreign key ke tabel `organizations(id)` (CASCADE) |
| `title` | `VARCHAR(255)` | - | Judul banner promo (contoh: `"Promo Kemerdekaan Diskon 20%"`) |
| `image_url` | `TEXT` | - | URL publik gambar banner beresolusi tinggi di Cloudflare R2 |
| `start_date` | `TIMESTAMPTZ` | `NULL` | Waktu mulai penayangan banner (opsional) |
| `end_date` | `TIMESTAMPTZ` | `NULL` | Waktu berakhir penayangan banner (opsional) |
| `is_active` | `BOOLEAN` | `TRUE` | Status aktif/tampil banner |
| `position` | `INT` | `0` | Urutan indeks urutan tampilan pada slide |
| `created_at` | `TIMESTAMPTZ` | `NOW()` | Timestamp pembuatan |
| `updated_at` | `TIMESTAMPTZ` | `NOW()` | Timestamp modifikasi terakhir |

### 2.2 Tabel Relasi `booth_banners`
| Atribut | Tipe | Deskripsi |
|---|---|---|
| `booth_id` | `UUID` | Relasi foreign key ke `booths(id)` (CASCADE) |
| `banner_id` | `UUID` | Relasi foreign key ke `banners(id)` (CASCADE) |
| `created_at` | `TIMESTAMPTZ` | Timestamp penautan |
| **PRIMARY KEY** | `(booth_id, banner_id)` | Menjamin satu banner hanya tertaut 1x per booth |

---

## 3. Spesifikasi Endpoint REST

### 3.1 List Master Banners (`GET /api/banners`)

Mengambil seluruh banner promosi milik organisasi terautentikasi beserta daftar ID booth yang ditautkan (`assigned_booth_ids`).

- **Method**: `GET`
- **Endpoint**: `/api/banners`
- **Auth Required**: Yes (`Bearer <token>`)

#### Response Success (`200 OK`)
```json
[
  {
    "id": "01928374-1111-7777-8888-000000000010",
    "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
    "title": "Promo Diskon HUT RI 2026",
    "image_url": "https://pub-r2.potohub.com/org-uuid/banners/hut_ri_banner.png",
    "start_date": "2026-08-01T00:00:00Z",
    "end_date": "2026-08-31T23:59:59Z",
    "is_active": true,
    "position": 0,
    "assigned_booth_ids": [
      "01928374-aaaa-bbbb-cccc-112233445566",
      "01928374-aaaa-bbbb-cccc-223344556677"
    ],
    "created_at": "2026-08-21T00:50:00Z",
    "updated_at": "2026-08-21T00:50:00Z"
  }
]
```

---

### 3.2 Request Presigned Upload URL R2 (`POST /api/banners/upload-url`)

Menghasilkan S3 Presigned PUT URL agar browser/dashboard admin dapat mengunggah file banner langsung ke Cloudflare R2.

- **Method**: `POST`
- **Endpoint**: `/api/banners/upload-url`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Request Body
```json
{
  "file_extension": "jpg",
  "content_type": "image/jpeg"
}
```

#### Response Success (`200 OK`)
```json
{
  "upload_url": "https://<account-id>.r2.cloudflarestorage.com/potohub-bucket/org-uuid/banners/01928374_1771636000.jpg?X-Amz-Signature=...",
  "public_url": "https://pub-r2.potohub.com/org-uuid/banners/01928374_1771636000.jpg",
  "file_key": "org-uuid/banners/01928374_1771636000.jpg",
  "expires_in_secs": 900
}
```

---

### 3.3 Create Master Banner (`POST /api/banners`)

Menyimpan banner baru beserta daftar stasiun booth yang akan ditautkan (`booth_ids`).

- **Method**: `POST`
- **Endpoint**: `/api/banners`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Request Body
```json
{
  "title": "Valentine Weekend Special",
  "image_url": "https://pub-r2.potohub.com/org-uuid/banners/valentine.png",
  "start_date": "2027-02-10T00:00:00Z",
  "end_date": "2027-02-15T23:59:59Z",
  "is_active": true,
  "position": 1,
  "booth_ids": [
    "01928374-aaaa-bbbb-cccc-112233445566"
  ]
}
```

#### Response Success (`201 Created`)
```json
{
  "id": "01928374-1111-7777-8888-000000000011",
  "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "title": "Valentine Weekend Special",
  "image_url": "https://pub-r2.potohub.com/org-uuid/banners/valentine.png",
  "start_date": "2027-02-10T00:00:00Z",
  "end_date": "2027-02-15T23:59:59Z",
  "is_active": true,
  "position": 1,
  "assigned_booth_ids": [
    "01928374-aaaa-bbbb-cccc-112233445566"
  ],
  "created_at": "2026-08-21T00:52:00Z",
  "updated_at": "2026-08-21T00:52:00Z"
}
```

---

### 3.4 Get Banner Details (`GET /api/banners/{id}`)

- **Method**: `GET`
- **Endpoint**: `/api/banners/{id}`
- **Auth Required**: Yes

#### Response Success (`200 OK`)
```json
{
  "id": "01928374-1111-7777-8888-000000000011",
  "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "title": "Valentine Weekend Special",
  "image_url": "https://pub-r2.potohub.com/org-uuid/banners/valentine.png",
  "start_date": "2027-02-10T00:00:00Z",
  "end_date": "2027-02-15T23:59:59Z",
  "is_active": true,
  "position": 1,
  "assigned_booth_ids": [
    "01928374-aaaa-bbbb-cccc-112233445566"
  ],
  "created_at": "2026-08-21T00:52:00Z",
  "updated_at": "2026-08-21T00:52:00Z"
}
```

---

### 3.5 Update Banner (`PUT /api/banners/{id}`)

- **Method**: `PUT`
- **Endpoint**: `/api/banners/{id}`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Request Body
```json
{
  "title": "Valentine Weekend Super Special",
  "is_active": true,
  "booth_ids": [
    "01928374-aaaa-bbbb-cccc-112233445566",
    "01928374-aaaa-bbbb-cccc-223344556677"
  ]
}
```

#### Response Success (`200 OK`)
```json
{
  "id": "01928374-1111-7777-8888-000000000011",
  "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "title": "Valentine Weekend Super Special",
  "image_url": "https://pub-r2.potohub.com/org-uuid/banners/valentine.png",
  "start_date": "2027-02-10T00:00:00Z",
  "end_date": "2027-02-15T23:59:59Z",
  "is_active": true,
  "position": 1,
  "assigned_booth_ids": [
    "01928374-aaaa-bbbb-cccc-112233445566",
    "01928374-aaaa-bbbb-cccc-223344556677"
  ],
  "created_at": "2026-08-21T00:52:00Z",
  "updated_at": "2026-08-21T00:54:00Z"
}
```

---

### 3.6 Delete Banner (`DELETE /api/banners/{id}`)

- **Method**: `DELETE`
- **Endpoint**: `/api/banners/{id}`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Response Success (`200 OK`)
```json
{
  "message": "Banner deleted successfully"
}
```

---

### 3.7 List Active Banners for Booth (`GET /api/booths/{boothId}/banners`)

Mengambil daftar banner yang aktif dan berlaku saat ini untuk booth spesifik (digunakan oleh Booth Client).

- **Method**: `GET`
- **Endpoint**: `/api/booths/{boothId}/banners`
- **Auth Required**: Yes

#### Response Success (`200 OK`)
```json
[
  {
    "id": "01928374-1111-7777-8888-000000000010",
    "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
    "title": "Promo Diskon HUT RI 2026",
    "image_url": "https://pub-r2.potohub.com/org-uuid/banners/hut_ri_banner.png",
    "start_date": "2026-08-01T00:00:00Z",
    "end_date": "2026-08-31T23:59:59Z",
    "is_active": true,
    "position": 0,
    "created_at": "2026-08-21T00:50:00Z",
    "updated_at": "2026-08-21T00:50:00Z"
  }
]
```

---

### 3.8 Link Banner to Booth (`POST /api/booths/{boothId}/banners/{bannerId}/link`)

- **Method**: `POST`
- **Endpoint**: `/api/booths/{boothId}/banners/{bannerId}/link`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Response Success (`200 OK`)
```json
{
  "message": "Banner linked to booth successfully",
  "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
  "banner_id": "01928374-1111-7777-8888-000000000010"
}
```

---

### 3.9 Unlink Banner from Booth (`DELETE /api/booths/{boothId}/banners/{bannerId}/unlink`)

- **Method**: `DELETE`
- **Endpoint**: `/api/booths/{boothId}/banners/{bannerId}/unlink`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Response Success (`200 OK`)
```json
{
  "message": "Banner unlinked from booth successfully",
  "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
  "banner_id": "01928374-1111-7777-8888-000000000010"
}
```
