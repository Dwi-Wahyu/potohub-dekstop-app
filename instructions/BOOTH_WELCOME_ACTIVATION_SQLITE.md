# Instruksi: Penyimpanan Lokal SQLite + Alur Welcome & Aktivasi + Perbaikan Tombol Sync

Target repo: **dekstop-app** (Tauri v2 + SvelteKit)

> ⚠️ **File referensi `last-photohub-design-from-figma-make/src/pages/Perangkat.tsx`
> TIDAK ada di context yang saya terima** (sudah dicek ke seluruh isi `dekstop-app`).
> Instruksi di bawah merancang struktur & isi step berdasarkan deskripsi user
> (step existing "Pilih Tampilan" & "Konfirmasi" dihapus, step "Kode Aktivasi"
> ditambahkan). **Agen CLI WAJIB menarik file `Perangkat.tsx` yang sebenarnya
> dari repo `last-photohub-design-from-figma-make`** sebelum implementasi visual
> final, untuk mencocokkan detail styling/komponen persis dengan desain asli.
> Kalau file itu juga tidak ditemukan di environment agen, laporkan sebagai
> blocker di §7, jangan menebak-nebak desain visualnya.

## 0. Diagnosis — kenapa ini bug nyata, bukan asumsi

Hasil audit `src/lib/api/boothClient.ts`, `src/lib/stores/*.ts`,
`src/routes/+page.svelte`, dan `src/lib/components/v1/V1ConfigDashboard.svelte`:

1. **Tidak ada penyimpanan lokal terstruktur sama sekali.** Semua state
   (`booth_id`, `ui_template_variant`, `booth_settings_*`, `potohub_ui_config_*`)
   disimpan lewat `localStorage` webview biasa — tidak ada SQLite atau
   penyimpanan native Tauri. `package.json` & `src-tauri/Cargo.toml` tidak
   mengandung `@tauri-apps/plugin-sql` / `tauri-plugin-sql` sama sekali.
2. **`booth_id` memang tidak pernah benar-benar teraktivasi lewat UI.**
   `activateBooth()` di `boothClient.ts` ADA dan berfungsi, tapi tidak pernah
   dipanggil dari layar manapun. Sebagai gantinya ada `ensureBoothId()` yang,
   kalau tidak menemukan `booth_id` valid di `localStorage`, **otomatis**
   memanggil `activateBooth(DEFAULT_SEED_ACTIVATION_CODE)` dengan kode hardcode
   `'SEED-ACTIVATION-CODE-001'` — tanpa sepengetahuan/tindakan operator. Ini
   persis akar masalah "booth id tidak terbaca": begitu kode seed itu tidak
   valid lagi di server (atau di server produksi lain), booth diam-diam gagal
   teraktivasi dan jatuh ke fallback `'default'` (bukan UUID valid), yang bikin
   semua panggilan API booth-scoped gagal/silent-fail.
3. **`src/routes/+page.svelte` langsung merender `V1/V2/V3Layout`** begitu
   mount — tidak ada pengecekan status aktivasi, tidak ada layar welcome
   aplikasi, tidak ada input kode aktivasi. `V1Layout.svelte` dkk memang punya
   substep `'welcome'` sebagai state awal, tapi itu adalah **layar landing booth
   untuk CUSTOMER** (bagian dari flow foto), bukan layar onboarding aplikasi
   untuk OPERATOR.
4. **Tombol "Sync" di `V1ConfigDashboard.svelte` (`handleSync`) sudah memanggil
   `syncBoothSettings()`, tapi hasilnya dibuang.** `syncBoothSettings()` sendiri
   sudah benar memanggil `fetchAndCacheUiConfig()` (jadi _tampilan_ memang ikut
   ter-refresh) — tapi field `settings` (JSONB operasional: PIN, timer,
   kamera, dsb dari `GET/POST /booths/{id}/settings*`) hasil sync **tidak
   pernah dipetakan ke `boothConfig` store**. Operator klik "Sync", dapat toast
   "Tersinkron", tapi PIN/timer/orientasi kamera di layar itu tidak berubah
   sama sekali walau sudah diubah dari admin dashboard.
