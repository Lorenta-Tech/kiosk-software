use serde::{Deserialize, Serialize};
use super::print_job::PrintJob;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenJobResponse {
    pub data: DataWrapper,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DataWrapper {
    pub job: PrintJob,
}