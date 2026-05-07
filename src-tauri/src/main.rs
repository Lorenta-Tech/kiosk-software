// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// use crate::commands::otp::otp_commands;
// use crate::commands::prin_job::job_commands;
mod services;
mod modules;
mod commands;

fn main() {
    // Load .env
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::otp::otp_commands::verify_otp_commands,
            commands::prin_job::job_commands::download_pdf_url_commands
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");

    // If you REALLY need a custom loop
    // kiosk_engg_lib::run();
}