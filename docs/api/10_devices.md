# 10. Hardware Device Telemetry & Remote Control (`/api/booths/{boothId}/device-status`, `/command`)

## Overview

Monages hardware peripherals attached to physical photobooth stations (DSLR camera, thermal sub-dye printer, paper sensors, CPU/memory stats) and remote execution of administrative actions.

- **Base Paths**: `/api/booths/{boothId}/device-status`, `/api/booths/{boothId}/command`
- **Security**: Bearer JWT; `Owner` role required for dispatching commands.

---

## Endpoints

### 10.1 Telemetry Status Feed (`GET /api/booths/{boothId}/device-status`)

- **Method**: `GET`
- **Endpoint**: `/api/booths/{boothId}/device-status`
- **Auth Required**: Yes

#### Response Success (`200 OK`)
```json
{
  "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
  "camera": "CONNECTED",
  "printer": "READY",
  "remaining_paper": 150,
  "cpu_usage_pct": 18.4,
  "memory_usage_pct": 45.2,
  "online": true,
  "last_heartbeat": "2026-07-26T05:23:00Z"
}
```

---

### 10.2 Dispatch Remote Command (`POST /api/booths/{boothId}/command`)

Dispatches commands (`RESTART_APP`, `RESTART_PRINTER`, `RESTART_CAMERA`, `SHUTDOWN`) to the booth client.

- **Method**: `POST`
- **Endpoint**: `/api/booths/{boothId}/command`
- **Auth Required**: Yes (`Owner`)

#### Request Body
```json
{
  "command": "RESTART_PRINTER"
}
```

#### Response Success (`200 OK`)
```json
{
  "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
  "command": "RESTART_PRINTER",
  "status": "DISPATCHED",
  "timestamp": "2026-07-26T05:23:05Z"
}
```
