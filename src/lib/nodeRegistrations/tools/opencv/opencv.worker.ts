/// <reference lib="webworker" />
import cvModule from "@techstark/opencv-js";
import type { OpenCvJobRequest, OpenCvJobResponse, OpenCvParams } from "./model";

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
type CvRuntime = Record<string, any>;
let runtimePromise: Promise<CvRuntime> | null = null;

function getRuntime() {
  if (!runtimePromise) runtimePromise = (async () => {
    const candidate = await Promise.resolve(cvModule as unknown as CvRuntime | Promise<CvRuntime>);
    if (candidate.Mat) return candidate;
    await new Promise<void>((resolve) => { candidate.onRuntimeInitialized = resolve; });
    return candidate;
  })();
  return runtimePromise;
}

const numberParam = (params:OpenCvParams,key:string,fallback:number) => Number.isFinite(Number(params[key])) ? Number(params[key]) : fallback;
const stringParam = (params:OpenCvParams,key:string,fallback:string) => String(params[key] ?? fallback);
const odd = (value:number,min=1) => { const safe=Math.max(min,Math.round(value)); return safe%2===0?safe+1:safe; };

function gray(cv:CvRuntime,source:any) { const result=new cv.Mat(); cv.cvtColor(source,result,cv.COLOR_RGBA2GRAY); return result; }
function rgba(cv:CvRuntime,source:any) {
  if(source.channels()===4)return source;
  const result=new cv.Mat(); cv.cvtColor(source,result,source.channels()===1?cv.COLOR_GRAY2RGBA:cv.COLOR_RGB2RGBA); source.delete(); return result;
}
function interpolation(cv:CvRuntime,value:string){return ({nearest:cv.INTER_NEAREST,linear:cv.INTER_LINEAR,cubic:cv.INTER_CUBIC,area:cv.INTER_AREA,lanczos:cv.INTER_LANCZOS4} as Record<string,number>)[value]??cv.INTER_LINEAR;}
function border(cv:CvRuntime,value:string){return ({constant:cv.BORDER_CONSTANT,replicate:cv.BORDER_REPLICATE,reflect:cv.BORDER_REFLECT,wrap:cv.BORDER_WRAP} as Record<string,number>)[value]??cv.BORDER_REFLECT;}
function thresholdMode(cv:CvRuntime,value:string){return ({binary:cv.THRESH_BINARY,"binary-inv":cv.THRESH_BINARY_INV,truncate:cv.THRESH_TRUNC,"to-zero":cv.THRESH_TOZERO,"to-zero-inv":cv.THRESH_TOZERO_INV} as Record<string,number>)[value]??cv.THRESH_BINARY;}
function morphShape(cv:CvRuntime,value:string){return ({rect:cv.MORPH_RECT,cross:cv.MORPH_CROSS,ellipse:cv.MORPH_ELLIPSE} as Record<string,number>)[value]??cv.MORPH_ELLIPSE;}

