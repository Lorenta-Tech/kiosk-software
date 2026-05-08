use crate::modules::job::print_job_file::PrintJobFile;
  use serde::Serialize;
  use serde::Deserialize;
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PrintJob {
    pub session_id: String,
    pub status: String,
    pub total_amount: Option<f64>,
    pub total_sheets: Option<i32>,  // ← was total_sheet
    pub created_at: String,
    pub files: Vec<PrintJobFile>,
}