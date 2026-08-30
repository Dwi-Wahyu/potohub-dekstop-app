# Instruksi Perbaikan — 3 Bug Sesi Photobooth (`dekstop-app`)

**Target:** `dekstop-app` (Tauri v2 + SvelteKit 2 + Svelte 5), varian UI yang dipakai: **V1**.

**Konteks yang sudah diverifikasi langsung dari source code** (bukan asumsi):

- Ada 3 bug dilaporkan: (A) hasil sesi tidak ter-upload ke R2, (B) live view (klip video pra-capture) tidak pernah tersimpan sama sekali, (C) template frame selalu salah/sama meski user memilih frame berbeda.
- **Bug C sudah dikonfirmasi 100% root cause-nya** lewat pembacaan kode langsung (lihat §1). Bug A dan B **belum bisa dipastikan 100%** tanpa log runtime — instruksi §2 dan §3 berisi perbaikan kode yang sudah pasti perlu (code smell terverifikasi) **plus** instrumentasi log supaya titik gagal presisinya ketahuan di sesi uji berikutnya.
- Semua perbaikan di dokumen ini murni di `dekstop-app`. Tidak ditemukan bukti bug di sisi `api` untuk ketiga masalah ini

---

## 1. Bug C — Template Frame Selalu Salah / Tidak Pernah Berganti

### 1.1 Root Cause (Terverifikasi)

`localStorage.getItem('booth_id')` **tidak pernah di-set di mana pun** di codebase — booth ID hanya disimpan di SQLite lewat `saveActivation()` (`src/lib/db/local.ts`) dan dibaca lewat `getActiveBoothId()` (`src/lib/api/boothClient.ts`). Grep berikut membuktikannya:

```bash
grep -rn "localStorage.setItem" src/   # tidak ada satupun untuk key 'booth_id'
```

Akibatnya, di layar-layar **pemilihan** frame, pola `const boothId = localStorage.getItem('booth_id') || 'default';` **selalu jatuh ke string literal `'default'`**. String ini bukan UUID valid, sedangkan `fetchTemplates()`/`fetchCategories()` di `src/lib/api/boothClient.ts` punya guard:

```ts
const targetBoothId = boothId || (await getActiveBoothId());
if (!targetBoothId || !isValidUUID(targetBoothId)) {
  throw new Error("Booth belum teraktivasi (ID tidak valid)");
}
```

Karena `boothId` param yang di-pass eksplisit adalah `'default'` (truthy), baris `boothId || (await getActiveBoothId())` **mengabaikan** `getActiveBoothId()` sepenuhnya dan langsung throw karena `'default'` gagal validasi UUID.

**Alur bug lengkap:**

1. `V1CategoryFrame.svelte` (layar pilih kategori & frame) memanggil `cachedFetch('templates:default', () => fetchTemplates('default'), ...)`. Pada percobaan pertama (cache SQLite kosong), `fetchTemplates('default')` throw → tertangkap di `catch (err) { console.log(err); catalogError = '...'; }` — **pakai `console.log`, bukan `console.error`**, makanya tidak mencolok saat Anda scan console untuk "error".
2. Layar menampilkan pesan error dengan tombol **"Gunakan Mode Offline"**. Begitu diklik, `templatesData` diisi daftar **hardcoded palsu** dengan ID string statis: `'strip2'`, `'strip4'`, `'grid4'`, `'grid6'`, `'love4'`, `'wide3'` (lihat baris ~210-220 `V1CategoryFrame.svelte`).
3. User memilih salah satu frame di daftar palsu ini → `frameId` = salah satu ID palsu tsb → diteruskan sebagai `frameConfigId` ke `V1Camera.svelte` → `V1Customize.svelte` → `V1Complete.svelte`.
4. Di `V1Complete.svelte`, `boothId` di-resolve **BENAR** lewat `getActiveBoothId()` (UUID asli dari SQLite) → `fetchTemplates(boothId_asli)` sukses mengembalikan daftar template **asli dari database** (UUID asli).
5. `templates.find((t) => t.id === frameConfigId)` mencoba mencocokkan ID **palsu** (`'grid4'`) dengan UUID **asli** → **selalu gagal** → fallback ke `templates[0]` — template pertama di list, **selalu sama**, tidak peduli frame apa yang dipilih user.

