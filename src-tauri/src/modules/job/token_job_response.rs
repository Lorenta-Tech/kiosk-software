use serde::{Deserialize, Serialize};
use super::print_job::PrintJob;

#[derive(Debug ,  Serialize , Deserialize , Clone)]
pub struct TokenJobResponse {
    job : PrintJob
}