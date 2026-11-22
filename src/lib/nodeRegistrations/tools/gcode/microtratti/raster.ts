import type { GraphImage } from "../../../../../models/graphImage";
import type { MicroKind,MicroOptions,MicroRequest } from "./model";
export function prepareMicroRaster(image:GraphImage,kind:MicroKind,options:MicroOptions):MicroRequest{
  const width=Math.min(1400,Math.max(50,Math.round(options.widthMm*options.ppm))),height=Math.min(1400,Math.max(50,Math.round(options.heightMm*options.ppm)));
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const context=canvas.getContext("2d",{willReadFrequently:true});if(!context)throw Error("Canvas non disponibile");
  context.fillStyle="#fff";context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);
  return {kind,width,height,pixels:context.getImageData(0,0,width,height).data,options};
}
