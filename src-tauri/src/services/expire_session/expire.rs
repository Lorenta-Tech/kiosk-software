use reqwest::Client;

pub async fn expire_session(session_id: &str) -> Result<(), String> {
    let base_url = std::env::var("API_BASE_URL")
        .map_err(|_| "API_BASE_URL not set".to_string())?;

    let url = format!("{}/print/jobs/expire", base_url);

    println!("Expiring session: {}", session_id);

    let client = Client::new();
    let response = client
        .post(&url)
        .json(&serde_json::json!({
            "session_id": session_id,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to expire session: {}", e))?;

    let status = response.status();
    let body   = response.text().await.unwrap_or_default();

    if !status.is_success() {
        println!("Session expire failed [{}]: {}", status, body);
    } else {
        println!("Session expired successfully: {}", body);
    }

    Ok(())
}