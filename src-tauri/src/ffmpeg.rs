use serde::{Deserialize, Serialize};
use tauri::api::process::Command;
use tauri::async_runtime;
use tauri::Window;

// Data Structures matching Plan Section 4.4
#[derive(Debug, Serialize, Deserialize)]
pub struct ClipSelection {
    start: f64,
    end: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CropArea {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportArgs {
    input_path: String,
    output_path: String,
    selection: ClipSelection,
    crop: CropArea,
}
#[tauri::command]
pub async fn process_video(window: Window, args: ExportArgs) -> Result<String, String> {
    println!("Processing video: {:?}", args);

    // 1. Construct FFmpeg arguments

    // FIX: Store generated strings in named variables
    let crop_filter = format!(
        "crop={}:{}:{}:{}",
        args.crop.width, args.crop.height, args.crop.x, args.crop.y
    );

    // FIX: Store these temporary strings
    let start_time_str = args.selection.start.to_string();
    let end_time_str = args.selection.end.to_string();

    let ffmpeg_args = vec![
        "-i",
        &args.input_path,
        "-ss",
        &start_time_str, // <-- Use the stored variable
        "-to",
        &end_time_str, // <-- Use the stored variable
        "-filter:v",
        &crop_filter,
        "-c:a",
        "copy",
        "-y", // Overwrite output
        &args.output_path,
    ];

    // 2. Spawn Command
    let command = Command::new("ffmpeg").args(ffmpeg_args);

    let (mut rx, _) = command.spawn().map_err(|e| e.to_string())?;

    // 3. Monitor Progress (simplified)
    async_runtime::spawn(async move {
        let mut exit_code: Option<i32> = None;
        let mut command_error: Option<String> = None;
        let mut last_progress_line: Option<String> = None; // State to track the last emitted line

        while let Some(event) = rx.recv().await {
            match event {
                tauri::api::process::CommandEvent::Stdout(_line) => {
                    // Ignore Stdout for progress to prevent duplication,
                    // as progress is usually on Stderr.
                    // You can log it if needed for debugging, but don't emit to frontend.
                }
                tauri::api::process::CommandEvent::Stderr(line) => {
                    // FFmpeg usually outputs stats to Stderr
                    if last_progress_line.as_ref() != Some(&line) {
                        // 1. Emit the progress line
                        window.emit("ffmpeg-progress", line.clone()).unwrap();

                        // 2. Update the tracking state
                        last_progress_line = Some(line);
                    }
                }
                tauri::api::process::CommandEvent::Terminated(payload) => {
                    // The FFmpeg process has exited.
                    exit_code = payload.code;
                    println!("FFmpeg Terminated with code: {:?}", payload.code);
                    // Break the loop to handle final status
                    break;
                }
                tauri::api::process::CommandEvent::Error(err) => {
                    // An error occurred spawning or running the command itself
                    command_error = Some(err.clone());
                    println!("FFmpeg Command Error: {}", err);
                    // Break the loop to handle final status
                    break;
                }
                _ => {}
            }
        }

        // --- Post-Execution Event Handling ---

        if let Some(err) = command_error {
            // 4a. Emit Error if the command failed to execute
            window
                .emit("ffmpeg-error", format!("Tauri Command Error: {}", err))
                .unwrap();
        } else if let Some(code) = exit_code {
            if code == 0 {
                // 4b. Emit Finished if the exit code is 0 (Success)
                window
                    .emit("ffmpeg-finished", "Successfully processed video")
                    .unwrap();
            } else {
                // 4c. Emit Error if the exit code is non-zero (Failure)
                window
                    .emit(
                        "ffmpeg-error",
                        format!("FFmpeg exited with error code: {}", code),
                    )
                    .unwrap();
            }
        } else {
            // Fallback for an unexpected loop exit
            window
                .emit(
                    "ffmpeg-error",
                    "FFmpeg process finished without explicit status code.",
                )
                .unwrap();
        }
    });

    Ok("Processing started".to_string())
}
