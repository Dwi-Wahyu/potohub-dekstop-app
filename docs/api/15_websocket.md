# 15. WebSocket Real-time Sync Specification (`/sync`)

## Overview

Maintains a bidirectional full-duplex WebSocket connection between physical desktop booth clients and the backend API server. Enables instant payment unlock triggers, live telemetry streaming, and remote command executions.

- **Protocol**: `wss://` (Production) / `ws://` (Development)
- **Endpoint**: `/sync`

---

## Message Formats

### 15.1 Upstream Telemetry Message (Client -> Server)
```json
{
  "type": "TELEMETRY_UPDATE",
  "booth_id": "01928374-aaaa-bbbb-cccc-112233445566",
  "payload": {
    "cpu_usage_pct": 24.5,
    "memory_usage_pct": 58.2,
    "printer_status": "READY",
    "remaining_paper": 142
  }
}
```

### 15.2 Downstream Payment Unlock Notification (Server -> Client)
```json
{
  "type": "PAYMENT_CONFIRMED",
  "order_id": "SEED-ACTIVATION-CODE-001-26072026-052100-01",
  "session_id": "01928374-9988-7766-5544-aabbccddeeff",
  "status": "PAID"
}
```
