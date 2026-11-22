import { drawImagePreview, resizeNodeForPreview } from "../../../../imageUtils";
import type { GraphImage } from "../../../../../models/graphImage";
import type { PreviewAwareNode } from "../../../shared";
import { createToolTitle, getGraphImageSignature, isGraphImageReady, notifyGraphStateChange } from "../../shared";
import { MAX_HATCH_LAYERS } from "./hatchLayers";
import { baseGcodeDefaults, type BaseGcodeOptions, type BaseGcodeResult, validateBaseGcodeOptions } from "./model";
import { prepareBaseGcodeRaster } from "./raster";
import { startBaseGcodeWorker } from "./workerClient";

type BaseNode = PreviewAwareNode & BaseGcodeToolNode;
const controls: { label: string; key: keyof BaseGcodeOptions; min: number; max: number; step: number }[] = [
  {label:"Width mm",key:"width",min:10,max:1000,step:1}, {label:"Height mm",key:"height",min:10,max:1000,step:1},
  {label:"Margin mm",key:"margin",min:0,max:100,step:0.5}, {label:"Resolution px/mm",key:"resolution",min:1,max:8,step:0.5},
  {label:"White threshold",key:"white",min:1,max:255,step:1}, {label:"White protect mm",key:"protect",min:0,max:2,step:0.05},
  {label:"Hatch step mm",key:"step",min:0.25,max:3,step:0.05}, {label:"Layers",key:"layers",min:1,max:MAX_HATCH_LAYERS,step:1},
  {label:"Angle deg",key:"angle",min:-180,max:180,step:1}, {label:"Min length mm",key:"minLength",min:0.1,max:10,step:0.05},
  {label:"Contour threshold",key:"contour",min:0.1,max:0.95,step:0.05},
  {label:"Safe Z mm",key:"safeZ",min:0.1,max:50,step:0.1}, {label:"Light Z mm",key:"lightZ",min:-5,max:0,step:0.01},
  {label:"Dark Z mm",key:"darkZ",min:-5,max:0,step:0.01}, {label:"Spring mm",key:"spring",min:0.1,max:20,step:0.1},
  {label:"Feed XY",key:"feed",min:50,max:10000,step:10}, {label:"Feed Z",key:"feedZ",min:20,max:5000,step:10},
  {label:"Z sample mm",key:"zStep",min:0.3,max:10,step:0.1}, {label:"Max paths",key:"maxPaths",min:100,max:200000,step:100},
];
export class BaseGcodeToolNode {
  size: [number, number] = [300, 680];
  status = "waiting image";
  result: BaseGcodeResult | null = null;
  preview: GraphImage | null = null;
  private signature = "";
  protected getOptions(properties: Record<string, unknown>): BaseGcodeOptions {
    return { ...baseGcodeDefaults, ...properties } as BaseGcodeOptions;
  }
  private cancelJob: (() => void) | null = null;
  private generation = 0;

  constructor() {
    const node = this as unknown as BaseNode;
    node.title = createToolTitle("GCode/Base");
    node.properties = { ...baseGcodeDefaults };
    node.addInput("image", "image"); node.addOutput("gcode", "gcode"); node.addOutput("image", "image"); node.addOutput("svg", "svg");
    for (const control of controls) node.addWidget("number",control.label,baseGcodeDefaults[control.key],value => {
      node.properties[control.key] = Math.max(control.min,Math.min(control.max,Number(value)));
      notifyGraphStateChange(node);
    },{min:control.min,max:control.max,step:control.step,precision:control.step<1?2:0});
    node.addWidget("toggle","Contours",baseGcodeDefaults.edges,value => { node.properties.edges=Boolean(value); notifyGraphStateChange(node); });
    node.refreshPreviewLayout = () => { resizeNodeForPreview(node,node.preview,{footerLines:2}); node.setDirtyCanvas(true,true); };
    node.refreshPreviewLayout();
  }
  private publishOutputs(this: BaseNode, gcode: string | null, image: GraphImage | null, svg: string | null) {
    this.setOutputData(0, gcode);
    this.setOutputData(1, image); this.setOutputData(2, svg);
  }
  onExecute(this: BaseNode) {
    const image = this.getInputData(0);
    if (!isGraphImageReady(image)) {
      this.generation++; this.cancelJob?.(); this.cancelJob=null; this.signature=""; this.result=null; this.preview=null; this.status="waiting image";
      this.publishOutputs(null,null,null); this.refreshPreviewLayout(); return;
    }
    const options = this.getOptions(this.properties);
    const signature = `${getGraphImageSignature(image)}:${JSON.stringify(options)}`;
    if (signature === this.signature) { this.publishOutputs(this.result?.gcode ?? null,this.preview,this.result?.svg ?? null); return; }
    this.signature=signature; this.generation++; const current=this.generation;
    this.cancelJob?.(); this.cancelJob=null; this.result=null; this.preview=null; this.publishOutputs(null,null,null);
    try {
      validateBaseGcodeOptions(options);
      const job=startBaseGcodeWorker(prepareBaseGcodeRaster(image,options));
      this.cancelJob=job.cancel; this.status="generating";
      job.promise.then(result => {
        if (current!==this.generation) { result.preview.close(); return; }
        const canvas=document.createElement("canvas"); canvas.width=result.preview.width; canvas.height=result.preview.height;
        const context=canvas.getContext("2d");
        if (!context) { result.preview.close(); throw Error("Canvas anteprima non disponibile"); }
        context.drawImage(result.preview,0,0); result.preview.close();
        this.preview=canvas; this.result=result; this.status=`${result.paths} paths / ${result.lines} lines`; this.cancelJob=null;
        this.publishOutputs(result.gcode,canvas,result.svg); this.refreshPreviewLayout();
      })
        .catch(error => { if (current!==this.generation) return; this.cancelJob=null; this.status=error instanceof Error?error.message:"G-code error"; this.publishOutputs(null,null,null); this.refreshPreviewLayout(); });
    } catch (error) { this.status=error instanceof Error?error.message:"G-code error"; }
    this.refreshPreviewLayout();
  }
  onRemoved(this: BaseNode) { this.generation++; this.cancelJob?.(); this.cancelJob=null; }
  onDrawBackground(this: BaseNode, context: CanvasRenderingContext2D) {
    const layout=drawImagePreview(context,this,this.preview,{footerLines:2});
    context.save(); context.fillStyle="#d9e7ed"; context.font="12px sans-serif";
    const y=layout.footerTop+12;
    context.fillText(this.status,10,y);
    if (this.result) context.fillText(`${this.result.drawMm.toFixed(1)} mm ink · ${this.result.travelMm.toFixed(1)} mm travel`,10,y+18);
    context.restore();
  }
}
