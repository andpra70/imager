import { drawImagePreview, rasterizeGraphSvg } from "../../../../imageUtils";
import type { GraphImage } from "../../../../../models/graphImage";
import type { GraphSvg } from "../../../../../models/graphSvg";
import type { PreviewAwareNode } from "../../../shared";
import { clamp, createToolTitle, formatExecutionInfo, getGraphImageSignature, isGraphImageReady, notifyGraphStateChange, refreshNode } from "../../shared";
import type { ShodoOptions } from "./model";
import { generateShodo } from "./runtime";

export class ShodoToolNode {
  size: [number, number] = [290, 520];
  properties!: Record<string, unknown>;
  preview: GraphImage | null = null; svg: GraphSvg | null = null;
  status = "idle"; progress = 0; strokeCount = 0; outputWidth = 0; outputHeight = 0;
  isRendering = false; executionMs: number | null = null;
  lastSignature = ""; lastOptionsSignature = ""; renderToken = 0;

  constructor() {
    const node = this as unknown as PreviewAwareNode & ShodoToolNode;
    node.title = createToolTitle("Shodō Masterpiece");
    node.properties = { maxWidth: 900, fidelity: 0.82, brushSize: 7, contrast: 1.45, inkDensity: 1.8, dryBrush: 0.28, seed: 1 };
    node.addInput("image", "image"); node.addOutput("image", "image"); node.addOutput("svg", "svg");
    const slider = (label: string, key: keyof ShodoOptions, value: number, min: number, max: number, step: number) => node.addWidget("slider", label, value, (next) => { node.properties[key] = Number(next); notifyGraphStateChange(node); }, { min, max, step, precision: step < 1 ? (step < 0.1 ? 2 : 1) : 0 });
    slider("Max width", "maxWidth", 900, 128, 2400, 8); slider("Fidelity", "fidelity", 0.82, 0, 1, 0.01);
    slider("Brush size", "brushSize", 7, 2, 30, 1); slider("Contrast", "contrast", 1.45, 0.5, 3, 0.05);
    slider("Ink density", "inkDensity", 1.8, 0.3, 4, 0.1); slider("Dry brush", "dryBrush", 0.28, 0, 1, 0.01);
    slider("Seed", "seed", 1, 0, 999, 1);
    node.refreshPreviewLayout = () => refreshNode(node, node.preview, 4); node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & ShodoToolNode) {
    const value = this.getInputData(0); const input = isGraphImageReady(value) ? value : null;
    if (!input) { this.renderToken += 1; this.preview=null; this.svg=null; this.status="waiting valid image"; this.progress=0; this.strokeCount=0; this.isRendering=false; this.lastSignature=""; this.lastOptionsSignature=""; this.setOutputData(0,null); this.setOutputData(1,null); this.refreshPreviewLayout(); return; }
    const options: ShodoOptions = {
      maxWidth: clamp(Math.round(Number(this.properties.maxWidth ?? 900)),128,2400), fidelity: clamp(Number(this.properties.fidelity ?? 0.82),0,1),
      brushSize: clamp(Number(this.properties.brushSize ?? 7),2,30), contrast: clamp(Number(this.properties.contrast ?? 1.45),0.5,3),
      inkDensity: clamp(Number(this.properties.inkDensity ?? 1.8),0.3,4), dryBrush: clamp(Number(this.properties.dryBrush ?? 0.28),0,1), seed: clamp(Math.round(Number(this.properties.seed ?? 1)),0,999),
    };
    const signature=getGraphImageSignature(input), optionsSignature=JSON.stringify(options);
    if(signature!==this.lastSignature||optionsSignature!==this.lastOptionsSignature){ this.lastSignature=signature; this.lastOptionsSignature=optionsSignature; const token=++this.renderToken, startedAt=performance.now(); this.isRendering=true; this.progress=0; this.status="composing shodō";
      void generateShodo(input,options,()=>token!==this.renderToken,(progress,status)=>{if(token!==this.renderToken)return;this.progress=clamp(progress,0,1);if(status)this.status=status;this.setDirtyCanvas(true,true);})
        .then(async result=>{if(!result||token!==this.renderToken)return null;this.svg=result.svg;this.strokeCount=result.strokeCount;this.outputWidth=result.outputWidth;this.outputHeight=result.outputHeight;return rasterizeGraphSvg(result.svg);})
        .then(preview=>{if(!preview||token!==this.renderToken)return;this.preview=preview;this.progress=1;this.status="ready";this.executionMs=performance.now()-startedAt;this.isRendering=false;this.setDirtyCanvas(true,true);})
        .catch(error=>{if(token!==this.renderToken)return;this.preview=null;this.svg=null;this.status=error instanceof Error?error.message:"shodō error";this.isRendering=false;this.executionMs=null;this.setDirtyCanvas(true,true);});
    }
    this.setOutputData(0,this.preview); this.setOutputData(1,this.svg); this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & ShodoToolNode, context: CanvasRenderingContext2D) {
    const layout=drawImagePreview(context,this,this.preview,{footerLines:4}); context.save();context.fillStyle="rgba(255,255,255,0.7)";context.font="12px sans-serif";
    context.fillText(`${this.status}${this.isRendering?"...":""}`,10,layout.footerTop+12);context.fillText(`progress ${Math.round(this.progress*100)}% | strokes ${this.strokeCount}`,10,layout.footerTop+30);
    context.fillText(`out ${this.outputWidth||"-"}x${this.outputHeight||"-"} | fidelity ${Number(this.properties.fidelity??0.82).toFixed(2)}`,10,layout.footerTop+48);context.fillText(formatExecutionInfo(this.executionMs),10,layout.footerTop+66);context.restore();
  }
}

