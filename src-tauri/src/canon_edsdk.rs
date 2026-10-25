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

    pub async fn detect_cameras() -> Result<Vec<EdsCameraDevice>, String> {
        Ok(Vec::new())
    }

    pub async fn connect() -> Result<(String, String), String> {
        Err("Canon EDSDK hanya tersedia pada platform Windows.".into())
    }

    pub async fn disconnect() -> Result<(), String> {
        Ok(())
    }

    pub async fn is_connected() -> bool {
        false
    }

    pub async fn start_liveview() -> Result<(), String> {
        Err("Canon EDSDK hanya tersedia pada platform Windows.".into())
    }

    pub async fn get_liveview_frame() -> Result<Vec<u8>, String> {
        Err("Canon EDSDK hanya tersedia pada platform Windows.".into())
    }

    pub async fn stop_liveview() -> Result<(), String> {
        Ok(())
    }

    pub async fn capture_photo() -> Result<Vec<u8>, String> {
        Err("Canon EDSDK hanya tersedia pada platform Windows.".into())
    }
}

#[cfg(target_os = "windows")]
pub mod platform {
    use super::*;
    use std::ffi::{c_char, c_void, CStr, CString};
    use std::ptr;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc::{channel, Sender};
    use std::sync::Mutex;
    use std::time::{Duration, Instant};

    // EDSDK Constants
    pub const EDS_ERR_OK: u32 = 0x00000000;
    pub const EDS_ERR_DEVICE_BUSY: u32 = 0x00000082;
    pub const EDS_ERR_OBJECT_NOTREADY: u32 = 0x0000A102;

    pub const kEdsPropID_SaveTo: u32 = 0x0000000b;
    pub const kEdsSaveTo_Host: u32 = 2;

    pub const kEdsPropID_Evf_OutputDevice: u32 = 0x00000500;
    pub const kEdsPropID_Evf_Mode: u32 = 0x00000501;
    pub const kEdsEvfOutputDevice_TFT: u32 = 1;
    pub const kEdsEvfOutputDevice_PC: u32 = 2;

    pub const kEdsCameraCommand_TakePicture: u32 = 0x00000000;
    pub const kEdsCameraCommand_PressShutterButton: u32 = 0x00000004;
    pub const kEdsCameraCommand_ShutterButton_OFF: i32 = 0x00000000;
    pub const kEdsCameraCommand_ShutterButton_Completely: i32 = 0x00000003;

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

    type EdsCameraAddedHandler = unsafe extern "system" fn(inContext: *mut c_void) -> EdsError;

