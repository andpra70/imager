/// <reference lib="webworker" />
import { generateBaseGcode } from "./workerRuntime";
import type { BaseGcodeRequest, BaseGcodeResponse } from "./model";
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<BaseGcodeRequest>) => {
  try { const result = generateBaseGcode(event.data); scope.postMessage({ type: "result", result } satisfies BaseGcodeResponse, [result.preview]); }
  catch (error) { scope.postMessage({ type: "error", message: error instanceof Error ? error.message : "Errore G-code" } satisfies BaseGcodeResponse); }
};
