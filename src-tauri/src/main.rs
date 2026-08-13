// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
            window.set_fullscreen(true).unwrap();
            window.set_always_on_top(true).unwrap();

            // Linux-only: strip WebKitGTK's native pinch-zoom gesture handler.
            // Uses a private GObject API — there's no public Tauri/wry API for
            // this yet. See: github.com/tauri-apps/wry/issues/544
            #[cfg(target_os = "linux")]
            {
                use glib::translate::ToGlibPtr;

                window.with_webview(|webview| {
                    let wk_view = webview.inner(); // webkit2gtk::WebView

                    unsafe {
                        let raw_ptr: *mut webkit2gtk_sys::WebKitWebView = wk_view.to_glib_none().0;
                        let ptr: *mut gobject_sys::GObject = raw_ptr as *mut gobject_sys::GObject;

                        let key = std::ffi::CString::new("wk-view-zoom-gesture").unwrap();
                        let data = gobject_sys::g_object_get_data(ptr, key.as_ptr());

                        if !data.is_null() {
                            gobject_sys::g_signal_handlers_destroy(data as *mut _);
                            println!("✅ WebKitGTK pinch-zoom gesture handler removed");
                        } else {
                            println!("⚠️  wk-view-zoom-gesture key not found — internal API may have changed");
                        }
                    }
                }).unwrap();
            }

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
            commands::checkPrinter::check::check_printer_ready_command,

        ])

        .run(tauri::generate_context!())

        .expect("error while running tauri app");
}