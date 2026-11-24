# Dokumentasi Integrasi Multi-Brand Camera Bridge (Windows)

Dokumen ini menjelaskan arsitektur, teknis komunikasi, penanganan anti-sleep, pemrosesan frame MJPEG, serta alur fallback integrasi kamera multi-brand (**Canon, Sony, Nikon, dan generic PTP**) pada aplikasi desktop PotoHub (`dekstop-app`).

---

## 1. Latar Belakang & Masalah Driver Windows

Secara default di sistem operasi Windows:
1. Windows mengikat kamera digital ke driver bawaan **WPD (Windows Portable Devices)** atau antarmuka **WIA (Windows Image Acquisition)**.
2. Penggunaan `libgphoto2` murni di Windows membutuhkan instalasi manual driver **WinUSB** (misalnya via Zadig). Hal ini memiliki kelemahan operasional besar:
   - Terikat pada VID/PID port USB kamera secara spesifik.
   - Pengguna non-teknis kesulitan mengonfigurasi driver.
   - Kamera tidak lagi terbaca oleh aplikasi bawaan Windows / software resmi vendor.
3. Untuk mengatasi batasan tersebut dan memberikan reliabilitas selevel aplikasi komersial, PotoHub mengadopsi arsitektur **Camera Bridge Subprocess** yang mengisolasi driver native masing-masing vendor ke dalam proses pendamping (*helper executable*).

---

## 2. Peta Arsitektur & Hirarki Backend

Semua antarmuka kamera diakses melalui Rust backend Tauri di [`src-tauri/src/lib.rs`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src-tauri/src/lib.rs) dengan hirarki prioritas sebagai berikut:

```
                          [Tauri Commands]
             (detect_camera, connect_camera, get_liveview_frame,
                     capture_photo, start/stop_liveview)
                                    |
            +-----------------------+-----------------------+
            |                                               |
[Canon EDSDK (Native)]                    [Camera Bridge (Multi-Brand)]
(canon_edsdk.rs - STA thread)                  (camera_bridge.rs)
            |                                               |
     Kamera Canon?                                  Kamera Sony/Nikon?
   YA -> EDSDK.dll                                          |
  TIDAK ----------------------------------------------------+
                                                            |
                 +------------------------------------------+------------------------------------------+
                 |                                                                                     |
           [Brand: Sony]                                                                        [Brand: Nikon]
                 |                                                                                     |
   +-------------+-------------+                                                         +-------------+-------------+
   |             |             |                                                         |             |             |
(1) CRSDK    (2) libusb    (3) WPD / WIA                                           (1) MAID3/WIA   (2) D5200     (3) D5300
sony_stream   sony_usb     sony_wpd / ptp_stream                                   nikon_stream   nikon_stream  nikon_stream
(PC Remote)   (WinUSB)     (MTP / WIA ID)                                          (MAID3 .md3)      _d5200        _d5300
```

### A. Canon: EDSDK Native (`canon_edsdk.rs`)
- Berjalan langsung di proses Rust pada **Dedicated STA Thread** (`CoInitializeEx` + Windows message pump `PeekMessageW` + `EdsGetEvent`).
- Berkomunikasi langsung via dynamic library `EDSDK.dll` & `EdsImage.dll`.
- Mempertahankan kontrol eksposur manual, perpanjangan shutdown timer, dan penanganan event shutdown otomatis.

### B. Sony: Prioritas Multi-Backend
1. **`sony_stream.exe` (Primary — CRSDK Native):**
   - Menggunakan Sony Camera Remote SDK resmi (`Cr_Core.dll`, `monitor_protocol.dll`, `CrAdapter/*`).
   - Kamera diset ke mode **USB Connection: PC Remote**.
2. **`sony_usb.exe` (Fallback Direct PTP-over-USB):**
   - Menggunakan `libusb-1.0.dll` untuk komunikasi raw bulk transfer.
   - Diprioritaskan jika perangkat terdeteksi telah menggunakan driver WinUSB.
