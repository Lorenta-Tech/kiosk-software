use serde::{Deserialize, Serialize};
use super::print_job::Print_Job;

#[derive(Debug ,  Serialize , Deserialize , Clone)]
pub struct TokenJobResponse {
    job : Print_Job
}