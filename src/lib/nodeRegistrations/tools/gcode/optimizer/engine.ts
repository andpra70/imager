import type { GcodeOptimizerOptions, GcodeOptimizerResult } from "./model";

type Point = { x: number; y: number };
type Motion = { code: 0 | 1 | 2 | 3; point: Point; z: number; feed: number | null; raw: string };
type Path = { tool: number; start: Point; drawZ: number; motions: Motion[]; reversible: boolean };

const commandPattern = /(?:^|\s)([GMTFSXYZIJK])\s*(-?(?:\d+(?:\.\d*)?|\.\d+))/gi;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const squaredDistance = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const fmt = (value: number) => Number(value.toFixed(4)).toString();

function words(line: string) {
  const result = new Map<string, number>();
  for (const match of line.replace(/\([^)]*\)/g, "").split(";", 1)[0].matchAll(commandPattern)) {
    result.set(match[1].toUpperCase(), Number(match[2]));
  }
  return result;
}

function simplifyPoints(points: Point[], tolerance: number) {
  if (tolerance <= 0 || points.length <= 2) return points.map((_, index) => index);
  const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const toleranceSquared = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop()!; const a = points[first]; const b = points[last];
    const dx = b.x - a.x; const dy = b.y - a.y; const lengthSquared = dx * dx + dy * dy;
    let best = -1; let bestDistance = toleranceSquared;
    for (let index = first + 1; index < last; index += 1) {
      const p = points[index]; const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/lengthSquared)) : 0;
      const d = (p.x-(a.x+t*dx))**2+(p.y-(a.y+t*dy))**2;
      if (d > bestDistance) { bestDistance = d; best = index; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([first, best], [best, last]); }
  }
  const indices: number[] = []; keep.forEach((value, index) => { if (value) indices.push(index); }); return indices;
}

function pathEnd(path: Path) { return path.motions[path.motions.length - 1]?.point ?? path.start; }

function orderPaths(paths: Path[], allowReverse: boolean) {
  if (paths.length < 2) return paths;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  paths.forEach(path => [path.start,pathEnd(path)].forEach(p => { minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y); }));
  const cell = Math.max(1, Math.sqrt(Math.max(1,(maxX-minX)*(maxY-minY))/paths.length));
  const buckets = new Map<string, Array<[number, boolean]>>();
  const key = (p: Point) => `${Math.floor((p.x-minX)/cell)},${Math.floor((p.y-minY)/cell)}`;
  paths.forEach((path,index) => {
    const entries: Array<[Point, boolean]> = [[path.start,false]];
    if (allowReverse && path.reversible) entries.push([pathEnd(path),true]);
    entries.forEach(([point, reverse]) => { const k=key(point); const list=buckets.get(k)??[]; list.push([index,reverse]); buckets.set(k,list); });
  });
  const used=new Uint8Array(paths.length); const result: Path[]=[]; let current: Point={x:0,y:0};
  while(result.length<paths.length){
    const bx=Math.floor((current.x-minX)/cell),by=Math.floor((current.y-minY)/cell); let best=-1,bestReverse=false,bestD=Infinity;
    const maxRing=Math.ceil(Math.max(maxX-minX,maxY-minY)/cell)+2;
    for(let ring=0;ring<=maxRing;ring+=1){
      for(let y=by-ring;y<=by+ring;y+=1)for(let x=bx-ring;x<=bx+ring;x+=1){
        if(Math.max(Math.abs(x-bx),Math.abs(y-by))!==ring)continue;
        for(const [index,reverse] of buckets.get(`${x},${y}`)??[]){if(used[index])continue;const point=reverse?pathEnd(paths[index]):paths[index].start;const d=squaredDistance(current,point);if(d<bestD){best=index;bestReverse=reverse;bestD=d;}}
      }
      if(best>=0&&Math.sqrt(bestD)<Math.max(0,ring-1)*cell)break;
    }
    if(best<0){best=used.findIndex(value=>!value);if(best<0)break;}
    used[best]=1; const source=paths[best];
    if(bestReverse){const all=[source.start,...source.motions.map(m=>m.point)].reverse();const feeds=source.motions.map(m=>m.feed).reverse();result.push({...source,start:all[0],motions:all.slice(1).map((point,index)=>({code:1,point,z:source.drawZ,feed:feeds[index]??null,raw:""}))});}
    else result.push(source);
    current=pathEnd(result[result.length-1]);
  }
  return result;
}

