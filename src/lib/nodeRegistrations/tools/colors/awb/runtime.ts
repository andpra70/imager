import type { GraphImage } from "../../../../../models/graphImage";
import { clamp } from "../../shared";
import type { AwbOptions, AwbResult } from "./model";

type Triplet = [number, number, number];

function percentile(values: Uint32Array, total: number, value: number) {
  const target = total * clamp(value / 100, 0, 1); let accumulated = 0;
  for (let index = 0; index < 256; index++) { accumulated += values[index]; if (accumulated >= target) return index; }
  return 255;
}

function estimateIlluminant(data: Uint8ClampedArray, width: number, height: number, options: AwbOptions): Triplet {
  const count=Math.max(1,width*height);
  if(options.method==="white-patch"){
    const hist=[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)];
    for(let i=0;i<data.length;i+=4){hist[0][data[i]]++;hist[1][data[i+1]]++;hist[2][data[i+2]]++;}
    return [percentile(hist[0],count,options.percentile),percentile(hist[1],count,options.percentile),percentile(hist[2],count,options.percentile)];
  }
  if(options.method==="gray-edge"){
    const sums:Triplet=[0,0,0];let edges=0;
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=(y*width+x)*4,left=i-4,right=i+4,up=i-width*4,down=i+width*4;let magnitude=0;const channelValues:Triplet=[0,0,0];for(let c=0;c<3;c++){const gx=data[right+c]-data[left+c],gy=data[down+c]-data[up+c],g=Math.hypot(gx,gy);channelValues[c]=g;magnitude+=g;}if(magnitude<18)continue;sums[0]+=channelValues[0];sums[1]+=channelValues[1];sums[2]+=channelValues[2];edges++;}
    if(edges>0)return [sums[0]/edges,sums[1]/edges,sums[2]/edges];
  }
  const power=options.method==="shades-of-gray"?clamp(options.minkowskiPower,1,20):1,sums:Triplet=[0,0,0];
  for(let i=0;i<data.length;i+=4){sums[0]+=Math.pow(data[i],power);sums[1]+=Math.pow(data[i+1],power);sums[2]+=Math.pow(data[i+2],power);}
  return [Math.pow(sums[0]/count,1/power),Math.pow(sums[1]/count,1/power),Math.pow(sums[2]/count,1/power)];
}

export function autoWhiteBalance(source: GraphImage, options: AwbOptions): AwbResult {
  const sourceContext=source.getContext("2d",{willReadFrequently:true});if(!sourceContext)throw new Error("2D context unavailable");
  const imageData=sourceContext.getImageData(0,0,source.width,source.height),illuminant=estimateIlluminant(imageData.data,source.width,source.height,options);
  const target=(illuminant[0]+illuminant[1]+illuminant[2])/3,maxGain=clamp(options.maxGain,1,8),raw:Triplet=[target/Math.max(1,illuminant[0]),target/Math.max(1,illuminant[1]),target/Math.max(1,illuminant[2])];
  let gains:Triplet=raw.map(value=>1+(clamp(value,1/maxGain,maxGain)-1)*clamp(options.strength,0,1)) as Triplet;
  if(options.preserveLuminance){const normalization=3/Math.max(.001,gains[0]+gains[1]+gains[2]);gains=gains.map(value=>value*normalization) as Triplet;}
  const output=document.createElement("canvas");output.width=source.width;output.height=source.height;const context=output.getContext("2d");if(!context)throw new Error("2D context unavailable");
  const pixels=imageData.data;for(let i=0;i<pixels.length;i+=4){pixels[i]=clamp(Math.round(pixels[i]*gains[0]),0,255);pixels[i+1]=clamp(Math.round(pixels[i+1]*gains[1]),0,255);pixels[i+2]=clamp(Math.round(pixels[i+2]*gains[2]),0,255);}context.putImageData(imageData,0,0);
  return {image:output,gains:{red:gains[0],green:gains[1],blue:gains[2]},illuminant:{red:illuminant[0],green:illuminant[1],blue:illuminant[2]}};
}
