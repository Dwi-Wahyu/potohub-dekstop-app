#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct EdsCameraDevice {
    pub model: String,
    pub port: String,
}

#[cfg(not(target_os = "windows"))]
pub mod platform {
    use super::*;

    pub fn is_available() -> bool {
        false
    }

    pub fn detect_cameras() -> Result<Vec<EdsCameraDevice>, String> {
        Ok(Vec::new())
    }

    pub fn connect() -> Result<(String, String), String> {
        Err("Canon EDSDK hanya tersedia pada platform Windows.".into())
    }

    pub fn disconnect() -> Result<(), String> {
        Ok(())
    }

    pub fn is_connected() -> bool {
        false
    }

    pub fn start_liveview() -> Result<(), String> {
        Err("Canon EDSDK hanya tersedia pada platform Windows.".into())
    }

    pub fn get_liveview_frame() -> Result<Vec<u8>, String> {
        Err("Canon EDSDK hanya tersedia pada platform Windows.".into())
    }

    pub fn stop_liveview() -> Result<(), String> {
        Ok(())
    }

    pub fn capture_photo() -> Result<Vec<u8>, String> {
        Err("Canon EDSDK hanya tersedia pada platform Windows.".into())
    }
}

#[cfg(target_os = "windows")]
pub mod platform {
    use super::*;
    use std::ffi::{c_char, c_void, CStr, CString};
    use std::path::PathBuf;
    use std::ptr;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc::{channel, Receiver, Sender};
    use std::sync::Mutex;
    use std::time::{Duration, Instant};

    // EDSDK Return Codes
    pub const EDS_ERR_OK: u32 = 0x00000000;
    pub const EDS_ERR_DEVICE_BUSY: u32 = 0x00000082;

    // EDSDK Properties
    pub const kEdsPropID_SaveTo: u32 = 0x0000000b;
    pub const kEdsSaveTo_Host: u32 = 2;
    pub const kEdsSaveTo_Both: u32 = 3;

    pub const kEdsPropID_Evf_OutputDevice: u32 = 0x00000500;
    pub const kEdsPropID_Evf_Mode: u32 = 0x00000501;
    pub const kEdsEvfOutputDevice_PC: u32 = 2;

    // EDSDK Commands
    pub const kEdsCameraCommand_TakePicture: u32 = 0x00000000;
    pub const kEdsCameraCommand_PressShutterButton: u32 = 0x00000004;
    pub const kEdsCameraCommand_ShutterButton_OFF: i32 = 0x00000000;
    pub const kEdsCameraCommand_ShutterButton_Completely: i32 = 0x00000003;

    // EDSDK Events
    pub const kEdsObjectEvent_All: u32 = 0x00000200;
    pub const kEdsObjectEvent_DirItemRequestTransfer: u32 = 0x00000208;
    pub const kEdsObjectEvent_DirItemCreated: u32 = 0x00000204;

