# Plan Implementasi: Fitur Toggle Hasil Sesi Foto (Strip, GIF, Live View)

Dokumen ini menjelaskan rencana implementasi fitur toggle untuk menampilkan 3 (tiga) hasil setiap sesi foto: **Strip**, **GIF**, dan **Live View** pada layar akhir setiap varian UI:
- `src/lib/components/v1/V1Complete.svelte`
- `src/lib/components/v2/V2Download.svelte`
- `src/lib/components/v3/V3Download.svelte`

---

## 1. Analisis Arsitektur & Fungsi Shared ("Cek Fungsi Shared")

### 1.1 State Management (`src/lib/stores/booth.svelte.ts`)
Saat ini `boothFlow` menyimpan data mentah:
- `photosTaken: string[]`: blob/data URL foto tiap slot jepretan.
- `liveviewClips: (string | null)[]`: video clip blob URL per slot (direkam selama countdown/capture).

**Temuan & Kebutuhan:**
- Tidak ada state reaktif untuk menyimpan URL aset final hasil generate sesi: `compositeStripUrl`, `sessionGifUrl`, dan `sessionVideoUrl`.
- Tidak ada penanda loading (`isGeneratingGif`, `isGeneratingVideo`) untuk memberi feedback jika user langsung mengklik tombol sebelum pemrosesan selesai.
- **Rencana:** Tambahkan field-field ini ke `boothFlow` dan lakukan cleanup / revoke object URL pada `boothFlow.reset()`.

### 1.2 Alur Pemrosesan Aset (`src/lib/utils/sessionAssets.ts`)
Fungsi `saveSessionAssets` saat ini memiliki alur:
1. Upload strip foto ke Cloudflare R2 (blocking network HTTP).
2. Loop upload foto mentah satu per satu ke R2 (blocking network HTTP).
3. Generate GIF via `buildSessionGif` lalu upload ke R2.
4. Generate Composite Video via `compose_template_video` (FFmpeg) lalu upload ke R2.
5. Simpan lokal via `saveLocalSessionAssets`.

**Temuan Kritis:**
- Karena generate GIF & Video ditaruh setelah step upload foto ke cloud, bila koneksi lambat atau offline, pembuatan GIF dan Video tertunda beberapa detik (atau gagal).
- Padahal `buildSessionGif` dan `compose_template_video` sepenuhnya berjalan **lokal di mesin** (Rust encoder & FFmpeg sidecar) tanpa perlu menunggu upload cloud.
- **Rencana Optimasi:**
  - Segera setelah foto mentah diproses orientasinya, picu pembuatan GIF dan Video secara lokal dan langsung pasang Object URL-nya ke `boothFlow.sessionGifUrl` dan `boothFlow.sessionVideoUrl`.
  - Proses upload ke R2 tetap berjalan di latar belakang tanpa menghalangi preview interaktif di layar kiosk.
  - Tambahkan fallback ketahanan: Jika jumlah klip tidak lengkap (misal 1 slot gagal rekam clip), pad dengan clip valid pertama agar `compose_template_video` tetap berhasil menyusun video template.

### 1.3 Pembuatan Strip (`src/lib/utils/templateComposite.ts`)
- `compositeTemplateImage()` menghasilkan data URL JPEG strip foto template secara instan di browser canvas.
- Ini sudah langsung tersedia saat komponen layar unduh di-mount.

### 1.4 Pembuatan GIF (`src/lib/utils/gif.ts`)
- `buildSessionGif(photoUrls, frameDelayMs, mirrorHorizontal)`:
  - Me-resize tiap frame foto ke canvas proporsional.
  - Memanggil command Rust Tauri `encode_photos_to_gif`.
  - Menghasilkan `Blob` bertipe `image/gif`.

### 1.5 Pembuatan Live View Composite Video (`src-tauri/src/media.rs`)
- Command Rust `compose_template_video`:
  - Menggabungkan klip live view dari tiap slot ke koordinat slot template.
  - Menambahkan overlay frame template, QR code, dan stiker.
  - Menghasilkan MP4 video (`video/mp4`).

---

## 2. Desain Tampilan per Versi

Tombol toggle ditempatkan tepat **di bawah card preview strip saat ini**, mempertahankan identitas visual masing-masing varian:

### 2.1 Versi 1 (`V1Complete.svelte`) — Modern Dark Tech
- **Tema:** Dark monochrome, sleek tech, border halus, Poppins font.
- **Card Preview:** `bg-[#1a1a1a] border-[3px] border-[#e8e8e8] rounded-[24px] w-[260px] shadow-[0_24px_64px_rgba(0,0,0,0.7)]`.
- **Toggle Bar:** Floating pill `bg-white/10 backdrop-blur-md rounded-full border border-white/10 p-1 flex gap-1.5 mt-4`.
- **Button Styling:**
  - *Aktif:* `bg-white text-black font-semibold shadow-md rounded-full px-3.5 py-1.5 text-xs flex items-center gap-1.5`.
  - *Non-aktif:* `text-white/70 hover:text-white hover:bg-white/10 font-medium rounded-full px-3.5 py-1.5 text-xs flex items-center gap-1.5`.
- **Icon:** `Image`, `Film`, `Video` dari `@lucide/svelte`.

