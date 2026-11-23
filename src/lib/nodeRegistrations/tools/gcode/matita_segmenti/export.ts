import type { MatitaSegmentiOptions, MatitaSegmentiResult } from "./model";
import { renderMatitaPreview } from "../matita/preview";
import { optimizeMatitaSegmentiPaths, pathTravel } from "./pathOptimizer";
export interface MatitaSegmentiPoint { x: number; y: number; z: number }
export type MatitaSegmentiPath = MatitaSegmentiPoint[];
const fmt = (v: number) => (Math.abs(v) < .0005 ? 0 : v).toFixed(3);
function circle(a: MatitaSegmentiPoint, b: MatitaSegmentiPoint, c: MatitaSegmentiPoint) {
  const det=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y)); if(Math.abs(det)<.0001)return null;
  const q=a.x*a.x+a.y*a.y,r=b.x*b.x+b.y*b.y,s=c.x*c.x+c.y*c.y;
  const cx=(q*(b.y-c.y)+r*(c.y-a.y)+s*(a.y-b.y))/det;
  const cy=(q*(c.x-b.x)+r*(a.x-c.x)+s*(b.x-a.x))/det;
  return {cx,cy,r:Math.hypot(a.x-cx,a.y-cy)};
}
function fitArc(path: MatitaSegmentiPath, i: number, j: number, c: MatitaSegmentiOptions) {
  if(j-i<2)return null;
  const a=path[i],b=path[Math.floor((i+j)/2)],end=path[j],arc=circle(a,b,end),res=c.resolution;
  if(!arc||arc.r<res*.5||arc.r>res*200)return null;
  let sign=0,theta=0,previous=Math.atan2(a.y-arc.cy,a.x-arc.cx);
  for(let k=i+1;k<=j;k++){
    if(Math.abs(path[k].z-a.z)>.0001)return null;
    const p=path[k],distance=Math.hypot(p.x-arc.cx,p.y-arc.cy);
    if(Math.abs(distance-arc.r)>c.arcTolerance*res)return null;
    const angle=Math.atan2(p.y-arc.cy,p.x-arc.cx),delta=Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous));
    if(!sign)sign=Math.sign(delta);
    if(Math.sign(delta)!==sign||Math.abs(delta)>Math.PI/2)return null;
    theta+=delta;previous=angle;
  }
  if(Math.abs(theta)<.08||Math.abs(theta)>Math.PI*1.8)return null;
  return {...arc,sign};
}
export function exportMatitaSegmenti(paths: MatitaSegmentiPath[], draw: Float32Array, w: number, h: number, c: MatitaSegmentiOptions, segments: number, mse: number, reason: string): MatitaSegmentiResult {
  const machineOrigin={x:-c.margin*c.resolution,y:h-1+c.margin*c.resolution,z:0};
  const travelBefore=pathTravel(paths,machineOrigin),optimizedPaths=optimizeMatitaSegmentiPaths(paths,machineOrigin),travelAfter=pathTravel(optimizedPaths,machineOrigin);
  const out=["; IEDD 2 continuous error-driven pen plotter","; Z0 = first pen contact, spring not compressed","; WARNING: simulate and test Z before running","G21","G90","G17","G94",`G0 Z${fmt(c.zSafe)}`];
  const x=(p:MatitaSegmentiPoint)=>c.margin+p.x/c.resolution,y=(p:MatitaSegmentiPoint)=>c.margin+(h-1-p.y)/c.resolution;
  let arcs=0;
  const svgPaths:string[]=[];
  for(const path of optimizedPaths){
    const first=path[0];out.push(`G0 X${fmt(x(first))} Y${fmt(y(first))}`,`G1 Z${fmt(-first.z)} F${fmt(c.feedZ)}`);
    svgPaths.push(`<path d="${path.map((p,i)=>`${i?"L":"M"}${fmt(x(p))} ${fmt(c.margin+p.y/c.resolution)}`).join(" ")}"/>`);
    let i=0;
    while(i<path.length-1){
      let arc=null,end=i+1;
      for(let j=Math.min(path.length-1,i+20);j>=i+2;j--){const fit=fitArc(path,i,j,c);if(fit){arc=fit;end=j;break;}}
      if(arc){const p=path[end],start=path[i],g=arc.sign>0?"G2":"G3";
        out.push(`${g} X${fmt(x(p))} Y${fmt(y(p))} I${fmt((arc.cx-start.x)/c.resolution)} J${fmt(-(arc.cy-start.y)/c.resolution)} F${fmt(c.feed)}`);arcs++;
      }else{const p=path[end];out.push(`G1 X${fmt(x(p))} Y${fmt(y(p))} Z${fmt(-p.z)} F${fmt(c.feed)}`);}
      i=end;
    }
    out.push(`G0 Z${fmt(c.zSafe)}`);
  }
  out.push("M2");
  const width=c.margin*2+w/c.resolution,height=c.margin*2+h/c.resolution;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}mm" height="${fmt(height)}mm" viewBox="0 0 ${fmt(width)} ${fmt(height)}"><g fill="none" stroke="#222" stroke-width="${c.diameter}" stroke-linecap="round" stroke-linejoin="round">${svgPaths.join("")}</g></svg>`;
  return {gcode:out.join("\n")+"\n",svg,preview:renderMatitaPreview(draw,w,h),strokes:optimizedPaths.length,segments,mse,arcs,travelMm:travelAfter/c.resolution,travelSavedMm:Math.max(0,(travelBefore-travelAfter)/c.resolution),reason};
}
