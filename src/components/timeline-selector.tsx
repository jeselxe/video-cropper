import { useCallback, useEffect, useRef, useState } from "react";
import { ClipSelection, DragHandle } from "../types";
import { clamp } from "../utils";
import { formatTimeShort } from "../utils/format";
import Icon from "./icon";

interface TimelineSelectorProps {
  duration: number;
  selection: ClipSelection;
  onSelectionChange: (newSelection: ClipSelection) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

const TimelineSelector: React.FC<TimelineSelectorProps> = ({
  duration,
  selection,
  onSelectionChange,
  videoRef,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragHandle, setDragHandle] = useState<DragHandle>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Sync play state with video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // Auto-pause if we hit the end of selection
      if (video.currentTime >= selection.end && !video.paused) {
        video.pause();
        video.currentTime = selection.end;
      }
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [videoRef, selection.end]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        // If at end of selection, restart from start of selection
        if (videoRef.current.currentTime >= selection.end - 0.1) {
          videoRef.current.currentTime = selection.start;
        }
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  };

  // Convert helpers
  const percentToSeconds = (percent: number) => (percent / 100) * duration;
  const secondsToPercent = (seconds: number) => (seconds / duration) * 100;

  // --- Dragging Logic ---

  const handleMouseDown = (e: React.MouseEvent, handle: DragHandle) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragHandle(handle);
    // Pause while scrubbing for better performance usually
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !timelineRef.current || duration === 0) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const rawPercent = ((e.clientX - rect.left) / rect.width) * 100;
      const clampedPercent = clamp(rawPercent, 0, 100);
      let time = percentToSeconds(clampedPercent);
      const minDuration = 1.0; // Minimum clip length 1s

      const newSelection = { ...selection };

      if (dragHandle === "start") {
        time = clamp(time, 0, selection.end - minDuration);
        newSelection.start = time;
      } else if (dragHandle === "end") {
        time = clamp(time, selection.start + minDuration, duration);
        newSelection.end = time;
      }

      onSelectionChange(newSelection);

      // UX: Seek video to the handle being dragged to preview cut point
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    },
    [isDragging, dragHandle, duration, selection, onSelectionChange, videoRef],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragHandle(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Handle clicking on track to seek
  const handleTrackClick = (e: React.MouseEvent) => {
    if (!timelineRef.current || duration === 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    const time = percentToSeconds(clamp(percent, 0, 100));

    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const startPct = secondsToPercent(selection.start);
  const endPct = secondsToPercent(selection.end);
  const currentPct = secondsToPercent(currentTime);

  return (
    <div className="timeline-wrapper">
      <div className="toolbar" style={{ marginBottom: "0.5rem" }}>
        <button className="btn btn-secondary btn-icon" onClick={togglePlay}>
          {isPlaying ? (
            // You might need a Pause icon in icon.tsx, using Loader temporarily or add one
            <div
              style={{
                width: 10,
                height: 10,
                background: "currentColor",
                borderRight: "4px solid transparent",
                borderLeft: "4px solid transparent",
              }}
            />
          ) : (
            <Icon name="Play" />
          )}
        </button>
        <div
          className="data-display"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: "1rem",
            padding: "0.25rem 1rem",
          }}
        >
          <span className="data-label" style={{ margin: 0 }}>
            Time
          </span>
          <span className="data-value" style={{ fontSize: "0.8rem" }}>
            {formatTimeShort(currentTime)} / {formatTimeShort(duration)}
          </span>
        </div>
      </div>

      <div
        className="timeline-track"
        ref={timelineRef}
        onMouseDown={handleTrackClick}
      >
        {/* Selection Highlight */}
        <div
          className="timeline-selection"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />

        {/* Playhead */}
        <div className="timeline-playhead" style={{ left: `${currentPct}%` }} />

        {/* Handles */}
        <div
          className="timeline-handle"
          style={{ left: `${startPct}%` }}
          onMouseDown={(e) => handleMouseDown(e, "start")}
        >
          <Icon name="Rewind" width={12} height={12} />
        </div>
        <div
          className="timeline-handle"
          style={{ left: `${endPct}%` }}
          onMouseDown={(e) => handleMouseDown(e, "end")}
        >
          <Icon name="FastForward" width={12} height={12} />
        </div>
      </div>
    </div>
  );
};

export default TimelineSelector;
