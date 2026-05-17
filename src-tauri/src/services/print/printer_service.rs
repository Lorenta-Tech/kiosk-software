//     use printers::common::base::job::PrinterJobOptions;
//     use printers::common::converters::Converter;
//     use printers::get_printers;

//     use std::fs;
//     use std::process::Command;
//     use std::time::{Duration, Instant};

//     use tauri::{AppHandle, Emitter};

//     use crate::services::expire_session::expire::expire_session;
//     use crate::services::server::printer_event_service::notify_printer_event;


//     const MEDIA:                    &str = "A4";
//     const JOB_POLL_SECS:            u64  = 3;
//     const JOB_TIMEOUT_SECS:         u64  = 300;
//     const STALL_POLLS_BEFORE_PROBE: u32  = 3;

//     // ── Job metadata passed in from the command layer ────────────────────────────
//     pub struct PrintJobMeta<'a> {
//         pub file_name:  &'a str,
//         pub pages:      u32,
//         pub copies:     u32,
//         pub color_mode: &'a str,
//         pub duplex:     bool,
//         pub page_range: Option<&'a str>, 
//         pub pages_per_sheet: Option<&'a str>, 
//         pub session_id: &'a str,
//     }

//     // ── Fire-and-forget backend notifier ─────────────────────────────────────────
//     fn notify(job_id: u32, event: &str, session_id: &str) {
//         let event_owned   = event.to_string();
//         let session_owned = session_id.to_string();
//         tauri::async_runtime::spawn(async move {
//             if let Err(e) = notify_printer_event(job_id, &event_owned, &session_owned).await {
//                 println!("  printer_event_service error: {}", e);
//             }
//         });
//     }

//     pub fn send_print_job(app: &AppHandle, pdf_path: &str, meta: &PrintJobMeta) -> Result<(), String> {

//         println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
//         println!(" PRINT JOB RECEIVED");
//         println!("   File      : {}", meta.file_name);
//         println!("   Path      : {}", pdf_path);
//         println!("   Pages     : {}", meta.pages);
//         println!("   Copies    : {}", meta.copies);
//         println!("   Color     : {}", meta.color_mode);
//         println!("   Duplex    : {}", if meta.duplex { "Two-sided (long edge)" } else { "One-sided" });
//         println!("   PageRange : {}", meta.page_range.unwrap_or("all"));
//         println!("   Layout    : {}", meta.pages_per_sheet.unwrap_or("1"));
//         println!("   Session   : {}", meta.session_id);
//         println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

//         println!("  Checking printer before job...");
//         check_printer_ready()?;

//         let printers = get_printers();
//         let printer = printers
//             .iter()
//             .find(|p| p.name.to_lowercase().contains("canon"))
//             .ok_or_else(|| {
//                 let names: Vec<&str> = printers.iter().map(|p| p.name.as_str()).collect();
//                 format!("Canon printer not found. Available: {:?}", names)
//             })?;

//         println!(" Using printer : {}", printer.name);

//         // ── Pre-extract page range with qpdf ──────────────────────────────────────
//         // Canon drivers often ignore CUPS page-ranges when number-up is also set.
//         // Safer to slice the PDF first so we send exactly the right pages.
//     // ── Pre-extract page range with qpdf, then fix back-side rotation ────────────
//    let temp_pdf_path: Option<String> = if let Some(range) = meta.page_range {
//     let tmp_range = format!("{}.range.pdf", pdf_path);
    
//     // ← ADD THIS: normalize "1-2 4" → "1-2,4" for qpdf
//     let normalized_range = range
//         .split_whitespace()
//         .collect::<Vec<_>>()
//         .join(",");
    
//     println!("   Pre-extracting pages {} → {}", normalized_range, tmp_range);

//     let status = Command::new("qpdf")
//         .arg("--empty")
//         .arg("--pages")
//         .arg(pdf_path)
//         .arg(&normalized_range)   // ← use normalized_range, not range
//         .arg("--")
//         .arg(&tmp_range)
//         .status()
//         .map_err(|e| format!("qpdf not available: {}. Run: sudo apt install qpdf", e))?;

//     if !status.success() {
//         return Err(format!("qpdf failed to extract page range '{}'", normalized_range));
//     }

//         // If duplex + 2-up: rotate back-side pages 180° so they print correctly
//         // after the long-edge flip. In 2-up, every sheet has 2 logical pages on
//         // the front and 2 on the back. The back pages are positions 3,4,7,8,...
//         // i.e. pages in the second half of each group of 4.
//         // Simplest reliable fix: rotate ALL even-numbered sheets' worth of pages.
//         // With number-up=2, sheet N front = pages (2N-1, 2N), back = (2N+1, 2N+2).
//         // So back pages = 3,4,7,8,11,12,... → rotate those 180°.
//         if meta.duplex && meta.pages_per_sheet.map(|n| n.trim() == "2").unwrap_or(false) {
//             let tmp_rotated = format!("{}.rotated.pdf", pdf_path);
//             println!("   Rotating back-side pages 180° for duplex 2-up");

//             // qpdf --rotate=180:3,4,7,8,... is complex to generate dynamically.
//             // Easier: rotate even-numbered sheets (pages 3-4, 7-8, ...) = 
//             // every page where ((page-1)/2) is odd.
//             // The cleanest qpdf approach: rotate pages z+1 through z+2 for each
//             // back side. We use --rotate=+180 on a page range expression.
//             // qpdf supports: --rotate=[+|-]angle[:page-range]
//             // Back pages in a 2-up duplex doc of N pages: 3-4, 7-8, 11-12, ...
//             // Generate that list dynamically:
//             let page_count = get_pdf_page_count(&tmp_range)?;
//             let mut back_pages: Vec<String> = Vec::new();
//             let mut sheet = 0;
//             let mut page  = 1u32;
//             while page <= page_count {
//                 if sheet % 2 == 1 {
//                     // This is a back-side group (pages page and page+1)
//                     let end = (page + 1).min(page_count);
//                     back_pages.push(format!("{}-{}", page, end));
//                 }
//                 sheet += 1;
//                 page  += 2;
//             }

//             if !back_pages.is_empty() {
//                 let rotate_range = back_pages.join(",");
//                 println!("   Back-side page groups to rotate: {}", rotate_range);

//                 let status = Command::new("qpdf")
//                     .arg(&tmp_range)
//                     .arg(format!("--rotate=+180:{}", rotate_range))
//                     .arg(&tmp_rotated)
//                     .status()
//                     .map_err(|e| format!("qpdf rotate failed: {}", e))?;

