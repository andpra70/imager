import type { MatitaRequest, MatitaResponse, MatitaResult } from "./model";
export function startMatitaWorker(request: MatitaRequest, onProgress: (strokes: number, mse: number, stage: number, preview: ImageBitmap) => void) {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  let settled = false;
  let rejectJob: (reason?: unknown) => void = () => {};
  const promise = new Promise<MatitaResult>((resolve, reject) => {
    rejectJob = reject;
    worker.onmessage = (event: MessageEvent<MatitaResponse>) => {
      if (event.data.type === "progress") { onProgress(event.data.strokes, event.data.mse, event.data.stage, event.data.preview); return; }
      settled = true; worker.terminate();
      if (event.data.type === "result") resolve(event.data.result);
      else reject(Error(event.data.message));
    };
    worker.onerror = event => { settled = true; worker.terminate(); reject(Error(event.message || "Errore worker Matita")); };
    worker.postMessage(request, [request.pixels.buffer]);
  });
  return { promise, cancel: () => { if (settled) return; settled = true; worker.terminate(); rejectJob(new DOMException("Annullato", "AbortError")); } };
}
