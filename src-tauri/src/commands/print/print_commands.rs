    use crate::services::print::printer_service::{self, PrintJobMeta};

    #[tauri::command]
pub async fn print_pdf_command(
    app:             tauri::AppHandle,
    pdf_path:        String,
    file_name:       String,
    pages:           u32,
    copies:          u32,
    color_mode:      String,
    duplex:          bool,
    page_range:      Option<String>,
    pages_per_sheet: Option<String>,
    session_id:      String,
) -> Result<(), String> {

    tauri::async_runtime::spawn_blocking(move || {
        let page_range_owned      = page_range;
        let pages_per_sheet_owned = pages_per_sheet;

        let meta = PrintJobMeta {
            file_name:       &file_name,
            pages,
            copies,
            color_mode:      &color_mode,
            duplex,
            page_range:      page_range_owned.as_deref(),
            pages_per_sheet: pages_per_sheet_owned.as_deref(),
            session_id:      &session_id,
        };

        printer_service::send_print_job(&app, &pdf_path, &meta)
    })
    .await
    .map_err(|e| format!("Thread error: {e}"))??;

    Ok(())
}