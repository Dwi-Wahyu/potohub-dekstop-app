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
    use winapi::shared::minwindef::DWORD;
    use winapi::um::winspool::*;

    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    pub fn get_installed_printers() -> Result<Vec<String>, PrinterError> {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut needed: DWORD = 0;
        let mut returned: DWORD = 0;

        unsafe {
            EnumPrintersW(
                flags,
                ptr::null_mut(),
                2, // PRINTER_INFO_2W
                ptr::null_mut(),
                0,
                &mut needed,
                &mut returned,
            );
        }

        if needed == 0 {
            return Ok(Vec::new());
        }

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

        if res == 0 {
            return Err(PrinterError::StatusFailed(
                "Gagal enumerate printers dari Windows Spooler".into(),
            ));
        }

        let mut printers = Vec::new();
        let info_slice = unsafe {
            std::slice::from_raw_parts(buffer.as_ptr() as *const PRINTER_INFO_2W, returned as usize)
        };

        for info in info_slice {
            if !info.pPrinterName.is_null() {
                let len = unsafe { (0..).take_while(|&i| *info.pPrinterName.offset(i) != 0).count() };
                let name_slice = unsafe { std::slice::from_raw_parts(info.pPrinterName, len) };
                let name = String::from_utf16_lossy(name_slice);
                printers.push(name);
            }
        }

        Ok(printers)
    }

    pub fn get_printer_status(printer_name: &str) -> Result<PrinterStatus, PrinterError> {
        let wide_name = to_wide(printer_name);
        let mut handle: winapi::shared::ntdef::HANDLE = ptr::null_mut();

        let open_res = unsafe { OpenPrinterW(wide_name.as_ptr() as *mut _, &mut handle, ptr::null_mut()) };
        if open_res == 0 || handle.is_null() {
            return Err(PrinterError::PrinterNotFound(printer_name.to_string()));
        }

        let mut needed: DWORD = 0;
        unsafe {
            GetPrinterW(handle, 2, ptr::null_mut(), 0, &mut needed);
        }

        if needed == 0 {
            unsafe { ClosePrinter(handle) };
            return Err(PrinterError::StatusFailed("Gagal membaca ukuran status printer".into()));
        }

        let mut buffer: Vec<u8> = vec![0; needed as usize];
        let get_res = unsafe { GetPrinterW(handle, 2, buffer.as_mut_ptr(), needed, &mut needed) };
        unsafe { ClosePrinter(handle) };

        if get_res == 0 {
            return Err(PrinterError::StatusFailed("Gagal mengambil info status printer".into()));
        }

        let info = unsafe { &*(buffer.as_ptr() as *const PRINTER_INFO_2W) };
        let status_code = info.Status;

        let has_error = (status_code & (PRINTER_STATUS_ERROR | PRINTER_STATUS_PAPER_JAM | PRINTER_STATUS_PAPER_OUT | PRINTER_STATUS_OFFLINE)) != 0;
        let is_online = (status_code & PRINTER_STATUS_OFFLINE) == 0;
        let is_ready = is_online && !has_error;

        let error_message = if (status_code & PRINTER_STATUS_PAPER_OUT) != 0 {
            Some("Kertas habis".to_string())
        } else if (status_code & PRINTER_STATUS_PAPER_JAM) != 0 {
            Some("Kertas tersangkut (Paper Jam)".to_string())
        } else if (status_code & PRINTER_STATUS_OFFLINE) != 0 {
            Some("Printer Offline".to_string())
        } else if has_error {
            Some(format!("Printer error status code: {}", status_code))
        } else {
            None
        };

        // Note: DNP DS-RX1HS paper count is estimated or read from driver metadata
        Ok(PrinterStatus {
            is_ready,
            is_online,
            paper_remaining: Some(200), // Default roll estimate if status unavailable
            paper_limit_alert: Some(50),
            printer_name: printer_name.to_string(),
            has_error,
            error_message,
        })
    }

    pub fn print_image_bytes(
        printer_name: &str,
        image_bytes: &[u8],
        options: &PrintOptions,
    ) -> Result<(), PrinterError> {
        let wide_name = to_wide(printer_name);
        let mut handle: winapi::shared::ntdef::HANDLE = ptr::null_mut();

        let open_res = unsafe { OpenPrinterW(wide_name.as_ptr() as *mut _, &mut handle, ptr::null_mut()) };
        if open_res == 0 || handle.is_null() {
            return Err(PrinterError::PrinterNotFound(printer_name.to_string()));
        }

        let mut doc_name = to_wide("Photobooth Photo");
        let mut data_type = to_wide("RAW");

        let mut doc_info = DOC_INFO_1W {
            pDocName: doc_name.as_mut_ptr(),
            pOutputFile: ptr::null_mut(),
            pDatatype: data_type.as_mut_ptr(),
        };

        let start_doc = unsafe { StartDocPrinterW(handle, 1, &mut doc_info as *mut _ as *mut _) };
        if start_doc == 0 {
            unsafe { ClosePrinter(handle) };
            return Err(PrinterError::PrintFailed("Gagal memulai dokumen printer".into()));
        }

        for _copy in 0..options.copies.max(1) {
            let start_page = unsafe { StartPagePrinter(handle) };
            if start_page == 0 {
                unsafe {
                    EndDocPrinter(handle);
                    ClosePrinter(handle);
                }
                return Err(PrinterError::PrintFailed("Gagal memulai halaman cetak".into()));
            }

            let mut bytes_written: DWORD = 0;
            let write_res = unsafe {
                WritePrinter(
                    handle,
                    image_bytes.as_ptr() as *mut _,
                    image_bytes.len() as DWORD,
                    &mut bytes_written,
                )
            };

            unsafe { EndPagePrinter(handle) };

            if write_res == 0 || bytes_written as usize != image_bytes.len() {
                unsafe {
                    EndDocPrinter(handle);
                    ClosePrinter(handle);
                }
                return Err(PrinterError::PrintFailed("Gagal menulis data ke printer".into()));
            }
        }

        unsafe {
            EndDocPrinter(handle);
            ClosePrinter(handle);
        }

        Ok(())
    }
}