Bug yang sama persis ada di **4 file**: `V1CategoryFrame.svelte`, `V1Camera.svelte`, `V1Customize.svelte`, dan pola serupa (dengan variasi) di `V2Session.svelte`/`V3Session.svelte`.

### 1.2 Perbaikan

**Langkah 1 — Buat helper terpusat untuk resolve boothId**, di `src/lib/api/boothClient.ts` (di dekat `getActiveBoothId`):

```ts
/**
 * Resolve boothId aktif untuk dipakai di layar manapun. Selalu pakai SQLite
 * activation record sebagai source of truth — JANGAN pernah pakai
 * localStorage.getItem('booth_id') (key ini tidak pernah di-set di codebase).
 * Throw eksplisit bila belum ada aktivasi, supaya caller wajib menangani
 * kondisi "booth belum aktivasi" alih-alih diam-diam pakai 'default'.
 */
export async function requireActiveBoothId(): Promise<string> {
  const boothId = await getActiveBoothId();
  if (!boothId || !isValidUUID(boothId)) {
    throw new Error(
      "Booth belum teraktivasi. Silakan aktivasi ulang booth ini.",
    );
  }
  return boothId;
}
```

**Langkah 2 — Ganti semua pola `localStorage.getItem('booth_id') || 'default'`** di 5 file berikut, jadi `await requireActiveBoothId()`:

- `src/lib/components/v1/V1CategoryFrame.svelte` (baris ~100)
- `src/lib/components/v1/V1Camera.svelte` (baris ~58)
- `src/lib/components/v1/V1Customize.svelte` (baris ~42)
- `src/lib/components/v2/V2Session.svelte` (baris ~34)
- `src/lib/components/v3/V3Session.svelte` (baris ~34)

Contoh perubahan di `V1CategoryFrame.svelte`:

```ts
// SEBELUM:
onMount(async () => {
  const boothId = localStorage.getItem('booth_id') || 'default';
  try {
    await cachedFetch(`categories:${boothId}`, () => fetchCategories(boothId), (d) => { categoriesData = d; });
    await cachedFetch(`templates:${boothId}`, () => fetchTemplates(boothId), (d) => { templatesData = d; });
    ...
  } catch (err) {
    console.log(err);
    catalogError = 'Gagal memuat katalog. Periksa koneksi ke server.';
  }
  ...
});

// SESUDAH:
onMount(async () => {
  try {
    const boothId = await requireActiveBoothId();
    await cachedFetch(`categories:${boothId}`, () => fetchCategories(boothId), (d) => { categoriesData = d; });
    await cachedFetch(`templates:${boothId}`, () => fetchTemplates(boothId), (d) => { templatesData = d; });
    ...
  } catch (err) {
    console.error('[V1CategoryFrame] Gagal memuat katalog:', err);
    catalogError = 'Gagal memuat katalog. Periksa koneksi ke server.';
  }
  ...
});
```

Terapkan pola yang sama (pindahkan resolve boothId ke dalam `try`, ganti jadi `requireActiveBoothId()`, ganti `console.log` jadi `console.error`) di keempat file lainnya.

**Langkah 3 — Hapus mekanisme fallback "Mode Offline" dengan ID palsu**, atau minimal ganti ID-nya supaya tidak collide secara semantik. Rekomendasi: hapus tombol "Gunakan Mode Offline" beserta data hardcoded-nya di `V1CategoryFrame.svelte` (baris ~205-230). Fallback offline dengan ID yang tidak pernah cocok dengan data asli **berbahaya secara diam-diam** (silent wrong behavior) — kalau memang dibutuhkan mode demo/offline, buat penanda eksplisit (`isDemoMode` flag) yang **memblokir alur sampai ke pembuatan transaksi & upload**, bukan menyamar sebagai data asli.

**Langkah 4 — Perbaiki juga di `V1Complete.svelte`, `V2Download.svelte`, `V3Download.svelte`**: ganti

```ts
const boothId =
  (await getActiveBoothId()) || localStorage.getItem("booth_id") || "default";
```

menjadi

```ts
const boothId = await requireActiveBoothId();
```

(dibungkus try/catch yang sudah ada di sekitarnya).

### 1.3 Kenapa Ini Juga Relevan untuk V2 & V3 (Catatan Tambahan, Prioritas Menengah)

