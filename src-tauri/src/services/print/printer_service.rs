use printers::common::base::job::PrinterJobOptions;
use printers::common::converters::Converter;
use printers::get_printers;

use std::fs;
use std::process::Command;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};


const DUPLEX:     &str = "two-sided-long-edge";
const COLOR_MODE: &str = "Monochrome";
const MEDIA:      &str = "A4";
const COPIES:     &str = "1";

const JOB_POLL_SECS:    u64 = 3;
const JOB_TIMEOUT_SECS: u64 = 300;


// ── Job metadata passed in from the command layer ────────────────────────────
pub struct PrintJobMeta<'a> {
    pub file_name:  &'a str,
    pub pages:      u32,
    pub copies:     u32,
    pub color_mode: &'a str,   // "Monochrome" | "Color"
    pub duplex:     bool,
}


pub fn send_print_job(app: &AppHandle, pdf_path: &str, meta: &PrintJobMeta) -> Result<(), String> {

    // ── Structured log: job received ─────────────────────────────────────────
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("📄 PRINT JOB RECEIVED");
    println!("   File      : {}", meta.file_name);
    println!("   Path      : {}", pdf_path);
    println!("   Pages     : {}", meta.pages);
    println!("   Copies    : {}", meta.copies);
    println!("   Color     : {}", meta.color_mode);
    println!("   Duplex    : {}", if meta.duplex { "Two-sided (long edge)" } else { "One-sided" });
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    println!("  Checking printer before job...");
    check_printer_ready()?;

    let printers = get_printers();
    let printer = printers
        .iter()
        .find(|p| p.name.to_lowercase().contains("canon"))
        .ok_or_else(|| {
            let names: Vec<&str> = printers.iter().map(|p| p.name.as_str()).collect();
            format!("Canon printer not found. Available: {:?}", names)
        })?;

    println!("🖨️  Using printer : {}", printer.name);

    let data = fs::read(pdf_path)
        .map_err(|e| format!("Failed to read PDF: {}", e))?;

    // Resolve options from meta (fall back to constants when caller omits them)
    let color_str = meta.color_mode;
    let sides_str = if meta.duplex { DUPLEX } else { "one-sided" };
    let copies_str = &meta.copies.to_string();

    let options = PrinterJobOptions {
        name: Some("Kiosk Print"),
        raw_properties: &[
            ("copies",           copies_str),
            ("print-color-mode", color_str),
            ("sides",            sides_str),
            ("media",            MEDIA),
            ("collate",          "true"),
        ],
        converter: Converter::None,
    };

    match printer.print(&data, options) {
        Ok(job_id) => {
            println!("✅ Print job submitted  — Job ID : {job_id}");
            println!("   Waiting for {} page(s) × {} cop(ies) to finish…", meta.pages, meta.copies);
            let _ = app.emit("printer:started", job_id);

            let result = wait_for_job(app, job_id as u32, meta);
            delete_pdf(pdf_path); // always delete — success, failure, or timeout
            result
        }
        Err(e) => {
            println!("❌ Failed to submit print job: {:?}", e);
            let _ = app.emit("printer:failed", format!("{:?}", e));
            delete_pdf(pdf_path);
            Err(format!("Failed to submit print job: {:?}", e))
        }
    }
}

pub fn check_printer_ready() -> Result<(), String> {
    if !is_usb_present() {
        return Err("Printer is not connected. Please contact staff.".into());
    }
    let status = get_printer_status()?;
    if let Some(msg) = blocking_error_message(&status) {
        return Err(msg);
    }
    println!("✅ Printer ready");
    Ok(())
}

pub fn is_printer_ready() -> bool {
    check_printer_ready().is_ok()
}



