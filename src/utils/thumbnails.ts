/**
 * Extracts thumbnails from a video file
 */
export const generateThumbnails = async (
  videoUrl: string,
  intervalSeconds: number,
): Promise<string[]> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.src = videoUrl;
    video.crossOrigin = "anonymous";

    // Mute to avoid noise during seeking
    video.muted = true;

    const thumbnails: string[] = [];

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // Scale down for performance
      canvas.width = 160;
      canvas.height = 90;

      for (let i = 0; i < duration; i += intervalSeconds) {
        video.currentTime = i;
        await new Promise((r) => (video.onseeked = r));

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnails.push(canvas.toDataURL("image/jpeg"));
        }
      }
      resolve(thumbnails);
    };
  });
};