5. **Backend SUDAH siap** untuk kebutuhan ini — `POST /api/booths/activate` dan
   `POST /api/booths/{boothId}/settings/sync` sudah ada dan berfungsi (lihat
   `src/handlers/booth.rs::activate_booth`, `src/handlers/setting.rs::sync_settings`).
   Tidak perlu endpoint baru untuk fitur ini. Ada 1 catatan kecil untuk backend
   di §6.

---

## 1. Keputusan Desain

- **SQLite via `@tauri-apps/plugin-sql`** (plugin resmi Tauri v2) untuk
  menyimpan status aktivasi booth. `localStorage` TETAP dipakai untuk cache UI
  config/booth settings yang sifatnya non-kritis (sudah jalan baik, tidak perlu
  dipindah) — yang WAJIB pindah ke SQLite hanya **status aktivasi** (`booth_id`,
  `activation_code`, `booth_name`, `organization_id`, `template_variant`,
  `activated_at`), karena ini satu-satunya data yang harus survive dengan pasti
  antar restart aplikasi dan harus bisa di-reset eksplisit (logout), bukan
  ketimpa cache lain.
- **Hapus total mekanisme auto-activate pakai seed code.** `ensureBoothId()`
  tidak lagi mencoba aktivasi diam-diam. Kalau tidak ada data aktivasi valid di
  SQLite → aplikasi WAJIB menampilkan alur Welcome → Kode Aktivasi.
- **Alur baru:** `Welcome` (branding, referensi `Perangkat.tsx`) → `Kode
Aktivasi` (input, panggil `POST /booths/activate`) → sukses → simpan ke SQLite
  → **langsung ke halaman pengaturan yang sudah ada** (`V1ConfigDashboard.svelte`,
  dipakai bersama oleh V1/V2/V3 — TIDAK membuat halaman pengaturan baru). TIDAK
  ADA step "Pilih Tampilan" (template variant datang dari response aktivasi,
  bukan dipilih manual) dan TIDAK ADA step "Konfirmasi" (langsung ke pengaturan
  itu sendiri sudah berfungsi sebagai tempat operator mengecek semuanya).
- Dari halaman pengaturan itu, PIN gate (5-tap + PIN) yang sudah ada di
  `V1Landing.svelte` untuk masuk ke config **DILEWATI khusus untuk kunjungan
  pertama setelah aktivasi** (operator baru saja membuktikan diri lewat kode
  aktivasi) — tapi tetap berlaku seperti biasa untuk akses berikutnya dari
  layar welcome booth.
- Setelah aktivasi awal selesai dan operator menutup halaman pengaturan (tombol
  "Kembali"), aplikasi baru masuk ke flow booth normal (`currentSubStep =
'welcome'` di V1/V2/V3Layout, seperti sekarang).

---

## 2. Setup SQLite (Tauri Plugin)

### 2.1 `src-tauri/Cargo.toml`

```toml
[dependencies]
# ...dependency yang sudah ada tetap
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
```

### 2.2 `src-tauri/src/lib.rs`

Tambahkan plugin ke builder (cari `tauri::Builder::default()` yang sudah ada,
biasanya di fungsi `run()`):

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(
        tauri_plugin_sql::Builder::default()
            .add_migrations(
                "sqlite:app.db",
                vec![tauri_plugin_sql::Migration {
                    version: 1,
                    description: "create booth_activation table",
                    sql: "CREATE TABLE IF NOT EXISTS booth_activation (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        booth_id TEXT NOT NULL,
                        activation_code TEXT NOT NULL,
                        booth_name TEXT NOT NULL,
                        organization_id TEXT,
                        template_variant TEXT NOT NULL DEFAULT 'v1',
                        activated_at TEXT NOT NULL
                    );",
                    kind: tauri_plugin_sql::MigrationKind::Up,
                }],
            )
            .build(),
    )
    // ...plugin lain & .manage(...) yang sudah ada tetap
