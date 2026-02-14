import { useState, useEffect, useCallback } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/tauri";
import VideoCropper from "./video-cropper";
import { CropArea } from "../types";

interface SmartVideoLoaderProps {
  originalVideoPath: string | null; // The actual GoPro HEVC file path
  // ... other props you want to pass through to VideoCropper
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentCrop: CropArea;
  onCropChange: (newCrop: CropArea) => void;
  // etc...
}

export const SmartVideoLoader: React.FC<SmartVideoLoaderProps> = ({
  originalVideoPath,
  ...cropperProps
}) => {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVideo = useCallback(async (path: string) => {
    setIsTranscoding(true);
    setError(null);

    try {
      // Check if it's HEVC/H.265 that needs transcoding
      const codec = await invoke<string>("get_video_codec", {
        inputPath: path,
      });
      console.log(`Codec: ${codec}`);
      const needsProxy =
        codec.toLowerCase().includes("hevc") ||
        codec.toLowerCase().includes("h265") ||
        codec.toLowerCase().includes("265");

      if (needsProxy) {
        console.log(`Transcoding ${codec} video to H.264 for preview...`);
        const proxyPath = await invoke<string>("generate_video_proxy", {
          inputPath: path,
        });
        // Tauri returns paths without file:// prefix, add it for the video tag
        setDisplayUrl(convertFileSrc(proxyPath));
      } else {
        // Native H.264, use directly
        setDisplayUrl(`file://${path}`);
      }
    } catch (err) {
      console.error("Failed to prepare video:", err);
      setError(`Failed to load video: ${err}`);
    } finally {
      setIsTranscoding(false);
    }
  }, []);

  useEffect(() => {
    if (originalVideoPath) {
      loadVideo(originalVideoPath);
    } else {
      setDisplayUrl(null);
    }

    // Cleanup: you might want to keep the proxy for caching,
    // or delete it when the component unmounts
    return () => {
      // Optional: cleanup old proxies periodically via a Rust command
    };
  }, [originalVideoPath, loadVideo]);

  if (isTranscoding) {
    return (
      <div className="transcoding-loader">
        <div className="spinner" />
        <span>Converting GoPro video for preview...</span>
        <small>This may take a few seconds</small>
      </div>
    );
  }

  if (error) {
    return (
      <div className="video-error">
        <span>{error}</span>
        <button
          onClick={() => originalVideoPath && loadVideo(originalVideoPath)}
        >
          Retry
        </button>
      </div>
    );
  }

  // Pass the processed URL (proxy or original) to your existing component
  return (
    <VideoCropper
      {...cropperProps}
      videoUrl={displayUrl}
      isLoading={false} // We handle loading state here
      onLoadError={(err) => setError(err)}
    />
  );
};
