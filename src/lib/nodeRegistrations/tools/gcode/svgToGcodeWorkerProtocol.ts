import type { SvgToGcodeOptions, SvgToGcodeStats } from "./model";

export interface SvgToGcodeWorkerRequest {
  type: "convert";
  svg: string;
  options: SvgToGcodeOptions;
}

export type SvgToGcodeWorkerResponse =
  | { type: "progress"; stage: string; progress: number }
  | { type: "result"; gcode: string; stats: SvgToGcodeStats }
  | { type: "error"; message: string };