    #[repr(C)]
    #[derive(Copy, Clone)]
    pub struct EdsDeviceInfo {
        pub szPortName: [c_char; 256],
        pub szDeviceDescription: [c_char; 256],
        pub DeviceSubType: u32,
        pub reserved: u32,
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    pub struct EdsDirectoryItemInfo {
        pub size: u64,
        pub isFolder: u32,
        pub groupID: u32,
        pub format: u32,
        pub szFileName: [c_char; 256],
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    pub struct EdsCapacity {
        pub numberOfFreeClusters: i32,
        pub bytesPerSector: i32,
        pub reset: i32,
    }

    type EdsError = u32;
    type EdsBaseRef = *mut c_void;
    type EdsCameraListRef = EdsBaseRef;
    type EdsCameraRef = EdsBaseRef;
    type EdsEvfImageRef = EdsBaseRef;
    type EdsStreamRef = EdsBaseRef;
    type EdsDirectoryItemRef = EdsBaseRef;

    type EdsObjectEventHandler = unsafe extern "system" fn(
        inEvent: u32,
        inRef: EdsBaseRef,
        inContext: *mut c_void,
    ) -> EdsError;

    type EdsInitializeSDKFn = unsafe extern "system" fn() -> EdsError;
    type EdsTerminateSDKFn = unsafe extern "system" fn() -> EdsError;
    type EdsGetCameraListFn = unsafe extern "system" fn(*mut EdsCameraListRef) -> EdsError;
    type EdsGetChildCountFn = unsafe extern "system" fn(EdsBaseRef, *mut u32) -> EdsError;
    type EdsGetChildAtIndexFn = unsafe extern "system" fn(EdsBaseRef, i32, *mut EdsBaseRef) -> EdsError;
    type EdsGetDeviceInfoFn = unsafe extern "system" fn(EdsCameraRef, *mut EdsDeviceInfo) -> EdsError;
    type EdsOpenSessionFn = unsafe extern "system" fn(EdsCameraRef) -> EdsError;
    type EdsCloseSessionFn = unsafe extern "system" fn(EdsCameraRef) -> EdsError;
    type EdsSendCommandFn = unsafe extern "system" fn(EdsCameraRef, u32, i32) -> EdsError;
    type EdsSendStatusCommandFn = unsafe extern "system" fn(EdsCameraRef, u32, i32) -> EdsError;
    type EdsSetPropertyDataFn = unsafe extern "system" fn(EdsBaseRef, u32, i32, u32, *const c_void) -> EdsError;
    type EdsGetPropertyDataFn = unsafe extern "system" fn(EdsBaseRef, u32, i32, u32, *mut c_void) -> EdsError;
    type EdsSetCapacityFn = unsafe extern "system" fn(EdsCameraRef, EdsCapacity) -> EdsError;
    type EdsCreateMemoryStreamFn = unsafe extern "system" fn(u32, *mut EdsStreamRef) -> EdsError;
    type EdsCreateEvfImageRefFn = unsafe extern "system" fn(EdsStreamRef, *mut EdsEvfImageRef) -> EdsError;
    type EdsDownloadEvfImageFn = unsafe extern "system" fn(EdsCameraRef, EdsEvfImageRef) -> EdsError;
    type EdsGetPointerFn = unsafe extern "system" fn(EdsStreamRef, *mut *mut c_void) -> EdsError;
    type EdsGetLengthFn = unsafe extern "system" fn(EdsStreamRef, *mut u64) -> EdsError;
    type EdsReleaseFn = unsafe extern "system" fn(EdsBaseRef) -> u32;
    type EdsSetObjectEventHandlerFn = unsafe extern "system" fn(
        EdsCameraRef,
        u32,
        Option<EdsObjectEventHandler>,
        *mut c_void,
    ) -> EdsError;
    type EdsGetDirectoryItemInfoFn = unsafe extern "system" fn(EdsDirectoryItemRef, *mut EdsDirectoryItemInfo) -> EdsError;
    type EdsDownloadFn = unsafe extern "system" fn(EdsDirectoryItemRef, u64, EdsStreamRef) -> EdsError;
    type EdsDownloadCompleteFn = unsafe extern "system" fn(EdsDirectoryItemRef) -> EdsError;
    type EdsGetEventFn = unsafe extern "system" fn() -> EdsError;

    pub struct EdsdkApi {
        pub h_module: *mut c_void,
        pub InitializeSDK: EdsInitializeSDKFn,
        pub TerminateSDK: EdsTerminateSDKFn,
        pub GetCameraList: EdsGetCameraListFn,
        pub GetChildCount: EdsGetChildCountFn,
        pub GetChildAtIndex: EdsGetChildAtIndexFn,
        pub GetDeviceInfo: EdsGetDeviceInfoFn,
        pub OpenSession: EdsOpenSessionFn,
        pub CloseSession: EdsCloseSessionFn,
        pub SendCommand: EdsSendCommandFn,
        pub SetPropertyData: EdsSetPropertyDataFn,
        pub GetPropertyData: EdsGetPropertyDataFn,
        pub SetCapacity: EdsSetCapacityFn,
        pub CreateMemoryStream: EdsCreateMemoryStreamFn,
        pub CreateEvfImageRef: EdsCreateEvfImageRefFn,
        pub DownloadEvfImage: EdsDownloadEvfImageFn,
        pub GetPointer: EdsGetPointerFn,
        pub GetLength: EdsGetLengthFn,
        pub Release: EdsReleaseFn,
        pub SetObjectEventHandler: EdsSetObjectEventHandlerFn,
        pub GetDirectoryItemInfo: EdsGetDirectoryItemInfoFn,
        pub Download: EdsDownloadFn,
        pub DownloadComplete: EdsDownloadCompleteFn,
        pub GetEvent: Option<EdsGetEventFn>,
    }

    unsafe impl Send for EdsdkApi {}
    unsafe impl Sync for EdsdkApi {}

    static API: Mutex<Option<EdsdkApi>> = Mutex::new(None);
    static CONNECTED_CAMERA: Mutex<Option<EdsCameraRef>> = Mutex::new(None);
    static IS_LIVEVIEW_ACTIVE: AtomicBool = AtomicBool::new(false);
    static CAPTURE_SENDER: Mutex<Option<Sender<Vec<u8>>>> = Mutex::new(None);

    fn find_edsdk_dll() -> Option<PathBuf> {
        let mut candidates = Vec::new();
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(dir) = exe_path.parent() {
                candidates.push(dir.join("EDSDK.dll"));
                candidates.push(dir.join("drivers/EDSDK.dll"));
                candidates.push(dir.join("gphoto-libs/EDSDK.dll"));
                candidates.push(dir.join("resources/EDSDK.dll"));
                candidates.push(dir.join("resources/drivers/EDSDK.dll"));
                candidates.push(dir.join("resources/gphoto-libs/EDSDK.dll"));
                candidates.push(dir.join("../../drivers/EDSDK.dll"));
                candidates.push(dir.join("../../gphoto-libs/EDSDK.dll"));
                candidates.push(dir.join("../../../drivers/EDSDK.dll"));
                candidates.push(dir.join("../../../gphoto-libs/EDSDK.dll"));
            }
        }
        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(cwd.join("EDSDK.dll"));
            candidates.push(cwd.join("drivers/EDSDK.dll"));
            candidates.push(cwd.join("gphoto-libs/EDSDK.dll"));
            candidates.push(cwd.join("src-tauri/drivers/EDSDK.dll"));
            candidates.push(cwd.join("src-tauri/gphoto-libs/EDSDK.dll"));
        }
        candidates.push(PathBuf::from("EDSDK.dll"));
        candidates.push(PathBuf::from("drivers/EDSDK.dll"));
        candidates.push(PathBuf::from("gphoto-libs/EDSDK.dll"));