```

> `id INTEGER PRIMARY KEY CHECK (id = 1)` — desain sengaja single-row (1 booth
> per instalasi aplikasi kios), memudahkan query `getActivation()` tanpa
> parameter.

### 2.3 `package.json`

```json
"dependencies": {
  "@tauri-apps/plugin-sql": "^2"
}
```

### 2.4 `src-tauri/capabilities/default.json`

Tambahkan permission:

```json
"permissions": [
  "core:default",
  "opener:default",
  "core:path:default",
  "sql:default",
  "sql:allow-load",
  "sql:allow-execute",
  "sql:allow-select"
]
```

### 2.5 Modul wrapper `src/lib/db/local.ts` (BARU)

```ts
import Database from "@tauri-apps/plugin-sql";

export interface BoothActivation {
  boothId: string;
  activationCode: string;
  boothName: string;
  organizationId: string | null;
  templateVariant: "v1" | "v2" | "v3";
  activatedAt: string;
}

let dbPromise: ReturnType<typeof Database.load> | null = null;
function db() {
  if (!dbPromise) dbPromise = Database.load("sqlite:app.db");
  return dbPromise;
}

export async function getActivation(): Promise<BoothActivation | null> {
  const conn = await db();
  const rows = await conn.select<any[]>(
    "SELECT * FROM booth_activation WHERE id = 1",
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    boothId: r.booth_id,
    activationCode: r.activation_code,
    boothName: r.booth_name,
    organizationId: r.organization_id,
    templateVariant: r.template_variant,
    activatedAt: r.activated_at,
  };
}

export async function saveActivation(data: BoothActivation): Promise<void> {
  const conn = await db();
  await conn.execute(
    `INSERT INTO booth_activation (id, booth_id, activation_code, booth_name, organization_id, template_variant, activated_at)
     VALUES (1, $1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       booth_id = $1, activation_code = $2, booth_name = $3,
       organization_id = $4, template_variant = $5, activated_at = $6`,
    [
      data.boothId,
      data.activationCode,
      data.boothName,
      data.organizationId,
      data.templateVariant,
      data.activatedAt,
    ],
  );
}

export async function clearActivation(): Promise<void> {
  const conn = await db();
  await conn.execute("DELETE FROM booth_activation WHERE id = 1");
}
```

> Catatan SQL: sqlite `INSERT ... ON CONFLICT` butuh kolom `id` sebagai
> `PRIMARY KEY` (sudah, lihat §2.2) supaya upsert bekerja. Kalau versi SQLite
> yang dibundel Tauri bermasalah dengan sintaks ini, fallback aman: `DELETE
FROM booth_activation; INSERT INTO booth_activation (...) VALUES (...)` dalam
> 2 statement — tetap dalam 1 fungsi `saveActivation`, tidak mengubah tanda
> tangan fungsi ini.

---

## 3. `boothClient.ts` — bersihkan mekanisme aktivasi

### 3.1 Hapus

- `ensureBoothId()` beserta `DEFAULT_SEED_ACTIVATION_CODE` — **hapus
  total**, tidak ada lagi auto-activate diam-diam.
- Semua `localStorage.getItem('booth_id')` sebagai sumber kebenaran — ganti
  dengan baca dari SQLite (`getActivation()`).

### 3.2 Ubah `activateBooth` — tulis ke SQLite, bukan `localStorage`

```ts
import { saveActivation } from "$lib/db/local";