fn wait_for_job(app: &AppHandle, job_id: u32, meta: &PrintJobMeta) -> Result<(), String> {
    let mut notified_paper_empty = false;
    let mut notified_paper_jam   = false;
    let mut notified_ink_empty   = false;
    let mut notified_ink_low     = false;

    // ── Page-progress tracking ───────────────────────────────────────────────
    // CUPS doesn't expose a per-page counter directly, so we estimate progress
    // by elapsed time vs expected duration (pages × copies × ~4 s/page).
    // When the job disappears from the queue we emit 100 %.
    let total_impressions = meta.pages * meta.copies;
    let secs_per_page: u64 = 4; // tune to your Canon's actual speed
    let expected_secs = total_impressions as u64 * secs_per_page;

    let started = Instant::now();
    let mut last_emitted_pct: u8 = 0;

    loop {
        // ── Timeout ───────────────────────────────────────────────────────────
        if started.elapsed() > Duration::from_secs(JOB_TIMEOUT_SECS) {
            println!("⏰ Print job timed out (job {})", job_id);
            let _ = app.emit("printer:timeout", ());
            return Err("Print job timed out. Please contact staff.".into());
        }

        // ── Job finished ──────────────────────────────────────────────────────
        if !job_exists(job_id) {
            println!("✅ Print job {} completed  [{} page(s) × {} cop(ies)]",
                job_id, meta.pages, meta.copies);
            // Emit 100 % before the completed event so the bar fills first
            let _ = app.emit("printer:page_progress", serde_json::json!({
                "current": total_impressions,
                "total":   total_impressions,
                "pct":     100u8,
            }));
            let _ = app.emit("printer:completed", job_id);
            return Ok(());
        }

        // ── USB disconnect ────────────────────────────────────────────────────
        if !is_usb_present() {
            println!("❌ Printer unplugged during printing! (job {})", job_id);
            let _ = app.emit("printer:disconnected", ());
            return Err("Printer was disconnected. Please contact staff.".into());
        }

        // ── Active alerts ─────────────────────────────────────────────────────
        let alerts = get_active_alerts();

        // Paper jam
        if alerts.iter().any(|a| a.contains("media-jam")) {
            if !notified_paper_jam {
                println!("🚨 Paper jam detected  (job {})", job_id);
                let _ = app.emit("printer:paper_jam", ());
                notified_paper_jam = true;
            }
            std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
            continue;
        }
        if notified_paper_jam {
            println!("✅ Paper jam cleared  (job {})", job_id);
            let _ = app.emit("printer:jam_cleared", ());
            notified_paper_jam = false;
        }

        // Paper empty
        if alerts.iter().any(|a| a.contains("media-empty") || a.contains("media-needed")) {
            if !notified_paper_empty {
                println!("📭 Paper tray empty  (job {})", job_id);
                let _ = app.emit("printer:paper_empty", ());
                notified_paper_empty = true;
            }
            std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
            continue;
        }
        if notified_paper_empty {
            println!("✅ Paper refilled  (job {})", job_id);
            let _ = app.emit("printer:paper_refilled", ());
            notified_paper_empty = false;
        }

        // Ink empty
        if alerts.iter().any(|a| a.contains("marker-supply-empty")) {
            if !notified_ink_empty {
                println!("🖊️  Ink cartridge empty  (job {})", job_id);
                let _ = app.emit("printer:ink_empty", ());
                notified_ink_empty = true;
            }
            std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
            continue;
        }
        if notified_ink_empty {
            println!("✅ Ink replaced  (job {})", job_id);
            let _ = app.emit("printer:ink_replaced", ());
            notified_ink_empty = false;
        }

        // Ink low (non-blocking — printing continues)
        if !notified_ink_low
            && alerts.iter().any(|a| {
                a.contains("marker-supply-low") || a.contains("marker-waste-almost-full")
            })
        {
            println!("⚠️  Ink level low — printing continues  (job {})", job_id);
            let _ = app.emit("printer:ink_low", ());
            notified_ink_low = true;
        }

        // ── Estimate & emit page progress ─────────────────────────────────────
        let elapsed = started.elapsed().as_secs().min(expected_secs);
        let pct = if expected_secs == 0 {
            50u8
        } else {
            // Cap at 95 % — the final 100 % is only emitted on job completion
            ((elapsed * 100 / expected_secs) as u8).min(95)
        };

        if pct > last_emitted_pct {
            last_emitted_pct = pct;
            let estimated_current = ((pct as u32 * total_impressions) / 100).min(total_impressions);
            println!("🖨️  Printing… job {} | ~{}% | ~{}/{} page(s)",
                job_id, pct, estimated_current, total_impressions);
            let _ = app.emit("printer:page_progress", serde_json::json!({
                "current": estimated_current,
                "total":   total_impressions,
                "pct":     pct,
            }));
        } else {
            println!("🖨️  Printing in progress (job {})…", job_id);
        }

        std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
    }
}




