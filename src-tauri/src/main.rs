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

            window.set_decorations(false).unwrap();

            window.set_resizable(false).unwrap();

            window.set_always_on_top(true).unwrap();

            window.set_position(
                tauri::PhysicalPosition::new(0, 0)
            ).unwrap();

            window.set_size(
                tauri::PhysicalSize::new(1080, 1920)
            ).unwrap();

            Ok(())
        })

        .on_window_event(|window, event| {

            match event {

                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                }

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