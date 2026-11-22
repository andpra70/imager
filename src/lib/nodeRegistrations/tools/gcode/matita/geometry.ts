export interface Point { x: number; y: number }
export interface Stroke { points: Point[]; power: number; opacity: number }
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function blur(src: Float32Array, w: number, h: number, r: number) {
  if (r <= 0) return new Float32Array(src);
  const temp = new Float32Array(w * h), out = new Float32Array(w * h), size = 2 * r + 1;
  for (let y = 0; y < h; y++) { let sum = 0; for (let k = -r; k <= r; k++) sum += src[y * w + clamp(k, 0, w - 1)]; for (let x = 0; x < w; x++) { temp[y * w + x] = sum / size; sum += src[y * w + clamp(x + r + 1, 0, w - 1)] - src[y * w + clamp(x - r, 0, w - 1)]; } }
  for (let x = 0; x < w; x++) { let sum = 0; for (let k = -r; k <= r; k++) sum += temp[clamp(k, 0, h - 1) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = sum / size; sum += temp[clamp(y + r + 1, 0, h - 1) * w + x] - temp[clamp(y - r, 0, h - 1) * w + x]; } }
  return out;
}
export function fitArc(points: Point[], start: number, end: number, tolerance: number) {
  if (end - start < 3) return null;
  const a = points[start], b = points[(start + end) >> 1], c = points[end];
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-7) return null;
  const aa = a.x * a.x + a.y * a.y, bb = b.x * b.x + b.y * b.y, cc = c.x * c.x + c.y * c.y;
  const cx = (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d;
  const cy = (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d;
  const radius = Math.hypot(a.x - cx, a.y - cy);
  if (radius < 1 || radius > 1e6) return null;
  let previous = Math.atan2(a.y - cy, a.x - cx), turn = 0, sweep = 0;
  for (let i = start + 1; i <= end; i++) {
    const p = points[i]; if (Math.abs(Math.hypot(p.x - cx, p.y - cy) - radius) > tolerance) return null;
    const angle = Math.atan2(p.y - cy, p.x - cx); let delta = angle - previous;
    while (delta > Math.PI) delta -= 2 * Math.PI; while (delta < -Math.PI) delta += 2 * Math.PI;
    if (i === start + 1) turn = Math.sign(delta);
    if (Math.sign(delta) !== turn || Math.abs(delta) > .6) return null;
    sweep += delta; previous = angle;
  }
  if (Math.abs(sweep) > Math.PI * 1.95 || Math.abs(sweep) < .06) return null;
  return { cx, cy, ccw: sweep > 0, radius, sweep };
}
