#![allow(dead_code)]

use crate::gphoto::{DetectedCamera, LiveviewBuffer};
use std::sync::{Arc, Mutex as StdMutex};

#[cfg(not(target_os = "windows"))]
pub mod platform {
    use super::*;

    pub fn init_liveview_buffer(_buf: Arc<StdMutex<LiveviewBuffer>>) {}

    pub fn is_available() -> bool {
        false
    }

    pub fn set_capture_preparing(_preparing: bool) {}

    pub async fn detect_cameras() -> Result<Vec<DetectedCamera>, String> {
        Ok(Vec::new())
    }

    pub async fn connect(_preferred_port: Option<String>) -> Result<(String, String, String), String> {
        Err("Multi-brand camera bridge hanya tersedia pada platform Windows.".into())
    }

    pub async fn disconnect() -> Result<(), String> {
        Ok(())
    }

    pub async fn is_connected() -> bool {
        false
    }

    pub async fn start_liveview() -> Result<(), String> {
        Err("Multi-brand camera bridge hanya tersedia pada platform Windows.".into())
    }

    pub async fn stop_liveview() -> Result<(), String> {
        Ok(())
    }

    pub async fn get_liveview_frame() -> Result<Vec<u8>, String> {
        Err("Multi-brand camera bridge hanya tersedia pada platform Windows.".into())
    }

    pub async fn capture_photo() -> Result<Vec<u8>, String> {
        Err("Multi-brand camera bridge hanya tersedia pada platform Windows.".into())
    }

    pub async fn set_setting(_key: &str, _value: &str) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(target_os = "windows")]
pub mod platform {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::os::windows::process::CommandExt;
    use std::path::{Path, PathBuf};
    use std::process::{Child, ChildStdin, Command, Stdio};
    use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
    use std::sync::OnceLock;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const WATCHDOG_INTERVAL: Duration = Duration::from_secs(10);
    const STALL_THRESHOLD_MS: u64 = 20_000;
    const CAPTURE_TIMEOUT: Duration = Duration::from_secs(22);

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum HelperBackend {
        SonyStream,       // Sony CRSDK (Cr_Core.dll + CrAdapter)
        SonyUsb,          // Sony libusb PTP-over-USB (WinUSB)
        SonyWpd,          // Sony Windows Portable Devices (MTP/PTP)
        NikonStream,      // Nikon WIA / MAID3 general
        NikonStreamD5200, // Nikon D5200 specific bridge
        NikonStreamD5300, // Nikon D5300 specific bridge
        PtpStream,        // Generic WIA PTP fallback (requires WIA DeviceID)
    }

    impl HelperBackend {
        pub fn exe_name(&self) -> &'static str {
            match self {
                Self::SonyStream => "sony_stream.exe",
                Self::SonyUsb => "sony_usb.exe",
                Self::SonyWpd => "sony_wpd.exe",
                Self::NikonStream => "nikon_stream.exe",
                Self::NikonStreamD5200 => "nikon_stream_d5200.exe",
                Self::NikonStreamD5300 => "nikon_stream_d5300.exe",
                Self::PtpStream => "ptp_stream.exe",
            }
        }