        for c in candidates {
            if c.exists() {
                return Some(c);
            }
        }
        None
    }

    unsafe fn load_api() -> Result<(), String> {
        let mut guard = API.lock().unwrap();
        if guard.is_some() {
            return Ok(());
        }

        let dll_path = find_edsdk_dll().ok_or_else(|| "File EDSDK.dll tidak ditemukan pada sistem.".to_string())?;

        extern "system" {
            fn LoadLibraryW(lpLibFileName: *const u16) -> *mut c_void;
            fn GetProcAddress(hModule: *mut c_void, lpProcName: *const c_char) -> *mut c_void;
        }

        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = dll_path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let h_module = LoadLibraryW(wide.as_ptr());
        if h_module.is_null() {
            return Err(format!("Gagal memuat EDSDK.dll dari {}", dll_path.display()));
        }

        macro_rules! get_fn {
            ($name:ident, $type:ty) => {{
                let c_name = CString::new(stringify!($name)).unwrap();
                let proc = GetProcAddress(h_module, c_name.as_ptr());
                if proc.is_null() {
                    return Err(format!("Fungsi {} tidak ditemukan di EDSDK.dll", stringify!($name)));
                }
                std::mem::transmute::<*mut c_void, $type>(proc)
            }};
        }

        let api = EdsdkApi {
            h_module,
            InitializeSDK: get_fn!(EdsInitializeSDK, EdsInitializeSDKFn),
            TerminateSDK: get_fn!(EdsTerminateSDK, EdsTerminateSDKFn),
            GetCameraList: get_fn!(EdsGetCameraList, EdsGetCameraListFn),
            GetChildCount: get_fn!(EdsGetChildCount, EdsGetChildCountFn),
            GetChildAtIndex: get_fn!(EdsGetChildAtIndex, EdsGetChildAtIndexFn),
            GetDeviceInfo: get_fn!(EdsGetDeviceInfo, EdsGetDeviceInfoFn),
            OpenSession: get_fn!(EdsOpenSession, EdsOpenSessionFn),
            CloseSession: get_fn!(EdsCloseSession, EdsCloseSessionFn),
            SendCommand: get_fn!(EdsSendCommand, EdsSendCommandFn),
            SetPropertyData: get_fn!(EdsSetPropertyData, EdsSetPropertyDataFn),
            GetPropertyData: get_fn!(EdsGetPropertyData, EdsGetPropertyDataFn),
            SetCapacity: get_fn!(EdsSetCapacity, EdsSetCapacityFn),
            CreateMemoryStream: get_fn!(EdsCreateMemoryStream, EdsCreateMemoryStreamFn),
            CreateEvfImageRef: get_fn!(EdsCreateEvfImageRef, EdsCreateEvfImageRefFn),
            DownloadEvfImage: get_fn!(EdsDownloadEvfImage, EdsDownloadEvfImageFn),
            GetPointer: get_fn!(EdsGetPointer, EdsGetPointerFn),
            GetLength: get_fn!(EdsGetLength, EdsGetLengthFn),
            Release: get_fn!(EdsRelease, EdsReleaseFn),
            SetObjectEventHandler: get_fn!(EdsSetObjectEventHandler, EdsSetObjectEventHandlerFn),
            GetDirectoryItemInfo: get_fn!(EdsGetDirectoryItemInfo, EdsGetDirectoryItemInfoFn),
            Download: get_fn!(EdsDownload, EdsDownloadFn),
            DownloadComplete: get_fn!(EdsDownloadComplete, EdsDownloadCompleteFn),
            GetEvent: {
                let c_name = CString::new("EdsGetEvent").unwrap();
                let proc = GetProcAddress(h_module, c_name.as_ptr());
                if !proc.is_null() {
                    Some(std::mem::transmute::<*mut c_void, EdsGetEventFn>(proc))
                } else {
                    None
                }
            },
        };

        *guard = Some(api);
        println!("[Canon-EDSDK] EDSDK.dll berhasil dimuat dari {}", dll_path.display());
        Ok(())
    }

