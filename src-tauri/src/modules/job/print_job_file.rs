use serde::{Deserialize, Serialize};

#[derive(Debug , Deserialize , Serialize , Clone)]
pub struct PrintJobFile {
    file_id : String,
    file_name : String,
    printing_mode : Option<String>,
    printing_side : Option<String>,
    page_range : Vec<String>,
    page_layout : Option<i32>,
    copies : Option<i32>,
    number_of_pages : Option<i32>,
    price : Option<f64>,
    file_status : String,
    dowload_url : Option<String>
}