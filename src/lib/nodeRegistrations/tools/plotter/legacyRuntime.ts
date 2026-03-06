import type { GraphImage } from "../../../../models/graphImage";
import type { GraphSvg } from "../../../../models/graphSvg";
import { rasterizeGraphSvg } from "../../../imageUtils";

import helpersSource from "./legacy/helpers.js?raw";
import boxesSource from "./legacy/boxes.js?raw";
import delaunaySource from "./legacy/delaunay.js?raw";
import dotsSource from "./legacy/dots.js?raw";
import halftoneSource from "./legacy/halftone.js?raw";
import implodeSource from "./legacy/implode.js?raw";
import jaggySource from "./legacy/jaggy.js?raw";
import linedrawSource from "./legacy/linedraw.js?raw";
import linescanSource from "./legacy/linescan.js?raw";
import longwaveSource from "./legacy/longwave.js?raw";
import mosaicSource from "./legacy/mosaic.js?raw";
import needlesSource from "./legacy/needles.js?raw";
import peanoSource from "./legacy/peano.js?raw";
import polyspiralSource from "./legacy/polyspiral.js?raw";
import sawtoothSource from "./legacy/sawtooth.js?raw";
import spiralSource from "./legacy/spiral.js?raw";
import springsSource from "./legacy/springs.js?raw";
import squiggleSource from "./legacy/squiggle.js?raw";
import squiggleLeftRightSource from "./legacy/squiggleLeftRight.js?raw";
import stippleSource from "./legacy/stipple.js?raw";
import sublineSource from "./legacy/subline.js?raw";
import wavesSource from "./legacy/waves.js?raw";
import wovenSource from "./legacy/woven.js?raw";
import voronoiSource from "./legacy/external/rhill-voronoi-core.min.js?raw";
import stackBlurSource from "./legacy/external/stackblur.min.js?raw";

type LegacyAlgorithmFile =
  | "boxes.js"
  | "delaunay.js"
  | "dots.js"
  | "halftone.js"
  | "implode.js"
  | "jaggy.js"
  | "linedraw.js"
  | "linescan.js"
  | "longwave.js"
  | "mosaic.js"
  | "needles.js"
  | "peano.js"
  | "polyspiral.js"
  | "sawtooth.js"
  | "spiral.js"
  | "springs.js"
  | "squiggle.js"
  | "squiggleLeftRight.js"
  | "stipple.js"
  | "subline.js"
  | "waves.js"
  | "woven.js";

interface PlotterLegacyRunInput {
  algorithmFile: LegacyAlgorithmFile;
  config: Record<string, string | number | boolean>;
  image: GraphImage;
  signal?: AbortSignal;
}

export interface PlotterLegacyRunResult {
  preview: GraphImage;
  svg: GraphSvg;
  pathCount: number;
  status: string;
}

type LegacyMessage = [string, unknown];

const legacySources: Record<string, string> = {
  "helpers.js": helpersSource,
  "boxes.js": boxesSource,
  "delaunay.js": delaunaySource,
  "dots.js": dotsSource,
  "halftone.js": halftoneSource,
  "implode.js": implodeSource,
  "jaggy.js": jaggySource,
  "linedraw.js": linedrawSource,
  "linescan.js": linescanSource,
  "longwave.js": longwaveSource,
  "mosaic.js": mosaicSource,
  "needles.js": needlesSource,
  "peano.js": peanoSource,
  "polyspiral.js": polyspiralSource,
  "sawtooth.js": sawtoothSource,
  "spiral.js": spiralSource,
  "springs.js": springsSource,
  "squiggle.js": squiggleSource,
  "squiggleLeftRight.js": squiggleLeftRightSource,
  "stipple.js": stippleSource,
  "subline.js": sublineSource,
  "waves.js": wavesSource,
  "woven.js": wovenSource,
  "external/rhill-voronoi-core.min.js": voronoiSource,
  "external/stackblur.min.js": stackBlurSource,
};

function buildLegacyBundleSource(algorithmFile: LegacyAlgorithmFile) {
  const algorithmSource = legacySources[algorithmFile];
  if (!algorithmSource) {
    throw new Error(`Unsupported legacy algorithm: ${algorithmFile}`);
  }

  // Build one combined script so helper/global symbols live in the same
  // lexical environment of the algorithm onmessage handler.
  return [
    helpersSource,
    voronoiSource,
    stackBlurSource,
    algorithmSource,
  ].join("\n;\n");
}

function evaluateLegacySource(
  sandbox: Record<string, unknown>,
  source: string,
  captureNames: string[],
) {
  const captureObject = `{${captureNames
    .map((name) => `"${name}": (typeof ${name} !== "undefined" ? ${name} : undefined)`)
    .join(",")}}`;
  const evaluator = new Function("self", `with(self){\n${source}\n;return ${captureObject};\n}`);
  return evaluator(sandbox) as Record<string, unknown>;
}

function mergeCapturedSymbols(
  sandbox: Record<string, unknown>,
  captured: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(captured)) {
    if (value !== undefined) {
      sandbox[key] = value;
    }
  }
}

function getCaptureListForPath(path: string) {
  if (path === "helpers.js") {
    return [
      "defaultControls",
      "pixelProcessor",
      "autocontrast",
      "sortlines",
      "animatePointList",
      "postLines",
      "postCircles",
      "perlinNoise",
    ];
  }
  if (path === "external/rhill-voronoi-core.min.js") {
    return ["Voronoi"];
  }
  if (path === "external/stackblur.min.js") {
    return ["StackBlur"];
  }
  return ["onmessage"];
}

