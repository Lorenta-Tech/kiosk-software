
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod services;
mod modules;
mod commands;

fn main() {

    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::otp::otp_commands::verify_otp_commands,
            commands::pdf_job::job_commands::download_pdf_url_commands,

            commands::print::print_commands::print_pdf_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");


}