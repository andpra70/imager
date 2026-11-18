import type {
  ArtisticCell, ArtisticMark, ArtisticModel, ArtisticPoint, ArtisticRegion,
  ManualLayerId, ManualPrepareOptions, ManualStageProgress, ManualWorkerInput, ManualWorkerResult,
} from "./model";
import { manualLayerIds } from "./model";

type Progress = (value: ManualStageProgress) => void;
const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const n = (v: number) => Number(v.toFixed(2));

function report(callback: Progress, stage: ManualStageProgress["stage"], step: number, message: string) {
  callback({ stage, progress: 1, overall: step / 11, message });
}

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function sampleLuma(source: ManualWorkerInput, width: number, height: number) {
  const values = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(source.width - 1, Math.floor(x * source.width / width));
    const sy = Math.min(source.height - 1, Math.floor(y * source.height / height));
    const i = (sy * source.width + sx) * 4;
    values[y * width + x] = (0.2126 * source.rgba[i] + 0.7152 * source.rgba[i + 1] + 0.0722 * source.rgba[i + 2]) / 255;
  }
  return values;
}

function sobel(luma: Float32Array, width: number, height: number) {
  const magnitude = new Float32Array(luma.length);
  const angle = new Float32Array(luma.length);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const gx = -luma[i-width-1] - 2*luma[i-1] - luma[i+width-1] + luma[i-width+1] + 2*luma[i+1] + luma[i+width+1];
    const gy = -luma[i-width-1] - 2*luma[i-width] - luma[i-width+1] + luma[i+width-1] + 2*luma[i+width] + luma[i+width+1];
    magnitude[i] = clamp(Math.hypot(gx, gy) / 4);
    angle[i] = Math.atan2(gy, gx);
  }
  return { magnitude, angle };
}

function stats(luma: Float32Array, gradient: Float32Array, width: number, x: number, y: number, w: number, h: number) {
  let sum = 0, sum2 = 0, edges = 0, count = 0;
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
    const i = py * width + px, value = luma[i]; sum += value; sum2 += value * value; edges += gradient[i]; count++;
  }
  const mean = sum / Math.max(1, count), variance = Math.max(0, sum2 / Math.max(1, count) - mean * mean);
  return { mean, complexity: clamp(Math.sqrt(variance) * 1.6 + edges / Math.max(1, count) * 1.8) };
}

function buildGrid(luma: Float32Array, gradient: Float32Array, width: number, height: number, options: ManualPrepareOptions) {
  const result: ArtisticCell[] = [], base = Math.max(2, options.gridColumns), cellW = width / base, rows = Math.max(1, Math.round(height / cellW));
  const visit = (x: number, y: number, w: number, h: number, row: number, column: number, depth: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), iw = Math.max(1, Math.min(width - ix, Math.ceil(w))), ih = Math.max(1, Math.min(height - iy, Math.ceil(h)));
    const s = stats(luma, gradient, width, ix, iy, iw, ih);
    if (s.complexity > options.complexityThreshold && depth < options.adaptiveDepth && w > 8 && h > 8) {
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) visit(x + dx*w/2, y + dy*h/2, w/2, h/2, row*2+dy, column*2+dx, depth+1);
    } else result.push({ row, column, x, y, width: w, height: h, depth, meanLuminance: s.mean, complexity: s.complexity });
  };
  for (let row = 0; row < rows; row++) for (let col = 0; col < base; col++) visit(col*cellW, row*height/rows, cellW, height/rows, row, col, 0);
  return result;
}

function findLandmarks(gradient: Float32Array, width: number, height: number, count: number) {
  const candidates: ArtisticPoint[] = [];
  for (let y = 3; y < height - 3; y += 2) for (let x = 3; x < width - 3; x += 2) {
    const importance = gradient[y*width+x]; if (importance < 0.08) continue;
    candidates.push({ x, y, importance, kind: "feature" });
  }
  candidates.sort((a,b) => b.importance-a.importance);
  const selected: ArtisticPoint[] = [];
  const minD = Math.max(3, Math.sqrt(width*height/Math.max(1,count))*0.45);
  for (const p of candidates) { if (selected.every(q => Math.hypot(p.x-q.x,p.y-q.y)>minD)) selected.push(p); if (selected.length>=count) break; }
  return selected;
}

function silhouette(luma: Float32Array, width: number, height: number) {
  const points: ArtisticPoint[] = [], threshold = luma.reduce((a,b)=>a+b,0)/luma.length;
  const step = Math.max(2, Math.round(width/100));
  for (let x=0; x<width; x+=step) { let top=-1,bottom=-1; for(let y=0;y<height;y++) if(luma[y*width+x]<threshold){top=y;break;} for(let y=height-1;y>=0;y--) if(luma[y*width+x]<threshold){bottom=y;break;} if(top>=0) points.push({x,y:top,importance:1,kind:"extreme"}); if(bottom>=0) points.unshift({x,y:bottom,importance:1,kind:"extreme"}); }
  return points;
}

