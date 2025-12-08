export interface ClipSelection {
  start: number;
  end: number;
}

export interface CropArea {
  x: number; // Video pixel coordinates
  y: number;
  width: number;
  height: number;
}

export interface ExportArgs {
  input_path: string;
  output_path: string;
  selection: ClipSelection;
  crop: CropArea;
}

export interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
  type: "info" | "progress" | "error" | "success";
}
export type DragHandle = "start" | "end" | null;
export type CropHandle = "move" | "nw" | "ne" | "sw" | "se" | null;
