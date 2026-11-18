import { drawImagePreview } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { NodeCtor, PreviewAwareNode } from "../../shared";
import { clamp, createToolTitle, notifyGraphStateChange, refreshNode } from "../shared";
import { defaultParams, openCvOperationSpecs, type OpenCvControl, type OpenCvOperationSpec, type OpenCvParams } from "./model";
import { runOpenCvJob, type OpenCvWorkerJob } from "./workerPool";

function addControl(node:PreviewAwareNode,control:OpenCvControl){
  const update=(value:number|string|boolean)=>{node.properties[control.key]=control.type==="slider"?Number(value):control.type==="toggle"?Boolean(value):value;notifyGraphStateChange(node);};
  if(control.type==="slider")node.addWidget("slider",control.label,control.defaultValue,update,{min:control.min,max:control.max,step:control.step,precision:control.step<1?2:0});
  else if(control.type==="toggle")node.addWidget("toggle",control.label,control.defaultValue,update);
  else node.addWidget("combo",control.label,control.defaultValue,update,{values:control.values});
}
function outputCanvas(payload:{width:number;height:number;rgba:Uint8ClampedArray}){const canvas=document.createElement("canvas");canvas.width=payload.width;canvas.height=payload.height;const context=canvas.getContext("2d");if(!context)throw new Error("2D context unavailable");const imageData=context.createImageData(payload.width,payload.height);imageData.data.set(payload.rgba);context.putImageData(imageData,0,0);return canvas;}

function createOpenCvNode(spec:OpenCvOperationSpec):NodeCtor {
  class OpenCvToolNode {
    size:[number,number]=[310,420];preview:GraphImage|null=null;status="waiting image";progress=0;progressStage="idle";executionMs:number|null=null;isRendering=false;job:OpenCvWorkerJob|null=null;runToken=0;properties!:Record<string,unknown>;
    constructor(){const node=this as unknown as PreviewAwareNode&OpenCvToolNode;node.title=createToolTitle(`OpenCV/${spec.label}`);node.properties=defaultParams(spec);node.addInput("image","image");node.addOutput("image","image");for(const control of spec.controls)addControl(node,control);node.refreshPreviewLayout=()=>refreshNode(node,node.preview,3);node.refreshPreviewLayout();}
    onExecute(this:PreviewAwareNode&OpenCvToolNode){const input=this.getInputData(0);if(!input){this.job?.cancel();this.job=null;this.preview=null;this.status="waiting image";this.progress=0;this.isRendering=false;this.setOutputData(0,null);this.refreshPreviewLayout();return;}const context=input.getContext("2d",{willReadFrequently:true});if(!context)return;this.job?.cancel();const data=context.getImageData(0,0,input.width,input.height),token=++this.runToken;this.isRendering=true;this.progress=.01;this.progressStage="queued";this.status="queued";const params={...this.properties} as OpenCvParams;const job=runOpenCvJob(spec.id,params,{width:input.width,height:input.height,rgba:new Uint8ClampedArray(data.data)},(progress,stage)=>{if(token!==this.runToken)return;this.progress=clamp(progress,0,1);this.progressStage=stage;this.status=stage;this.setDirtyCanvas(true,true);});this.job=job;void job.promise.then(result=>{if(token!==this.runToken)return;this.preview=outputCanvas(result.image);this.executionMs=result.elapsedMs;this.progress=1;this.progressStage="complete";this.status="ready";this.isRendering=false;this.job=null;this.setOutputData(0,this.preview);this.refreshPreviewLayout();this.setDirtyCanvas(true,true);}).catch(error=>{if(token!==this.runToken||error instanceof DOMException&&error.name==="AbortError")return;this.status=error instanceof Error?error.message:"OpenCV error";this.progress=0;this.isRendering=false;this.job=null;this.setDirtyCanvas(true,true);});this.setOutputData(0,this.preview);}
    onRemoved(){this.runToken++;this.job?.cancel();this.job=null;}
    onDrawBackground(this:PreviewAwareNode&OpenCvToolNode,context:CanvasRenderingContext2D){const layout=drawImagePreview(context,this,this.preview,{footerLines:3});context.save();context.fillStyle="rgba(255,255,255,.7)";context.font="12px sans-serif";context.fillText(`${spec.id} | ${this.status}`,10,layout.footerTop+12);context.fillText(`progress ${Math.round(this.progress*100)}% | ${this.progressStage}`,10,layout.footerTop+30);context.fillText(this.executionMs===null?"worker: --":`OpenCV: ${this.executionMs.toFixed(1)} ms`,10,layout.footerTop+48);context.restore();}
  }
  return OpenCvToolNode as unknown as NodeCtor;
}

export function createOpenCvNodeCtors(){return Object.fromEntries(openCvOperationSpecs.map(spec=>[spec.id,createOpenCvNode(spec)])) as Record<string,NodeCtor>;}
