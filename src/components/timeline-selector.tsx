import { FastForward, Rewind } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipSelection } from "../types";

type DragHandle = "start" | "end" | null;

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

  const formattedTime = (time: number) => {
    if (isNaN(time) || time < 0) return "00:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // --- Time/Position Calculations ---
  const startPercent = (selection.start / duration) * 100;
  const endPercent = (selection.end / duration) * 100;
  const playheadPercent = (currentTime / duration) * 100;

  // --- Handlers ---

  // Seek the video element to the start time whenever selection changes
  useEffect(() => {
    if (videoRef.current && selection.start !== videoRef.current.currentTime) {
      videoRef.current.currentTime = selection.start;
    }
  }, [selection.start, videoRef]);

  // Update current time on video playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // Auto-pause when playback hits the end selection
      if (video.currentTime >= selection.end) {
        video.pause();
        video.currentTime = selection.end; // Snap to the end time
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [videoRef, selection.end]);

  // const secondsToPercent = (seconds: number) => (seconds / duration) * 100;
  const percentToSeconds = (percent: number) => (percent / 100) * duration;

  const handleMouseDown = (e: React.MouseEvent, handle: DragHandle) => {
    if (duration === 0 || !timelineRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(true);
    setDragHandle(handle);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragHandle || !timelineRef.current || duration === 0)
        return;

      const timelineRect = timelineRef.current.getBoundingClientRect();
      const clientX = e.clientX;

      // Calculate the raw percentage offset from the left edge of the timeline
      let newPercent =
        ((clientX - timelineRect.left) / timelineRect.width) * 100;

      // Clamp percentage between 0 and 100
      newPercent = Math.max(0, Math.min(100, newPercent));

      let newTime = percentToSeconds(newPercent);
      let newSelection = { ...selection };
      const minDuration = 0.5; // Minimum selection duration in seconds

      if (dragHandle === "start") {
        // New start must be before end, respecting minimum duration
        newTime = Math.min(newTime, selection.end - minDuration);
        newSelection.start = newTime;
        if (videoRef.current) videoRef.current.currentTime = newTime;
      } else if (dragHandle === "end") {
        // New end must be after start, respecting minimum duration
        newTime = Math.max(newTime, selection.start + minDuration);
        newSelection.end = newTime;
      }

      onSelectionChange(newSelection);
    },
    [
      isDragging,
      dragHandle,
      duration,
      onSelectionChange,
      selection,
      percentToSeconds,
      videoRef,
    ],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragHandle(null);
  }, []);

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current || duration === 0) return;
    e.stopPropagation(); // Stop propagation to prevent accidental clicks on handles from seeking

    const timelineRect = timelineRef.current.getBoundingClientRect();
    const clientX = e.clientX;

    let clickPercent =
      ((clientX - timelineRect.left) / timelineRect.width) * 100;
    clickPercent = Math.max(0, Math.min(100, clickPercent));

    const newTime = percentToSeconds(clickPercent);

    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  // Attach global mouse listeners for dragging
  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  if (duration === 0) return null;

  return (
    <div className="timeline-box">
      <p className="timeline-label">
        Timeline Selector (Total: {formattedTime(duration)})
      </p>

      <div
        ref={timelineRef}
        className="timeline-track"
        onMouseDown={handleTimelineClick}
      >
        {/* Full Duration Track */}
        <div className="timeline-full-track" />

        {/* Selected Range Visual */}
        <div
          className="timeline-selection"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />

        {/* Current Playhead */}
        {videoRef.current && (
          <div
            className="timeline-playhead"
            style={{ left: `${playheadPercent}%` }}
          />
        )}

        {/* Start Handle */}
        <div
          className="timeline-handle"
          style={{ left: `${startPercent}%` }}
          title={`Start: ${formattedTime(selection.start)}`}
          onMouseDown={(e) => handleMouseDown(e, "start")}
          onClick={(e) => e.stopPropagation()} // Prevent timeline click on handle
        >
          <Rewind className="handle-icon" />
        </div>

        {/* End Handle */}
        <div
          className="timeline-handle"
          style={{ left: `${endPercent}%` }}
          title={`End: ${formattedTime(selection.end)}`}
          onMouseDown={(e) => handleMouseDown(e, "end")}
          onClick={(e) => e.stopPropagation()} // Prevent timeline click on handle
        >
          <FastForward className="handle-icon" />
        </div>
      </div>

      {/* Time Labels */}
      <div className="timeline-labels-footer">
        <span className="timeline-time-label">
          Start: {formattedTime(selection.start)}
        </span>
        <span className="timeline-time-label">
          End: {formattedTime(selection.end)}
        </span>
      </div>
    </div>
  );
};

export default TimelineSelector;
