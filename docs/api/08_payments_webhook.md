# 08. DOKU Payment Webhook Specification (`/api/payments/webhook`)

## Overview

Processes asynchronous payment notifications from payment gateway partners (such as DOKU / Midtrans). Upon payment confirmation, this endpoint validates HMAC signatures, marks the transaction session as `Paid`, and triggers desktop booth client unlock via WebSocket broadcast.

- **Base Path**: `/api/payments/webhook`
- **Security**: Signature validation header (`X-Signature: <HMAC_SHA256_HEX>`).

---

## Endpoints

### 8.1 DOKU Payment Webhook Callback (`POST /api/payments/webhook`)

- **Method**: `POST`
- **Endpoint**: `/api/payments/webhook`
- **Headers**:
  - `Content-Type: application/json`
  - `X-Signature: <HMAC_SHA256_HEX>`

#### Request Body
```json
{
  "order": {
    "invoice_number": "SEED-ACTIVATION-CODE-001-26072026-052100-01",
    "amount": 70000.0
  },
  "transaction": {
    "status": "SUCCESS"
  }
}
```

#### Response Success (`200 OK`)
```json
{
  "status": "PROCESSED",
  "invoice_number": "SEED-ACTIVATION-CODE-001-26072026-052100-01"
}
```