Anda menyebutkan "seharusnya setiap template berfungsi dasar sama karena perbedaan hanya di tampilan UI" — ini benar secara desain, tapi saat ini **tidak benar secara implementasi**. Selain bug di atas (yang berlaku untuk V1/V2/V3), ditemukan bug **terpisah dan lebih parah** khusus di V2 & V3:

- `src/lib/components/v2/V2Frame.svelte` dan `src/lib/components/v3/V3Frame.svelte` memakai daftar frame **hardcoded statis** (`FRAMES = [{id:'strip-2x4',...}, ...]` / `{id:'frame1',...}`) yang **sama sekali tidak terhubung** ke `fetchTemplates()` — bukan fallback error, memang dari awal begitu desainnya.
- Karena user Anda saat ini pakai V1, ini tidak berdampak ke Anda sekarang, tapi **wajib diperbaiki** sebelum booth manapun diaktifkan dengan `templateVariant: 'v2'` atau `'v3'`, kalau tidak, bug yang sama (frame salah, tidak pernah berganti) akan terjadi 100% dari waktu ke waktu di varian tsb, bukan cuma saat fallback error seperti di V1.
- **Rekomendasi**: refactor `V2Frame.svelte`/`V3Frame.svelte` agar memanggil `fetchCategories`/`fetchTemplates` seperti pola di `V1CategoryFrame.svelte`, mengganti `FRAMES` hardcoded dengan data asli dari API. Ini pekerjaan terpisah (di luar cakupan mendesak dokumen ini) — cukup dicatat sebagai technical debt yang perlu dikerjakan sebelum V2/V3 dipakai di produksi.

### 1.4 Testing Checklist

```text
1. Hapus/kosongkan cache SQLite api_cache (atau uninstall-reinstall app) supaya cache 'templates:default' & 'templates:{uuid}' benar-benar kosong.
2. Buka app, aktivasi booth seperti biasa.
3. Masuk ke layar pilih kategori & frame (V1CategoryFrame) — PASTIKAN tidak muncul layar "Gagal memuat katalog" sama sekali.
4. Pilih frame A, jalankan sesi sampai selesai, screenshot hasil akhir.
5. Ulangi dari awal, kali ini pilih frame B (beda dari langkah 4), jalankan sampai selesai.
6. Bandingkan: hasil akhir langkah 4 dan langkah 6 HARUS pakai frame background & layout yang BERBEDA sesuai pilihan.
7. Cek console — tidak boleh ada log "Booth belum teraktivasi" atau "ID tidak valid" muncul di titik manapun.
```

---

## 2. Bug B — Live View (Klip Video Pra-Capture) Tidak Pernah Tersimpan

### 2.1 Yang Sudah Terverifikasi

