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

  const scale = Math.min(
    containerSize.width / videoWidth,
    containerSize.height / videoHeight,
  );

  const scaledVideoWidth = videoWidth * scale;
  const scaledVideoHeight = videoHeight * scale;
  const offsetX = (containerSize.width - scaledVideoWidth) / 2;
  const offsetY = (containerSize.height - scaledVideoHeight) / 2;

  const getScaledCrop = (crop: CropArea) => ({
    x: offsetX + crop.x * scale,
    y: offsetY + crop.y * scale,
    width: crop.width * scale,
    height: crop.height * scale,
  });

  const scaledCrop = getScaledCrop(currentCrop);

  // --- Drag Logic ---

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!videoUrl || !scaledVideoWidth) return;
    e.preventDefault();
    e.stopPropagation();

    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const containerRect = e.currentTarget.getBoundingClientRect();
    const relativeX = mouseX - containerRect.left;
    const relativeY = mouseY - containerRect.top;

    const handleSize = 12;
    const isClose = (p1: number, p2: number) => Math.abs(p1 - p2) <= handleSize;

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
    else if (
      relativeX > scaledCrop.x &&
      relativeX < scaledCrop.x + scaledCrop.width &&
      relativeY > scaledCrop.y &&
      relativeY < scaledCrop.y + scaledCrop.height
    )
      setDragHandle("move");
    else return;

    setIsDragging(true);
    setDragStart({ x: mouseX, y: mouseY });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragHandle) return;

      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      let newCrop = { ...currentCrop };

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
        const min_size = 50;

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

  const getCursorClass = () => {
    if (isDragging) {
      return dragHandle === "move"
        ? "cursor-grabbing"
        : `cursor-${dragHandle}-resize`;
    }
    return "cursor-default";
  };
  return (
    <div
      className="video-container"
      style={{ width: containerSize.width, height: containerSize.height }}
    >
      {videoUrl ? (
        <>
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={onLoadedMetadata}
            className="video-player"
            style={{
              width: scaledVideoWidth,
              height: scaledVideoHeight,
            }}
            controls
            muted
          />

          <div
            className={`cropper-overlay ${getCursorClass()}`}
            onMouseDown={handleMouseDown}
          >
            <div
              className="cropper-shadow"
              style={{ top: 0, left: 0, right: 0, height: scaledCrop.y }}
            />
            <div
              className="cropper-shadow"
              style={{
                top: scaledCrop.y + scaledCrop.height,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
            <div
              className="cropper-shadow"
              style={{
                top: scaledCrop.y,
                left: 0,
                width: scaledCrop.x,
                height: scaledCrop.height,
              }}
            />
            <div
              className="cropper-shadow"
              style={{
                top: scaledCrop.y,
                left: scaledCrop.x + scaledCrop.width,
                right: 0,
                height: scaledCrop.height,
              }}
            />

            <div
              className="crop-box"
              style={{
                left: scaledCrop.x,
                top: scaledCrop.y,
                width: scaledCrop.width,
                height: scaledCrop.height,
              }}
            >
              <div
                className="crop-handle crop-handle-nw"
                style={{ left: -6, top: -6 }}
              />
              <div
                className="crop-handle crop-handle-ne"
                style={{ right: -6, top: -6 }}
              />
              <div
                className="crop-handle crop-handle-sw"
                style={{ left: -6, bottom: -6 }}
              />
              <div
                className="crop-handle crop-handle-se"
                style={{ right: -6, bottom: -6 }}
              />

              <div className="crop-move-handle">
                <Icon name="Move" />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="video-placeholder">
          <Icon name="Video" />
          <span>No video loaded</span>
        </div>
      )}
    </div>
  );
};

export default VideoCropper;