fn get_printer_status() -> Result<String, String> {
    Command::new("lpstat")
        .arg("-p")
        .arg("-l")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .map_err(|e| format!("lpstat error: {}", e))
}

/// Parses active alerts (tokens ending in -warning or -error) from the Canon
/// section of `lpstat -p -l` output.
fn get_active_alerts() -> Vec<String> {
    let status = match get_printer_status() {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let mut in_canon = false;
    for line in status.lines() {
        if line.trim_start().starts_with("printer ") {
            in_canon = line.to_lowercase().contains("canon");
        }
        if in_canon && line.to_lowercase().contains("alerts:") {
            let after = line.splitn(2, ':').nth(1).unwrap_or("").trim().to_lowercase();
            return after
                .split_whitespace()
                .filter(|t| t.ends_with("-warning") || t.ends_with("-error"))
                .map(|s| s.to_string())
                .collect();
        }
    }

    Vec::new()
}


fn blocking_error_message(status: &str) -> Option<String> {
    if status.to_lowercase().contains("disabled") {
        return Some("Printer is disabled. Please contact staff.".into());
    }

    let mut in_canon = false;
    let mut alerts: Vec<String> = Vec::new();

    for line in status.lines() {
        if line.trim_start().starts_with("printer ") {
            in_canon = line.to_lowercase().contains("canon");
        }
        if in_canon && line.to_lowercase().contains("alerts:") {
            let after = line.splitn(2, ':').nth(1).unwrap_or("").trim().to_lowercase();
            alerts = after
                .split_whitespace()
                .filter(|t| t.ends_with("-warning") || t.ends_with("-error"))
                .map(|s| s.to_string())
                .collect();
            break;
        }
    }

    for alert in &alerts {
        if alert.contains("media-empty") || alert.contains("media-needed") {
            return Some("Paper tray is empty. Please contact staff.".into());
        }
        if alert.contains("media-jam") {
            return Some("Paper jam detected. Please contact staff.".into());
        }
        if alert.contains("offline") {
            return Some("Printer is offline. Please contact staff.".into());
        }
        if alert.contains("door-open") {
            return Some("Printer door is open. Please contact staff.".into());
        }
        if alert.contains("marker-supply-empty") {
            return Some("Ink cartridge is empty. Please contact staff.".into());
        }
    }

    None
}


fn is_usb_present() -> bool {
    Command::new("lsusb")
        .output()
        .map(|o| {
            let text = String::from_utf8_lossy(&o.stdout).to_lowercase();
            let found = text.contains("04a9");
            println!("🔌 Canon USB: {}", if found { "found" } else { "NOT found" });
            found
        })
        .unwrap_or_else(|e| {
            println!("lsusb unavailable: {} — assuming connected", e);
            true
        })
}

fn job_exists(job_id: u32) -> bool {
    Command::new("lpstat")
        .arg("-W")
        .arg("not-completed")
        .output()
        .map(|o| {
            let text = String::from_utf8_lossy(&o.stdout);
            text.contains(&job_id.to_string())
        })
        .unwrap_or(false)
}

fn delete_pdf(path: &str) {
    match fs::remove_file(path) {
        Ok(_)  => println!("🗑️  PDF deleted: {}", path),
        Err(e) => println!("⚠️  Could not delete PDF {}: {}", path, e),
    }
}