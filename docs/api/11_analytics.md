# 11. Analytics & Financial Reporting (`/api/booths/{boothId}/analytics`)

## Overview

Calculates sales metrics, gross revenue, completed session counts, paper consumption, and frame template popularity.

- **Base Path**: `/api/booths/{boothId}/analytics`
- **Security**: Bearer JWT (`Owner` / `SuperAdmin`).

---

## Endpoints

### 11.1 Revenue & Performance Overview (`GET /api/booths/{boothId}/analytics/revenue`)

- **Method**: `GET`
- **Endpoint**: `/api/booths/{boothId}/analytics/revenue`
- **Auth Required**: Yes (`Owner`)

#### Response Success (`200 OK`)
```json
{
  "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
  "total_revenue": "297500000.00",
  "total_sessions": 10000,
  "completed_sessions": 7500
}
```
