use std::{fs::File, io::Write};
use std::fs;
use reqwest::Client;





pub async fn dowload_pdf(url : &str , file_name : &str )-> Result<String , String >{
   let download_dir = std::env::var("DOWNLOAD_DIR").unwrap_or_else(|_| "./downloads".to_string());

    fs::create_dir_all(&download_dir).map_err(|e|e.to_string());
    let full_path = format!("{}/{}" , download_dir , file_name);
    let client = Client::new();
    let bytes = client.get(url).send().await.map_err(|e|e.to_string())?.bytes().await.map_err(|e|e.to_string())?;
    let mut file = File::create(&full_path).map_err(|e|e.to_string())?;
    file.write_all(&bytes).map_err(|e|e.to_string())?;
    Ok(full_path)
}
