use printers::common::base::job::PrinterJobOptions;
use printers::common::converters::Converter;
use printers::get_printers;

use std::fs;
use std::process::Command;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};


const DUPLEX: &str = "two-sided-long-edge";
const COLOR_MODE: &str = "Monochrome"; 
const MEDIA: &str = "A4";
const COPIES: &str = "1";

// ── Job monitoring constants ───────────────────────────────────────────────────
const JOB_POLL_SECS: u64 = 3;
const JOB_TIMEOUT_SECS: u64 = 300;

// -----------------------------------------------------------------------------
//  PUBLIC API
// -----------------------------------------------------------------------------

pub fn send_print_job(app: &AppHandle, pdf_path: &str) -> Result<(), String> {
    println!("🖨 Checking printer before job...");
    check_printer_ready()?;

    // Find Canon printer
    let printers = get_printers();
    let printer = printers
        .iter()
        .find(|p| p.name.to_lowercase().contains("canon"))
        .ok_or_else(|| "Canon printer not found".to_string())?;

    println!("Using printer: {}", printer.name);

    let data = fs::read(pdf_path)
        .map_err(|e| format!("Failed to read PDF: {}", e))?;

    let options = PrinterJobOptions {
        name: Some("Kiosk Print"),
        raw_properties: &[
            ("copies", COPIES),
            ("print-color-mode", COLOR_MODE),
            ("sides", DUPLEX),
            ("media", MEDIA),
            ("collate", "true"),
        ],
        converter: Converter::None,
    };

    match printer.print(&data, options) {
        Ok(job_id) => {
            println!("Print job submitted: {job_id}");
            let _ = app.emit("printer:started", job_id);

            let result = wait_for_job(app, job_id as u32);
            delete_pdf(pdf_path);
            result
        }
        Err(e) => {
            let _ = app.emit("printer:failed", format!("{:?}", e));
            Err(format!("Failed to submit print job: {:?}", e))
        }
    }
}

// -----------------------------------------------------------------------------
//  Quick readiness check
// -----------------------------------------------------------------------------

pub fn check_printer_ready() -> Result<(), String> {
    if !is_usb_present() {
        return Err("Printer not connected".into());
    }

    let status = get_printer_status()?;
    if let Some(msg) = blocking_error_message(&status) {
        return Err(msg);
    }

    println!("Printer ready");
    Ok(())
}

pub fn is_printer_ready() -> bool {
    check_printer_ready().is_ok()
}

// -----------------------------------------------------------------------------
//  Job monitor
// -----------------------------------------------------------------------------

fn wait_for_job(app: &AppHandle, job_id: u32) -> Result<(), String> {
    let start = Instant::now();

    loop {
        if start.elapsed() > Duration::from_secs(JOB_TIMEOUT_SECS) {
            let _ = app.emit("printer:timeout", ());
            return Err("Print job timed out".into());
        }

        if !job_exists(job_id) {
            let _ = app.emit("printer:completed", job_id);
            return Ok(());
        }

        std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
    }
}

// -----------------------------------------------------------------------------
//  Helpers (USB, CUPS, cleanup)
// -----------------------------------------------------------------------------

fn delete_pdf(path: &str) {
    let _ = fs::remove_file(path);
}

fn is_usb_present() -> bool {
    Command::new("lsusb")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("Canon"))
        .unwrap_or(false)
}

fn get_printer_status() -> Result<String, String> {
    let output = Command::new("lpstat")
        .arg("-p")
        .arg("-l")
        .output()
        .map_err(|e| format!("lpstat error: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn blocking_error_message(status: &str) -> Option<String> {
    if status.contains("paper out") {
        Some("Printer is out of paper".into())
    } else if status.contains("toner low") {
        Some("Low toner — contact staff".into())
    } else {
        None
    }
}

fn job_exists(job_id: u32) -> bool {
    let output = Command::new("lpstat")
        .arg("-W")
        .arg("not-completed")
        .output();

    if let Ok(out) = output {
        let text = String::from_utf8_lossy(&out.stdout);
        return text.contains(&job_id.to_string());
    }
    false
}