import { copyGcodePreview } from "../shared/copyPreview";
import type { GraphImage } from "../../../../../models/graphImage";
import type { PreviewAwareNode } from "../../../shared";
import { createToolTitle,getGraphImageSignature,isGraphImageReady,notifyGraphStateChange } from "../../shared";
import { getGcodePreviewAboveWidgetsLayout } from "../shared/previewLayout";
import { calligraphyDefaults,validateCalligraphyOptions,type CalligraphyOptions,type CalligraphyResult } from "./model";
import { prepareCalligraphyRaster } from "./raster";
import { startCalligraphyWorker } from "./workerClient";
import { GcodeMatitaSuperNode } from "../shared/matitaSuperNode";
type CalligraphyNode=PreviewAwareNode & MatitaCalligraficaGcodeToolNode;
const controls:{label:string;key:keyof CalligraphyOptions;min:number;max:number;step:number}[]=[
{label:"Width mm",key:"widthMm",min:30,max:400,step:1},{label:"Height mm",key:"heightMm",min:30,max:400,step:1},{label:"Resolution px/mm",key:"ppm",min:1,max:8,step:.5},{label:"Pen diameter mm",key:"pen",min:.1,max:2,step:.05},
{label:"Ink alpha",key:"alpha",min:.01,max:.9,step:.01},{label:"White threshold",key:"white",min:100,max:255,step:1},{label:"White margin mm",key:"margin",min:0,max:1,step:.02},{label:"Curve candidates",key:"candidates",min:4,max:64,step:1},
{label:"Curve step mm",key:"step",min:.4,max:12,step:.2},{label:"Max bend degrees",key:"bend",min:5,max:85,step:1},{label:"Curves per stroke",key:"chain",min:2,max:400,step:1},{label:"Max strokes",key:"maxStrokes",min:10,max:100000,step:10},
{label:"Target MSE",key:"target",min:0,max:.2,step:.001},{label:"Min progress / 30 %",key:"minProgress",min:.01,max:20,step:.05},{label:"Safe Z mm",key:"safeZ",min:.1,max:30,step:.1},{label:"Draw Z mm",key:"drawZ",min:-10,max:10,step:.01},{label:"Feed XY",key:"feed",min:50,max:10000,step:10},{label:"Feed Z",key:"feedZ",min:20,max:3000,step:10}];
export class MatitaCalligraficaGcodeToolNode extends GcodeMatitaSuperNode{
  size:[number,number]=[300,700];widgets_start_y=0;preview:GraphImage|null=null;result:CalligraphyResult|null=null;status="waiting image";private signature="";private generation=0;private job:ReturnType<typeof startCalligraphyWorker>|null=null;
  constructor(){super();const node=this as unknown as CalligraphyNode;node.title=createToolTitle("GCode/Matita Calligrafica");node.properties={...calligraphyDefaults};node.addInput("image","image");node.addOutput("gcode","gcode");node.addOutput("svg","svg");
    for(const control of controls)node.addWidget("number",control.label,calligraphyDefaults[control.key],value=>{const n=Number(value);if(Number.isFinite(n)){node.properties[control.key]=Math.max(control.min,Math.min(control.max,["white","candidates","bend","chain","maxStrokes"].includes(control.key)?Math.round(n):n));notifyGraphStateChange(node);}},{min:control.min,max:control.max,step:control.step,precision:control.step<.01?4:control.step<1?2:0});
    node.refreshPreviewLayout=()=>node.updateMatitaLayout(node.preview);node.refreshPreviewLayout();
  }
  onExecute(this:CalligraphyNode){const image=this.getInputData(0);if(!isGraphImageReady(image)){this.generation++;this.job?.cancel();this.job=null;this.signature="";this.result=null;this.preview=null;this.status="waiting image";this.setOutputData(0,null);this.setOutputData(1,null);this.refreshPreviewLayout();return;}
    const options={...calligraphyDefaults,...this.properties} as CalligraphyOptions,signature=`${getGraphImageSignature(image)}:${JSON.stringify(options)}`;if(signature===this.signature){this.setOutputData(0,this.result?.gcode??null);this.setOutputData(1,this.result?.svg??null);return;}
    this.signature=signature;this.generation++;const current=this.generation;this.job?.cancel();this.job=null;this.result=null;this.preview=null;this.resetConvergence();this.setOutputData(0,null);this.setOutputData(1,null);
    try{validateCalligraphyOptions(options);const job=startCalligraphyWorker(prepareCalligraphyRaster(image,options),(strokes,curves,mse,bitmap)=>{if(current!==this.generation){bitmap.close();return;}this.recordConvergence(strokes,mse);this.setPreview(bitmap,image);this.status=`${strokes} strokes · ${curves} curves · MSE ${mse.toFixed(5)}`;});this.job=job;this.status="generating";
      job.promise.then(result=>{if(current!==this.generation){result.preview.close();return;}this.setPreview(result.preview,image);this.result=result;this.job=null;this.status=`${result.strokes} strokes · ${result.curves} curves · MSE ${result.mse.toFixed(5)} · ${result.reason}`;this.setOutputData(0,result.gcode);this.setOutputData(1,result.svg);this.refreshPreviewLayout();}).catch(error=>{if(current!==this.generation)return;this.job=null;this.status=error instanceof Error?error.message:"Errore generazione";this.setOutputData(0,null);this.setOutputData(1,null);this.refreshPreviewLayout();});
    }catch(error){this.status=error instanceof Error?error.message:"Errore generazione";}this.refreshPreviewLayout();
  }
  private setPreview(bitmap:ImageBitmap,image:GraphImage){const node=this as unknown as CalligraphyNode,first=!this.preview;this.preview=copyGcodePreview(bitmap,image,this.preview);if(first)node.refreshPreviewLayout();else node.setDirtyCanvas(true,true);}
  onRemoved(this:CalligraphyNode){this.generation++;this.job?.cancel();this.job=null;}
  onDrawBackground(this:CalligraphyNode,context:CanvasRenderingContext2D){this.drawMatitaChrome(context,this.preview,this.status,Number(this.properties.target??calligraphyDefaults.target),this.result?`${this.result.strokes} strokes · ${this.result.curves} curves`:undefined);}
}
