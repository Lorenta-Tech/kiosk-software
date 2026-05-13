use std::{fs::File, io::Write};
use std::fs;
use reqwest::Client;

const DOWNLOAD_DIR: &str = "/tmp/kiosk_downloads";
const API_BASE_URL: &str = "https://kiosk-server-production.duckdns.org";

pub async fn download_pdf(url: &str, file_name: &str) -> Result<String, String> {
    fs::create_dir_all(DOWNLOAD_DIR)
        .map_err(|e| e.to_string())?;

    let full_path = format!("{}/{}", DOWNLOAD_DIR, file_name);

    let client = Client::new();

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("Download failed: {}", err_text));
    }

    if let Some(content_type) = response.headers().get(reqwest::header::CONTENT_TYPE) {
        let ct = content_type.to_str().unwrap_or("");
        if !ct.contains("pdf") && !ct.contains("octet-stream") {
            return Err(format!("Invalid file type received: {}", ct));
        }
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let mut file = File::create(&full_path)
        .map_err(|e| e.to_string())?;

    file.write_all(&bytes)
        .map_err(|e| e.to_string())?;

    Ok(full_path)
}