- Mode kamera default: `cameraMode: 'usb'` (`boothConfig.svelte.ts`).
- Alur: `V1Camera.svelte` menjalankan `setInterval(150ms)` memanggil `cameraStore.getLiveviewFrame()` → invoke Rust `get_liveview_frame` → gphoto2 `capture_preview()` → **setiap frame yang berhasil didorong ke `AppState.liveview_buffer`** (ring buffer 8000ms, `src-tauri/src/lib.rs`).
- Saat shutter: `runCaptureSequence()` (`capture.ts`) mencatat `captureTs = Date.now()` **sebelum** `cameraStore.capture()` dipanggil, lalu setelah capture foto beres, memanggil `extractLiveviewClip(captureTs, preSecs=1.0, postSecs=1.5)` yang menunggu tambahan `postSecs+150ms`, lalu invoke Rust `get_liveview_clip_frames` untuk mengambil frame dalam window `[captureTs-1000ms, captureTs+1500ms]`, lalu `encode_jpeg_frames_to_video` (FFmpeg sidecar) untuk encode jadi mp4.
- FFmpeg sidecar binary **ada** dan executable di `src-tauri/binaries/ffmpeg-x86_64-unknown-linux-gnu`, terdaftar di `tauri.conf.json` (`externalBin`) dan permission `shell:default`/`shell:allow-execute` sudah ada di `capabilities/default.json`. **Tidak ada indikasi bug di setup FFmpeg**.
- **Bug/celah yang PASTI ada** (code smell terverifikasi, terlepas dari apa akar masalah sebenarnya):
  1. Di `src-tauri/src/gphoto.rs::capture_photo`, viewfinder/preview **kemungkinan besar berhenti otomatis** selama proses `capture_image()` + download file berlangsung (perilaku umum gphoto2 saat capture full-res), dan baru di-`set_viewfinder(camera, true)` lagi di baris **paling akhir** fungsi `capture_photo`. Kalau proses capture+download memakan waktu **lebih dari `postSecs` (1.5 detik)** — sangat mungkin untuk kamera DSLR nyata via USB — maka **seluruh window "post-capture" (captureTs sampai captureTs+1500ms) berada di periode viewfinder mati**, sehingga `LiveviewBuffer` kosong untuk window tersebut.
  2. Di `src/lib/utils/sessionAssets.ts`, kondisi pembuatan video composite bersifat **all-or-nothing**:
     ```ts
     if (
       boothConfig.config.enableLiveviewVideo &&
       validClips.length === boothFlow.photosTaken.length &&
       validClips.length > 0
     )
     ```
     Kalau **satu saja** slot gagal ekstrak klip (`extractLiveviewClip` return `null`), seluruh proses video composite (dan upload-nya) **dilewati diam-diam** untuk SEMUA slot, bukan cuma slot yang gagal.
  3. Kegagalan ekstraksi per-slot di `capture.ts` ditangani dengan `.catch((err) => console.error('Gagal ekstrak liveview clip slot', slotIndex, err))` — **ini sudah benar pakai `console.error`**. Jika Anda benar-benar tidak melihat log ini sama sekali di console, artinya `extractLiveviewClip` tidak throw — ia **resolve dengan nilai `null`** (bukan reject) ketika `frames.length === 0` (lihat `camera.svelte.ts`), sehingga **tidak ada error tercatat** meski hasilnya kosong. Ini menjelaskan kenapa Anda tidak melihat error apapun padahal fitur gagal total.

### 2.2 Perbaikan

**Langkah 1 — Tambahkan logging eksplisit saat ekstraksi menghasilkan array kosong**, di `src/lib/camera.svelte.ts::extractLiveviewClipNonWebcam`:

```ts
private async extractLiveviewClipNonWebcam(
  captureTs: number,
  preSecs: number,
  postSecs: number
): Promise<Blob | null> {
  if (this.cameraMode === 'usb') {
    await new Promise((r) => setTimeout(r, postSecs * 1000 + 150));
    const frames = await invoke<number[][]>('get_liveview_clip_frames', {
      captureTsMs: captureTs,
      preMs: Math.round(preSecs * 1000),
      postMs: Math.round(postSecs * 1000),
    });
    // TAMBAHAN: log eksplisit, bukan silent null
    console.log(`[liveview] extract window capture=${captureTs} pre=${preSecs}s post=${postSecs}s -> ${frames?.length ?? 0} frame(s)`);
    if (!frames || !frames.length) {
      console.warn('[liveview] Buffer kosong untuk window ini — kemungkinan viewfinder mati selama capture_photo() berlangsung.');
      return null;
    }
    const encoded = await invoke<number[]>('encode_jpeg_frames_to_video', { frames, fps: 8 });
    return new Blob([new Uint8Array(encoded)], { type: 'video/mp4' });
  }
  ...
}
```

**Langkah 2 — Tambahkan logging di Rust untuk melihat isi buffer real-time**, di `src-tauri/src/lib.rs::get_liveview_clip_frames`:

```rust
#[tauri::command]
async fn get_liveview_clip_frames(
    state: State<'_, AppState>,
    capture_ts_ms: u64,
    pre_ms: u64,
    post_ms: u64,
) -> Result<Vec<Vec<u8>>, GphotoError> {
    let buf = state.liveview_buffer.lock().await;
    let total_in_buffer = buf.frames.len();
    let result = buf.extract_window(capture_ts_ms as u128, pre_ms as u128, post_ms as u128);
    tracing::info!(
        "get_liveview_clip_frames: total_buffer={} matched_window={} capture_ts={} range=[{}, {}]",
        total_in_buffer,
        result.len(),
        capture_ts_ms,
        (capture_ts_ms as u128).saturating_sub(pre_ms as u128),
        capture_ts_ms as u128 + post_ms as u128
    );
    Ok(result)
}
```

Kalau setelah ini `total_buffer=0` di log terminal → berarti `get_liveview_frame` sama sekali tidak pernah berhasil push ke buffer (masalah di sisi kamera/gphoto2, cek koneksi USB / driver). Kalau `total_buffer>0` tapi `matched_window=0` → mengonfirmasi teori §2.1 poin 1 (viewfinder mati saat window post-capture).

