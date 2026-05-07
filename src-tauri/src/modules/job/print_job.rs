use serde::{Deserialize, Serialize};

use super::print_job_file::PrintJobFile;
#[derive(Debug , Deserialize , Serialize , Clone )]
pub struct PrintJob {
    session_id : String,
    status : String,
    total_amount : Option<f64>,
    total_sheet : Option<i32>,
    created_at : String,
    files :  Vec<PrintJobFile>
    
}