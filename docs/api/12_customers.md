# 12. Customer Database / CRM (`/api/customers`)

## Overview

Tracks customer profiles, visiting frequency, lifetime spend, and softfile recipient contacts (Email and WhatsApp).

- **Base Path**: `/api/customers`
- **Security**: Bearer JWT for dashboard querying; Public endpoint for capture submission.

---

## Endpoints

### 12.1 List Customers (`GET /api/customers`)

- **Method**: `GET`
- **Endpoint**: `/api/customers`
- **Auth Required**: Yes

#### Response Success (`200 OK`)
```json
[
  {
    "id": "01928374-1111-2222-3333-444455556666",
    "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
    "name": "Budi Santoso",
    "email": "budi.santoso1@example.com",
    "phone": "081200000017",
    "total_visit": 15,
    "last_visit_at": "2026-07-25T12:00:00Z",
    "total_spending": "525000.00",
    "favorite_frame_id": "t1111111-1111-1111-1111-111111111111",
    "created_at": "2026-07-26T04:20:00Z",
    "updated_at": "2026-07-26T04:20:00Z"
  }
]
```

---

### 12.2 Create / Register Customer (`POST /api/customers`)

- **Method**: `POST`
- **Endpoint**: `/api/customers`
- **Auth Required**: Yes / Public
