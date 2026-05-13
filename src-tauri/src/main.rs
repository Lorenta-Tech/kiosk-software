#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod services;
mod modules;
mod commands;

use tauri::{Manager, WindowEvent};

fn main() {
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .setup(|app| {

            let window = app.get_webview_window("main").unwrap();

            // Fullscreen
            window.set_fullscreen(true).unwrap();

            // Always on top
            window.set_always_on_top(true).unwrap();

            // Prevent resize
            window.set_resizable(false).unwrap();

            // Hide decorations/titlebar
            window.set_decorations(false).unwrap();

            // Focus window
            window.set_focus().unwrap();

            Ok(())
        })

        .on_window_event(|window, event| {
            match event {
                // Prevent close
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                }

                // Re-focus if user switches away
                WindowEvent::Focused(false) => {
                    let _ = window.set_focus();
                }

                _ => {}
            }
        })

        .invoke_handler(tauri::generate_handler![
            commands::otp::otp_commands::verify_otp_commands,
            commands::pdf_job::job_commands::download_pdf_url_commands,
            commands::print::print_commands::print_pdf_command,
            commands::network::network_commands::check_internet,
        ])

        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}