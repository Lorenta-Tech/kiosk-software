use crate::services::{pdf_job::job_services, print::printer_service};
#[tauri::command]
pub async fn download_pdf_url_commands(url: &str, file_name: &str) -> Result<String, String> {
    job_services::download_pdf(&url, &file_name).await
}


#[tauri::command]
pub async fn print_pdf_command(
    app: tauri::AppHandle,
    pdf_path: String,
) -> Result<(), String> {

    tauri::async_runtime::spawn_blocking(move || {
        printer_service::send_print_job(&app, &pdf_path)
    })
    .await
    .map_err(|e| format!("Thread error: {e}"))??; // flatten the two Result layers

    Ok(())
}

