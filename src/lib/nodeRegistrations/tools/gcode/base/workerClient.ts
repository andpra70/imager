import type { BaseGcodeRequest, BaseGcodeResponse, BaseGcodeResult } from "./model";
export function startBaseGcodeWorker(request: BaseGcodeRequest) {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  let rejectJob: (reason?: unknown) => void = () => {};
  const promise = new Promise<BaseGcodeResult>((resolve, reject) => {
    rejectJob = reject;
    worker.onmessage = (event: MessageEvent<BaseGcodeResponse>) => {
      worker.terminate();
      if (event.data.type === "result") resolve(event.data.result);
      else reject(Error(event.data.message));
    };
    worker.onerror = event => { worker.terminate(); reject(Error(event.message || "Errore worker G-code")); };
    worker.postMessage(request, [request.pixels.buffer]);
  });
  return { promise, cancel: () => { worker.terminate(); rejectJob(new DOMException("Annullato", "AbortError")); } };
}
