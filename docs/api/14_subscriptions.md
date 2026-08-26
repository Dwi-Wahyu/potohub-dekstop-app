# 14. Subscription Paywall Specification (`/api/subscription`)

## Overview

Monitors SaaS licensing status, feature access flags (Multi-Print, Paper-Out-Reminder, Photo-Filter, Softfile-to-WhatsApp, Analytics), and subscription periods.

- **Base Path**: `/api/subscription`
- **Security**: Bearer JWT.

---

## Endpoints

### 14.1 View Subscription Licensing Status (`GET /api/subscription`)

- **Method**: `GET`
- **Endpoint**: `/api/subscription`
- **Auth Required**: Yes

#### Response Success (`200 OK`)
```json
{
  "package_name": "Enterprise Multi-Booth Pro",
  "purchased_on": "2026-01-01T00:00:00Z",
  "end_subscribe": "2027-01-01T00:00:00Z",
  "features": [
    "Multi Print",
    "Paper Out Reminder",
    "Photo Filter",
    "GIF",
    "Softfile to Email & WhatsApp",
    "Offline-First Sync",
    "Custom Branding",
    "Analytics Dashboard"
  ]
}
```
