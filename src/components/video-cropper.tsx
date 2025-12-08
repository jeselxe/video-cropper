import { useCallback, useEffect, useState } from "react";
import { CropArea } from "../types";
import { Home, Move } from "lucide-react";

interface VideoCropperProps {
  videoUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentCrop: CropArea;
  onCropChange: (newCrop: CropArea) => void;
  videoWidth: number;
  videoHeight: number;
  containerSize: { width: number; height: number };
  handleLoadedMetadata: () => void;
}

const VideoCropper: React.FC<VideoCropperProps> = ({
  videoUrl,
  videoRef,
  currentCrop,
  onCropChange,
  videoWidth,
  videoHeight,
  containerSize,
  handleLoadedMetadata,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragHandle, setDragHandle] = useState<
    "move" | "nw" | "ne" | "sw" | "se" | null
  >(null);

  // Calculate the scaling factor for the video display inside the container
  const scale = Math.min(
    containerSize.width / videoWidth,
    containerSize.height / videoHeight,
  );

  // The actual size the video is rendered at on screen
  const scaledVideoWidth = videoWidth * scale;
  const scaledVideoHeight = videoHeight * scale;

  // Offset to center the video within the container
  const offsetX = (containerSize.width - scaledVideoWidth) / 2;
  const offsetY = (containerSize.height - scaledVideoHeight) / 2;

  // Convert crop pixels (based on native resolution) to scaled screen coordinates
  const getScaledCrop = (crop: CropArea) => ({
    x: offsetX + crop.x * scale,
    y: offsetY + crop.y * scale,
    width: crop.width * scale,
    height: crop.height * scale,
  });

  const scaledCrop = getScaledCrop(currentCrop);

  // --- Drag Logic ---

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start drag if the video is loaded and we click inside the scaled video bounds
    if (!videoUrl || !scaledVideoWidth) return;
    e.preventDefault();
    e.stopPropagation();

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Get bounding rect of the main container for relative positioning
    const containerRect = e.currentTarget.getBoundingClientRect();
    const relativeX = mouseX - containerRect.left;
    const relativeY = mouseY - containerRect.top;

    // Check if clicking on a resize handle (small areas near corners)
    const handleSize = 10;

    const isClose = (p1: number, p2: number) => Math.abs(p1 - p2) <= handleSize;

    // Check corners for resize handles
    if (isClose(relativeX, scaledCrop.x) && isClose(relativeY, scaledCrop.y))
      setDragHandle("nw");
    else if (
      isClose(relativeX, scaledCrop.x + scaledCrop.width) &&
      isClose(relativeY, scaledCrop.y)
    )
      setDragHandle("ne");
    else if (
      isClose(relativeX, scaledCrop.x) &&
      isClose(relativeY, scaledCrop.y + scaledCrop.height)
    )
      setDragHandle("sw");
    else if (
      isClose(relativeX, scaledCrop.x + scaledCrop.width) &&
      isClose(relativeY, scaledCrop.y + scaledCrop.height)
    )
      setDragHandle("se");
    // Check if clicking inside the crop box for moving
    else if (
      relativeX > scaledCrop.x &&
      relativeX < scaledCrop.x + scaledCrop.width &&
      relativeY > scaledCrop.y &&
      relativeY < scaledCrop.y + scaledCrop.height
    )
      setDragHandle("move");
    else return; // Clicked outside the crop area

    setIsDragging(true);
    setDragStart({ x: mouseX, y: mouseY });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragHandle) return;

      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      let newCrop = { ...currentCrop };

      // Helper to snap to boundaries in native pixels
      const clamp = (val: number, min: number, max: number) =>
        Math.max(min, Math.min(max, val));

      // Convert delta from screen coordinates (scaled) to native video pixels
      const d_native_x = dx / scale;
      const d_native_y = dy / scale;

      if (dragHandle === "move") {
        newCrop.x = clamp(
          currentCrop.x + d_native_x,
          0,
          videoWidth - currentCrop.width,
        );
        newCrop.y = clamp(
          currentCrop.y + d_native_y,
          0,
          videoHeight - currentCrop.height,
        );
      } else {
        const min_size = 5; // Minimum size in native pixels

        switch (dragHandle) {
          case "nw":
            newCrop.x = clamp(
              currentCrop.x + d_native_x,
              0,
              currentCrop.x + currentCrop.width - min_size,
            );
            newCrop.y = clamp(
              currentCrop.y + d_native_y,
              0,
              currentCrop.y + currentCrop.height - min_size,
            );
            newCrop.width = currentCrop.width - (newCrop.x - currentCrop.x);
            newCrop.height = currentCrop.height - (newCrop.y - currentCrop.y);
            break;
          case "ne":
            newCrop.width = clamp(
              currentCrop.width + d_native_x,
              min_size,
              videoWidth - currentCrop.x,
            );
            newCrop.y = clamp(
              currentCrop.y + d_native_y,
              0,
              currentCrop.y + currentCrop.height - min_size,
            );
            newCrop.height = currentCrop.height - (newCrop.y - currentCrop.y);
            break;
          case "sw":
            newCrop.x = clamp(
              currentCrop.x + d_native_x,
              0,
              currentCrop.x + currentCrop.width - min_size,
            );
            newCrop.height = clamp(
              currentCrop.height + d_native_y,
              min_size,
              videoHeight - currentCrop.y,
            );
            newCrop.width = currentCrop.width - (newCrop.x - currentCrop.x);
            break;
          case "se":
            newCrop.width = clamp(
              currentCrop.width + d_native_x,
              min_size,
              videoWidth - currentCrop.x,
            );
            newCrop.height = clamp(
              currentCrop.height + d_native_y,
              min_size,
              videoHeight - currentCrop.y,
            );
            break;
        }
      }

      // Update state and reset drag start to current mouse position for continuous dragging
      onCropChange(newCrop);
      setDragStart({ x: e.clientX, y: e.clientY });
    },
    [
      isDragging,
      dragHandle,
      dragStart,
      currentCrop,
      videoWidth,
      videoHeight,
      onCropChange,
      scale,
    ],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragHandle(null);
  }, []);

  // Attach global mouse listeners for dragging
  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const cursorStyle = isDragging
    ? dragHandle === "move"
      ? "cursor-grabbing"
      : `cursor-${dragHandle}-resize`
    : dragHandle === "move"
      ? "cursor-grab"
      : dragHandle
        ? `cursor-${dragHandle}-resize`
        : "default";

  return (
    <div
      className="video-container"
      style={{ width: containerSize.width, height: containerSize.height }}
    >
      {videoUrl ? (
        <>
          {/* Video Element */}
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={handleLoadedMetadata} // Add this handler to the video element
            className="video-player"
            style={{
              width: scaledVideoWidth,
              height: scaledVideoHeight,
              // Ensure video doesn't move when dragging starts
              // pointerEvents: "none",
            }}
            controls
            muted
          />

          {/* Cropper Overlay and Handles */}
          <div
            className="cropper-overlay-container"
            style={{ cursor: cursorStyle }}
            onMouseDown={handleMouseDown}
          >
            {/* Dark Overlay (outside crop area) */}
            <div
              className="cropper-shadow"
              style={{
                // Top area
                top: 0,
                left: 0,
                right: 0,
                height: scaledCrop.y,
              }}
            />
            <div
              className="cropper-shadow"
              style={{
                // Bottom area
                top: scaledCrop.y + scaledCrop.height,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
            <div
              className="cropper-shadow"
              style={{
                // Left area
                top: scaledCrop.y,
                left: 0,
                width: scaledCrop.x,
                height: scaledCrop.height,
              }}
            />
            <div
              className="cropper-shadow"
              style={{
                // Right area
                top: scaledCrop.y,
                left: scaledCrop.x + scaledCrop.width,
                right: 0,
                height: scaledCrop.height,
              }}
            />

            {/* The Crop Selection Box */}
            <div
              className="crop-box"
              style={{
                left: scaledCrop.x,
                top: scaledCrop.y,
                width: scaledCrop.width,
                height: scaledCrop.height,
              }}
            >
              {/* Resize Handles (Invisible DIVs for easy click detection) */}
              {/* NW */}
              <div
                className="crop-handle cursor-nw-resize"
                style={{ left: -8, top: -8 }}
                data-handle="nw"
              />
              {/* NE */}
              <div
                className="crop-handle cursor-ne-resize"
                style={{ right: -8, top: -8 }}
                data-handle="ne"
              />
              {/* SW */}
              <div
                className="crop-handle cursor-sw-resize"
                style={{ left: -8, bottom: -8 }}
                data-handle="sw"
              />
              {/* SE */}
              <div
                className="crop-handle cursor-se-resize"
                style={{ right: -8, bottom: -8 }}
                data-handle="se"
              />

              {/* Move Handle (Center) */}
              <div className="crop-move-handle" data-handle="move">
                <Move className="w-8 h-8 text-indigo-400 opacity-50" />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="video-placeholder">
          <Home className="w-8 h-8 mr-2" />
          <span>No video loaded. Select a file to begin.</span>
        </div>
      )}
    </div>
  );
};

export default VideoCropper;
