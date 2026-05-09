use serde_json::json;
use reqwest::Client;

pub async fn notify_printer_event(job_id: u32, event: &str, session_id: &str) -> Result<(), String> {
    let base_url = std::env::var("API_BASE_URL")
        .map_err(|_| "API_BASE_URL not set".to_string())?;

    let url = format!("{}/print/jobs/error", base_url);

    println!(" Notifying backend event: '{}' | job_id: {}", event, job_id);

    let error_code = match event {
        "paper_empty" => Some("paper_out_of_bounds"),
        "paper_jam"   => Some("paper_jam"),
        "ink_empty"   => Some("no_ink"),
        _             => None,
    };

    let Some(error_code) = error_code else {
        println!(" Event '{}' is not an error — skipping backend notify", event);
        return Ok(());
    };

    let client = Client::new();
    let response = client
        .post(&url)
        .json(&json!({
            "error":      error_code,
            "session_id": session_id,  // ← added
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to notify backend: {}", e))?;

    let status = response.status();
    let body   = response.text().await.unwrap_or_default();

    if !status.is_success() {
        println!("Backend error notify failed [{}]: {}", status, body);
    } else {
        println!("Backend notified successfully: {}", body);
    }

    Ok(())
}