    pub fn is_available() -> bool {
        find_edsdk_dll().is_some()
    }

    unsafe extern "system" fn handle_object_event(
        in_event: u32,
        in_ref: EdsBaseRef,
        _in_context: *mut c_void,
    ) -> EdsError {
        if in_event == kEdsObjectEvent_DirItemRequestTransfer || in_event == kEdsObjectEvent_DirItemCreated {
            let guard = API.lock().unwrap();
            if let Some(ref api) = *guard {
                let mut dir_info: EdsDirectoryItemInfo = std::mem::zeroed();
                if (api.GetDirectoryItemInfo)(in_ref, &mut dir_info) == EDS_ERR_OK {
                    let mut stream: EdsStreamRef = ptr::null_mut();
                    if (api.CreateMemoryStream)(0, &mut stream) == EDS_ERR_OK {
                        let dl_err = (api.Download)(in_ref, dir_info.size, stream);
                        let _ = (api.DownloadComplete)(in_ref);
                        if dl_err == EDS_ERR_OK {
                            let mut data_ptr: *mut c_void = ptr::null_mut();
                            let mut data_len: u64 = 0;
                            let _ = (api.GetPointer)(stream, &mut data_ptr);
                            let _ = (api.GetLength)(stream, &mut data_len);
                            if !data_ptr.is_null() && data_len > 0 {
                                let slice = std::slice::from_raw_parts(data_ptr as *const u8, data_len as usize);
                                let bytes = slice.to_vec();
                                if let Ok(mut sender_guard) = CAPTURE_SENDER.lock() {
                                    if let Some(sender) = sender_guard.take() {
                                        let _ = sender.send(bytes);
                                    }
                                }
                            }
                        }
                        (api.Release)(stream);
                    }
                }
                (api.Release)(in_ref);
            }
        }
        EDS_ERR_OK
    }

