/// <reference lib="webworker" />
import { MatitaSplineEngine } from "./engine";
import type { MatitaRequest, MatitaResponse } from "../matita/model";
import type { MatitaSplineOptions } from "./model";
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<MatitaRequest<MatitaSplineOptions>>) => {
  try {
    const engine = new MatitaSplineEngine(event.data);
    const result = await engine.run((strokes, mse, stage, preview) => scope.postMessage({ type: "progress", strokes, mse, stage, preview } satisfies MatitaResponse, [preview]));
    scope.postMessage({ type: "result", result } satisfies MatitaResponse, [result.preview]);
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : "Errore Matita Spline" } satisfies MatitaResponse);
  }
};
