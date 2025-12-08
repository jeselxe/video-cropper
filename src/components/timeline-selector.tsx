import { useCallback, useEffect, useRef, useState } from "react";
import { ClipSelection, DragHandle } from "../types";
import { clamp } from "../utils";
import { formatTime, formatTimeShort } from "../utils/format";
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

  const startPercent = (selection.start / duration) * 100;
  const endPercent = (selection.end / duration) * 100;
  const playheadPercent = (currentTime / duration) * 100;

  useEffect(() => {
    if (videoRef.current && selection.start !== videoRef.current.currentTime) {
      videoRef.current.currentTime = selection.start;
    }
  }, [selection.start, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.currentTime >= selection.end) {
        video.pause();
        video.currentTime = selection.end;
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [videoRef, selection.end]);

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
      let newPercent =
        ((e.clientX - timelineRect.left) / timelineRect.width) * 100;
      newPercent = clamp(newPercent, 0, 100);

      let newTime = percentToSeconds(newPercent);
      let newSelection = { ...selection };
      const minDuration = 0.5;

      if (dragHandle === "start") {
        newTime = Math.min(newTime, selection.end - minDuration);
        newSelection.start = newTime;
        if (videoRef.current) videoRef.current.currentTime = newTime;
      } else if (dragHandle === "end") {
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
    e.stopPropagation();

    const timelineRect = timelineRef.current.getBoundingClientRect();
    let clickPercent =
      ((e.clientX - timelineRect.left) / timelineRect.width) * 100;
    clickPercent = clamp(clickPercent, 0, 100);

    const newTime = percentToSeconds(clickPercent);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

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
    <div className="timeline-container">
      <div className="timeline-header">
        <span className="timeline-title">Timeline</span>
        <span className="timeline-duration">{formatTimeShort(duration)}</span>
      </div>

      <div
        ref={timelineRef}
        className="timeline-track"
        onMouseDown={handleTimelineClick}
      >
        <div className="timeline-bg" />

        <div
          className="timeline-selection"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />

        {videoRef.current && (
          <div
            className="timeline-playhead"
            style={{ left: `${playheadPercent}%` }}
          />
        )}

        <div
          className="timeline-handle timeline-handle-start"
          style={{ left: `${startPercent}%` }}
          title={`Start: ${formatTimeShort(selection.start)}`}
          onMouseDown={(e) => handleMouseDown(e, "start")}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="Rewind" />
        </div>

        <div
          className="timeline-handle timeline-handle-end"
          style={{ left: `${endPercent}%` }}
          title={`End: ${formatTimeShort(selection.end)}`}
          onMouseDown={(e) => handleMouseDown(e, "end")}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="FastForward" />
        </div>
      </div>

      <div className="timeline-labels">
        <span className="timeline-label-start">
          {formatTime(selection.start)}
        </span>
        <span className="timeline-label-end">{formatTime(selection.end)}</span>
      </div>
    </div>
  );
};
export default TimelineSelector;