//                 if !status.success() {
//                     return Err("qpdf failed to rotate back-side pages".to_string());
//                 }

//                 let _ = fs::remove_file(&tmp_range);
//                 Some(tmp_rotated)
//             } else {
//                 Some(tmp_range)
//             }
//         } else {
//             Some(tmp_range)
//         }
//     } else if meta.duplex && meta.pages_per_sheet.map(|n| n.trim() == "2").unwrap_or(false) {
//         // No page range but still duplex + 2-up — rotate back pages of full PDF
//         let tmp_rotated = format!("{}.rotated.pdf", pdf_path);
//         let page_count  = get_pdf_page_count(pdf_path)?;
//         let mut back_pages: Vec<String> = Vec::new();
//         let mut sheet = 0;
//         let mut page  = 1u32;
//         while page <= page_count {
//             if sheet % 2 == 1 {
//                 let end = (page + 1).min(page_count);
//                 back_pages.push(format!("{}-{}", page, end));
//             }
//             sheet += 1;
//             page  += 2;
//         }
//         if !back_pages.is_empty() {
//             let rotate_range = back_pages.join(",");
//             println!("   Rotating back-side pages 180° (no range): {}", rotate_range);
//             let status = Command::new("qpdf")
//                 .arg(pdf_path)
//                 .arg(format!("--rotate=+180:{}", rotate_range))
//                 .arg(&tmp_rotated)
//                 .status()
//                 .map_err(|e| format!("qpdf rotate failed: {}", e))?;
//             if !status.success() {
//                 return Err("qpdf failed to rotate back-side pages".to_string());
//             }
//             Some(tmp_rotated)
//         } else {
//             None
//         }
//     } else {
//         None
//     };

//         // Use the sliced PDF if we created one, otherwise the original
//         let effective_pdf = temp_pdf_path.as_deref().unwrap_or(pdf_path);

//         let data = fs::read(effective_pdf)
//             .map_err(|e| format!("Failed to read PDF: {}", e))?;

//         // Clean up temp file immediately after reading into memory
//         if let Some(ref tmp) = temp_pdf_path {
//             let _ = fs::remove_file(tmp);
//         }

//         let sides_str  = if meta.duplex { "two-sided-long-edge" } else { "one-sided" };
//         let copies_str = meta.copies.to_string();

//         // ── Build CUPS options ────────────────────────────────────────────────────
//         let mut props: Vec<(&str, String)> = vec![
//             ("copies",           copies_str.clone()),
//             ("print-color-mode", meta.color_mode.to_string()),
//             ("sides",            sides_str.to_string()),
//             ("media",            MEDIA.to_string()),
//             ("collate",          "true".to_string()),
//         ];

//         // ── number-up (2 pages per sheet) ────────────────────────────────────────
//         if let Some(nup) = meta.pages_per_sheet {
//             if nup.trim() == "2" {
//                 println!("   Applying 2-up layout (duplex={})", meta.duplex);
//                 props.push(("number-up", "2".to_string()));

//             if meta.duplex {
//         props.push(("orientation-requested", "3".to_string())); // portrait
//         props.push(("number-up-layout",      "tblr".to_string())); // ← was btlr
//     } else {
//         props.push(("orientation-requested", "4".to_string())); // landscape
//         props.push(("number-up-layout",      "lrtb".to_string()));
//     }
//             }
//         }

//         // NOTE: page-ranges intentionally NOT sent — qpdf already sliced the PDF
//         // above. Sending page-ranges alongside number-up causes Canon to ignore
//         // one or both options unpredictably.

//         let props_ref: Vec<(&str, &str)> = props.iter().map(|(k, v)| (*k, v.as_str())).collect();

//         let options = PrinterJobOptions {
//             name: Some("Kiosk Print"),
//             raw_properties: &props_ref,
//             converter: Converter::None,
//         };

//         match printer.print(&data, options) {
//             Ok(job_id) => {
//                 println!("✅ Print job submitted — Job ID : {job_id}");
//                 println!("   Waiting for {} sheet(s) × {} cop(ies)…", meta.pages, meta.copies);
//                 let _ = app.emit("printer:started", job_id);
//                 notify(job_id as u32, "started", meta.session_id);

//                 let result = wait_for_job(app, job_id as u32, meta);

//                 match &result {
//                     Ok(_) => {
//                         delete_pdf(pdf_path);
//                     }
//                     Err(e) if e.to_lowercase().contains("disconnected") => {
//                         println!("⚠️  Keeping PDF for retry after disconnect: {}", pdf_path);
//                     }
//                     Err(_) => {
//                         delete_pdf(pdf_path);
//                     }
//                 }

//                 result
//             }
//             Err(e) => {
//                 println!("❌ Failed to submit print job: {:?}", e);
//                 let _ = app.emit("printer:failed", format!("{:?}", e));
//                 notify(0, "submit_failed", meta.session_id);
//                 delete_pdf(pdf_path);
//                 Err(format!("Failed to submit print job: {:?}", e))
//             }
//         }
//     }
//     pub fn check_printer_ready() -> Result<(), String> {
//         if !is_usb_present() {
//             return Err("Printer is not connected. Please contact staff.".into());
//         }
//         let status = get_printer_status()?;

//         println!("── lpstat -p -l output ─────────────────────────");
//         for line in status.lines() {
//             println!("  | {}", line);
//         }
//         println!("─────────────────────────────────────────────────");

//         if let Some(msg) = blocking_error_message(&status) {
//             return Err(msg);
//         }
//         println!("Printer ready");
//         Ok(())
//     }

//     pub fn is_printer_ready() -> bool {
//         check_printer_ready().is_ok()
//     }


//     fn wait_for_job(app: &AppHandle, job_id: u32, meta: &PrintJobMeta) -> Result<(), String> {
//         let mut notified_paper_empty = false;
//         let mut notified_paper_jam   = false;
//         let mut notified_ink_empty   = false;
//         let mut notified_ink_low     = false;

//         let mut stall_polls: u32 = 0;
//         let mut ipp_alert_active = false;

//         let total_impressions: u32 = meta.pages * meta.copies;
//         let secs_per_page:     u64 = 8;
//         let expected_secs:     u64 = (total_impressions as u64 * secs_per_page).max(1);

//         let started          = Instant::now();
//         let mut last_pct: u8 = 0;

//         // ── Paused-elapsed tracking ───────────────────────────────────────────────
//         let mut paused_duration          = Duration::ZERO;
//         let mut pause_started: Option<Instant> = None;

