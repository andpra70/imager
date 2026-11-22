import { MatitaEngine, type Candidate } from "../matita/engine";
import type { MatitaRequest, MatitaResult } from "../matita/model";
import { exportMatita } from "../matita/export";
import { renderMatitaPreview } from "../matita/preview";
import type { Point } from "../matita/geometry";
import { type MatitaSplineOptions, validateMatitaSplineOptions } from "./model";

function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const q=1-t,q2=q*q,t2=t*t;
  return {x:q2*q*p0.x+3*q2*t*p1.x+3*q*t2*p2.x+t2*t*p3.x,y:q2*q*p0.y+3*q2*t*p1.y+3*q*t2*p2.y+t2*t*p3.y};
}
export class MatitaSplineEngine extends MatitaEngine {
  constructor(request: MatitaRequest<MatitaSplineOptions>) {
    validateMatitaSplineOptions(request.options);
    super(request);
  }
  protected safeAt(x:number,y:number) {
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.ceil(x),y1=Math.ceil(y),w=this.w,h=this.h;
    if(x0<0||y0<0||x1>=w||y1>=h)return false;
    return Boolean(this.valid[y0*w+x0]&&this.valid[y0*w+x1]&&this.valid[y1*w+x0]&&this.valid[y1*w+x1]);
  }
  private splinePath(x:number,y:number,angle:number,turn:number,length:number,bend:number,step:number):Point[] {
    const p0={x,y},p3={x:x+Math.cos(angle+turn*.5)*length,y:y+Math.sin(angle+turn*.5)*length};
    const handle=length*.34,side={x:-Math.sin(angle),y:Math.cos(angle)};
    const p1={x:x+Math.cos(angle)*handle+side.x*bend,y:y+Math.sin(angle)*handle+side.y*bend};
    const endAngle=angle+turn;
    const p2={x:p3.x-Math.cos(endAngle)*handle-side.x*bend*.35,y:p3.y-Math.sin(endAngle)*handle-side.y*bend*.35};
    const count=Math.max(3,Math.ceil((length+Math.abs(bend)*3)/Math.min(.25,step)));
    const points:Point[]=[p0];if(!this.safeAt(x,y))return points;
    for(let j=1;j<=count;j++){
      const p=cubicBezier(p0,p1,p2,p3,j/count),previous=points[points.length-1];
      if(!this.safeSegment(previous,p))break;
      points.push(p);
    }
    return points;
  }
  protected chooseNext(x:number,y:number,angle:number,first:boolean,fixedPower:number|null=null):Candidate|null {
    const c=this.c as MatitaSplineOptions,ppm=c.ppm;
    const horizon=Math.max(1.2,c.horizon*ppm*(this.stage===0?1.1:this.stage===1?.75:.45));
    const preferred=this.angleAt(x,y),angles:number[]=[];
    if(first)for(let k=0;k<c.candidates;k++)angles.push(preferred+2*Math.PI*k/c.candidates);
    else{for(let k=0;k<c.candidates;k++)angles.push(angle+((k/(c.candidates-1))-.5)*1.1);angles.push(preferred);}
    const turns=first?[-.5,0,.5]:[-.55,0,.55],powers=fixedPower===null?[.35,.7,1]:[fixedPower];
    const bendMax=c.bend*ppm;
    let best:Candidate|null=null;
    for(const a of angles)for(const turn of turns)for(const bend of [-bendMax,0,bendMax]){
      const path=this.splinePath(x,y,a,turn,horizon,bend,Math.min(.25,c.step*ppm));
      if(path.length<3)continue;
      let traveled=0;for(let i=1;i<path.length;i++)traveled+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);
      if(traveled<Math.min(horizon*.22,2))continue;
      for(const power of powers){
        const opacity=c.alpha*(.45+.55*power),evaluation=this.evaluate(path,opacity);
        const change=first?0:Math.abs(Math.atan2(Math.sin(a-angle),Math.cos(a-angle)));
        const score=evaluation.gain/(evaluation.length+3)-change*.002-Math.abs(turn)*.0001;
        if(score>(best?.score??0)){
          const end=path[path.length-1],previous=path[path.length-2];
          best={score,evaluation,points:path,angle:Math.atan2(end.y-previous.y,end.x-previous.x),power,opacity};
        }
      }
    }
    return best;
  }
  protected renderPreview():ImageBitmap { return renderMatitaPreview(this.draw,this.w,this.h); }
  protected exportResult(reason:string):MatitaResult {
    return exportMatita(this.paths,this.draw,this.w,this.h,this.c,this.safeSegment,this.fullError(),this.totalLength,reason,{
      tolerance:Math.min(.08*this.c.ppm,.25),safetyStep:.12,
      header:"; IEDD 4 spline Bezier - GRBL, coordinate mm, origine in basso a sinistra",
    });
  }
}