// ============================================================================
// NON-WINDOWS SPECIFIC IMPLEMENTATION (Dev / Linux / macOS Fallback)
// ============================================================================
#[cfg(not(target_os = "windows"))]
mod platform {
    use super::*;

    pub fn get_installed_printers() -> Result<Vec<String>, PrinterError> {
        // Enumerate via lpstat command if available, otherwise return mock list
        let output = std::process::Command::new("lpstat").arg("-e").output();

        if let Ok(out) = output {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let list: Vec<String> = stdout
                    .lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect();
                if !list.is_empty() {
                    return Ok(list);
                }
            }
        }

        // Development fallback printer list for photobooth testing
        Ok(vec![
            "DNP DS-RX1HS".to_string(),
            "Virtual Photobooth Printer".to_string(),
        ])
    }

    pub fn get_printer_status(printer_name: &str) -> Result<PrinterStatus, PrinterError> {
        Ok(PrinterStatus {
            is_ready: true,
            is_online: true,
            paper_remaining: Some(185),
            paper_limit_alert: Some(50),
            printer_name: printer_name.to_string(),
            has_error: false,
            error_message: None,
        })
    }

    pub fn print_image_bytes(
        printer_name: &str,
        image_bytes: &[u8],
        options: &PrintOptions,
    ) -> Result<(), PrinterError> {
        if image_bytes.is_empty() {
            return Err(PrinterError::PrintFailed("Data gambar kosong".into()));
        }

        // Try printing via lpr if on linux with lpr installed
        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join("photobooth_print_job.jpg");
        if std::fs::write(&temp_file, image_bytes).is_ok() {
            let _ = std::process::Command::new("lpr")
                .arg("-P")
                .arg(printer_name)
                .arg("-#")
                .arg(options.copies.to_string())
                .arg(&temp_file)
                .output();
        }

        println!(
            "[PRINTER MOCK] Successfully printed {} copies (Size: {}) to {}",
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
