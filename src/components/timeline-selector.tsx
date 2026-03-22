import { useCallback, useEffect, useRef, useState } from "react";
import { ClipSelection, DragHandle } from "../types";
import { clamp } from "../utils";
import { formatTimeShort } from "../utils/format";
import Icon from "./icon";

interface TimelineSelectorProps {
  duration: number;
  selection: ClipSelection;
  onSelectionChange: (newSelection: ClipSelection) => void;
  currentTime: number;
  isPlaying: boolean;
  isMuted: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onToggleMute: () => void;
}

// Define step sizes for different modifier key combinations
const STEP_SIZES = {
  DEFAULT: 0.1, // 100ms
  FINE: 0.01, // 10ms (Alt/Option)
  COARSE: 1.0, // 1 second (Shift)
};

const TimelineSelector: React.FC<TimelineSelectorProps> = ({
  duration,
  selection,
  onSelectionChange,
  currentTime,
  isPlaying,
  isMuted,
  onSeek,
  onTogglePlay,
  onToggleMute,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragHandle, setDragHandle] = useState<DragHandle>(null);
  const [focusedHandle, setFocusedHandle] = useState<DragHandle>(null);

  // Convert helpers
  const percentToSeconds = (percent: number) => (percent / 100) * duration;
  const secondsToPercent = (seconds: number) => (seconds / duration) * 100;

  // --- Keyboard Logic (UPDATED) ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;

      e.preventDefault(); // Prevent page scroll

      const currentHandle = e.currentTarget.classList.contains(
        "timeline-handle-start",
      )
        ? "start"
        : "end";
      let newTime = currentHandle === "start" ? selection.start : selection.end;

      // 1. Determine Step Size based on modifiers
      let step = STEP_SIZES.DEFAULT;
      if (e.shiftKey) {
        step = STEP_SIZES.COARSE;
      } else if (e.altKey) {
        step = STEP_SIZES.FINE;
      }

      // 2. Determine Direction
      const delta = e.key === "ArrowRight" ? step : -step;

      // 3. Apply change
      newTime += delta;

      let newSelection = { ...selection };
      // The minimum duration should be larger than the largest possible step size
      const minDurationConstraint = Math.max(STEP_SIZES.COARSE, 0.2);

      if (currentHandle === "start") {
        // Clamp start time between 0 and (end - minDurationConstraint)
        newTime = clamp(newTime, 0, selection.end - minDurationConstraint);
        newSelection.start = newTime;
      } else if (currentHandle === "end") {
        // Clamp end time between (start + minDurationConstraint) and duration
        newTime = clamp(
          newTime,
          selection.start + minDurationConstraint,
          duration,
        );
        newSelection.end = newTime;
      }

      // Ensure that floating point arithmetic errors are handled by rounding
      newSelection.start = parseFloat(newSelection.start.toFixed(3));
      newSelection.end = parseFloat(newSelection.end.toFixed(3));

      if (
        newSelection.start !== selection.start ||
        newSelection.end !== selection.end
      ) {
        onSelectionChange(newSelection);
        onSeek(newTime);
      }
    },
    [selection, duration, onSelectionChange, onSeek],
  );

  const handleMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    handle: DragHandle,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    (e.currentTarget as HTMLDivElement).focus();
    setFocusedHandle(handle);

    setIsDragging(true);
    setDragHandle(handle);
    if (isPlaying) onTogglePlay();
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !timelineRef.current || duration === 0) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const rawPercent = ((e.clientX - rect.left) / rect.width) * 100;
      const clampedPercent = clamp(rawPercent, 0, 100);
      let time = percentToSeconds(clampedPercent);
      const minDuration = 0.2;

      const newSelection = { ...selection };

      if (dragHandle === "start") {
        time = clamp(time, 0, selection.end - minDuration);
        newSelection.start = time;
      } else if (dragHandle === "end") {
        time = clamp(time, selection.start + minDuration, duration);
        newSelection.end = time;
      }

      onSelectionChange(newSelection);
      onSeek(time);
    },
    [isDragging, dragHandle, duration, selection, onSelectionChange, onSeek],
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

  const handleTrackClick = (e: React.MouseEvent) => {
    if (!timelineRef.current || duration === 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    const time = percentToSeconds(clamp(percent, 0, 100));
    onSeek(time);
  };

  const startPct = secondsToPercent(selection.start);
  const endPct = secondsToPercent(selection.end);
  const currentPct = secondsToPercent(currentTime);

  return (
    <div className="timeline-wrapper">
      <div className="toolbar" style={{ marginBottom: "0.5rem" }}>
        <div className="toolbar-controls">
          <button className="btn btn-secondary btn-icon" onClick={onTogglePlay}>
            {isPlaying ? (
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
          <button
            className="btn btn-secondary btn-icon"
            onClick={onToggleMute}
            disabled
            title="Audio preview is not available in the backend frame preview yet."
          >
            <Icon name={isMuted ? "VolumeX" : "Volume"} />
          </button>
        </div>
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
        <div
          className="timeline-selection"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />
        <div className="timeline-playhead" style={{ left: `${currentPct}%` }} />

        <div
          className={`timeline-handle timeline-handle-start ${focusedHandle === "start" ? "is-focused" : ""}`}
          style={{ left: `${startPct}%` }}
          onMouseDown={(e) => handleMouseDown(e, "start")}
          onBlur={() => setFocusedHandle(null)}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          <Icon name="Rewind" width={12} height={12} />
        </div>
        <div
          className={`timeline-handle timeline-handle-end ${focusedHandle === "end" ? "is-focused" : ""}`}
          style={{ left: `${endPct}%` }}
          onMouseDown={(e) => handleMouseDown(e, "end")}
          onBlur={() => setFocusedHandle(null)}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          <Icon name="FastForward" width={12} height={12} />
        </div>
      </div>
    </div>
  );
};

export default TimelineSelector;
