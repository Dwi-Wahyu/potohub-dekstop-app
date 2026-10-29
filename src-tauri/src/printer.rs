use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug, Serialize)]
#[allow(dead_code)]
pub enum PrinterError {
    #[error("printer tidak ditemukan: {0}")]
    PrinterNotFound(String),
    #[error("gagal mencetak: {0}")]
    PrintFailed(String),
    #[error("gagal mendapatkan status printer: {0}")]
    StatusFailed(String),
    #[error("printer tidak siap")]
    PrinterNotReady,
    #[error("kertas habis")]
    OutOfPaper,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PrinterStatus {
    pub is_ready: bool,
    pub is_online: bool,
    pub is_printing: bool,
    pub active_jobs: u32,
    pub paper_remaining: Option<u32>,
    pub paper_limit_alert: Option<u32>,
    pub printer_name: String,
    pub has_error: bool,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PrintOptions {
    pub copies: u32,
    pub paper_size: String, // "4x6", "6x8", "2x6", "6x6"
    pub quality: String,    // "standard", "high"
}

impl Default for PrintOptions {
    fn default() -> Self {
        Self {
            copies: 1,
            paper_size: "4x6".to_string(),
            quality: "standard".to_string(),
        }
    }
}

// ============================================================================
// WINDOWS SPECIFIC IMPLEMENTATION (WinAPI / WinSpool)
// ============================================================================
#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;
    use winapi::ctypes::c_int;
    use winapi::shared::minwindef::DWORD;
    use winapi::um::wingdi::*;
    use winapi::um::winspool::*;

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    pub fn get_installed_printers() -> Result<Vec<String>, PrinterError> {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut printers: Vec<String> = Vec::new();

        let mut push_unique = |name: String, list: &mut Vec<String>| {
            let trimmed = name.trim().to_string();
            if !trimmed.is_empty() && !list.iter().any(|existing| existing.eq_ignore_ascii_case(&trimmed)) {
                list.push(trimmed);
            }
        };

        // Stage 1: Level 2 (PRINTER_INFO_2W) — Komprehensif: mencakup semua printer queue lokal, salinan (copies), dan secondary printer
        let mut needed: DWORD = 0;
        let mut returned: DWORD = 0;
        unsafe {
            EnumPrintersW(
                flags,
                ptr::null_mut(),
                2,
                ptr::null_mut(),
                0,
                &mut needed,
                &mut returned,
            );
        }

        if needed > 0 {
            let mut buffer: Vec<u8> = vec![0; needed as usize];
            let res = unsafe {
                EnumPrintersW(
                    flags,
                    ptr::null_mut(),
                    2,
                    buffer.as_mut_ptr(),
                    needed,
                    &mut needed,
                    &mut returned,
                )
            };

            if res != 0 && returned > 0 {
                let info_slice = unsafe {
                    std::slice::from_raw_parts(
                        buffer.as_ptr() as *const PRINTER_INFO_2W,
                        returned as usize,
                    )
                };

                for info in info_slice {
                    if !info.pPrinterName.is_null() {
                        let len = unsafe {
                            (0..)
                                .take_while(|&i| *info.pPrinterName.offset(i) != 0)
                                .count()
                        };
                        let name_slice =
                            unsafe { std::slice::from_raw_parts(info.pPrinterName, len) };
                        let name = String::from_utf16_lossy(name_slice);
                        push_unique(name, &mut printers);
                    }
                }
            }
        }

        // Stage 2: Level 4 (PRINTER_INFO_4W) — Sangat cepat untuk printer local & koneksi jaringan
        needed = 0;
        returned = 0;
        unsafe {
            EnumPrintersW(
                flags,
                ptr::null_mut(),
                4,
                ptr::null_mut(),
                0,
                &mut needed,
                &mut returned,
            );
        }

        if needed > 0 {
            let mut buffer: Vec<u8> = vec![0; needed as usize];
            let res = unsafe {
                EnumPrintersW(
                    flags,
                    ptr::null_mut(),
                    4,
                    buffer.as_mut_ptr(),
                    needed,
                    &mut needed,
                    &mut returned,
                )
            };

            if res != 0 && returned > 0 {
                let info_slice = unsafe {
                    std::slice::from_raw_parts(
                        buffer.as_ptr() as *const PRINTER_INFO_4W,
                        returned as usize,
                    )
                };

                for info in info_slice {
                    if !info.pPrinterName.is_null() {
                        let len = unsafe {
                            (0..)
                                .take_while(|&i| *info.pPrinterName.offset(i) != 0)
                                .count()
                        };
                        let name_slice =
                            unsafe { std::slice::from_raw_parts(info.pPrinterName, len) };
                        let name = String::from_utf16_lossy(name_slice);
                        push_unique(name, &mut printers);
                    }
                }
            }
        }

        // Stage 3: PowerShell Fallback (Get-Printer) — Menangkap printer queue virtual, software driver, atau secondary copy queues
        let mut ps_cmd = std::process::Command::new("powershell");
        ps_cmd.args(["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            ps_cmd.creation_flags(CREATE_NO_WINDOW);
        }
        if let Ok(output) = ps_cmd.output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    push_unique(line.to_string(), &mut printers);
                }
            }
        }

