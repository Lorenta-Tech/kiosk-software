// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod services;
mod modules;
mod commands;
fn main() {
    kiosk_engg_lib::run()
}
