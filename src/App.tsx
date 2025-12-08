import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/api/dialog";

import VideoCropper from "./components/video-cropper";
import TimelineSelector from "./components/timeline-selector";
import Icon from "./components/icon";
import LogModal from "./components/log-modal";

import { ClipSelection, CropArea, ExportArgs, LogEntry } from "./types";
import { formatTime } from "./utils/format";

const App: React.FC = () => {
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Metadata
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoMeta, setVideoMeta] = useState({ width: 0, height: 0 });

  // Editing State
  const [currentCrop, setCurrentCrop] = useState<CropArea>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [currentSelection, setCurrentSelection] = useState<ClipSelection>({
    start: 0,
    end: 0,
  });

  // UI State
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Logs & Status
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Helper: Add Log ---
  const addLog = useCallback((msg: string, type: LogEntry["type"]) => {
    setLogs((prev) => [
      ...prev,
      {
        id: prev.length,
        timestamp: new Date().toLocaleTimeString().split(" ")[0], // HH:MM:SS
        message: msg,
        type,
      },
    ]);
  }, []);

  // --- Layout Resize Observer ---
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // --- File Loading ---
  const selectFile = async () => {
    try {
      const selected = await open({
        filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv"] }],
        multiple: false,
      });
      if (typeof selected === "string") {
        setVideoPath(selected);
        setVideoUrl(convertFileSrc(selected));
        setLogs([]); // Clear logs on new file
        addLog("Loaded file: " + selected, "info");
      }
    } catch (e) {
      addLog("Failed to open file: " + e, "error");
    }
  };

  const onMetadataLoaded = () => {
    if (videoRef.current) {
      const { duration, videoWidth, videoHeight } = videoRef.current;
      setVideoDuration(duration);
      setVideoMeta({ width: videoWidth, height: videoHeight });

      // Reset tools to defaults
      setCurrentCrop({ x: 0, y: 0, width: videoWidth, height: videoHeight });
      setCurrentSelection({ start: 0, end: duration });
      addLog(
        `Metadata: ${videoWidth}x${videoHeight}, ${duration.toFixed(2)}s`,
        "info",
      );
    }
  };

  // --- Export ---
  const handleExport = async () => {
    if (!videoPath) return;

    try {
      const outputPath = await save({
        defaultPath: "trimmed_video.mp4",
        filters: [{ name: "Video", extensions: ["mp4"] }],
      });

      if (!outputPath) {
        addLog("Export cancelled", "info");
        return;
      }

      setIsProcessing(true);
      addLog(`Starting export to ${outputPath}`, "info");

      const args: ExportArgs = {
        input_path: videoPath,
        output_path: outputPath,
        crop: {
          x: Math.round(currentCrop.x),
          y: Math.round(currentCrop.y),
          width: Math.round(currentCrop.width),
          height: Math.round(currentCrop.height),
        },
        selection: {
          start: parseFloat(currentSelection.start.toFixed(3)),
          end: parseFloat(currentSelection.end.toFixed(3)),
        },
      };

      await invoke("process_video", { args });
    } catch (e) {
      setIsProcessing(false);
      addLog(`Export start failed: ${e}`, "error");
    }
  };

  // --- Listeners ---
  useEffect(() => {
    const unlisten = [
      listen<string>("ffmpeg-progress", (e) => addLog(e.payload, "progress")),
      listen<string>("ffmpeg-finished", () => {
        addLog("Export completed successfully!", "success");
        setIsProcessing(false);
      }),
      listen<string>("ffmpeg-error", (e) => {
        addLog("FFmpeg Error: " + e.payload, "error");
        setIsProcessing(false);
      }),
    ];
    return () => {
      unlisten.forEach((p) => p.then((f) => f()));
    };
  }, [addLog]);

  // Derived display values
  const lastLog =
    logs.length > 0
      ? logs[logs.length - 1]
      : { type: "info", message: "Ready" };
  const cropInfo = `${Math.round(currentCrop.width)}×${Math.round(currentCrop.height)}`;

  return (
    <>
      <div className="app-container">
        <header className="app-header">
          <div className="app-title">
            <Icon name="Crop" />
            <span>Trim & Crop</span>
          </div>
          <button className="btn btn-secondary" onClick={selectFile}>
            <Icon name="Upload" /> Open Video
          </button>
        </header>

        <div className="app-body">
          {/* 1. Preview Area */}
          <div className="preview-area" ref={containerRef}>
            <VideoCropper
              videoUrl={videoUrl}
              videoRef={videoRef}
              currentCrop={currentCrop}
              onCropChange={setCurrentCrop}
              videoWidth={videoMeta.width}
              videoHeight={videoMeta.height}
              containerSize={containerSize}
              onLoadedMetadata={onMetadataLoaded}
            />
          </div>

          {/* 2. Controls Area */}
          <div className="editor-panel">
            {videoUrl ? (
              <>
                <TimelineSelector
                  duration={videoDuration}
                  selection={currentSelection}
                  onSelectionChange={setCurrentSelection}
                  videoRef={videoRef}
                />

                <div className="toolbar" style={{ marginTop: "auto" }}>
                  <div className="control-group">
                    <div className="data-display">
                      <span className="data-label">Dimensions</span>
                      <span className="data-value">{cropInfo}</span>
                    </div>
                    <div className="data-display">
                      <span className="data-label">Duration</span>
                      <span className="data-value">
                        {formatTime(
                          currentSelection.end - currentSelection.start,
                        )}
                      </span>
                    </div>
                  </div>

                  <button
                    className="btn btn-success"
                    onClick={handleExport}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <Icon name="Loader" />
                    ) : (
                      <Icon name="Download" />
                    )}
                    {isProcessing ? "Exporting..." : "Export"}
                  </button>
                </div>
              </>
            ) : (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  color: "var(--text-muted)",
                }}
              >
                No video selected
              </div>
            )}
          </div>
        </div>

        {/* 3. Footer Status Bar */}
        <footer className="app-footer">
          <button
            className="status-btn"
            onClick={() => setIsLogModalOpen(true)}
          >
            <div className={`status-dot ${lastLog.type}`} />
            <span>{lastLog.message}</span>
          </button>
          <div style={{ opacity: 0.5 }}>
            {videoPath ? videoPath.split(/[/\\]/).pop() : ""}
          </div>
        </footer>
      </div>

      <LogModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        logs={logs}
      />
    </>
  );
};

export default App;