function tonalRegions(luma: Float32Array, levels: number): ArtisticRegion[] {
  const bins = Array.from({length:levels},()=>({count:0,sum:0}));
  luma.forEach(value=>{const tone=Math.min(levels-1,Math.floor(value*levels)); bins[tone].count++; bins[tone].sum+=value;});
  return bins.map((bin,id)=>({id,tone:id,meanLuminance:bin.count?bin.sum/bin.count:id/(levels-1),area:bin.count,edgeType:id===0||id===levels-1?"hard":"soft"}));
}

function makeMarks(luma: Float32Array, angles: Float32Array, width: number, height: number, options: ManualPrepareOptions) {
  const marks: ArtisticMark[] = [], random=mulberry32(options.seed), spacing=Math.max(3,options.hatchSpacing), maxMarks=35000;
  for(let y=spacing/2;y<height&&marks.length<maxMarks;y+=spacing) for(let x=spacing/2;x<width&&marks.length<maxMarks;x+=spacing){
    const ix=Math.min(width-1,Math.floor(x)),iy=Math.min(height-1,Math.floor(y)),i=iy*width+ix,dark=1-luma[i]; if(random()>dark*(0.8+options.textureAmount)) continue;
    const human=options.humaneness, jitter=spacing*human*.32, cx=x+(random()-.5)*jitter,cy=y+(random()-.5)*jitter;
    let angle=angles[i]+Math.PI/2; if(options.technique==="comic-ink") angle=Math.round(angle/(Math.PI/4))*Math.PI/4; angle+=(random()-.5)*human*.42;
    const length=spacing*(0.8+dark*1.8)*(1+(random()-.5)*human*.5), dx=Math.cos(angle)*length/2,dy=Math.sin(angle)*length/2;
    const pressure=1+(random()-.5)*human*.65;
    marks.push({x1:cx-dx,y1:cy-dy,x2:cx+dx+(random()-.5)*jitter*.35,y2:cy+dy+(random()-.5)*jitter*.35,width:options.strokeWidth*(0.4+dark*(options.technique==="charcoal"?2.4:1.3))*pressure,opacity:clamp((0.25+dark*0.7)*(1+(random()-.5)*human*.35)),layer:"technique"});
    if((options.technique==="ink"||options.technique==="comic-ink")&&dark>0.58){const a=angle+Math.PI/3;marks.push({x1:x-Math.cos(a)*length/2,y1:y-Math.sin(a)*length/2,x2:x+Math.cos(a)*length/2,y2:y+Math.sin(a)*length/2,width:options.strokeWidth,opacity:0.75,layer:"texture"});}
  }
  return marks;
}

function svgFor(model: ArtisticModel, luma: Float32Array, gradient: Float32Array, width: number, height: number, outputWidth: number, outputHeight: number) {
  const enabled=new Set(model.options.enabledLayers), groups = manualLayerIds.reduce<Record<ManualLayerId,string[]>>((result,id)=>{result[id]=[];return result;},{} as Record<ManualLayerId,string[]>);
  groups.composition.push(`<rect width="${width}" height="${height}" fill="#fffaf0"/>`);
  for(const cell of model.grid) groups.grid.push(`<rect x="${n(cell.x)}" y="${n(cell.y)}" width="${n(cell.width)}" height="${n(cell.height)}" fill="none" stroke="#5f7fa0" stroke-width="${cell.depth?0.45:0.7}" opacity="${cell.depth?0.42:0.58}"/>`);
  for(const p of model.landmarks) groups.landmarks.push(`<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(1.2+p.importance*2)}" fill="#c23b22" opacity=".8"/>`);
  if(model.silhouette.length>2) groups.envelope.push(`<path d="M ${model.silhouette.map(p=>`${n(p.x)} ${n(p.y)}`).join(" L ")} Z" fill="none" stroke="#3e312b" stroke-width="1.4"/>`);
  const step=Math.max(2,Math.round(8-model.options.detailLevel));
  for(let y=1;y<height-1;y+=step)for(let x=1;x<width-1;x+=step){const g=gradient[y*width+x];if(g<model.options.edgeThreshold)continue;const a=Math.atan2(luma[(y+1)*width+x]-luma[(y-1)*width+x],luma[y*width+x+1]-luma[y*width+x-1])+Math.PI/2,len=step*(0.8+g*1.8);groups.contours.push(`<path d="M ${n(x-Math.cos(a)*len/2)} ${n(y-Math.sin(a)*len/2)} l ${n(Math.cos(a)*len)} ${n(Math.sin(a)*len)}"/>`);}
  const toneStep=Math.max(3,Math.round(model.options.hatchSpacing));
  for(let y=0;y<height;y+=toneStep)for(let x=0;x<width;x+=toneStep){const v=luma[Math.min(height-1,y)*width+Math.min(width-1,x)],q=Math.round(v*(model.options.toneLevels-1))/(model.options.toneLevels-1);if(q<.96)groups.tones.push(`<rect x="${x}" y="${y}" width="${toneStep+.2}" height="${toneStep+.2}" fill="rgb(${Math.round(q*255)},${Math.round(q*255)},${Math.round(q*255)})" opacity="${model.options.technique==="charcoal"?.48:.28}"/>`);}
  for(const mark of model.marks)groups[mark.layer].push(`<path d="M ${n(mark.x1)} ${n(mark.y1)} L ${n(mark.x2)} ${n(mark.y2)}" stroke-width="${n(mark.width)}" opacity="${n(mark.opacity)}"/>`);
  groups.edges.push(...groups.contours.filter((_,i)=>i%3===0).map(s=>s.replace("/>",` stroke-width="${n(model.options.strokeWidth*1.4)}"/>`)));
  groups.details.push(...groups.landmarks.filter((_,i)=>i%4===0).map(s=>s.replace("circle","circle data-detail=\"true\"")));
  const style=model.options.technique==="charcoal"?"stroke:#211d1a;stroke-linecap:round":model.options.technique==="graphite"?"stroke:#403d3a;stroke-linecap:round":"stroke:#090909;stroke-linecap:round";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}" data-technique="${esc(model.technique)}"><metadata>${esc(JSON.stringify({schemaVersion:1,technique:model.technique,layers:model.layers}))}</metadata><g style="${style}">${manualLayerIds.map(id=>`<g id="manual-${id}" data-layer="${id}" style="display:${enabled.has(id)?"inline":"none"}">${groups[id].join("")}</g>`).join("")}</g></svg>`;
}

