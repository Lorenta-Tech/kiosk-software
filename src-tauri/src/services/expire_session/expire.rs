use reqwest::Client;
use std::time::Duration;

const API_BASE_URL: &str = "https://kiosk-server-production.duckdns.org";
const INITIAL_DELAY: u64 = 3;
const MAX_DELAY: u64 = 60;

async fn async_std_sleep(secs: u64) {
    let (tx, rx) = std::sync::mpsc::channel::<()>();

    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(secs));
        let _ = tx.send(());
    });

    tauri::async_runtime::spawn_blocking(move || {
        let _ = rx.recv();
    })
    .await
    .unwrap_or(());
}

pub async fn expire_session(session_id: &str) -> Result<(), String> {
    let url = format!("{}/print/jobs/expire", API_BASE_URL);

    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let mut delay_secs = INITIAL_DELAY;
    let mut attempt: u64 = 1;

    loop {
        println!("⏳ Expiring session {} (attempt #{})", session_id, attempt);

        let result = client
            .post(&url)
            .json(&serde_json::json!({
                "session_id": session_id
            }))
            .send()
            .await;

        match result {
            Ok(resp) if resp.status().is_success() => {
                println!("✅ Session {} expired successfully", session_id);
                return Ok(());
            }

            Ok(resp) => {
                let status = resp.status();

                if status.is_client_error()
                    && status.as_u16() != 408
                    && status.as_u16() != 429
                {
                    let body = resp.text().await.unwrap_or_default();
                    println!("❌ Server rejected request permanently ({}): {}", status, body);
                    return Err(format!("Permanent failure while expiring session: {}", status));
                }

                println!("⚠️ Server error {} on attempt #{} — retrying in {}s", status, attempt, delay_secs);
            }

            Err(e) => {
                println!("⚠️ Network error on attempt #{}: {} — retrying in {}s", attempt, e, delay_secs);
            }
        }

        async_std_sleep(delay_secs).await;
        delay_secs = (delay_secs * 2).min(MAX_DELAY);
        attempt += 1;
    }
}