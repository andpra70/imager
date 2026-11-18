import { drawImagePreview, rasterizeGraphSvg } from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { GraphSvg } from "../../../../models/graphSvg";
import type { PreviewAwareNode } from "../../shared";
import { clamp, createToolTitle, getGraphImageSignature, notifyGraphStateChange, refreshNode } from "../shared";
import {
  defaultManualPrepareOptions, manualLayerIds, manualLayerLabels,
  type ArtisticModel, type ArtisticTechnique, type ManualLayerId, type ManualPrepareOptions, type ManualStageProgress,
} from "./model";
import { startManualPrepareWorker, type ManualWorkerJob } from "./workerClient";

function optionsFrom(properties: Record<string, unknown>): ManualPrepareOptions {
  const legacyLayers = new Set(String(properties.layers ?? manualLayerIds.join(","))
    .split(",").map(value=>value.trim()).filter((value): value is ManualLayerId=>manualLayerIds.includes(value as ManualLayerId)));
  const enabled = manualLayerIds.filter((layer) => {
    const propertyName = `layer_${layer}`;
    return propertyName in properties ? Boolean(properties[propertyName]) : legacyLayers.has(layer);
  });
  return {
    technique: String(properties.technique ?? "graphite") as ArtisticTechnique,
    outputWidth: clamp(Number(properties.outputWidth ?? 1200),64,4096), outputHeight: clamp(Number(properties.outputHeight ?? 0),0,4096),
    preserveAspectRatio:Boolean(properties.preserveAspectRatio ?? true), detailLevel:clamp(Number(properties.detailLevel ?? 6),1,8),
    gridColumns:clamp(Number(properties.gridColumns ?? 12),4,30), adaptiveDepth:clamp(Number(properties.adaptiveDepth ?? 2),0,4),
    complexityThreshold:clamp(Number(properties.complexityThreshold ?? .22),.05,.8), landmarkCount:clamp(Number(properties.landmarkCount ?? 60),10,150),
    toneLevels:Number(properties.toneLevels ?? 9) as ManualPrepareOptions["toneLevels"], edgeThreshold:clamp(Number(properties.edgeThreshold ?? .2),.02,.8),
    hatchSpacing:clamp(Number(properties.hatchSpacing ?? 7),3,24), strokeWidth:clamp(Number(properties.strokeWidth ?? 1),.1,5),
    textureAmount:clamp(Number(properties.textureAmount ?? .35),0,1), humaneness:clamp(Number(properties.humaneness ?? .4),0,1),
    seed:Math.round(Number(properties.seed ?? 1337)), enabledLayers:enabled,
  };
}

function addSlider(node: PreviewAwareNode,key:string,label:string,min:number,max:number,step:number){node.addWidget("slider",label,Number(node.properties[key]),value=>{node.properties[key]=Number(value);notifyGraphStateChange(node);},{min,max,step,precision:step<1?2:0});}

export class ManualPrepareToolNode {
  size:[number,number]=[340,690]; preview:GraphImage|null=null; svg:GraphSvg|null=null; model:ArtisticModel|null=null;
  status="waiting image"; progress:ManualStageProgress|null=null; executionMs:number|null=null; lastSignature=""; lastOptionsSignature="";
  job:ManualWorkerJob|null=null; runToken=0; properties!:Record<string,unknown>;