    pub fn detect_cameras() -> Result<Vec<EdsCameraDevice>, String> {
        unsafe {
            load_api()?;
            let guard = API.lock().unwrap();
            let api = guard.as_ref().unwrap();

            let err = (api.InitializeSDK)();
            if err != EDS_ERR_OK && err != 0x00000001 { // 1 = already initialized
                return Err(format!("Gagal inisialisasi Canon EDSDK (code: {:#X})", err));
            }

            let mut camera_list: EdsCameraListRef = ptr::null_mut();
            let err = (api.GetCameraList)(&mut camera_list);
            if err != EDS_ERR_OK {
                let _ = (api.TerminateSDK)();
                return Ok(Vec::new());
            }

            let mut count: u32 = 0;
            let _ = (api.GetChildCount)(camera_list, &mut count);
            let mut detected = Vec::new();

            for i in 0..count {
                let mut camera: EdsCameraRef = ptr::null_mut();
                if (api.GetChildAtIndex)(camera_list, i as i32, &mut camera) == EDS_ERR_OK {
                    let mut dev_info: EdsDeviceInfo = std::mem::zeroed();
                    if (api.GetDeviceInfo)(camera, &mut dev_info) == EDS_ERR_OK {
                        let desc = CStr::from_ptr(dev_info.szDeviceDescription.as_ptr()).to_string_lossy().to_string();
                        let port = CStr::from_ptr(dev_info.szPortName.as_ptr()).to_string_lossy().to_string();
                        detected.push(EdsCameraDevice {
                            model: if desc.is_empty() { "Canon EOS Digital Camera".to_string() } else { desc },
                            port: if port.is_empty() { format!("USB-Port-{}", i + 1) } else { port },
                        });
                    }
                    (api.Release)(camera);
                }
            }

            (api.Release)(camera_list);
            Ok(detected)
        }
    }

    pub fn connect() -> Result<(String, String), String> {
        unsafe {
            load_api()?;
            let guard = API.lock().unwrap();
            let api = guard.as_ref().unwrap();

            let err = (api.InitializeSDK)();
            if err != EDS_ERR_OK && err != 0x00000001 {
                return Err(format!("Gagal inisialisasi Canon EDSDK (code: {:#X})", err));
            }

            let mut camera_list: EdsCameraListRef = ptr::null_mut();
            let err = (api.GetCameraList)(&mut camera_list);
            if err != EDS_ERR_OK {
                return Err("Gagal mengambil daftar kamera Canon.".into());
            }

            let mut count: u32 = 0;
            let _ = (api.GetChildCount)(camera_list, &mut count);
            if count == 0 {
                (api.Release)(camera_list);
                return Err("Tidak ada kamera Canon yang terdeteksi via USB.".into());
            }

            let mut camera: EdsCameraRef = ptr::null_mut();
            let err = (api.GetChildAtIndex)(camera_list, 0, &mut camera);
            (api.Release)(camera_list);
            if err != EDS_ERR_OK || camera.is_null() {
                return Err("Gagal mendapatkan objek kamera Canon.".into());
            }

            let mut dev_info: EdsDeviceInfo = std::mem::zeroed();
            let _ = (api.GetDeviceInfo)(camera, &mut dev_info);
            let model = CStr::from_ptr(dev_info.szDeviceDescription.as_ptr()).to_string_lossy().to_string();
            let port = CStr::from_ptr(dev_info.szPortName.as_ptr()).to_string_lossy().to_string();

            // Set event handler sebelum membuka sesi
            let _ = (api.SetObjectEventHandler)(camera, kEdsObjectEvent_All, Some(handle_object_event), ptr::null_mut());

            let err = (api.OpenSession)(camera);
            if err != EDS_ERR_OK {
                (api.Release)(camera);
                return Err(format!("Gagal membuka sesi ke kamera Canon (code: {:#X}). Pastikan software EOS Utility ditutup.", err));
            }

            // Set SaveTo: Host (PC) agar foto langsung masuk ke laptop tanpa mewajibkan SD card
            let save_to: u32 = kEdsSaveTo_Host;
            let _ = (api.SetPropertyData)(camera, kEdsPropID_SaveTo, 0, std::mem::size_of::<u32>() as u32, &save_to as *const u32 as *const c_void);

            // Beritahu kamera kapasitas penyimpanan komputer
            let capacity = EdsCapacity {
                numberOfFreeClusters: 0x7FFFFFFF,
                bytesPerSector: 4096,
                reset: 1,
            };
            let _ = (api.SetCapacity)(camera, capacity);

            let mut cam_guard = CONNECTED_CAMERA.lock().unwrap();
            if let Some(old) = cam_guard.take() {
                let _ = (api.CloseSession)(old);
                let _ = (api.Release)(old);
            }
            *cam_guard = Some(camera);

            println!("[Canon-EDSDK] Terhubung ke: {} (Port: {})", model, port);
            Ok((model, port))
        }
    }

