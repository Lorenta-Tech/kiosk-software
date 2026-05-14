#[tauri::command]

pub fn check_printer_ready_command() -> Result<(), String> {
    crate::services::print::printer_service::check_printer_ready()
}