import type { GraphImage } from "../../../../../models/graphImage";
import type { PreviewAwareNode } from "../../../shared";
import { createToolTitle,getGraphImageSignature,isGraphImageReady,notifyGraphStateChange } from "../../shared";
import { copyGcodePreview } from "../shared/copyPreview";
import { getGcodePreviewAboveWidgetsLayout } from "../shared/previewLayout";
import { microDefaults,validateMicroOptions,type MicroKind,type MicroOptions,type MicroResult } from "./model";
import { prepareMicroRaster } from "./raster";
import { startMicroWorker } from "./workerClient";
import { GcodeMatitaSuperNode } from "../shared/matitaSuperNode";
type MicroNode=PreviewAwareNode & MicroGcodeToolNode;
const controls:{label:string;key:keyof MicroOptions;min:number;max:number;step:number}[]=[
{label:"Width mm",key:"widthMm",min:30,max:400,step:1},{label:"Height mm",key:"heightMm",min:30,max:400,step:1},{label:"Resolution px/mm",key:"ppm",min:1,max:8,step:.5},{label:"Pen diameter mm",key:"pen",min:.1,max:2,step:.05},
{label:"Ink alpha",key:"alpha",min:.01,max:.9,step:.01},{label:"White threshold",key:"white",min:100,max:255,step:1},{label:"White margin mm",key:"margin",min:0,max:1,step:.02},{label:"Min spacing mm",key:"spacing",min:0,max:3,step:.02},
{label:"Max stroke length mm",key:"maxLen",min:.3,max:30,step:.1},{label:"Min stroke length mm",key:"minLen",min:.2,max:20,step:.05},{label:"Max bend degrees",key:"bend",min:0,max:85,step:1},{label:"Locality priority",key:"locality",min:0,max:10,step:.5},
{label:"Max strokes",key:"maxStrokes",min:10,max:1000000,step:100},{label:"Candidates",key:"candidates",min:4,max:100,step:1},{label:"Target MSE",key:"target",min:0,max:.2,step:.001},{label:"Max failed searches",key:"failMax",min:50,max:100000,step:50},
{label:"Safe Z mm",key:"safeZ",min:.1,max:30,step:.1},{label:"Draw Z mm",key:"drawZ",min:-10,max:10,step:.01},{label:"Feed XY",key:"feed",min:50,max:10000,step:10},{label:"Feed Z",key:"feedZ",min:20,max:3000,step:10}];
export class MicroGcodeToolNode extends GcodeMatitaSuperNode{
  size:[number,number]=[300,740];widgets_start_y=0;preview:GraphImage|null=null;result:MicroResult|null=null;status="waiting image";private signature="";private generation=0;private job:ReturnType<typeof startMicroWorker>|null=null;
  constructor(private readonly kind:MicroKind){super();const node=this as unknown as MicroNode;node.title=createToolTitle(kind==="turbo"?"GCode/Microtratti Turbo":"GCode/Microtratti Veloce");node.properties={...microDefaults,candidates:kind==="turbo"?10:12};node.addInput("image","image");node.addOutput("gcode","gcode");node.addOutput("svg","svg");
    for(const control of controls)node.addWidget("number",control.label,node.properties[control.key],value=>{const n=Number(value);if(Number.isFinite(n)){node.properties[control.key]=Math.max(control.min,Math.min(control.max,["white","bend","maxStrokes","candidates","failMax"].includes(control.key)?Math.round(n):n));notifyGraphStateChange(node);}},{min:control.min,max:control.max,step:control.step,precision:control.step<.01?4:control.step<1?2:0});
    node.refreshPreviewLayout=()=>node.updateMatitaLayout(node.preview);node.refreshPreviewLayout();
  }
  onExecute(this:MicroNode){const image=this.getInputData(0);if(!isGraphImageReady(image)){this.generation++;this.job?.cancel();this.job=null;this.signature="";this.result=null;this.preview=null;this.status="waiting image";this.setOutputData(0,null);this.setOutputData(1,null);this.refreshPreviewLayout();return;}
    const options={...microDefaults,...this.properties} as MicroOptions,signature=`${getGraphImageSignature(image)}:${this.kind}:${JSON.stringify(options)}`;if(signature===this.signature){this.setOutputData(0,this.result?.gcode??null);this.setOutputData(1,this.result?.svg??null);return;}
    this.signature=signature;this.generation++;const current=this.generation;this.job?.cancel();this.job=null;this.result=null;this.preview=null;this.resetConvergence();this.setOutputData(0,null);this.setOutputData(1,null);
    try{validateMicroOptions(options);const job=startMicroWorker(prepareMicroRaster(image,this.kind,options),(strokes,mse,bitmap)=>{if(current!==this.generation){bitmap.close();return;}this.recordConvergence(strokes,mse);const first=!this.preview;this.preview=copyGcodePreview(bitmap,image,this.preview);this.status=`${strokes} microtratti · MSE ${mse.toFixed(5)}`;if(first)this.refreshPreviewLayout();else this.setDirtyCanvas(true,true);});this.job=job;this.status="generating";
      job.promise.then(result=>{if(current!==this.generation){result.preview.close();return;}this.preview=copyGcodePreview(result.preview,image,this.preview);this.result=result;this.job=null;this.status=`${result.strokes} microtratti · MSE ${result.mse.toFixed(5)} · ${result.reason}`;this.setOutputData(0,result.gcode);this.setOutputData(1,result.svg);this.refreshPreviewLayout();}).catch(error=>{if(current!==this.generation)return;this.job=null;this.status=error instanceof Error?error.message:"Errore Microtratti";this.setOutputData(0,null);this.setOutputData(1,null);this.refreshPreviewLayout();});
    }catch(error){this.status=error instanceof Error?error.message:"Errore Microtratti";}this.refreshPreviewLayout();
  }
  onRemoved(this:MicroNode){this.generation++;this.job?.cancel();this.job=null;}
  onDrawBackground(this:MicroNode,context:CanvasRenderingContext2D){this.drawMatitaChrome(context,this.preview,this.status,Number(this.properties.target??microDefaults.target),this.result?`${this.result.strokes} microtratti`:undefined);}
}
export class MicrotrattiVeloceGcodeToolNode extends MicroGcodeToolNode{constructor(){super("veloce");}}
export class MicrotrattiTurboGcodeToolNode extends MicroGcodeToolNode{constructor(){super("turbo");}}
