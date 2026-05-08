use crate::modules::job::token_job_response::TokenJobResponse;
use serde_json::json;

pub async fn verify_otp(token: i32) -> Result<TokenJobResponse, String> {
    let base_url = std::env::var("API_BASE_URL")
        .map_err(|_| "API_BASE_URL not set in .env".to_string())?;

    let url = format!("{}/print/jobs/token", base_url);

    println!("Sending POST to: {}", url);
    println!("Token Payload: {}", token);

    let client = reqwest::Client::new();

    let response = client
        .post(&url)
        .json(&json!({ "token": token }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    println!("Status: {}", status);
    println!(" Response Body: {}", body);

    if !status.is_success() {
        return Err(format!("Invalid Token: {}", body));
    }

    let data: TokenJobResponse =
        serde_json::from_str(&body).map_err(|e| e.to_string())?;

    Ok(data)
}