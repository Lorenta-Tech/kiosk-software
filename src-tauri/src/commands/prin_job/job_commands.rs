use crate::services::pdf_job::job_services;
#[tauri::command]
pub async fn download_pdf_url_commands(url : &str , file_name : &str )-> Result<String , String>{
job_services::dowload_pdf(&url , &file_name).await
}