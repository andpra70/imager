import { optimizeGcode } from "./engine";
import type { GcodeOptimizerOptions } from "./model";

self.onmessage = (event: MessageEvent<{ gcode: string; options: GcodeOptimizerOptions }>) => {
  try { self.postMessage({ type: "result", result: optimizeGcode(event.data.gcode, event.data.options) }); }
  catch (error) { self.postMessage({ type: "error", message: error instanceof Error ? error.message : "Errore optimizer" }); }
};
