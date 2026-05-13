use crate::modules::job::token_job_response::TokenJobResponse;
use crate::services::otp::otp_services;

#[tauri::command]
pub async fn verify_otp_commands(otp: &str) -> Result<TokenJobResponse, String> {


    let token_int: i32 = otp.parse()
        .map_err(|_| "OTP must be a 6-digit number".to_string())?;
     println!("Parsed OTP: {}", token_int);

    otp_services::verify_otp(token_int).await
}