**Langkah 3 — Perbesar `postSecs` default & buffer retention sebagai mitigasi**, di `src/lib/stores/boothConfig.svelte.ts`:

```ts
// SEBELUM:
liveviewClipPostSecs: 1.5,

// SESUDAH: beri jeda lebih untuk mengakomodasi durasi capture_photo() yang nyata di DSLR (idealnya diukur dulu dari log Langkah 2, ini nilai awal yang aman)
liveviewClipPostSecs: 2.5,
```

dan di `src-tauri/src/lib.rs`:

```rust
// SEBELUM:
liveview_buffer: Mutex::new(gphoto::LiveviewBuffer::new(8000)),

// SESUDAH:
liveview_buffer: Mutex::new(gphoto::LiveviewBuffer::new(12000)),
```

**Langkah 4 — Re-enable viewfinder SESEGERA MUNGKIN setelah file di-download**, bukan di baris paling akhir, di `src-tauri/src/gphoto.rs::capture_photo` — pastikan urutannya begini (pindahkan `set_viewfinder(camera, true)` ke tepat setelah `download()`, sebelum proses simpan file lokal yang tidak butuh viewfinder mati):

```rust
pub async fn capture_photo(camera: &Camera, save_dir: &std::path::Path) -> Result<Vec<u8>, GphotoError> {
    trigger_popup_flash(camera).await;

    let file_path = camera.capture_image().wait().map_err(|e| GphotoError::Operation(e.to_string()))?;
    let camera_file = camera.fs().download(&file_path.folder(), &file_path.name()).wait()
        .map_err(|e| GphotoError::Operation(e.to_string()))?;

    // PINDAHKAN KE SINI: re-enable viewfinder sesegera mungkin setelah download selesai,
    // supaya ring buffer liveview kembali terisi lebih cepat untuk window "post-capture".
    let _ = set_viewfinder(camera, true).await;

    let data = camera_file.get_data(camera).wait().map_err(|e| GphotoError::Operation(e.to_string()))?;
    let bytes = data.to_vec();

    let _ = std::fs::create_dir_all(save_dir);
    let local_path: PathBuf = save_dir.join(file_path.name().as_ref());
    let _ = std::fs::write(&local_path, &bytes);

    Ok(bytes)
}
```

**Langkah 5 — Ubah kondisi all-or-nothing jadi per-slot (partial tolerant)**, di `src/lib/utils/sessionAssets.ts`:

```ts
// SEBELUM:
if (
  boothConfig.config.enableLiveviewVideo &&
  validClips.length === boothFlow.photosTaken.length &&
  validClips.length > 0
) { ... }

// SESUDAH: tetap proses composite video walau sebagian slot tidak punya klip —
// slot yang null akan diisi warna solid/foto still oleh compose_template_video
// (lihat catatan implementasi tambahan di bawah), bukan membatalkan seluruh proses.
if (boothConfig.config.enableLiveviewVideo && boothFlow.liveviewClips.some((c) => !!c)) {
  console.log(`[liveview] Membuat video composite dengan ${validClips.length}/${boothFlow.photosTaken.length} klip valid.`);
  tasks.push(
    (async () => {
      // ... (isi sama, tapi build clipBytes dari boothFlow.liveviewClips ASLI termasuk null,
      // dan sesuaikan compose_template_video di Rust agar bisa menerima null → fallback ke foto still slot tsb)
    })().catch((e) => console.error('Gagal buat/upload video liveview:', e))
  );
} else {
  console.warn('[liveview] Tidak ada satupun klip liveview valid — video composite dilewati.');
}
```

> **Catatan implementasi**: mengubah `compose_template_video` (Rust) agar bisa menerima klip `null` per slot (fallback ke JPEG foto still) adalah pekerjaan tambahan yang lebih besar (perlu ubah signature `clips: Vec<Vec<u8>>` jadi `Vec<Option<Vec<u8>>>` dan logic FFmpeg filter_complex-nya). Kalau ingin scope minimal dulu, cukup terapkan Langkah 1-4 (logging + fix timing) lebih dulu, jalankan sesi uji, lihat log — kemungkinan besar setelah Langkah 3 & 4, `validClips.length` akan sama dengan jumlah foto di sebagian besar kasus sehingga Langkah 5 tidak lagi mendesak.

