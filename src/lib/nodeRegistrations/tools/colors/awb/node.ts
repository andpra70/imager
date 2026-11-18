import { drawImagePreview } from "../../../../imageUtils";
import type { GraphImage } from "../../../../../models/graphImage";
import type { PreviewAwareNode } from "../../../shared";
import { OptimizedToolNode, clamp, createToolTitle, getGraphImageSignature, notifyGraphStateChange, refreshNode } from "../../shared";
import { defaultAwbOptions, type AwbMethod, type AwbOptions } from "./model";
import { autoWhiteBalance } from "./runtime";

export class AwbToolNode extends OptimizedToolNode {
  size:[number,number]=[300,450];preview:GraphImage|null=null;gains={red:1,green:1,blue:1};properties!:Record<string,unknown>;
  constructor(){super();const node=this as unknown as PreviewAwareNode&AwbToolNode;node.title=createToolTitle("Colors/AWB");node.properties={...defaultAwbOptions};node.addInput("image","image");node.addOutput("image","image");
    node.addWidget("combo","Method","gray-world",value=>{node.properties.method=String(value);notifyGraphStateChange(node);},{values:["gray-world","white-patch","shades-of-gray","gray-edge"]});
    const slider=(key:string,label:string,value:number,min:number,max:number,step:number)=>node.addWidget("slider",label,value,next=>{node.properties[key]=Number(next);notifyGraphStateChange(node);},{min,max,step,precision:step<1?1:0});
    slider("strength","Strength",1,0,1,.1);slider("percentile","White percentile",95,80,100,.5);slider("minkowskiPower","Minkowski p",6,1,20,1);slider("maxGain","Max gain",3,1,8,.1);
    node.addWidget("toggle","Preserve luminance",true,value=>{node.properties.preserveLuminance=Boolean(value);notifyGraphStateChange(node);});node.refreshPreviewLayout=()=>refreshNode(node,node.preview,2);node.refreshPreviewLayout();}
  onExecute(this:PreviewAwareNode&AwbToolNode){const started=performance.now(),input=this.getInputData(0);if(!input){this.preview=null;this.resetOptimizedCache();this.setOutputData(0,null);this.refreshPreviewLayout();return;}const options:AwbOptions={method:String(this.properties.method??"gray-world") as AwbMethod,strength:clamp(Number(this.properties.strength??1),0,1),percentile:clamp(Number(this.properties.percentile??95),80,100),minkowskiPower:clamp(Number(this.properties.minkowskiPower??6),1,20),maxGain:clamp(Number(this.properties.maxGain??3),1,8),preserveLuminance:Boolean(this.properties.preserveLuminance??true)},signature=getGraphImageSignature(input),optionsSignature=JSON.stringify(options);if(this.canReuseOptimizedResult(signature,optionsSignature)){this.setOutputData(0,this.preview);return;}const result=autoWhiteBalance(input,options);this.preview=result.image;this.gains=result.gains;this.completeOptimizedExecution(started,signature,optionsSignature);this.setOutputData(0,this.preview);this.refreshPreviewLayout();}
  onDrawBackground(this:PreviewAwareNode&AwbToolNode,context:CanvasRenderingContext2D){const layout=drawImagePreview(context,this,this.preview,{footerLines:2});context.save();context.fillStyle="rgba(255,255,255,.7)";context.font="12px sans-serif";context.fillText(`method: ${String(this.properties.method??"gray-world")}`,10,layout.footerTop+12);context.fillText(`gain R ${this.gains.red.toFixed(2)} · G ${this.gains.green.toFixed(2)} · B ${this.gains.blue.toFixed(2)}`,10,layout.footerTop+30);context.restore();}
}
