# 20. Audit Logs Specification (`/api/audit-logs`)

## 1. Overview & Architecture

Modul **Audit Logs** mencatat seluruh histori tindakan penting (pembuatan, pembaruan, penghapusan, aktivasi, dan reset password) yang dilakukan oleh pengguna di dalam sistem untuk kebutuhan keandalan dan keamanan (*compliance audit*).

- **Base Path**: `/api/audit-logs`
- **Security**: Bearer JWT (`Authorization: Bearer <token>`).
- **Authorization**: Membutuhkan hak akses `Owner` atau `SuperAdmin`.

---

## 2. Struktur Data Database (`audit_logs`)

| Atribut | Tipe | Default | Deskripsi |
|---|---|---|---|
| `id` | `UUID` | UUID v7 | Identifier unik log audit |
| `organization_id` | `UUID` | `NULL` | Foreign key ke `organizations(id)` |
| `user_id` | `UUID` | `NULL` | Foreign key ke `users(id)` (SET NULL jika user dihapus) |
| `user_name` | `VARCHAR(255)` | `NULL` | Nama user saat melakukan aksi |
| `user_email` | `VARCHAR(255)` | `NULL` | Email user saat melakukan aksi |
| `action` | `VARCHAR(100)` | - | Kode nama aksi (contoh: `user.created`, `password.reset`) |
| `resource_type` | `VARCHAR(50)` | - | Tipe resource target (contoh: `user`, `booth`, `setting`) |
| `resource_id` | `VARCHAR(255)` | `NULL` | ID dari resource target |
| `details` | `JSONB` | `{}` | Metadata detail perubahan dalam bentuk JSON |
| `ip_address` | `VARCHAR(45)` | `NULL` | Alamat IP pelaksana aksi |
| `created_at` | `TIMESTAMPTZ` | `NOW()` | Timestamp eksekusi aksi |

---

## 3. Spesifikasi Endpoint REST

### 3.1 List Audit Logs (`GET /api/audit-logs`)

Mengambil daftar log aktivitas dengan dukungan paginasi dan filter.

- **Method**: `GET`
- **Endpoint**: `/api/audit-logs`
- **Query Parameters**:
  - `page` (`integer`, optional, default `1`)
  - `limit` (`integer`, optional, default `20`)
  - `user_id` (`UUID`, optional): Filter log berdasarkan ID user tertentu
  - `action` (`string`, optional): Filter berdasarkan nama aksi
  - `resource_type` (`string`, optional): Filter berdasarkan tipe resource

#### Response Success (`200 OK`)
```json
{
  "data": [
    {
      "id": "01928374-9999-8888-7777-000000000001",
      "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
      "user_id": "01928374-1111-7777-8888-000000000001",
      "user_name": "Rizky Pratama",
      "user_email": "rizky@potohub.id",
      "action": "user.created",
      "resource_type": "user",
      "resource_id": "01928374-1111-7777-8888-000000000002",
      "details": {
        "email": "sinta@potohub.id",
        "name": "Sinta Maharani",
        "role": "operator"
      },
      "ip_address": null,
      "created_at": "2026-08-23T10:05:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "total_pages": 1
}
```

---

### 3.2 Get Audit Log Details (`GET /api/audit-logs/{id}`)

- **Method**: `GET`
- **Endpoint**: `/api/audit-logs/{id}`
- **Auth Required**: Yes (`Owner` / `SuperAdmin`)

#### Response Success (`200 OK`)
```json
{
  "id": "01928374-9999-8888-7777-000000000001",
  "organization_id": "e4f8a2b1-1234-5678-9abc-def012345678",
  "user_id": "01928374-1111-7777-8888-000000000001",
  "user_name": "Rizky Pratama",
  "user_email": "rizky@potohub.id",
  "action": "user.created",
  "resource_type": "user",
  "resource_id": "01928374-1111-7777-8888-000000000002",
  "details": {
    "email": "sinta@potohub.id",
    "name": "Sinta Maharani",
    "role": "operator"
  },
  "ip_address": null,
  "created_at": "2026-08-23T10:05:00Z"
}
```