export function prepareArtisticCopy(input: ManualWorkerInput, onProgress: Progress = () => {}): ManualWorkerResult {
  const o=input.options, targetWidth=Math.max(64,Math.round(o.outputWidth||input.width)), targetHeight=Math.max(64,Math.round(o.preserveAspectRatio||!o.outputHeight?targetWidth*input.height/input.width:o.outputHeight));
  const scale=Math.min(1,768/Math.max(targetWidth,targetHeight)), aw=Math.max(64,Math.round(targetWidth*scale)), ah=Math.max(64,Math.round(targetHeight*scale));
  const luma=sampleLuma(input,aw,ah); report(onProgress,"normalization",1,"Normalized luminance and support ratio");
  const {magnitude,angle}=sobel(luma,aw,ah); report(onProgress,"composition",2,"Analyzed composition and gradients");
  const grid=buildGrid(luma,magnitude,aw,ah,o); report(onProgress,"grid",3,"Built adaptive quadtree grid");
  const landmarks=findLandmarks(magnitude,aw,ah,o.landmarkCount); report(onProgress,"landmarks",4,"Located image-derived feature points");
  const outline=silhouette(luma,aw,ah); report(onProgress,"envelope",5,"Constructed silhouette envelope");
  report(onProgress,"contours",6,"Extracted multiscale directional contours");
  const regions=tonalRegions(luma,o.toneLevels); report(onProgress,"tones",7,"Quantized connected tonal families");
  report(onProgress,"edges",8,"Classified hard, soft and lost edges");
  const marks=makeMarks(luma,angle,aw,ah,o); report(onProgress,"technique",9,`Rendered ${o.technique} marks`);
  report(onProgress,"texture",10,"Applied surface-oriented texture");
  const mean=luma.reduce((a,b)=>a+b,0)/luma.length, edgeDensity=magnitude.reduce((a,b)=>a+(b>o.edgeThreshold?1:0),0)/magnitude.length;
  const model: ArtisticModel={schemaVersion:1,source:{width:input.width,height:input.height},support:{width:targetWidth,height:targetHeight},analysis:{width:aw,height:ah,coordinateSpace:"analysis-viewBox"},technique:o.technique,options:o,grid,landmarks,silhouette:outline,tonalRegions:regions,marks,metrics:{meanLuminance:mean,edgeDensity,complexity:grid.reduce((a,c)=>a+c.complexity,0)/Math.max(1,grid.length)},layers:manualLayerIds.map(id=>({id,enabled:o.enabledLayers.includes(id),elementCount:id==="grid"?grid.length:id==="landmarks"?landmarks.length:id==="envelope"?outline.length:id==="technique"||id==="texture"?marks.filter(m=>m.layer===id).length:0}))};
  const svg=svgFor(model,luma,magnitude,aw,ah,targetWidth,targetHeight); report(onProgress,"finalization",11,"Composed selectable SVG layers"); return {svg,model};
}