  constructor(){
    const node=this as unknown as PreviewAwareNode&ManualPrepareToolNode; node.title=createToolTitle("Manual/Prepare");
    node.properties={
      ...defaultManualPrepareOptions,
      layers:manualLayerIds.join(","),
      ...Object.fromEntries(manualLayerIds.map((layer) => [`layer_${layer}`, true])),
    };
    node.addInput("image","image"); node.addOutput("image","image"); node.addOutput("svg","svg"); node.addOutput("model","object");
    node.addWidget("combo","Technique","graphite",value=>{node.properties.technique=String(value);notifyGraphStateChange(node);},{values:["graphite","charcoal","ink","comic-ink"]});
    addSlider(node,"outputWidth","Support width",64,4096,16); node.addWidget("toggle","Keep ratio",true,value=>{node.properties.preserveAspectRatio=Boolean(value);notifyGraphStateChange(node);});
    addSlider(node,"detailLevel","Detail L0-L8",1,8,1); addSlider(node,"gridColumns","Grid columns",4,30,1); addSlider(node,"adaptiveDepth","Grid depth",0,4,1);
    addSlider(node,"complexityThreshold","Grid threshold",.05,.8,.01); addSlider(node,"landmarkCount","Landmarks",10,150,5);
    node.addWidget("combo","Tone levels",9,value=>{node.properties.toneLevels=Number(value);notifyGraphStateChange(node);},{values:[2,3,5,9,16,32]});
    addSlider(node,"edgeThreshold","Edge threshold",.02,.8,.01); addSlider(node,"hatchSpacing","Mark spacing",3,24,1); addSlider(node,"strokeWidth","Stroke width",.1,5,.1); addSlider(node,"textureAmount","Texture",0,1,.05); addSlider(node,"humaneness","Humaneness",0,1,.1);
    for (const layer of manualLayerIds) {
      node.addWidget("toggle", `Layer: ${manualLayerLabels[layer]}`, true, value => {
        node.properties[`layer_${layer}`] = Boolean(value);
        node.properties.layers = manualLayerIds
          .filter(candidate => Boolean(node.properties[`layer_${candidate}`]))
          .join(",");
        notifyGraphStateChange(node);
      });
    }
    node.refreshPreviewLayout=()=>refreshNode(node,node.preview,4); node.refreshPreviewLayout();
  }

  onExecute(this:PreviewAwareNode&ManualPrepareToolNode){
    const input=this.getInputData(0)??null;
    if(!input){this.job?.cancel();this.job=null;this.preview=null;this.svg=null;this.model=null;this.status="waiting image";this.lastSignature="";this.setOutputData(0,null);this.setOutputData(1,null);this.setOutputData(2,null);this.refreshPreviewLayout();return;}
    const options=optionsFrom(this.properties),signature=getGraphImageSignature(input),optionsSignature=JSON.stringify(options);
    if(signature===this.lastSignature&&optionsSignature===this.lastOptionsSignature){this.setOutputData(0,this.preview);this.setOutputData(1,this.svg);this.setOutputData(2,this.model);return;}
    this.job?.cancel(); const context=input.getContext("2d",{willReadFrequently:true});if(!context)return;
    const rgba=new Uint8ClampedArray(context.getImageData(0,0,input.width,input.height).data),token=++this.runToken,started=performance.now();
    this.status="running";this.progress={stage:"normalization",progress:0,overall:0,message:"Starting"};this.lastSignature=signature;this.lastOptionsSignature=optionsSignature;
    const job=startManualPrepareWorker({width:input.width,height:input.height,rgba,options},progress=>{if(token!==this.runToken)return;this.progress=progress;const stageLabel=progress.stage in manualLayerLabels?manualLayerLabels[progress.stage as ManualLayerId]:progress.stage;this.status=`${stageLabel} ${Math.round(progress.overall*100)}%`;this.setDirtyCanvas(true,true);});this.job=job;
    void job.promise.then(async result=>{const preview=await rasterizeGraphSvg(result.svg);if(token!==this.runToken)return;this.svg=result.svg;this.model=result.model;this.preview=preview;this.executionMs=performance.now()-started;this.status="ready";this.job=null;this.setOutputData(0,preview);this.setOutputData(1,result.svg);this.setOutputData(2,result.model);this.refreshPreviewLayout();this.setDirtyCanvas(true,true);}).catch(error=>{if(token!==this.runToken||error instanceof DOMException&&error.name==="AbortError")return;this.status=error instanceof Error?error.message:"failed";this.lastSignature="";this.lastOptionsSignature="";this.job=null;this.setDirtyCanvas(true,true);});
    this.setOutputData(0,this.preview);this.setOutputData(1,this.svg);this.setOutputData(2,this.model);
  }

  onRemoved(){this.job?.cancel();this.job=null;}
  onDrawBackground(this:PreviewAwareNode&ManualPrepareToolNode,context:CanvasRenderingContext2D){const layout=drawImagePreview(context,this,this.preview,{footerLines:4});context.save();context.fillStyle="rgba(255,255,255,.72)";context.font="12px sans-serif";context.fillText(this.status,10,layout.footerTop+12);context.fillText(`stage: ${this.progress?.stage??"-"}`,10,layout.footerTop+30);context.fillText(`grid: ${this.model?.grid.length??0} | landmarks: ${this.model?.landmarks.length??0}`,10,layout.footerTop+48);context.fillText(this.executionMs===null?"worker: idle":`worker: ${Math.round(this.executionMs)} ms`,10,layout.footerTop+66);context.restore();}
}
