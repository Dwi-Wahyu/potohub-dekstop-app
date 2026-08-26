# 04. Frame Categories Specification (`/api/booths/{boothId}/categories`, `/api/categories`)

## Overview

Categories categorize frame templates (e.g. Classic, Birthday, Event Editions) and determine base pricing. Categories follow a **Many-to-Many** relationship via the `booth_categories` junction table:
1. **Global Master Categories (`/api/categories`)**: Created globally per organization.
2. **Booth Active Categories (`/api/booths/{boothId}/categories`)**: Categories linked and active on a specific booth station.
3. **Explicit Link/Unlink (`/api/booths/{boothId}/categories/{categoryId}/link|unlink`)**: Add or remove existing master categories from a booth.

---

## Endpoints

### 4.1 List Active Categories for Booth (`GET /api/booths/{boothId}/categories`)

- **Method**: `GET`
- **Endpoint**: `/api/booths/{boothId}/categories`
- **Auth Required**: Yes

#### Response Success (`200 OK`)
```json
[
  {
    "id": "c1111111-2222-3333-4444-555555555555",
    "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
    "name": "CLASSIC FOOTOO",
    "base_price": "35000.00",
    "extra_price": "35000.00",
    "position": 0,
    "banner_url": null,
    "created_at": "2026-07-26T04:20:00Z",
    "updated_at": "2026-07-26T04:20:00Z"
  }
]
```

---

### 4.2 Create Category & Link to Booth (`POST /api/booths/{boothId}/categories`)

Creates a category and automatically links it to the specified booth.

- **Method**: `POST`
- **Endpoint**: `/api/booths/{boothId}/categories`
- **Auth Required**: Yes (`Owner`)

#### Request Body
```json
{
  "name": "Halloween Edition",
  "base_price": 40000.0,
  "extra_price": 40000.0,
  "banner_url": "https://storage.photobooth.com/banners/halloween.jpg"
}
```

#### Response Success (`201 Created`)
```json
{
  "id": "c3333333-3333-3333-3333-333333333333",
  "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
  "name": "Halloween Edition",
  "base_price": "40000.00",
  "extra_price": "40000.00",
  "position": 5,
  "banner_url": "https://storage.photobooth.com/banners/halloween.jpg",
  "created_at": "2026-07-26T05:15:00Z",
  "updated_at": "2026-07-26T05:15:00Z"
}
```

---

### 4.3 Reorder Categories (`PUT /api/booths/{boothId}/categories/reorder`)

- **Method**: `PUT`
- **Endpoint**: `/api/booths/{boothId}/categories/reorder`
- **Auth Required**: Yes (`Owner`)

#### Request Body
```json
{
  "category_ids": [
    "c2222222-2222-3333-4444-555555555555",
    "c1111111-2222-3333-4444-555555555555"
  ]
}
```

#### Response Success (`200 OK`)
```json
{
  "message": "Categories reordered"
}
```

---

### 4.4 Link Category to Booth (`POST /api/booths/{boothId}/categories/{categoryId}/link`)

- **Method**: `POST`
- **Endpoint**: `/api/booths/{boothId}/categories/{categoryId}/link`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Response Success (`200 OK`)
```json
{
  "message": "Category linked to booth successfully",
  "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
  "category_id": "c1111111-2222-3333-4444-555555555555"
}
```

---

### 4.5 Unlink Category from Booth (`DELETE /api/booths/{boothId}/categories/{categoryId}/unlink`)

- **Method**: `DELETE`
- **Endpoint**: `/api/booths/{boothId}/categories/{categoryId}/unlink`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Response Success (`200 OK`)
```json
{
  "message": "Category unlinked from booth successfully",
  "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
  "category_id": "c1111111-2222-3333-4444-555555555555"
}
```

---

### 4.6 List All Master Categories (`GET /api/categories`)

- **Method**: `GET`
- **Endpoint**: `/api/categories`
- **Auth Required**: Yes

#### Response Success (`200 OK`)
```json
[
  {
    "id": "c1111111-2222-3333-4444-555555555555",
    "name": "CLASSIC FOOTOO",
    "base_price": "35000.00",
    "extra_price": "35000.00",
    "position": 0,
    "banner_url": null,
    "created_at": "2026-07-26T04:20:00Z",
    "updated_at": "2026-07-26T04:20:00Z"
  }
]
```

---

### 4.7 Create Master Category (`POST /api/categories`)

- **Method**: `POST`
- **Endpoint**: `/api/categories`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Request Body
```json
{
  "name": "VIP Wedding Edition",
  "base_price": 50000.0,
  "extra_price": 50000.0,
  "banner_url": "https://storage.photobooth.com/banners/wedding.jpg"
}
```

#### Response Success (`201 Created`)
```json
{
  "id": "c4444444-4444-4444-4444-444444444444",
  "name": "VIP Wedding Edition",
  "base_price": "50000.00",
  "extra_price": "50000.00",
  "position": 6,
  "banner_url": "https://storage.photobooth.com/banners/wedding.jpg",
  "created_at": "2026-07-26T06:00:00Z",
  "updated_at": "2026-07-26T06:00:00Z"
}
```

---

### 4.8 Update Master Category (`PUT /api/categories/{id}`)

- **Method**: `PUT`
- **Endpoint**: `/api/categories/{id}`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Request Body
```json
{
  "name": "VIP Wedding Special Edition",
  "base_price": 55000.0
}
```

#### Response Success (`200 OK`)
```json
{
  "id": "c4444444-4444-4444-4444-444444444444",
  "name": "VIP Wedding Special Edition",
  "base_price": "55000.00",
  "extra_price": "50000.00",
  "position": 6,
  "banner_url": "https://storage.photobooth.com/banners/wedding.jpg",
  "created_at": "2026-07-26T06:00:00Z",
  "updated_at": "2026-07-26T06:10:00Z"
}
```

---

### 4.9 Delete Master Category (`DELETE /api/categories/{id}`)

- **Method**: `DELETE`
- **Endpoint**: `/api/categories/{id}`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Response Success (`200 OK`)
```json
{
  "message": "Category deleted successfully"
}
```

---

### 4.10 Request Category Upload URL (`POST /api/categories/upload-url`, `POST /api/booths/{boothId}/categories/upload-url`)

Mendapatkan Presigned PUT URL ke Cloudflare R2 untuk mengunggah gambar banner/sampul kategori sebelum membuat/memperbarui kategori.

- **Method**: `POST`
- **Endpoint**: `/api/categories/upload-url` atau `/api/booths/{boothId}/categories/upload-url`
- **Auth Required**: Yes (`Owner` / `SuperAdmin` / `Operator`)

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
  "upload_url": "https://storage.photobooth.com/org_123/categories/018f..._1724488500.jpg?X-Amz-Algorithm=...",
  "public_url": "https://storage.photobooth.com/org_123/categories/018f..._1724488500.jpg",
  "file_key": "org_123/categories/018f..._1724488500.jpg",
  "expires_in_secs": 900
}
```
