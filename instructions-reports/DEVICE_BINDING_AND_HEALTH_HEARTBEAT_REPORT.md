# Report Implementasi Desktop App: Device Binding, Heartbeat & Offline Recovery

Dokumen ini mencatat implementasi pada repositori `dekstop-app` untuk **Single-Device Binding**, **Telemetry Heartbeat**, dan **Konfirmasi Offline Mode Recovery**.

---

## 1. Perubahan SQLite Schema (Tauri Migrations)

Di file `dekstop-app/src-tauri/src/lib.rs`, ditambahkan `Migration` version 9:

```rust
Migration {
    version: 9,
    description: "create device_identity table and add device_id to booth_activation",
    sql: "CREATE TABLE IF NOT EXISTS device_identity (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        device_id TEXT NOT NULL,
        device_name TEXT,
        created_at INTEGER NOT NULL
    );
    ALTER TABLE booth_activation ADD COLUMN device_id TEXT;",
    kind: MigrationKind::Up,
}
```

---

## 2. Implementasi & Perubahan Kode

### A. Persistensi Device Identity (`src/lib/db/local.ts`)
- Dibuat interface `DeviceIdentity` dan fungsi helper `getOrCreateDeviceId()`.
- Menghasilkan UUID v4 tunggal yang tersimpan di SQLite `device_identity` untuk mengidentifikasi perangkat kiosk secara unik & persisten.

### B. Single-Device Activation (`src/lib/api/boothClient.ts`)
- Fungsi `activateBooth(activationCode)` diperbarui untuk mengambil `device_id` dan `device_name` dari `getOrCreateDeviceId()` dan mengirimkannya saat memanggil `POST /api/booths/activate`.
- Menangani HTTP `409 Conflict` dengan pesan error:
  `"Booth ini sudah diaktivasi pada perangkat lain. Silakan hubungi admin untuk mereset aktivasi."`

### C. Authenticated Heartbeat & Recovery (`src/lib/stores/networkStatus.svelte.ts`)
- Mengganti ping anonim `/health` dengan heartbeat terautentikasi ke `POST /api/booths/{boothId}/heartbeat`.
- Interval dikonfigurasi 60 detik dengan **jitter ±10 detik** saat online, dan 5 detik saat offline/verifikasi.
- Telemetry mencakup status kamera (`cameraStore.status`), printer (`printerStore.status`), sisa kertas, dan antrean `countPendingOutboxJobs()`.
- Menangani transisi offline: jika heartbeat gagal 2 kali berturut-turut, tandai `isOnline = false` dan catat timestamp `offlineSince`.
- Menangani konfirmasi pemulihan: saat koneksi pulih, kirim heartbeat dengan `mode: 'local_mode_recovery'` dan durasi offline, lalu jalankan `flushOutbox()`.

---

## 3. Hasil Pengujian (Verification)
- Menjalankan `npm run check` (`svelte-check`): **0 errors and 0 warnings**.
