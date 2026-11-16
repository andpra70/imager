/// <reference lib="webworker" />
import { convertSvgToGcodeInWorker } from "./svgToGcodeWorkerRuntime";
import type { SvgToGcodeWorkerRequest, SvgToGcodeWorkerResponse } from "./svgToGcodeWorkerProtocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<SvgToGcodeWorkerRequest>) => {
  try {
    const result = convertSvgToGcodeInWorker(event.data.svg, event.data.options, (stage, progress) => {
      scope.postMessage({ type: "progress", stage, progress } satisfies SvgToGcodeWorkerResponse);
    });
    scope.postMessage({ type: "result", ...result } satisfies SvgToGcodeWorkerResponse);
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : "SVG to GCode error" } satisfies SvgToGcodeWorkerResponse);
  }
};

