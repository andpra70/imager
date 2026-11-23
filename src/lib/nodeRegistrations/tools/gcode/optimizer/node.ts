import type { GraphGcode } from "../../../../../models/graphGcode";
import { createToolTitle } from "../../shared";
import type { PreviewAwareNode } from "../../../shared";
import { gcodeOptimizerDefaults } from "./model";
import type { GcodeOptimizationMetrics, GcodeOptimizerOptions } from "./model";
import { startGcodeOptimizer } from "./workerClient";

interface OptimizerJob { promise: Promise<{ gcode: string; metrics: GcodeOptimizationMetrics }>; cancel: () => void }

function formatDistance(mm: number) { return mm >= 1000 ? `${(mm/1000).toFixed(2)} m` : `${mm.toFixed(1)} mm`; }

export class GcodeOptimizerToolNode {
  size: [number, number] = [360, 350];
  output: GraphGcode = "";
  metrics: GcodeOptimizationMetrics | null = null;
  signature = "";
  status = "collega un GCode";
  job: OptimizerJob | null = null;

  constructor() {
    const node=this as unknown as PreviewAwareNode&GcodeOptimizerToolNode;
    node.title=createToolTitle("GCode/Optimizer");node.properties={...gcodeOptimizerDefaults};
    node.addInput("gcode","gcode");node.addOutput("gcode","gcode");node.addOutput("metrics","object");
    node.addWidget("number","Simplify mm",gcodeOptimizerDefaults.simplify,value=>{node.properties.simplify=Math.max(0,Math.min(10,Number(value)||0));node.signature="";node.graph?.onGraphStateChange?.();},{min:0,max:10,step:0.01,precision:2});
    node.addWidget("toggle","Reverse paths",gcodeOptimizerDefaults.allowReverse,value=>{node.properties.allowReverse=Boolean(value);node.signature="";node.graph?.onGraphStateChange?.();});
    node.refreshPreviewLayout=()=>node.setDirtyCanvas(true,true);node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode&GcodeOptimizerToolNode) {
    const input=this.getInputData(0) as unknown;const gcode=typeof input==="string"?input:"";
    const options:GcodeOptimizerOptions={simplify:Math.max(0,Math.min(10,Number(this.properties.simplify)||0)),allowReverse:Boolean(this.properties.allowReverse)};
    const signature=`${gcode.length}:${gcode.slice(0,128)}:${gcode.slice(-128)}:${options.simplify}:${options.allowReverse}`;
    if(!gcode){this.job?.cancel();this.job=null;this.output="";this.metrics=null;this.signature="";this.status="collega un GCode";this.setOutputData(0,null);this.setOutputData(1,null);this.setDirtyCanvas(true,true);return;}
    if(signature!==this.signature){this.signature=signature;this.job?.cancel();this.output="";this.metrics=null;this.status="ottimizzazione…";const job=startGcodeOptimizer(gcode,options);this.job=job;job.promise.then(result=>{if(this.job!==job)return;this.job=null;this.output=result.gcode;this.metrics=result.metrics;this.status=`-${result.metrics.travelSavedPercent.toFixed(1)}% spostamenti · ${result.metrics.processingMs.toFixed(1)} ms`;this.setOutputData(0,this.output);this.setOutputData(1,this.metrics);this.setDirtyCanvas(true,true);}).catch(error=>{if(this.job!==job)return;this.job=null;this.status=error instanceof Error?error.message:"errore optimizer";this.setOutputData(0,null);this.setOutputData(1,null);this.setDirtyCanvas(true,true);});}
    this.setOutputData(0,this.output||null);this.setOutputData(1,this.metrics);
  }

  onRemoved(this:GcodeOptimizerToolNode){this.job?.cancel();this.job=null;}

  onDrawBackground(this:PreviewAwareNode&GcodeOptimizerToolNode,context:CanvasRenderingContext2D){
    const top=34+(this.widgets?.length??0)*28,padding=12;this.size=[360,Math.max(300,top+230)];const m=this.metrics;
    const lines=m?[`Tool                         ${m.tools}`,`Percorsi              ${m.pathsBefore} → ${m.pathsAfter}`,`Segmenti              ${m.segmentsBefore} → ${m.segmentsAfter}`,`Segmenti rimossi               ${m.pointsRemoved}`,`Tracciatura     ${formatDistance(m.drawMmBefore)} → ${formatDistance(m.drawMmAfter)}`,`Penna sollevata ${formatDistance(m.travelMmBefore)} → ${formatDistance(m.travelMmAfter)}`,`Risparmio spostamenti  ${formatDistance(m.travelSavedMm)}`,`Riduzione spostamenti          ${m.travelSavedPercent.toFixed(1)}%`,`Tempo elaborazione             ${m.processingMs.toFixed(1)} ms`]:[this.status,"Ottimizza per tool e endpoint più vicino.","I percorsi lineari possono essere invertiti.","Gli archi sono preservati senza inversione."];
    context.save();context.fillStyle="#101313";context.fillRect(padding,top,this.size[0]-padding*2,this.size[1]-top-padding);context.fillStyle="#f2a65a";context.font="600 11px sans-serif";context.fillText(this.status,padding+10,top+20);context.fillStyle="rgba(255,255,255,.88)";context.font="10px monospace";lines.forEach((line,index)=>context.fillText(line,padding+10,top+44+index*18));context.restore();
  }
}
