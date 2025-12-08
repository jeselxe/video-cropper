import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/api/dialog";

import VideoCropper from "./components/video-cropper";
import TimelineSelector from "./components/timeline-selector";

import { ClipSelection, CropArea, ExportArgs, LogEntry } from "./types";
import Icon from "./components/icon";
import StatusLog from "./components/status-log";
import { formatTime } from "./utils/format";

const App: React.FC = () => {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoWidth, setVideoWidth] = useState<number>(1280);
  const [videoHeight, setVideoHeight] = useState<number>(720);

  const [currentCrop, setCurrentCrop] = useState<CropArea>({
    x: 0,
    y: 0,
    width: 1280,
    height: 720,
  });
  const [currentSelection, setCurrentSelection] = useState<ClipSelection>({
    start: 0,
    end: 10,
  });

  const [statusLog, setStatusLog] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const addLogEntry = useCallback(
    (message: string, type: "info" | "progress" | "error" | "success") => {
      setStatusLog((prevLog) => {
        const lastEntry = prevLog.slice(-1)[0];
        if (
          lastEntry &&
          lastEntry.type === "progress" &&
          lastEntry.message === message
        ) {
          return prevLog;
        }
        const newEntry: LogEntry = {
          id: prevLog.length,
          timestamp: new Date().toLocaleTimeString(),
          message,
          type,
        };
        return [...prevLog, newEntry];
      });
    },
    [],
  );

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: Math.min((containerRef.current.clientWidth * 9) / 16, 480),
        });
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

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

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      const width = videoRef.current.videoWidth;
      const height = videoRef.current.videoHeight;

      setVideoDuration(duration);
      setVideoWidth(width);
      setVideoHeight(height);
      setCurrentSelection({ start: 0, end: duration });
      setCurrentCrop({ x: 0, y: 0, width: width, height: height });

      addLogEntry(
        `Video loaded: ${width}x${height}, ${duration.toFixed(1)}s`,
        "success",
      );
    }
  }, [addLogEntry]);

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

  const formattedCrop = `${Math.round(currentCrop.width)}×${Math.round(currentCrop.height)}`;
  const cropPosition = `(${Math.round(currentCrop.x)}, ${Math.round(currentCrop.y)})`;

  const lastProgressMessage =
    statusLog.filter((log) => log.type === "progress").slice(-1)[0]?.message ||
    "Ready";

  return (
    <>
      <div className="app-container">
        <div className="app-header">
          <h1 className="app-title">Video Trim & Crop Tool</h1>
        </div>

        <div className="app-body">
          {/* Video Display Section */}
          <div className="section">
            <div ref={containerRef}>
              <VideoCropper
                videoUrl={videoUrl}
                videoRef={videoRef}
                currentCrop={currentCrop}
                onCropChange={setCurrentCrop}
                videoWidth={videoWidth}
                videoHeight={videoHeight}
                containerSize={containerSize}
                onLoadedMetadata={handleLoadedMetadata}
              />
            </div>
          </div>

          {/* Timeline Section */}
          {videoDuration > 0 && (
            <div className="section">
              <TimelineSelector
                duration={videoDuration}
                selection={currentSelection}
                onSelectionChange={setCurrentSelection}
                videoRef={videoRef}
              />
            </div>
          )}

          {/* Controls Section */}
          <div className="section">
            <div className="controls-grid">
              <button
                onClick={selectFile}
                className="btn btn-primary"
                disabled={isProcessing}
              >
                <Icon name="Play" />
                Select Video
              </button>

              <div className="control-card">
                <div className="control-label">
                  <Icon name="Crop" /> Crop Area
                </div>
                <div className="control-value">{formattedCrop}</div>
                <div className="control-subvalue">{cropPosition}</div>
              </div>

              <div className="control-card">
                <div className="control-label">
                  <Icon name="Clock" /> Duration
                </div>
                <div className="control-value">
                  {formatTime(currentSelection.end - currentSelection.start)}
                </div>
                <div className="control-subvalue">
                  {formatTime(currentSelection.start)} →{" "}
                  {formatTime(currentSelection.end)}
                </div>
              </div>
            </div>
          </div>

          {/* Export Button */}
          <div className="section">
            <button
              onClick={handleExport}
              className="btn btn-success"
              style={{ width: "100%" }}
              disabled={
                !videoPath ||
                isProcessing ||
                videoDuration === 0 ||
                currentSelection.end <= currentSelection.start
              }
            >
              {isProcessing ? (
                <>
                  <Icon name="Loader" />
                  Exporting...
                </>
              ) : (
                <>
                  <Icon name="Download" />
                  Export Video
                </>
              )}
            </button>
          </div>

          {/* Status Messages */}
          <div className="status-area">
            {isProcessing && (
              <div className="status-message status-processing">
                <Icon name="Loader" />
                <span>{lastProgressMessage}</span>
              </div>
            )}
            {error && !isProcessing && (
              <div className="status-message status-error">
                <Icon name="XCircle" />
                <span>{error}</span>
              </div>
            )}
            {!isProcessing &&
              statusLog.length > 0 &&
              statusLog[statusLog.length - 1].type === "success" && (
                <div className="status-message status-success">
                  <span>{statusLog[statusLog.length - 1].message}</span>
                </div>
              )}
          </div>

          {/* Process Log */}
          {statusLog.length > 0 && (
            <div className="section">
              <StatusLog logs={statusLog} />
            </div>
          )}
        </div>

        <div className="app-footer">
          Source:{" "}
          <span className="footer-path">{videoPath || "No file selected"}</span>
        </div>
      </div>
    </>
  );
};
export default App;
