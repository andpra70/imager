import type { SvgToGcodeOptions, SvgToGcodeStats } from "./model";

interface Point { x: number; y: number }
interface Polyline { points: Point[]; color: string; luminance: number }
type Progress = (stage: string, progress: number) => void;

const numberPattern = "[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?";
const tokenPattern = new RegExp(`[a-zA-Z]|${numberPattern}`, "g");

function attributes(source: string) {
  const result: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  return result;
}

function paintColor(attr: Record<string, string>) {
  const styles = attributes((attr.style ?? "").replace(/\s*:\s*/g, '="').replace(/\s*;\s*/g, '" '));
  const raw = (attr.stroke && attr.stroke !== "none" ? attr.stroke : styles.stroke && styles.stroke !== "none" ? styles.stroke : attr.fill && attr.fill !== "none" ? attr.fill : styles.fill && styles.fill !== "none" ? styles.fill : "#000000").trim().toLowerCase();
  let rgb: number[] | null = null;
  if (/^#[0-9a-f]{3}$/i.test(raw)) rgb = [...raw.slice(1)].map(c => Number.parseInt(c + c, 16));
  else if (/^#[0-9a-f]{6}$/i.test(raw)) rgb = [1, 3, 5].map(i => Number.parseInt(raw.slice(i, i + 2), 16));
  else if (/^rgba?\(/.test(raw)) rgb = (raw.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  else {
    const names: Record<string, number[]> = { black: [0,0,0], white: [255,255,255], red: [255,0,0], green: [0,128,0], blue: [0,0,255], cyan: [0,255,255], magenta: [255,0,255], yellow: [255,255,0], gray: [128,128,128], grey: [128,128,128] };
    rgb = names[raw] ?? null;
  }
  if (!rgb || rgb.length < 3 || rgb.some(value => !Number.isFinite(value))) return { color: raw, luminance: 0 };
  const channels = rgb.map(value => Math.max(0, Math.min(255, Math.round(value))));
  return { color: `#${channels.map(value => value.toString(16).padStart(2, "0")).join("")}`, luminance: (.2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]) / 255 };
}

function number(value: string | undefined, fallback = 0) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pointList(value: string) {
  const values = value.match(new RegExp(numberPattern, "g"))?.map(Number) ?? [];
  const points: Point[] = [];
  for (let i = 0; i + 1 < values.length; i += 2) points.push({ x: values[i], y: values[i + 1] });
  return points;
}

function close(points: Point[]) {
  if (points.length < 2) return points;
  const first = points[0]; const last = points[points.length - 1];
  if (first.x !== last.x || first.y !== last.y) points.push({ ...first });
  return points;
}

function curveSteps(points: Point[], step: number, cap: number) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return Math.max(2, Math.min(64, cap, Math.ceil(length / Math.max(0.1, step))));
}

function parsePath(d: string, step: number, cap: number) {
  const tokens = d.match(tokenPattern) ?? [];
  const paths: Point[][] = [];
  let points: Point[] = [];
  let i = 0; let command = ""; let current = { x: 0, y: 0 }; let start = { x: 0, y: 0 };
  let lastControl: Point | null = null;
  const isCommand = (value: string | undefined) => Boolean(value && /^[a-zA-Z]$/.test(value));
  const take = () => Number(tokens[i++]);
  const finishPath = () => { if (points.length >= 2) paths.push(points); points = []; };
  const add = (point: Point) => { if (!points.length) points.push({ ...current }); current = point; if (points.length < cap) points.push(point); };
  while (i < tokens.length) {
    if (isCommand(tokens[i])) command = tokens[i++];
    if (!command) break;
    const relative = command === command.toLowerCase();
    const op = command.toUpperCase();
    const base = { ...current };
    const absolute = (x: number, y: number) => relative ? { x: base.x + x, y: base.y + y } : { x, y };
    if (op === "M" || op === "L" || op === "T") {
      if (i + 1 >= tokens.length || isCommand(tokens[i])) continue;
      const point = absolute(take(), take());
      if (op === "M") { finishPath(); current = point; start = { ...point }; points = [{ ...point }]; command = relative ? "l" : "L"; }
      else if (points.length < cap) add(point);
      lastControl = null;
    } else if (op === "H") {
      if (isCommand(tokens[i])) continue; const x = take(); add({ x: relative ? base.x + x : x, y: base.y }); lastControl = null;
    } else if (op === "V") {
      if (isCommand(tokens[i])) continue; const y = take(); add({ x: base.x, y: relative ? base.y + y : y }); lastControl = null;
    } else if (op === "C" || op === "S" || op === "Q") {
      const required = op === "C" ? 6 : 4;
      if (i + required - 1 >= tokens.length || isCommand(tokens[i])) continue;
      let c1: Point; let c2: Point; let end: Point;
      if (op === "C") { c1 = absolute(take(), take()); c2 = absolute(take(), take()); end = absolute(take(), take()); }
      else if (op === "S") { c1 = lastControl ? { x: 2 * base.x - lastControl.x, y: 2 * base.y - lastControl.y } : base; c2 = absolute(take(), take()); end = absolute(take(), take()); }
      else { c1 = absolute(take(), take()); end = absolute(take(), take()); c2 = c1; }
      const steps = curveSteps([base, c1, c2, end], step, cap - points.length);
      for (let n = 1; n <= steps && points.length < cap; n += 1) {
        const t = n / steps; const u = 1 - t;
        if (op === "Q") add({ x: u*u*base.x + 2*u*t*c1.x + t*t*end.x, y: u*u*base.y + 2*u*t*c1.y + t*t*end.y });
        else add({ x: u*u*u*base.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*end.x, y: u*u*u*base.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*end.y });
      }
      lastControl = op === "Q" ? c1 : c2;
    } else if (op === "A") {
      if (i + 6 >= tokens.length || isCommand(tokens[i])) continue;
      take(); take(); take(); take(); take(); const end = absolute(take(), take()); add(end); lastControl = null;
    } else if (op === "Z") {
      if (points.length && points.length < cap) add({ ...start });
      current = { ...start }; finishPath(); command = ""; lastControl = null;
    } else { i += 1; }
  }
  finishPath();
  return paths;
}

function extract(svg: string, options: SvgToGcodeOptions, progress: Progress) {
  if (!/<svg\b/i.test(svg)) throw new Error("Input must be an SVG document.");
  const tags = [...svg.matchAll(/<(path|line|polyline|polygon|rect|circle|ellipse)\b([^>]*)>/gi)];
  const polylines: Polyline[] = [];
  const step = options.fastDraft ? options.sampleStep * 2 : options.sampleStep;
  const cap = Math.max(50, options.maxPointsPerPath);
  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index][1].toLowerCase(); const attr = attributes(tags[index][2]); let points: Point[] = [];
    if (tag === "path") {
      const color = paintColor(attr);
      for (const subpath of parsePath(attr.d ?? "", step, cap)) {
        if (options.closePaths) close(subpath);
        polylines.push({ points: subpath, ...color });
      }
      continue;
    }
    else if (tag === "line") points = [{ x: number(attr.x1), y: number(attr.y1) }, { x: number(attr.x2), y: number(attr.y2) }];
    else if (tag === "polyline" || tag === "polygon") { points = pointList(attr.points ?? ""); if (tag === "polygon") close(points); }
    else if (tag === "rect") { const x=number(attr.x), y=number(attr.y), w=number(attr.width), h=number(attr.height); if(w>0&&h>0) points=close([{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]); }
    else { const cx=number(attr.cx), cy=number(attr.cy), rx=tag==="circle"?number(attr.r):number(attr.rx), ry=tag==="circle"?number(attr.r):number(attr.ry); if(rx>0&&ry>0){ const count=Math.max(12,Math.min(cap,Math.ceil(2*Math.PI*Math.max(rx,ry)/step))); for(let n=0;n<=count;n+=1){const a=n/count*Math.PI*2;points.push({x:cx+rx*Math.cos(a),y:cy+ry*Math.sin(a)});}} }
    if (options.closePaths && tag !== "polyline") close(points);
    if (points.length >= 2) polylines.push({ points, ...paintColor(attr) });
    if (index % 20 === 0) progress("sample", tags.length ? index / tags.length : 1);
  }
  progress("sample", 1); return polylines;
}

export function convertSvgToGcodeInWorker(svg: string, options: SvgToGcodeOptions, progress: Progress) {
  const extracted = extract(svg, options, progress);
  const levels = Math.max(2, Math.min(256, Math.round(options.pressureLevels ?? 8)));
  const intensityOf = (path: Polyline) => Math.round(path.luminance * (levels - 1)) / (levels - 1);
  const visible = options.pressure ? extracted.filter(path => intensityOf(path) < 1) : extracted;
  const colorOrder = new Map<string, number>();
  visible.forEach(path => { if (!colorOrder.has(path.color)) colorOrder.set(path.color, colorOrder.size); });
  const polylines = options.toolsColors ? [...visible].sort((a, b) => (colorOrder.get(a.color) ?? 0) - (colorOrder.get(b.color) ?? 0)) : visible;
  const decimals = Math.max(0, Math.min(6, Math.round(options.decimals)));
  const fmt = (value: number, places = decimals) => Number(value.toFixed(places)).toString();
  const lines: string[] = options.includeHeader ? ["; Plotterfun SVG to GCode", "G21 ; millimeters", "G90 ; absolute mode", `G0 Z${fmt(options.safeZ)} F${fmt(options.travelFeedRate,0)}`] : [];
  if (options.pressure) lines.push(`; pressure drawZ ${fmt(options.drawZ)} safeZ ${fmt(options.safeZ)}`);
  let pointCount = 0; let bounds: SvgToGcodeStats["bounds"] = null;
  const tools = new Map<string, number>();
  let activeTool = 0;
  polylines.forEach((polyline, pathIndex) => {
    if (options.toolsColors) {
      let tool = tools.get(polyline.color);
      if (!tool) { tool = tools.size + 1; tools.set(polyline.color, tool); }
      if (tool !== activeTool) {
        lines.push(`G0 Z${fmt(options.safeZ)} F${fmt(options.travelFeedRate,0)}`, `; tool T${tool} color ${polyline.color}`, `T${tool} M6`);
        activeTool = tool;
      }
    }
    const intensity = intensityOf(polyline);
    const z = options.pressure ? options.drawZ + (options.safeZ - options.drawZ) * intensity : options.drawZ;
    for (const point of polyline.points) bounds = bounds ? { minX: Math.min(bounds.minX,point.x), minY: Math.min(bounds.minY,point.y), maxX: Math.max(bounds.maxX,point.x), maxY: Math.max(bounds.maxY,point.y) } : { minX:point.x,minY:point.y,maxX:point.x,maxY:point.y };
    const first=polyline.points[0]; lines.push(`; path ${pathIndex+1}`,`G0 Z${fmt(options.safeZ)} F${fmt(options.travelFeedRate,0)}`,`G0 X${fmt(first.x*options.scale+options.offsetX)} Y${fmt(first.y*options.scale+options.offsetY)} F${fmt(options.travelFeedRate,0)}`,`G1 Z${fmt(z)} F${fmt(options.travelFeedRate,0)}`);
    for(let i=1;i<polyline.points.length;i+=1){const p=polyline.points[i];lines.push(`G1 X${fmt(p.x*options.scale+options.offsetX)} Y${fmt(p.y*options.scale+options.offsetY)} F${fmt(options.drawFeedRate,0)}`);pointCount+=1;}
    lines.push(`G0 Z${fmt(options.safeZ)} F${fmt(options.travelFeedRate,0)}`); if(pathIndex%20===0)progress("gcode",(pathIndex+1)/Math.max(1,polylines.length));
  });
  lines.push("M2"); progress("gcode",1);
  return { gcode: lines.join("\n"), stats: { pathCount: polylines.length, pointCount, commandCount: lines.length, bounds } };
}

