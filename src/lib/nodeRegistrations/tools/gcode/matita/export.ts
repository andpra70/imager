import type { MatitaOptions, MatitaResult } from "./model";
import { fitArc, type Point, type Stroke } from "./geometry";
import { renderMatitaPreview } from "./preview";

export interface MatitaArcSettings { tolerance?: number; safetyStep?: number; header?: string; }
export function exportMatita(paths: Stroke[], draw: Float32Array, w: number, h: number, c: MatitaOptions, safeSegment: (a: Point, b: Point) => boolean, mse: number, lengthMm: number, stopReason: string, arcSettings: MatitaArcSettings = {}): MatitaResult {
  const lines = [arcSettings.header ?? "; IEDD 3.5 - GRBL, coordinate mm, origine in basso a sinistra", "; Verificare zero Z, assi e pressione su carta di prova", "G21", "G90", "G17", "G94", `G0 Z${c.zSafe.toFixed(3)}`];
  const x = (p: Point) => (p.x / c.ppm).toFixed(3), y = (p: Point) => ((h - 1 - p.y) / c.ppm).toFixed(3);
  let arcs = 0, linear = 0;
  const svgPaths: string[] = [];
  for (const path of paths) {
    const points = path.points; if (points.length < 2) continue;
    const compression = c.zMin + (c.zMax - c.zMin) * path.power;
    lines.push(`G0 Z${c.zSafe.toFixed(3)}`, `G0 X${x(points[0])} Y${y(points[0])}`, `G1 Z${(-compression).toFixed(3)} F${c.feedZ.toFixed(0)}`);
    svgPaths.push(`<path d="${points.map((p, i) => `${i ? "L" : "M"}${x(p)} ${(p.y / c.ppm).toFixed(3)}`).join(" ")}"/>`);
    let i = 0;
    while (i < points.length - 1) {
      let best = null, bestJ = -1;
      for (let j = Math.min(points.length - 1, i + 24); j >= i + 3; j--) {
        const fit = fitArc(points, i, j, arcSettings.tolerance ?? Math.max(.13 * c.ppm, .35));
        if (fit) { best = fit; bestJ = j; break; }
      }
      if (best) {
        const start = points[i], end = points[bestJ];
        const a0 = Math.atan2(start.y - best.cy, start.x - best.cx), a1 = Math.atan2(end.y - best.cy, end.x - best.cx);
        let delta = a1 - a0;
        if (best.ccw) while (delta <= 0) delta += 2 * Math.PI;
        else while (delta >= 0) delta -= 2 * Math.PI;
        const steps = Math.max(2, Math.ceil(Math.abs(delta) * best.radius / (arcSettings.safetyStep ?? .25)));
        let previous = start;
        for (let k = 1; k <= steps; k++) {
          const angle = a0 + delta * k / steps;
          const current = { x: best.cx + best.radius * Math.cos(angle), y: best.cy + best.radius * Math.sin(angle) };
          if (!safeSegment(previous, current)) { best = null; break; }
          previous = current;
        }
      }
      if (best) {
        const start = points[i], end = points[bestJ];
        const ii = (best.cx - start.x) / c.ppm, jj = -(best.cy - start.y) / c.ppm;
        lines.push(`${best.ccw ? "G3" : "G2"} X${x(end)} Y${y(end)} I${ii.toFixed(3)} J${jj.toFixed(3)} F${c.feed.toFixed(0)}`);
        arcs++; i = bestJ;
      } else {
        const p = points[i + 1]; lines.push(`G1 X${x(p)} Y${y(p)} F${c.feed.toFixed(0)}`); linear++; i++;
      }
    }
  }
  lines.push(`G0 Z${c.zSafe.toFixed(3)}`, "M2");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(w/c.ppm).toFixed(3)}mm" height="${(h/c.ppm).toFixed(3)}mm" viewBox="0 0 ${(w/c.ppm).toFixed(3)} ${(h/c.ppm).toFixed(3)}"><g fill="none" stroke="#222" stroke-width="${c.diameter}" stroke-linecap="round" stroke-linejoin="round">${svgPaths.join("")}</g></svg>`;
  return { gcode: lines.join("\n") + "\n", svg, preview: renderMatitaPreview(draw, w, h, 1), strokes: paths.length, mse, lengthMm, arcs, lines: linear, stopReason };
}
