# ✂️ Video Cropper

## 📝 Description

Video Cropper is a fast, cross-platform desktop application built with **Tauri** (Rust) and **React/TypeScript**. It provides a straightforward interface for performing common video preparation tasks: **cropping** and **trimming** video clips using the high-performance **FFmpeg** library in the backend.

This tool is designed for quickly isolating a segment of a video and adjusting its aspect ratio without relying on heavy, full-featured video editors.

-----

## ✨ Features

  * **Intuitive UI:** Built with React/TypeScript and **Vanilla CSS** for a clean, responsive interface.
  * **Video Cropping:** Visually select and define the crop area directly on the video player.
  * **Clip Trimming:** Use a timeline selector to define precise start (`-ss`) and end (`-to`) points for the exported video segment.
  * **FFmpeg Powered:** Leverages the native performance of FFmpeg through a Rust backend for fast and reliable processing.
  * **Cross-Platform:** Built with Tauri for a small bundle size and native performance on Windows, macOS, and Linux.

-----

## 💻 Technologies Used

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | **Tauri** | Handles the native window, filesystem access, and communication between the frontend and Rust. |
| **Backend Logic** | **Rust** | Manages the FFmpeg command execution and event handling for progress, completion, and errors. |
| **FFmpeg** | Command-Line Tool | The core video processing engine (trimming, cropping, format handling). |
| **Frontend** | **React & TypeScript** | Component logic, state management, and event listeners. |
| **UI/Styling** | **Vanilla CSS** | Styling the UI components. |

-----

## 🚀 Installation & Setup

### Prerequisites

You must have the following installed:

  * **Rust and Cargo:** Follow the official Rust installation guide.
  * **Node.js and npm/yarn:** For the frontend dependencies.
  * **FFmpeg:** Ensure the `ffmpeg` executable is installed and available in your system's **PATH**.

### Steps

1.  **Clone the Repository:**

    ```bash
    git clone https://github.com/jeselxe/video-cropper.git
    cd video-cropper
    ```

2.  **Install Frontend Dependencies:**

    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Run in Development Mode (Recommended):**
    This command starts the React development server and the Tauri application concurrently.

    ```bash
    npm run tauri dev
    ```

4.  **Build the Production Binary:**
    This command packages the app into a final installer/executable for your platform.

    ```bash
    npm run tauri build
    ```

-----

## ⚙️ Core Implementation Details

### Frontend (React/TypeScript)

  * A primary **`useEffect` hook** sets up and tears down listeners for backend events (`ffmpeg-progress`, `ffmpeg-finished`, `ffmpeg-error`).
  * The **`addLogEntry`** function handles logging and includes **client-side deduplication logic** to prevent log spam from highly verbose FFmpeg progress updates.

### Backend (Rust/Tauri)

The core logic resides in the **`process_video`** command:

1.  **Argument Construction:** FFmpeg arguments are dynamically built based on the user's selected clip **selection** (`-ss`, `-to`) and **crop area** (`-filter:v`).
2.  **Asynchronous Monitoring:** An `async_runtime::spawn` block monitors the spawned FFmpeg command for `Stderr` (progress), `Terminated` (exit status), and `Error` (command failure) events.
3.  **Event Emission:** Progress lines are emitted as `"ffmpeg-progress"`. The final status is determined by the command's exit code (`0` for success $\rightarrow$ `"ffmpeg-finished"`, non-zero for failure $\rightarrow$ `"ffmpeg-error"`).

-----

## 📄 License

This project is licensed under the **MIT License**.

The MIT License grants unrestricted use, modification, and distribution of the code. For more details, see the `LICENSE` file in the repository root.
