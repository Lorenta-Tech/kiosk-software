use crate::services::print::printer_service::{self, PrintJobMeta};

#[tauri::command]
pub async fn print_pdf_command(
    app:        tauri::AppHandle,
    pdf_path:   String,
    file_name:  String,
    pages:      u32,
    copies:     u32,
    color_mode: String,
    duplex:     bool,
    page_range: Option<String>,  
) -> Result<(), String> {

    tauri::async_runtime::spawn_blocking(move || {
        let meta = PrintJobMeta {
            file_name:  &file_name,
            pages,
            copies,
            color_mode: &color_mode,
            duplex,
            page_range: page_range.as_deref(),  
        };
        printer_service::send_print_job(&app, &pdf_path, &meta)
    })
    .await
    .map_err(|e| format!("Thread error: {e}"))??;

    Ok(())
}