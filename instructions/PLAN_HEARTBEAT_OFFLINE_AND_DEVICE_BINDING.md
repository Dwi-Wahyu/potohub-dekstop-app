# Plan Implementasi Desktop App: Device Binding, Heartbeat & Offline Mode Confirmation

Dokumen ini berisi rencana teknis implementasi pada repositori `dekstop-app` untuk:
1. **Device Binding**: Menghasilkan dan mempertahankan `device_id` unik agar satu booth hanya aktif pada satu PC.
2. **Authenticated Heartbeat & Telemetry**: Melaporkan status hardware (kamera, printer, kertas) dan outbox ke server setiap 60 detik.
3. **Offline Mode Confirmation**: Mengonfirmasi ke server saat client pulih dari mode offline (`local_mode_recovery`) dan memproses sinkronisasi outbox.

---

## 1. Analisis & Gap di Desktop App Saat Ini

1. **Aktivasi Tanpa Identitas Mesin**:
   - `activateBooth(activationCode)` di [boothClient.ts](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/api/boothClient.ts#L342) hanya mengirim `{ activation_code }`. Tidak ada identifikasi mesin sehingga dua PC berbeda dapat menggunakan kode aktivasi yang sama.
2. **Network Status Anonim**:
   - `NetworkStatusStore` di [networkStatus.svelte.ts](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/stores/networkStatus.svelte.ts) hanya melakukan ping `GET /api/health`. Server tidak tahu booth mana yang sedang online.
3. **Offline Mode Tanpa Konfirmasi ke Server**:
   - Saat koneksi putus, client masuk mode offline dan menyimpan transaksi di SQLite `offline_outbox`.
   - Saat internet pulih, `flushOutbox()` dieksekusi, tetapi server tidak pernah menerima konfirmasi bahwa kiosk sempat beroperasi di mode lokal (`LOCAL_MODE`), berapa lama offline, atau berapa antrean yang sedang disinkronkan.

---

## 2. Perubahan SQLite Schema (Tauri Migrations)

Di file `dekstop-app/src-tauri/src/lib.rs`, tambahkan migrasi baru ke dalam array `migrations`:

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

## 3. Helper Device Identity di `dekstop-app/src/lib/db/local.ts`

Tambahkan fungsi untuk membuat atau mengambil ID perangkat yang persisten di SQLite:

```typescript
export interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
  createdAt: number;
}

export async function getOrCreateDeviceId(): Promise<DeviceIdentity> {
  const conn = await db();
  try {
    const rows = await conn.select<any[]>("SELECT * FROM device_identity WHERE id = 1");
    if (rows.length > 0) {
      return {
        deviceId: rows[0].device_id,
        deviceName: rows[0].device_name ?? 'Photobooth-PC',
        createdAt: rows[0].created_at,
      };
    }
  } catch (e) {
    console.warn("Table device_identity not found or error, generating new:", e);
  }

  // Generate persistent UUID
  const newDeviceId = crypto.randomUUID();
  const deviceName = typeof window !== 'undefined' ? (window.navigator.userAgent.slice(0, 30) || 'Kiosk-Client') : 'Kiosk-Client';
  const now = Date.now();

  try {
    const conn = await db();
    await conn.execute(
      `INSERT INTO device_identity (id, device_id, device_name, created_at)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET device_id = $1`,
      [newDeviceId, deviceName, now]
    );
  } catch (e) {
    console.error("Gagal menyimpan device_identity:", e);
  }

  return { deviceId: newDeviceId, deviceName, createdAt: now };
}
```

---

## 4. Update Proses Aktivasi di `boothClient.ts`

Sertakan `device_id` dan `device_name` saat memanggil `POST /api/booths/activate`:

```typescript
export async function activateBooth(activationCode: string) {
  const identity = await getOrCreateDeviceId();

  const res = await fetch(`${API_BASE}/booths/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      activation_code: activationCode,
      device_id: identity.deviceId,
      device_name: identity.deviceName,
    }),
  });

  if (!res.ok) {
    if (res.status === 409) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || "Booth ini sudah diaktivasi pada perangkat lain. Silakan hubungi admin.");
    }
    const msg = res.status === 404 ? "Kode aktivasi tidak valid." : "Aktivasi gagal, coba lagi.";
    throw new Error(msg);
  }

  const json = await res.json();
  const data = json.data ?? json;

  await saveActivation({
    boothId: data.booth_id,
    activationCode,
    boothName: data.name ?? data.booth_name ?? "Booth",
    organizationId: data.organization_id ?? null,
    templateVariant: data.ui_template_variant ?? "v1",
    activatedAt: new Date().toISOString(),
    token: data.token ?? null,
  });

  uiConfig.save({ templateVariant: data.ui_template_variant ?? "v1" });
  return data;
}
```

---

## 5. Upgrade `networkStatus.svelte.ts`: Heartbeat & Reconnection Confirmation

Gantikan anonymous ping loop dengan heartbeat yang mengirim telemetry dan konfirmasi offline recovery:

```typescript
import { flushOutbox, countPendingOutboxJobs } from '$lib/utils/offlineOutbox';
import { getActivation } from '$lib/db/local';
import { getOrCreateDeviceId } from '$lib/db/local';
import { printer } from '$lib/printer.svelte';
import { camera } from '$lib/camera.svelte';

