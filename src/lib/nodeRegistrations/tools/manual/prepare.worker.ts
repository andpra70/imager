/// <reference lib="webworker" />
import { prepareArtisticCopy } from "./pipeline";
import type { ManualWorkerRequest, ManualWorkerResponse } from "./workerProtocol";

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<ManualWorkerRequest>) => {
  const { jobId, input } = event.data;
  try {
    const result = prepareArtisticCopy(input, (progress) => scope.postMessage({ type: "progress", jobId, progress } satisfies ManualWorkerResponse));
    scope.postMessage({ type: "result", jobId, result } satisfies ManualWorkerResponse);
  } catch (error) {
    scope.postMessage({ type: "error", jobId, message: error instanceof Error ? error.message : "Manual preparation failed" } satisfies ManualWorkerResponse);
  }
};