//         macro_rules! active_elapsed {
//             () => {{
//                 let paused_now = pause_started
//                     .map(|p| p.elapsed())
//                     .unwrap_or(Duration::ZERO);
//                 started.elapsed().saturating_sub(paused_duration + paused_now)
//             }};
//         }

//         loop {
//             // ── Timeout — only ticks while NOT paused ─────────────────────────────
//             if active_elapsed!() > Duration::from_secs(JOB_TIMEOUT_SECS) {
//                 println!("⏰ Print job timed out (job {})", job_id);
//                 let _ = app.emit("printer:timeout", ());
//                 notify(job_id, "timeout", meta.session_id);
//                 return Err("Print job timed out. Please contact staff.".into());
//             }

//         // ── Drop this block into wait_for_job, replacing the existing spawn ──────────
//     // Nothing else in printer_service.rs changes.

//     if !job_exists(job_id) {
//         println!("Print job {} completed [{} page(s) × {} cop(ies)]",
//             job_id, meta.pages, meta.copies);
//         let _ = app.emit("printer:page_progress", serde_json::json!({
//             "current": total_impressions,
//             "total":   total_impressions,
//             "pct":     100u8,
//         }));
//         let _ = app.emit("printer:completed", job_id);
//         notify(job_id, "completed", meta.session_id);

//         // Spawn session expiry with retry — survives temporary network loss
//         let session_owned = meta.session_id.to_string();
//         tauri::async_runtime::spawn(async move {
//             println!("🔄 Starting session expiry for {} (will retry on network failure)", session_owned);
//             match expire_session(&session_owned).await {
//                 Ok(_) => println!("✅ Session {} expired", session_owned),
//                 Err(e) => println!("❌ Could not expire session {}: {}", session_owned, e),
//             }
//         });

//         return Ok(());
//     }

//             if !is_usb_present() {
//                 println!("⚠️  Printer unplugged during job {}!", job_id);
//                 let _ = app.emit("printer:disconnected", ());
//                 notify(job_id, "disconnected", meta.session_id);
//                 return Err("Printer was disconnected. Please contact staff.".into());
//             }

//             // ── Collect status ────────────────────────────────────────────────────
//             let raw_status = get_printer_status().unwrap_or_default();
//             let job_status = get_job_status(job_id).unwrap_or_default();
//             let combined   = format!("{}\n{}", raw_status, job_status);
//             let alerts     = parse_alerts(&combined);
//             let raw_lower  = combined.to_lowercase();

//             if !alerts.is_empty() {
//                 println!("⚠️  lpstat alert tokens (job {}): {:?}", job_id, alerts);
//             }

//             // ── IPP probe: when to run ────────────────────────────────────────────
//             let canon_no_alerts = alerts.is_empty();
//             let should_stall_probe = if ipp_alert_active {
//                 true
//             } else if canon_no_alerts {
//                 stall_polls += 1;
//                 println!("⏳ Stall poll #{} for job {} (no lpstat alerts, job in queue)",
//                     stall_polls, job_id);
//                 stall_polls >= STALL_POLLS_BEFORE_PROBE
//             } else {
//                 stall_polls = 0;
//                 false
//             };

//             // ── Run IPP probe ─────────────────────────────────────────────────────
//             let ipp_tokens: Vec<String> = if should_stall_probe {
//                 let raw = probe_ipp_state();
//                 println!("🔎 IPP probe tokens (job {}): {:?}", job_id, raw);
//                 raw
//             } else {
//                 Vec::new()
//             };

//             // ── Merge lpstat + IPP ────────────────────────────────────────────────
//             let ipp_lower = ipp_tokens.join(" ").to_lowercase();
//             let all_lower = format!("{} {}", raw_lower, ipp_lower);

//             let has_jam = alerts.iter().any(|a| a.contains("media-jam"))
//                 || all_lower.contains("media-jam")
//                 || all_lower.contains("paper jam")
//                 || all_lower.contains("jammed");

//             let has_paper_empty = alerts.iter().any(|a| {
//                     a.contains("media-empty")
//                         || a.contains("media-needed")
//                         || a.contains("media-low")
//                         || a.contains("input-tray-missing")
//                 })
//                 || ipp_tokens.iter().any(|t| {
//                     t.contains("media-empty")
//                         || t.contains("media-needed")
//                         || t.contains("out-of-paper")
//                 })
//                 || all_lower.contains("out of paper")
//                 || all_lower.contains("media empty")
//                 || all_lower.contains("no paper")
//                 || all_lower.contains("paper out")
//                 || all_lower.contains("tray empty")
//                 || all_lower.contains("load paper")
//                 || all_lower.contains("no media");

//             let has_ink_empty = alerts.iter().any(|a| a.contains("marker-supply-empty"))
//                 || ipp_tokens.iter().any(|t| t.contains("marker-supply-empty"))
//                 || all_lower.contains("ink empty")
//                 || all_lower.contains("ink out")
//                 || all_lower.contains("cartridge empty");

//             // ── Pause / resume timeout clock ──────────────────────────────────────
//             let is_blocked = has_jam || has_paper_empty || has_ink_empty;
//             match (is_blocked, pause_started) {
//                 (true, None) => {
//                     pause_started = Some(Instant::now());
//                     println!("⏸️  Timeout clock paused (job {})", job_id);
//                 }
//                 (false, Some(p)) => {
//                     paused_duration += p.elapsed();
//                     pause_started = None;
//                     println!("▶️  Timeout clock resumed (job {}) — total paused: {:?}",
//                         job_id, paused_duration);
//                 }
//                 _ => {}
//             }

//             ipp_alert_active = is_blocked;

//             // ── Paper jam ─────────────────────────────────────────────────────────
//             if has_jam {
//                 if !notified_paper_jam {
//                     println!("🚨 Paper jam detected (job {})", job_id);
//                     let _ = app.emit("printer:paper_jam", ());
//                     notify(job_id, "paper_jam", meta.session_id);
//                     notified_paper_jam = true;
//                 }
//                 std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
//                 continue;
//             }
//             if notified_paper_jam {
//                 if should_stall_probe {
//                     println!("✅ Paper jam cleared (job {})", job_id);
//                     let _ = app.emit("printer:jam_cleared", ());
//                     notify(job_id, "jam_cleared", meta.session_id);
//                     notified_paper_jam = false;
//                     stall_polls = 0;
//                 } else {
//                     std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
//                     continue;
//                 }
//             }

