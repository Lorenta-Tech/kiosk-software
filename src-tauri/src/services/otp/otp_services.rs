use super::modules::job::token_job_response::TokenJobResponse;

pub async fn verify_otp(otp : &str) -> Result<TokenJobResponse , String >{
    let base_url = std::env::var("API_BASE_URL");
    
}