export const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return "00:00.0";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.floor((seconds * 10) % 10);
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${ms}`;
};

export const formatTimeShort = (time: number): string => {
  if (isNaN(time) || time < 0) return "00:00";
  const min = Math.floor(time / 60);
  const sec = Math.floor(time % 60);
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
};