//             // ── Paper empty ───────────────────────────────────────────────────────
//             if has_paper_empty {
//                 if !notified_paper_empty {
//                     println!("📭 Paper tray empty (job {})", job_id);
//                     let _ = app.emit("printer:paper_empty", ());
//                     notify(job_id, "paper_empty", meta.session_id);
//                     notified_paper_empty = true;
//                 }
//                 std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
//                 continue;
//             }
//             if notified_paper_empty {
//                 if should_stall_probe {
//                     println!("✅ Paper refilled — resuming (job {})", job_id);
//                     let _ = app.emit("printer:paper_refilled", ());
//                     notify(job_id, "paper_refilled", meta.session_id);
//                     notified_paper_empty = false;
//                     stall_polls = 0;
//                 } else {
//                     std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
//                     continue;
//                 }
//             }

//             // ── Ink empty ─────────────────────────────────────────────────────────
//             if has_ink_empty {
//                 if !notified_ink_empty {
//                     println!("🖊️  Ink empty (job {})", job_id);
//                     let _ = app.emit("printer:ink_empty", ());
//                     notify(job_id, "ink_empty", meta.session_id);
//                     notified_ink_empty = true;
//                 }
//                 std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
//                 continue;
//             }
//             if notified_ink_empty {
//                 if should_stall_probe {
//                     println!("✅ Ink replaced — resuming (job {})", job_id);
//                     let _ = app.emit("printer:ink_replaced", ());
//                     notify(job_id, "ink_replaced", meta.session_id);
//                     notified_ink_empty = false;
//                     stall_polls = 0;
//                 } else {
//                     std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
//                     continue;
//                 }
//             }

//             // ── Ink low (non-blocking) ────────────────────────────────────────────
//             if !notified_ink_low {
//                 let has_ink_low = alerts.iter().any(|a| {
//                         a.contains("marker-supply-low") || a.contains("marker-waste-almost-full")
//                     })
//                     || ipp_tokens.iter().any(|t| t.contains("marker-supply-low"))
//                     || all_lower.contains("ink low");
//                 if has_ink_low {
//                     println!("⚠️  Ink low — printing continues (job {})", job_id);
//                     let _ = app.emit("printer:ink_low", ());
//                     notify(job_id, "ink_low", meta.session_id);
//                     notified_ink_low = true;
//                 }
//             }

//             // ── Progress estimate (uses active elapsed, not wall clock) ───────────
//             let elapsed = active_elapsed!().as_secs();
//             let raw_pct = ((elapsed * 100) / expected_secs).min(99) as u8;
//             let pct: u8 = if raw_pct >= 90 {
//                 90 + ((raw_pct - 90) / 3).min(3)
//             } else {
//                 raw_pct
//             };
//             let pct = pct.max(last_pct);

//             if pct > last_pct {
//                 last_pct = pct;
//                 let est_current = ((pct as u32 * total_impressions) / 100).min(total_impressions);
//                 println!("🖨️  job {} | {}% | ~{}/{} page(s) | active {}s / ~{}s",
//                     job_id, pct, est_current, total_impressions, elapsed, expected_secs);
//                 let _ = app.emit("printer:page_progress", serde_json::json!({
//                     "current": est_current,
//                     "total":   total_impressions,
//                     "pct":     pct,
//                 }));
//             } else {
//                 println!("🖨️  job {} | {}% | active {}s / ~{}s", job_id, pct, elapsed, expected_secs);
//             }

//             std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
//         }
//     }


//     /// Deep-probe the printer via IPP to discover hardware state that lpstat -p -l
//     /// may not surface (common on Canon GX series connected over USB-IPP bridge).
//     fn probe_ipp_state() -> Vec<String> {
//         let mut tokens: Vec<String> = Vec::new();

//         let canon_queue = find_canon_queue_name();
//         if let Some(ref queue) = canon_queue {
//             let ipp_uri = format!("ipp://localhost/printers/{}", queue);

//             let test_script = r#"
//     {
//         NAME "Get printer-state-reasons"
//         OPERATION Get-Printer-Attributes
//         GROUP operation-attributes-tag
//         ATTR charset attributes-charset utf-8
//         ATTR language attributes-natural-language en
//         ATTR uri printer-uri $uri
//         STATUS successful-ok
//         EXPECT printer-state-reasons OF-TYPE keyword
//         DISPLAY printer-state-reasons
//         EXPECT printer-state-message OF-TYPE text
//         DISPLAY printer-state-message
//     }
//     "#;
//             let tmp_path = "/tmp/kiosk_ipp_probe.test";
//             if fs::write(tmp_path, test_script).is_ok() {
//                 if let Ok(out) = Command::new("ipptool")
//                     .arg("-tv")
//                     .arg(&ipp_uri)
//                     .arg(tmp_path)
//                     .output()
//                 {
//                     let text    = String::from_utf8_lossy(&out.stdout).to_lowercase();
//                     let errtext = String::from_utf8_lossy(&out.stderr).to_lowercase();
//                     println!("🔎 ipptool stdout:\n{}", text);
//                     println!("🔎 ipptool stderr:\n{}", errtext);

//                     for line in text.lines().chain(errtext.lines()) {
//                         if line.contains("printer-state-reasons") || line.contains("state-message") {
//                             let after = line.splitn(2, '=').nth(1).unwrap_or("").trim().to_string();
//                             for part in after.split(|c: char| c.is_whitespace() || c == ',') {
//                                 let tok = part.trim();
//                                 if !tok.is_empty() && tok != "none" {
//                                     tokens.push(tok.to_string());
//                                 }
//                             }
//                         }
//                     }

//                     if !tokens.is_empty() {
//                         println!("🔎 IPP tokens via ipptool: {:?}", tokens);
//                         return tokens;
//                     }
//                 }
//             }
//         }

//         if let Ok(out) = Command::new("lpstat").arg("-o").output() {
//             let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
//             println!("🔎 lpstat -o output:\n{}", text);
//             for keyword in &[
//                 "paper", "tray", "jam", "jammed", "empty", "media",
//                 "ink", "cartridge", "door", "open", "offline",
//             ] {
//                 if text.contains(keyword) {
//                     tokens.push(keyword.to_string());
//                 }
//             }
//             if !tokens.is_empty() {
//                 println!("🔎 IPP tokens via lpstat -o: {:?}", tokens);
//                 return tokens;
//             }
//         }

//         if let Some(ref queue) = canon_queue {
//             if let Ok(out) = Command::new("lpoptions")
//                 .arg("-p").arg(queue)
//                 .arg("-l")
//                 .output()
//             {
//                 let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
//                 println!("🔎 lpoptions -l output:\n{}", text);
//                 if text.contains("media-empty") || text.contains("media-needed") {
//                     tokens.push("media-empty".to_string());
//                 }
//             }
//         }

