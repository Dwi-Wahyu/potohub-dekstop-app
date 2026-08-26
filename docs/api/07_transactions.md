# 07. Transactions & Payments Specification (`/api/booths/{boothId}/transactions`, `/api/transactions`)

## Overview

Processes customer order sessions, price computations (base price + additional prints), payment provider integration (DOKU Dynamic QRIS), and session status tracking (`Waiting`, `PaymentPending`, `Paid`, `Completed`, `Cancelled`, `Timeout`).

---

## Endpoints

### 7.1 Create Transaction Session (`POST /api/booths/{boothId}/transactions`)

- **Method**: `POST`
- **Endpoint**: `/api/booths/{boothId}/transactions`
- **Auth Required**: Public / Booth Client

#### Request Body
| Field | Type | Required | Description |
|---|---|---|---|
| `customer_id` | `UUID` | No | Optional CRM customer ID |
| `category_id` | `UUID` | Yes | Chosen frame category |
| `frame_id` | `UUID` | Yes | Chosen template design |
| `total_print` | `i32` | Yes | Total quantity of physical prints |
| `payment_method` | `string` | Yes | `cashless`, `cash`, `voucher`, `ticket` |

```json
{
  "customer_id": null,
  "category_id": "c1111111-2222-3333-4444-555555555555",
  "frame_id": "t1111111-1111-1111-1111-111111111111",
  "total_print": 2,
  "payment_method": "cashless"
}
```

#### Response Success (`201 Created`)
```json
{
  "id": "01928374-9988-7766-5544-aabbccddeeff",
  "order_id": "SEED-ACTIVATION-CODE-001-26072026-052100-01",
  "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
  "customer_id": null,
  "category_id": "c1111111-2222-3333-4444-555555555555",
  "frame_id": "t1111111-1111-1111-1111-111111111111",
  "total_print": 2,
  "total_price": 70000.0,
  "payment_method": "Cashless",
  "payment_provider": "doku",
  "status": "PaymentPending",
  "qris_url": "https://qris.doku.com/pay?invoice=SEED-ACTIVATION-CODE-001-26072026-052100-01&amount=70000",
  "started_at": "2026-07-26T05:21:00Z",
  "completed_at": null
}
```

---

### 7.2 List Booth Transactions (`GET /api/booths/{boothId}/transactions`)

Retrieves transaction logs specific to a single photobooth (commonly called by operators or local booth client diagnostics).

- **Method**: `GET`
- **Endpoint**: `/api/booths/{boothId}/transactions`
- **Auth Required**: Yes

#### Response Success (`200 OK`)
```json
[
  {
    "id": "01928374-9988-7766-5544-aabbccddeeff",
    "order_id": "SEED-ACTIVATION-CODE-001-26072026-052100-01",
    "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
    "customer_id": null,
    "category_id": "c1111111-2222-3333-4444-555555555555",
    "frame_id": "t1111111-1111-1111-1111-111111111111",
    "total_print": 2,
    "total_price": 70000.0,
    "payment_method": "Cashless",
    "payment_provider": "doku",
    "status": "PaymentPending",
    "started_at": "2026-07-26T05:21:00Z",
    "completed_at": null
  }
]
```

---

### 7.3 List Organization Transactions & Metrics (`GET /api/transactions`)

Retrieves a paginated list of transaction logs across **all booths** under the user's organization. It includes **filtered & all-time metrics** for the dashboard summary cards:
1. **Total Transactions**
2. **Total Prints Sold** (Successful/Paid only)
3. **Total Revenue** (Successful/Paid only)

- **Method**: `GET`
- **Endpoint**: `/api/transactions`
- **Auth Required**: Yes (`Bearer <token>`)
- **Query Parameters**:
  - `search` (opsional): Mencari berdasarkan Order ID, Kode Aktivasi, atau Nama Booth.
  - `start_date` (opsional): Filter batas bawah tanggal (`started_at`).
  - `end_date` (opsional): Filter batas atas tanggal (`started_at`).
  - `booth_id` (opsional): Menyaring transaksi dari booth tertentu.
  - `status` (opsional): Filter status (`waiting`, `payment_pending`, `paid`, `completed`, `cancelled`, `timeout`).
  - `payment_method` (opsional): Filter metode pembayaran (`cashless`, `cash`, `voucher`, `ticket`).
  - `page` (opsional): Nomor halaman (default `1`).
  - `page_size` (opsional): Jumlah item per halaman (default `10`).

#### Response Success (`200 OK`)
```json
{
  "transactions": [
    {
      "id": "01928374-9988-7766-5544-aabbccddeeff",
      "order_id": "ORD-20260805-0041",
      "date": "05 Aug 2026",
      "time": "10:24",
      "started_at": "2026-08-05T10:24:00Z",
      "completed_at": "2026-08-05T10:25:00Z",
      "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
      "booth_name": "FOOTO0",
      "activation_code": "FT-8821",
      "total_print": 3,
      "total_price": 35000.0,
      "payment_method": "cashless",
      "payment_provider": "doku",
      "status": "completed",
      "template_name": "Whitey Footoo"
    }
  ],
  "total_transactions": 20,
  "total_prints_sold": 55,
  "total_revenue": 695000.0,
  "filtered_total_transactions": 1,
  "filtered_total_prints_sold": 3,
  "filtered_total_revenue": 35000.0,
  "total_pages": 1,
  "current_page": 1,
  "page_size": 10
}
```
