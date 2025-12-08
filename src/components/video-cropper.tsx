import { useCallback, useEffect, useState } from "react";
import { CropArea, CropHandle } from "../types";
import { clamp } from "../utils";
import Icon from "./icon";

interface VideoCropperProps {
  videoUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentCrop: CropArea;
  onCropChange: (newCrop: CropArea) => void;
  videoWidth: number;
  videoHeight: number;
  containerSize: { width: number; height: number };
  onLoadedMetadata: () => void;
}

const VideoCropper: React.FC<VideoCropperProps> = ({
  videoUrl,
  videoRef,
  currentCrop,
  onCropChange,
  videoWidth,
  videoHeight,
  containerSize,
  onLoadedMetadata,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragHandle, setDragHandle] = useState<CropHandle>(null);

  // 1. Calculate the scale to FIT the video inside the container perfectly
  // Using 0.95 factor to give a tiny bit of breathing room if needed, or 1.0 for flush
  const scale =
    Math.min(
      (containerSize.width - 32) / videoWidth, // 32px padding safety
      (containerSize.height - 32) / videoHeight,
    ) || 1;

  // 2. The dimensions the video will actually render at
  const renderWidth = videoWidth * scale;
  const renderHeight = videoHeight * scale;

  // 3. Map crop coordinates (video pixels) to CSS pixels
  const getCssCrop = (crop: CropArea) => ({
    x: crop.x * scale,
    y: crop.y * scale,
    width: crop.width * scale,
    height: crop.height * scale,
  });

  const cssCrop = getCssCrop(currentCrop);

  // --- Drag Logic ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!videoUrl) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left; // x relative to the overlay/wrapper
    const y = e.clientY - rect.top; // y relative to the overlay/wrapper

    const handleSize = 15; // Hit area size
    const isHit = (p1: number, p2: number) => Math.abs(p1 - p2) <= handleSize;

    // Check handles based on CSS coordinates
    if (isHit(x, cssCrop.x) && isHit(y, cssCrop.y)) setDragHandle("nw");
    else if (isHit(x, cssCrop.x + cssCrop.width) && isHit(y, cssCrop.y))
      setDragHandle("ne");
    else if (isHit(x, cssCrop.x) && isHit(y, cssCrop.y + cssCrop.height))
      setDragHandle("sw");
    else if (
      isHit(x, cssCrop.x + cssCrop.width) &&
      isHit(y, cssCrop.y + cssCrop.height)
    )
      setDragHandle("se");
    else if (
      x > cssCrop.x &&
      x < cssCrop.x + cssCrop.width &&
      y > cssCrop.y &&
      y < cssCrop.y + cssCrop.height
    )
      setDragHandle("move");
    else return;

    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragHandle) return;

      const dxPx = e.clientX - dragStart.x;
      const dyPx = e.clientY - dragStart.y;

      // Convert CSS pixel delta to Video pixel delta
      const dx = dxPx / scale;
      const dy = dyPx / scale;

      let newCrop = { ...currentCrop };
      const minSize = 50; // Minimum crop size in video pixels

      if (dragHandle === "move") {
        newCrop.x = clamp(
          currentCrop.x + dx,
          0,
          videoWidth - currentCrop.width,
        );
        newCrop.y = clamp(
          currentCrop.y + dy,
          0,
          videoHeight - currentCrop.height,
        );
      } else {
        // Resizing logic
        switch (dragHandle) {
          case "nw":
            // Clamp x/y so we don't flip the box (maintain min width)
            const maxX = currentCrop.x + currentCrop.width - minSize;
            const maxY = currentCrop.y + currentCrop.height - minSize;
            newCrop.x = clamp(currentCrop.x + dx, 0, maxX);
            newCrop.y = clamp(currentCrop.y + dy, 0, maxY);
            newCrop.width = currentCrop.width + (currentCrop.x - newCrop.x);
            newCrop.height = currentCrop.height + (currentCrop.y - newCrop.y);
            break;
          case "ne":
            // Limit width change
            newCrop.width = clamp(
              currentCrop.width + dx,
              minSize,
              videoWidth - currentCrop.x,
            );
            // Y behaves same as NW
            const maxY_ne = currentCrop.y + currentCrop.height - minSize;
            newCrop.y = clamp(currentCrop.y + dy, 0, maxY_ne);
            newCrop.height = currentCrop.height + (currentCrop.y - newCrop.y);
            break;
          case "sw":
            // X behaves same as NW
            const maxX_sw = currentCrop.x + currentCrop.width - minSize;
            newCrop.x = clamp(currentCrop.x + dx, 0, maxX_sw);
            newCrop.width = currentCrop.width + (currentCrop.x - newCrop.x);
            newCrop.height = clamp(
              currentCrop.height + dy,
              minSize,
              videoHeight - currentCrop.y,
            );
            break;
          case "se":
            newCrop.width = clamp(
              currentCrop.width + dx,
              minSize,
              videoWidth - currentCrop.x,
            );
            newCrop.height = clamp(
              currentCrop.height + dy,
              minSize,
              videoHeight - currentCrop.y,
            );
            break;
        }
      }

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
      scale,
      onCropChange,
    ],
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

  const cursorClass = isDragging
    ? dragHandle === "move"
      ? "cursor-grabbing"
      : `cursor-${dragHandle}-resize`
    : "";

  if (!videoUrl) {
    return (
      <div className="video-placeholder">
        <Icon name="Video" />
        <span>No video loaded</span>
      </div>
    );
  }

  return (
    // Wrapper: tightly wraps video at calculated render size
    <div
      className="video-wrapper"
      style={{ width: renderWidth, height: renderHeight }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        onLoadedMetadata={onLoadedMetadata}
        className="video-player"
        muted
      />

      {/* Overlay is now 100% of wrapper, so it aligns perfectly */}
      <div
        className={`cropper-overlay ${cursorClass}`}
        onMouseDown={handleMouseDown}
      >
        {/* Shadows */}
        <div
          className="cropper-shadow"
          style={{ top: 0, left: 0, right: 0, height: cssCrop.y }}
        />
        <div
          className="cropper-shadow"
          style={{
            top: cssCrop.y + cssCrop.height,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
        <div
          className="cropper-shadow"
          style={{
            top: cssCrop.y,
            left: 0,
            width: cssCrop.x,
            height: cssCrop.height,
          }}
        />
        <div
          className="cropper-shadow"
          style={{
            top: cssCrop.y,
            left: cssCrop.x + cssCrop.width,
            right: 0,
            height: cssCrop.height,
          }}
        />

        {/* Crop Box */}
        <div
          className="crop-box"
          style={{
            left: cssCrop.x,
            top: cssCrop.y,
            width: cssCrop.width,
            height: cssCrop.height,
          }}
        >
          <div className="crop-handle crop-handle-nw" />
          <div className="crop-handle crop-handle-ne" />
          <div className="crop-handle crop-handle-sw" />
          <div className="crop-handle crop-handle-se" />
          <div className="crop-move-overlay">
            <Icon name="Move" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoCropper;