export function optimizeGcode(gcode: string, options: GcodeOptimizerOptions): GcodeOptimizerResult {
  const started=performance.now(); const lines=gcode.split(/\r?\n/); let unitScale=1,absolute=true,x=0,y=0,z=0,feed:number|null=null,tool=0,motionCode:0|1|2|3=0;
  let safeZ=-Infinity; for(const line of lines){const w=words(line);if(w.get("G")===20)unitScale=25.4;if(w.has("Z"))safeZ=Math.max(safeZ,w.get("Z")!);}
  if(!Number.isFinite(safeZ))safeZ=0;
  const paths: Path[]=[]; let active:Path|null=null; let headerEnd=0;
  for(let lineIndex=0;lineIndex<lines.length;lineIndex+=1){const line=lines[lineIndex];const w=words(line);const g=w.get("G");
    if(g===20)unitScale=25.4;else if(g===21)unitScale=1;else if(g===90)absolute=true;else if(g===91)absolute=false;
    if(w.has("T"))tool=w.get("T")!; if(w.has("F"))feed=w.get("F")!;
    if(g===0||g===1||g===2||g===3)motionCode=g;
    const nx=w.has("X")?(absolute?w.get("X")!:x+w.get("X")!):x,ny=w.has("Y")?(absolute?w.get("Y")!:y+w.get("Y")!):y,nz=w.has("Z")?(absolute?w.get("Z")!:z+w.get("Z")!):z;
    const wasDown=z<safeZ-1e-7,isDown=nz<safeZ-1e-7;
    if(!wasDown&&isDown){active={tool,start:{x,y},drawZ:nz,motions:[],reversible:true};if(paths.length===0)headerEnd=lineIndex;}
    if(active&&(wasDown||isDown)&&(nx!==x||ny!==y)){active.motions.push({code:motionCode,point:{x:nx,y:ny},z:nz,feed,raw:line});if(motionCode===2||motionCode===3||nz!==active.drawZ)active.reversible=false;}
    if(active&&wasDown&&!isDown){if(active.motions.length)paths.push(active);active=null;}
    x=nx;y=ny;z=nz;
  }
  if(active?.motions.length)paths.push(active);
  const scale=unitScale; const beforeDraw=paths.reduce((sum,path)=>{let p=path.start;for(const m of path.motions){sum+=distance(p,m.point)*scale;p=m.point;}return sum;},0);
  const beforeTravel=paths.reduce((state,path)=>({total:state.total+distance(state.point,path.start)*scale,point:pathEnd(path)}),{total:0,point:{x:0,y:0}}).total;
  let segmentsBefore=0,segmentsAfter=0; paths.forEach(path=>segmentsBefore+=path.motions.length);
  if(paths.length===0){return {gcode,metrics:{tools:0,pathsBefore:0,pathsAfter:0,segmentsBefore:0,segmentsAfter:0,drawMmBefore:0,drawMmAfter:0,travelMmBefore:0,travelMmAfter:0,travelSavedMm:0,travelSavedPercent:0,pointsRemoved:0,processingMs:performance.now()-started}};}
  const simplified=paths.map(path=>{if(!path.reversible||options.simplify<=0)return path;const all=[path.start,...path.motions.map(m=>m.point)];const kept=simplifyPoints(all,options.simplify/scale);return {...path,motions:kept.slice(1).map(index=>path.motions[index-1])};});
  const byTool=new Map<number,Path[]>();simplified.forEach(path=>byTool.set(path.tool,[...(byTool.get(path.tool)??[]),path]));
  const ordered=[...byTool.entries()].flatMap(([,toolPaths])=>orderPaths(toolPaths,options.allowReverse));ordered.forEach(path=>segmentsAfter+=path.motions.length);
  const afterTravel=ordered.reduce((state,path)=>({total:state.total+distance(state.point,path.start)*scale,point:pathEnd(path)}),{total:0,point:{x:0,y:0}}).total;
  const afterDraw=ordered.reduce((sum,path)=>{let p=path.start;for(const m of path.motions){sum+=distance(p,m.point)*scale;p=m.point;}return sum;},0);
  const output=lines.slice(0,headerEnd).filter(line=>!/^\s*(?:(?:G[0123]\s+.*[XYZ])|(?:T\d+\s*(?:M0?6)?))\b/i.test(line));output.push("; Plotterfun GCode Optimizer");let outputTool=Number.NaN;
  for(const path of ordered){if(path.tool!==outputTool){output.push(`G0 Z${fmt(safeZ)}`);if(path.tool!==0)output.push(`T${path.tool} M6`);outputTool=path.tool;}output.push(`G0 Z${fmt(safeZ)}`,`G0 X${fmt(path.start.x)} Y${fmt(path.start.y)}`,`G1 Z${fmt(path.drawZ)}`);let lastFeed:number|null=null;for(const motion of path.motions){if(motion.code===2||motion.code===3){output.push(motion.raw);continue;}const f=motion.feed!==null&&motion.feed!==lastFeed?` F${fmt(motion.feed)}`:"";output.push(`G1 X${fmt(motion.point.x)} Y${fmt(motion.point.y)}${motion.z!==path.drawZ?` Z${fmt(motion.z)}`:""}${f}`);lastFeed=motion.feed;}output.push(`G0 Z${fmt(safeZ)}`);}
  output.push("M2");const saved=beforeTravel-afterTravel;
  return {gcode:output.join("\n")+"\n",metrics:{tools:byTool.size,pathsBefore:paths.length,pathsAfter:ordered.length,segmentsBefore,segmentsAfter,drawMmBefore:beforeDraw,drawMmAfter:afterDraw,travelMmBefore:beforeTravel,travelMmAfter:afterTravel,travelSavedMm:saved,travelSavedPercent:beforeTravel>0?saved/beforeTravel*100:0,pointsRemoved:segmentsBefore-segmentsAfter,processingMs:performance.now()-started}};
}