//         for lp_dev in &["/dev/usb/lp0", "/dev/usb/lp1", "/dev/usb/lp2"] {
//             if let Ok(mut file) = fs::File::open(lp_dev) {
//                 use std::io::Read;
//                 let mut buf = [0u8; 1];
//                 if file.read_exact(&mut buf).is_ok() {
//                     let status_byte = buf[0];
//                     println!("🔎 USB lp status byte from {}: 0x{:02X}", lp_dev, status_byte);
//                     if status_byte & 0x20 == 0 {
//                         tokens.push("media-empty".to_string());
//                         println!("🔎 USB status: paper-out bit set");
//                     }
//                     break;
//                 }
//             }
//         }

//         tokens
//     }

//     fn find_canon_queue_name() -> Option<String> {
//         Command::new("lpstat")
//             .arg("-p")
//             .output()
//             .ok()
//             .and_then(|o| {
//                 let text = String::from_utf8_lossy(&o.stdout).into_owned();
//                 text.lines()
//                     .find(|l| l.to_lowercase().contains("canon"))
//                     .and_then(|l| l.split_whitespace().nth(1))
//                     .map(|s| s.to_string())
//             })
//     }

//     fn get_printer_status() -> Result<String, String> {
//         Command::new("lpstat")
//             .arg("-p")
//             .arg("-l")
//             .output()
//             .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
//             .map_err(|e| format!("lpstat error: {}", e))
//     }

//     fn get_job_status(job_id: u32) -> Result<String, String> {
//         Command::new("lpstat")
//             .arg("-o")
//             .output()
//             .map(|o| {
//                 let text = String::from_utf8_lossy(&o.stdout).into_owned();
//                 text.lines()
//                     .filter(|l| l.contains(&job_id.to_string()) || l.to_lowercase().contains("reason"))
//                     .collect::<Vec<_>>()
//                     .join("\n")
//             })
//             .map_err(|e| format!("lpstat -o error: {}", e))
//     }

//     fn parse_alerts(status: &str) -> Vec<String> {
//         let mut in_canon = false;
//         let mut tokens   = Vec::new();

//         for line in status.lines() {
//             let trimmed = line.trim_start();
//             if trimmed.starts_with("printer ") {
//                 in_canon = trimmed.to_lowercase().contains("canon");
//             }
//             if !in_canon { continue; }

//             let lower = line.to_lowercase();

//             let is_alerts  = lower.contains("alerts:");
//             let is_reasons = lower.contains("state-reasons") || lower.contains("state-message");

//             if is_alerts || is_reasons {
//                 let after = line.splitn(2, ':').nth(1).unwrap_or("").trim().to_lowercase();
//                 for token in after.split_whitespace() {
//                     if token != "none" {
//                         tokens.push(token.to_string());
//                     }
//                 }
//             }
//         }
//         tokens
//     }

//     fn blocking_error_message(status: &str) -> Option<String> {
//         // ── Extract only the Canon printer's section ──────────────────────────
//         let canon_section = extract_canon_section(status);
//         let lower = canon_section.to_lowercase();

//         if lower.contains("disabled") {
//             return Some("Printer is disabled. Please contact staff.".into());
//         }

//         let alerts = parse_alerts(status); // already Canon-scoped
        
//         let paper_empty = alerts.iter().any(|a| {
//                 a.contains("media-empty") || a.contains("media-needed") || a.contains("media-low")
//             })
//             || lower.contains("out of paper")
//             || lower.contains("no paper")
//             || lower.contains("paper out");

//         if paper_empty {
//             return Some("Paper tray is empty. Please contact staff.".into());
//         }

//         for alert in &alerts {
//             if alert.contains("media-jam") {
//                 return Some("Paper jam detected. Please contact staff.".into());
//             }
//             if alert.contains("offline") || lower.contains("offline") {
//                 return Some("Printer is offline. Please contact staff.".into());
//             }
//             if alert.contains("door-open") {
//                 return Some("Printer door is open. Please contact staff.".into());
//             }
//             if alert.contains("marker-supply-empty") {
//                 return Some("Ink cartridge is empty. Please contact staff.".into());
//             }
//         }

//         None
//     }

//     /// Extract the lpstat block that belongs to the Canon printer only.
//     /// lpstat -p -l groups per-printer: each "printer <name> ..." line starts
//     /// a new block; we grab from the Canon line until the next "printer " line.
//     fn extract_canon_section(status: &str) -> String {
//         let mut in_canon = false;
//         let mut lines: Vec<&str> = Vec::new();

//         for line in status.lines() {
//             let trimmed = line.trim_start();
//             if trimmed.starts_with("printer ") {
//                 in_canon = trimmed.to_lowercase().contains("canon");
//             }
//             if in_canon {
//                 lines.push(line);
//             }
//         }

//         lines.join("\n")
//     }
//     fn is_usb_present() -> bool {
//         Command::new("lsusb")
//             .output()
//             .map(|o| {
//                 let text  = String::from_utf8_lossy(&o.stdout).to_lowercase();
//                 let found = text.contains("04a9");
//                 println!("🔌 Canon USB: {}", if found { "found" } else { "NOT found" });
//                 found
//             })
//             .unwrap_or_else(|e| {
//                 println!("lsusb unavailable: {} — assuming connected", e);
//                 true
//             })
//     }

//     fn job_exists(job_id: u32) -> bool {
//         Command::new("lpstat")
//             .arg("-W")
//             .arg("not-completed")
//             .output()
//             .map(|o| {
//                 let text = String::from_utf8_lossy(&o.stdout);
//                 text.contains(&job_id.to_string())
//             })
//             .unwrap_or(false)
//     }

//     fn delete_pdf(path: &str) {
//         match fs::remove_file(path) {
//             Ok(_)  => println!("🗑️  PDF deleted: {}", path),
//             Err(e) => println!("⚠️  Could not delete PDF {}: {}", path, e),
//         }
//     }


//     /// Returns the number of pages in a PDF using qpdf.
//     fn get_pdf_page_count(pdf_path: &str) -> Result<u32, String> {
//         let out = Command::new("qpdf")
//             .arg("--show-npages")
//             .arg(pdf_path)
//             .output()
//             .map_err(|e| format!("qpdf --show-npages failed: {}", e))?;

//         let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
//         text.parse::<u32>()
//             .map_err(|_| format!("Could not parse page count from qpdf: '{}'", text))
//     }




use printers::common::base::job::PrinterJobOptions;
use printers::common::converters::Converter;
use printers::get_printers;

use std::fs;
use std::process::Command;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use crate::services::expire_session::expire::expire_session;
use crate::services::server::printer_event_service::notify_printer_event;


