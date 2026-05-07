use crate::modules::job::token_job_response::TokenJobResponse;
use crate::services::otp::otp_services;
#[tauri::command]
pub async fn verify_otp_commands(otp : &str)-> Result<TokenJobResponse , String>{
   otp_services::verify_otp(&otp).await
}