    pub fn disconnect() -> Result<(), String> {
        let _ = stop_liveview();
        unsafe {
            let guard = API.lock().unwrap();
            if let Some(ref api) = *guard {
                let mut cam_guard = CONNECTED_CAMERA.lock().unwrap();
                if let Some(cam) = cam_guard.take() {
                    let _ = (api.CloseSession)(cam);
                    let _ = (api.Release)(cam);
                }
                let _ = (api.TerminateSDK)();
            }
        }
        Ok(())
    }

    pub fn is_connected() -> bool {
        CONNECTED_CAMERA.lock().unwrap().is_some()
    }

    pub fn start_liveview() -> Result<(), String> {
        unsafe {
            let guard = API.lock().unwrap();
            let api = guard.as_ref().ok_or_else(|| "EDSDK API belum dimuat".to_string())?;
            let cam_guard = CONNECTED_CAMERA.lock().unwrap();
            let camera = cam_guard.as_ref().ok_or_else(|| "Kamera Canon belum terhubung".to_string())?;

            // Aktifkan Liveview mode
            let mode: u32 = 1;
            let _ = (api.SetPropertyData)(*camera, kEdsPropID_Evf_Mode, 0, 4, &mode as *const u32 as *const c_void);

            // Arahkan output viewfinder ke PC
            let output_device: u32 = kEdsEvfOutputDevice_PC;
            let err = (api.SetPropertyData)(*camera, kEdsPropID_Evf_OutputDevice, 0, 4, &output_device as *const u32 as *const c_void);
            if err != EDS_ERR_OK {
                return Err(format!("Gagal mengaktifkan EVF output PC (code: {:#X})", err));
            }

            IS_LIVEVIEW_ACTIVE.store(true, Ordering::SeqCst);
            println!("[Canon-EDSDK] Live View AKTIF!");
            Ok(())
        }
    }

    pub fn stop_liveview() -> Result<(), String> {
        IS_LIVEVIEW_ACTIVE.store(false, Ordering::SeqCst);
        unsafe {
            let guard = API.lock().unwrap();
            if let Some(ref api) = *guard {
                let cam_guard = CONNECTED_CAMERA.lock().unwrap();
                if let Some(camera) = cam_guard.as_ref() {
                    let output_device: u32 = 0;
                    let _ = (api.SetPropertyData)(*camera, kEdsPropID_Evf_OutputDevice, 0, 4, &output_device as *const u32 as *const c_void);
                }
            }
        }
        Ok(())
    }