    type EdsStateEventHandler = unsafe extern "system" fn(
        inEvent: u32,
        inParameter: u32,
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
    type EdsSetCameraAddedHandlerFn = unsafe extern "system" fn(
        Option<EdsCameraAddedHandler>,
        *mut c_void,
    ) -> EdsError;
    type EdsSetCameraStateEventHandlerFn = unsafe extern "system" fn(
        EdsCameraRef,
        u32,
        Option<EdsStateEventHandler>,
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
        pub SetCameraAddedHandler: Option<EdsSetCameraAddedHandlerFn>,
        pub SetCameraStateEventHandler: Option<EdsSetCameraStateEventHandlerFn>,
        pub GetDirectoryItemInfo: EdsGetDirectoryItemInfoFn,
        pub Download: EdsDownloadFn,
        pub DownloadComplete: EdsDownloadCompleteFn,
        pub GetEvent: Option<EdsGetEventFn>,
    }

    unsafe impl Send for EdsdkApi {}
    unsafe impl Sync for EdsdkApi {}

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

    unsafe fn load_api_from_dll(dll_path: &PathBuf) -> Result<EdsdkApi, String> {
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
            SetCameraAddedHandler: {
                let c_name = CString::new("EdsSetCameraAddedHandler").unwrap();
                let proc = GetProcAddress(h_module, c_name.as_ptr());
                if !proc.is_null() {
                    Some(std::mem::transmute::<*mut c_void, EdsSetCameraAddedHandlerFn>(proc))
                } else {
                    None
                }
            },
            SetCameraStateEventHandler: {
                let c_name = CString::new("EdsSetCameraStateEventHandler").unwrap();
                let proc = GetProcAddress(h_module, c_name.as_ptr());
                if !proc.is_null() {
                    Some(std::mem::transmute::<*mut c_void, EdsSetCameraStateEventHandlerFn>(proc))
                } else {
                    None
                }
            },
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

        log::info!("[Canon-EDSDK] EDSDK.dll berhasil dimuat dari {}", dll_path.display());
        Ok(api)
    }

    // Commands to send to the dedicated STA worker thread
    enum WorkerCmd {
        DetectCameras {
            reply: tokio::sync::oneshot::Sender<Result<Vec<EdsCameraDevice>, String>>,
        },
        Connect {
            reply: tokio::sync::oneshot::Sender<Result<(String, String), String>>,
        },
        Disconnect {
            reply: tokio::sync::oneshot::Sender<Result<(), String>>,
        },
        IsConnected {
            reply: tokio::sync::oneshot::Sender<bool>,
        },
        StartLiveview {
            reply: tokio::sync::oneshot::Sender<Result<(), String>>,
        },
        StopLiveview {
            reply: tokio::sync::oneshot::Sender<Result<(), String>>,
        },
        GetLiveviewFrame {
            reply: tokio::sync::oneshot::Sender<Result<Vec<u8>, String>>,
        },
        CapturePhoto {
            reply: tokio::sync::oneshot::Sender<Result<Vec<u8>, String>>,
        },
    }

    static WORKER_TX: Mutex<Option<Sender<WorkerCmd>>> = Mutex::new(None);
    static CAPTURE_TRANSFER_SENDER: Mutex<Option<tokio::sync::oneshot::Sender<Vec<u8>>>> = Mutex::new(None);
    static LIVEVIEW_ACTIVE_FLAG: AtomicBool = AtomicBool::new(false);

    unsafe extern "system" fn handle_camera_added(_in_context: *mut c_void) -> EdsError {
        log::info!("[Canon-EDSDK] Event: Kamera baru terdeteksi via USB (CameraAdded).");
        EDS_ERR_OK
    }

    unsafe extern "system" fn handle_state_event(
        in_event: u32,
        in_parameter: u32,
        _in_context: *mut c_void,
    ) -> EdsError {
        log::debug!("[Canon-EDSDK] State Event diterima: {:#X}, param: {:#X}", in_event, in_parameter);
        if in_event == 0x00000301 {
            log::warn!("[Canon-EDSDK] Kamera telah dimatikan atau kabel USB dicabut (kEdsStateEvent_Shutdown).");
            LIVEVIEW_ACTIVE_FLAG.store(false, Ordering::SeqCst);
        }
        EDS_ERR_OK
    }

    unsafe extern "system" fn handle_object_event(
        in_event: u32,
        in_ref: EdsBaseRef,
        _in_context: *mut c_void,
    ) -> EdsError {
        if in_event == kEdsObjectEvent_DirItemRequestTransfer || in_event == kEdsObjectEvent_DirItemCreated {
            let mut sender_guard = CAPTURE_TRANSFER_SENDER.lock().unwrap();
            if sender_guard.is_some() {
                // Read and download the item
                if let Some(dll_path) = find_edsdk_dll() {
                    if let Ok(api) = load_api_from_dll(&dll_path) {
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
                                        let bytes = std::slice::from_raw_parts(data_ptr as *const u8, data_len as usize).to_vec();
                                        if let Some(sender) = sender_guard.take() {
                                            let _ = sender.send(bytes);
                                        }
                                    }
                                }
                                (api.Release)(stream);
                            }
                        }
                    }
                }
            }
            // Release the ref
            let _ = in_ref;
        }
        EDS_ERR_OK
    }

    fn ensure_worker_started() -> Result<Sender<WorkerCmd>, String> {
        let mut guard = WORKER_TX.lock().unwrap();
        if let Some(ref tx) = *guard {
            return Ok(tx.clone());
        }

        let dll_path = find_edsdk_dll().ok_or_else(|| "File EDSDK.dll tidak ditemukan pada sistem.".to_string())?;

        let (tx, rx) = channel::<WorkerCmd>();
        *guard = Some(tx.clone());

        std::thread::Builder::new()
            .name("canon-edsdk-worker".to_string())
            .spawn(move || {
                worker_thread_main(dll_path, rx);
            })
            .map_err(|e| format!("Gagal membuat thread pekerja Canon EDSDK: {}", e))?;

        Ok(tx)
    }

    fn worker_thread_main(dll_path: PathBuf, rx: std::sync::mpsc::Receiver<WorkerCmd>) {
        extern "system" {
            fn CoInitializeEx(pvReserved: *mut c_void, dwCoInit: u32) -> i32;
            fn CoUninitialize();
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

        const COINIT_APARTMENTTHREADED: u32 = 0x2;
        unsafe {
            let hr = CoInitializeEx(ptr::null_mut(), COINIT_APARTMENTTHREADED);
            log::info!("[Canon-Worker] CoInitializeEx STA result: {:#X}", hr);
        }

        let api = match unsafe { load_api_from_dll(&dll_path) } {
            Ok(a) => a,
            Err(e) => {
                log::error!("[Canon-Worker] Gagal inisialisasi API: {}", e);
                unsafe { CoUninitialize(); }
                return;
            }
        };

        let err = unsafe { (api.InitializeSDK)() };
        if err != EDS_ERR_OK && err != 0x00000001 {
            log::error!("[Canon-Worker] InitializeSDK gagal: {:#X}", err);
        } else {
            log::info!("[Canon-Worker] InitializeSDK berhasil pada dedicated STA thread!");
        }

        if let Some(set_added) = api.SetCameraAddedHandler {
            unsafe { let _ = set_added(Some(handle_camera_added), ptr::null_mut()); }
        }

        let mut camera: EdsCameraRef = ptr::null_mut();
        let mut last_liveview_frame: Option<Vec<u8>> = None;

        let pump_messages = || {
            unsafe {
                let mut msg = [0u8; 48];
                while PeekMessageW(msg.as_mut_ptr() as *mut c_void, ptr::null_mut(), 0, 0, 1) != 0 {
                    TranslateMessage(msg.as_ptr() as *const c_void);
                    DispatchMessageW(msg.as_ptr() as *const c_void);
                }
                if let Some(get_event) = api.GetEvent {
                    let _ = get_event();
                }
            }
        };

        loop {
            pump_messages();

            match rx.recv_timeout(Duration::from_millis(15)) {
                Ok(cmd) => match cmd {
                    WorkerCmd::IsConnected { reply } => {
                        let _ = reply.send(!camera.is_null());
                    }
                    WorkerCmd::DetectCameras { reply } => {
                        unsafe {
                            let mut camera_list: EdsCameraListRef = ptr::null_mut();
                            let mut err = (api.GetCameraList)(&mut camera_list);
                            let mut count: u32 = 0;
                            if err == EDS_ERR_OK && !camera_list.is_null() {
                                let _ = (api.GetChildCount)(camera_list, &mut count);
                            }

                            if count == 0 {
                                if !camera_list.is_null() {
                                    (api.Release)(camera_list);
                                    camera_list = ptr::null_mut();
                                }
                                let _ = (api.TerminateSDK)();
                                std::thread::sleep(Duration::from_millis(200));
                                let _ = (api.InitializeSDK)();
                                err = (api.GetCameraList)(&mut camera_list);
                                if err == EDS_ERR_OK && !camera_list.is_null() {
                                    let _ = (api.GetChildCount)(camera_list, &mut count);
                                }
                            }

                            let mut detected = Vec::new();
                            if !camera_list.is_null() {
                                for i in 0..count {
                                    let mut cam_item: EdsCameraRef = ptr::null_mut();
                                    if (api.GetChildAtIndex)(camera_list, i as i32, &mut cam_item) == EDS_ERR_OK {
                                        let mut dev_info: EdsDeviceInfo = std::mem::zeroed();
                                        if (api.GetDeviceInfo)(cam_item, &mut dev_info) == EDS_ERR_OK {
                                            let desc = CStr::from_ptr(dev_info.szDeviceDescription.as_ptr()).to_string_lossy().to_string();
                                            let port = CStr::from_ptr(dev_info.szPortName.as_ptr()).to_string_lossy().to_string();
                                            detected.push(EdsCameraDevice {
                                                model: if desc.is_empty() { "Canon EOS Digital Camera".to_string() } else { desc },
                                                port: if port.is_empty() { format!("USB-Port-{}", i + 1) } else { port },
                                            });
                                        }
                                        (api.Release)(cam_item);
                                    }
                                }
                                (api.Release)(camera_list);
                            }
                            let _ = reply.send(Ok(detected));
                        }
                    }
                    WorkerCmd::Connect { reply } => {
                        unsafe {
                            if !camera.is_null() {
                                log::info!("[Canon-Worker] Menutup sesi kamera sebelumnya...");
                                let _ = (api.CloseSession)(camera);
                                let _ = (api.Release)(camera);
                                camera = ptr::null_mut();
                            }
                            LIVEVIEW_ACTIVE_FLAG.store(false, Ordering::SeqCst);
                            last_liveview_frame = None;

                            let mut camera_list: EdsCameraListRef = ptr::null_mut();
                            let mut err = (api.GetCameraList)(&mut camera_list);
                            let mut count: u32 = 0;
                            if err == EDS_ERR_OK && !camera_list.is_null() {
                                let _ = (api.GetChildCount)(camera_list, &mut count);
                            }

                            if count == 0 {
                                if !camera_list.is_null() {
                                    (api.Release)(camera_list);
                                    camera_list = ptr::null_mut();
                                }
                                log::info!("[Canon-Worker] Merefresh PnP EDSDK...");
                                let _ = (api.TerminateSDK)();
                                std::thread::sleep(Duration::from_millis(300));
                                let _ = (api.InitializeSDK)();
                                err = (api.GetCameraList)(&mut camera_list);
                                if err == EDS_ERR_OK && !camera_list.is_null() {
                                    let _ = (api.GetChildCount)(camera_list, &mut count);
                                }
                            }

                            if count == 0 || camera_list.is_null() {
                                if !camera_list.is_null() {
                                    (api.Release)(camera_list);
                                }
                                let _ = reply.send(Err("Tidak ada kamera Canon yang terdeteksi via USB. Pastikan kabel terhubung dan kamera menyala.".into()));
                                continue;
                            }

                            let mut cam_target: EdsCameraRef = ptr::null_mut();
                            let err = (api.GetChildAtIndex)(camera_list, 0, &mut cam_target);
                            (api.Release)(camera_list);
                            if err != EDS_ERR_OK || cam_target.is_null() {
                                let _ = reply.send(Err("Gagal mendapatkan objek kamera Canon.".into()));
                                continue;
                            }

                            let mut dev_info: EdsDeviceInfo = std::mem::zeroed();
                            let _ = (api.GetDeviceInfo)(cam_target, &mut dev_info);
                            let model = CStr::from_ptr(dev_info.szDeviceDescription.as_ptr()).to_string_lossy().to_string();
                            let port = CStr::from_ptr(dev_info.szPortName.as_ptr()).to_string_lossy().to_string();

                            // Pasang handler sebelum buka sesi
                            let _ = (api.SetObjectEventHandler)(cam_target, kEdsObjectEvent_All, Some(handle_object_event), ptr::null_mut());
                            if let Some(set_state) = api.SetCameraStateEventHandler {
                                let _ = set_state(cam_target, 0x00000300 /* kEdsStateEvent_All */, Some(handle_state_event), ptr::null_mut());
                            }

                            // Buka sesi
                            let mut session_err = (api.OpenSession)(cam_target);
                            if session_err != EDS_ERR_OK {
                                for attempt in 1..=5 {
                                    log::warn!("[Canon-Worker] OpenSession percobaan {} gagal ({:#X}). Mencoba lagi...", attempt, session_err);
                                    std::thread::sleep(Duration::from_millis(250));
                                    pump_messages();
                                    session_err = (api.OpenSession)(cam_target);
                                    if session_err == EDS_ERR_OK {
                                        break;
                                    }
                                }
                            }

                            if session_err != EDS_ERR_OK {
                                (api.Release)(cam_target);
                                if session_err == 0x00008D01 {
                                    let _ = reply.send(Err("Port kamera sedang digunakan aplikasi lain (misal: Canon EOS Utility atau Boothlab di background). Harap tutup aplikasi tersebut terlebih dahulu.".into()));
                                } else if session_err == 0x00000082 {
                                    let _ = reply.send(Err("Kamera Canon sedang sibuk (Device Busy). Pastikan mode dial kamera berada di M (Manual) atau P (Program).".into()));
                                } else {
                                    let _ = reply.send(Err(format!("Gagal membuka sesi ke kamera Canon (code: {:#X}). Pastikan software EOS Utility ditutup dan kamera dalam mode M/P.", session_err)));
                                }
                                continue;
                            }

                            // Set SaveTo Host
                            let save_to: u32 = kEdsSaveTo_Host;
                            let _ = (api.SetPropertyData)(cam_target, kEdsPropID_SaveTo, 0, 4, &save_to as *const u32 as *const c_void);

                            let capacity = EdsCapacity {
                                numberOfFreeClusters: 0x7FFFFFFF,
                                bytesPerSector: 4096,
                                reset: 1,
                            };
                            let _ = (api.SetCapacity)(cam_target, capacity);

                            camera = cam_target;
                            log::info!("[Canon-Worker] Terhubung ke: {} (Port: {})", model, port);
                            let _ = reply.send(Ok((model, port)));
                        }
                    }
                    WorkerCmd::Disconnect => {
                        unsafe {
                            if !camera.is_null() {
                                let _ = (api.CloseSession)(camera);
                                let _ = (api.Release)(camera);
                                camera = ptr::null_mut();
                            }
                            LIVEVIEW_ACTIVE_FLAG.store(false, Ordering::SeqCst);
                            last_liveview_frame = None;
                        }
                        let _ = reply.send(Ok(()));
                    }
                    WorkerCmd::StartLiveview { reply } => {
                        log::info!("[Canon-Worker] Menjalankan start_liveview...");
                        if camera.is_null() {
                            let _ = reply.send(Err("Kamera belum terhubung".into()));
                            continue;
                        }

                        unsafe {
                            // 1. Coba aktifkan Liveview mode jika didukung
                            let mode: u32 = 1;
                            let _ = (api.SetPropertyData)(camera, kEdsPropID_Evf_Mode, 0, 4, &mode as *const u32 as *const c_void);

                            // 2. Set output device ke PC + TFT (3) untuk mirrorless seperti EOS R100
                            let mut device: u32 = 0;
                            let get_err = (api.GetPropertyData)(camera, kEdsPropID_Evf_OutputDevice, 0, 4, &mut device as *mut u32 as *mut c_void);
                            if get_err == EDS_ERR_OK {
                                device |= kEdsEvfOutputDevice_PC;
                            } else {
                                device = kEdsEvfOutputDevice_PC | kEdsEvfOutputDevice_TFT;
                            }

                            if device == 0 || device == kEdsEvfOutputDevice_PC {
                                device = kEdsEvfOutputDevice_PC | kEdsEvfOutputDevice_TFT; // 3
                            }

                            let mut err = (api.SetPropertyData)(camera, kEdsPropID_Evf_OutputDevice, 0, 4, &device as *const u32 as *const c_void);
                            if err != EDS_ERR_OK {
                                for attempt in 1..=6 {
                                    std::thread::sleep(Duration::from_millis(150));
                                    pump_messages();
                                    err = (api.SetPropertyData)(camera, kEdsPropID_Evf_OutputDevice, 0, 4, &device as *const u32 as *const c_void);
                                    if err == EDS_ERR_OK {
                                        break;
                                    }
                                    log::debug!("[Canon-Worker] Retry set EVF OutputDevice percobaan {} (code: {:#X})", attempt, err);
                                }
                            }

                            if err != EDS_ERR_OK {
                                for alt_val in [3u32, 2u32] {
                                    err = (api.SetPropertyData)(camera, kEdsPropID_Evf_OutputDevice, 0, 4, &alt_val as *const u32 as *const c_void);
                                    if err == EDS_ERR_OK {
                                        break;
                                    }
                                }
                            }

                            if err == EDS_ERR_OK {
                                LIVEVIEW_ACTIVE_FLAG.store(true, Ordering::SeqCst);
                                log::info!("[Canon-Worker] Live View AKTIF!");
                                let _ = reply.send(Ok(()));
                            } else {
                                log::error!("[Canon-Worker] Gagal mengaktifkan EVF output PC (code: {:#X})", err);
                                let _ = reply.send(Err(format!("Gagal mengaktifkan EVF output PC (code: {:#X}). Pastikan mode kamera Manual (M) atau Program (P) dan bukan mode Video.", err)));
                            }
                        }
                    }
                    WorkerCmd::StopLiveview { reply } => {
                        LIVEVIEW_ACTIVE_FLAG.store(false, Ordering::SeqCst);
                        if !camera.is_null() {
                            unsafe {
                                let mut device: u32 = 0;
                                if (api.GetPropertyData)(camera, kEdsPropID_Evf_OutputDevice, 0, 4, &mut device as *mut u32 as *mut c_void) == EDS_ERR_OK {
                                    device &= !kEdsEvfOutputDevice_PC;
                                    let _ = (api.SetPropertyData)(camera, kEdsPropID_Evf_OutputDevice, 0, 4, &device as *const u32 as *const c_void);
                                } else {
                                    let off: u32 = kEdsEvfOutputDevice_TFT;
                                    let _ = (api.SetPropertyData)(camera, kEdsPropID_Evf_OutputDevice, 0, 4, &off as *const u32 as *const c_void);
                                }
                            }
                        }
                        last_liveview_frame = None;
                        let _ = reply.send(Ok(()));
                    }
                    WorkerCmd::GetLiveviewFrame { reply } => {
                        if camera.is_null() {
                            let _ = reply.send(Err("Kamera belum terhubung".into()));
                            continue;
                        }

                        if !LIVEVIEW_ACTIVE_FLAG.load(Ordering::SeqCst) {
                            // Coba aktifkan
                            unsafe {
                                let device: u32 = kEdsEvfOutputDevice_PC | kEdsEvfOutputDevice_TFT;
                                let _ = (api.SetPropertyData)(camera, kEdsPropID_Evf_OutputDevice, 0, 4, &device as *const u32 as *const c_void);
                                LIVEVIEW_ACTIVE_FLAG.store(true, Ordering::SeqCst);
                            }
                        }

                        unsafe {
                            let mut stream: EdsStreamRef = ptr::null_mut();
                            let err = (api.CreateMemoryStream)(0, &mut stream);
                            if err != EDS_ERR_OK {
                                let _ = reply.send(Err(format!("Gagal membuat memory stream (code: {:#X})", err)));
                                continue;
                            }

                            let mut evf_image: EdsEvfImageRef = ptr::null_mut();
                            let err = (api.CreateEvfImageRef)(stream, &mut evf_image);
                            if err != EDS_ERR_OK {
                                let _ = (api.Release)(stream);
                                let _ = reply.send(Err(format!("Gagal membuat EvfImageRef (code: {:#X})", err)));
                                continue;
                            }

                            let mut download_err = (api.DownloadEvfImage)(camera, evf_image);
                            if download_err == EDS_ERR_OBJECT_NOTREADY || download_err == EDS_ERR_DEVICE_BUSY || download_err == 0x0000008E {
                                for _ in 0..5 {
                                    std::thread::sleep(Duration::from_millis(30));
                                    pump_messages();
                                    download_err = (api.DownloadEvfImage)(camera, evf_image);
                                    if download_err == EDS_ERR_OK {
                                        break;
                                    }
                                }
                            }

                            if download_err == EDS_ERR_OK {
                                let mut data_ptr: *mut c_void = ptr::null_mut();
                                let mut data_len: u64 = 0;
                                let _ = (api.GetPointer)(stream, &mut data_ptr);
                                let _ = (api.GetLength)(stream, &mut data_len);

                                if !data_ptr.is_null() && data_len > 0 {
                                    let bytes = std::slice::from_raw_parts(data_ptr as *const u8, data_len as usize).to_vec();
                                    last_liveview_frame = Some(bytes.clone());
                                    let _ = reply.send(Ok(bytes));
                                } else if let Some(ref cached) = last_liveview_frame {
                                    let _ = reply.send(Ok(cached.clone()));
                                } else {
                                    let _ = reply.send(Err("Frame liveview kosong".into()));
                                }
                            } else if let Some(ref cached) = last_liveview_frame {
                                let _ = reply.send(Ok(cached.clone()));
                            } else {
                                let _ = reply.send(Err(format!("Gagal download liveview frame (code: {:#X})", download_err)));
                            }

                            let _ = (api.Release)(evf_image);
                            let _ = (api.Release)(stream);
                        }
                    }
                    WorkerCmd::CapturePhoto { reply } => {
                        if camera.is_null() {
                            let _ = reply.send(Err("Kamera belum terhubung".into()));
                            continue;
                        }

                        let (cap_tx, cap_rx) = tokio::sync::oneshot::channel::<Vec<u8>>();
                        {
                            let mut sender_guard = CAPTURE_TRANSFER_SENDER.lock().unwrap();
                            *sender_guard = Some(cap_tx);
                        }

                        unsafe {
                            let err = (api.SendCommand)(camera, kEdsCameraCommand_TakePicture, 0);
                            if err != EDS_ERR_OK {
                                let _ = (api.SendCommand)(camera, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_Completely);
                                let _ = (api.SendCommand)(camera, kEdsCameraCommand_PressShutterButton, kEdsCameraCommand_ShutterButton_OFF);
                            }
                        }

                        // Wait on this STA thread pumping messages for up to 15s
                        let start = Instant::now();
                        let mut photo_data = None;
                        let mut cap_rx_opt = Some(cap_rx);

                        while start.elapsed() < Duration::from_secs(15) {
                            pump_messages();
                            if let Some(ref mut rx_c) = cap_rx_opt {
                                match rx_c.try_recv() {
                                    Ok(bytes) => {
                                        photo_data = Some(bytes);
                                        break;
                                    }
                                    Err(tokio::sync::oneshot::error::TryRecvError::Empty) => {
                                        std::thread::sleep(Duration::from_millis(30));
                                    }
                                    Err(tokio::sync::oneshot::error::TryRecvError::Closed) => {
                                        break;
                                    }
                                }
                            }
                        }

                        if let Some(bytes) = photo_data {
                            let _ = reply.send(Ok(bytes));
                        } else {
                            let _ = reply.send(Err("Timeout: Pengambilan foto melebihi batas waktu 15 detik.".into()));
                        }
                    }
                },
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // Timeout is normal; loop continues pumping messages
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    log::info!("[Canon-Worker] Channel terputus. Menghentikan worker thread.");
                    break;
                }
            }
        }

        unsafe {
            if !camera.is_null() {
                let _ = (api.CloseSession)(camera);
                let _ = (api.Release)(camera);
            }
            let _ = (api.TerminateSDK)();
            CoUninitialize();
        }
    }

    pub fn is_available() -> bool {
        find_edsdk_dll().is_some()
    }

    pub async fn detect_cameras() -> Result<Vec<EdsCameraDevice>, String> {
        let tx = ensure_worker_started()?;
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        tx.send(WorkerCmd::DetectCameras { reply: reply_tx })
            .map_err(|e| e.to_string())?;
        reply_rx.await.map_err(|_| "Worker thread disconnected".to_string())?
    }

    pub async fn connect() -> Result<(String, String), String> {
        let tx = ensure_worker_started()?;
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        tx.send(WorkerCmd::Connect { reply: reply_tx })
            .map_err(|e| e.to_string())?;
        reply_rx.await.map_err(|_| "Worker thread disconnected".to_string())?
    }

    pub async fn disconnect() -> Result<(), String> {
        let tx = ensure_worker_started()?;
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        tx.send(WorkerCmd::Disconnect { reply: reply_tx })
            .map_err(|e| e.to_string())?;
        reply_rx.await.map_err(|_| "Worker thread disconnected".to_string())?
    }

    pub async fn is_connected() -> bool {
        if let Ok(tx) = ensure_worker_started() {
            let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
            if tx.send(WorkerCmd::IsConnected { reply: reply_tx }).is_ok() {
                return reply_rx.await.unwrap_or(false);
            }
        }
        false
    }

    pub async fn start_liveview() -> Result<(), String> {
        let tx = ensure_worker_started()?;
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        tx.send(WorkerCmd::StartLiveview { reply: reply_tx })
            .map_err(|e| e.to_string())?;
        reply_rx.await.map_err(|_| "Worker thread disconnected".to_string())?
    }

    pub async fn stop_liveview() -> Result<(), String> {
        let tx = ensure_worker_started()?;
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        tx.send(WorkerCmd::StopLiveview { reply: reply_tx })
            .map_err(|e| e.to_string())?;
        reply_rx.await.map_err(|_| "Worker thread disconnected".to_string())?
    }

    pub async fn get_liveview_frame() -> Result<Vec<u8>, String> {
        let tx = ensure_worker_started()?;
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        tx.send(WorkerCmd::GetLiveviewFrame { reply: reply_tx })
            .map_err(|e| e.to_string())?;
        reply_rx.await.map_err(|_| "Worker thread disconnected".to_string())?
    }

    pub async fn capture_photo() -> Result<Vec<u8>, String> {
        let tx = ensure_worker_started()?;
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        tx.send(WorkerCmd::CapturePhoto { reply: reply_tx })
            .map_err(|e| e.to_string())?;
        reply_rx.await.map_err(|_| "Worker thread disconnected".to_string())?
    }
}
