import type { OpenCvParams } from "../model";

type CvRuntime = Record<string, any>;
const numberParam = (params:OpenCvParams,key:string,fallback:number) => Number.isFinite(Number(params[key])) ? Number(params[key]) : fallback;
const odd = (value:number,min=1) => { const safe=Math.max(min,Math.round(value)); return safe%2===0?safe+1:safe; };

function gammaCorrection(cv:CvRuntime,source:any,params:OpenCvParams) {
  const gamma=Math.max(.1,Math.min(4,numberParam(params,"gamma",1))),inverse=1/gamma,result=source.clone(),pixels=result.data;
  const lut=new Uint8Array(256);for(let value=0;value<256;value++)lut[value]=Math.round(255*Math.pow(value/255,inverse));
  for(let index=0;index<pixels.length;index+=4){pixels[index]=lut[pixels[index]];pixels[index+1]=lut[pixels[index+1]];pixels[index+2]=lut[pixels[index+2]];}
  return result;
}

function whiteBalance(cv:CvRuntime,source:any,params:OpenCvParams) {
  const strength=Math.max(0,Math.min(1,numberParam(params,"strength",100)/100)),rgb=new cv.Mat(),channels=new cv.MatVector(),balanced=new cv.MatVector(),result=new cv.Mat();
  cv.cvtColor(source,rgb,cv.COLOR_RGBA2RGB);cv.split(rgb,channels);
  const means=[0,1,2].map(index=>{const channel=channels.get(index);const mean=cv.mean(channel)[0];channel.delete();return mean;});
  const target=(means[0]+means[1]+means[2])/3;
  for(let index=0;index<3;index++){const channel=channels.get(index),adjusted=new cv.Mat(),fullGain=means[index]>0?target/means[index]:1,gain=1+(fullGain-1)*strength;cv.convertScaleAbs(channel,adjusted,gain,0);balanced.push_back(adjusted);channel.delete();adjusted.delete();}
  cv.merge(balanced,result);channels.delete();balanced.delete();rgb.delete();return result;
}

function denoise(cv:CvRuntime,source:any,params:OpenCvParams) {
  const rgb=new cv.Mat(),result=new cv.Mat();cv.cvtColor(source,rgb,cv.COLOR_RGBA2RGB);
  const strength=numberParam(params,"strength",10),colorStrength=numberParam(params,"colorStrength",10),template=odd(numberParam(params,"template",7),3),search=odd(numberParam(params,"search",21),7);
  if(typeof cv.fastNlMeansDenoisingColored==="function")cv.fastNlMeansDenoisingColored(rgb,result,strength,colorStrength,template,search);
  else cv.bilateralFilter(rgb,result,Math.max(3,odd(template)),Math.max(10,colorStrength*5),Math.max(10,strength*5),cv.BORDER_DEFAULT);
  rgb.delete();return result;
}

function localContrast(cv:CvRuntime,source:any,params:OpenCvParams) {
  const rgb=new cv.Mat(),lab=new cv.Mat(),channels=new cv.MatVector(),merged=new cv.MatVector(),adjustedLab=new cv.Mat(),result=new cv.Mat();
  cv.cvtColor(source,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,lab,cv.COLOR_RGB2Lab);cv.split(lab,channels);
  const luminance=channels.get(0),enhanced=new cv.Mat(),tiles=Math.max(2,Math.round(numberParam(params,"tiles",8))),clahe=cv.createCLAHE(numberParam(params,"clipLimit",2),new cv.Size(tiles,tiles));clahe.apply(luminance,enhanced);
  merged.push_back(enhanced);for(let index=1;index<3;index++){const channel=channels.get(index);merged.push_back(channel);channel.delete();}
  cv.merge(merged,adjustedLab);cv.cvtColor(adjustedLab,result,cv.COLOR_Lab2RGB);
  luminance.delete();enhanced.delete();clahe.delete();channels.delete();merged.delete();rgb.delete();lab.delete();adjustedLab.delete();return result;
}

function kmeansColors(cv:CvRuntime,source:any,params:OpenCvParams) {
  const rgb=new cv.Mat();cv.cvtColor(source,rgb,cv.COLOR_RGBA2RGB);const count=rgb.rows*rgb.cols,samples=new cv.Mat(count,3,cv.CV_32F);
  for(let index=0;index<count;index++){samples.data32F[index*3]=rgb.data[index*3];samples.data32F[index*3+1]=rgb.data[index*3+1];samples.data32F[index*3+2]=rgb.data[index*3+2];}
  const labels=new cv.Mat(),centers=new cv.Mat(),clusters=Math.max(2,Math.min(32,Math.round(numberParam(params,"clusters",8)))),iterations=Math.max(1,Math.round(numberParam(params,"iterations",10))),attempts=Math.max(1,Math.round(numberParam(params,"attempts",3)));
  const criteria=new cv.TermCriteria(cv.TermCriteria_EPS+cv.TermCriteria_MAX_ITER,iterations,1);cv.kmeans(samples,clusters,labels,criteria,attempts,cv.KMEANS_PP_CENTERS,centers);
  const result=new cv.Mat(rgb.rows,rgb.cols,cv.CV_8UC3);for(let index=0;index<count;index++){const cluster=labels.data32S[index];result.data[index*3]=centers.data32F[cluster*3];result.data[index*3+1]=centers.data32F[cluster*3+1];result.data[index*3+2]=centers.data32F[cluster*3+2];}
  rgb.delete();samples.delete();labels.delete();centers.delete();return result;
}

export function processEnhancementOperation(cv:CvRuntime,operation:string,params:OpenCvParams,source:any) {
  if(operation==="gamma")return gammaCorrection(cv,source,params);
  if(operation==="white-balance")return whiteBalance(cv,source,params);
  if(operation==="denoise")return denoise(cv,source,params);
  if(operation==="local-contrast")return localContrast(cv,source,params);
  if(operation==="kmeans")return kmeansColors(cv,source,params);
  return null;
}