3. **`sony_wpd.exe` (Fallback MTP/Auto):**
   - Membaca kamera melalui Windows Portable Devices API tanpa perlu mengganti driver USB.
4. **`ptp_stream.exe` (Fallback Generic WIA PTP):**
   - Menggunakan WIA COM Device Manager untuk kamera PTP standar.

### C. Nikon: PTP & MAID3 Native
1. **`nikon_stream.exe`**: Bridge umum yang mendukung protokol WIA dan MAID3 Module (`Type0009.md3`, `Type0011.md3`, `Type0016.md3`, `Type0024.md3`).
2. **`nikon_stream_d5200.exe` / `nikon_stream_d5300.exe`**: Bridge khusus yang otomatis dipilih jika model kamera yang terdeteksi cocok dengan seri D5200/D5300.

---

## 3. Protokol Komunikasi Subprocess (IPC)

Helper executable berkomunikasi dengan backend Rust melalui standar input/output (Standard I/O Streams):

| Aliran | Format | Fungsi |
| :--- | :--- | :--- |
| **`stdin` (Ke Helper)** | Text Line (`\n`) | Mengirim perintah: `CAPTURE\n`, `SET_PROP <key>=<val>\n`, `QUIT\n` |
| **`stdout` (Dari Helper)** | Raw Binary Stream | Aliran frame JPEG MJPEG liveview (`0xFF 0xD8` ... `0xFF 0xD9`) |
| **`stderr` (Dari Helper)** | Text Line (`\n`) | Log status, event deteksi, dan pengumuman file: `PHOTO_PATH:<path>` |

