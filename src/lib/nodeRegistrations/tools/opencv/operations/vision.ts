import type { OpenCvParams } from "../model";

type CvRuntime = Record<string, any>;
const numberParam = (params:OpenCvParams,key:string,fallback:number) => Number.isFinite(Number(params[key])) ? Number(params[key]) : fallback;
const stringParam = (params:OpenCvParams,key:string,fallback:string) => String(params[key] ?? fallback);

function grabCut(cv:CvRuntime,source:any,params:OpenCvParams) {
  const rgb=new cv.Mat();cv.cvtColor(source,rgb,cv.COLOR_RGBA2RGB);const mask=new cv.Mat(source.rows,source.cols,cv.CV_8UC1,new cv.Scalar(cv.GC_BGD)),bgModel=new cv.Mat(),fgModel=new cv.Mat();
  const inset=Math.max(0,Math.min(.4,numberParam(params,"inset",5)/100)),x=Math.round(source.cols*inset),y=Math.round(source.rows*inset),width=Math.max(1,source.cols-x*2),height=Math.max(1,source.rows-y*2);
  cv.grabCut(rgb,mask,new cv.Rect(x,y,width,height),bgModel,fgModel,Math.max(1,Math.round(numberParam(params,"iterations",5))),cv.GC_INIT_WITH_RECT);
  const result=source.clone(),transparent=Boolean(params.transparent);for(let index=0;index<mask.data.length;index++){const foreground=mask.data[index]===cv.GC_FGD||mask.data[index]===cv.GC_PR_FGD;if(!foreground){result.data[index*4]=255;result.data[index*4+1]=255;result.data[index*4+2]=255;result.data[index*4+3]=transparent?0:255;}}
  rgb.delete();mask.delete();bgModel.delete();fgModel.delete();return result;
}

function perspective(cv:CvRuntime,source:any,params:OpenCvParams) {
  const point=(xKey:string,yKey:string,fx:number,fy:number)=>[source.cols*numberParam(params,xKey,fx)/100,source.rows*numberParam(params,yKey,fy)/100];
  const points=[...point("topLeftX","topLeftY",0,0),...point("topRightX","topRightY",100,0),...point("bottomRightX","bottomRightY",100,100),...point("bottomLeftX","bottomLeftY",0,100)];
  const target=[0,0,source.cols-1,0,source.cols-1,source.rows-1,0,source.rows-1],sourcePoints=cv.matFromArray(4,1,cv.CV_32FC2,points),targetPoints=cv.matFromArray(4,1,cv.CV_32FC2,target),matrix=cv.getPerspectiveTransform(sourcePoints,targetPoints),result=new cv.Mat();
  cv.warpPerspective(source,result,matrix,new cv.Size(source.cols,source.rows),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(255,255,255,255));sourcePoints.delete();targetPoints.delete();matrix.delete();return result;
}

function inpaint(cv:CvRuntime,source:any,params:OpenCvParams) {
  if(typeof cv.inpaint!=="function")throw new Error("Questa build OpenCV non include il modulo photo/inpaint.");
  const rgb=new cv.Mat(),gray=new cv.Mat(),mask=new cv.Mat(),result=new cv.Mat();cv.cvtColor(source,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,gray,cv.COLOR_RGB2GRAY);
  const mode=stringParam(params,"maskMode","light"),threshold=numberParam(params,"threshold",245);cv.threshold(gray,mask,threshold,255,mode==="dark"?cv.THRESH_BINARY_INV:cv.THRESH_BINARY);cv.inpaint(rgb,mask,result,numberParam(params,"radius",3),stringParam(params,"method","telea")==="ns"?cv.INPAINT_NS:cv.INPAINT_TELEA);
  rgb.delete();gray.delete();mask.delete();return result;
}

function skeleton(cv:CvRuntime,source:any,params:OpenCvParams) {
  const gray=new cv.Mat(),binary=new cv.Mat();cv.cvtColor(source,gray,cv.COLOR_RGBA2GRAY);cv.threshold(gray,binary,numberParam(params,"threshold",127),255,Boolean(params.invert)?cv.THRESH_BINARY_INV:cv.THRESH_BINARY);
  const skeleton=cv.Mat.zeros(binary.rows,binary.cols,cv.CV_8UC1),eroded=new cv.Mat(),opened=new cv.Mat(),residue=new cv.Mat(),kernel=cv.getStructuringElement(cv.MORPH_CROSS,new cv.Size(3,3));let iterations=0;
  while(cv.countNonZero(binary)>0&&iterations++<Math.max(binary.rows,binary.cols)){cv.erode(binary,eroded,kernel);cv.dilate(eroded,opened,kernel);cv.subtract(binary,opened,residue);cv.bitwise_or(skeleton,residue,skeleton);eroded.copyTo(binary);}
  gray.delete();binary.delete();eroded.delete();opened.delete();residue.delete();kernel.delete();return skeleton;
}

function boundingShapes(cv:CvRuntime,source:any,params:OpenCvParams) {
  const gray=new cv.Mat(),binary=new cv.Mat(),contours=new cv.MatVector(),hierarchy=new cv.Mat(),result=source.clone();cv.cvtColor(source,gray,cv.COLOR_RGBA2GRAY);cv.threshold(gray,binary,numberParam(params,"threshold",127),255,cv.THRESH_BINARY);cv.findContours(binary,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
  const shape=stringParam(params,"shape","rectangle"),minArea=numberParam(params,"minArea",100),thickness=Math.round(numberParam(params,"thickness",2)),color=new cv.Scalar(255,0,0,255);
  for(let index=0;index<contours.size();index++){const contour=contours.get(index);if(cv.contourArea(contour)>=minArea){if(shape==="circle"){const circle=cv.minEnclosingCircle(contour);cv.circle(result,circle.center,Math.round(circle.radius),color,thickness);}else if(shape==="ellipse"&&contour.rows>=5){const ellipse=cv.fitEllipse(contour);cv.ellipse1(result,ellipse,color,thickness);}else{const rect=cv.boundingRect(contour);cv.rectangle(result,new cv.Point(rect.x,rect.y),new cv.Point(rect.x+rect.width,rect.y+rect.height),color,thickness);}}contour.delete();}
  gray.delete();binary.delete();contours.delete();hierarchy.delete();return result;
}

export function processVisionOperation(cv:CvRuntime,operation:string,params:OpenCvParams,source:any) {
  if(operation==="grabcut")return grabCut(cv,source,params);
  if(operation==="perspective")return perspective(cv,source,params);
  if(operation==="inpaint")return inpaint(cv,source,params);
  if(operation==="skeleton")return skeleton(cv,source,params);
  if(operation==="bounding-shapes")return boundingShapes(cv,source,params);
  return null;
}