        pub fn label(&self) -> &'static str {
            match self {
                Self::SonyStream => "Sony (CRSDK Native)",
                Self::SonyUsb => "Sony (USB Direct)",
                Self::SonyWpd => "Sony (WPD)",
                Self::NikonStream | Self::NikonStreamD5200 | Self::NikonStreamD5300 => {
                    "Nikon (PTP/MAID3 Native)"
                }
                Self::PtpStream => "PTP Camera (WIA)",
            }
        }
    }

    #[derive(Clone, Debug)]
    struct DiscoveredDevice {
        brand: String,        // "sony" | "nikon"
        model: String,        // e.g. "ILCE-7M4", "Nikon D5300"
        device_id: String,    // PnP InstanceId or VID/PID
        wia_device_id: String, // WIA DeviceID if available
        is_winusb: bool,
    }

    struct BridgeSession {
        backend: HelperBackend,
        model: String,
        port: String,
        args: Vec<String>,
        child: Child,
        stdin: Option<ChildStdin>,
    }

    static SESSION: OnceLock<StdMutex<Option<BridgeSession>>> = OnceLock::new();
    static LIVEVIEW_BUFFER: OnceLock<Arc<StdMutex<LiveviewBuffer>>> = OnceLock::new();
    static LATEST_FRAME: OnceLock<StdMutex<Option<(Vec<u8>, Instant)>>> = OnceLock::new();
    static CAPTURE_PATH_TX: OnceLock<StdMutex<Option<tokio::sync::oneshot::Sender<String>>>> = OnceLock::new();

    static CONNECTED: AtomicBool = AtomicBool::new(false);
    static LIVEVIEW_ACTIVE: AtomicBool = AtomicBool::new(false);
    static PREPARE_CAPTURE_FLAG: AtomicBool = AtomicBool::new(false);
    static CAPTURE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
    static HELPER_READY: AtomicBool = AtomicBool::new(false);
    static HELPER_FAILED: AtomicBool = AtomicBool::new(false);
    static LAST_FRAME_EPOCH_MS: AtomicU64 = AtomicU64::new(0);
    static CONSECUTIVE_FRAME_MISSES: AtomicU32 = AtomicU32::new(0);
    static WATCHDOG_STARTED: AtomicBool = AtomicBool::new(false);
    static LAST_ERROR: OnceLock<StdMutex<Option<String>>> = OnceLock::new();

    fn session_mutex() -> &'static StdMutex<Option<BridgeSession>> {
        SESSION.get_or_init(|| StdMutex::new(None))
    }

    fn latest_frame_mutex() -> &'static StdMutex<Option<(Vec<u8>, Instant)>> {
        LATEST_FRAME.get_or_init(|| StdMutex::new(None))
    }

    fn capture_tx_mutex() -> &'static StdMutex<Option<tokio::sync::oneshot::Sender<String>>> {
        CAPTURE_PATH_TX.get_or_init(|| StdMutex::new(None))
    }

    fn last_error_mutex() -> &'static StdMutex<Option<String>> {
        LAST_ERROR.get_or_init(|| StdMutex::new(None))
    }

    fn now_epoch_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    pub fn init_liveview_buffer(buf: Arc<StdMutex<LiveviewBuffer>>) {
        let _ = LIVEVIEW_BUFFER.set(buf);
    }

    pub fn set_capture_preparing(preparing: bool) {
        PREPARE_CAPTURE_FLAG.store(preparing, Ordering::SeqCst);
    }

    fn set_windows_keep_awake(active: bool) {
        const ES_CONTINUOUS: u32 = 0x80000000;
        const ES_SYSTEM_REQUIRED: u32 = 0x00000001;
        const ES_DISPLAY_REQUIRED: u32 = 0x00000002;
        extern "system" {
            fn SetThreadExecutionState(esFlags: u32) -> u32;
        }
        unsafe {
            if active {
                SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
            } else {
                SetThreadExecutionState(ES_CONTINUOUS);
            }
        }
    }

    /// Pastikan direktori output sementara yang di-hardcode di dalam binary helper C++ selalu tersedia
    /// meskipun komputer belum pernah menginstal aplikasi lain sebelumnya.
    fn ensure_helper_output_dirs() {
        let _ = std::fs::create_dir_all(r"C:\ProgramData\Boothlab\Temp");
        let _ = std::fs::create_dir_all(r"C:\Temp");
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let user_dir = PathBuf::from(&userprofile);
            let _ = std::fs::create_dir_all(user_dir.join(r"Documents\Boothlab\Photos\Original"));
            let _ = std::fs::create_dir_all(user_dir.join(r"Boothlab\Photos\Original"));
        }
    }

    pub fn find_tools_dir() -> Option<PathBuf> {
        let mut candidates = Vec::new();
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                candidates.push(dir.join("tools"));
                candidates.push(dir.join("resources").join("tools"));
                if let Some(parent) = dir.parent() {
                    candidates.push(parent.join("tools"));
                }
            }
        }
        candidates.push(PathBuf::from("tools"));
        candidates.push(PathBuf::from("src-tauri/tools"));
        if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
            candidates.push(PathBuf::from(manifest).join("tools"));
        }

        candidates.into_iter().find(|p| p.is_dir())
    }

    pub fn is_available() -> bool {
        find_tools_dir().is_some()
    }

    fn kill_orphaned_helpers() {
        for exe in [
            "sony_stream.exe",
            "sony_usb.exe",
            "sony_wpd.exe",
            "nikon_stream.exe",
            "nikon_stream_d5200.exe",
            "nikon_stream_d5300.exe",
            "ptp_stream.exe",
        ] {
            let _ = Command::new("taskkill")
                .args(["/F", "/IM", exe])
                .creation_flags(CREATE_NO_WINDOW)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
    }

    fn detect_sony_winusb(tools_dir: &Path) -> Vec<DiscoveredDevice> {
        let exe = tools_dir.join("sony_usb.exe");
        if !exe.exists() {
            return Vec::new();
        }
        let mut out = Vec::new();
        if let Ok(output) = Command::new(&exe)
            .arg("detect")
            .current_dir(tools_dir)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("SONY_USB|") {
                    let mut parts = rest.splitn(2, '|');
                    let model = parts.next().unwrap_or("Sony Camera").trim().to_string();
                    let vid_pid = parts.next().unwrap_or("usb:sony").trim().to_string();
                    out.push(DiscoveredDevice {
                        brand: "sony".into(),
                        model: if model.is_empty() { "Sony Camera".into() } else { model },
                        device_id: vid_pid,
                        wia_device_id: String::new(),
                        is_winusb: true,
                    });
                }
            }
        }
        out
    }

    /// Deteksi cepat kamera Sony (VID_054C) dan Nikon (VID_04B0) melalui WIA DeviceManager (STA)
    /// dan WMI Win32_PnPEntity yang difilter langsung pada VID agar tidak pernah timeout.
    fn detect_wia_and_pnp_devices() -> Vec<DiscoveredDevice> {
        let script = r#"
[Threading.Thread]::CurrentThread.ApartmentState = [Threading.ApartmentState]::STA
$ErrorActionPreference = 'SilentlyContinue'

$pnpSony = @{}
$pnpNikon = @{}
try {
    $filter = "(PNPDeviceID LIKE '%VID_054C%' OR PNPDeviceID LIKE '%VID_04B0%') AND Status = 'OK'"
    $entities = Get-CimInstance Win32_PnPEntity -Filter $filter -ErrorAction SilentlyContinue
    foreach ($d in $entities) {
        $id = [string]$d.PNPDeviceID
        $name = [string]$d.Name
        if (-not $name) { continue }
        if ($id -like '*VID_054C*') {
            $pnpSony[$id] = $name
        } elseif ($id -like '*VID_04B0*') {
            $pnpNikon[$id] = $name
        }
    }
} catch {}

$foundSonyWia = $false
$foundNikonWia = $false

try {
    $wia = New-Object -ComObject "WIA.DeviceManager"
    foreach ($info in $wia.DeviceInfos) {
        try {
            if ($info.Type -ne 2) { continue }
            $name = [string]$info.Properties["Name"].Value
            $wiaId = [string]$info.DeviceID
            $lower = $name.ToLower()
            if ($lower -match 'sony|ilce|zv-|dsc-|nex-') {
                Write-Output "DEV|sony|$name|$wiaId|$wiaId"
                $foundSonyWia = $true
            } elseif ($lower -match 'nikon|coolpix|^d[0-9]|^z [0-9]|^z[0-9]|^z f') {
                $disp = if ($name -notlike '*Nikon*') { "Nikon $name" } else { $name }
                Write-Output "DEV|nikon|$disp|$wiaId|$wiaId"
                $foundNikonWia = $true
            } else {
                foreach ($v in $pnpNikon.Values) {
                    if ($v -and ($name -eq $v -or $name -like "*$v*" -or $v -like "*$name*")) {
                        $disp = if ($name -notlike '*Nikon*') { "Nikon $name" } else { $name }
                        Write-Output "DEV|nikon|$disp|$wiaId|$wiaId"
                        $foundNikonWia = $true
                        break
                    }
                }
            }
        } catch {}
    }
} catch {}

if (-not $foundSonyWia) {
    foreach ($kv in $pnpSony.GetEnumerator()) {
        Write-Output "DEV|sony|$($kv.Value)|$($kv.Key)|"
    }
}
if (-not $foundNikonWia) {
    foreach ($kv in $pnpNikon.GetEnumerator()) {
        $disp = if ($kv.Value -notlike '*Nikon*') { "Nikon $($kv.Value)" } else { $kv.Value }
        Write-Output "DEV|nikon|$disp|$($kv.Key)|"
    }
}
"#;
        let mut out = Vec::new();
        if let Ok(output) = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let parts: Vec<&str> = line.trim().splitn(5, '|').collect();
                if parts.len() == 5 && parts[0] == "DEV" {
                    let brand = parts[1].trim().to_lowercase();
                    let model = parts[2].trim().to_string();
                    let device_id = parts[3].trim().to_string();
                    let wia_device_id = parts[4].trim().to_string();
                    if !out.iter().any(|d: &DiscoveredDevice| d.model.eq_ignore_ascii_case(&model)) {
                        out.push(DiscoveredDevice {
                            brand,
                            model,
                            device_id,
                            wia_device_id,
                            is_winusb: false,
                        });
                    }
                }
            }
        }
        out
    }

    fn discover_all_devices(tools_dir: &Path) -> Vec<DiscoveredDevice> {
        let mut devices = detect_sony_winusb(tools_dir);
        for d in detect_wia_and_pnp_devices() {
            if !devices.iter().any(|existing| existing.model.eq_ignore_ascii_case(&d.model)) {
                devices.push(d);
            }
        }
        devices
    }

    pub async fn detect_cameras() -> Result<Vec<DetectedCamera>, String> {
        let Some(tools_dir) = find_tools_dir() else {
            return Ok(Vec::new());
        };
        tokio::task::spawn_blocking(move || {
            let devices = discover_all_devices(&tools_dir);
            Ok(devices
                .into_iter()
                .map(|d| {
                    let id_part = if !d.wia_device_id.is_empty() {
                        d.wia_device_id
                    } else {
                        d.device_id
                    };
                    DetectedCamera {
                        model: d.model,
                        port: format!("bridge:{}:{}", d.brand, id_part),
                    }
                })
                .collect())
        })
        .await
        .map_err(|e| format!("Task deteksi kamera gagal: {}", e))?
    }

    fn parse_stdout_stream(mut stdout: impl Read + Send + 'static) {
        let mut buf: Vec<u8> = Vec::with_capacity(256 * 1024);
        let mut chunk = [0u8; 32 * 1024];

        while CONNECTED.load(Ordering::SeqCst) {
            match stdout.read(&mut chunk) {
                Ok(0) => {
                    log::warn!("[CameraBridge] Helper stdout closed");
                    break;
                }
                Ok(n) => {
                    buf.extend_from_slice(&chunk[..n]);
                    process_stream_buffer(&mut buf);
                }
                Err(e) => {
                    log::warn!("[CameraBridge] Helper stdout read error: {}", e);
                    break;
                }
            }
        }
    }

    /// Cari posisi akhir frame JPEG (setelah EOI `0xFF 0xD9` terluar) dengan melewati
    /// segmen header berpanjang eksplisit (seperti APP1/EXIF yang dapat memuat embedded thumbnail `FF D8..FF D9`).
    fn find_jpeg_frame_end(buf: &[u8]) -> Option<usize> {
        if buf.len() < 4 || buf[0] != 0xFF || buf[1] != 0xD8 {
            return None;
        }
        let mut i = 2;
        let mut in_scan = false;
        while i + 1 < buf.len() {
            if buf[i] != 0xFF {
                i += 1;
                continue;
            }
            let marker = buf[i + 1];
            // Padding 0xFF berturut-turut
            if marker == 0xFF {
                i += 1;
                continue;
            }
            // Byte stuffing di dalam entropy-coded scan data (0xFF 0x00) dan RST0..RST7 (0xD0..0xD7)
            if marker == 0x00 || (0xD0..=0xD7).contains(&marker) {
                i += 2;
                continue;
            }
            // EOI (End of Image)
            if marker == 0xD9 {
                return Some(i + 2);
            }
            if !in_scan {
                // Standalone markers tanpa payload panjang
                if marker == 0xD8 || marker == 0x01 {
                    i += 2;
                    continue;
                }
                // Segmen header (APPn, DQT, DHT, SOFn, SOS, dll.) memiliki 2-byte big-endian length
                if i + 3 >= buf.len() {
                    return None; // Tunggu byte berikutnya
                }
                let seg_len = u16::from_be_bytes([buf[i + 2], buf[i + 3]]) as usize;
                if seg_len < 2 {
                    i += 2;
                    continue;
                }
                let next_pos = i + 2 + seg_len;
                if next_pos > buf.len() {
                    return None; // Segmen belum lengkap di buffer
                }
                if marker == 0xDA {
                    // SOS (Start of Scan): setelah header SOS adalah data kompresi hingga EOI (0xFF 0xD9)
                    in_scan = true;
                }
                i = next_pos;
            } else {
                i += 2;
            }
        }
        None
    }

    fn process_stream_buffer(buf: &mut Vec<u8>) {
        loop {
            let soi_pos = buf.windows(2).position(|w| w[0] == 0xFF && w[1] == 0xD8);

            let text_end = soi_pos.unwrap_or(buf.len());
            if text_end > 0 {
                if let Some(nl_pos) = buf[..text_end].iter().position(|&b| b == b'\n') {
                    let line_bytes: Vec<u8> = buf.drain(..=nl_pos).collect();
                    let line = String::from_utf8_lossy(&line_bytes).trim().to_string();
                    handle_helper_line(&line);
                    continue;
                } else if soi_pos.is_some() {
                    buf.drain(..text_end);
                    continue;
                }
            }

            if let Some(0) = buf.windows(2).position(|w| w[0] == 0xFF && w[1] == 0xD8) {
                if let Some(frame_end) = find_jpeg_frame_end(buf) {
                    let frame: Vec<u8> = buf.drain(..frame_end).collect();
                    on_jpeg_frame(frame);
                    continue;
                }
            }

            if buf.len() > 8 * 1024 * 1024 {
                buf.clear();
            }
            break;
        }
    }

    fn handle_helper_line(line: &str) {
        if line.is_empty() {
            return;
        }
        if let Some(idx) = line.find("PHOTO_PATH:") {
            let path = &line[idx + "PHOTO_PATH:".len()..];
            let clean_path = path.trim().trim_matches('"').to_string();
            log::info!("[CameraBridge] PHOTO_PATH received: {}", clean_path);
            if let Some(tx) = capture_tx_mutex().lock().unwrap().take() {
                let _ = tx.send(clean_path);
            }
            return;
        }

        if let Some(err_rest) = line.strip_prefix("CAMERA_ERROR|") {
            log::error!("[CameraBridge] Helper error: {}", err_rest);
            *last_error_mutex().lock().unwrap() = Some(err_rest.to_string());
        }

        // Deteksi sinyal koneksi berhasil dari stderr helper C++
        if line.contains("Live view enabled")
            || line.contains("Live view started")
            || line.contains("[sony_stream] Connected")
            || line.contains("[sony_usb] streaming...")
            || line.contains("[sony_wpd] Device opened:")
            || line.contains("[nikon_stream] Device opened OK")
            || line.contains("[nikon_maid3] Ready via")
            || line.contains("[ptp_stream] Device opened.")
        {
            HELPER_READY.store(true, Ordering::SeqCst);
        }

        // Deteksi sinyal kegagalan koneksi awal agar langsung fallback ke backend berikutnya
        // tanpa menunggu 3x retry (15 detik) di dalam helper
        if line.contains("no camera (err=")
            || line.contains("No Sony cameras found")
            || line.contains("No Sony device")
            || line.contains("open failed")
            || line.contains("Not found (attempt")
            || line.contains("No Sony WPD camera")
            || line.contains("No module could detect a camera")
            || line.contains("FATAL")
        {
            log::warn!("[CameraBridge] Helper report: {}", line);
            *last_error_mutex().lock().unwrap() = Some(line.to_string());
            HELPER_FAILED.store(true, Ordering::SeqCst);
        }
    }

    fn on_jpeg_frame(frame: Vec<u8>) {
        if frame.len() < 128 {
            return;
        }
        HELPER_READY.store(true, Ordering::SeqCst);
        LAST_FRAME_EPOCH_MS.store(now_epoch_ms(), Ordering::SeqCst);
        CONSECUTIVE_FRAME_MISSES.store(0, Ordering::SeqCst);
        *latest_frame_mutex().lock().unwrap() = Some((frame.clone(), Instant::now()));
        if LIVEVIEW_ACTIVE.load(Ordering::SeqCst) && !PREPARE_CAPTURE_FLAG.load(Ordering::SeqCst) {
            if let Some(buf_arc) = LIVEVIEW_BUFFER.get() {
                if let Ok(mut ring) = buf_arc.lock() {
                    ring.push(frame);
                }
            }
        }
    }

    fn spawn_helper(
        tools_dir: &Path,
        backend: HelperBackend,
        args: &[String],
    ) -> Result<(Child, ChildStdin), String> {
        ensure_helper_output_dirs();

        let exe_path = tools_dir.join(backend.exe_name());
        if !exe_path.exists() {
            return Err(format!("Helper tidak ditemukan: {}", exe_path.display()));
        }

        HELPER_READY.store(false, Ordering::SeqCst);
        HELPER_FAILED.store(false, Ordering::SeqCst);

        let mut cmd = Command::new(&exe_path);
        cmd.args(args)
            .current_dir(tools_dir)
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Gagal menjalankan {}: {}", backend.exe_name(), e))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| format!("Gagal membuka stdin {}", backend.exe_name()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| format!("Gagal membuka stdout {}", backend.exe_name()))?;
        let stderr = child.stderr.take();

        std::thread::Builder::new()
            .name(format!("camera-stdout-{}", backend.exe_name()))
            .spawn(move || parse_stdout_stream(stdout))
            .ok();

        if let Some(err_stream) = stderr {
            let name = backend.exe_name().to_string();
            std::thread::Builder::new()
                .name(format!("camera-stderr-{}", name))
                .spawn(move || {
                    let reader = BufReader::new(err_stream);
                    for line in reader.lines().map_while(Result::ok) {
                        handle_helper_line(&line);
                    }
                })
                .ok();
        }

        Ok((child, stdin))
    }

    fn stop_child_process(session: &mut BridgeSession) {
        if let Some(mut stdin) = session.stdin.take() {
            let _ = stdin.write_all(b"QUIT\n");
            let _ = stdin.flush();
        }
        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline {
            if let Ok(Some(_)) = session.child.try_wait() {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = session.child.kill();
        let _ = session.child.wait();
    }

    fn recover_current_session() -> bool {
        let mut guard = session_mutex().lock().unwrap();
        let Some(ref mut sess) = *guard else {
            return false;
        };
        stop_child_process(sess);
        if let Some(tools_dir) = find_tools_dir() {
            if let Ok((child, stdin)) = spawn_helper(&tools_dir, sess.backend, &sess.args) {
                sess.child = child;
                sess.stdin = Some(stdin);
                LAST_FRAME_EPOCH_MS.store(now_epoch_ms(), Ordering::SeqCst);
                CONSECUTIVE_FRAME_MISSES.store(0, Ordering::SeqCst);
                return true;
            }
        }
        false
    }

    fn ensure_watchdog_started() {
        if WATCHDOG_STARTED.swap(true, Ordering::SeqCst) {
            return;
        }
        std::thread::Builder::new()
            .name("camera-bridge-watchdog".into())
            .spawn(|| loop {
                std::thread::sleep(WATCHDOG_INTERVAL);
                if !CONNECTED.load(Ordering::SeqCst) || CAPTURE_IN_PROGRESS.load(Ordering::SeqCst) {
                    continue;
                }
                let should_recover = {
                    let mut guard = session_mutex().lock().unwrap();
                    let Some(ref mut sess) = *guard else {
                        continue;
                    };
                    let exited = matches!(sess.child.try_wait(), Ok(Some(_)));
                    let last_ms = LAST_FRAME_EPOCH_MS.load(Ordering::SeqCst);
                    let stalled = LIVEVIEW_ACTIVE.load(Ordering::SeqCst)
                        && !PREPARE_CAPTURE_FLAG.load(Ordering::SeqCst)
                        && last_ms > 0
                        && now_epoch_ms().saturating_sub(last_ms) > STALL_THRESHOLD_MS;
                    if exited || stalled {
                        log::warn!(
                            "[CameraBridge-Watchdog] Helper {} {} — auto-restarting...",
                            sess.backend.exe_name(),
                            if exited { "exited (or session renewal)" } else { "stalled >20s" }
                        );
                        true
                    } else {
                        false
                    }
                };
                if should_recover {
                    let _ = recover_current_session();
                }
            })
            .ok();
    }

    fn select_nikon_backend(model: &str) -> HelperBackend {
        let lower = model.to_lowercase();
        if lower.contains("d5200") {
            HelperBackend::NikonStreamD5200
        } else if lower.contains("d5300") {
            HelperBackend::NikonStreamD5300
        } else {
            HelperBackend::NikonStream
        }
    }

    fn connect_sync(preferred_port: Option<String>) -> Result<(String, String, String), String> {
        let tools_dir = find_tools_dir()
            .ok_or_else(|| "Folder helper kamera (tools/) tidak ditemukan.".to_string())?;

        let _ = disconnect_sync();
        kill_orphaned_helpers();
        ensure_helper_output_dirs();
        *last_error_mutex().lock().unwrap() = None;
        *latest_frame_mutex().lock().unwrap() = None;
        PREPARE_CAPTURE_FLAG.store(false, Ordering::SeqCst);
        CAPTURE_IN_PROGRESS.store(false, Ordering::SeqCst);
        CONSECUTIVE_FRAME_MISSES.store(0, Ordering::SeqCst);

        let discovered = discover_all_devices(&tools_dir);
        let target_dev = if let Some(ref pref) = preferred_port {
            discovered
                .iter()
                .find(|d| pref.contains(&d.device_id) || (!d.wia_device_id.is_empty() && pref.contains(&d.wia_device_id)))
                .cloned()
                .or_else(|| discovered.first().cloned())
        } else {
            discovered.first().cloned()
        };

        let is_nikon = target_dev
            .as_ref()
            .map(|d| d.brand == "nikon")
            .unwrap_or_else(|| preferred_port.as_deref().unwrap_or("").contains(":nikon:"));

        let model_hint = target_dev
            .as_ref()
            .map(|d| d.model.clone())
            .unwrap_or_else(|| if is_nikon { "Nikon Camera".into() } else { "Sony Camera".into() });

        let wia_id = target_dev
            .as_ref()
            .map(|d| d.wia_device_id.clone())
            .unwrap_or_default();
        let dev_id = target_dev
            .as_ref()
            .map(|d| d.device_id.clone())
            .unwrap_or_default();
        let is_winusb = target_dev.as_ref().map(|d| d.is_winusb).unwrap_or(false);

        let mut backends: Vec<(HelperBackend, Vec<String>)> = Vec::new();
        if is_nikon {
            let nikon_exe = select_nikon_backend(&model_hint);
            let arg = if !wia_id.is_empty() {
                vec![wia_id.clone()]
            } else if !dev_id.is_empty() {
                vec![dev_id.clone()]
            } else {
                Vec::new()
            };
            backends.push((nikon_exe, arg.clone()));
            if nikon_exe != HelperBackend::NikonStream {
                backends.push((HelperBackend::NikonStream, arg));
            }
        } else {
            // Jika kamera Sony sudah terdeteksi menggunakan driver WinUSB, langsung prioritaskan sony_usb.exe
            if is_winusb {
                backends.push((HelperBackend::SonyUsb, vec!["stream".into()]));
            }
            // Urutan standar Sony: CRSDK (PC Remote) -> libusb (WinUSB) -> WPD (MTP) -> WIA PTP (dengan WIA DeviceID)
            backends.push((HelperBackend::SonyStream, Vec::new()));
            if !is_winusb {
                backends.push((HelperBackend::SonyUsb, vec!["stream".into()]));
            }
            backends.push((HelperBackend::SonyWpd, Vec::new()));
            if !wia_id.is_empty() {
                backends.push((HelperBackend::PtpStream, vec![wia_id.clone()]));
            }
        }

        let mut last_err = "Tidak ada kamera Sony/Nikon yang terdeteksi via USB. Pastikan kamera menyala dan mode USB diset ke PC Remote (Sony) atau MTP/PTP.".to_string();

        for (backend, args) in backends {
            if !tools_dir.join(backend.exe_name()).exists() {
                continue;
            }
            log::info!(
                "[CameraBridge] Mencoba backend {} (args={:?})...",
                backend.label(),
                args
            );
            CONNECTED.store(true, Ordering::SeqCst);
            LAST_FRAME_EPOCH_MS.store(0, Ordering::SeqCst);

            match spawn_helper(&tools_dir, backend, &args) {
                Ok((child, stdin)) => {
                    let port_str = if !wia_id.is_empty() {
                        wia_id.clone()
                    } else if !dev_id.is_empty() {
                        dev_id.clone()
                    } else {
                        backend.exe_name().to_string()
                    };

                    let mut sess = BridgeSession {
                        backend,
                        model: model_hint.clone(),
                        port: port_str.clone(),
                        args,
                        child,
                        stdin: Some(stdin),
                    };

                    // Tunggu hingga helper benar-benar mengirim sinyal READY / frame pertama (maks 4.5 detik),
                    // atau segera batalkan jika helper melaporkan kegagalan koneksi awal (HELPER_FAILED).
                    let start_wait = Instant::now();
                    let mut connected_ok = false;
                    while start_wait.elapsed() < Duration::from_millis(4500) {
                        if HELPER_READY.load(Ordering::SeqCst)
                            || LAST_FRAME_EPOCH_MS.load(Ordering::SeqCst) > 0
                        {
                            connected_ok = true;
                            break;
                        }
                        if HELPER_FAILED.load(Ordering::SeqCst)
                            || matches!(sess.child.try_wait(), Ok(Some(_)))
                        {
                            break;
                        }
                        std::thread::sleep(Duration::from_millis(60));
                    }

                    if connected_ok && matches!(sess.child.try_wait(), Ok(None)) {
                        *session_mutex().lock().unwrap() = Some(sess);
                        set_windows_keep_awake(true);
                        ensure_watchdog_started();
                        log::info!(
                            "[CameraBridge] Terhubung ke {} via {}",
                            model_hint,
                            backend.label()
                        );
                        return Ok((backend.label().to_string(), model_hint, port_str));
                    } else {
                        if let Some(err) = last_error_mutex().lock().unwrap().clone() {
                            last_err = err;
                        }
                        stop_child_process(&mut sess);
                        CONNECTED.store(false, Ordering::SeqCst);
                    }
                }
                Err(e) => {
                    CONNECTED.store(false, Ordering::SeqCst);
                    last_err = e;
                }
            }
        }

        Err(last_err)
    }

    pub async fn connect(preferred_port: Option<String>) -> Result<(String, String, String), String> {
        tokio::task::spawn_blocking(move || connect_sync(preferred_port))
            .await
            .map_err(|e| format!("Task connect CameraBridge gagal: {}", e))?
    }

    fn disconnect_sync() -> Result<(), String> {
        CONNECTED.store(false, Ordering::SeqCst);
        LIVEVIEW_ACTIVE.store(false, Ordering::SeqCst);
        PREPARE_CAPTURE_FLAG.store(false, Ordering::SeqCst);
        CAPTURE_IN_PROGRESS.store(false, Ordering::SeqCst);
        CONSECUTIVE_FRAME_MISSES.store(0, Ordering::SeqCst);
        set_windows_keep_awake(false);
        if let Some(mut sess) = session_mutex().lock().unwrap().take() {
            stop_child_process(&mut sess);
        }
        *latest_frame_mutex().lock().unwrap() = None;
        Ok(())
    }

    pub async fn disconnect() -> Result<(), String> {
        tokio::task::spawn_blocking(disconnect_sync)
            .await
            .map_err(|e| format!("Task disconnect gagal: {}", e))?
    }

    fn is_connected_sync() -> bool {
        if !CONNECTED.load(Ordering::SeqCst) {
            return false;
        }
        let mut guard = session_mutex().lock().unwrap();
        if let Some(ref mut sess) = *guard {
            return matches!(sess.child.try_wait(), Ok(None));
        }
        false
    }

    pub async fn is_connected() -> bool {
        is_connected_sync()
    }

    pub async fn start_liveview() -> Result<(), String> {
        PREPARE_CAPTURE_FLAG.store(false, Ordering::SeqCst);
        if !is_connected_sync() {
            let _ = connect(None).await?;
        }
        LIVEVIEW_ACTIVE.store(true, Ordering::SeqCst);
        CONSECUTIVE_FRAME_MISSES.store(0, Ordering::SeqCst);
        LAST_FRAME_EPOCH_MS.store(now_epoch_ms(), Ordering::SeqCst);
        Ok(())
    }

    pub async fn stop_liveview() -> Result<(), String> {
        LIVEVIEW_ACTIVE.store(false, Ordering::SeqCst);
        PREPARE_CAPTURE_FLAG.store(false, Ordering::SeqCst);
        CONSECUTIVE_FRAME_MISSES.store(0, Ordering::SeqCst);
        Ok(())
    }

    pub async fn get_liveview_frame() -> Result<Vec<u8>, String> {
        if !is_connected_sync() {
            let _ = connect(None).await?;
        }
        LIVEVIEW_ACTIVE.store(true, Ordering::SeqCst);

        for _ in 0..8 {
            if let Some((ref bytes, ts)) = *latest_frame_mutex().lock().unwrap() {
                if ts.elapsed() < Duration::from_millis(1200) && !bytes.is_empty() {
                    CONSECUTIVE_FRAME_MISSES.store(0, Ordering::SeqCst);
                    return Ok(bytes.clone());
                }
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        let misses = CONSECUTIVE_FRAME_MISSES.fetch_add(1, Ordering::SeqCst) + 1;
        if misses >= 12 && !CAPTURE_IN_PROGRESS.load(Ordering::SeqCst) {
            log::warn!(
                "[CameraBridge] Liveview tidak menerima frame baru sebanyak {}x berturut-turut, memulihkan sesi...",
                misses
            );
            CONSECUTIVE_FRAME_MISSES.store(0, Ordering::SeqCst);
            let _ = tokio::task::spawn_blocking(recover_current_session).await;
        }

        let mut guard = latest_frame_mutex().lock().unwrap();
        if misses <= 3 {
            if let Some((ref cached, _)) = *guard {
                return Ok(cached.clone());
            }
        } else {
            *guard = None;
        }

        Err("Menunggu frame liveview dari kamera...".into())
    }

    pub async fn capture_photo() -> Result<Vec<u8>, String> {
        if !is_connected_sync() {
            if let Err(e) = connect(None).await {
                PREPARE_CAPTURE_FLAG.store(false, Ordering::SeqCst);
                return Err(e);
            }
        }

        PREPARE_CAPTURE_FLAG.store(true, Ordering::SeqCst);
        CAPTURE_IN_PROGRESS.store(true, Ordering::SeqCst);
        let (tx, rx) = tokio::sync::oneshot::channel::<String>();
        *capture_tx_mutex().lock().unwrap() = Some(tx);

        let write_res = {
            let mut guard = session_mutex().lock().unwrap();
            if let Some(ref mut sess) = *guard {
                if let Some(ref mut stdin) = sess.stdin {
                    stdin
                        .write_all(b"CAPTURE\n")
                        .and_then(|_| stdin.flush())
                        .map_err(|e| format!("Gagal mengirim CAPTURE ke kamera: {}", e))
                } else {
                    Err("Stdin helper kamera tidak tersedia.".into())
                }
            } else {
                Err("Sesi kamera tidak aktif.".into())
            }
        };

        if let Err(e) = write_res {
            PREPARE_CAPTURE_FLAG.store(false, Ordering::SeqCst);
            CAPTURE_IN_PROGRESS.store(false, Ordering::SeqCst);
            *capture_tx_mutex().lock().unwrap() = None;
            return Err(e);
        }

        let wait_res = tokio::time::timeout(CAPTURE_TIMEOUT, rx).await;
        PREPARE_CAPTURE_FLAG.store(false, Ordering::SeqCst);
        CAPTURE_IN_PROGRESS.store(false, Ordering::SeqCst);
        LAST_FRAME_EPOCH_MS.store(now_epoch_ms(), Ordering::SeqCst);

        match wait_res {
            Ok(Ok(path)) if !path.is_empty() => {
                if let Ok(bytes) = tokio::fs::read(&path).await {
                    if !bytes.is_empty() {
                        return Ok(bytes);
                    }
                }
                log::warn!(
                    "[CameraBridge] File PHOTO_PATH kosong/tidak terbaca ({}), fallback ke frame liveview",
                    path
                );
            }
            _ => {
                *capture_tx_mutex().lock().unwrap() = None;
                log::warn!("[CameraBridge] PHOTO_PATH timeout, fallback ke frame liveview");
            }
        }

        let guard = latest_frame_mutex().lock().unwrap();
        if let Some((ref bytes, _)) = *guard {
            return Ok(bytes.clone());
        }
        Err("Gagal mengambil foto dari kamera (timeout & tidak ada liveview fallback).".into())
    }

    pub async fn set_setting(key: &str, value: &str) -> Result<(), String> {
        let mut guard = session_mutex().lock().unwrap();
        let Some(ref mut sess) = *guard else {
            return Ok(());
        };
        if matches!(
            sess.backend,
            HelperBackend::SonyStream
                | HelperBackend::SonyUsb
                | HelperBackend::NikonStream
                | HelperBackend::NikonStreamD5200
                | HelperBackend::NikonStreamD5300
        ) {
            if let Some(ref mut stdin) = sess.stdin {
                let cmd = format!("SET_PROP {}={}\n", key, value);
                let _ = stdin.write_all(cmd.as_bytes());
                let _ = stdin.flush();
            }
        }
        Ok(())
    }
}