function process(cv:CvRuntime,operation:string,params:OpenCvParams,source:any) {
  let dst=new cv.Mat();
  if(operation==="grayscale") cv.cvtColor(source,dst,cv.COLOR_RGBA2GRAY);
  else if(operation==="hsv"){const rgb=new cv.Mat();cv.cvtColor(source,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,dst,cv.COLOR_RGB2HSV);rgb.delete();}
  else if(operation==="lab"){const rgb=new cv.Mat();cv.cvtColor(source,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,dst,cv.COLOR_RGB2Lab);rgb.delete();}
  else if(operation==="invert") cv.bitwise_not(source,dst);
  else if(operation==="channel"){const channels=new cv.MatVector();cv.split(source,channels);const index=Math.max(0,Math.min(channels.size()-1,Math.round(numberParam(params,"channel",0))));dst=channels.get(index).clone();for(let i=0;i<channels.size();i++)channels.get(i).delete();channels.delete();}
  else if(operation==="convert-scale") cv.convertScaleAbs(source,dst,numberParam(params,"alpha",1),numberParam(params,"beta",0));
  else if(operation==="brightness") {
    const brightness=Math.max(-100,Math.min(100,numberParam(params,"brightness",0)))*2.55;
    const contrastValue=Math.max(-100,Math.min(100,numberParam(params,"contrast",0)));
    const contrast=contrastValue<0?1+contrastValue/100:1+2*contrastValue/100;
    const saturationValue=Math.max(-100,Math.min(200,numberParam(params,"saturation",0)));
    const saturation=Math.max(0,1+saturationValue/100);
    const rgb=new cv.Mat(),hsv=new cv.Mat(),channels=new cv.MatVector(),adjustedHsv=new cv.Mat(),saturatedRgb=new cv.Mat();
    cv.cvtColor(source,rgb,cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb,hsv,cv.COLOR_RGB2HSV);
    cv.split(hsv,channels);
    const saturationChannel=channels.get(1),scaledSaturation=new cv.Mat();
    cv.convertScaleAbs(saturationChannel,scaledSaturation,saturation,0);
    channels.set(1,scaledSaturation);
    cv.merge(channels,adjustedHsv);
    cv.cvtColor(adjustedHsv,saturatedRgb,cv.COLOR_HSV2RGB);
    cv.convertScaleAbs(saturatedRgb,dst,contrast,brightness);
    saturationChannel.delete();scaledSaturation.delete();channels.delete();rgb.delete();hsv.delete();adjustedHsv.delete();saturatedRgb.delete();
  }
  else if(operation==="box-blur") cv.blur(source,dst,new cv.Size(odd(numberParam(params,"kernel",5)),odd(numberParam(params,"kernel",5))),new cv.Point(-1,-1),cv.BORDER_DEFAULT);
  else if(operation==="gaussian-blur") cv.GaussianBlur(source,dst,new cv.Size(odd(numberParam(params,"kernel",5)),odd(numberParam(params,"kernel",5))),numberParam(params,"sigma",0),0,cv.BORDER_DEFAULT);
  else if(operation==="median-blur") cv.medianBlur(source,dst,odd(numberParam(params,"kernel",5),3));
  else if(operation==="bilateral"){const rgb=new cv.Mat();cv.cvtColor(source,rgb,cv.COLOR_RGBA2RGB);cv.bilateralFilter(rgb,dst,odd(numberParam(params,"diameter",9)),numberParam(params,"sigmaColor",75),numberParam(params,"sigmaSpace",75),cv.BORDER_DEFAULT);rgb.delete();}
  else if(operation==="sharpen"||operation==="emboss"){
    const amount=numberParam(params,operation==="sharpen"?"amount":"strength",1);
    const values=operation==="sharpen"?[0,-amount,0,-amount,1+4*amount,-amount,0,-amount,0]:[-2*amount,-amount,0,-amount,1,amount,0,amount,2*amount];
    const kernel=cv.matFromArray(3,3,cv.CV_32FC1,values);cv.filter2D(source,dst,cv.CV_8U,kernel,new cv.Point(-1,-1),operation==="emboss"?128:0,cv.BORDER_DEFAULT);kernel.delete();
  } else if(operation==="threshold"||operation==="otsu") {const g=gray(cv,source);const mode=thresholdMode(cv,stringParam(params,"mode","binary"))|(operation==="otsu"?cv.THRESH_OTSU:0);cv.threshold(g,dst,operation==="otsu"?0:numberParam(params,"threshold",127),numberParam(params,"maxValue",255),mode);g.delete();}
  else if(operation==="adaptive-threshold"){const g=gray(cv,source);cv.adaptiveThreshold(g,dst,numberParam(params,"maxValue",255),stringParam(params,"method","gaussian")==="mean"?cv.ADAPTIVE_THRESH_MEAN_C:cv.ADAPTIVE_THRESH_GAUSSIAN_C,thresholdMode(cv,stringParam(params,"mode","binary")),odd(numberParam(params,"blockSize",11),3),numberParam(params,"constant",2));g.delete();}
  else if(operation==="canny"){const g=gray(cv,source);cv.Canny(g,dst,numberParam(params,"low",50),numberParam(params,"high",150),odd(numberParam(params,"aperture",3),3),Boolean(params.l2));g.delete();}
  else if(operation==="sobel"||operation==="scharr"){
    const g=gray(cv,source),gx=new cv.Mat(),gy=new cv.Mat(),ax=new cv.Mat(),ay=new cv.Mat(),axis=stringParam(params,"axis","xy"),scale=numberParam(params,"scale",1);
    if(operation==="sobel"){const k=odd(numberParam(params,"kernel",3));cv.Sobel(g,gx,cv.CV_16S,1,0,k,scale,0,cv.BORDER_DEFAULT);cv.Sobel(g,gy,cv.CV_16S,0,1,k,scale,0,cv.BORDER_DEFAULT);}
    else {cv.Scharr(g,gx,cv.CV_16S,1,0,scale,0,cv.BORDER_DEFAULT);cv.Scharr(g,gy,cv.CV_16S,0,1,scale,0,cv.BORDER_DEFAULT);}cv.convertScaleAbs(gx,ax);cv.convertScaleAbs(gy,ay);
    if(axis==="x")dst=ax.clone();else if(axis==="y")dst=ay.clone();else cv.addWeighted(ax,.5,ay,.5,0,dst);g.delete();gx.delete();gy.delete();ax.delete();ay.delete();
  } else if(operation==="laplacian"){const g=gray(cv,source),signed=new cv.Mat();cv.Laplacian(g,signed,cv.CV_16S,odd(numberParam(params,"kernel",3)),numberParam(params,"scale",1),0,cv.BORDER_DEFAULT);cv.convertScaleAbs(signed,dst);g.delete();signed.delete();}
  else if(["erode","dilate","morph-open","morph-close","morph-gradient","top-hat","black-hat"].includes(operation)){
    const size=odd(numberParam(params,"kernel",3)),kernel=cv.getStructuringElement(morphShape(cv,stringParam(params,"shape","ellipse")),new cv.Size(size,size)),iterations=Math.round(numberParam(params,"iterations",1));
    if(operation==="erode")cv.erode(source,dst,kernel,new cv.Point(-1,-1),iterations);else if(operation==="dilate")cv.dilate(source,dst,kernel,new cv.Point(-1,-1),iterations);else {const code=({"morph-open":cv.MORPH_OPEN,"morph-close":cv.MORPH_CLOSE,"morph-gradient":cv.MORPH_GRADIENT,"top-hat":cv.MORPH_TOPHAT,"black-hat":cv.MORPH_BLACKHAT} as Record<string,number>)[operation];cv.morphologyEx(source,dst,code,kernel,new cv.Point(-1,-1),iterations);}kernel.delete();
  } else if(operation==="equalize-hist"){const g=gray(cv,source);cv.equalizeHist(g,dst);g.delete();}
  else if(operation==="clahe"){const g=gray(cv,source),clahe=cv.createCLAHE(numberParam(params,"clipLimit",2),new cv.Size(numberParam(params,"tiles",8),numberParam(params,"tiles",8)));clahe.apply(g,dst);clahe.delete();g.delete();}
  else if(operation==="distance-transform"){const g=gray(cv,source),binary=new cv.Mat(),distance=new cv.Mat();cv.threshold(g,binary,0,255,cv.THRESH_BINARY|cv.THRESH_OTSU);const type=({l1:cv.DIST_L1,l2:cv.DIST_L2,c:cv.DIST_C} as Record<string,number>)[stringParam(params,"distance","l2")];cv.distanceTransform(binary,distance,type,numberParam(params,"mask",3));cv.normalize(distance,dst,0,255,cv.NORM_MINMAX,cv.CV_8U);g.delete();binary.delete();distance.delete();}
  else if(operation==="resize"){const scale=numberParam(params,"scale",1);cv.resize(source,dst,new cv.Size(Math.max(1,Math.round(source.cols*scale)),Math.max(1,Math.round(source.rows*scale))),0,0,interpolation(cv,stringParam(params,"interpolation","linear")));}
  else if(operation==="rotate"){const center=new cv.Point(source.cols/2,source.rows/2),matrix=cv.getRotationMatrix2D(center,numberParam(params,"angle",0),numberParam(params,"scale",1));cv.warpAffine(source,dst,matrix,new cv.Size(source.cols,source.rows),cv.INTER_LINEAR,border(cv,stringParam(params,"border","reflect")),new cv.Scalar());matrix.delete();}
  else if(operation==="flip")cv.flip(source,dst,({horizontal:1,vertical:0,both:-1} as Record<string,number>)[stringParam(params,"axis","horizontal")]);
  else if(operation==="pyr-down")cv.pyrDown(source,dst);
  else if(operation==="pyr-up")cv.pyrUp(source,dst);
  else if(operation==="find-contours"){
    const g=gray(cv,source),binary=new cv.Mat(),contours=new cv.MatVector(),hierarchy=new cv.Mat();cv.threshold(g,binary,numberParam(params,"threshold",127),255,cv.THRESH_BINARY);
    const retrieval=({external:cv.RETR_EXTERNAL,list:cv.RETR_LIST,ccomp:cv.RETR_CCOMP,tree:cv.RETR_TREE} as Record<string,number>)[stringParam(params,"retrieval","external")],approx=({none:cv.CHAIN_APPROX_NONE,simple:cv.CHAIN_APPROX_SIMPLE,"tc89-l1":cv.CHAIN_APPROX_TC89_L1,"tc89-kcos":cv.CHAIN_APPROX_TC89_KCOS} as Record<string,number>)[stringParam(params,"approximation","simple")];
    cv.findContours(binary,contours,hierarchy,retrieval,approx);dst=cv.Mat.zeros(source.rows,source.cols,cv.CV_8UC4);for(let i=0;i<contours.size();i++)cv.drawContours(dst,contours,i,new cv.Scalar(255,255,255,255),numberParam(params,"thickness",1));g.delete();binary.delete();contours.delete();hierarchy.delete();
  } else if(operation==="hough-lines"){
    const g=gray(cv,source),edges=new cv.Mat(),lines=new cv.Mat();cv.Canny(g,edges,numberParam(params,"low",50),numberParam(params,"high",150));cv.HoughLinesP(edges,lines,1,Math.PI/180,numberParam(params,"threshold",50),numberParam(params,"minLength",30),numberParam(params,"maxGap",10));dst=source.clone();for(let i=0;i<lines.rows;i++){const p=lines.data32S.subarray(i*4,i*4+4);cv.line(dst,new cv.Point(p[0],p[1]),new cv.Point(p[2],p[3]),new cv.Scalar(255,0,0,255),numberParam(params,"thickness",2));}g.delete();edges.delete();lines.delete();
  } else if(operation==="hough-circles"){
    const g=gray(cv,source),smooth=new cv.Mat(),circles=new cv.Mat();cv.medianBlur(g,smooth,5);cv.HoughCircles(smooth,circles,cv.HOUGH_GRADIENT,numberParam(params,"dp",1),numberParam(params,"minDist",20),numberParam(params,"param1",100),numberParam(params,"param2",30),numberParam(params,"minRadius",0),numberParam(params,"maxRadius",0));dst=source.clone();for(let i=0;i<circles.cols;i++){const x=circles.data32F[i*3],y=circles.data32F[i*3+1],r=circles.data32F[i*3+2];cv.circle(dst,new cv.Point(x,y),r,new cv.Scalar(255,0,0,255),numberParam(params,"thickness",2));}g.delete();smooth.delete();circles.delete();
  } else throw new Error(`Unsupported OpenCV operation: ${operation}`);
  return rgba(cv,dst);
}

scope.onmessage = async (event:MessageEvent<OpenCvJobRequest>) => {
  const request=event.data;if(request.type!=="process")return;const started=performance.now();
  try{
    scope.postMessage({type:"progress",jobId:request.jobId,progress:.05,stage:"loading OpenCV"} satisfies OpenCvJobResponse);
    const cv=await getRuntime();scope.postMessage({type:"progress",jobId:request.jobId,progress:.2,stage:"processing"} satisfies OpenCvJobResponse);
    const source=new cv.Mat(request.image.height,request.image.width,cv.CV_8UC4);source.data.set(request.image.rgba);
    const result=process(cv,request.operation,request.params,source);source.delete();
    const rgbaData=new Uint8ClampedArray(result.data.length);rgbaData.set(result.data);const image={width:result.cols,height:result.rows,rgba:rgbaData};result.delete();
    scope.postMessage({type:"result",jobId:request.jobId,image,elapsedMs:performance.now()-started} satisfies OpenCvJobResponse,[rgbaData.buffer]);
  }catch(error){scope.postMessage({type:"error",jobId:request.jobId,message:error instanceof Error?error.message:String(error)} satisfies OpenCvJobResponse);}
};
