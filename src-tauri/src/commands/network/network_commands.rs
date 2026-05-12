#[tauri::command]
pub async fn check_internet() -> bool {
    reqwest::get("https://www.google.com")
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}