export async function activateBooth(activationCode: string) {
  const res = await fetch(`${API_BASE}/booths/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activation_code: activationCode }),
  });
  if (!res.ok) {
    const msg =
      res.status === 404
        ? "Kode aktivasi tidak valid."
        : "Aktivasi gagal, coba lagi.";
    throw new Error(msg);
  }
  const json = await res.json();
  const data = json.data ?? json;

  await saveActivation({
    boothId: data.booth_id,
    activationCode,
    boothName: data.name,
    organizationId: data.organization_id ?? null,
    templateVariant: data.ui_template_variant ?? "v1",
    activatedAt: new Date().toISOString(),
  });

  uiConfig.save({ templateVariant: data.ui_template_variant ?? "v1" });
  return data;
}
```

### 3.3 Fungsi baru — pengganti `ensureBoothId()`

```ts
import { getActivation } from "$lib/db/local";

export async function getActiveBoothId(): Promise<string | null> {
  const activation = await getActivation();
  return activation?.boothId ?? null;
}
```

Semua pemanggil `localStorage.getItem('booth_id')` di file ini
(`fetchAndCacheUiConfig`, `fetchCategories`, `fetchTemplates`,
`syncBoothSettings`) diganti memanggil `await getActiveBoothId()`. Kalau hasil
`null` → fungsi-fungsi itu harus melempar error/return early (JANGAN fallback
ke `'default'` lagi) — pemanggil di level UI (root `+page.svelte`) yang
bertanggung jawab memastikan tidak memanggil fungsi-fungsi ini sebelum
aktivasi selesai (lihat §5).

### 3.4 Perbaiki `syncBoothSettings` — terapkan hasil sync, jangan cuma dibuang

```ts
import { boothConfig } from "$lib/stores/boothConfig.svelte";

// Mapping grup 'general'/'timer' dari settings JSONB backend ke BoothCfg lokal.
// Field yang tidak ada padanannya di BoothCfg (mis. 'gif', 'phone', 'language',
// grup 'print'/'softfile') SENGAJA tidak dipetakan — booth client saat ini
// tidak punya field untuk itu; jangan menambah field baru tanpa keputusan
// produk terpisah, cukup abaikan field yang tidak dikenal.
const CAMERA_ROTATE_MAP: Record<number, string> = {
  0: "0° (Default)",
  90: "90° CW",
  180: "180°",
  270: "90° CCW",
};

function applyRemoteSettings(settings: Record<string, any>) {
  const general = settings?.general ?? {};
  const timer = settings?.timer ?? {};
  boothConfig.save({
    pin: general.pin ?? boothConfig.config.pin,
    cameraRotate:
      CAMERA_ROTATE_MAP[general.camera_rotate] ??
      boothConfig.config.cameraRotate,
    mirrorOn: general.mirror ?? boothConfig.config.mirrorOn,
    paymentPage: general.payment_page ?? boothConfig.config.paymentPage,
    photoFilter: general.photo_filter ?? boothConfig.config.photoFilter,
    countdownSecs:
      timer.first_countdown_time ?? boothConfig.config.countdownSecs,
  });
}

export async function syncBoothSettings() {
  const boothId = await getActiveBoothId();
  if (!boothId) throw new Error("Booth belum teraktivasi.");
  try {
    const res = await fetch(`${API_BASE}/booths/${boothId}/settings/sync`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Sync gagal");
    const data = await res.json();
    applyRemoteSettings(data.settings ?? {}); // BARU — sebelumnya dibuang
    await fetchAndCacheUiConfig(); // tampilan (sudah benar sebelumnya)
    return data;
  } catch (e) {
    throw e instanceof Error ? e : new Error("Sync gagal");
  }
}
```

> **Perubahan perilaku sengaja:** versi lama diam-diam fallback ke "mock
> sync" kalau request gagal (supaya toast selalu terlihat sukses walau
> offline) — ini menyembunyikan kegagalan nyata dari operator. Sekarang
> `syncBoothSettings()` melempar error kalau gagal; `handleSync` di
> `V1ConfigDashboard.svelte` (§4) yang menampilkan pesan error yang jujur.

---

## 4. `V1ConfigDashboard.svelte` — perbaiki tombol Sync

```ts
async function handleSync() {
  syncStatus = "Syncing...";
  try {
    const res = await syncBoothSettings();
    syncStatus = res?.last_sync_at
      ? `Tersinkron ${res.last_sync_at}`
      : "Tersinkronisasi";
  } catch (e) {
    syncStatus = e instanceof Error ? e.message : "Sync gagal";
  }
  setTimeout(() => {
    syncStatus = null;
  }, 3000);
}
```

Fungsi ini sebenarnya sudah hampir identik dengan sebelumnya di sisi
pemanggilan — perubahan nyata ada di §3.4 (`syncBoothSettings` itu sendiri).
Tidak perlu ubah struktur tombol/UI lain di file ini.

---

## 5. Alur Welcome & Aktivasi (BARU)

### 5.1 Struktur rute

```
src/routes/
  +page.svelte              # existing — booth flow V1/V2/V3Layout (diubah, lihat §5.4)
  onboarding/+page.svelte   # BARU — wizard Welcome → Kode Aktivasi
  settings/+page.svelte     # BARU — host V1ConfigDashboard sebagai halaman standalone
```

### 5.2 `src/routes/onboarding/+page.svelte` (BARU)

2 step (bukan 4 seperti referensi Figma — "Pilih Tampilan" & "Konfirmasi"
dihilangkan sesuai instruksi):

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { activateBooth } from '$lib/api/boothClient';

  let step = $state<'welcome' | 'activation'>('welcome');
  let code = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleActivate() {
    if (!code.trim()) { error = 'Masukkan kode aktivasi.'; return; }
    loading = true;
    error = '';
    try {
      await activateBooth(code.trim());
      await goto('/settings?firstRun=1');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Aktivasi gagal.';
    } finally {
      loading = false;
    }
  }
</script>

{#if step === 'welcome'}
  <!-- Layar branding — REFERENSI VISUAL: Perangkat.tsx (welcome/intro state),
       lihat catatan blocker di §0/§7 kalau file itu tidak tersedia di
       environment agen. Struktural minimum: logo/branding produk, judul
       singkat, tombol "Mulai" yang memanggil `step = 'activation'`. -->
  <button onclick={() => (step = 'activation')}>Mulai</button>
{:else}
  <!-- Layar BARU: Kode Aktivasi — TIDAK ADA di desain referensi asli, ini
       step tambahan sesuai instruksi. Styling mengikuti bahasa visual yang
       sama dengan layar welcome (bukan style acak) supaya terasi satu alur. -->
  <input bind:value={code} placeholder="Kode Aktivasi" disabled={loading} />
  {#if error}<p class="text-red-500">{error}</p>{/if}
  <button onclick={handleActivate} disabled={loading}>
    {loading ? 'Memverifikasi...' : 'Aktivasi'}
  </button>
{/if}
```

### 5.3 `src/routes/settings/+page.svelte` (BARU)

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import V1ConfigDashboard from '$lib/components/v1/V1ConfigDashboard.svelte';
  import { clearActivation } from '$lib/db/local';

  function handleBack() {
    goto('/');
  }
  async function handleLogout() {
    await clearActivation();
    await goto('/onboarding');
  }
</script>

<V1ConfigDashboard onBack={handleBack} onLogout={handleLogout} />
```

> Query param `?firstRun=1` (dikirim dari §5.2) TIDAK dipakai untuk mengubah
> tampilan `V1ConfigDashboard` — hanya untuk keperluan analytics/log opsional
> kalau dibutuhkan nanti. Tombol "Kembali" & "Logout" tetap sama persis dengan
> yang sudah ada, tidak ada percabangan perilaku berdasar first-run.
>
> **Penting:** `V1ConfigDashboard.svelte` dipakai bersama oleh V1/V2/V3Layout
> (lihat diagnosis §0 poin terkait) — dengan mengekstraknya ke rute standalone
> ini, ubah juga `handleOpenConfig()` di `V1Layout.svelte` / `V2Layout.svelte`
> / `V3Layout.svelte` supaya memanggil `goto('/settings')` alih-alih mengganti
> `currentSubStep`/`step` internal ke `'config'` — ini MENGHILANGKAN duplikasi
> (file yang sama tidak lagi dirender dari 2 tempat berbeda dengan cara
> berbeda). Hapus juga case `{:else if step === 'config'}` di ketiga file
> Layout tersebut setelah pemanggilan dipindah ke `goto`.

### 5.4 `src/routes/+page.svelte` — gating aktivasi

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getActivation } from '$lib/db/local';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import { boothConfig } from '$lib/stores/boothConfig.svelte';
  import { cameraStore } from '$lib/camera.svelte';
  import { fetchAndCacheUiConfig } from '$lib/api/boothClient';
  import V1Layout from '$lib/components/v1/V1Layout.svelte';
  import V2Layout from '$lib/components/v2/V2Layout.svelte';
  import V3Layout from '$lib/components/v3/V3Layout.svelte';

  let ready = $state(false);

  onMount(async () => {
    const activation = await getActivation();
    if (!activation) {
      await goto('/onboarding');
      return;
    }
    boothConfig.init(activation.boothId);
    uiConfig.init(activation.boothId);
    await fetchAndCacheUiConfig();   // sekarang aman — boothId sudah pasti valid dari SQLite
    if (boothConfig.config.cameraMode) {
      await cameraStore.connect(boothConfig.config.cameraMode);
    }
    ready = true;
  });
</script>

{#if ready}
  {#if uiConfig.templateVariant === 'v2'}
    <V2Layout />
  {:else if uiConfig.templateVariant === 'v3'}
    <V3Layout />
  {:else}
    <V1Layout />
  {/if}
{/if}
```

> Sebelumnya `boothConfig.init('default')` / `uiConfig.init('default')` selalu
> pakai string `'default'` — sekarang pakai `activation.boothId` sungguhan,
> supaya key `localStorage` cache (`booth_settings_${boothId}`,
> `potohub_ui_config_${boothId}`) konsisten per-booth yang benar-benar
> teraktivasi (penting untuk kios yang pernah dipindah-tangan/di-reset ke
> booth lain — cache lama tidak akan tercampur).

---

## 6. Catatan untuk Backend (opsional, kecil)

`GET /api/booths/{boothId}/settings` dan `POST /api/booths/{boothId}/settings/sync`
di-anotasi `security(("bearer_auth" = []))` di `#[utoipa::path]`, tapi handler
Rust-nya (`src/handlers/setting.rs`) **tidak punya parameter `AuthenticatedUser`
sama sekali** — jadi di implementasi nyata endpoint ini TIDAK menegakkan Bearer
JWT (booth client memang tidak punya JWT user, jadi ini kebetulan cocok untuk
kebutuhan kita). Ini bukan blocker untuk instruksi ini, tapi:

- Perbaiki anotasi OpenAPI-nya (hapus `security(...)` dari `get_settings` &
  `sync_settings`, atau — kalau memang butuh proteksi — tambahkan validasi
  ringan berbasis `booth_id` yang valid & `status = 'active'`, BUKAN JWT user,
  karena pemanggilnya adalah booth device, bukan admin login).
- Ini di luar cakupan instruksi ini untuk dieksekusi sekarang — cukup catat di
  laporan implementasi sebagai temuan terpisah, jangan ubah kode backend tanpa
  instruksi eksplisit lanjutan.

---

## 7. Post-Implementation

1. `pnpm tauri dev` — uji manual dari kondisi fresh install (hapus
   `booth.db` di app data dir kalau ada dari testing sebelumnya): app harus
   membuka `/onboarding`, BUKAN langsung ke booth flow.
2. Uji kode aktivasi salah → pesan error tampil, tidak nyangkut di loading.
3. Uji kode aktivasi benar → masuk `/settings` (bukan langsung booth flow),
   data booth (nama, dsb) benar sesuai booth yang diaktivasi.
4. Restart aplikasi (tanpa clear data) → harus LANGSUNG masuk booth flow
   (`/`), TIDAK kembali ke onboarding (SQLite persist across restart).
5. Dari layar welcome booth (bukan onboarding), tap logo 5x + PIN → tetap
   masuk `/settings` seperti biasa (jalur existing tidak boleh rusak).
6. Di `/settings`, klik "Sync" dengan backend menyala → PIN/timer di form
   ikut berubah kalau sebelumnya diubah dari admin dashboard (bukti
   `applyRemoteSettings` bekerja). Matikan backend → klik Sync → pesan error
   jujur muncul (bukan toast sukses palsu seperti versi lama).
7. Tombol "Logout" di `/settings` → SQLite terhapus, app kembali ke
   `/onboarding`.
8. **Laporkan status file `Perangkat.tsx`** di
   `instruction-reports/BOOTH_WELCOME_ACTIVATION_SQLITE.md` — apakah
   ditemukan & dipakai sebagai referensi visual, atau desain welcome screen
   dibuat dari struktur minimum di §5.2 karena file tidak tersedia. Sertakan
   juga: file yang diubah/dibuat, hasil pengujian §7.1-7.7, dan temuan §6.