function countSvgPaths(pathData: string) {
  const matches = pathData.match(/\bM-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g);
  return matches?.length ?? 0;
}

function wrapSvg(pathData: string, width: number, height: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#FFFFFF"/><path d="${pathData}" fill="none" stroke="#000000" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function createLegacySandbox(
  sink: {
    onMessage: (message: LegacyMessage) => void;
  },
) {
  const sandbox = {
    Math,
    Date,
    Promise,
    console,
    performance,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Uint8Array,
    Uint8ClampedArray,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
  } as Record<string, unknown>;

  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  // Predefine onmessage so legacy scripts assigning `onmessage = fn`
  // write into this sandbox object (and not outer global scope).
  sandbox.onmessage = null;
  sandbox.postMessage = (message: LegacyMessage) => {
    sink.onMessage(message);
  };
  sandbox.importScripts = (...paths: string[]) => {
    for (const rawPath of paths) {
      const path = String(rawPath).trim();
      const source = legacySources[path];
      if (!source) {
        throw new Error(`Legacy script not found: ${path}`);
      }
      const captured = evaluateLegacySource(sandbox, source, getCaptureListForPath(path));
      mergeCapturedSymbols(sandbox, captured);
    }
  };

  return sandbox as {
    postMessage: (message: LegacyMessage) => void;
    importScripts: (...paths: string[]) => void;
    onmessage?: (event: { data: unknown }) => void;
    [key: string]: unknown;
  };
}

async function runLegacyAlgorithmInSandbox(
  algorithmFile: LegacyAlgorithmFile,
  config: Record<string, string | number | boolean>,
  imageData: ImageData,
  signal?: AbortSignal,
) {
  let svgPathData = "";
  let sawSvgPathMessage = false;
  let status = "";
  let lastActivityAt = performance.now();
  let doneMessageSeen = false;
  let started = false;

  const sandbox = createLegacySandbox({
    onMessage(message) {
      const [kind, value] = message;
      if (kind === "svg-path") {
        sawSvgPathMessage = true;
        svgPathData = String(value ?? "");
        lastActivityAt = performance.now();
        return;
      }
      if (kind === "msg") {
        status = String(value ?? "");
        if (status.trim().toLowerCase() === "done") {
          doneMessageSeen = true;
        }
        lastActivityAt = performance.now();
      }
    },
  });

  const source = legacySources[algorithmFile];
  const combinedSource = buildLegacyBundleSource(algorithmFile);
  const captured = evaluateLegacySource(
    sandbox,
    combinedSource,
    ["onmessage", "pixelProcessor", "autocontrast", "sortlines", "StackBlur", "Voronoi"],
  );
  mergeCapturedSymbols(sandbox, captured);

  const messageHandler =
    typeof sandbox.onmessage === "function"
      ? sandbox.onmessage
      : typeof (sandbox.self as { onmessage?: unknown }).onmessage === "function"
        ? ((sandbox.self as { onmessage: (event: { data: unknown }) => void }).onmessage)
        : null;

  if (!messageHandler) {
    throw new Error(`Legacy script ${algorithmFile} does not define onmessage handler.`);
  }

  try {
    messageHandler({ data: [config, imageData] });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Legacy runtime execution failed (${algorithmFile}): ${detail}`);
  }
  started = true;

  return await new Promise<{ svgPathData: string; status: string }>((resolve, reject) => {
    const startedAt = performance.now();
    const timeoutMs = 30000;
    const minIdleMs = 220;
    const pollMs = 50;

    const timer = window.setInterval(() => {
      if (signal?.aborted) {
        window.clearInterval(timer);
        reject(new Error("cancelled"));
        return;
      }

      const now = performance.now();
      const idleMs = now - lastActivityAt;
      const elapsedMs = now - startedAt;
      const hasOutput = sawSvgPathMessage;

      if (doneMessageSeen && idleMs >= minIdleMs) {
        window.clearInterval(timer);
        resolve({ svgPathData, status: status || "done" });
        return;
      }

      if (started && hasOutput && idleMs >= minIdleMs * 2) {
        window.clearInterval(timer);
        resolve({ svgPathData, status: status || "ready" });
        return;
      }

      if (elapsedMs >= timeoutMs) {
        window.clearInterval(timer);
        if (hasOutput) {
          resolve({ svgPathData, status: status || "timeout" });
          return;
        }
        reject(new Error(`Legacy algorithm timeout: ${algorithmFile}`));
      }
    }, pollMs);
  });
}

export async function executePlotterLegacyAlgorithm({
  algorithmFile,
  config,
  image,
  signal,
}: PlotterLegacyRunInput): Promise<PlotterLegacyRunResult> {
  const context = image.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("2D context not available.");
  }

  const imageData = context.getImageData(0, 0, image.width, image.height);
  const runtimeConfig = {
    ...config,
    width: image.width,
    height: image.height,
  };

  const { svgPathData, status } = await runLegacyAlgorithmInSandbox(algorithmFile, runtimeConfig, imageData, signal);
  const svg = wrapSvg(svgPathData, image.width, image.height);
  const preview = await rasterizeGraphSvg(svg);
  return {
    preview,
    svg,
    pathCount: countSvgPaths(svgPathData),
    status,
  };
}
