use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PrintRequest {
    pub pdf_path: String,
    pub copies: u32,
    pub duplex: String,
    pub page_range: String,
    pub number_up: u32,
    pub color_mode: String,
}