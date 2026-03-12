import type { GraphGcode } from "../../../../models/graphGcode";
import type { GraphSvg } from "../../../../models/graphSvg";
import type { SvgToGcodeOptions, SvgToGcodeStats } from "./model";

interface Point {
  x: number;
  y: number;
}

interface Polyline {
  points: Point[];
}

interface SvgPolylineExtraction {
  polylines: Polyline[];
  bounds: SvgToGcodeStats["bounds"];
}

interface ExtractionElementMeta {
  element: SVGGeometryElement;
  totalLength: number;
  sampleCount: number;
  matrix: DOMMatrix | null;
}

interface ConvertProgress {
  stage: "prepare" | "sample" | "gcode";
  progress: number;
}

interface ConvertOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ConvertProgress) => void;
}

function sanitizeDecimalPlaces(value: number) {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) {
    return 3;
  }
  return Math.max(0, Math.min(6, rounded));
}

function formatNumber(value: number, decimals: number) {
  const fixed = value.toFixed(decimals);
  if (fixed.includes(".")) {
    return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }
  return fixed;
}

function distanceSquared(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function updateBounds(bounds: NonNullable<SvgToGcodeStats["bounds"]>, point: Point) {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

function shouldCloseShape(element: SVGGeometryElement) {
  const tag = element.tagName.toLowerCase();
  if (tag === "polygon" || tag === "circle" || tag === "ellipse" || tag === "rect") {
    return true;
  }
  if (tag === "path") {
    const d = (element as SVGPathElement).getAttribute("d") ?? "";
    return /[zZ]/.test(d);
  }
  return false;
}

function applyMatrix(point: DOMPoint, matrix: DOMMatrix | null) {
  if (!matrix) {
    return { x: point.x, y: point.y };
  }
  const transformed = point.matrixTransform(matrix);
  return {
    x: transformed.x,
    y: transformed.y,
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("cancelled");
  }
}

async function yieldToUi(signal?: AbortSignal) {
  throwIfAborted(signal);
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
  throwIfAborted(signal);
}

function emitProgress(
  onProgress: ConvertOptions["onProgress"],
  stage: ConvertProgress["stage"],
  progress: number,
) {
  if (!onProgress) {
    return;
  }
  onProgress({
    stage,
    progress: Math.max(0, Math.min(1, progress)),
  });
}

function buildGcodeHeader(options: SvgToGcodeOptions, decimals: number) {
  return [
    "; Plotterfun SVG to GCode",
    "G21 ; millimeters",
    "G90 ; absolute mode",
    `G0 Z${formatNumber(options.safeZ, decimals)} F${formatNumber(options.travelFeedRate, 0)}`,
  ];
}

async function extractPolylinesFromSvgAsync(
  svg: GraphSvg,
  sampleStep: number,
  closePaths: boolean,
  options: ConvertOptions,
): Promise<SvgPolylineExtraction> {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(svg, "image/svg+xml");
  const parserError = parsed.querySelector("parsererror");
  if (parserError) {
    throw new Error("Invalid SVG input.");
  }

  const svgRoot = parsed.documentElement;
  if (!svgRoot || svgRoot.tagName.toLowerCase() !== "svg") {
    throw new Error("Input must be an SVG document.");
  }

  const sandbox = document.createElement("div");
  sandbox.style.position = "fixed";
  sandbox.style.left = "-100000px";
  sandbox.style.top = "-100000px";
  sandbox.style.width = "0";
  sandbox.style.height = "0";
  sandbox.style.overflow = "hidden";
  sandbox.style.opacity = "0";

  const importedSvg = document.importNode(svgRoot, true) as unknown as SVGSVGElement;
  if (!importedSvg.getAttribute("xmlns")) {
    importedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  sandbox.appendChild(importedSvg);
  document.body.appendChild(sandbox);

  try {
    const geometryElements = Array.from(
      importedSvg.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse"),
    ) as SVGGeometryElement[];

    const elementMetas: ExtractionElementMeta[] = [];
    const lengthStep = Math.max(0.1, sampleStep);
    let totalSamples = 0;

    emitProgress(options.onProgress, "prepare", 0);
    for (let index = 0; index < geometryElements.length; index += 1) {
      throwIfAborted(options.signal);
      const element = geometryElements[index];
      let totalLength = 0;
      try {
        totalLength = element.getTotalLength();
      } catch {
        continue;
      }
      if (!Number.isFinite(totalLength) || totalLength <= 0) {
        continue;
      }
      const sampleCount = Math.max(2, Math.ceil(totalLength / lengthStep) + 1);
      elementMetas.push({
        element,
        totalLength,
        sampleCount,
        matrix: (element as unknown as SVGGraphicsElement).getCTM(),
      });
      totalSamples += sampleCount;

      if (index % 12 === 0) {
        emitProgress(options.onProgress, "prepare", geometryElements.length > 0 ? index / geometryElements.length : 1);
        await yieldToUi(options.signal);
      }
    }
    emitProgress(options.onProgress, "prepare", 1);

    const dedupeEpsilonSq = 1e-8;
    const polylines: Polyline[] = [];
    let bounds: NonNullable<SvgToGcodeStats["bounds"]> | null = null;
    let processedSamples = 0;

    for (let elementIndex = 0; elementIndex < elementMetas.length; elementIndex += 1) {
      const meta = elementMetas[elementIndex];
      const points: Point[] = [];

      for (let sampleIndex = 0; sampleIndex < meta.sampleCount; sampleIndex += 1) {
        throwIfAborted(options.signal);
        const distance = (sampleIndex / (meta.sampleCount - 1)) * meta.totalLength;
        const raw = meta.element.getPointAtLength(distance);
        const point = applyMatrix(new DOMPoint(raw.x, raw.y), meta.matrix);
        const lastPoint = points[points.length - 1];
        if (!lastPoint || distanceSquared(lastPoint, point) > dedupeEpsilonSq) {
          points.push(point);
        }

        processedSamples += 1;
        if (processedSamples % 320 === 0) {
          emitProgress(options.onProgress, "sample", totalSamples > 0 ? processedSamples / totalSamples : 1);
          await yieldToUi(options.signal);
        }
      }

      if (closePaths && shouldCloseShape(meta.element) && points.length > 2) {
        const first = points[0];
        const last = points[points.length - 1];
        if (distanceSquared(first, last) > dedupeEpsilonSq) {
          points.push({ x: first.x, y: first.y });
        }
      }

      if (points.length < 2) {
        continue;
      }

      if (!bounds) {
        bounds = {
          minX: points[0].x,
          minY: points[0].y,
          maxX: points[0].x,
          maxY: points[0].y,
        };
      }
      for (const point of points) {
        updateBounds(bounds, point);
      }

      polylines.push({ points });
    }

    emitProgress(options.onProgress, "sample", 1);
    return { polylines, bounds };
  } finally {
    sandbox.remove();
  }
}

async function buildGcodeAsync(
  polylines: Polyline[],
  options: SvgToGcodeOptions,
  convertOptions: ConvertOptions,
) {
  const decimals = sanitizeDecimalPlaces(options.decimals);
  const lines: string[] = [];

  if (options.includeHeader) {
    lines.push(...buildGcodeHeader(options, decimals));
  }

  let pointCount = 0;
  for (let pathIndex = 0; pathIndex < polylines.length; pathIndex += 1) {
    throwIfAborted(convertOptions.signal);
    const polyline = polylines[pathIndex];
    if (polyline.points.length < 2) {
      continue;
    }

    const first = polyline.points[0];
    const startX = first.x * options.scale + options.offsetX;
    const startY = first.y * options.scale + options.offsetY;
    lines.push(`; path ${pathIndex + 1}`);
    lines.push(`G0 X${formatNumber(startX, decimals)} Y${formatNumber(startY, decimals)} F${formatNumber(options.travelFeedRate, 0)}`);
    lines.push(`G1 Z${formatNumber(options.drawZ, decimals)} F${formatNumber(options.travelFeedRate, 0)}`);

    for (let pointIndex = 1; pointIndex < polyline.points.length; pointIndex += 1) {
      const point = polyline.points[pointIndex];
      const x = point.x * options.scale + options.offsetX;
      const y = point.y * options.scale + options.offsetY;
      lines.push(`G1 X${formatNumber(x, decimals)} Y${formatNumber(y, decimals)} F${formatNumber(options.drawFeedRate, 0)}`);
      pointCount += 1;

      if (pointIndex % 512 === 0) {
        await yieldToUi(convertOptions.signal);
      }
    }

    lines.push(`G0 Z${formatNumber(options.safeZ, decimals)} F${formatNumber(options.travelFeedRate, 0)}`);

    if (pathIndex % 6 === 0) {
      emitProgress(convertOptions.onProgress, "gcode", polylines.length > 0 ? pathIndex / polylines.length : 1);
      await yieldToUi(convertOptions.signal);
    }
  }

  lines.push("M2");
  emitProgress(convertOptions.onProgress, "gcode", 1);

  return {
    gcode: lines.join("\n"),
    pointCount,
    commandCount: lines.length,
  };
}

export async function convertSvgToGcodeAsync(
  svg: GraphSvg,
  options: SvgToGcodeOptions,
  convertOptions: ConvertOptions = {},
): Promise<{ gcode: GraphGcode; stats: SvgToGcodeStats }> {
  const extraction = await extractPolylinesFromSvgAsync(svg, options.sampleStep, options.closePaths, convertOptions);

  if (extraction.polylines.length === 0) {
    const decimals = sanitizeDecimalPlaces(options.decimals);
    const gcode = options.includeHeader
      ? [...buildGcodeHeader(options, decimals), "M2"].join("\n")
      : "M2";
    return {
      gcode,
      stats: {
        pathCount: 0,
        pointCount: 0,
        commandCount: options.includeHeader ? 5 : 1,
        bounds: null,
      },
    };
  }

  const built = await buildGcodeAsync(extraction.polylines, options, convertOptions);
  return {
    gcode: built.gcode,
    stats: {
      pathCount: extraction.polylines.length,
      pointCount: built.pointCount,
      commandCount: built.commandCount,
      bounds: extraction.bounds,
    },
  };
}
