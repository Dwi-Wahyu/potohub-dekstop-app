# 01. Authentication Specification (`/api/auth`)

## Overview

The Authentication module manages identity verification, access tokens, refresh tokens, role-based access control (RBAC), and session revocation for Super Admins, Owners, and Operators.

- **Base Path**: `/api/auth`
- **Security**: Public for login/refresh/forgot-password/reset-password; Bearer JWT (`Authorization: Bearer <token>`) for authenticated endpoints.
- **Token Format**: HS256 Signed JWT containing `sub` (User UUID), `org_id` (Organization UUID), `role` (`super_admin` | `owner` | `operator`), and `exp` claims.

---

## Endpoints

### 1.1 Login User (`POST /api/auth/login`)

Authenticates user credentials and issues a new JWT access token and refresh token.

- **Method**: `POST`
- **Endpoint**: `/api/auth/login`
- **Auth Required**: No (Public)

#### Request Body
| Field | Type | Required | Description |
|---|---|---|---|
| `email` | `string` | Yes | Registered account email |
| `password` | `string` | Yes | Raw plaintext account password |

```json
{
  "email": "owner@photobooth.com",
  "password": "Owner@123"
}
```

#### Response Success (`200 OK`)
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "7c9e0123-4567-89ab-cdef-0123456789ab",
  "user": {
    "id": "b2c9a1d4-8392-4f1e-9a10-c48392110294",
    "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
    "email": "owner@photobooth.com",
    "name": "Owner Photobooth",
    "role": "Owner",
    "assigned_booth_ids": [],
    "is_active": true,
    "created_at": "2026-07-26T04:20:00Z"
  }
}
```

#### Response Error (`401 Unauthorized`)
```json
{
  "code": 401,
  "error": "Unauthorized",
  "message": "Invalid email or password"
}
```

---

### 1.2 Get Current User Profile (`GET /api/auth/me`)

Retrieves profile data of the currently authenticated user token.

- **Method**: `GET`
- **Endpoint**: `/api/auth/me`
- **Auth Required**: Yes (`Bearer <token>`)

#### Response Success (`200 OK`)
```json
{
  "id": "b2c9a1d4-8392-4f1e-9a10-c48392110294",
  "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "email": "owner@photobooth.com",
  "name": "Owner Photobooth",
  "role": "Owner",
  "assigned_booth_ids": [],
  "is_active": true,
  "created_at": "2026-07-26T04:20:00Z"
}
```

---

### 1.3 Refresh Access Token (`POST /api/auth/refresh`)

Exchanges a valid refresh token for a newly generated JWT access token.

- **Method**: `POST`
- **Endpoint**: `/api/auth/refresh`
- **Auth Required**: No (Uses refresh token payload)

#### Request Body
```json
{
  "refresh_token": "7c9e0123-4567-89ab-cdef-0123456789ab"
}
```

#### Response Success (`200 OK`)
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "8d0f1234-5678-9abc-def0-123456789abc"
}
```

---

### 1.4 Forgot Password (`POST /api/auth/forgot-password`)

Generates a password reset token and sends an email to the user.

- **Method**: `POST`
- **Endpoint**: `/api/auth/forgot-password`
- **Auth Required**: No

#### Request Body
```json
{
  "email": "owner@photobooth.com"
}
```

#### Response Success (`200 OK`)
```json
{
  "message": "If the email is registered, a password reset link has been sent."
}
```

---

### 1.5 Reset Password (`POST /api/auth/reset-password`)

Resets account password using a validated reset token.

- **Method**: `POST`
- **Endpoint**: `/api/auth/reset-password`
- **Auth Required**: No

#### Request Body
```json
{
  "token": "reset-token-uuid",
  "new_password": "NewSecretPassword@123"
}
```

#### Response Success (`200 OK`)
```json
{
  "message": "Password has been successfully updated."
}
```

---

### 1.6 Logout (`POST /api/auth/logout`)

Revokes the active session token.

- **Method**: `POST`
- **Endpoint**: `/api/auth/logout`
- **Auth Required**: Yes

#### Response Success (`200 OK`)
```json
{
  "message": "Successfully logged out"
}
```
