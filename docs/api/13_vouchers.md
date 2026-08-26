# 13. Discount Vouchers Specification (`/api/vouchers`)

## Overview

Manages promo codes, percentage or fixed discounts, usage quotas, expiration dates, and validation for photobooth transactions.

- **Base Path**: `/api/vouchers`
- **Security**: Bearer JWT for CRUD; Public validation for booth clients.

---

## Endpoints

### 13.1 Validate Voucher Code (`POST /api/vouchers/{code}/validate`)

- **Method**: `POST`
- **Endpoint**: `/api/vouchers/{code}/validate`
- **Auth Required**: Public / Booth Client

#### Response Success (`200 OK`)
```json
{
  "valid": true,
  "code": "PROMO2026",
  "discount_type": "percentage",
  "discount_value": 20.0,
  "message": "Voucher valid"
}
```

---

### 13.2 List Vouchers (`GET /api/vouchers`)

- **Method**: `GET`
- **Endpoint**: `/api/vouchers`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

---

### 13.3 Create Voucher (`POST /api/vouchers`)

- **Method**: `POST`
- **Endpoint**: `/api/vouchers`
- **Auth Required**: Yes (`Owner`)
