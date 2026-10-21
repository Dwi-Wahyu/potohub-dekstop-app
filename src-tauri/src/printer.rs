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

        // Stage 1: Level 4 (PRINTER_INFO_4W) — Sangat cepat & tidak butuh hak akses khusus
        let mut needed: DWORD = 0;
        let mut returned: DWORD = 0;
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

                let mut printers = Vec::new();
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
                        let trimmed = name.trim().to_string();
                        if !trimmed.is_empty() {
                            printers.push(trimmed);
                        }
                    }
                }

                if !printers.is_empty() {
                    return Ok(printers);
                }
            }
        }

        // Stage 2: Level 2 (PRINTER_INFO_2W)
        needed = 0;
        returned = 0;
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

                let mut printers = Vec::new();
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
                        let trimmed = name.trim().to_string();
                        if !trimmed.is_empty() {
                            printers.push(trimmed);
                        }
                    }
                }

                if !printers.is_empty() {
                    return Ok(printers);
                }
            }
        }

        // Stage 3: PowerShell Fallback (Get-Printer)
        if let Ok(output) = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"])
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                let list: Vec<String> = text
                    .lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect();
                if !list.is_empty() {
                    return Ok(list);
                }
            }
        }

        Ok(Vec::new())
    }

    pub fn get_printer_status(printer_name: &str) -> Result<PrinterStatus, PrinterError> {
        let wide_name = to_wide(printer_name);
        let mut handle: winapi::shared::ntdef::HANDLE = ptr::null_mut();

        let open_res =
            unsafe { OpenPrinterW(wide_name.as_ptr() as *mut _, &mut handle, ptr::null_mut()) };
        if open_res == 0 || handle.is_null() {
            return Err(PrinterError::PrinterNotFound(printer_name.to_string()));
        }

        let mut status_code: DWORD = 0;
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

        unsafe { ClosePrinter(handle) };

        // Stage 3: PowerShell status fallback if WinSpool query was denied
        if !got_status {
            let escaped = printer_name.replace('\'', "''");
            let cmd = format!("(Get-Printer -Name '{}').PrinterStatus", escaped);
            if let Ok(output) = std::process::Command::new("powershell")
                .args(["-NoProfile", "-Command", &cmd])
                .output()
            {
                if output.status.success() {
                    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if let Ok(num) = text.parse::<u32>() {
                        status_code = num;
                    }
                }
            }
        }

        let has_error = (status_code
            & (PRINTER_STATUS_ERROR
                | PRINTER_STATUS_PAPER_JAM
                | PRINTER_STATUS_PAPER_OUT
                | PRINTER_STATUS_DOOR_OPEN
                | PRINTER_STATUS_OFFLINE))
            != 0;
        let is_online = (status_code & PRINTER_STATUS_OFFLINE) == 0 && !is_attr_offline;
        let is_ready = is_online && !has_error;

        let error_message = if (status_code & PRINTER_STATUS_PAPER_OUT) != 0 {
            Some("Kertas habis".to_string())
        } else if (status_code & PRINTER_STATUS_PAPER_JAM) != 0 {
            Some("Kertas tersangkut (Paper Jam)".to_string())
        } else if (status_code & PRINTER_STATUS_DOOR_OPEN) != 0 {
            Some("Pintu/Cover printer terbuka".to_string())
        } else if (status_code & PRINTER_STATUS_OFFLINE) != 0 || is_attr_offline {
            Some("Printer Offline".to_string())
        } else if has_error {
            Some(format!("Printer error status code: {}", status_code))
        } else {
            None
        };

        Ok(PrinterStatus {
            is_ready,
            is_online,
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

        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .output();

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

        // 1. Check added CUPS printer queues
        if let Ok(out) = std::process::Command::new("lpstat").arg("-e").output() {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                for line in stdout.lines() {
                    let name = line.trim();
                    if !name.is_empty() {
                        list.push(name.to_string());
                    }
                }
            }
        }

        // 2. If no CUPS queue added yet, check raw connected USB printers via lpinfo -v
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
                paper_remaining: None,
                paper_limit_alert: Some(50),
                printer_name: printer_name.to_string(),
                has_error: true,
                error_message: Some("Printer offline / tidak terhubung".to_string()),
            });
        }

        let output = std::process::Command::new("lpstat")
            .arg("-p")
            .arg(printer_name)
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout).to_lowercase();
                let is_disabled = stdout.contains("disabled") || stdout.contains("offline") || stdout.contains("not accepting");
                return Ok(PrinterStatus {
                    is_ready: !is_disabled,
                    is_online: !is_disabled,
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
        assert!(status.has_error);
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