    pub fn get_liveview_frame() -> Result<Vec<u8>, String> {
        if !IS_LIVEVIEW_ACTIVE.load(Ordering::SeqCst) {
            let _ = start_liveview();
        }

        unsafe {
            let guard = API.lock().unwrap();
            let api = guard.as_ref().ok_or_else(|| "EDSDK API belum dimuat".to_string())?;
            let cam_guard = CONNECTED_CAMERA.lock().unwrap();
            let camera = cam_guard.as_ref().ok_or_else(|| "Kamera Canon belum terhubung".to_string())?;

            let mut stream: EdsStreamRef = ptr::null_mut();
            let err = (api.CreateMemoryStream)(0, &mut stream);
            if err != EDS_ERR_OK {
                return Err(format!("Gagal membuat memory stream (code: {:#X})", err));
            }

            let mut evf_image: EdsEvfImageRef = ptr::null_mut();
            let err = (api.CreateEvfImageRef)(stream, &mut evf_image);
            if err != EDS_ERR_OK {
                let _ = (api.Release)(stream);
                return Err(format!("Gagal membuat EvfImageRef (code: {:#X})", err));
            }

            let err = (api.DownloadEvfImage)(*camera, evf_image);
            if err != EDS_ERR_OK {
                let _ = (api.Release)(evf_image);
                let _ = (api.Release)(stream);
                return Err(format!("Gagal download liveview frame (code: {:#X})", err));
            }

            let mut data_ptr: *mut c_void = ptr::null_mut();
            let mut data_len: u64 = 0;
            let _ = (api.GetPointer)(stream, &mut data_ptr);
            let _ = (api.GetLength)(stream, &mut data_len);

            if data_ptr.is_null() || data_len == 0 {
                let _ = (api.Release)(evf_image);
                let _ = (api.Release)(stream);
                return Err("Frame liveview kosong".into());
            }

            let slice = std::slice::from_raw_parts(data_ptr as *const u8, data_len as usize);
            let bytes = slice.to_vec();

            let _ = (api.Release)(evf_image);
            let _ = (api.Release)(stream);

            Ok(bytes)
        }
    }

    pub fn capture_photo() -> Result<Vec<u8>, String> {
        let (tx, rx): (Sender<Vec<u8>>, Receiver<Vec<u8>>) = channel();
        {
            let mut s_guard = CAPTURE_SENDER.lock().unwrap();
            *s_guard = Some(tx);
        }

        unsafe {
            let guard = API.lock().unwrap();
            let api = guard.as_ref().ok_or_else(|| "EDSDK API belum dimuat".to_string())?;
            let cam_guard = CONNECTED_CAMERA.lock().unwrap();
            let camera = cam_guard.as_ref().ok_or_else(|| "Kamera Canon belum terhubung".to_string())?;

            // Kirim perintah jepret
            let err = (api.SendCommand)(*camera, kEdsCameraCommand_TakePicture, 0);
            if err != EDS_ERR_OK {
                // Fallback: coba tekan shutter button completely
                let _ = (api.SendCommand)(*camera, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_Completely);
                let _ = (api.SendCommand)(*camera, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_OFF);
            }
        }

        // Tunggu foto ditransfer dari kamera dengan timeout 15 detik
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(15) {
            if let Ok(bytes) = rx.recv_timeout(Duration::from_millis(50)) {
                return Ok(bytes);
            }
            // Pompa event Windows message / EDSDK event
            unsafe {
                let guard = API.lock().unwrap();
                if let Some(ref api) = *guard {
                    if let Some(get_event) = api.GetEvent {
                        let _ = get_event();
                    }
                }
                drop(guard);

                extern "system" {
                    fn PeekMessageW(
                        lpMsg: *mut c_void,
                        hWnd: *mut c_void,
                        wMsgFilterMin: u32,
                        wMsgFilterMax: u32,
                        wRemoveMsg: u32,
                    ) -> i32;
                    fn TranslateMessage(lpMsg: *const c_void) -> i32;
                    fn DispatchMessageW(lpMsg: *const c_void) -> isize;
                }
                let mut msg = [0u8; 48];
                while PeekMessageW(msg.as_mut_ptr() as *mut c_void, ptr::null_mut(), 0, 0, 1) != 0 {
                    TranslateMessage(msg.as_ptr() as *const c_void);
                    DispatchMessageW(msg.as_ptr() as *const c_void);
                }
            }
        }

        Err("Timeout: Kamera mengambil foto tetapi transfer data gambar melebihi batas waktu 15 detik.".into())
    }
}