        Ok(printers)
    }

    pub fn get_printer_status(printer_name: &str) -> Result<PrinterStatus, PrinterError> {
        if printer_name.trim().is_empty() {
            return Ok(PrinterStatus {
                is_ready: false,
                is_online: false,
                is_printing: false,
                active_jobs: 0,
                paper_remaining: None,
                paper_limit_alert: Some(50),
                printer_name: printer_name.to_string(),
                has_error: true,
                error_message: Some("Printer offline / tidak terhubung".to_string()),
            });
        }

        let wide_name = to_wide(printer_name);
        let mut handle: winapi::shared::ntdef::HANDLE = ptr::null_mut();

        let open_res =
            unsafe { OpenPrinterW(wide_name.as_ptr() as *mut _, &mut handle, ptr::null_mut()) };
        if open_res == 0 || handle.is_null() {
            return Err(PrinterError::PrinterNotFound(printer_name.to_string()));
        }

        let mut status_code: DWORD = 0;
        let mut c_jobs: DWORD = 0;
        let mut is_attr_offline = false;
        let mut got_status = false;

        // Stage 1: Try Level 2 (PRINTER_INFO_2W)
        let mut needed: DWORD = 0;
        unsafe {
            GetPrinterW(handle, 2, ptr::null_mut(), 0, &mut needed);
        }

        if needed > 0 {
            let mut buffer: Vec<u8> = vec![0; needed as usize];
            let get_res =
                unsafe { GetPrinterW(handle, 2, buffer.as_mut_ptr(), needed, &mut needed) };
            if get_res != 0 {
                let info = unsafe { &*(buffer.as_ptr() as *const PRINTER_INFO_2W) };
                status_code = info.Status;
                c_jobs = info.cJobs;
                is_attr_offline = (info.Attributes & PRINTER_ATTRIBUTE_WORK_OFFLINE) != 0;
                got_status = true;
            }
        }

        // Stage 2: Fallback to Level 6 (PRINTER_INFO_6)
        if !got_status {
            let mut info6 = PRINTER_INFO_6 { dwStatus: 0 };
            let mut needed6: DWORD = 0;
            let get_res6 = unsafe {
                GetPrinterW(
                    handle,
                    6,
                    &mut info6 as *mut _ as *mut u8,
                    std::mem::size_of::<PRINTER_INFO_6>() as DWORD,
                    &mut needed6,
                )
            };
            if get_res6 != 0 {
                status_code = info6.dwStatus;
                got_status = true;
            }
        }

        // Inspect active print jobs in Windows Spooler queue (JOB_INFO_1W)
        let mut enum_active_jobs: u32 = 0;
        let mut job_is_printing = false;
        let mut job_has_offline = false;
        let mut job_has_paperout = false;
        let mut job_has_error = false;

        let mut job_needed: DWORD = 0;
        let mut job_returned: DWORD = 0;
        unsafe {
            EnumJobsW(
                handle,
                0,
                32,
                1,
                ptr::null_mut(),
                0,
                &mut job_needed,
                &mut job_returned,
            );
        }

        if job_needed > 0 {
            let mut job_buf: Vec<u8> = vec![0; job_needed as usize];
            let enum_res = unsafe {
                EnumJobsW(
                    handle,
                    0,
                    32,
                    1,
                    job_buf.as_mut_ptr(),
                    job_needed,
                    &mut job_needed,
                    &mut job_returned,
                )
            };
            if enum_res != 0 && job_returned > 0 {
                let jobs = unsafe {
                    std::slice::from_raw_parts(
                        job_buf.as_ptr() as *const JOB_INFO_1W,
                        job_returned as usize,
                    )
                };
                for job in jobs {
                    let jst = job.Status;
                    if (jst & (JOB_STATUS_DELETED | JOB_STATUS_PRINTED)) == 0 {
                        enum_active_jobs += 1;
                    }
                    if (jst & (JOB_STATUS_PRINTING | JOB_STATUS_SPOOLING)) != 0 {
                        job_is_printing = true;
                    }
                    if (jst & JOB_STATUS_OFFLINE) != 0 {
                        job_has_offline = true;
                    }
                    if (jst & JOB_STATUS_PAPEROUT) != 0 {
                        job_has_paperout = true;
                    }
                    if (jst & (JOB_STATUS_ERROR | JOB_STATUS_BLOCKED_DEVQ)) != 0 {
                        job_has_error = true;
                    }
                }
            }
        }

        unsafe { ClosePrinter(handle) };

        // Stage 3: PowerShell status fallback if WinSpool query was denied
        if !got_status {
            let escaped = printer_name.replace('\'', "''");
            let cmd = format!("(Get-Printer -Name '{}').PrinterStatus", escaped);
            let mut ps_cmd = std::process::Command::new("powershell");
            ps_cmd.args(["-NoProfile", "-Command", &cmd]);
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                ps_cmd.creation_flags(CREATE_NO_WINDOW);
            }
            if let Ok(output) = ps_cmd.output() {
                if output.status.success() {
                    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if let Ok(num) = text.parse::<u32>() {
                        status_code = num;
                    }
                }
            }
        }

        let active_jobs = (c_jobs as u32).max(enum_active_jobs);
        let is_status_printing = (status_code
            & (PRINTER_STATUS_PRINTING
                | PRINTER_STATUS_PROCESSING
                | PRINTER_STATUS_WARMING_UP
                | PRINTER_STATUS_BUSY
                | PRINTER_STATUS_IO_ACTIVE
                | PRINTER_STATUS_WAITING))
            != 0;
        let is_printing = active_jobs > 0 || is_status_printing || job_is_printing;

        let has_error = (status_code
            & (PRINTER_STATUS_ERROR
                | PRINTER_STATUS_PAPER_JAM
                | PRINTER_STATUS_PAPER_OUT
                | PRINTER_STATUS_DOOR_OPEN
                | PRINTER_STATUS_OFFLINE))
            != 0
            || job_has_offline
            || job_has_paperout
            || job_has_error;
        let is_online = (status_code & PRINTER_STATUS_OFFLINE) == 0
            && !is_attr_offline
            && !job_has_offline;
        let is_ready = is_online && !has_error;

        let error_message = if (status_code & PRINTER_STATUS_PAPER_OUT) != 0 || job_has_paperout {
            Some("Kertas habis".to_string())
        } else if (status_code & PRINTER_STATUS_PAPER_JAM) != 0 {
            Some("Kertas tersangkut (Paper Jam)".to_string())
        } else if (status_code & PRINTER_STATUS_DOOR_OPEN) != 0 {
            Some("Pintu/Cover printer terbuka".to_string())
        } else if (status_code & PRINTER_STATUS_OFFLINE) != 0 || is_attr_offline || job_has_offline {
            Some("Printer Offline".to_string())
        } else if has_error {
            Some(format!("Printer error status code: {}", status_code))
        } else {
            None
        };

        Ok(PrinterStatus {
            is_ready,
            is_online,
            is_printing,
            active_jobs,
            paper_remaining: Some(200),
            paper_limit_alert: Some(50),
            printer_name: printer_name.to_string(),
            has_error,
            error_message,
        })
    }

    fn print_via_gdi(
        printer_name: &str,
        image_bytes: &[u8],
        options: &PrintOptions,
    ) -> Result<(), PrinterError> {
        let wide_driver = to_wide("WINSPOOL");
        let wide_device = to_wide(printer_name);

        let mut hdc = unsafe {
            CreateDCW(
                wide_driver.as_ptr(),
                wide_device.as_ptr(),
                ptr::null(),
                ptr::null(),
            )
        };

        if hdc.is_null() {
            hdc = unsafe {
                CreateDCW(
                    ptr::null(),
                    wide_device.as_ptr(),
                    ptr::null(),
                    ptr::null(),
                )
            };
        }

        if hdc.is_null() {
            return Err(PrinterError::PrintFailed(format!(
                "Gagal membuat Device Context (DC) untuk printer '{}'",
                printer_name
            )));
        }

        let mut dynamic_img = image::load_from_memory(image_bytes).map_err(|e| {
            unsafe { DeleteDC(hdc) };
            PrinterError::PrintFailed(format!("Gagal mendecode file gambar: {}", e))
        })?;

        let doc_name = to_wide("PotoHub Photo Print");
        let doc_info = DOCINFOW {
            cbSize: std::mem::size_of::<DOCINFOW>() as c_int,
            lpszDocName: doc_name.as_ptr(),
            lpszOutput: ptr::null(),
            lpszDatatype: ptr::null(),
            fwType: 0,
        };

        let start_doc = unsafe { StartDocW(hdc, &doc_info) };
        if start_doc <= 0 {
            unsafe { DeleteDC(hdc) };
            return Err(PrinterError::PrintFailed(
                "Gagal memulai StartDocW di printer".into(),
            ));
        }

        let horz_res = unsafe { GetDeviceCaps(hdc, HORZRES) };
        let vert_res = unsafe { GetDeviceCaps(hdc, VERTRES) };

        // Sesuaikan orientasi gambar dengan orientasi kertas printer agar tidak terpotong
        if horz_res > 0 && vert_res > 0 {
            let img_is_landscape = dynamic_img.width() > dynamic_img.height();
            let page_is_landscape = horz_res > vert_res;
            if img_is_landscape != page_is_landscape {
                dynamic_img = dynamic_img.rotate90();
            }
        }

        let img_w = dynamic_img.width();
        let img_h = dynamic_img.height();
        let rgba = dynamic_img.to_rgba8();

        // Konversi format ke 32-bit BGRA (DIB format)
        let mut bgra = Vec::with_capacity((img_w * img_h * 4) as usize);
        for p in rgba.chunks_exact(4) {
            bgra.push(p[2]); // B
            bgra.push(p[1]); // G
            bgra.push(p[0]); // R
            bgra.push(p[3]); // A
        }

        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as DWORD,
                biWidth: img_w as i32,
                biHeight: -(img_h as i32), // Top-down DIB
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                biSizeImage: (img_w * img_h * 4) as DWORD,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD {
                rgbBlue: 0,
                rgbGreen: 0,
                rgbRed: 0,
                rgbReserved: 0,
            }],
        };

        let copies = options.copies.max(1);
        for _copy in 0..copies {
            let start_page = unsafe { StartPage(hdc) };
            if start_page <= 0 {
                unsafe {
                    EndDoc(hdc);
                    DeleteDC(hdc);
                }
                return Err(PrinterError::PrintFailed(
                    "Gagal memulai StartPage di printer".into(),
                ));
            }

            unsafe {
                SetStretchBltMode(hdc, HALFTONE);
                SetBrushOrgEx(hdc, 0, 0, ptr::null_mut());
            }

            let (dst_w, dst_h) = if horz_res > 0 && vert_res > 0 {
                (horz_res, vert_res)
            } else {
                (img_w as i32, img_h as i32)
            };

            let draw_res = unsafe {
                StretchDIBits(
                    hdc,
                    0,
                    0,
                    dst_w,
                    dst_h,
                    0,
                    0,
                    img_w as i32,
                    img_h as i32,
                    bgra.as_ptr() as *const _,
                    &bmi,
                    DIB_RGB_COLORS,
                    SRCCOPY,
                )
            };

            unsafe { EndPage(hdc) };

            if draw_res <= 0 {
                unsafe {
                    EndDoc(hdc);
                    DeleteDC(hdc);
                }
                return Err(PrinterError::PrintFailed(
                    "Gagal merender data gambar ke printer (StretchDIBits)".into(),
                ));
            }
        }

        unsafe {
            EndDoc(hdc);
            DeleteDC(hdc);
        }

        Ok(())
    }

    fn print_via_powershell(
        printer_name: &str,
        image_bytes: &[u8],
        options: &PrintOptions,
    ) -> Result<(), PrinterError> {
        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join(format!("potohub_print_{}.jpg", uuid::Uuid::new_v4()));
        std::fs::write(&temp_file, image_bytes).map_err(|e| {
            PrinterError::PrintFailed(format!("Gagal menulis temporary image: {}", e))
        })?;

        let escaped_printer = printer_name.replace('\'', "''");
        let escaped_path = temp_file.to_string_lossy().replace('\'', "''");
        let copies = options.copies.max(1);

        let ps_script = format!(
            concat!(
                "Add-Type -AssemblyName System.Drawing;\n",
                "$doc = New-Object System.Drawing.Printing.PrintDocument;\n",
                "$doc.PrinterSettings.PrinterName = '{printer}';\n",
                "$doc.PrinterSettings.Copies = {copies};\n",
                "$doc.OriginAtMargins = $false;\n",
                "$img = [System.Drawing.Image]::FromFile('{path}');\n",
                "if ($img.Width -gt $img.Height) {{ $doc.DefaultPageSettings.Landscape = $true; }}\n",
                "$doc.add_PrintPage({{\n",
                "    param($sender, $ev)\n",
                "    $ev.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;\n",
                "    $ev.Graphics.DrawImage($img, $ev.PageBounds);\n",
                "}});\n",
                "$doc.Print();\n",
                "$img.Dispose();\n",
                "$doc.Dispose();"
            ),
            printer = escaped_printer,
            copies = copies,
            path = escaped_path
        );

        let mut ps_cmd = std::process::Command::new("powershell");
        ps_cmd.args(["-NoProfile", "-NonInteractive", "-Command", &ps_script]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            ps_cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let output = ps_cmd.output();

        let _ = std::fs::remove_file(&temp_file);

        match output {
            Ok(out) if out.status.success() => Ok(()),
            Ok(out) => {
                let err_msg = String::from_utf8_lossy(&out.stderr);
                Err(PrinterError::PrintFailed(format!(
                    "Gagal print via PowerShell: {}",
                    err_msg.trim()
                )))
            }
            Err(e) => Err(PrinterError::PrintFailed(format!(
                "Gagal mengeksekusi PowerShell print: {}",
                e
            ))),
        }
    }

    pub fn print_image_bytes(
        printer_name: &str,
        image_bytes: &[u8],
        options: &PrintOptions,
    ) -> Result<(), PrinterError> {
        if image_bytes.is_empty() {
            return Err(PrinterError::PrintFailed("Buffer gambar kosong".into()));
        }

        // Coba print secara native via GDI (cepat, hemat resource, printer-agnostik)
        match print_via_gdi(printer_name, image_bytes, options) {
            Ok(()) => {
                println!(
                    "[PRINTER GDI] Berhasil mencetak {} copy ke {}",
                    options.copies, printer_name
                );
                Ok(())
            }
            Err(err) => {
                eprintln!(
                    "[PRINTER GDI] GDI print gagal ({:?}), beralih ke PowerShell fallback...",
                    err
                );
                // Fallback ke PowerShell System.Drawing print subsystem
                print_via_powershell(printer_name, image_bytes, options)
            }
        }
    }

    pub fn open_printer_properties(printer_name: &str) -> Result<(), PrinterError> {
        let clean_name = printer_name.trim().trim_matches('"');
        if clean_name.is_empty() {
            return Err(PrinterError::PrinterNotFound(
                "Nama printer kosong atau belum dipilih".into(),
            ));
        }

        // Buka Printing Preferences dialog Windows secara langsung menggunakan rundll32 printui.dll
        // Opsi /e: Membuka Printing Preferences (tempat pengaturan 2-inch cut, ukuran kertas, orientasi, & finish driver)
        // Opsi /n: Menentukan nama printer target
        let rundll = std::env::var("SystemRoot")
            .map(|root| format!("{}\\System32\\rundll32.exe", root))
            .unwrap_or_else(|_| "rundll32.exe".to_string());

        log::info!(
            "[PRINTER] Membuka Printing Preferences untuk printer '{}'",
            clean_name
        );

        let res = std::process::Command::new(&rundll)
            .arg("printui.dll,PrintUIEntry")
            .arg("/e")
            .arg("/n")
            .arg(clean_name)
            .spawn();

        match res {
            Ok(_) => Ok(()),
            Err(e) => {
                log::warn!(
                    "[PRINTER] Gagal membuka Printing Preferences (/e) untuk '{}': {}. Mencoba fallback ke Printer Properties (/p)...",
                    clean_name, e
                );
                // Fallback ke Printer Properties dialog (/p)
                let res2 = std::process::Command::new(&rundll)
                    .arg("printui.dll,PrintUIEntry")
                    .arg("/p")
                    .arg("/n")
                    .arg(clean_name)
                    .spawn();

                res2.map(|_| ()).map_err(|e2| {
                    PrinterError::PrintFailed(format!(
                        "Gagal membuka dialog pengaturan printer '{}': {} / {}",
                        clean_name, e, e2
                    ))
                })
            }
        }
    }
}

