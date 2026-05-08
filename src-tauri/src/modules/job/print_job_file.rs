  use serde::Serialize;
  use serde::Deserialize;
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PrintJobFile {
    pub file_id: String,
    pub file_name: String,
    pub printing_mode: Option<String>,
    pub printing_side: Option<String>,
    pub page_range: Vec<String>,
    pub page_layout: Option<i32>,
    pub copies: Option<i32>,
    pub number_of_pages: Option<i32>,
    pub price: Option<f64>,
    pub file_status: String,
    pub download_url: Option<String>,  // ← was dowload_url
}