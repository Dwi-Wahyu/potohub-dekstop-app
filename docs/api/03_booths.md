# 03. Booth Management Specification (`/api/booths`)

## Overview

Manages physical photobooth stations, activation handshake codes for Tauri desktop clients, booth status updates, and runtime parameters.

- **Base Path**: `/api/booths`
- **Security**: Bearer JWT for dashboard management; Public handshake endpoint for booth activation.

---

## Endpoints

### 3.1 List Booths (`GET /api/booths`)

- **Method**: `GET`
- **Endpoint**: `/api/booths`
- **Auth Required**: Yes

#### Response Success (`200 OK`)
```json
[
  {
    "id": "01928374-aaaa-bbbb-cccc-112233445566",
    "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
    "name": "BOOTH-01",
    "activation_code": "SEED-ACTIVATION-CODE-001",
    "status": "Active",
    "logo_url": null,
    "settings": {},
    "last_sync_at": "2026-07-26T04:20:00Z",
    "created_at": "2026-07-26T04:20:00Z",
    "updated_at": "2026-07-26T04:20:00Z"
  }
]
```

---

### 3.2 Register New Booth (`POST /api/booths`)

Generates a unique `activation_code` for physical Desktop Booth client pairing.

- **Method**: `POST`
- **Endpoint**: `/api/booths`
- **Auth Required**: Yes (`Owner`)

#### Request Body
```json
{
  "name": "BOOTH-GI-02",
  "logo_url": "https://storage.photobooth.com/logos/gi02.png"
}
```

#### Response Success (`201 Created`)
```json
{
  "id": "01928374-5566-7788-9900-aabbccddeeff",
  "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "name": "BOOTH-GI-02",
  "activation_code": "BOOTH-ACT-99A1B2C3",
  "status": "Active",
  "logo_url": "https://storage.photobooth.com/logos/gi02.png",
  "settings": {},
  "last_sync_at": null,
  "created_at": "2026-07-26T05:10:00Z",
  "updated_at": "2026-07-26T05:10:00Z"
}
```

---

### 3.3 Get Booth Detail (`GET /api/booths/{id}`)

- **Method**: `GET`
- **Endpoint**: `/api/booths/{id}`
- **Auth Required**: Yes

#### Response Success (`200 OK`)
```json
{
  "id": "01928374-aaaa-bbbb-cccc-112233445566",
  "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "name": "BOOTH-01",
  "activation_code": "SEED-ACTIVATION-CODE-001",
  "status": "Active",
  "logo_url": null,
  "settings": {},
  "last_sync_at": "2026-07-26T04:20:00Z",
  "created_at": "2026-07-26T04:20:00Z",
  "updated_at": "2026-07-26T04:20:00Z"
}
```

---

### 3.4 Update Booth (`PUT /api/booths/{id}`)

- **Method**: `PUT`
- **Endpoint**: `/api/booths/{id}`
- **Auth Required**: Yes (`Owner`)

#### Request Body
```json
{
  "name": "BOOTH-01-RENOVATED",
  "status": "Active",
  "logo_url": "https://storage.photobooth.com/logos/b01.png"
}
```

#### Response Success (`200 OK`)
```json
{
  "id": "01928374-aaaa-bbbb-cccc-112233445566",
  "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "name": "BOOTH-01-RENOVATED",
  "activation_code": "SEED-ACTIVATION-CODE-001",
  "status": "Active",
  "logo_url": "https://storage.photobooth.com/logos/b01.png",
  "settings": {},
  "last_sync_at": "2026-07-26T04:20:00Z",
  "created_at": "2026-07-26T04:20:00Z",
  "updated_at": "2026-07-26T06:30:00Z"
}
```

---

### 3.5 Get Booth Activation Code (`GET /api/booths/{id}/activation-code`)

- **Method**: `GET`
- **Endpoint**: `/api/booths/{id}/activation-code`
- **Auth Required**: Yes (`Owner`)

#### Response Success (`200 OK`)
```json
{
  "activation_code": "SEED-ACTIVATION-CODE-001"
}
```

---

### 3.6 Desktop Client Activation Handshake (`POST /api/booths/activate`)

Called by physical Desktop Booth Client on initial startup to retrieve bootstrap configuration.

- **Method**: `POST`
- **Endpoint**: `/api/booths/activate`
- **Auth Required**: No (Public with valid activation code)

#### Request Body
```json
{
  "activation_code": "SEED-ACTIVATION-CODE-001"
}
```

#### Response Success (`200 OK`)
```json
{
  "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
  "name": "BOOTH-01",
  "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "status": "Active",
  "settings": {
    "general": { "pin": "1234", "camera_rotate": 0, "mirror": true },
    "timer": { "payment_time": 120, "photo_session_time": 10 }
  },
  "ui_template_variant": "v1",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTkyODM3NC1hYWFhLWJiYmItY2NjYy0xMTIyMzM0NDU1NjYiLCJyb2xlIjoib3BlcmF0b3IiLCJpYXQiOjE3NzE2MzIwMDAsImV4cCI6MTgwMzE2ODAwMH0.sampleTokenSignature"
}
```
