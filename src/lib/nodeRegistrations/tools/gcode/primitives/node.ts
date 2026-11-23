import { copyGcodePreview } from "../shared/copyPreview";
import type { GraphImage } from "../../../../../models/graphImage";
import type { PreviewAwareNode } from "../../../shared";
import { createToolTitle, getGraphImageSignature, isGraphImageReady, notifyGraphStateChange } from "../../shared";
import { getGcodePreviewAboveWidgetsLayout } from "../shared/previewLayout";
import { primitiveDefaults, validatePrimitiveOptions, type PrimitiveKind, type PrimitiveOptions, type PrimitiveResult } from "./model";
import { preparePrimitiveRaster } from "./raster";
import { startPrimitiveWorker } from "./workerClient";
import { GcodeMatitaSuperNode } from "../shared/matitaSuperNode";

type PrimitiveNode=PreviewAwareNode & PrimitiveGcodeToolNode;
const controls:{label:string;key:keyof PrimitiveOptions;min:number;max:number;step:number}[]=[
  {label:"Width mm",key:"sheetWidth",min:30,max:400,step:1},{label:"Height mm",key:"sheetHeight",min:30,max:400,step:1},{label:"Resolution px/mm",key:"resolution",min:1,max:8,step:.5},
  {label:"Pen diameter mm",key:"penDiameter",min:.1,max:2,step:.1},{label:"Ink alpha",key:"alpha",min:.02,max:.95,step:.01},{label:"White threshold",key:"white",min:100,max:255,step:1},{label:"White margin mm",key:"whiteMargin",min:0,max:1,step:.01},
  {label:"Max shapes",key:"maxShapes",min:100,max:200000,step:100},{label:"Min size mm",key:"minSize",min:.2,max:10,step:.1},{label:"Max size mm",key:"maxSize",min:1,max:60,step:.5},{label:"Candidates",key:"samples",min:10,max:1000,step:10},
  {label:"Target MSE",key:"targetMse",min:0,max:.2,step:.001},{label:"Plateau window",key:"plateauWindow",min:10,max:500,step:1},{label:"Min progress %",key:"minProgressPercent",min:.01,max:20,step:.01},
  {label:"Safe Z mm",key:"safeZ",min:.1,max:30,step:.1},{label:"Draw Z mm",key:"drawZ",min:-10,max:10,step:.01},{label:"Feed XY",key:"feed",min:50,max:10000,step:10},{label:"Feed Z",key:"feedZ",min:20,max:3000,step:10},
];
export class PrimitiveGcodeToolNode extends GcodeMatitaSuperNode{
  size:[number,number]=[300,700];widgets_start_y=0;preview:GraphImage|null=null;result:PrimitiveResult|null=null;status="waiting image";
  private signature="";private generation=0;private job:ReturnType<typeof startPrimitiveWorker>|null=null;
  constructor(private readonly kind:PrimitiveKind){
    super();
    const node=this as unknown as PrimitiveNode;node.title=createToolTitle(kind==="rectangle"?"GCode/Matita Rettangoli":"GCode/Matita Cerchi");node.properties={...primitiveDefaults};
    node.addInput("image","image");node.addOutput("gcode","gcode");node.addOutput("svg","svg");
    for(const control of controls)node.addWidget("number",control.label,primitiveDefaults[control.key],value=>{const number=Number(value);if(Number.isFinite(number)){node.properties[control.key]=Math.max(control.min,Math.min(control.max,["white","maxShapes","samples","plateauWindow"].includes(control.key)?Math.round(number):number));notifyGraphStateChange(node);}},{min:control.min,max:control.max,step:control.step,precision:control.step<.01?4:control.step<1?2:0});
    node.refreshPreviewLayout=()=>node.updateMatitaLayout(node.preview);node.refreshPreviewLayout();
  }
  onExecute(this:PrimitiveNode){
    const image=this.getInputData(0);if(!isGraphImageReady(image)){this.generation++;this.job?.cancel();this.job=null;this.signature="";this.result=null;this.preview=null;this.status="waiting image";this.setOutputData(0,null);this.setOutputData(1,null);this.refreshPreviewLayout();return;}
    const options={...primitiveDefaults,...this.properties} as PrimitiveOptions,signature=`${getGraphImageSignature(image)}:${this.kind}:${JSON.stringify(options)}`;
    if(signature===this.signature){this.setOutputData(0,this.result?.gcode??null);this.setOutputData(1,this.result?.svg??null);return;}
    this.signature=signature;this.generation++;const current=this.generation;this.job?.cancel();this.job=null;this.result=null;this.preview=null;this.resetConvergence();this.setOutputData(0,null);this.setOutputData(1,null);
    try{validatePrimitiveOptions(options);const job=startPrimitiveWorker(preparePrimitiveRaster(image,this.kind,options),(shapes,mse,bitmap)=>{if(current!==this.generation){bitmap.close();return;}this.recordConvergence(shapes,mse);this.setPreview(bitmap,image);this.status=`${shapes} ${this.kind==="rectangle"?"rettangoli":"cerchi"} · MSE ${mse.toFixed(5)}`;});this.job=job;this.status="generating";
      job.promise.then(result=>{if(current!==this.generation){result.preview.close();return;}this.setPreview(result.preview,image);this.result=result;this.job=null;this.status=`${result.shapes} ${this.kind==="rectangle"?"rettangoli":"cerchi"} · MSE ${result.mse.toFixed(5)} · ${result.reason}`;this.setOutputData(0,result.gcode);this.setOutputData(1,result.svg);this.refreshPreviewLayout();}).catch(error=>{if(current!==this.generation)return;this.job=null;this.status=error instanceof Error?error.message:"Errore generazione";this.setOutputData(0,null);this.setOutputData(1,null);this.refreshPreviewLayout();});
    }catch(error){this.status=error instanceof Error?error.message:"Errore generazione";}this.refreshPreviewLayout();
  }
  private setPreview(bitmap:ImageBitmap,image:GraphImage){const node=this as unknown as PrimitiveNode,first=!this.preview;this.preview=copyGcodePreview(bitmap,image,this.preview);if(first)node.refreshPreviewLayout();else node.setDirtyCanvas(true,true);}
  onRemoved(this:PrimitiveNode){this.generation++;this.job?.cancel();this.job=null;}
  onDrawBackground(this:PrimitiveNode,context:CanvasRenderingContext2D){this.drawMatitaChrome(context,this.preview,this.status,Number(this.properties.targetMse??primitiveDefaults.targetMse),this.result?`${this.result.shapes} forme`:undefined);}
}
