use printers::common::base::job::PrinterJobOptions;
use printers::common::converters::Converter;
use printers::get_printers;

use std::fs;
use std::process::Command;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};


const MEDIA:            &str = "A4";
const JOB_POLL_SECS:    u64 = 3;
const JOB_TIMEOUT_SECS: u64 = 300;

// How many consecutive polls with the job stuck (idle printer, job still queued)
// before we actively probe for a hardware reason.
const STALL_POLLS_BEFORE_PROBE: u32 = 3; // 3 × 3 s = ~9 s

// ── Job metadata passed in from the command layer ────────────────────────────
pub struct PrintJobMeta<'a> {
    pub file_name:  &'a str,
    pub pages:      u32,
    pub copies:     u32,
    pub color_mode: &'a str,   // "Monochrome" | "Color"
    pub duplex:     bool,
}


pub fn send_print_job(app: &AppHandle, pdf_path: &str, meta: &PrintJobMeta) -> Result<(), String> {

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

    let sides_str  = if meta.duplex { "two-sided-long-edge" } else { "one-sided" };
    let copies_str = meta.copies.to_string();

    let options = PrinterJobOptions {
        name: Some("Kiosk Print"),
        raw_properties: &[
            ("copies",           &copies_str),
            ("print-color-mode", meta.color_mode),
            ("sides",            sides_str),
            ("media",            MEDIA),
            ("collate",          "true"),
        ],
        converter: Converter::None,
    };

    match printer.print(&data, options) {
        Ok(job_id) => {
            println!("✅ Print job submitted — Job ID : {job_id}");
            println!("   Waiting for {} page(s) × {} cop(ies)…", meta.pages, meta.copies);
            let _ = app.emit("printer:started", job_id);

            let result = wait_for_job(app, job_id as u32, meta);
            delete_pdf(pdf_path);
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

    // ── DEBUG: dump full lpstat output so we can see exact Canon alert tokens ──
    println!("── lpstat -p -l output ─────────────────────────");
    for line in status.lines() {
        println!("  | {}", line);
    }
    println!("─────────────────────────────────────────────────");

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

    // ── Stall detection ───────────────────────────────────────────────────────
    // Canon GX6100 reports hardware errors (paper empty, jam, ink) via IPP
    // printer-state-reasons but NOT in lpstat -p -l Alerts text.
    // Strategy:
    //   • Count polls where job exists but printer is "idle" or "processing"
    //     with zero alert tokens from lpstat → stall detected.
    //   • Once stall threshold reached, call probe_ipp_state() every poll.
    //   • Once a hw-alert is active (notified_*), keep probing every poll
    //     to detect when it clears — never rely on lpstat going clear first.
    let mut stall_polls: u32    = 0;
    let mut ipp_alert_active    = false; // true while an IPP-sourced alert is live

    // ── Progress: time-based estimate ────────────────────────────────────────
    let total_impressions: u32 = meta.pages * meta.copies;
    let secs_per_page:     u64 = 8;
    let expected_secs:     u64 = (total_impressions as u64 * secs_per_page).max(1);

    let started          = Instant::now();
    let mut last_pct: u8 = 0;

    loop {
        // ── Timeout ───────────────────────────────────────────────────────────
        if started.elapsed() > Duration::from_secs(JOB_TIMEOUT_SECS) {
            println!("⏰ Print job timed out (job {})", job_id);
            let _ = app.emit("printer:timeout", ());
            return Err("Print job timed out. Please contact staff.".into());
        }

        // ── Job finished ──────────────────────────────────────────────────────
        if !job_exists(job_id) {
            println!("✅ Print job {} completed [{} page(s) × {} cop(ies)]",
                job_id, meta.pages, meta.copies);
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
            println!("❌ Printer unplugged during job {}!", job_id);
            let _ = app.emit("printer:disconnected", ());
            return Err("Printer was disconnected. Please contact staff.".into());
        }

        // ── Collect status ────────────────────────────────────────────────────
        let raw_status = get_printer_status().unwrap_or_default(); // lpstat -p -l
        let job_status = get_job_status(job_id).unwrap_or_default();
        let combined   = format!("{}\n{}", raw_status, job_status);
        let alerts     = parse_alerts(&combined);
        let raw_lower  = combined.to_lowercase();

        if !alerts.is_empty() {
            println!("⚠️  lpstat alert tokens (job {}): {:?}", job_id, alerts);
        }

        // ── IPP probe: when to run ────────────────────────────────────────────
        // Run if:
        //   (a) stall threshold reached (job in queue, printer idle, no lpstat alerts), OR
        //   (b) an IPP alert is already active (we need to know when it clears)
        let canon_no_alerts = alerts.is_empty();
        let should_stall_probe = if ipp_alert_active {
            // Always re-probe while an alert is live so we catch the clear
            true
        } else if canon_no_alerts {
            stall_polls += 1;
            println!("⏳ Stall poll #{} for job {} (no lpstat alerts, job in queue)",
                stall_polls, job_id);
            stall_polls >= STALL_POLLS_BEFORE_PROBE
        } else {
            stall_polls = 0;
            false
        };

        // ── Run IPP probe ─────────────────────────────────────────────────────
        let ipp_tokens: Vec<String> = if should_stall_probe {
            let raw = probe_ipp_state();
            println!("🔎 IPP probe tokens (job {}): {:?}", job_id, raw);
            raw
        } else {
            Vec::new()
        };

        // ── Merge: build the full picture from both lpstat + IPP ─────────────
        // For alert detection we check BOTH sources. For clear detection we
        // only clear when BOTH sources are clean (lpstat has no token AND
        // IPP probe has no matching token).
        let ipp_lower = ipp_tokens.join(" ").to_lowercase();
        let all_lower = format!("{} {}", raw_lower, ipp_lower);

        // Helper: does either source report this alert right now?
        let has_jam = alerts.iter().any(|a| a.contains("media-jam"))
            || all_lower.contains("media-jam")
            || all_lower.contains("paper jam")
            || all_lower.contains("jammed");

        let has_paper_empty = alerts.iter().any(|a| {
                a.contains("media-empty")
                    || a.contains("media-needed")
                    || a.contains("media-low")
                    || a.contains("input-tray-missing")
            })
            || ipp_tokens.iter().any(|t| {
                t.contains("media-empty")
                    || t.contains("media-needed")
                    || t.contains("out-of-paper")
            })
            || all_lower.contains("out of paper")
            || all_lower.contains("media empty")
            || all_lower.contains("no paper")
            || all_lower.contains("paper out")
            || all_lower.contains("tray empty")
            || all_lower.contains("load paper")
            || all_lower.contains("no media");

        let has_ink_empty = alerts.iter().any(|a| a.contains("marker-supply-empty"))
            || ipp_tokens.iter().any(|t| t.contains("marker-supply-empty"))
            || all_lower.contains("ink empty")
            || all_lower.contains("ink out")
            || all_lower.contains("cartridge empty");

        // Update ipp_alert_active so next poll knows to keep probing
        ipp_alert_active = has_jam || has_paper_empty || has_ink_empty;

        // ── Paper jam ─────────────────────────────────────────────────────────
        if has_jam {
            if !notified_paper_jam {
                println!("🚨 Paper jam detected (job {})", job_id);
                let _ = app.emit("printer:paper_jam", ());
                notified_paper_jam = true;
            }
            std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
            continue;
        }
        if notified_paper_jam {
            // Only clear if both lpstat AND IPP agree it's gone
            if should_stall_probe {
                println!("✅ Paper jam cleared (job {})", job_id);
                let _ = app.emit("printer:jam_cleared", ());
                notified_paper_jam = false;
                stall_polls = 0;
            } else {
                // Haven't probed yet this poll; keep blocking
                std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
                continue;
            }
        }

        // ── Paper empty ───────────────────────────────────────────────────────
        if has_paper_empty {
            if !notified_paper_empty {
                println!("📭 Paper tray empty (job {})", job_id);
                let _ = app.emit("printer:paper_empty", ());
                notified_paper_empty = true;
            }
            std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
            continue;
        }
        if notified_paper_empty {
            // Only clear after we've probed and confirmed paper-empty is gone
            if should_stall_probe {
                println!("✅ Paper refilled — resuming (job {})", job_id);
                let _ = app.emit("printer:paper_refilled", ());
                notified_paper_empty = false;
                stall_polls = 0;
            } else {
                std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
                continue;
            }
        }

        // ── Ink empty ─────────────────────────────────────────────────────────
        if has_ink_empty {
            if !notified_ink_empty {
                println!("🖊️  Ink empty (job {})", job_id);
                let _ = app.emit("printer:ink_empty", ());
                notified_ink_empty = true;
            }
            std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
            continue;
        }
        if notified_ink_empty {
            if should_stall_probe {
                println!("✅ Ink replaced — resuming (job {})", job_id);
                let _ = app.emit("printer:ink_replaced", ());
                notified_ink_empty = false;
                stall_polls = 0;
            } else {
                std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
                continue;
            }
        }

        // ── Ink low (non-blocking) ────────────────────────────────────────────
        if !notified_ink_low {
            let has_ink_low = alerts.iter().any(|a| {
                    a.contains("marker-supply-low") || a.contains("marker-waste-almost-full")
                })
                || ipp_tokens.iter().any(|t| t.contains("marker-supply-low"))
                || all_lower.contains("ink low");
            if has_ink_low {
                println!("⚠️  Ink low — printing continues (job {})", job_id);
                let _ = app.emit("printer:ink_low", ());
                notified_ink_low = true;
            }
        }

        // ── Progress estimate ─────────────────────────────────────────────────
        let elapsed  = started.elapsed().as_secs();
        let raw_pct  = ((elapsed * 100) / expected_secs).min(99) as u8;
        let pct: u8  = if raw_pct >= 90 {
            90 + ((raw_pct - 90) / 3).min(3)
        } else {
            raw_pct
        };
        let pct = pct.max(last_pct);

        if pct > last_pct {
            last_pct = pct;
            let est_current = ((pct as u32 * total_impressions) / 100).min(total_impressions);
            println!("🖨️  job {} | {}% | ~{}/{} page(s) | elapsed {}s / ~{}s",
                job_id, pct, est_current, total_impressions, elapsed, expected_secs);
            let _ = app.emit("printer:page_progress", serde_json::json!({
                "current": est_current,
                "total":   total_impressions,
                "pct":     pct,
            }));
        } else {
            println!("🖨️  job {} | {}% | elapsed {}s / ~{}s", job_id, pct, elapsed, expected_secs);
        }

        std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
    }
}



/// Deep-probe the printer via IPP to discover hardware state that lpstat -p -l
/// may not surface (common on Canon GX series connected over USB-IPP bridge).
///
/// Strategy (in order of availability):
///   1. `ipptool`  — query printer-state-reasons attribute directly
///   2. `lpstat -o` with verbose state messages for the Canon queue
///   3. `lpoptions -p <queue> -l` — sometimes surfaces state-reasons
fn probe_ipp_state() -> Vec<String> {
    let mut tokens: Vec<String> = Vec::new();

    // ── Strategy 1: ipptool (available on most Linux CUPS setups) ────────────
    // We query the USB-connected Canon via CUPS' IPP bridge URI.
    // The CUPS URI for a USB printer is typically ipp://localhost/printers/<queue>.
    let canon_queue = find_canon_queue_name();
    if let Some(ref queue) = canon_queue {
        let ipp_uri = format!("ipp://localhost/printers/{}", queue);

        // Write a minimal ipptool test script to a temp file
        let test_script = r#"
{
    NAME "Get printer-state-reasons"
    OPERATION Get-Printer-Attributes
    GROUP operation-attributes-tag
    ATTR charset attributes-charset utf-8
    ATTR language attributes-natural-language en
    ATTR uri printer-uri $uri
    STATUS successful-ok
    EXPECT printer-state-reasons OF-TYPE keyword
    DISPLAY printer-state-reasons
    EXPECT printer-state-message OF-TYPE text
    DISPLAY printer-state-message
}
"#;
        let tmp_path = "/tmp/kiosk_ipp_probe.test";
        if fs::write(tmp_path, test_script).is_ok() {
            if let Ok(out) = Command::new("ipptool")
                .arg("-tv")
                .arg(&ipp_uri)
                .arg(tmp_path)
                .output()
            {
                let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
                let errtext = String::from_utf8_lossy(&out.stderr).to_lowercase();
                println!("🔎 ipptool stdout:\n{}", text);
                println!("🔎 ipptool stderr:\n{}", errtext);

                // Parse "printer-state-reasons = <token>" lines.
                // ipptool may return comma-joined values like
                // "media-empty-error,media-needed-error" — split on both
                // whitespace and commas so each token is individual.
                for line in text.lines().chain(errtext.lines()) {
                    if line.contains("printer-state-reasons") || line.contains("state-message") {
                        let after = line.splitn(2, '=').nth(1).unwrap_or("").trim().to_string();
                        for part in after.split(|c: char| c.is_whitespace() || c == ',') {
                            let tok = part.trim();
                            if !tok.is_empty() && tok != "none" {
                                tokens.push(tok.to_string());
                            }
                        }
                    }
                }

                if !tokens.is_empty() {
                    println!("🔎 IPP tokens via ipptool: {:?}", tokens);
                    return tokens;
                }
            }
        }
    }

    // ── Strategy 2: lpstat -o (job-level state message) ──────────────────────
    // `lpstat -o` prints each job with its state-message, which sometimes
    // includes free-text like "Waiting for paper" or "Paper tray empty".
    if let Ok(out) = Command::new("lpstat").arg("-o").output() {
        let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
        println!("🔎 lpstat -o output:\n{}", text);
        // Extract meaningful phrases as pseudo-tokens
        for keyword in &[
            "paper", "tray", "jam", "jammed", "empty", "media",
            "ink", "cartridge", "door", "open", "offline",
        ] {
            if text.contains(keyword) {
                tokens.push(keyword.to_string());
            }
        }
        if !tokens.is_empty() {
            println!("🔎 IPP tokens via lpstat -o: {:?}", tokens);
            return tokens;
        }
    }

    // ── Strategy 3: lpoptions (printer attributes) ────────────────────────────
    if let Some(ref queue) = canon_queue {
        if let Ok(out) = Command::new("lpoptions")
            .arg("-p").arg(queue)
            .arg("-l")
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
            println!("🔎 lpoptions -l output:\n{}", text);
            if text.contains("media-empty") || text.contains("media-needed") {
                tokens.push("media-empty".to_string());
            }
        }
    }

    // ── Strategy 4: /dev/usb/lp* raw status byte (Linux-specific) ─────────────
    // The USB printer exposes a status register at /dev/usb/lp0 (or lp1, etc.).
    // Reading 1 byte gives a bitmask: bit 5 = paper out, bit 3 = error.
    // This is a last-resort fallback when CUPS gives us nothing.
    for lp_dev in &["/dev/usb/lp0", "/dev/usb/lp1", "/dev/usb/lp2"] {
        if let Ok(mut file) = fs::File::open(lp_dev) {
            use std::io::Read;
            let mut buf = [0u8; 1];
            // LPGETSTATUS ioctl would be ideal, but a raw read of the status
            // byte works on many Canon USB printers.
            if file.read_exact(&mut buf).is_ok() {
                let status_byte = buf[0];
                println!("🔎 USB lp status byte from {}: 0x{:02X}", lp_dev, status_byte);
                // Bit 5 (0x20): paper out / selected
                // Bit 3 (0x08): error
                if status_byte & 0x20 == 0 {
                    // Paper-out bit is ACTIVE LOW on most printers
                    tokens.push("media-empty".to_string());
                    println!("🔎 USB status: paper-out bit set");
                }
                break;
            }
        }
    }

    tokens
}

/// Returns the CUPS queue name for the Canon printer (e.g. "Canon_GX6100_series_USB").
fn find_canon_queue_name() -> Option<String> {
    Command::new("lpstat")
        .arg("-p")
        .output()
        .ok()
        .and_then(|o| {
            let text = String::from_utf8_lossy(&o.stdout).into_owned();
            text.lines()
                .find(|l| l.to_lowercase().contains("canon"))
                .and_then(|l| l.split_whitespace().nth(1))
                .map(|s| s.to_string())
        })
}


// ── Shared helpers ────────────────────────────────────────────────────────────

fn get_printer_status() -> Result<String, String> {
    Command::new("lpstat")
        .arg("-p")
        .arg("-l")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .map_err(|e| format!("lpstat error: {}", e))
}

/// `lpstat -o <job_id>` — returns the job's current state message.
/// Useful for detecting "Waiting for paper" free-text that Canon emits
/// at the job level rather than the printer level.
fn get_job_status(job_id: u32) -> Result<String, String> {
    Command::new("lpstat")
        .arg("-o")
        .output()
        .map(|o| {
            let text = String::from_utf8_lossy(&o.stdout).into_owned();
            // Filter to lines that mention our job id, plus any "Reason" lines
            text.lines()
                .filter(|l| l.contains(&job_id.to_string()) || l.to_lowercase().contains("reason"))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .map_err(|e| format!("lpstat -o error: {}", e))
}

/// Extract all meaningful tokens from the Canon printer's Alerts /
/// printer-state-reasons lines in `lpstat -p -l` output.
fn parse_alerts(status: &str) -> Vec<String> {
    let mut in_canon = false;
    let mut tokens   = Vec::new();

    for line in status.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("printer ") {
            in_canon = trimmed.to_lowercase().contains("canon");
        }
        if !in_canon { continue; }

        let lower = line.to_lowercase();

        let is_alerts  = lower.contains("alerts:");
        let is_reasons = lower.contains("state-reasons") || lower.contains("state-message");

        if is_alerts || is_reasons {
            let after = line.splitn(2, ':').nth(1).unwrap_or("").trim().to_lowercase();
            for token in after.split_whitespace() {
                if token != "none" {
                    tokens.push(token.to_string());
                }
            }
        }
    }
    tokens
}

fn blocking_error_message(status: &str) -> Option<String> {
    if status.to_lowercase().contains("disabled") {
        return Some("Printer is disabled. Please contact staff.".into());
    }

    let alerts = parse_alerts(status);
    let lower  = status.to_lowercase();

    let paper_empty = alerts.iter().any(|a| {
            a.contains("media-empty") || a.contains("media-needed") || a.contains("media-low")
        })
        || lower.contains("out of paper")
        || lower.contains("no paper")
        || lower.contains("paper out");

    if paper_empty {
        return Some("Paper tray is empty. Please contact staff.".into());
    }

    for alert in &alerts {
        if alert.contains("media-jam") {
            return Some("Paper jam detected. Please contact staff.".into());
        }
        if alert.contains("offline") || lower.contains("offline") {
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
            let text  = String::from_utf8_lossy(&o.stdout).to_lowercase();
            let found = text.contains("04a9"); // Canon USB vendor ID
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
        Ok(_)  => println!(" PDF deleted: {}", path),
        Err(e) => println!(" Could not delete PDF {}: {}", path, e),
    }
}