### Format Output Pengambilan Foto
Ketika perintah `CAPTURE\n` dikirim ke `stdin`:
1. Helper memicu shutter fisik kamera.
2. Helper mengunduh foto resolusi tinggi ke direktori lokal sementara:
   - Sony & PTP: `C:\ProgramData\Boothlab\Temp\`
   - Nikon: `%USERPROFILE%\Documents\Boothlab\Photos\Original\`
3. Helper mencetak path file ke `stderr`:
   ```text
   PHOTO_PATH:C:\ProgramData\Boothlab\Temp\sony_20261124_093012_001.jpg
   ```
4. Backend Rust membaca file tersebut ke memori (`Vec<u8>`), mengembalikannya ke frontend via IPC Tauri, dan menghapus cache sementara jika diperlukan.
5. **Fallback:** Jika dalam 22 detik file tidak muncul (timeout), backend otomatis menggunakan frame liveview terakhir sebagai cadangan agar sesi foto pelanggan tidak terhenti.

---

## 4. Parser MJPEG Robust (`find_jpeg_frame_end`)

Pada implementasi naif, pencarian frame JPEG sering dilakukan dengan mencari marker akhir `0xFF 0xD9` pertama setelah `0xFF 0xD8`. Namun, beberapa kamera digital modern menyertakan thumbnail EXIF di dalam segmen `APP1` yang juga memiliki sekuens `0xFF 0xD8 ... 0xFF 0xD9`, sehingga frame liveview berisiko terpotong.

Modul [`src-tauri/src/camera_bridge.rs`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src-tauri/src/camera_bridge.rs) mengimplementasikan parser state-machine:
- Melewati segmen metadata berpanjang eksplisit (`APPn`, `DQT`, `DHT`, `SOFn`).
- Membaca panjang 2-byte big-endian dari setiap segmen header.
- Hanya mencari marker `EOI` (`0xFF 0xD9`) setelah segmen `SOS` (*Start of Scan*, `0xFF 0xDA`) dimasuki.
- Mendukung *byte stuffing* entropy (`0xFF 0x00`) dan restart markers (`0xD0`–`0xD7`).

---

## 5. Mekanisme Anti-Sleep & Pemeliharaan Koneksi

Untuk mencegah kamera masuk ke mode tidur (*auto power-off / sleep*) selama sesi atau saat idle:

1. **Windows Power Execution State:**
   Saat koneksi kamera aktif, backend Rust memanggil Windows API:
   ```rust
   SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
   ```
   Mencegah OS Windows mematikan daya bus USB atau melakukan suspend layar.

2. **Perpanjangan Shutdown Timer Kamera:**
   - **Canon:** STA thread mengirimkan `kEdsCameraCommand_ExtendShutDownTimer` secara berkala (tiap 45 detik) atau saat menerima event `0x303` (*WillSoonShutDown*).
   - **Sony/Nikon:** Helper subprocess menjaga sesi PTP tetap aktif dengan polling liveview berkesinambungan.

3. **Background Watchdog (10s Interval, 20s Stall Threshold):**
   - Thread watchdog memantau apakah subprocess helper berhenti tiba-tiba atau frame liveview tidak bertambah selama >20 detik.
   - Jika terdeteksi stall atau crash, watchdog otomatis melakukan terminasi bersih (`QUIT` -> timeout 3s -> `kill()`) dan me-restart subprocess helper.
   - **Capture Guard:** Selama proses `capture_photo()` berjalan (`CAPTURE_IN_PROGRESS = true`), watchdog otomatis dinonaktifkan sementara karena beberapa firmware kamera menghentikan liveview saat mentransfer file RAW/JPEG hi-res via USB.

4. **Isolasi Ring Buffer Live Photo:**
   - Frame liveview hanya didorong ke `LiveviewBuffer` (ring buffer live photo / GIF) jika `LIVEVIEW_ACTIVE == true` dan `PREPARE_CAPTURE_FLAG == false`.
   - Hal ini memastikan frame dari halaman scan tiket atau saat kamera idle tidak mencemari klip video live photo.

---

## 6. Sinkronisasi Mutex Rust (Bebas Deadlock)

Pada Rust Edition 2021, sintaks `match *state.active_backend.lock().await` menahan `MutexGuard` hingga akhir blok `match`. Untuk menghindari deadlock saat cabang `None` mencoba mengupdate state:

```rust
// Pola yang benar (digunakan di lib.rs):
let backend = *state.active_backend.lock().await; // Guard langsung di-drop di sini
match backend {
    ActiveWindowsBackend::CanonEdsdk => { ... }
    ActiveWindowsBackend::CameraBridge => { ... }
    ActiveWindowsBackend::None => {
        // Aman memanggil lock().await kembali untuk memperbarui backend
        *state.active_backend.lock().await = ActiveWindowsBackend::CameraBridge;
    }
}
```

---

## 7. Lokasi File & Asset Terkait

- **Rust Backend:**
  - [`src-tauri/src/camera_bridge.rs`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src-tauri/src/camera_bridge.rs): Implementasi subprocess bridge, deteksi WIA/PnP, parsing MJPEG, dan watchdog.
  - [`src-tauri/src/canon_edsdk.rs`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src-tauri/src/canon_edsdk.rs): Driver native Canon EDSDK (Dedicated STA thread).
  - [`src-tauri/src/lib.rs`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src-tauri/src/lib.rs): Router command Tauri (`AppState.active_backend`).
- **Binary & SDK Helpers:**
  - `src-tauri/tools/`: Berisi seluruh helper executable (`sony_stream.exe`, `sony_usb.exe`, `sony_wpd.exe`, `nikon_stream*.exe`, `ptp_stream.exe`), modul Nikon MAID3 (`Type*.md3`), serta runtime Sony CRSDK (`Cr_Core.dll`, `CrAdapter/*`).
- **Frontend Svelte:**
  - [`src/lib/camera.svelte.ts`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/camera.svelte.ts): State store kamera, polling frame liveview via raw binary Tauri IPC (`tauri::ipc::Response`).
  - [`src/lib/components/shared/QrTicketScanner.svelte`](file:///home/dwiwahyu/Projects/PotoHub/source-code/dekstop-app/src/lib/components/shared/QrTicketScanner.svelte): Komponen pemindai tiket QR agnostik untuk semua brand kamera.
