# 02. Organization Specification (`/api/organization`)

## Overview

Manages organizational identity, branding, and payment gateway tenant configurations.

- **Base Paths**: `/api/organization`
- **Security**: Requires Bearer JWT with `Owner` or `SuperAdmin` role.

---

## Endpoints

### 2.1 Get Organization Profile (`GET /api/organization/profile`)

Retrieves master organization profile, branding assets, and payment gateway configuration.

- **Method**: `GET`
- **Endpoint**: `/api/organization/profile`
- **Auth Required**: Yes (`Bearer <token>`)

#### Response Success (`200 OK`)
```json
{
  "id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "name": "FOOTOO",
  "email": "owner@photobooth.com",
  "phone": "081234567890",
  "logo_url": "https://storage.photobooth.com/logos/footoo.png",
  "payment_gateway_provider": "doku",
  "payment_gateway_config": {
    "client_id": "MPO-100293",
    "environment": "production"
  },
  "subscription_id": null,
  "created_at": "2026-07-26T04:20:00Z",
  "updated_at": "2026-07-26T04:20:00Z"
}
```

---

### 2.2 Update Organization Profile (`PUT /api/organization/profile`)

Updates company name, email, phone, and branding logo.

- **Method**: `PUT`
- **Endpoint**: `/api/organization/profile`
- **Auth Required**: Yes (`Owner`)

#### Request Body
```json
{
  "name": "FOOTOO INDONESIA",
  "phone": "081299998888",
  "logo_url": "https://storage.photobooth.com/logos/footoo_new.png"
}
```

#### Response Success (`200 OK`)
```json
{
  "id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "name": "FOOTOO INDONESIA",
  "email": "owner@photobooth.com",
  "phone": "081299998888",
  "logo_url": "https://storage.photobooth.com/logos/footoo_new.png",
  "payment_gateway_provider": "doku",
  "subscription_id": null,
  "created_at": "2026-07-26T04:20:00Z",
  "updated_at": "2026-07-26T06:00:00Z"
}
```

---

### 2.3 Get Payment Gateway Config (`GET /api/organization/payment-config`)

- **Method**: `GET`
- **Endpoint**: `/api/organization/payment-config`
- **Auth Required**: Yes (`Owner`)

#### Response Success (`200 OK`)
```json
{
  "provider": "doku",
  "config": {
    "client_id": "MPO-991823",
    "secret_key": "sec_live_998811223344",
    "qris_is_dynamic": true
  }
}
```

---

### 2.4 Update Payment Gateway Config (`PUT /api/organization/payment-config`)

- **Method**: `PUT`
- **Endpoint**: `/api/organization/payment-config`
- **Auth Required**: Yes (`Owner`)

#### Request Body
```json
{
  "provider": "doku",
  "config": {
    "client_id": "MPO-991823",
    "secret_key": "sec_live_998811223344",
    "qris_is_dynamic": true
  }
}
```

#### Response Success (`200 OK`)
```json
{
  "message": "Payment configuration updated"
}
```
