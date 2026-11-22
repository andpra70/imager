import { copyGcodePreview } from "../shared/copyPreview";
import type { GraphImage } from "../../../../../models/graphImage";
import type { PreviewAwareNode } from "../../../shared";
import { createToolTitle, getGraphImageSignature, isGraphImageReady, notifyGraphStateChange } from "../../shared";
import type { MatitaResult } from "../matita/model";
import { matitaSplineDefaults, type MatitaSplineOptions, validateMatitaSplineOptions } from "./model";
import { prepareMatitaRaster } from "../matita/raster";
import { startMatitaSplineWorker } from "./workerClient";
import { getGcodePreviewAboveWidgetsLayout } from "../shared/previewLayout";

type MatitaSplineNode = PreviewAwareNode & MatitaSplineGcodeToolNode;
type NumericKey = Exclude<keyof MatitaSplineOptions, "mode">;
const controls: { label: string; key: NumericKey; min: number; max: number; step: number }[] = [
  {label:"Width mm",key:"width",min:30,max:500,step:1}, {label:"Resolution px/mm",key:"ppm",min:1,max:5,step:.5},
  {label:"Candidates",key:"candidates",min:4,max:32,step:1}, {label:"Horizon mm",key:"horizon",min:2,max:25,step:.5},
  {label:"Control bend mm",key:"bend",min:.2,max:8,step:.2},
  {label:"Max strokes",key:"maxStrokes",min:50,max:100000,step:50}, {label:"Target MSE",key:"epsilon",min:.0001,max:.5,step:.001},
  {label:"Stop sensitivity",key:"stopSensitivity",min:1,max:10,step:1}, {label:"Stop window",key:"stopWindow",min:15,max:200,step:5},
  {label:"Ink alpha",key:"alpha",min:.02,max:.8,step:.01}, {label:"Overink penalty",key:"over",min:1,max:20,step:.5},
  {label:"White threshold",key:"white",min:180,max:255,step:1}, {label:"White margin mm",key:"margin",min:0,max:1,step:.05},
  {label:"Stroke diameter mm",key:"diameter",min:.1,max:2,step:.1}, {label:"Simulation step mm",key:"step",min:.15,max:1,step:.05},
  {label:"Min compression mm",key:"zMin",min:.01,max:1,step:.01}, {label:"Max compression mm",key:"zMax",min:.02,max:1.5,step:.01},
  {label:"Safe Z mm",key:"zSafe",min:.5,max:20,step:.5}, {label:"Spring mm",key:"spring",min:.5,max:20,step:.5},
  {label:"Feed XY",key:"feed",min:100,max:10000,step:10}, {label:"Feed Z",key:"feedZ",min:30,max:2000,step:10},
];
export class MatitaSplineGcodeToolNode {
  size: [number,number] = [300,680];
  widgets_start_y=0;
  preview: GraphImage | null = null;
  result: MatitaResult | null = null;
  status = "waiting image";
  private signature = "";
  private generation = 0;
  private job: ReturnType<typeof startMatitaSplineWorker> | null = null;
  constructor() {
    const node=this as unknown as MatitaSplineNode;
    node.title=createToolTitle("GCode/Matita Spline"); node.properties={...matitaSplineDefaults};
    node.addInput("image","image"); node.addOutput("gcode","gcode"); node.addOutput("svg","svg");
    node.addWidget("combo","Mode",matitaSplineDefaults.mode,value=>{
      if(value === "balanced" || value === "fast" || value === "fine") { node.properties.mode=value; notifyGraphStateChange(node); }
    },{values:["balanced","fast","fine"]});
    for(const control of controls) node.addWidget("number",control.label,matitaSplineDefaults[control.key],value=>{
      const number=Number(value);
      if(Number.isFinite(number)) { node.properties[control.key]=Math.max(control.min,Math.min(control.max,(["candidates","maxStrokes","stopSensitivity","stopWindow","white"].includes(control.key) ? Math.round(number) : number))); notifyGraphStateChange(node); }
    },{min:control.min,max:control.max,step:control.step,precision:control.step<.01?4:control.step<1?2:0});
    node.refreshPreviewLayout=()=>{
      const layout=getGcodePreviewAboveWidgetsLayout(node.preview,node.widgets?.length??0);
      node.widgets_start_y=layout.widgetTop;node.size=layout.size;node.setDirtyCanvas(true,true);
    };
    node.refreshPreviewLayout();
  }
  onExecute(this: MatitaSplineNode) {
    const image=this.getInputData(0);
    if(!isGraphImageReady(image)){
      this.generation++;this.job?.cancel();this.job=null;this.signature="";this.result=null;this.preview=null;this.status="waiting image";
      this.setOutputData(0,null);this.setOutputData(1,null);this.refreshPreviewLayout();return;
    }
    const options={...matitaSplineDefaults,...this.properties} as MatitaSplineOptions;
    const signature=`${getGraphImageSignature(image)}:${JSON.stringify(options)}`;
    if(signature===this.signature){this.setOutputData(0,this.result?.gcode??null);this.setOutputData(1,this.result?.svg??null);return;}
    this.signature=signature;this.generation++;const current=this.generation;
    this.job?.cancel();this.job=null;this.result=null;this.preview=null;this.setOutputData(0,null);this.setOutputData(1,null);
    try{
      validateMatitaSplineOptions(options);
      const job=startMatitaSplineWorker(prepareMatitaRaster(image,options),(strokes,mse,stage,bitmap)=>{
        if(current!==this.generation){bitmap.close();return;}
        const firstPreview=this.preview===null;this.preview=copyGcodePreview(bitmap,image,this.preview);
        this.status=`stage ${stage+1}/3 · ${strokes} strokes · MSE ${mse.toFixed(5)}`;
        if(firstPreview) this.refreshPreviewLayout(); else this.setDirtyCanvas(true,true);
      });
      this.job=job;this.status="generating";
      job.promise.then(result=>{
        if(current!==this.generation){result.preview.close();return;}
        const canvas=copyGcodePreview(result.preview,image,this.preview);
        this.preview=canvas;this.result=result;this.status=`${result.strokes} strokes · MSE ${result.mse.toFixed(5)} · ${result.stopReason}`;
        this.job=null;this.setOutputData(0,result.gcode);this.setOutputData(1,result.svg);this.refreshPreviewLayout();
      }).catch(error=>{
        if(current!==this.generation)return;
        this.job=null;this.status=error instanceof Error?error.message:"Errore Matita Spline";
        this.setOutputData(0,null);this.setOutputData(1,null);this.refreshPreviewLayout();
      });
    }catch(error){this.status=error instanceof Error?error.message:"Errore Matita Spline";}
    this.refreshPreviewLayout();
  }
  onRemoved(this:MatitaSplineNode){this.generation++;this.job?.cancel();this.job=null;}
  onDrawBackground(this:MatitaSplineNode,context:CanvasRenderingContext2D){
    const layout=getGcodePreviewAboveWidgetsLayout(this.preview,this.widgets?.length??0);
    context.save();context.fillStyle="#fff";context.fillRect(layout.padding,layout.top,layout.width,layout.height);
    if(this.preview)context.drawImage(this.preview,layout.padding,layout.top,layout.width,layout.height);
    context.fillStyle="rgba(255,255,255,.85)";context.fillRect(layout.padding,layout.top+layout.height-22,layout.width,22);
    context.fillStyle="#25313a";context.font="11px sans-serif";
    context.fillText(this.status,layout.padding+6,layout.top+layout.height-7,layout.width-12);
    context.fillStyle="#d9e7ed";context.font="12px sans-serif";
    context.fillText(this.status,10,layout.footerTop+12);
    if(this.result)context.fillText(`${this.result.lengthMm.toFixed(1)} mm · ${this.result.arcs} arcs · ${this.result.lines} lines`,10,layout.footerTop+30);
    context.restore();
  }
}
