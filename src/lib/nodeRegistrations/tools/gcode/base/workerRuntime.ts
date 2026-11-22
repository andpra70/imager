import type { BaseGcodeRequest, BaseGcodeResult } from "./model";
import { validateBaseGcodeOptions } from "./model";
import { humanizePaths } from "./humanize";
type Point = [number, number];
type Path = Point[];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function generateBaseGcode({ pixels, width: w, height: h, options: c }: BaseGcodeRequest): BaseGcodeResult {
  validateBaseGcodeOptions(c);
  if (pixels.length !== w * h * 4 || w < 2 || h < 2 || w * h > 2_500_000) throw Error("Raster non valido");
  const dark = new Float32Array(w * h), ink = new Uint8Array(w * h), allowed = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const alpha = pixels[4 * i + 3] / 255;
    const luminance = (0.2126 * pixels[4 * i] + 0.7152 * pixels[4 * i + 1] + 0.0722 * pixels[4 * i + 2]) * alpha + 255 * (1 - alpha);
    dark[i] = clamp((255 - luminance) / 255, 0, 1);
    ink[i] = alpha >= 0.125 && luminance < c.white ? 1 : 0;
  }
  const radius = Math.ceil(c.protect * c.resolution);
  if (!radius) allowed.set(ink);
  else {
    const offsets: Point[] = [];
    for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) if (x * x + y * y <= radius * radius) offsets.push([x, y]);
    for (let y = radius; y < h - radius; y++) for (let x = radius; x < w - radius; x++) {
      let ok = 1;
      for (const [dx, dy] of offsets) if (!ink[(y + dy) * w + x + dx]) { ok = 0; break; }
      allowed[y * w + x] = ok;
    }
  }
  const index = (x: number, y: number) => { const ix = Math.round(x), iy = Math.round(y); return ix < 0 || iy < 0 || ix >= w || iy >= h ? -1 : iy * w + ix; };
  const isAllowed = (p: Point) => { const i = index(p[0], p[1]); return i >= 0 && allowed[i] === 1; };
  const darkness = (p: Point) => { const i = index(p[0], p[1]); return i < 0 ? 0 : dark[i]; };
  const paths: Path[] = [];
  const add = (path: Path) => { if (path.length < 2) return; let len = 0; for (let i = 1; i < path.length; i++) len += distance(path[i - 1], path[i]); if (len / c.resolution >= c.minLength) { paths.push(path); if (paths.length > c.maxPaths) throw Error("Limite percorsi superato"); } };
  const corners: Point[] = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  for (let layer = 0; layer < c.layers; layer++) {
    const angle = (c.angle + [0, 90, 45][layer]) * Math.PI / 180;
    const dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx;
    const projections = corners.map(p => p[0] * nx + p[1] * ny), ts = corners.map(p => p[0] * dx + p[1] * dy);
    const spacing = Math.max(1, c.step * c.resolution * (layer === 0 ? 1 : 1.3));
    for (let q = Math.min(...projections); q <= Math.max(...projections); q += spacing) {
      let run: Path = [];
      for (let t = Math.min(...ts) - 2; t <= Math.max(...ts) + 2; t += 0.65) {
        const p: Point = [dx * t + nx * q, dy * t + ny * q];
        if (isAllowed(p) && darkness(p) >= [0.14, 0.43, 0.70][layer]) run.push(p);
        else { add(run); run = []; }
      }
      add(run);
    }
  }
  if (c.edges) {
    const table: Record<number, number[][]> = { 1:[[3,0]], 2:[[0,1]], 3:[[3,1]], 4:[[1,2]], 5:[[3,2],[0,1]], 6:[[0,2]], 7:[[3,2]], 8:[[2,3]], 9:[[0,2]], 10:[[0,3],[1,2]], 11:[[1,2]], 12:[[1,3]], 13:[[0,1]], 14:[[3,0]] };
    const segments: [Point, Point][] = [];
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const values = [dark[y*w+x], dark[y*w+x+1], dark[(y+1)*w+x+1], dark[(y+1)*w+x]];
      const code = values.reduce((acc, value, i) => acc | (value >= c.contour ? 1 << i : 0), 0);
      if (!table[code]) continue;
      const square: Point[] = [[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
      const crossing = (edge: number): Point => { const next = (edge+1)%4, t = clamp((c.contour-values[edge])/(values[next]-values[edge] || 1e-8),0,1); return [square[edge][0]+t*(square[next][0]-square[edge][0]),square[edge][1]+t*(square[next][1]-square[edge][1])]; };
      for (const [a,b] of table[code]) { const p = crossing(a), q = crossing(b); if (isAllowed(p) && isAllowed(q) && isAllowed([(p[0]+q[0])/2,(p[1]+q[1])/2])) segments.push([p,q]); }
    }
    const key = (p: Point) => `${Math.round(p[0]*1000)},${Math.round(p[1]*1000)}`;
    const adjacency = new Map<string, [number, number][]>();
    segments.forEach((segment, i) => segment.forEach((p, end) => { const k = key(p), list = adjacency.get(k) ?? []; list.push([i,end]); adjacency.set(k,list); }));
    const seen = new Uint8Array(segments.length);
    for (let i = 0; i < segments.length; i++) {
      if (seen[i]) continue;
      seen[i] = 1; const line: Path = [...segments[i]];
      for (let side = 0; side < 2; side++) while (line.length < 100000) {
        const endpoint = side === 0 ? line[0] : line[line.length-1];
        const next = (adjacency.get(key(endpoint)) ?? []).find(([j]) => !seen[j]);
        if (!next) break;
        const [j, end] = next; seen[j] = 1;
        if (side === 0) line.unshift(segments[j][1-end]); else line.push(segments[j][1-end]);
      }
      if (line.length < 3) continue;
      const simple: Path = [line[0]];
      for (let j = 1; j < line.length-1; j++) { const p=line[j], a=simple[simple.length-1], b=line[j+1]; const cross=Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0])); if (cross>0.16 || j%6===0) simple.push(p); }
      simple.push(line[line.length-1]); add(simple);
    }
  }
  const protectedPaths: Path[] = [];
  for (const path of paths) {
    let run: Path = [];
    const flush = () => {
      if (run.length >= 2) {
        let length = 0; for (let i = 1; i < run.length; i++) length += distance(run[i - 1], run[i]);
        if (length / c.resolution >= c.minLength) {
          protectedPaths.push(run);
          if (protectedPaths.length > c.maxPaths) throw Error("Limite percorsi superato");
        }
      }
      run = [];
    };
    for (const p of path) {
      if (!isAllowed(p)) { flush(); continue; }
      if (run.length) { const a=run[run.length-1], n=Math.max(1,Math.ceil(distance(a,p)/0.4)); let safe=true; for (let j=0;j<=n;j++) if (!isAllowed([a[0]+(p[0]-a[0])*j/n,a[1]+(p[1]-a[1])*j/n])) { safe=false; break; } if (!safe) flush(); }
      run.push(p);
    }
    flush();
  }
  // Nearest endpoint search in spatial buckets, with reverse traversal when useful.
  const cell = Math.max(10, Math.round(12*c.resolution)), buckets = new Map<string,[number,number][]>();
  const bucketKey = (p: Point) => `${Math.floor(p[0]/cell)},${Math.floor(p[1]/cell)}`;
  protectedPaths.forEach((path,i) => [0,1].forEach(end => { const p=path[end ? path.length-1 : 0], k=bucketKey(p), list=buckets.get(k) ?? []; list.push([i,end]); buckets.set(k,list); }));
  const drawPaths = c.humanize ? humanizePaths(protectedPaths, c.resolution, c.handWobble, c.handScale, isAllowed) : protectedPaths;
  const used = new Uint8Array(drawPaths.length), ordered: Path[] = []; let pos: Point = [0,h];
  while (ordered.length < drawPaths.length) {
    let best=-1, reverse=false, bestDistance=Infinity;
    const bx=Math.floor(pos[0]/cell),by=Math.floor(pos[1]/cell);
    for (let ring=0;ring<Math.max(w,h)/cell+2;ring++) {
      for (let y=by-ring;y<=by+ring;y++) for (let x=bx-ring;x<=bx+ring;x++) {
        if (Math.max(Math.abs(x-bx),Math.abs(y-by))!==ring) continue;
        for (const [i,end] of buckets.get(`${x},${y}`) ?? []) { if (used[i]) continue; const path=drawPaths[i], p=path[end ? path.length-1 : 0], d=(p[0]-pos[0])**2+(p[1]-pos[1])**2; if (d<bestDistance) { bestDistance=d;best=i;reverse=end===1; } }
      }
      if (best>=0 && Math.sqrt(bestDistance)<ring*cell) break;
    }
    if (best<0) break;
    used[best]=1; const path=drawPaths[best]; if (reverse) path.reverse(); ordered.push(path); pos=path[path.length-1];
  }
  const xoff=c.margin+((c.width-2*c.margin)-w/c.resolution)/2, yoff=c.margin+((c.height-2*c.margin)-h/c.resolution)/2;
  const mm=(p:Point):Point=>[xoff+p[0]/c.resolution,yoff+(h-1-p[1])/c.resolution];
  const z=(p:Point)=>c.lightZ+(c.darkZ-c.lightZ)*darkness(p);
  const output=["; Image to GRBL - biro 0.5mm, molla 2mm","; Z0 = primo contatto, molla non compressa","; Simulare e calibrare prima dell uso","G21","G90","G94",`G0 Z${c.safeZ.toFixed(3)}`];
  let drawMm=0,travelMm=0,previous:Point=[0,0];
  for (const path of ordered) {
    const first=mm(path[0]); travelMm+=distance(previous,first);
    output.push(`G0 X${first[0].toFixed(3)} Y${first[1].toFixed(3)}`,`G1 Z${z(path[0]).toFixed(3)} F${c.feedZ.toFixed(0)}`);
    for (let i=1;i<path.length;i++) {
      const a=path[i-1],b=path[i],dist=distance(a,b),n=Math.max(1,Math.ceil(dist/(c.zStep*c.resolution)));
      for (let j=1;j<=n;j++) { const p:Point=[a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n], m=mm(p); output.push(`G1 X${m[0].toFixed(3)} Y${m[1].toFixed(3)} Z${z(p).toFixed(3)} F${c.feed.toFixed(0)}`); }
      drawMm+=dist/c.resolution;
    }
    output.push(`G0 Z${c.safeZ.toFixed(3)}`); previous=mm(path[path.length-1]);
  }
  output.push("M2");
  const svgPaths = ordered.map(path => {
    const commands = path.map((point, index) => {
      const [x, y] = mm(point);
      return `${index === 0 ? "M" : "L"}${x.toFixed(3)} ${(c.height - y).toFixed(3)}`;
    });
    return `<path d="${commands.join(" ")}"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}mm" height="${c.height}mm" viewBox="0 0 ${c.width} ${c.height}"><g fill="none" stroke="#142d8e" stroke-width="0.18" stroke-linecap="round" stroke-linejoin="round">${svgPaths.join("")}</g></svg>`;
  const previewWidth = 1000, previewHeight = Math.max(1, Math.round(1000 * c.height / c.width));
  const canvas = new OffscreenCanvas(previewWidth, previewHeight);
  const context = canvas.getContext("2d");
  if (!context) throw Error("Anteprima non disponibile");
  context.fillStyle = "white"; context.fillRect(0, 0, previewWidth, previewHeight);
  context.strokeStyle = "#142d8e"; context.lineWidth = Math.max(0.6, previewWidth / c.width * 0.18);
  context.lineCap = "round"; context.lineJoin = "round";
  for (const path of ordered) {
    context.beginPath();
    path.forEach((point, index) => {
      const m = mm(point), x = m[0] / c.width * previewWidth, y = (c.height - m[1]) / c.height * previewHeight;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
  }
  const preview = canvas.transferToImageBitmap();
  return { gcode:output.join("\n")+"\n", svg, preview, paths:ordered.length, lines:output.length, drawMm, travelMm };
}