### 2.3 Testing Checklist

```text
1. Terapkan Langkah 1-4 (logging + perbesar buffer/postSecs + re-enable viewfinder lebih awal).
2. Jalankan 1 sesi foto lengkap dengan kamera USB asli tersambung.
3. Cek terminal (log Rust `tracing::info!`) — catat nilai total_buffer & matched_window untuk tiap slot.
4. Cek console browser (log `[liveview] extract window ...`) — catat jumlah frame per slot.
5. Cek folder lokal sessions/<tanggal>/<sessionCode>_<boothName>/video/ — apakah sekarang muncul slot_01.mp4, dst?
6. Kalau masih 0 frame di semua slot meski total_buffer > 0 → kemungkinan preSecs/postSecs masih terlalu sempit relatif durasi asli capture_photo() Anda; ukur durasi nyata capture_photo() (tambahkan timing log sederhana di sekitar pemanggilannya) dan sesuaikan liveviewClipPreSecs/PostSecs mengikuti angka nyata tsb.
```

---

## 3. Bug A — Hasil Sesi Tidak Ter-upload ke R2

### 3.1 Yang Sudah Terverifikasi

- Alur upload (`V1Complete.svelte` → `saveSessionAssets()` → `uploadGalleryAsset()` → `requestUploadUrl()` (POST `/gallery/upload-url`) → PUT langsung ke R2 → `uploadSessionMedia()` (POST `/gallery/upload`)) **secara struktur kode sudah benar** dan `boothId` yang dipakai di titik ini **resolve dengan benar** lewat `getActiveBoothId()` (tidak kena bug §1).
- Setiap task upload individual (foto mentah tiap slot, foto composite, GIF, video) dibungkus `.catch((e) => console.error(...))`, jadi **seharusnya** kegagalan jaringan/API akan tercatat di console. Karena Anda melaporkan **tidak ada error sama sekali**, ada 2 kemungkinan yang sama-sama perlu diperiksa: (a) upload benar-benar tidak pernah ter-trigger (mis. `boothFlow.photosTaken` kosong saat `saveSessionAssets` dipanggil, atau exception terjadi SEBELUM baris upload dan tertangkap oleh try/catch di level lebih atas), atau (b) upload "berhasil" secara response HTTP tapi gagal ditangani dengan benar karena ada 2 celah penanganan error yang kurang informatif (lihat di bawah).
- **Celah kode terverifikasi** di `src/lib/api/boothClient.ts::uploadSessionMedia`:
  ```ts
  if (!res.ok) {
    console.error("Failed to upload session media"); // <- tidak ada status code / response body
  }
  return res.json(); // <- kalau res.ok false & body bukan JSON valid, ini bisa throw generic parse error
  ```
  Pesan error ini **tidak menyertakan status code maupun body response**, sehingga meskipun request gagal (mis. 400/404/500 dari API), Anda tidak akan tahu APA yang salah dari log-nya saja. Kalau body responsenya bukan JSON valid (mis. HTML error page dari proxy/nginx), baris `return res.json()` bisa melempar `SyntaxError` yang generic dan membingungkan.

### 3.2 Perbaikan

**Langkah 1 — Perbaiki error handling `uploadSessionMedia`** di `src/lib/api/boothClient.ts`, sertakan status & body:

