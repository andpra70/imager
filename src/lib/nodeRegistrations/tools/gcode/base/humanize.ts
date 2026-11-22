type Point = [number, number];
type Path = Point[];

/** Smooth, deterministic pen drift in raster coordinates. */
export function humanizePaths(paths: Path[], pixelsPerMm: number, amplitudeMm: number, wavelengthMm: number, isAllowed: (point: Point) => boolean): Path[] {
  if (amplitudeMm <= 0) return paths;
  const amplitude = amplitudeMm * pixelsPerMm;
  const wavelength = wavelengthMm * pixelsPerMm;
  const segmentAllowed = (a: Point, b: Point) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      if (!isAllowed([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
    }
    return true;
  };
  return paths.map((path, pathIndex) => {
    if (path.length < 3) return path;
    const result: Path = [path[0]];
    let length = 0;
    const phase = pathIndex * 2.399963229728653;
    for (let i = 1; i < path.length - 1; i++) {
      length += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      const previous = path[i - 1], next = path[i + 1];
      const dx = next[0] - previous[0], dy = next[1] - previous[1], magnitude = Math.hypot(dx, dy);
      if (magnitude < 1e-6) { result.push(path[i]); continue; }
      const taper = Math.min(1, i / 5, (path.length - 1 - i) / 5);
      const drift = amplitude * taper * (0.65 * Math.sin(2 * Math.PI * length / wavelength + phase) + 0.35 * Math.sin(2 * Math.PI * length / (wavelength * 2.7) + phase * 1.73));
      const candidate: Point = [path[i][0] - dy / magnitude * drift, path[i][1] + dx / magnitude * drift];
      result.push(isAllowed(candidate) && segmentAllowed(result[result.length - 1], candidate) && segmentAllowed(candidate, next) ? candidate : path[i]);
    }
    result.push(path[path.length - 1]);
    return result;
  });
}
