use tauri::AppHandle;

use crate::services::print::printer_service::send_print_job;


#[tauri::command]
pub async fn cmd_print_file(app: AppHandle, pdf_path: String) -> Result<(), String> {
   send_print_job(&app, &pdf_path)
}