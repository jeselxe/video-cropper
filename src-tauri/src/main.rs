// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ffmpeg;

use std::cmp::min;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

// Learn more about Tauri commands at https://v1.tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(path)
        .map(|metadata| metadata.len())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn read_file_chunk(path: String, start: u64, end: u64) -> Result<Vec<u8>, String> {
    if end < start {
        return Err("Invalid byte range: end is smaller than start.".to_string());
    }

    let mut file = File::open(&path).map_err(|error| error.to_string())?;
    let file_size = file
        .metadata()
        .map_err(|error| error.to_string())?
        .len();

    if start > file_size {
        return Ok(Vec::new());
    }

    let clamped_end = min(end, file_size);
    let length = clamped_end.saturating_sub(start);

    let mut buffer = vec![0; length as usize];
    file.seek(SeekFrom::Start(start))
        .map_err(|error| error.to_string())?;

    if length > 0 {
        file.read_exact(&mut buffer)
            .map_err(|error| error.to_string())?;
    }

    Ok(buffer)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ffmpeg::process_video,
            ffmpeg::concat_videos,
            ffmpeg::probe_video_metadata,
            ffmpeg::extract_preview_frame,
            get_file_size,
            read_file_chunk,
            greet
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
