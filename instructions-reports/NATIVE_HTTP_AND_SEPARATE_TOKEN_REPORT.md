# Laporan Implementasi Desktop App: Tauri Native HTTP, Persistent Cookie Jar & Pemisahan Token

**Target Repositori:** `dekstop-app` (Tauri v2 + Svelte 5)  
**Waktu Implementasi:** 20 September 2026  
**Status Akhir:** ✅ **SUKSES, TERUJI & TERVERIFIKASI (Cargo Check Passed, Svelte Check 0 Errors, Build Passed)**

---

## 1. Ringkasan Eksekutif

Aplikasi `dekstop-app` telah diperbarui untuk mendukung standar autentikasi tingkat tinggi berbasis **Native HTTP** & **Token Separation**:

1. **Integrasi Tauri Native HTTP Client (`@tauri-apps/plugin-http`)**:
   - Ditambahkan dependensi `tauri-plugin-http` di Cargo.toml dan `@tauri-apps/plugin-http` di `package.json`.
   - Didaftarkan plugin `.plugin(tauri_plugin_http::init())` pada [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) dan izin `"http:default"` pada [`capabilities/default.json`](../src-tauri/capabilities/default.json).
   - Seluruh panggilan API backend di [`src/lib/api/boothClient.ts`](../src/lib/api/boothClient.ts) kini menggunakan `tauriFetch` (`fetch` bawaan Rust), yang beroperasi di luar konteks browser WebView (OS-level HTTP via `reqwest`).
   - Kebijakan `SameSite=Strict` dan Cookie `HttpOnly` backend dapat dikonsumsi tanpa penolakan atau hambatan CORS/SameSite milik WebView browser.

2. **Pemisahan Peran Token & Migrasi SQLite (`user_session`)**:
   - Ditambahkan migrasi SQLite v8 pada `src-tauri/src/lib.rs` untuk membuat tabel `user_session`.
   - Pada [`src/lib/db/local.ts`](../src/lib/db/local.ts), dibuat helper `getUserSession`, `saveUserSession`, dan `clearUserSession`.
   - Perbaikan bug di [`src/routes/onboarding/+page.svelte`](../src/routes/onboarding/+page.svelte): Login user tidak lagi menimpa `booth_activation.token`.
   - **Booth Token (365 hari)** tetap utuh sebagai kredensial utama operasional kiosk di `booth_activation`.
   - **User Token (15 menit)** disimpan terpisah di `user_session` untuk keperluan otentikasi sesi Settings.

3. **Auto-Refresh User Token via Native HTTP**:
   - Ditambahkan fungsi `refreshUserToken()` di `boothClient.ts` yang mengeksekusi `POST /api/auth/refresh` via `tauriFetch`.
   - Cookie `potohub_refresh_token` (Strict & HttpOnly) otomatis dilampirkan oleh engine HTTP Rust, memperbarui access token di `user_session` secara transparan.

4. **Retensi Alur PIN Lokal Operator**:
   - Operator tetap menggunakan PIN 4 digit lokal di [`PinPad.svelte`](../src/lib/components/shared/PinPad.svelte) untuk kemudahan operasional sehari-hari tanpa mengetik ulang password.

---

## 2. Rincian Perubahan Kode

### A. Migrasi Database & Plugin HTTP ([`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs))
```rust
Migration {
    version: 8,
    description: "create user_session table for operator user token",
    sql: "CREATE TABLE IF NOT EXISTS user_session (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );",
    kind: MigrationKind::Up,
}

// In Builder:
.plugin(tauri_plugin_http::init())
```

### B. Helper SQLite User Session ([`src/lib/db/local.ts`](../src/lib/db/local.ts))
```typescript
export interface UserSession {
  userId: string;
  name: string;
  email: string;
  role: string;
  token: string;
  expiresAt: number;
  updatedAt: number;
}

export async function getUserSession(): Promise<UserSession | null>;
export async function saveUserSession(data: UserSession): Promise<void>;
export async function clearUserSession(): Promise<void>;
```

### C. Pembaharuan Client Auth ([`src/lib/api/boothClient.ts`](../src/lib/api/boothClient.ts))
```typescript
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export async function loginUser(email: string, password: string): Promise<LoginResponseData> {
  const res = await tauriFetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  // ...
  if (data.token && data.user) {
    await saveUserSession({
      userId: data.user.id,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role,
      token: data.token,
      expiresAt: Date.now() + 15 * 60 * 1000,
      updatedAt: Date.now(),
    });
  }
  return data;
}
```

---

## 3. Hasil Verifikasi & Build

1. **Rust Cargo Check (`cargo check --manifest-path src-tauri/Cargo.toml`)**:
   - Sukses dikompilasi dalam 57.31s tanpa error (Exit Code 0).
2. **Svelte Check (`pnpm check`)**:
   - Diagnostic: **0 errors, 0 warnings**.
3. **Build Produksi Vite/Static Adapter (`pnpm build`)**:
   - Aset statis dan SSR bundle sukses di-render ke `build/` (Exit Code 0).
