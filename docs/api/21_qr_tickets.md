# Modul 21: QR Tickets (Tiket Akses & Kasir Manual)

Dokumentasi spesifikasi API untuk pembuatan, pengelolaan, validasi, dan klaim **QR Ticket** pada sistem Photobooth API Platform.

> [!NOTE]
> Pada arsitektur PotoHub API, **Bundle = Category** (`categories` table). Setiap tiket QR dikaitkan dengan `category_id` (UUID) dari master kategori paket foto (misal: Classic Footoo, Birthday Special, dsb).

---

## Ringkasan Endpoint

| Method | Path | Auth / Role | Deskripsi |
|:---|:---|:---|:---|
| `GET` | `/api/booths/{boothId}/qr-tickets` | Bearer JWT (Owner/Operator/Admin) | Mengambil daftar tiket QR pada booth tertentu dengan filter & ringkasan statistik. |
| `POST` | `/api/booths/{boothId}/qr-tickets` | Bearer JWT (Owner/Operator/Admin) | Membuat / menggenerate tiket QR baru untuk booth. |
| `GET` | `/api/booths/{boothId}/qr-tickets/{id}` | Bearer JWT (Owner/Operator/Admin) | Mengambil detail spesifik tiket QR berdasarkan ID. |
| `POST` | `/api/booths/{boothId}/qr-tickets/{id}/revoke` | Bearer JWT (Owner/Operator/Admin) | Membatalkan / me-revoke tiket QR secara manual. |
| `POST` | `/api/qr-tickets/validate` | Public / Booth Client | Memeriksa validitas token QR tiket (apakah aktif, belum dipakai, belum kadaluwarsa). |
| `POST` | `/api/qr-tickets/redeem` | Public / Booth Client | Mengklaim / menggunakan token QR tiket saat pengguna scan di mesin booth. |

---

## 1. List QR Tickets
* **URL**: `/api/booths/{boothId}/qr-tickets`
* **Method**: `GET`
* **Query Parameters**:
  * `category_id`: `UUID` (opsional filter berdasarkan kategori/bundle)
  * `status`: `active` | `used` | `cancelled` | `expired` | `all` (default: `all`)
  * `search`: `string` (opsional filter token, nama bundle, atau catatan)
  * `limit`: `number` (default 50)
  * `offset`: `number` (default 0)

### Response Body (`200 OK`)
```json
{
  "data": [
    {
      "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "booth_id": "c1f7a01d-5b32-411a-8c4e-5a022419a4e9",
      "organization_id": "d2f8b02e-6c43-522b-9d5f-6b033520b5fa",
      "category_id": "c1111111-2222-3333-4444-555555555555",
      "token": "FT-2024-001-CLA-7K9P-1724488500",
      "ticket_type": "single",
      "bundle_id": "classic",
      "bundle_label": "Classic Footoo",
      "frame_idx": 0,
      "qty": 1,
      "total_price": 35000.0,
      "note": "Tiket promo event",
      "status": "active",
      "used": false,
      "used_at": null,
      "expires_at": "2026-08-25T08:35:18Z",
      "created_at": "2026-08-24T08:35:18Z",
      "updated_at": "2026-08-24T08:35:18Z"
    }
  ],
  "summary": {
    "total": 1,
    "active": 1,
    "used": 0,
    "cancelled": 0
  }
}
```

---

## 2. Create QR Ticket
* **URL**: `/api/booths/{boothId}/qr-tickets`
* **Method**: `POST`
* **Request Body**:
```json
{
  "category_id": "c1111111-2222-3333-4444-555555555555",
  "ticket_type": "single",
  "bundle_id": "classic",
  "bundle_label": "Classic Footoo",
  "frame_idx": 0,
  "qty": 1,
  "total_price": 35000,
  "note": "Prewedding customer Pak Budi",
  "validity_hours": 24,
  "custom_token": null
}
```

### Response Body (`201 Created`)
```json
{
  "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "booth_id": "c1f7a01d-5b32-411a-8c4e-5a022419a4e9",
  "organization_id": "d2f8b02e-6c43-522b-9d5f-6b033520b5fa",
  "category_id": "c1111111-2222-3333-4444-555555555555",
  "token": "FT-2024-001-CLA-7K9P-1724488500",
  "ticket_type": "single",
  "bundle_id": "classic",
  "bundle_label": "Classic Footoo",
  "frame_idx": 0,
  "qty": 1,
  "total_price": 35000.0,
  "note": "Prewedding customer Pak Budi",
  "status": "active",
  "used": false,
  "used_at": null,
  "expires_at": "2026-08-25T08:35:18Z",
  "created_at": "2026-08-24T08:35:18Z",
  "updated_at": "2026-08-24T08:35:18Z"
}
```

---

## 3. Revoke QR Ticket
* **URL**: `/api/booths/{boothId}/qr-tickets/{id}/revoke`
* **Method**: `POST`

### Response Body (`200 OK`)
```json
{
  "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "status": "cancelled",
  "used": true,
  "updated_at": "2026-08-24T08:40:00Z"
}
```

---

## 4. Validate & Redeem QR Ticket (Booth Client)

### Validate (`POST /api/qr-tickets/validate`)
```json
{
  "token": "FT-2024-001-CLA-7K9P-1724488500",
  "booth_id": "c1f7a01d-5b32-411a-8c4e-5a022419a4e9"
}
```
**Response**:
```json
{
  "valid": true,
  "message": "Tiket QR valid dan aktif",
  "ticket": { ... }
}
```

### Redeem (`POST /api/qr-tickets/redeem`)
```json
{
  "token": "FT-2024-001-CLA-7K9P-1724488500",
  "booth_id": "c1f7a01d-5b32-411a-8c4e-5a022419a4e9"
}
```
**Response**:
```json
{
  "valid": true,
  "message": "Tiket QR berhasil diklaim",
  "ticket": {
    "status": "used",
    "used": true,
    "used_at": "2026-08-24T08:42:00Z"
  }
}
```
