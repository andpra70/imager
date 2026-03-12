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

interface ConvertProgress {
  stage: "prepare" | "sample" | "gcode";
  progress: number;
}

interface ConvertOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ConvertProgress) => void;
}

const MIN_SAMPLE_STEP = 0.1;
const MAX_PATH_SAMPLES = 1400;
const MIN_CIRCLE_SEGMENTS = 16;
const MAX_CIRCLE_SEGMENTS = 360;

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

function parseFiniteAttribute(element: Element, name: string, fallback = 0) {
  const raw = element.getAttribute(name);
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function parsePointList(rawPoints: string) {
  const numbers = rawPoints
    .trim()
    .split(/[,\s]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const points: Point[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push({
      x: numbers[index],
      y: numbers[index + 1],
    });
  }
  return points;
}

function ensureClosed(points: Point[]) {
  if (points.length < 2) {
    return points;
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (distanceSquared(first, last) > 1e-8) {
    return [...points, { x: first.x, y: first.y }];
  }
  return points;
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

  const elements = Array.from(
    svgRoot.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse"),
  );

  const polylines: Polyline[] = [];
  let bounds: NonNullable<SvgToGcodeStats["bounds"]> | null = null;
  const lengthStep = Math.max(MIN_SAMPLE_STEP, sampleStep);

  emitProgress(options.onProgress, "prepare", 0);
  for (let elementIndex = 0; elementIndex < elements.length; elementIndex += 1) {
    throwIfAborted(options.signal);
    const element = elements[elementIndex];
    const tag = element.tagName.toLowerCase();
    let points: Point[] = [];

    if (tag === "line") {
      points = [
        { x: parseFiniteAttribute(element, "x1"), y: parseFiniteAttribute(element, "y1") },
        { x: parseFiniteAttribute(element, "x2"), y: parseFiniteAttribute(element, "y2") },
      ];
    } else if (tag === "polyline") {
      points = parsePointList(element.getAttribute("points") ?? "");
    } else if (tag === "polygon") {
      points = ensureClosed(parsePointList(element.getAttribute("points") ?? ""));
    } else if (tag === "rect") {
      const x = parseFiniteAttribute(element, "x", 0);
      const y = parseFiniteAttribute(element, "y", 0);
      const width = Math.max(0, parseFiniteAttribute(element, "width", 0));
      const height = Math.max(0, parseFiniteAttribute(element, "height", 0));
      if (width > 0 && height > 0) {
        points = [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
          { x, y },
        ];
      }
    } else if (tag === "circle" || tag === "ellipse") {
      const cx = parseFiniteAttribute(element, "cx", 0);
      const cy = parseFiniteAttribute(element, "cy", 0);
      const rx = tag === "circle"
        ? Math.max(0, parseFiniteAttribute(element, "r", 0))
        : Math.max(0, parseFiniteAttribute(element, "rx", 0));
      const ry = tag === "circle"
        ? Math.max(0, parseFiniteAttribute(element, "r", 0))
        : Math.max(0, parseFiniteAttribute(element, "ry", 0));

      if (rx > 0 && ry > 0) {
        const approxCircumference = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
        const segments = Math.max(
          MIN_CIRCLE_SEGMENTS,
          Math.min(MAX_CIRCLE_SEGMENTS, Math.ceil(approxCircumference / lengthStep)),
        );
        points = [];
        for (let index = 0; index <= segments; index += 1) {
          const theta = (index / segments) * Math.PI * 2;
          points.push({
            x: cx + rx * Math.cos(theta),
            y: cy + ry * Math.sin(theta),
          });
        }
      }
    } else if (tag === "path") {
      const pathElement = element as SVGPathElement;
      let totalLength = 0;
      try {
        totalLength = pathElement.getTotalLength();
      } catch {
        totalLength = 0;
      }

      if (Number.isFinite(totalLength) && totalLength > 0) {
        const sampleCount = Math.min(
          MAX_PATH_SAMPLES,
          Math.max(2, Math.ceil(totalLength / lengthStep) + 1),
        );
        points = [];
        for (let index = 0; index < sampleCount; index += 1) {
          throwIfAborted(options.signal);
          const distance = (index / (sampleCount - 1)) * totalLength;
          const point = pathElement.getPointAtLength(distance);
          const last = points[points.length - 1];
          if (!last || distanceSquared(last, point) > 1e-8) {
            points.push({ x: point.x, y: point.y });
          }

          if (index % 512 === 0) {
            emitProgress(options.onProgress, "sample", (elementIndex + index / sampleCount) / Math.max(elements.length, 1));
            await yieldToUi(options.signal);
          }
        }

        const d = pathElement.getAttribute("d") ?? "";
        if (closePaths && /[zZ]/.test(d)) {
          points = ensureClosed(points);
        }
      }
    }

    if (points.length >= 2) {
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
      if (closePaths && tag !== "polyline") {
        points = ensureClosed(points);
      }
      polylines.push({ points });
    }

    if (elementIndex % 10 === 0) {
      emitProgress(options.onProgress, "prepare", elementIndex / Math.max(elements.length, 1));
      await yieldToUi(options.signal);
    }
  }

  emitProgress(options.onProgress, "prepare", 1);
  emitProgress(options.onProgress, "sample", 1);

  return {
    polylines,
    bounds,
  };
}

function buildGcodeHeader(options: SvgToGcodeOptions, decimals: number) {
  return [
    "; Plotterfun SVG to GCode",
    "G21 ; millimeters",
    "G90 ; absolute mode",
    `G0 Z${formatNumber(options.safeZ, decimals)} F${formatNumber(options.travelFeedRate, 0)}`,
  ];
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
    }

    lines.push(`G0 Z${formatNumber(options.safeZ, decimals)} F${formatNumber(options.travelFeedRate, 0)}`);

    if (pathIndex % 20 === 0) {
      emitProgress(convertOptions.onProgress, "gcode", pathIndex / Math.max(polylines.length, 1));
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