const HEARTBEAT_INTERVAL_MS = 60000; // 60 detik
const HEARTBEAT_JITTER_MS = 10000;   // ±10 detik jitter
const OFFLINE_RETRY_MS = 5000;       // Tiap 5 detik jika offline

class NetworkStatusStore {
  isOnline = $state(true);
  offlineSince = $state<number | null>(null);
  consecutiveFailures = 0;
  private heartbeatTimer: any = null;

  init() {
    window.addEventListener('online', () => this.handleReconnected());
    window.addEventListener('offline', () => this.handleOfflineDetected());
    this.startHeartbeatLoop();
  }

  private async sendHeartbeat(mode: 'normal' | 'local_mode_recovery' = 'normal'): Promise<boolean> {
    const activation = await getActivation();
    if (!activation || !activation.boothId) {
      // Jika booth belum diaktivasi, fallback ke ping GET /api/health
      return this.pingFallback();
    }

    const identity = await getOrCreateDeviceId();
    const pendingOutbox = await countPendingOutboxJobs().catch(() => 0);

    const offlineDuration = this.offlineSince 
      ? Math.floor((Date.now() - this.offlineSince) / 1000) 
      : null;

    const payload = {
      device_id: identity.deviceId,
      app_version: "0.1.0",
      mode: mode,
      camera_status: camera.status === 'connected' ? 'CONNECTED' : 'DISCONNECTED',
      printer_status: printer.status?.has_error ? 'ERROR' : (printer.status?.is_online ? 'READY' : 'OFFLINE'),
      remaining_paper: printer.status?.paper_remaining ?? null,
      pending_outbox_count: pendingOutbox,
      offline_duration_seconds: offlineDuration,
    };

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${API_BASE}/booths/${activation.boothId}/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activation.token ? { Authorization: `Bearer ${activation.token}` } : {})
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async handleReconnected() {
    console.log('[NetworkStatus] Jaringan pulih. Mengirim konfirmasi recovery & flush outbox...');
    const ok = await this.sendHeartbeat('local_mode_recovery');
    if (ok) {
      this.isOnline = true;
      this.offlineSince = null;
      this.consecutiveFailures = 0;
      await flushOutbox();
    }
  }

  private handleOfflineDetected() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= 2 && this.isOnline) {
      console.warn('[NetworkStatus] Heartbeat gagal berulang. Masuk ke mode offline lokal.');
      this.isOnline = false;
      this.offlineSince = Date.now();
    }
  }

  private startHeartbeatLoop() {
    const jitter = (Math.random() * 2 - 1) * HEARTBEAT_JITTER_MS;
    const interval = this.isOnline ? (HEARTBEAT_INTERVAL_MS + jitter) : OFFLINE_RETRY_MS;

    this.heartbeatTimer = setTimeout(async () => {
      const ok = await this.sendHeartbeat(this.offlineSince ? 'local_mode_recovery' : 'normal');
      if (ok) {
        if (!this.isOnline) {
          await this.handleReconnected();
        }
        this.consecutiveFailures = 0;
      } else {
        this.handleOfflineDetected();
      }
      this.startHeartbeatLoop();
    }, interval);
  }
}
```

---

## 6. Skenario Uji (Verification)
1. **Multi-device rejection**:
   - Jalankan aktivasi di mesin A dengan activation code `X`. Sukses.
   - Buka mesin B dengan activation code `X`. Server harus merespons 409 Conflict dan UI onboarding menampilkan pesan error yang ramah.
2. **Heartbeat & Telemetry**:
   - Amati log network. Tiap ~60s request `POST /api/booths/{id}/heartbeat` terkirim dengan status kamera dan printer.
3. **Simulasi Offline & Recovery**:
   - Matikan koneksi jaringan. Kiosk mendeteksi 2x gagal dan masuk mode lokal.
   - Lakukan transaksi via QR ticket (tersimpan di `offline_outbox`).
   - Hidupkan kembali jaringan. Kiosk mengirim heartbeat recovery, server menerima konfirmasi, lalu `flushOutbox()` menyinkronkan transaksi ke API.
