import type { PreviewAwareNode } from "../../../shared";
import { drawGcodeConvergenceChart, GcodeConvergenceSeries } from "./convergence";
import type { GraphImage } from "../../../../../models/graphImage";
import { getGcodePreviewAboveWidgetsLayout } from "./previewLayout";

/** Shared behavior for all image-to-GCode tracing nodes. */
export abstract class GcodeMatitaSuperNode {
  private readonly sharedConvergence = new GcodeConvergenceSeries();
  protected resetConvergence() { this.sharedConvergence.clear(); }
  protected recordConvergence(iteration:number,error:number,stage?:number) {
    this.sharedConvergence.add({iteration,error,stage});
    (this as unknown as PreviewAwareNode).setDirtyCanvas(true,true);
  }
  protected replaceConvergence(samples:readonly {iteration:number;error:number;stage?:number}[]) {
    this.sharedConvergence.clear();samples.forEach(sample=>this.sharedConvergence.add(sample));
  }
  protected drawConvergence(context:CanvasRenderingContext2D,x:number,y:number,width:number,target?:number) {
    drawGcodeConvergenceChart(context,this.sharedConvergence.values(),x,y,width,50,target);
  }
  updateMatitaLayout(preview:GraphImage|null) {
    const node=this as unknown as PreviewAwareNode&{widgets_start_y?:number};
    const layout=getGcodePreviewAboveWidgetsLayout(preview,node.widgets?.length??0);node.widgets_start_y=layout.widgetTop;node.size=layout.size;node.setDirtyCanvas(true,true);
  }
  drawMatitaChrome(context:CanvasRenderingContext2D,preview:GraphImage|null,status:string,target?:number,metrics?:string) {
    const node=this as unknown as PreviewAwareNode&{widgets_start_y?:number};
    const layout=getGcodePreviewAboveWidgetsLayout(preview,node.widgets?.length??0);node.widgets_start_y=layout.widgetTop;node.size=layout.size;
    context.save();context.fillStyle="#fff";context.fillRect(layout.padding,layout.top,layout.width,layout.height);
    if(preview)context.drawImage(preview,layout.padding,layout.top,layout.width,layout.height);
    context.fillStyle="rgba(255,255,255,.85)";context.fillRect(layout.padding,layout.top+layout.height-22,layout.width,22);context.fillStyle="#25313a";context.font="11px sans-serif";context.fillText(status,layout.padding+6,layout.top+layout.height-7,layout.width-12);
    this.drawConvergence(context,layout.padding,layout.chartTop,layout.width,target);
    context.fillStyle="#d9e7ed";context.font="12px sans-serif";context.fillText(status,layout.padding,layout.footerTop+12,layout.width);if(metrics)context.fillText(metrics,layout.padding,layout.footerTop+30,layout.width);context.restore();
  }
}
