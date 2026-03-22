import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/api/dialog";

import VideoCropper from "./components/video-cropper";
import TimelineSelector from "./components/timeline-selector";
import Icon from "./components/icon";
import LogModal from "./components/log-modal";
import ConcatTool from "./components/concat-tool";

import {
  ClipSelection,
  ConcatArgs,
  CropArea,
  ExportArgs,
  LogEntry,
  PreviewMetadata,
  Tool,
} from "./types";
import { formatTime } from "./utils/format";

const App: React.FC = () => {
  const [activeTool, setActiveTool] = useState<Tool>("crop");
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [concatFiles, setConcatFiles] = useState<string[]>([]);

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

  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef(0);
  const selectionEndRef = useRef(0);
  const playbackFrameRef = useRef<number | null>(null);
  const lastPlaybackTickRef = useRef<number | null>(null);
  const renderSequenceRef = useRef(0);
  const lastPreviewRenderRef = useRef<number>(0);
  const queuedFrameTimeRef = useRef<number | null>(null);
  const queuedFrameForceRef = useRef(false);
  const isFrameRequestRunningRef = useRef(false);

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

  const pausePlayback = useCallback(() => {
    if (playbackFrameRef.current !== null) {
      cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
    }
    lastPlaybackTickRef.current = null;
    setIsPlaying(false);
  }, []);

  const drawFrame = useCallback(
    async (uiTime: number, force = false) => {
      try {
        const canvas = canvasRef.current;

        if (!videoPath || !canvas) return;

        if (!force && videoMeta.width > 0) {
          const now = performance.now();
          if (now - lastPreviewRenderRef.current < 220) return;
          lastPreviewRenderRef.current = now;
        }

        const sequence = ++renderSequenceRef.current;
        const timestamp = Math.min(Math.max(uiTime, 0), videoDuration);
        const bytes = await invoke<number[]>("extract_preview_frame", {
          path: videoPath,
          time: timestamp,
          maxWidth: 960,
        });

        if (renderSequenceRef.current !== sequence) return;

        const blob = new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
        const imageUrl = URL.createObjectURL(blob);
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const element = new Image();
          element.onload = () => resolve(element);
          element.onerror = () =>
            reject(new Error("Failed to decode preview frame image."));
          element.src = imageUrl;
        });

        if (renderSequenceRef.current !== sequence) {
          URL.revokeObjectURL(imageUrl);
          return;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(imageUrl);
          return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(imageUrl);
      } catch (error) {
        if (force) {
          const message = error instanceof Error ? error.message : String(error);
          addLog(`Preview frame failed: ${message}`, "error");
        }
      }
    },
    [addLog, videoDuration, videoMeta.width, videoPath],
  );

  const pumpFrameQueue = useCallback(async () => {
    if (isFrameRequestRunningRef.current) return;

    isFrameRequestRunningRef.current = true;

    try {
      while (queuedFrameTimeRef.current !== null) {
        const nextTime = queuedFrameTimeRef.current;
        const force = queuedFrameForceRef.current;

        queuedFrameTimeRef.current = null;
        queuedFrameForceRef.current = false;

        await drawFrame(nextTime, force);
      }
    } finally {
      isFrameRequestRunningRef.current = false;
    }
  }, [drawFrame]);

  const requestFrame = useCallback(
    (time: number, force = false) => {
      queuedFrameTimeRef.current = time;
      queuedFrameForceRef.current = queuedFrameForceRef.current || force;
      void pumpFrameQueue();
    },
    [pumpFrameQueue],
  );

  const seekTo = useCallback(
    (time: number) => {
      const nextTime = Math.max(0, Math.min(time, videoDuration));
      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);
      requestFrame(nextTime, true);
    },
    [requestFrame, videoDuration],
  );

  const cleanupPreview = useCallback(() => {
    pausePlayback();
    renderSequenceRef.current += 1;
    lastPreviewRenderRef.current = 0;
    queuedFrameTimeRef.current = null;
    queuedFrameForceRef.current = false;
    isFrameRequestRunningRef.current = false;
  }, [pausePlayback]);

  const resetCropState = useCallback(() => {
    cleanupPreview();
    setVideoPath(null);
    setVideoDuration(0);
    setVideoMeta({ width: 0, height: 0 });
    setCurrentCrop({ x: 0, y: 0, width: 0, height: 0 });
    setCurrentSelection({ start: 0, end: 0 });
    setCurrentTime(0);
    setIsLoadingMetadata(false);
    setIsPlaying(false);
  }, [cleanupPreview]);

  // --- File Loading ---
  const selectCropFile = async () => {
    try {
      const selected = await open({
        filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv"] }],
        multiple: false,
      });
      if (typeof selected === "string") {
        cleanupPreview();
        setVideoPath(selected);
        setLogs([]); // Clear logs on new file
        addLog("Loaded file: " + selected, "info");
        setIsLoadingMetadata(true);

        const metadata = await invoke<PreviewMetadata>("probe_video_metadata", {
          path: selected,
        });

        setVideoDuration(metadata.duration);
        setVideoMeta({ width: metadata.width, height: metadata.height });
        setCurrentCrop({
          x: 0,
          y: 0,
          width: metadata.width,
          height: metadata.height,
        });
        setCurrentSelection({ start: 0, end: metadata.duration });
        selectionEndRef.current = metadata.duration;
        currentTimeRef.current = 0;
        setCurrentTime(0);
        setIsMuted(true);
        setIsLoadingMetadata(false);
        addLog(
          `Metadata: ${metadata.width}x${metadata.height}, ${metadata.duration.toFixed(2)}s. Ready for edit.`,
          "info",
        );
        addLog(
          "Preview uses backend FFmpeg frame extraction. Audio preview is currently disabled.",
          "info",
        );
        requestFrame(0, true);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setVideoPath(null);
      setVideoDuration(0);
      setVideoMeta({ width: 0, height: 0 });
      setCurrentCrop({ x: 0, y: 0, width: 0, height: 0 });
      setCurrentSelection({ start: 0, end: 0 });
      setCurrentTime(0);
      setIsLoadingMetadata(false);
      cleanupPreview();
      addLog("Failed to open file: " + message, "error");
    }
  };

  const selectConcatFiles = async () => {
    try {
      const selected = await open({
        filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "lrv"] }],
        multiple: true,
      });

      if (Array.isArray(selected) && selected.length > 0) {
        setConcatFiles((prev) => [...prev, ...selected]);
        addLog(`Added ${selected.length} file(s) to concat queue.`, "info");
      }
    } catch (e) {
      addLog("Failed to open files: " + e, "error");
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

  const handleConcatExport = async () => {
    if (concatFiles.length < 2) {
      addLog("Select at least two files to concatenate.", "error");
      return;
    }

    try {
      const outputPath = await save({
        defaultPath: "concatenated_video.mp4",
        filters: [{ name: "Video", extensions: ["mp4"] }],
      });

      if (!outputPath) {
        addLog("Concat cancelled", "info");
        return;
      }

      setIsProcessing(true);
      addLog(`Starting concat to ${outputPath}`, "info");

      const args: ConcatArgs = {
        input_paths: concatFiles,
        output_path: outputPath,
      };

      await invoke("concat_videos", { args });
    } catch (e) {
      setIsProcessing(false);
      addLog(`Concat start failed: ${e}`, "error");
    }
  };

  const toggleMute = useCallback(() => {
    setIsMuted((value) => !value);
  }, []);

  const playbackStep = useCallback(
    (timestamp: number) => {
      const lastTick = lastPlaybackTickRef.current ?? timestamp;
      const deltaSeconds = (timestamp - lastTick) / 1000;
      lastPlaybackTickRef.current = timestamp;

      const nextTime = currentTimeRef.current + deltaSeconds;

      if (nextTime >= selectionEndRef.current) {
        seekTo(selectionEndRef.current);
        pausePlayback();
        return;
      }

      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);
      requestFrame(nextTime);
      playbackFrameRef.current = requestAnimationFrame(playbackStep);
    },
    [pausePlayback, requestFrame, seekTo],
  );

  const togglePlay = useCallback(() => {
    if (!videoPath) return;

    if (isPlaying) {
      pausePlayback();
      return;
    }

    if (currentTimeRef.current >= selectionEndRef.current - 0.1) {
      seekTo(currentSelection.start);
    }

    selectionEndRef.current = currentSelection.end;
    setIsPlaying(true);
    lastPlaybackTickRef.current = null;
    requestFrame(currentTimeRef.current, true);
    playbackFrameRef.current = requestAnimationFrame(playbackStep);
  }, [
    currentSelection.start,
    currentSelection.end,
    isPlaying,
    pausePlayback,
    playbackStep,
    requestFrame,
    seekTo,
    videoPath,
  ]);

  useEffect(() => {
    selectionEndRef.current = currentSelection.end;
    if (currentTimeRef.current > currentSelection.end) {
      seekTo(currentSelection.end);
    }
  }, [currentSelection.end, seekTo]);

  // --- Listeners ---
  useEffect(() => {
    const unlisten = [
      listen<string>("ffmpeg-progress", (e) => addLog(e.payload, "progress")),
      listen<string>("ffmpeg-finished", () => {
        addLog("Operation completed successfully!", "success");
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

  useEffect(() => {
    return () => {
      cleanupPreview();
    };
  }, [cleanupPreview]);

  // Derived display values
  const lastLog =
    logs.length > 0
      ? logs[logs.length - 1]
      : {
          type: "info",
          message: isLoadingMetadata ? "Loading metadata..." : "Ready",
        };
  const cropInfo = `${Math.round(currentCrop.width)}×${Math.round(currentCrop.height)}`;

  const isReady = videoPath && videoMeta.width > 0 && !isLoadingMetadata;
  const statusFileLabel =
    activeTool === "crop"
      ? videoPath
        ? videoPath.split(/[/\\]/).pop()
        : ""
      : concatFiles.length > 0
        ? `${concatFiles.length} clip(s) queued`
        : "";

  return (
    <>
      <div className="app-container">
        <header className="app-header">
          <div className="app-title">
            <Icon name={activeTool === "crop" ? "Crop" : "List"} />
            <span>Video Tools</span>
          </div>
          <div className="tool-switcher">
            <button
              className={`tool-tab ${activeTool === "crop" ? "is-active" : ""}`}
              onClick={() => setActiveTool("crop")}
            >
              Trim & Crop
            </button>
            <button
              className={`tool-tab ${activeTool === "concat" ? "is-active" : ""}`}
              onClick={() => {
                resetCropState();
                setActiveTool("concat");
              }}
            >
              Concat
            </button>
          </div>
          {activeTool === "crop" ? (
            <button className="btn btn-secondary" onClick={selectCropFile}>
              <Icon name="Upload" /> Open Video
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={selectConcatFiles}>
              <Icon name="Upload" /> Add Videos
            </button>
          )}
        </header>

        <div className="app-body">
          {activeTool === "crop" ? (
            <>
              <div className="preview-area" ref={containerRef}>
                <VideoCropper
                  hasPreview={!!videoPath}
                  canvasRef={canvasRef}
                  currentCrop={currentCrop}
                  onCropChange={setCurrentCrop}
                  videoWidth={videoMeta.width}
                  videoHeight={videoMeta.height}
                  containerSize={containerSize}
                  isLoading={isLoadingMetadata}
                />
                {videoPath && isLoadingMetadata && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(0,0,0,0.8)",
                      zIndex: 50,
                      color: "white",
                    }}
                  >
                    <Icon name="Loader" width={48} height={48} />
                    <span style={{ marginTop: "1rem", fontSize: "1.2rem" }}>
                      Loading preview...
                    </span>
                    <span
                      style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                    >
                      Reading metadata and preparing frame-accurate canvas
                      rendering.
                    </span>
                  </div>
                )}
              </div>

              <div className="editor-panel">
                {isReady ? (
                  <>
                    <TimelineSelector
                      duration={videoDuration}
                      selection={currentSelection}
                      onSelectionChange={setCurrentSelection}
                      currentTime={currentTime}
                      isPlaying={isPlaying}
                      isMuted={isMuted}
                      onSeek={seekTo}
                      onTogglePlay={togglePlay}
                      onToggleMute={toggleMute}
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
                  <div className="empty-state">
                    {videoPath
                      ? isLoadingMetadata
                        ? "Loading video data..."
                        : "Video metadata failed to load or is unavailable."
                      : "No video selected"}
                  </div>
                )}
              </div>
            </>
          ) : (
            <ConcatTool
              files={concatFiles}
              isProcessing={isProcessing}
              onAddFiles={selectConcatFiles}
              onMoveFile={(index, direction) => {
                setConcatFiles((prev) => {
                  const targetIndex = index + direction;
                  if (targetIndex < 0 || targetIndex >= prev.length) return prev;
                  const next = [...prev];
                  [next[index], next[targetIndex]] = [
                    next[targetIndex],
                    next[index],
                  ];
                  return next;
                });
              }}
              onRemoveFile={(index) => {
                setConcatFiles((prev) => prev.filter((_, i) => i !== index));
              }}
              onExport={handleConcatExport}
            />
          )}
        </div>

        {/* 3. Footer Status Bar */}
        <footer className="app-footer">
          <button
            className="status-btn"
            onClick={() => setIsLogModalOpen(true)}
          >
            <div
              className={`status-dot ${isProcessing || isLoadingMetadata ? "processing" : lastLog.type}`}
            />
            <span>
              {isLoadingMetadata ? "Loading metadata..." : lastLog.message}
            </span>
          </button>
          <div style={{ opacity: 0.5 }}>
            {statusFileLabel}
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
