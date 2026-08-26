# 19. User Management Specification (`/api/users`)

## 1. Overview & Architecture

Modul **User Management** mengelola pendaftaran, pengeditan, aktivasi, reset password, dan penghapusan pengguna/staf dalam organisasi. Modul ini mendukung pembagian hak akses (RBAC) antar peran: `SuperAdmin`, `Owner` (ditampilkan sebagai *Admin* di UI), dan `Operator`.

```mermaid
graph TD
    subgraph Svelte Admin Web Dashboard
        A[Admin / Owner] -->|GET /api/users| B[Photobooth API]
        A -->|POST /api/users/invite| B
        A -->|PUT /api/users/{id}| B
        A -->|DELETE /api/users/{id}| B
        A -->|POST /api/users/{id}/reset-password| B
    end

    subgraph Staff / Operator Activation Flow
        C[Staff / Operator] -->|POST /api/users/activate with invite_token| B
        B -->|Set Password & Enable Account| D[(users & user_invitations)]
    end
```

- **Base Path**: `/api/users`
- **Security**: Bearer JWT (`Authorization: Bearer <token>`). Endpoint `/api/users/activate` bersifat publik dengan token undangan.
- **Authorization**: Membutuhkan role `Owner` atau `SuperAdmin`.

---

## 2. Struktur Data Database

### 2.1 Tabel `users`
| Atribut | Tipe | Default | Deskripsi |
|---|---|---|---|
| `id` | `UUID` | UUID v7 | Identifier unik user |
| `organization_id` | `UUID` | `NULL` | Foreign key ke `organizations(id)` |
| `email` | `VARCHAR(255)` | - | Email pengguna (Unique) |
| `password_hash` | `VARCHAR(255)` | - | Hash password (Argon2id) |
| `name` | `VARCHAR(255)` | - | Nama lengkap pengguna |
| `role` | `user_role` | `operator` | Enum (`super_admin`, `owner`, `operator`) |
| `assigned_booth_ids` | `UUID[]` | `{}` | Array ID booth yang ditugaskan ke operator |
| `is_active` | `BOOLEAN` | `TRUE` | Status aktif akun |
| `created_at` | `TIMESTAMPTZ` | `NOW()` | Timestamp pendaftaran |
| `updated_at` | `TIMESTAMPTZ` | `NOW()` | Timestamp pembaruan |

### 2.2 Tabel `user_invitations`
| Atribut | Tipe | Deskripsi |
|---|---|---|
| `id` | `UUID` | Identifier unik undangan |
| `organization_id` | `UUID` | Foreign key ke `organizations(id)` |
| `email` | `VARCHAR(255)` | Email target undangan |
| `name` | `VARCHAR(255)` | Nama calon pengguna |
| `role` | `user_role` | Peran yang dialokasikan |
| `assigned_booth_ids` | `UUID[]` | ID booth teralokasi |
| `invite_token` | `VARCHAR(255)` | Token unik aktivasi (`INV-...`) |
| `invited_by` | `UUID` | ID user pengundang |
| `expires_at` | `TIMESTAMPTZ` | Tanggal kadaluarsa undangan (7 hari) |
| `is_used` | `BOOLEAN` | Status penggunaan token |
| `created_at` | `TIMESTAMPTZ` | Timestamp pembuatan |

---

## 3. Spesifikasi Endpoint REST

### 3.1 List Users (`GET /api/users`)

Mengambil daftar pengguna dengan filter pencarian nama/email, role, dan status aktif.

- **Method**: `GET`
- **Endpoint**: `/api/users`
- **Query Parameters**:
  - `page` (`integer`, optional, default `1`)
  - `limit` (`integer`, optional, default `20`)
  - `search` (`string`, optional): Kata kunci nama atau email
  - `role` (`string`, optional): `owner` | `admin` | `operator`
  - `is_active` (`boolean`, optional): `true` | `false`

#### Response Success (`200 OK`)
```json
{
  "data": [
    {
      "id": "01928374-1111-7777-8888-000000000001",
      "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
      "email": "rizky@potohub.id",
      "name": "Rizky Pratama",
      "role": "owner",
      "assigned_booth_ids": [],
      "is_active": true,
      "created_at": "2026-08-23T10:00:00Z"
    },
    {
      "id": "01928374-1111-7777-8888-000000000002",
      "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
      "email": "sinta@potohub.id",
      "name": "Sinta Maharani",
      "role": "operator",
      "assigned_booth_ids": [
        "01928374-aaaa-bbbb-cccc-112233445566"
      ],
      "is_active": true,
      "created_at": "2026-08-23T10:05:00Z"
    }
  ],
  "total": 2,
  "page": 1,
  "limit": 20,
  "total_pages": 1
}
```

---

### 3.2 Add / Invite User (`POST /api/users/invite`)

