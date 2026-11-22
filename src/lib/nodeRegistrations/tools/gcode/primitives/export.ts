import { renderMatitaPreview } from "../matita/preview";
import type { PrimitiveKind, PrimitiveOptions, PrimitiveResult, PrimitiveShape } from "./model";
export function exportPrimitives(kind: PrimitiveKind, shapes: PrimitiveShape[], draw: Float32Array, width: number, height: number, c: PrimitiveOptions, mse: number, reason: string): PrimitiveResult {
  const fmt=(value:number)=>value.toFixed(3),ppm=c.resolution;
  const svgPaths:string[]=[];
  let lines:string[];
  if(kind==="rectangle") {
    lines=["; IEDD 5 - rettangoli, perimetri chiusi","; X/Y mm; origine in basso a sinistra","G21","G90","G94",`G0 Z${fmt(c.safeZ)}`];
    for(const shape of shapes){
      if(shape.kind!=="rectangle")continue;
      const x=shape.x/ppm,y=(height-shape.y)/ppm,w=shape.width/ppm,h=shape.height/ppm;
      const xy=(a:number,b:number)=>`X${fmt(a)} Y${fmt(b)}`;
      lines.push(`G0 ${xy(x,y)}`,`G1 Z${fmt(c.drawZ)} F${fmt(c.feedZ)}`,`G1 ${xy(x+w,y)} F${c.feed}`,`G1 ${xy(x+w,y-h)}`,`G1 ${xy(x,y-h)}`,`G1 ${xy(x,y)}`,`G0 Z${fmt(c.safeZ)}`);
      svgPaths.push(`<path d="M${fmt(x)} ${fmt(shape.y/ppm)} L${fmt(x+w)} ${fmt(shape.y/ppm)} L${fmt(x+w)} ${fmt((shape.y+shape.height)/ppm)} L${fmt(x)} ${fmt((shape.y+shape.height)/ppm)} Z"/>`);
    }
  } else {
    lines=["; IEDD 6 - cerchi, circonferenze complete","; GRBL G2: due semicirconferenze per cerchio","; origine XY in basso a sinistra","G21","G90","G17","G94",`G0 Z${fmt(c.safeZ)}`];
    for(const shape of shapes){
      if(shape.kind!=="circle")continue;
      const x=shape.cx/ppm,y=(height-shape.cy)/ppm,r=shape.radius/ppm,startX=x+r;
      lines.push(`G0 X${fmt(startX)} Y${fmt(y)}`,`G1 Z${fmt(c.drawZ)} F${fmt(c.feedZ)}`,`G2 X${fmt(x-r)} Y${fmt(y)} I${fmt(-r)} J0.000 F${fmt(c.feed)}`,`G2 X${fmt(startX)} Y${fmt(y)} I${fmt(r)} J0.000`,`G0 Z${fmt(c.safeZ)}`);
      svgPaths.push(`<circle cx="${fmt(x)}" cy="${fmt(shape.cy/ppm)}" r="${fmt(r)}"/>`);
    }
  }
  lines.push("M2");
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width/ppm)}mm" height="${fmt(height/ppm)}mm" viewBox="0 0 ${fmt(width/ppm)} ${fmt(height/ppm)}"><g fill="none" stroke="#222" stroke-width="${c.penDiameter}" stroke-linecap="round" stroke-linejoin="round">${svgPaths.join("")}</g></svg>`;
  return { gcode:lines.join("\n")+"\n",svg,preview:renderMatitaPreview(draw,width,height),shapes:shapes.length,mse,reason };
}
