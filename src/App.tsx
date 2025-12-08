import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/api/dialog";
import {
  Clock,
  Crop,
  Download,
  List,
  Loader,
  Play,
  XCircle,
} from "lucide-react";

import VideoCropper from "./components/video-cropper";
import TimelineSelector from "./components/timeline-selector";

import { ClipSelection, CropArea, ExportArgs, LogEntry } from "./types";

const initialCrop: CropArea = { x: 0, y: 0, width: 1280, height: 720 };
const initialSelection: ClipSelection = { start: 0, end: 10 };

const App: React.FC = () => {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoWidth, setVideoWidth] = useState<number>(initialCrop.width);
  const [videoHeight, setVideoHeight] = useState<number>(initialCrop.height);

  // States for the video processing logic
  const [currentCrop, setCurrentCrop] = useState<CropArea>(initialCrop);
  const [currentSelection, setCurrentSelection] =
    useState<ClipSelection>(initialSelection);

  const [statusLog, setStatusLog] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const addLogEntry = useCallback(
    (message: string, type: "info" | "progress" | "error" | "success") => {
      console.log("Add", message);
      setStatusLog((prevLog) => {
        const lastEntry = prevLog.slice(-1)[0];
        if (
          lastEntry &&
          lastEntry.type === "progress" &&
          lastEntry.message === message
        ) {
          // If the last entry was progress AND had the exact same message, skip adding the new one.
          return prevLog;
        }
        const newEntry: LogEntry = {
          id: prevLog.length,
          timestamp: new Date().toLocaleTimeString(),
          message,
          type,
        };
        // Keep a maximum of, say, 50 entries to prevent memory issues for long tasks
        return [...prevLog, newEntry];
      });
    },
    [],
  );

  // 1. Update container size on mount and resize for responsive layout
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          // Set a max height, or calculate based on aspect ratio
          height: Math.min((containerRef.current.clientWidth * 9) / 16, 600),
        });
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // 2. Load Video
  const selectFile = async () => {
    setError(null);
    setStatusLog([]);
    setIsProcessing(false);

    const selected = await open({
      filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv"] }],
      multiple: false,
    });

    if (typeof selected === "string") {
      setVideoPath(selected);
      // NOTE: convertFileSrc is imported from @tauri-apps/api/tauri now
      setVideoUrl(convertFileSrc(selected));
    }
  };

  // 3. Set Video Metadata (when metadata is loaded)
  // This function was correctly defined but not assigned to the <video> element.
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      const width = videoRef.current.videoWidth;
      const height = videoRef.current.videoHeight;

      setVideoDuration(duration);
      setVideoWidth(width);
      setVideoHeight(height);

      // Initialize selection and crop to full video bounds
      setCurrentSelection({ start: 0, end: duration });
      setCurrentCrop({ x: 0, y: 0, width: width, height: height });

      addLogEntry(
        `Video loaded. Resolution: ${width}x${height}, Duration: ${duration.toFixed(1)}s`,
        "success",
      );
    }
  }, [addLogEntry]);

  // NOTE: We need to ensure handleLoadedMetadata is attached to the <video> element.
  // It has been added inside the VideoCropper component JSX.

  // 4. Command Invocation and Export Handling (Same as before)
  const handleExport = async () => {
    if (!videoPath) {
      const msg =
        "Please select a video file and ensure Tauri APIs are loaded.";
      setError(msg);
      addLogEntry(msg, "error");
      return;
    }

    // Validation for selection (must be > 0 duration)
    if (currentSelection.end - currentSelection.start < 0.1) {
      const msg = "Trim duration is too short (must be > 0.1s).";
      setError(msg);
      addLogEntry(msg, "error");
      return;
    }

    let outputPath: string | null = null;
    try {
      addLogEntry("Opening save dialog...", "info");
      const savedPath = await save({
        defaultPath: "output.mp4",
        filters: [{ name: "Video", extensions: ["mp4"] }],
      });
      if (typeof savedPath === "string") {
        outputPath = savedPath;
      }
    } catch (e) {
      const msg = `Save dialog failed: ${e}`;
      setError(msg);
      addLogEntry(msg, "error");
      return;
    }

    if (!outputPath) {
      addLogEntry("Export cancelled by user.", "info");
      return;
    }

    addLogEntry(`Starting export to: ${outputPath}`, "info");
    setIsProcessing(true);
    setError(null);

    const exportCrop: CropArea = {
      x: Math.round(currentCrop.x),
      y: Math.round(currentCrop.y),
      width: Math.round(currentCrop.width),
      height: Math.round(currentCrop.height),
    };
    const exportSelection: ClipSelection = {
      start: parseFloat(currentSelection.start.toFixed(3)),
      end: parseFloat(currentSelection.end.toFixed(3)),
    };

    const exportArgs: ExportArgs = {
      input_path: videoPath,
      output_path: outputPath,
      crop: exportCrop,
      selection: exportSelection,
    };

    try {
      addLogEntry("Invoking Rust backend for FFmpeg process...", "info");
      await invoke("process_video", { args: exportArgs });
    } catch (e) {
      const msg = `Failed to start FFmpeg command: ${e}`;
      setError(msg);
      addLogEntry(msg, "error");
      setIsProcessing(false);
    }
  };

  // 5. Listen for FFmpeg Events (Same as before)
  useEffect(() => {
    let unlistenProgress: Function | null = null;
    let unlistenFinished: Function | null = null;
    let unlistenError: Function | null = null;

    const setupListeners = async () => {
      // 5a. Progress Listener
      unlistenProgress = await listen<string>(
        "ffmpeg-progress",
        (event: { payload: string }) => {
          console.log("P", event.payload);
          // This is where real-time progress updates are logged
          addLogEntry(event.payload, "progress");
        },
      );

      // 5b. Finished Listener - Ensures final status is set
      unlistenFinished = await listen<string>(
        "ffmpeg-finished",
        (event: { payload: string }) => {
          console.log("F", event.payload);
          // IMPORTANT: Log the success, then stop processing indicator
          addLogEntry(`Export Complete! ${event.payload}`, "success");
          setIsProcessing(false);
        },
      );

      // 5c. Error Listener - Ensures final error status is set
      unlistenError = await listen<string>(
        "ffmpeg-error",
        (event: { payload: string }) => {
          console.log("E", event.payload);
          // IMPORTANT: Log the error, then stop processing indicator
          const msg = `FFmpeg Process Failed: ${event.payload}`;
          setError(msg);
          addLogEntry(msg, "error");
          setIsProcessing(false);
        },
      );
    };

    setupListeners();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenFinished) unlistenFinished();
      if (unlistenError) unlistenError();
    };
  }, [addLogEntry]);

  // --- Utility Functions ---

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "00:00.0";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const ms = Math.floor((seconds * 10) % 10);
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${ms}`;
  };

  const formattedCrop = `${currentCrop.width.toFixed(2)}x${currentCrop.height.toFixed(2)} @ x:${currentCrop.x.toFixed(2)}, y:${currentCrop.y.toFixed(2)}`;

  // Find the last actual status message (not just info/error) for display under the loading icon
  const lastProcessingMessage =
    statusLog.filter((log) => log.type === "progress").slice(-1)[0]?.message ||
    (isProcessing ? "FFmpeg process is running..." : "Ready.");

  return (
    <div className="app-container">
      <div ref={containerRef} className="main-card">
        {/* Video Viewer & Cropper */}
        <VideoCropper
          videoUrl={videoUrl}
          videoRef={videoRef}
          currentCrop={currentCrop}
          onCropChange={setCurrentCrop}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          containerSize={containerSize}
          handleLoadedMetadata={handleLoadedMetadata}
        />
        <TimelineSelector
          duration={videoDuration}
          selection={currentSelection}
          onSelectionChange={setCurrentSelection}
          videoRef={videoRef}
        />

        {/* Controls */}
        <div className="grid-3-col mb-6">
          {/* File Selector */}
          <button
            onClick={selectFile}
            className="btn-primary"
            disabled={isProcessing}
          >
            <Play style={{ width: 20, height: 20, marginRight: 8 }} />
            Select Video
          </button>

          {/* Crop Display */}
          <div className="info-box">
            <Crop className="info-icon" />
            <div className="text-sm font-mono text-right">
              Crop: <span className="font-bold">{formattedCrop}</span>
            </div>
          </div>

          {/* Timeline Display */}
          <div className="info-box">
            <Clock className="info-icon" />
            <div className="text-sm font-mono text-right">
              Trim:{" "}
              <span className="font-bold">
                {formatTime(currentSelection.start)} -{" "}
                {formatTime(currentSelection.end)}
              </span>
            </div>
          </div>
        </div>

        {/* Export Button */}
        <div className="mt-4">
          <button
            onClick={handleExport}
            className="btn-primary btn-export w-full"
            disabled={
              !videoPath ||
              isProcessing ||
              videoDuration === 0 ||
              currentSelection.end <= currentSelection.start
            }
          >
            {isProcessing ? (
              <>
                <Loader
                  style={{ width: 20, height: 20, marginRight: 8 }}
                  className="animate-spin"
                />
                EXPORTING...
              </>
            ) : (
              <>
                <Download style={{ width: 20, height: 20, marginRight: 8 }} />
                Export Trimmed & Cropped Video
              </>
            )}
          </button>
        </div>

        {/* Status/Error Messages */}
        <div className="status-box">
          {isProcessing && (
            <div className="status-processing">
              <Loader
                style={{ width: 16, height: 16, marginRight: 8 }}
                className="animate-spin"
              />
              <span className="text-sm font-medium">
                {lastProcessingMessage}
              </span>
            </div>
          )}
          {error &&
            !isProcessing && ( // Only show persistent error if not currently processing
              <div className="status-error">
                <XCircle style={{ width: 20, height: 20, marginRight: 8 }} />
                <span className="text-sm font-medium">{error}</span>
              </div>
            )}
          {!isProcessing &&
            statusLog.length > 0 &&
            statusLog.slice(-1)[0].type === "success" && (
              <div className="status-success">
                <span className="text-sm font-medium">
                  {statusLog.slice(-1)[0].message}
                </span>
              </div>
            )}
        </div>

        {/* Status Log Viewer */}
        <div className="log-container">
          <div className="log-header">
            <List style={{ width: 16, height: 16, marginRight: 8 }} />
            Process Log ({statusLog.length} entries)
          </div>
          {statusLog.map((entry, i) => (
            <div key={i} className={`log-entry log-${entry.type}`}>
              <span className="log-timestamp">[{entry.timestamp}]</span>
              <span className="log-message">{entry.message}</span>
            </div>
          ))}
        </div>

        <p className="footer-text">Source Path: {videoPath || "None"}</p>
      </div>
    </div>
  );
};

export default App;