Membuat user baru secara langsung (jika `password` diisi) atau membuat undangan aktivasi email/link (jika `password` kosong).

- **Method**: `POST`
- **Endpoint**: `/api/users/invite`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Request Body
```json
{
  "name": "Sinta Maharani",
  "email": "sinta@potohub.id",
  "role": "operator",
  "assigned_booth_ids": [
    "01928374-aaaa-bbbb-cccc-112233445566"
  ],
  "password": "PasswordSecret123!"
}
```

#### Response Success Direct Create (`201 Created`)
```json
{
  "user": {
    "id": "01928374-1111-7777-8888-000000000002",
    "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
    "email": "sinta@potohub.id",
    "name": "Sinta Maharani",
    "role": "operator",
    "assigned_booth_ids": [
      "01928374-aaaa-bbbb-cccc-112233445566"
    ],
    "is_active": true,
    "created_at": "2026-08-23T10:05:00Z"
  },
  "invite_token": null,
  "invite_url": null
}
```

---

### 3.3 Get User Detail (`GET /api/users/{id}`)

- **Method**: `GET`
- **Endpoint**: `/api/users/{id}`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Response Success (`200 OK`)
```json
{
  "id": "01928374-1111-7777-8888-000000000002",
  "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "email": "sinta@potohub.id",
  "name": "Sinta Maharani",
  "role": "operator",
  "assigned_booth_ids": [
    "01928374-aaaa-bbbb-cccc-112233445566"
  ],
  "is_active": true,
  "created_at": "2026-08-23T10:05:00Z"
}
```

---

### 3.4 Update User (`PUT /api/users/{id}`)

Mengubah data profil, role, penugasan booth, status aktif, atau password user.

- **Method**: `PUT`
- **Endpoint**: `/api/users/{id}`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Request Body
```json
{
  "name": "Sinta Maharani Update",
  "email": "sinta@potohub.id",
  "role": "operator",
  "assigned_booth_ids": [
    "01928374-aaaa-bbbb-cccc-112233445566"
  ],
  "is_active": true,
  "password": ""
}
```

#### Response Success (`200 OK`)
```json
{
  "id": "01928374-1111-7777-8888-000000000002",
  "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "email": "sinta@potohub.id",
  "name": "Sinta Maharani Update",
  "role": "operator",
  "assigned_booth_ids": [
    "01928374-aaaa-bbbb-cccc-112233445566"
  ],
  "is_active": true,
  "created_at": "2026-08-23T10:05:00Z"
}
```

---

### 3.5 Delete User (`DELETE /api/users/{id}`)

Menghapus akun pengguna dari sistem.

- **Method**: `DELETE`
- **Endpoint**: `/api/users/{id}`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Response Success (`200 OK`)
```json
{
  "message": "User successfully deleted"
}
```

---

### 3.6 Reset User Password (`POST /api/users/{id}/reset-password`)

Admin mereset password pengguna dan membuat password sementara (jika `new_password` diabaikan).

- **Method**: `POST`
- **Endpoint**: `/api/users/{id}/reset-password`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Request Body (Optional)
```json
{
  "new_password": "NewManualPassword123"
}
```

#### Response Success (`200 OK`)
```json
{
  "message": "Password reset successfully for sinta@potohub.id",
  "temporary_password": null
}
```

---

### 3.7 Activate User (`POST /api/users/activate`)

Aktivasi pengguna melalui token undangan.

- **Method**: `POST`
- **Endpoint**: `/api/users/activate`
- **Auth Required**: No (Public with valid token)

#### Request Body
```json
{
  "invite_token": "INV-01928374-ABCD",
  "password": "MySecretPassword123!"
}
```

#### Response Success (`200 OK`)
```json
{
  "id": "01928374-1111-7777-8888-000000000002",
  "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "email": "sinta@potohub.id",
  "name": "Sinta Maharani",
  "role": "operator",
  "assigned_booth_ids": [
    "01928374-aaaa-bbbb-cccc-112233445566"
  ],
  "is_active": true,
  "created_at": "2026-08-23T10:05:00Z"
}
```

---

## 4. Svelte Frontend Integration Notes

1. **Mapping Role**:
   - Role `Admin` di frontend Svelte disamakan dengan `owner` / `Owner` di API.
   - Role `Operator` di frontend Svelte disamakan dengan `operator` / `Operator` di API.
   - Serde backend menerima alias `"Admin"`, `"admin"`, `"Owner"`, `"owner"`.

2. **Management Action Flow**:
   - **Form Tambah User**: Mengirim payload `POST /api/users/invite`. Jika password diisi, user langsung aktif.
   - **Form Edit User**: Mengirim payload `PUT /api/users/{id}`.
   - **Reset Password Modal**: Mengirim payload `POST /api/users/{id}/reset-password`.
   - **Hapus User Modal**: Mengirim payload `DELETE /api/users/{id}`.