```ts
export async function uploadSessionMedia(
  boothId: string,
  sessionId: string,
  fileUrl: string,
  fileType: GalleryFileType | "animation" = "photo",
  width: number = 1200,
  height: number = 1800,
  fileSize: number = 0,
) {
  const res = await fetch(`${API_BASE}/booths/${boothId}/gallery/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      file_url: fileUrl,
      file_type: fileType,
      width,
      height,
      file_size: fileSize,
    }),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    console.error(
      `[uploadSessionMedia] Gagal daftar metadata (status ${res.status}) untuk session=${sessionId} type=${fileType}:`,
      bodyText,
    );
    throw new Error(
      `Gagal register metadata media (status ${res.status}): ${bodyText}`,
    );
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    console.error("[uploadSessionMedia] Response bukan JSON valid:", bodyText);
    throw new Error("Response register metadata media tidak valid");
  }
}
```

> Catatan: sebelumnya fungsi ini **tidak throw** saat gagal (`console.error` lalu tetap `return res.json()`), sehingga kegagalan di titik ini **tidak pernah tertangkap** oleh `.catch()` pemanggilnya di `uploadGalleryAsset`/`saveSessionAssets` — errornya "tenggelam". Dengan `throw` di atas, error ini sekarang akan konsisten muncul di `console.error` lewat rantai `.catch()` yang sudah ada.

**Langkah 2 — Tambahkan logging eksplisit di titik masuk `saveSessionAssets`** untuk memastikan fungsi ini benar-benar dipanggil dengan data yang benar, di `src/lib/utils/sessionAssets.ts`:

```ts
export async function saveSessionAssets(
  boothId: string,
  sessionId: string,
  compositeUrl: string | null,
  templateWidth: number,
  templateHeight: number,
  slotRects: SlotRect[],
  backgroundUrl?: string | null
) {
  console.log('[saveSessionAssets] mulai', {
    boothId,
    sessionId,
    hasComposite: !!compositeUrl,
    photosTakenCount: boothFlow.photosTaken.length,
    liveviewClipsCount: boothFlow.liveviewClips.filter(Boolean).length,
  });
  const tasks: Promise<unknown>[] = [];
  ...
```

**Langkah 3 — Tambahkan logging status di setiap tahap `uploadGalleryAsset`**, di `src/lib/api/boothClient.ts`:

```ts
export async function uploadGalleryAsset(
  boothId: string,
  sessionId: string,
  fileType: GalleryFileType,
  blobOrDataUrl: Blob | string,
  fileExtension: string,
  contentType: string,
  width: number,
  height: number,
) {
  const blob =
    typeof blobOrDataUrl === "string"
      ? await (await fetch(blobOrDataUrl)).blob()
      : blobOrDataUrl;
  console.log(
    `[uploadGalleryAsset] ${fileType} size=${blob.size} bytes, session=${sessionId}`,
  );

  const { upload_url, file_url } = await requestUploadUrl(
    boothId,
    sessionId,
    fileType,
    fileExtension,
    contentType,
  );
  console.log(
    `[uploadGalleryAsset] presigned URL diterima untuk ${fileType}: ${file_url}`,
  );

  const putRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!putRes.ok) {
    const errBody = await putRes.text().catch(() => "");
    console.error(
      `[uploadGalleryAsset] PUT ke R2 gagal (status ${putRes.status}) untuk ${fileType}:`,
      errBody,
    );
    throw new Error(
      `Gagal PUT ${fileType} ke R2 (status ${putRes.status}): ${errBody}`,
    );
  }
  console.log(`[uploadGalleryAsset] PUT ke R2 sukses untuk ${fileType}`);

  return uploadSessionMedia(
    boothId,
    sessionId,
    file_url,
    fileType,
    width,
    height,
    blob.size,
  );
}
```

### 3.3 Testing Checklist

```text
1. Terapkan Langkah 1-3 di atas.
2. Buka DevTools (klik kanan → Inspect di window Tauri, atau devtools shortcut).
3. Tab Console: bersihkan log lama, jalankan 1 sesi foto lengkap sampai ke layar hasil/QR.
4. Baca urutan log [saveSessionAssets] → [uploadGalleryAsset] untuk TIAP jenis aset (photo x-jumlah-slot, composite, gif, video).
   - Kalau log [saveSessionAssets] TIDAK MUNCUL SAMA SEKALI → berarti pemanggilannya tidak pernah tereksekusi; cek try/catch di V1Complete.svelte, kemungkinan createTransactionSession() gagal duluan (cek log "Failed to create & save session in database").
   - Kalau log muncul tapi berhenti di satu titik tanpa lanjut → catat pesan error persisnya (sekarang harusnya sudah detail dengan status code & body).
5. Tab Network: filter kata "gallery" — pastikan ada request ke `/gallery/upload-url` (harus 200), lalu PUT ke domain R2 (harus 200/204), lalu POST ke `/gallery/upload` (harus 201).
6. Kalau semua request di Network tab menunjukkan status sukses (2xx) tapi file tetap tidak muncul di admin dashboard/softfile page → kemungkinan besar bukan bug di dekstop-app, melainkan di sisi tampilan/API pembacaan galeri — lanjutkan investigasi dari dokumen API terpisah dengan bukti Network tab ini sebagai lampiran.
```
