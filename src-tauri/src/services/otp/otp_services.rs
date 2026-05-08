use crate::modules::job::token_job_response::TokenJobResponse;

pub async fn verify_otp(otp: &str) -> Result<TokenJobResponse, String> {
    let base_url = std::env::var("API_BASE_URL")
        .map_err(|_| "API_BASE_URL not set in .env".to_string())?;

    let url = format!("{}/print/jobs/token?otp={}", base_url, otp);

    let response = reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err("Invalid OTP".into());
    }

    let data: TokenJobResponse = response
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(data)
}