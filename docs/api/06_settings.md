# 06. Booth Settings & Sync Specification (`/api/booths/{boothId}/settings`)

## Overview

Manages JSONB operational parameters for photobooth stations, including timer sequences, camera orientations, print preferences, softfile delivery triggers, and offline-first delta sync.

- **Base Path**: `/api/booths/{boothId}/settings`
- **Security**: Bearer JWT; `Owner` role required for updating settings groups.

---

## Endpoints

### 6.1 Get All Settings (`GET /api/booths/{boothId}/settings`)

- **Method**: `GET`
- **Endpoint**: `/api/booths/{boothId}/settings`
- **Auth Required**: Yes

#### Response Success (`200 OK`)
```json
{
  "general": {
    "pin": "1234",
    "phone": "081234567890",
    "language": "id",
    "camera_rotate": 0,
    "mirror": true,
    "payment_page": true,
    "photo_filter": true,
    "gif": true
  },
  "timer": {
    "banner_time": 10,
    "procedure_time": 15,
    "payment_time": 120,
    "photo_session_time": 10,
    "first_countdown_time": 5,
    "next_countdown_time": 3
  },
  "print": {
    "multi_print": true
  },
  "softfile": {
    "whatsapp_enabled": true,
    "email_enabled": true
  }
}
```

---

### 6.2 Update Settings Group (`PUT /api/booths/{boothId}/settings/{group}`)

Updates a specific sub-group (e.g. `general`, `timer`, `print`, `softfile`, `paper-reminder`, `branding`).

- **Method**: `PUT`
- **Endpoint**: `/api/booths/{boothId}/settings/timer`
- **Auth Required**: Yes (`Owner`)

#### Request Body
```json
{
  "banner_time": 12,
  "procedure_time": 15,
  "payment_time": 180,
  "photo_session_time": 10,
  "first_countdown_time": 5,
  "next_countdown_time": 3
}
```

#### Response Success (`200 OK`)
```json
{
  "timer": {
    "banner_time": 12,
    "procedure_time": 15,
    "payment_time": 180,
    "photo_session_time": 10,
    "first_countdown_time": 5,
    "next_countdown_time": 3
  }
}
```

---

### 6.3 Sync Settings Handshake (`POST /api/booths/{boothId}/settings/sync`)

Desktop booth client calls this endpoint to trigger timestamp updates and pull modified parameters.

- **Method**: `POST`
- **Endpoint**: `/api/booths/{boothId}/settings/sync`
- **Auth Required**: Yes (`Booth Client` / `Owner`)

#### Response Success (`200 OK`)
```json
{
  "status": "synchronized",
  "synced_at": "2026-08-21T00:00:00Z"
}
```