### 2.2 Versi 2 (`V2Download.svelte`) — Neo-Brutalist Retro Editorial
- **Tema:** Neo-brutalist, border 2-3px hitam tegas, hard drop shadow `shadow-[3px_3px_0_0_rgba(0,0,0,1)]`, warna mint `#C7EED8`, Nunito & Playfair font.
- **Card Preview:** `bg-white border-[3px] border-black rounded-[24px] w-[240px] shadow-[10px_10px_0_0_rgba(0,0,0,1)] p-3`.
- **Toggle Bar:** Kontainer brutalist `mt-4 flex items-center gap-1.5 font-['Nunito',sans-serif]`.
- **Button Styling:**
  - *Aktif:* `bg-[#C7EED8] text-black border-2 border-black font-black shadow-[3px_3px_0_0_rgba(0,0,0,1)] rounded-full px-3 py-1 text-xs uppercase tracking-wider flex items-center gap-1`.
  - *Non-aktif:* `bg-white text-black/60 border-2 border-black/40 hover:border-black hover:text-black font-bold rounded-full px-3 py-1 text-xs uppercase tracking-wider flex items-center gap-1`.
- **Icon:** `Image`, `Film`, `Video` dengan `strokeWidth={2.5}`.

### 2.3 Versi 3 (`V3Download.svelte`) — Vintage Dark Film / Camera Green
- **Tema:** Green retro booth `#0E8E5E`, sprocket film holes, confetti dots, amber gold accent `#FFC107`, monospace font.
- **Card Preview:** `bg-white p-3 shadow-2xl rounded-2xl border border-gray-100 w-[210px]`.
- **Toggle Bar:** Dark glass pill `mt-2 flex items-center gap-1.5 p-1 bg-black/30 backdrop-blur-md rounded-full border border-white/20 shadow-md font-mono text-[10px] uppercase tracking-wider`.
- **Button Styling:**
  - *Aktif:* `bg-[#FFC107] text-black font-bold shadow-sm rounded-full px-3 py-1 flex items-center gap-1.5`.
  - *Non-aktif:* `text-white/70 hover:text-white hover:bg-white/10 font-bold rounded-full px-3 py-1 flex items-center gap-1.5`.
- **Icon:** `Image`, `Film`, `Video` ukuran 12px.

---

## 3. Komponen Render Konten di Tempat Preview Strip

Di dalam card preview, elemen yang ditampilkan disesuaikan dengan tab aktif (`activePreviewTab: 'strip' | 'gif' | 'liveview'`):

1. **Tab `strip`:**
   - Menampilkan `<img>` dengan `src={compositeUrl}`.
   - Fallback: Animasi pulse "Memproses Strip...".
2. **Tab `gif`:**
   - Jika `boothFlow.sessionGifUrl` siap: Menampilkan `<img>` dengan `src={boothFlow.sessionGifUrl}` (animasi loop otomatis).
   - Jika `boothFlow.isGeneratingGif` aktif: Spinner "Memproses GIF...".
   - Jika tidak tersedia: Fallback icon & teks "GIF tidak tersedia".
3. **Tab `liveview`:**
   - Jika `boothFlow.sessionVideoUrl` siap: Menampilkan `<video src={boothFlow.sessionVideoUrl} autoplay loop muted playsinline class="w-full h-auto max-h-[...] object-contain rounded-xl block shadow-md" />`.
   - Jika `boothFlow.isGeneratingVideo` aktif: Spinner "Memproses Live View...".
   - Jika tidak tersedia: Fallback icon & teks "Live View tidak tersedia".

---

## 4. Langkah Eksekusi

1. **Update `src/lib/stores/booth.svelte.ts`**:
   - Tambah property: `compositeStripUrl`, `sessionGifUrl`, `sessionVideoUrl`, `isGeneratingGif`, `isGeneratingVideo`.
   - Update method `reset()` untuk revoke object URL dan reset state.
2. **Optimasi `src/lib/utils/sessionAssets.ts`**:
   - Percepat pembuatan GIF & Video secara lokal tepat setelah orientasi foto selesai.
   - Simpan object URL ke `boothFlow.sessionGifUrl` dan `boothFlow.sessionVideoUrl`.
   - Set flag `isGeneratingGif` dan `isGeneratingVideo`.
   - Fallback toleran bila ada slot liveview clip yang kosong.
3. **Implementasi UI di `src/lib/components/v1/V1Complete.svelte`**:
   - State `activePreviewTab = $state<'strip' | 'gif' | 'liveview'>('strip')`.
   - Conditional rendering Strip / GIF / Live View di card.
   - Tombol toggle di bawah card sesuai gaya V1.
4. **Implementasi UI di `src/lib/components/v2/V2Download.svelte`**:
   - State `activePreviewTab = $state<'strip' | 'gif' | 'liveview'>('strip')`.
   - Conditional rendering Strip / GIF / Live View di card.
   - Tombol toggle di bawah card sesuai gaya V2.
5. **Implementasi UI di `src/lib/components/v3/V3Download.svelte`**:
   - State `activePreviewTab = $state<'strip' | 'gif' | 'liveview'>('strip')`.
   - Conditional rendering Strip / GIF / Live View di card.
   - Tombol toggle di bawah card sesuai gaya V3.
6. **Verifikasi & Typecheck**:
   - Jalankan `pnpm check` (`svelte-check`) untuk memastikan tidak ada kesalahan tipe atau sintaks.