const MEDIA:                    &str = "A4";
const JOB_POLL_SECS:            u64  = 3;
const STALL_POLLS_BEFORE_PROBE: u32  = 3;

// ── Job metadata passed in from the command layer ────────────────────────────
pub struct PrintJobMeta<'a> {
    pub file_name:       &'a str,
    pub pages:           u32,
    pub copies:          u32,
    pub color_mode:      &'a str,
    pub duplex:          bool,
    pub page_range:      Option<&'a str>,
    pub pages_per_sheet: Option<&'a str>,
    pub session_id:      &'a str,
}

// ── Fire-and-forget backend notifier ─────────────────────────────────────────
fn notify(job_id: u32, event: &str, session_id: &str) {
    let event_owned   = event.to_string();
    let session_owned = session_id.to_string();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = notify_printer_event(job_id, &event_owned, &session_owned).await {
            println!("  printer_event_service error: {}", e);
        }
    });
}

pub fn send_print_job(app: &AppHandle, pdf_path: &str, meta: &PrintJobMeta) -> Result<(), String> {

    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!(" PRINT JOB RECEIVED");
    println!("   File      : {}", meta.file_name);
    println!("   Path      : {}", pdf_path);
    println!("   Pages     : {}", meta.pages);
    println!("   Copies    : {}", meta.copies);
    println!("   Color     : {}", meta.color_mode);
    println!("   Duplex    : {}", if meta.duplex { "Two-sided (long edge)" } else { "One-sided" });
    println!("   PageRange : {}", meta.page_range.unwrap_or("all"));
    println!("   Layout    : {}", meta.pages_per_sheet.unwrap_or("1"));
    println!("   Session   : {}", meta.session_id);
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

    println!(" Using printer : {}", printer.name);

    // ── Pre-extract page range with qpdf, then fix back-side rotation ─────────
    let temp_pdf_path: Option<String> = if let Some(range) = meta.page_range {

        // FIX 1: normalize space-separated ranges → comma-separated
        // Backend sends "1-2 4" but qpdf requires "1-2,4"
        let normalized_range = range
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(",");

        // FIX 2: skip qpdf entirely when range covers all pages
        // e.g. "1-12" for a 12-page doc = no slicing needed
        // Also avoids the "object has offset 0" qpdf warning on some PDFs
        let is_full_range = {
            let parts: Vec<&str> = normalized_range.split(',').collect();
            if parts.len() == 1 {
                if let Some((start, end)) = parts[0].split_once('-') {
                    start.trim() == "1"
                        && end.trim().parse::<u32>().ok() == Some(meta.pages)
                } else {
                    normalized_range.trim().parse::<u32>().ok() == Some(1) && meta.pages == 1
                }
            } else {
                false
            }
        };

        if is_full_range {
            println!("   PageRange '{}' covers all {} pages — skipping qpdf extraction",
                normalized_range, meta.pages);
            None // use original PDF, handle duplex rotation below if needed
        } else {
            let tmp_range = format!("{}.range.pdf", pdf_path);
            println!("   Pre-extracting pages '{}' → {} (raw input: '{}')",
                normalized_range, tmp_range, range);

            // FIX 3: --warning-exit-0 so qpdf PDF-structure warnings don't
            // cause a non-zero exit code and a false "qpdf failed" error
            let status = Command::new("qpdf")
                .arg("--warning-exit-0")
                .arg("--empty")
                .arg("--pages")
                .arg(pdf_path)
                .arg(&normalized_range)
                .arg("--")
                .arg(&tmp_range)
                .status()
                .map_err(|e| format!("qpdf not available: {}. Run: sudo apt install qpdf", e))?;

            if !status.success() {
                return Err(format!("qpdf failed to extract page range '{}'", normalized_range));
            }

            // If duplex + 2-up: rotate back-side pages 180° so they print correctly
            if meta.duplex && meta.pages_per_sheet.map(|n| n.trim() == "2").unwrap_or(false) {
                let tmp_rotated = format!("{}.rotated.pdf", pdf_path);
                println!("   Rotating back-side pages 180° for duplex 2-up");

                let page_count = get_pdf_page_count(&tmp_range)?;
                let mut back_pages: Vec<String> = Vec::new();
                let mut sheet = 0;
                let mut page  = 1u32;
                while page <= page_count {
                    if sheet % 2 == 1 {
                        let end = (page + 1).min(page_count);
                        back_pages.push(format!("{}-{}", page, end));
                    }
                    sheet += 1;
                    page  += 2;
                }

                if !back_pages.is_empty() {
                    let rotate_range = back_pages.join(",");
                    println!("   Back-side page groups to rotate: {}", rotate_range);

                    let status = Command::new("qpdf")
                        .arg("--warning-exit-0")
                        .arg(&tmp_range)
                        .arg(format!("--rotate=+180:{}", rotate_range))
                        .arg(&tmp_rotated)
                        .status()
                        .map_err(|e| format!("qpdf rotate failed: {}", e))?;

                    if !status.success() {
                        return Err("qpdf failed to rotate back-side pages".to_string());
                    }

                    let _ = fs::remove_file(&tmp_range);
                    Some(tmp_rotated)
                } else {
                    Some(tmp_range)
                }
            } else {
                Some(tmp_range)
            }
        }
    } else {
        None
    };

    // ── Duplex + 2-up on full PDF (no page range slicing was done) ────────────
    let temp_pdf_path: Option<String> = if temp_pdf_path.is_none()
        && meta.duplex
        && meta.pages_per_sheet.map(|n| n.trim() == "2").unwrap_or(false)
    {
        let tmp_rotated = format!("{}.rotated.pdf", pdf_path);
        let page_count  = get_pdf_page_count(pdf_path)?;
        let mut back_pages: Vec<String> = Vec::new();
        let mut sheet = 0;
        let mut page  = 1u32;
        while page <= page_count {
            if sheet % 2 == 1 {
                let end = (page + 1).min(page_count);
                back_pages.push(format!("{}-{}", page, end));
            }
            sheet += 1;
            page  += 2;
        }
        if !back_pages.is_empty() {
            let rotate_range = back_pages.join(",");
            println!("   Rotating back-side pages 180° (full PDF): {}", rotate_range);
            let status = Command::new("qpdf")
                .arg("--warning-exit-0")
                .arg(pdf_path)
                .arg(format!("--rotate=+180:{}", rotate_range))
                .arg(&tmp_rotated)
                .status()
                .map_err(|e| format!("qpdf rotate failed: {}", e))?;
            if !status.success() {
                return Err("qpdf failed to rotate back-side pages".to_string());
            }
            Some(tmp_rotated)
        } else {
            None
        }
    } else {
        temp_pdf_path
    };

    // Use the sliced/rotated PDF if we created one, otherwise the original
    let effective_pdf = temp_pdf_path.as_deref().unwrap_or(pdf_path);

    let data = fs::read(effective_pdf)
        .map_err(|e| format!("Failed to read PDF: {}", e))?;

    // Clean up temp file immediately after reading into memory
    if let Some(ref tmp) = temp_pdf_path {
        let _ = fs::remove_file(tmp);
    }

    let sides_str  = if meta.duplex { "two-sided-long-edge" } else { "one-sided" };
    let copies_str = meta.copies.to_string();

    // ── Build CUPS options ────────────────────────────────────────────────────
    let mut props: Vec<(&str, String)> = vec![
        ("copies",           copies_str.clone()),
        ("print-color-mode", meta.color_mode.to_string()),
        ("sides",            sides_str.to_string()),
        ("media",            MEDIA.to_string()),
        ("collate",          "true".to_string()),
    ];

    // ── number-up (2 pages per sheet) ────────────────────────────────────────
    if let Some(nup) = meta.pages_per_sheet {
        if nup.trim() == "2" {
            println!("   Applying 2-up layout (duplex={})", meta.duplex);
            props.push(("number-up", "2".to_string()));

            if meta.duplex {
                props.push(("orientation-requested", "3".to_string())); // portrait
                props.push(("number-up-layout",      "tblr".to_string()));
            } else {
                props.push(("orientation-requested", "4".to_string())); // landscape
                props.push(("number-up-layout",      "lrtb".to_string()));
            }
        }
    }

    // NOTE: page-ranges intentionally NOT sent — qpdf already sliced the PDF
    // above. Sending page-ranges alongside number-up causes Canon to ignore
    // one or both options unpredictably.

    let props_ref: Vec<(&str, &str)> = props.iter().map(|(k, v)| (*k, v.as_str())).collect();

    let options = PrinterJobOptions {
        name: Some("Kiosk Print"),
        raw_properties: &props_ref,
        converter: Converter::None,
    };

    match printer.print(&data, options) {
        Ok(job_id) => {
            println!("✅ Print job submitted — Job ID : {job_id}");
            println!("   Waiting for {} sheet(s) × {} cop(ies)…", meta.pages, meta.copies);
            let _ = app.emit("printer:started", job_id);
            notify(job_id as u32, "started", meta.session_id);

            let result = wait_for_job(app, job_id as u32, meta);

            match &result {
                Ok(_) => {
                    delete_pdf(pdf_path);
                }
                Err(e) if e.to_lowercase().contains("disconnected") => {
                    println!("⚠️  Keeping PDF for retry after disconnect: {}", pdf_path);
                }
                Err(_) => {
                    delete_pdf(pdf_path);
                }
            }

            result
        }
        Err(e) => {
            println!("❌ Failed to submit print job: {:?}", e);
            let _ = app.emit("printer:failed", format!("{:?}", e));
            notify(0, "submit_failed", meta.session_id);
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

    println!("── lpstat -p -l output ─────────────────────────");
    for line in status.lines() {
        println!("  | {}", line);
    }
    println!("─────────────────────────────────────────────────");

    if let Some(msg) = blocking_error_message(&status) {
        return Err(msg);
    }
    println!("Printer ready");
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

    let mut stall_polls: u32 = 0;
    let mut ipp_alert_active = false;

    let total_impressions: u32 = meta.pages * meta.copies;
    let secs_per_page:     u64 = 8;
    let expected_secs:     u64 = (total_impressions as u64 * secs_per_page).max(1);

    let started          = Instant::now();
    let mut last_pct: u8 = 0;

    // ── Paused-elapsed tracking (for progress bar only, no timeout) ───────────
    let mut paused_duration          = Duration::ZERO;
    let mut pause_started: Option<Instant> = None;

    macro_rules! active_elapsed {
        () => {{
            let paused_now = pause_started
                .map(|p| p.elapsed())
                .unwrap_or(Duration::ZERO);
            started.elapsed().saturating_sub(paused_duration + paused_now)
        }};
    }

    loop {
        // ── NO TIMEOUT: job waits forever until completed or disconnected ──────

        // ── Job completed ─────────────────────────────────────────────────────
        if !job_exists(job_id) {
            println!("Print job {} completed [{} page(s) × {} cop(ies)]",
                job_id, meta.pages, meta.copies);
            let _ = app.emit("printer:page_progress", serde_json::json!({
                "current": total_impressions,
                "total":   total_impressions,
                "pct":     100u8,
            }));
            let _ = app.emit("printer:completed", job_id);
            notify(job_id, "completed", meta.session_id);

            let session_owned = meta.session_id.to_string();
            tauri::async_runtime::spawn(async move {
                println!("🔄 Starting session expiry for {} (will retry on network failure)", session_owned);
                match expire_session(&session_owned).await {
                    Ok(_) => println!("✅ Session {} expired", session_owned),
                    Err(e) => println!("❌ Could not expire session {}: {}", session_owned, e),
                }
            });

            return Ok(());
        }

        // ── Printer disconnected ──────────────────────────────────────────────
        if !is_usb_present() {
            println!("⚠️  Printer unplugged during job {}!", job_id);
            let _ = app.emit("printer:disconnected", ());
            notify(job_id, "disconnected", meta.session_id);
            return Err("Printer was disconnected. Please contact staff.".into());
        }

        // ── Collect status ────────────────────────────────────────────────────
        let raw_status = get_printer_status().unwrap_or_default();
        let job_status = get_job_status(job_id).unwrap_or_default();
        let combined   = format!("{}\n{}", raw_status, job_status);
        let alerts     = parse_alerts(&combined);
        let raw_lower  = combined.to_lowercase();

        if !alerts.is_empty() {
            println!("⚠️  lpstat alert tokens (job {}): {:?}", job_id, alerts);
        }

        // ── IPP probe: when to run ────────────────────────────────────────────
        let canon_no_alerts = alerts.is_empty();
        let should_stall_probe = if ipp_alert_active {
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

        // ── Merge lpstat + IPP ────────────────────────────────────────────────
        let ipp_lower = ipp_tokens.join(" ").to_lowercase();
        let all_lower = format!("{} {}", raw_lower, ipp_lower);

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

        // ── Pause / resume progress clock (no timeout, just for progress bar) ─
        let is_blocked = has_jam || has_paper_empty || has_ink_empty;
        match (is_blocked, pause_started) {
            (true, None) => {
                pause_started = Some(Instant::now());
                println!("⏸️  Progress clock paused (job {})", job_id);
            }
            (false, Some(p)) => {
                paused_duration += p.elapsed();
                pause_started = None;
                println!("▶️  Progress clock resumed (job {}) — total paused: {:?}",
                    job_id, paused_duration);
            }
            _ => {}
        }

        ipp_alert_active = is_blocked;

        // ── Paper jam ─────────────────────────────────────────────────────────
        if has_jam {
            if !notified_paper_jam {
                println!("🚨 Paper jam detected (job {})", job_id);
                let _ = app.emit("printer:paper_jam", ());
                notify(job_id, "paper_jam", meta.session_id);
                notified_paper_jam = true;
            }
            std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
            continue;
        }
        if notified_paper_jam {
            if should_stall_probe {
                println!("✅ Paper jam cleared (job {})", job_id);
                let _ = app.emit("printer:jam_cleared", ());
                notify(job_id, "jam_cleared", meta.session_id);
                notified_paper_jam = false;
                stall_polls = 0;
            } else {
                std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
                continue;
            }
        }

        // ── Paper empty ───────────────────────────────────────────────────────
        if has_paper_empty {
            if !notified_paper_empty {
                println!("📭 Paper tray empty (job {})", job_id);
                let _ = app.emit("printer:paper_empty", ());
                notify(job_id, "paper_empty", meta.session_id);
                notified_paper_empty = true;
            }
            std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
            continue;
        }
        if notified_paper_empty {
            if should_stall_probe {
                println!("✅ Paper refilled — resuming (job {})", job_id);
                let _ = app.emit("printer:paper_refilled", ());
                notify(job_id, "paper_refilled", meta.session_id);
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
                notify(job_id, "ink_empty", meta.session_id);
                notified_ink_empty = true;
            }
            std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
            continue;
        }
        if notified_ink_empty {
            if should_stall_probe {
                println!("✅ Ink replaced — resuming (job {})", job_id);
                let _ = app.emit("printer:ink_replaced", ());
                notify(job_id, "ink_replaced", meta.session_id);
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
                notify(job_id, "ink_low", meta.session_id);
                notified_ink_low = true;
            }
        }

        // ── Progress estimate (uses active elapsed, not wall clock) ───────────
        let elapsed = active_elapsed!().as_secs();
        let raw_pct = ((elapsed * 100) / expected_secs).min(99) as u8;
        let pct: u8 = if raw_pct >= 90 {
            90 + ((raw_pct - 90) / 3).min(3)
        } else {
            raw_pct
        };
        let pct = pct.max(last_pct);

        if pct > last_pct {
            last_pct = pct;
            let est_current = ((pct as u32 * total_impressions) / 100).min(total_impressions);
            println!("🖨️  job {} | {}% | ~{}/{} page(s) | active {}s / ~{}s",
                job_id, pct, est_current, total_impressions, elapsed, expected_secs);
            let _ = app.emit("printer:page_progress", serde_json::json!({
                "current": est_current,
                "total":   total_impressions,
                "pct":     pct,
            }));
        } else {
            println!("🖨️  job {} | {}% | active {}s / ~{}s", job_id, pct, elapsed, expected_secs);
        }

        std::thread::sleep(Duration::from_secs(JOB_POLL_SECS));
    }
}


/// Deep-probe the printer via IPP to discover hardware state that lpstat -p -l
/// may not surface (common on Canon GX series connected over USB-IPP bridge).
fn probe_ipp_state() -> Vec<String> {
    let mut tokens: Vec<String> = Vec::new();

    let canon_queue = find_canon_queue_name();
    if let Some(ref queue) = canon_queue {
        let ipp_uri = format!("ipp://localhost/printers/{}", queue);

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
                let text    = String::from_utf8_lossy(&out.stdout).to_lowercase();
                let errtext = String::from_utf8_lossy(&out.stderr).to_lowercase();
                println!("🔎 ipptool stdout:\n{}", text);
                println!("🔎 ipptool stderr:\n{}", errtext);

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

    if let Ok(out) = Command::new("lpstat").arg("-o").output() {
        let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
        println!("🔎 lpstat -o output:\n{}", text);
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

    for lp_dev in &["/dev/usb/lp0", "/dev/usb/lp1", "/dev/usb/lp2"] {
        if let Ok(mut file) = fs::File::open(lp_dev) {
            use std::io::Read;
            let mut buf = [0u8; 1];
            if file.read_exact(&mut buf).is_ok() {
                let status_byte = buf[0];
                println!("🔎 USB lp status byte from {}: 0x{:02X}", lp_dev, status_byte);
                if status_byte & 0x20 == 0 {
                    tokens.push("media-empty".to_string());
                    println!("USB status: paper-out bit set");
                }
                break;
            }
        }
    }

    tokens
}

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

fn get_printer_status() -> Result<String, String> {
    Command::new("lpstat")
        .arg("-p")
        .arg("-l")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .map_err(|e| format!("lpstat error: {}", e))
}

fn get_job_status(job_id: u32) -> Result<String, String> {
    Command::new("lpstat")
        .arg("-o")
        .output()
        .map(|o| {
            let text = String::from_utf8_lossy(&o.stdout).into_owned();
            text.lines()
                .filter(|l| l.contains(&job_id.to_string()) || l.to_lowercase().contains("reason"))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .map_err(|e| format!("lpstat -o error: {}", e))
}

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
    let canon_section = extract_canon_section(status);
    let lower = canon_section.to_lowercase();

    if lower.contains("disabled") {
        return Some("Printer is disabled. Please contact staff.".into());
    }

    let alerts = parse_alerts(status);

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

fn extract_canon_section(status: &str) -> String {
    let mut in_canon = false;
    let mut lines: Vec<&str> = Vec::new();

    for line in status.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("printer ") {
            in_canon = trimmed.to_lowercase().contains("canon");
        }
        if in_canon {
            lines.push(line);
        }
    }

    lines.join("\n")
}

fn is_usb_present() -> bool {
    Command::new("lsusb")
        .output()
        .map(|o| {
            let text  = String::from_utf8_lossy(&o.stdout).to_lowercase();
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

/// Returns the number of pages in a PDF using qpdf.
fn get_pdf_page_count(pdf_path: &str) -> Result<u32, String> {
    let out = Command::new("qpdf")
        .arg("--show-npages")
        .arg(pdf_path)
        .output()
        .map_err(|e| format!("qpdf --show-npages failed: {}", e))?;

    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    text.parse::<u32>()
        .map_err(|_| format!("Could not parse page count from qpdf: '{}'", text))
}