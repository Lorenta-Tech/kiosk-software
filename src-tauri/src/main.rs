// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod services;
mod modules;
mod commands;
fn main() {
    dotenvy::dotenv().ok();
    tauri::Builder::default().invoke_handler(tauri::generate_handler![
    
    ])

    kiosk_engg_lib::run()
}
