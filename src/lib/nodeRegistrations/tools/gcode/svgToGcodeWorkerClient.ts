import type { SvgToGcodeOptions, SvgToGcodeStats } from "./model";
import type { SvgToGcodeWorkerRequest, SvgToGcodeWorkerResponse } from "./svgToGcodeWorkerProtocol";

export interface GcodeWorkerJob {
  promise: Promise<{ gcode: string; stats: SvgToGcodeStats }>;
  cancel: () => void;
}

export function startSvgToGcodeWorker(svg: string, options: SvgToGcodeOptions, onProgress: (stage: string, progress: number) => void): GcodeWorkerJob {
  const worker = new Worker(new URL("./svgToGcode.worker.ts", import.meta.url), { type: "module" });
  let settled = false;
  let rejectJob: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<{ gcode: string; stats: SvgToGcodeStats }>((resolve, reject) => {
    rejectJob = reject;
    worker.onmessage = (event: MessageEvent<SvgToGcodeWorkerResponse>) => {
      if (event.data.type === "progress") { onProgress(event.data.stage, event.data.progress); return; }
      settled = true; worker.terminate();
      if (event.data.type === "result") resolve({ gcode: event.data.gcode, stats: event.data.stats });
      else reject(new Error(event.data.message));
    };
    worker.onerror = (event) => { settled = true; worker.terminate(); reject(new Error(event.message || "GCode worker error")); };
    worker.postMessage({ type: "convert", svg, options } satisfies SvgToGcodeWorkerRequest);
  });
  return { promise, cancel: () => { if (settled) return; settled = true; worker.terminate(); rejectJob?.(new DOMException("Conversion cancelled", "AbortError")); } };
}