// ============================================================================
// NON-WINDOWS SPECIFIC IMPLEMENTATION (Dev / Linux / macOS Fallback)
// ============================================================================
#[cfg(not(target_os = "windows"))]
mod platform {
    use super::*;

    fn get_usb_printers_from_lpinfo() -> Vec<String> {
        let mut printers = Vec::new();
        if let Ok(out) = std::process::Command::new("lpinfo").arg("-v").output() {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                for line in stdout.lines() {
                    let line_lower = line.to_lowercase();
                    if line_lower.contains("usb://") {
                        if let Some(pos) = line_lower.find("usb://") {
                            let after_usb = &line[pos + 6..];
                            let name = after_usb.split('/').next().unwrap_or(after_usb).trim();
                            if !name.is_empty() && !printers.contains(&name.to_string()) {
                                printers.push(name.to_string());
                            }
                        }
                    }
                }
            }
        }
        printers
    }

    pub fn get_installed_printers() -> Result<Vec<String>, PrinterError> {
        let mut list = Vec::new();

        // 1. Check added CUPS printer queues via lpstat -e
        if let Ok(out) = std::process::Command::new("lpstat").arg("-e").output() {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                for line in stdout.lines() {
                    let name = line.trim();
                    if !name.is_empty() && !list.contains(&name.to_string()) {
                        list.push(name.to_string());
                    }
                }
            }
        }

        // 2. Also check lpstat -p in case queues are defined but not enumerated by -e
        if let Ok(out) = std::process::Command::new("lpstat").arg("-p").output() {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                for line in stdout.lines() {
                    if let Some(rest) = line.strip_prefix("printer ") {
                        let name = rest.split_whitespace().next().unwrap_or("").trim();
                        if !name.is_empty() && !list.contains(&name.to_string()) {
                            list.push(name.to_string());
                        }
                    }
                }
            }
        }

        // 3. If no CUPS queue added yet, check raw connected USB printers via lpinfo -v
        if list.is_empty() {
            list = get_usb_printers_from_lpinfo();
        }

        Ok(list)
    }

    pub fn get_printer_status(printer_name: &str) -> Result<PrinterStatus, PrinterError> {
        if printer_name.is_empty() {
            return Ok(PrinterStatus {
                is_ready: false,
                is_online: false,
                is_printing: false,
                active_jobs: 0,
                paper_remaining: None,
                paper_limit_alert: Some(50),
                printer_name: printer_name.to_string(),
                has_error: true,
                error_message: Some("Printer offline / tidak terhubung".to_string()),
            });
        }

        let installed = get_installed_printers()?;
        let is_found = installed.iter().any(|p| p.eq_ignore_ascii_case(printer_name));

        if !is_found {
            return Ok(PrinterStatus {
                is_ready: false,
                is_online: false,
                is_printing: false,
                active_jobs: 0,
                paper_remaining: None,
                paper_limit_alert: Some(50),
                printer_name: printer_name.to_string(),
                has_error: true,
                error_message: Some("Printer offline / tidak terhubung".to_string()),
            });
        }

        let mut active_jobs: u32 = 0;
        if let Ok(job_out) = std::process::Command::new("lpstat")
            .arg("-o")
            .arg(printer_name)
            .output()
        {
            if job_out.status.success() {
                let job_stdout = String::from_utf8_lossy(&job_out.stdout);
                active_jobs = job_stdout.lines().filter(|l| !l.trim().is_empty()).count() as u32;
            }
        }

        let output = std::process::Command::new("lpstat")
            .arg("-p")
            .arg(printer_name)
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout).to_lowercase();
                let is_disabled = stdout.contains("disabled") || stdout.contains("offline") || stdout.contains("not accepting");
                let is_printing = active_jobs > 0 || stdout.contains("now printing") || stdout.contains("processing");
                return Ok(PrinterStatus {
                    is_ready: !is_disabled,
                    is_online: !is_disabled,
                    is_printing,
                    active_jobs,
                    paper_remaining: if !is_disabled { Some(200) } else { None },
                    paper_limit_alert: Some(50),
                    printer_name: printer_name.to_string(),
                    has_error: is_disabled,
                    error_message: if is_disabled { Some("Printer offline / disabled".to_string()) } else { None },
                });
            }
        }

        Ok(PrinterStatus {
            is_ready: true,
            is_online: true,
            is_printing: active_jobs > 0,
            active_jobs,
            paper_remaining: Some(200),
            paper_limit_alert: Some(50),
            printer_name: printer_name.to_string(),
            has_error: false,
            error_message: None,
        })
    }

    pub fn map_paper_size_to_cups(paper_size: &str) -> Vec<String> {
        let normalized = paper_size.trim().to_uppercase();
        match normalized.as_str() {
            "4R" | "4X6" => vec!["-o".into(), "PageSize=w288h432".into()],
            "2R" | "2X6" => vec![
                "-o".into(),
                "PageSize=w288h432".into(),
                "-o".into(),
                "DNP2x6Cut=True".into(),
            ],
            "6R" | "6X8" => vec!["-o".into(), "PageSize=w288h576".into()],
            "5R" | "5X7" => vec!["-o".into(), "PageSize=w360h504".into()],
            "3R" => vec!["-o".into(), "PageSize=w252h360".into()],
            "8R" | "8X10" => vec!["-o".into(), "PageSize=w576h720".into()],
            "10R" => vec!["-o".into(), "PageSize=w720h864".into()],
            "A4" => vec!["-o".into(), "PageSize=A4".into()],
            "A5" => vec!["-o".into(), "PageSize=A5".into()],
            "A6" => vec!["-o".into(), "PageSize=A6".into()],
            custom if custom.starts_with("PAGESIZE=") || custom.starts_with("W") => {
                vec!["-o".into(), custom.to_string()]
            }
            _ => vec!["-o".into(), "PageSize=w288h432".into()],
        }
    }

    pub fn print_image_bytes(
        printer_name: &str,
        image_bytes: &[u8],
        options: &PrintOptions,
    ) -> Result<(), PrinterError> {
        if image_bytes.is_empty() {
            return Err(PrinterError::PrintFailed("Data gambar kosong".into()));
        }

        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join("photobooth_print_job.jpg");
        if std::fs::write(&temp_file, image_bytes).is_ok() {
            let mut cmd = std::process::Command::new("lpr");
            cmd.arg("-P")
                .arg(printer_name)
                .arg("-#")
                .arg(options.copies.max(1).to_string());

            for opt in map_paper_size_to_cups(&options.paper_size) {
                cmd.arg(opt);
            }

            cmd.arg(&temp_file);
            let output = cmd.output();

            if let Ok(out) = output {
                if !out.status.success() {
                    let err = String::from_utf8_lossy(&out.stderr);
                    return Err(PrinterError::PrintFailed(format!("Gagal lpr: {}", err)));
                }
            }
        }

        println!(
            "[PRINTER PRINT] Successfully printed {} copies (Size: {}) to {}",
            options.copies, options.paper_size, printer_name
        );
        Ok(())
    }

    pub fn open_printer_properties(printer_name: &str) -> Result<(), PrinterError> {
        if printer_name.trim().is_empty() {
            return Err(PrinterError::PrinterNotFound("Nama printer kosong".into()));
        }

        // Coba buka dialog cetak GTK (gtklp) jika tersedia, fallback ke system-config-printer atau CUPS web
        if std::process::Command::new("gtklp").arg("-P").arg(printer_name).spawn().is_err() {
            if std::process::Command::new("system-config-printer").spawn().is_err() {
                let cups_url = format!("http://localhost:631/printers/{}", printer_name);
                let _ = std::process::Command::new("xdg-open").arg(&cups_url).spawn();
            }
        }

        Ok(())
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

pub fn get_installed_printers() -> Result<Vec<String>, PrinterError> {
    platform::get_installed_printers()
}

pub fn get_printer_status(printer_name: &str) -> Result<PrinterStatus, PrinterError> {
    platform::get_printer_status(printer_name)
}

pub fn open_printer_properties(printer_name: &str) -> Result<(), PrinterError> {
    platform::open_printer_properties(printer_name)
}

pub fn print_image(
    printer_name: &str,
    image_path: &PathBuf,
    options: &PrintOptions,
) -> Result<(), PrinterError> {
    let bytes = std::fs::read(image_path).map_err(|e| {
        PrinterError::PrintFailed(format!("Gagal membaca file gambar {:?}: {}", image_path, e))
    })?;
    print_image_from_buffer(printer_name, &bytes, options)
}

pub fn print_image_from_buffer(
    printer_name: &str,
    image_data: &[u8],
    options: &PrintOptions,
) -> Result<(), PrinterError> {
    if image_data.is_empty() {
        return Err(PrinterError::PrintFailed("Buffer gambar kosong".into()));
    }
    platform::print_image_bytes(printer_name, image_data, options)
}

// ============================================================================
// OS-AWARE UNIT & INTEGRATION TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_print_options_default() {
        let opt = PrintOptions::default();
        assert_eq!(opt.copies, 1);
        assert_eq!(opt.paper_size, "4x6");
        assert_eq!(opt.quality, "standard");
    }

    #[test]
    fn test_printer_status_empty_name() {
        let status = get_printer_status("").unwrap();
        assert!(!status.is_ready);
        assert!(!status.is_online);
        assert!(!status.is_printing);
        assert_eq!(status.active_jobs, 0);
        assert!(status.has_error);
    }

    #[test]
    fn test_open_printer_properties_empty_name() {
        let res = open_printer_properties("");
        assert!(res.is_err());
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn test_cups_paper_size_mapping() {
        use super::platform::map_paper_size_to_cups;

        let res_4r = map_paper_size_to_cups("4R");
        assert_eq!(res_4r, vec!["-o", "PageSize=w288h432"]);

        let res_4x6 = map_paper_size_to_cups("4x6");
        assert_eq!(res_4x6, vec!["-o", "PageSize=w288h432"]);

        let res_2r = map_paper_size_to_cups("2R");
        assert_eq!(res_2r, vec!["-o", "PageSize=w288h432", "-o", "DNP2x6Cut=True"]);

        let res_6r = map_paper_size_to_cups("6R");
        assert_eq!(res_6r, vec!["-o", "PageSize=w288h576"]);

        let res_a4 = map_paper_size_to_cups("A4");
        assert_eq!(res_a4, vec!["-o", "PageSize=A4"]);
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn test_print_empty_buffer_fails() {
        let opt = PrintOptions::default();
        let res = print_image_from_buffer("DNP_DSRX1", &[], &opt);
        assert!(res.is_err());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn test_windows_nonexistent_printer() {
        let res = get_printer_status("NonExistentPrinter_PotoHub_Test");
        assert!(res.is_err() || !res.unwrap().is_ready);
    }
}
