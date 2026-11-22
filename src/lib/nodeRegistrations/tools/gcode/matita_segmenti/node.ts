import { copyGcodePreview } from "../shared/copyPreview";
import type { GraphImage } from "../../../../../models/graphImage";
import type { PreviewAwareNode } from "../../../shared";
import { createToolTitle, getGraphImageSignature, isGraphImageReady, notifyGraphStateChange } from "../../shared";
import { matitaSegmentiDefaults, type MatitaSegmentiOptions, type MatitaSegmentiResult, validateMatitaSegmentiOptions } from "./model";
import { prepareMatitaSegmentiRaster } from "./raster";
import { startMatitaSegmentiWorker } from "./workerClient";
import { getGcodePreviewAboveWidgetsLayout } from "../shared/previewLayout";

type MatitaSegmentiNode=PreviewAwareNode&MatitaSegmentiGcodeToolNode;
const controls:{label:string;key:keyof MatitaSegmentiOptions;min:number;max:number;step:number}[]=[
  {label:"Width mm",key:"width",min:30,max:350,step:1},
  {label:"Resolution px/mm",key:"resolution",min:1,max:5,step:.5},
  {label:"Stroke diameter mm",key:"diameter",min:.1,max:2,step:.05},
  {label:"Ink alpha",key:"alpha",min:.05,max:.6,step:.01},
  {label:"Target MSE",key:"epsilon",min:.0001,max:.3,step:.001},
  {label:"Max segments",key:"maxSegments",min:100,max:200000,step:500},
  {label:"Step mm",key:"step",min:.2,max:2,step:.05},
  {label:"Initial directions",key:"directions",min:8,max:64,step:4},
  {label:"Overink penalty",key:"over",min:1,max:30,step:1},
  {label:"Detail weight",key:"detail",min:1,max:8,step:.5},
  {label:"Min compression mm",key:"zMin",min:0,max:2,step:.01},
  {label:"Max compression mm",key:"zMax",min:0,max:2,step:.01},
  {label:"Margin mm",key:"margin",min:0,max:100,step:.5},
  {label:"Safe Z mm",key:"zSafe",min:.1,max:50,step:.5},
  {label:"Feed XY",key:"feed",min:1,max:10000,step:10},
  {label:"Feed Z",key:"feedZ",min:1,max:2000,step:10},
  {label:"Arc tolerance mm",key:"arcTolerance",min:.01,max:1,step:.01},
];
export class MatitaSegmentiGcodeToolNode {
  size:[number,number]=[300,680];
  widgets_start_y=0;
  preview:GraphImage|null=null;result:MatitaSegmentiResult|null=null;status="waiting image";
  private signature="";private generation=0;private job:ReturnType<typeof startMatitaSegmentiWorker>|null=null;
  constructor(){
    const node=this as unknown as MatitaSegmentiNode;
    node.title=createToolTitle("GCode/Matita Segmenti");node.properties={...matitaSegmentiDefaults};
    node.addInput("image","image");node.addOutput("gcode","gcode");node.addOutput("svg","svg");
    for(const control of controls)node.addWidget("number",control.label,matitaSegmentiDefaults[control.key],value=>{
      const raw=Number(value);if(!Number.isFinite(raw))return;
      const adjusted=control.key==="directions"||control.key==="maxSegments"?Math.round(raw):raw;
      node.properties[control.key]=Math.max(control.min,Math.min(control.max,adjusted));
      notifyGraphStateChange(node);
    },{min:control.min,max:control.max,step:control.step,precision:control.step<.01?4:control.step<1?2:0});
    node.refreshPreviewLayout=()=>{
      const layout=getGcodePreviewAboveWidgetsLayout(node.preview,node.widgets?.length??0);
      node.widgets_start_y=layout.widgetTop;
      node.size=layout.size;
      node.setDirtyCanvas(true,true);
    };
    node.refreshPreviewLayout();
  }
  onExecute(this:MatitaSegmentiNode){
    const image=this.getInputData(0);
    if(!isGraphImageReady(image)){
      this.generation++;this.job?.cancel();this.job=null;this.signature="";this.result=null;this.preview=null;this.status="waiting image";
      this.setOutputData(0,null);this.setOutputData(1,null);this.refreshPreviewLayout();return;
    }
    const options={...matitaSegmentiDefaults};
    for(const key of Object.keys(matitaSegmentiDefaults) as Array<keyof MatitaSegmentiOptions>){
      if(key in this.properties)options[key]=Number(this.properties[key]);
    }
    const signature=`${getGraphImageSignature(image)}:${JSON.stringify(options)}`;
    if(signature===this.signature){this.setOutputData(0,this.result?.gcode??null);this.setOutputData(1,this.result?.svg??null);return;}
    this.signature=signature;this.generation++;const current=this.generation;
    this.job?.cancel();this.job=null;this.result=null;this.preview=null;
    this.setOutputData(0,null);this.setOutputData(1,null);
    try{
      validateMatitaSegmentiOptions(options);
      const job=startMatitaSegmentiWorker(prepareMatitaSegmentiRaster(image,options),(strokes,segments,mse,bitmap)=>{
        if(current!==this.generation){bitmap.close();return;}
        const first=this.preview===null;this.preview=copyGcodePreview(bitmap,image,this.preview);
        this.status=`${strokes} strokes · ${segments} segments · MSE ${mse.toFixed(5)}`;
        if(first)this.refreshPreviewLayout();else this.setDirtyCanvas(true,true);
      });
      this.job=job;this.status="generating";
      job.promise.then(result=>{
        if(current!==this.generation){result.preview.close();return;}
        const canvas=copyGcodePreview(result.preview,image,this.preview);
        this.preview=canvas;this.result=result;this.job=null;
        this.status=`${result.strokes} strokes · MSE ${result.mse.toFixed(5)} · ${result.reason}`;
        this.setOutputData(0,result.gcode);this.setOutputData(1,result.svg);this.refreshPreviewLayout();
      }).catch(error=>{
        if(current!==this.generation)return;
        this.job=null;this.status=error instanceof Error?error.message:"Errore Matita Segmenti";
        this.setOutputData(0,null);this.setOutputData(1,null);this.refreshPreviewLayout();
      });
    }catch(error){this.status=error instanceof Error?error.message:"Errore Matita Segmenti";}
    this.refreshPreviewLayout();
  }
  onRemoved(this:MatitaSegmentiNode){this.generation++;this.job?.cancel();this.job=null;}
  onDrawBackground(this:MatitaSegmentiNode,context:CanvasRenderingContext2D){
    const layout=getGcodePreviewAboveWidgetsLayout(this.preview,this.widgets?.length??0);
    context.save();
    context.fillStyle="#fff";
    context.fillRect(layout.padding,layout.top,layout.width,layout.height);
    if(this.preview)context.drawImage(this.preview,layout.padding,layout.top,layout.width,layout.height);
    context.fillStyle="rgba(255,255,255,.85)";
    context.fillRect(layout.padding,layout.top+layout.height-22,layout.width,22);
    context.fillStyle="#25313a";context.font="11px sans-serif";
    context.fillText(this.status,layout.padding+6,layout.top+layout.height-7,layout.width-12);
    context.fillStyle="#d9e7ed";context.font="12px sans-serif";
    context.fillText(this.status,10,layout.footerTop+12);
    if(this.result)context.fillText(`${this.result.segments} segments · ${this.result.arcs} arcs`,10,layout.footerTop+30);
    context.restore();
  }
}

/** Allows graphs saved with the previous node type to load. */
export class LegacyMatita2GcodeToolNode extends MatitaSegmentiGcodeToolNode {}
