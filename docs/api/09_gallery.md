# 09. Photo Gallery & Uploads Specification (`/api/booths/{boothId}/gallery`)

## Overview

Manages session photo capture outputs, GIF generation, print-ready composite renders, and direct Cloudflare R2 object storage uploads via S3 Presigned URLs.

- **Base Path**: `/api/booths/{boothId}/gallery`
- **Security**: Bearer JWT for gallery queries; Booth client authorized for upload requests.

---

## Endpoints

### 9.1 Request Presigned Upload URL (`POST /api/booths/{boothId}/gallery/upload-url`)

Generates a direct S3 PUT presigned upload URL to upload high-resolution images or videos directly from the booth client to Cloudflare R2 without burdening the API server.

- **Method**: `POST`
- **Endpoint**: `/api/booths/{boothId}/gallery/upload-url`
- **Auth Required**: Yes (`Bearer <token>`)

#### Request Body
```json
{
  "session_id": "01928374-9988-7766-5544-aabbccddeeff",
  "media_type": "photo",
  "file_extension": "jpg",
  "content_type": "image/jpeg"
}
```

#### Response Success (`200 OK`)
```json
{
  "upload_url": "https://<account-id>.r2.cloudflarestorage.com/potohub-bucket/org-uuid/booth-uuid/gallery/session-uuid/photo_1771632000.jpg?X-Amz-Signature=...",
  "public_url": "https://pub-r2.potohub.com/org-uuid/booth-uuid/gallery/session-uuid/photo_1771632000.jpg",
  "file_key": "org-uuid/booth-uuid/gallery/session-uuid/photo_1771632000.jpg",
  "expires_in_secs": 900
}
```

---

### 9.2 Register Uploaded Media (`POST /api/booths/{boothId}/gallery/upload`)

Records media metadata into the database after direct R2 upload completion.

- **Method**: `POST`
- **Endpoint**: `/api/booths/{boothId}/gallery/upload`
- **Auth Required**: Yes

#### Request Body
```json
{
  "session_id": "01928374-9988-7766-5544-aabbccddeeff",
  "file_url": "https://pub-r2.potohub.com/org-uuid/booth-uuid/gallery/session-uuid/photo_1771632000.jpg",
  "file_type": "photo",
  "width": 1200,
  "height": 1800,
  "file_size": 1850000
}
```

#### Response Success (`201 Created`)
```json
{
  "id": "01928374-8888-7777-6666-555544443333",
  "session_id": "01928374-9988-7766-5544-aabbccddeeff",
  "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
  "file_url": "https://pub-r2.potohub.com/org-uuid/booth-uuid/gallery/session-uuid/photo_1771632000.jpg",
  "file_type": "Photo",
  "width": 1200,
  "height": 1800,
  "file_size": 1850000,
  "uploaded_at": "2026-08-21T00:00:00Z"
}
```

---

### 9.3 List Booth Gallery Files (`GET /api/booths/{boothId}/gallery`)

- **Method**: `GET`
- **Endpoint**: `/api/booths/{boothId}/gallery`
- **Auth Required**: Yes

---

### 9.4 Get Session Gallery Files (`GET /api/booths/{boothId}/gallery/{sessionId}`)

- **Method**: `GET`
- **Endpoint**: `/api/booths/{boothId}/gallery/{sessionId}`
- **Auth Required**: Yes

---

### 9.5 Halaman Softfile Publik Customer (`GET /api/public/softfile/{sessionId}`)

Endpoint publik (tanpa token JWT) untuk menampilkan halaman softfile foto & video hasil sesi photobooth setelah customer memindai kode QR.

- **Method**: `GET`
- **Endpoint**: `/api/public/softfile/{sessionId}`
- **Auth Required**: No (Publik, terikat `sessionId` UUID v7)

#### Alur & Rumus Penghitungan Expiry Server-Side:
1. Server membaca `completed_at` dari sesi (status harus `completed`).
2. Server membaca `softfile_expiry_days` dari `booth.settings.softfile.softfile_expiry_days` (default **30 hari**).
3. Server menghitung `remaining_days` dan `is_expired` langsung di backend sebagai sumber kebenaran tunggal:
   - `expiry_at = completed_at + expiry_days`
   - `remaining_days = max(0, ceil((expiry_at - now) / 1 hari))`
   - `is_expired = remaining_days == 0`

#### Response Success (`200 OK`)
```json
{
  "session_id": "01928374-9988-7766-5544-aabbccddeeff",
  "booth_name": "OUR PICS",
  "tagline": "tell a story",
  "step_style": {
    "id": "0199a2e0-3333-7777-8888-999999999999",
    "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
    "step": "softfile",
    "bg_type": "color",
    "bg_value": "#121212",
    "image_asset_id": null,
    "updated_at": "2026-09-01T00:00:00Z"
  },
  "text_styles": [
    {
      "id": "0199a2e0-4444-7777-8888-999999999999",
      "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
      "element_key": "softfile_title",
      "font_size": "besar",
      "font_family": "sans_serif",
      "color": "#FFFFFF",
      "updated_at": "2026-09-01T00:00:00Z"
    }
  ],
  "media": [
    {
      "id": "01928374-8888-7777-6666-555544443333",
      "session_id": "01928374-9988-7766-5544-aabbccddeeff",
      "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
      "file_url": "https://pub-r2.potohub.com/org/booth/gallery/session/photo_1.jpg",
      "file_type": "photo",
      "width": 1200,
      "height": 1800,
      "file_size": 1850000,
      "uploaded_at": "2026-08-25T10:00:00Z"
    }
  ],
  "completed_at": "2026-08-25T10:00:00Z",
  "expiry_days": 30,
  "remaining_days": 29,
  "is_expired": false
}
```

