import type { MatitaOptions, MatitaRequest, MatitaResult } from "./model";
import { validateMatitaOptions } from "./model";
import { blur, clamp, type Point, type Stroke } from "./geometry";
import { exportMatita } from "./export";
import { renderMatitaPreview } from "./preview";

export interface Evaluation { gain: number; length: number; overlay: Map<number, number> }
export interface Candidate { score: number; evaluation: Evaluation; points: Point[]; angle: number; power: number; opacity: number }

export class MatitaEngine {
  protected readonly w: number; protected readonly h: number; protected readonly c: MatitaOptions;
  private readonly target: Float32Array; protected readonly valid: Uint8Array; private readonly forbidden: Uint8Array;
  private readonly guides: Float32Array[]; private readonly detailWeight: Float32Array;
  protected readonly draw: Float32Array; private readonly tiles: Float64Array;
  private readonly tilesX: number; private readonly tilesY: number;
  protected paths: Stroke[] = []; protected stage = 0; private failed = 0; private iteration = 0;
  private stopLastCheck = 0; private stopPreviousError: number; private stopPrevRate: number | null = null;
  private stopLowCount = 0; private stallWindows = 0; private seed = 0x12345678;
  protected totalLength = 0;

  constructor({ width, height, pixels, options }: MatitaRequest) {
    validateMatitaOptions(options);
    if (width < 2 || height < 2 || width * height > 1_400_000 || pixels.length !== width * height * 4) throw Error("Raster non valido");
    this.w = width; this.h = height; this.c = options;
    const n = width * height;
    this.target = new Float32Array(n); this.valid = new Uint8Array(n); this.forbidden = new Uint8Array(n);
    this.draw = new Float32Array(n); this.detailWeight = new Float32Array(n);
    for (let i = 0; i < n; i++) this.target[i] = clamp(1 - (0.2126 * pixels[4*i] + 0.7152 * pixels[4*i+1] + 0.0722 * pixels[4*i+2]) / 255, 0, 1);
    this.buildProtection();
    const blur1 = blur(this.target,width,height,Math.max(1,Math.round(options.ppm*.35)));
    const blur2 = blur(this.target,width,height,Math.max(1,Math.round(options.ppm*.85)));
    const guide0 = new Float32Array(n), guide1 = new Float32Array(n);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y*width+x, original = this.target[i];
      guide0[i] = .55*original+.45*blur2[i]; guide1[i] = .82*original+.18*blur1[i];
      const xm=Math.max(0,x-1),xp=Math.min(width-1,x+1),ym=Math.max(0,y-1),yp=Math.min(height-1,y+1);
      const gx=this.target[y*width+xp]-this.target[y*width+xm],gy=this.target[yp*width+x]-this.target[ym*width+x];
      this.detailWeight[i]=1+Math.min(5,7*Math.hypot(gx,gy));
    }
    this.guides=[guide0,guide1,this.target];
    this.tilesX=Math.ceil(width/16); this.tilesY=Math.ceil(height/16);
    this.tiles=new Float64Array(this.tilesX*this.tilesY);
    this.rebuildTiles(); this.stopPreviousError=this.fullError();
  }
  get strokes() { return this.paths.length; }
  get currentStage() { return this.stage; }
  get mse() { return this.fullError(); }
  private random() { this.seed ^= this.seed << 13; this.seed ^= this.seed >>> 17; this.seed ^= this.seed << 5; return (this.seed >>> 0) / 4294967296; }
  private buildProtection() {
    const threshold=(255-this.c.white)/255;
    for(let i=0;i<this.target.length;i++) this.forbidden[i]=this.target[i]<=threshold?1:0;
    const radius=(this.c.diameter*.5+this.c.margin)*this.c.ppm, offsets: Point[]=[];
    const r=Math.ceil(radius+.75);
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(Math.hypot(dx,dy)<=radius+.55)offsets.push({x:dx,y:dy});
    for(let y=0;y<this.h;y++)for(let x=0;x<this.w;x++){
      let good=true;
      for(const p of offsets){const xx=x+p.x,yy=y+p.y;if(xx<0||yy<0||xx>=this.w||yy>=this.h||this.forbidden[yy*this.w+xx]){good=false;break;}}
      this.valid[y*this.w+x]=good?1:0;
    }
  }
  protected safeAt(x:number,y:number){const ix=Math.round(x),iy=Math.round(y);return ix>=0&&iy>=0&&ix<this.w&&iy<this.h&&this.valid[iy*this.w+ix]===1;}
  safeSegment=(a:Point,b:Point)=>{const d=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(d/.3));for(let k=0;k<=n;k++){const f=k/n;if(!this.safeAt(a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f))return false;}return true;};
  private pixelLoss(t:number,d:number){const e=t-d;return e>=0?e*e:this.c.over*e*e;}
  protected fullError(){let sum=0;for(let i=0;i<this.target.length;i++)sum+=this.pixelLoss(this.target[i],this.draw[i]);return sum/this.target.length;}
  private rebuildTiles(){this.tiles.fill(0);const t=this.guides[this.stage];for(let y=0;y<this.h;y++)for(let x=0;x<this.w;x++){const i=y*this.w+x,deficit=this.valid[i]?Math.max(0,t[i]-this.draw[i]):0;this.tiles[(y>>4)*this.tilesX+(x>>4)]+=deficit*deficit*this.detailWeight[i];}}
  private refreshTile(tx:number,ty:number){if(tx<0||ty<0||tx>=this.tilesX||ty>=this.tilesY)return;let sum=0;const t=this.guides[this.stage];for(let y=ty*16;y<Math.min(this.h,ty*16+16);y++)for(let x=tx*16;x<Math.min(this.w,tx*16+16);x++){const i=y*this.w+x,def=this.valid[i]?Math.max(0,t[i]-this.draw[i]):0;sum+=def*def*this.detailWeight[i];}this.tiles[ty*this.tilesX+tx]=sum;}
  private targetAt(x:number,y:number){const ix=clamp(Math.round(x),0,this.w-1),iy=clamp(Math.round(y),0,this.h-1);return this.guides[this.stage][iy*this.w+ix];}
  protected angleAt(x:number,y:number){const gx=this.targetAt(x+2,y)-this.targetAt(x-2,y),gy=this.targetAt(x,y+2)-this.targetAt(x,y-2);return Math.atan2(gy,gx)+Math.PI/2;}
  private selectSeed():Point|null{
    const order:number[]=[];for(let i=0;i<this.tiles.length;i++)if(this.tiles[i]>.001)order.push(i);
    if(!order.length)return null;order.sort((a,b)=>this.tiles[b]-this.tiles[a]);
    let best:Point|null=null,score=-1;
    const previous=this.paths.length?this.paths[this.paths.length-1].points[this.paths[this.paths.length-1].points.length-1]:null,t=this.guides[this.stage];
    for(let j=0;j<Math.min(order.length,18);j++){
      const id=order[j],tx=id%this.tilesX,ty=Math.floor(id/this.tilesX);
      for(let k=0;k<18;k++){
        const x=tx*16+this.random()*16,y=ty*16+this.random()*16,ix=x|0,iy=y|0;
        if(ix>=this.w||iy>=this.h||!this.safeAt(x,y))continue;
        const p=iy*this.w+ix,def=Math.max(0,t[p]-this.draw[p]);
        const dist=previous?Math.hypot(previous.x-x,previous.y-y):0;
        const candidate=def*def*this.detailWeight[p]/(1+dist*.003)+this.tiles[id]*.001;
        if(candidate>score){score=candidate;best={x,y};}
      }
    }
    return score>.0002?best:null;
  }
  private strokePixels(x:number,y:number,r:number,callback:(i:number,coverage:number)=>void){
    const x0=Math.max(0,Math.floor(x-r-1)),x1=Math.min(this.w-1,Math.ceil(x+r+1)),y0=Math.max(0,Math.floor(y-r-1)),y1=Math.min(this.h-1,Math.ceil(y+r+1));
    for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){
      const dist=Math.hypot(xx-x,yy-y);if(dist>r+.5)continue;
      const coverage=clamp((r+.5-dist)/Math.max(.5,r),0,1);
      if(coverage>.001)callback(yy*this.w+xx,coverage);
    }
  }
  private candidatePath(x:number,y:number,angle:number,curvature:number,length:number,step:number):Point[]{
    const points:Point[]=[{x,y}],n=Math.max(2,Math.ceil(length/step)),ds=length/n;
    for(let j=1;j<=n;j++){
      const a=angle+curvature*(j-.5)*ds,old=points[points.length-1],next={x:old.x+Math.cos(a)*ds,y:old.y+Math.sin(a)*ds};
      if(next.x<1||next.y<1||next.x>=this.w-1||next.y>=this.h-1||!this.safeSegment(old,next))break;
      points.push(next);
    }
    return points;
  }
  protected evaluate(points:Point[],opacity:number):Evaluation{
    const empty={gain:-Infinity,length:0,overlay:new Map<number,number>()};
    if(points.length<2)return empty;
    for(let j=1;j<points.length;j++)if(!this.safeSegment(points[j-1],points[j]))return empty;
    const touched=new Map<number,number>(),radius=this.c.diameter*this.c.ppm*.5;
    let length=0;
    for(let j=1;j<points.length;j++){
      const a=points[j-1],b=points[j],len=Math.hypot(b.x-a.x,b.y-a.y);length+=len;
      const n=Math.max(1,Math.ceil(len/Math.max(.35,radius*.5)));
      for(let k=1;k<=n;k++){
        const f=k/n,x=a.x+(b.x-a.x)*f,y=a.y+(b.y-a.y)*f;
        this.strokePixels(x,y,radius,(i,coverage)=>{
          if(this.forbidden[i])return;
          const old=touched.get(i)??this.draw[i];
          touched.set(i,old+(1-old)*opacity*coverage/n*2);
        });
      }
    }
    let gain=0;
    for(const [i,value] of touched)gain+=(this.pixelLoss(this.target[i],this.draw[i])-this.pixelLoss(this.target[i],clamp(value,0,1)))*this.detailWeight[i];
    return {gain,length,overlay:touched};
  }
  private applyOverlay(overlay:Map<number,number>){
    const touched=new Set<number>();
    for(const [i,value] of overlay){this.draw[i]=clamp(value,0,1);const x=i%this.w,y=Math.floor(i/this.w);touched.add((y>>4)*this.tilesX+(x>>4));}
    for(const id of touched)this.refreshTile(id%this.tilesX,Math.floor(id/this.tilesX));
  }
  protected chooseNext(x:number,y:number,angle:number,first:boolean,fixedPower:number|null=null):Candidate|null{
    const c=this.c,base=Math.max(1.5,c.horizon*c.ppm*(this.stage===0?1.3:this.stage===1?.9:.6));
    const preferred=this.angleAt(x,y),angles:number[]=[];
    if(first)for(let k=0;k<c.candidates;k++)angles.push(preferred+k/c.candidates*Math.PI*2);
    else{for(let k=0;k<c.candidates;k++)angles.push(angle+((k/(c.candidates-1))-.5)*1.6);angles.push(preferred,preferred+Math.PI);}
    const curvatures=first?[0,-.012,.012]:[0,-.007,.007],powers=fixedPower===null?[.35,.7,1]:[fixedPower];
    let best:Candidate|null=null;
    for(const a of angles)for(const curve of curvatures){
      const points=this.candidatePath(x,y,a,curve,base,c.step*c.ppm);
      if(points.length<2)continue;
      for(const power of powers){
        const opacity=c.alpha*(.45+.55*power),evaluation=this.evaluate(points,opacity);
        const penalty=first?0:Math.abs(Math.atan2(Math.sin(a-angle),Math.cos(a-angle)))*.002;
        const score=evaluation.gain/(evaluation.length+3)-penalty;
        if(score>(best?.score??0))best={score,evaluation,points,angle:a+curve*evaluation.length,power,opacity};
      }
    }
    return best;
  }
  private nextStroke(onUpdate:()=>void){
    const seed=this.selectSeed();if(!seed)return false;
    const first=this.chooseNext(seed.x,seed.y,0,true);
    if(!first||first.evaluation.gain<=.00002){this.failed++;const id=((seed.y|0)>>4)*this.tilesX+((seed.x|0)>>4);this.tiles[id]*=.5;return this.failed<250;}
    this.failed=0;const points=[...first.points];let previous=first,length=first.evaluation.length;
    this.applyOverlay(first.evaluation.overlay);onUpdate();
    const extensions=this.c.mode==="fast"?8:this.c.mode==="fine"?20:13;
    for(let j=0;j<extensions;j++){
      const last=points[points.length-1],candidate=this.chooseNext(last.x,last.y,previous.angle,false,first.power);
      if(!candidate||candidate.evaluation.gain<=.00002||candidate.score<first.score*.05)break;
      points.push(...candidate.points.slice(1));this.applyOverlay(candidate.evaluation.overlay);onUpdate();
      length+=candidate.evaluation.length;previous=candidate;if(points.length>600)break;
    }
    this.paths.push({points,power:first.power,opacity:first.opacity});
    this.totalLength+=length/this.c.ppm;this.iteration++;
    return true;
  }
  private switchStage(){if(this.stage>=2)return false;this.stage++;this.rebuildTiles();return true;}
  private convergenceCheck(){
    const window=Math.max(10,this.c.stopWindow|0),n=this.iteration;
    if(n<Math.max(60,2*window)||n-this.stopLastCheck<window)return false;
    this.stopLastCheck=n;const error=this.fullError(),old=this.stopPreviousError;
    this.stopPreviousError=error;
    const relative=Math.max(0,old-error)/Math.max(old,1e-12),rate=relative/window;
    const change=this.stopPrevRate===null?Infinity:Math.abs(rate-this.stopPrevRate)/Math.max(this.stopPrevRate,rate,1e-12);
    this.stopPrevRate=rate;
    const factor=Math.pow(1.5,3-this.c.stopSensitivity);
    const verySlow=relative<.0025*factor,flat=relative<.006*factor&&change<.22,poor=relative<.010*factor;
    this.stopLowCount=verySlow||flat?this.stopLowCount+1:0;
    this.stallWindows=poor?this.stallWindows+1:0;
    return this.stopLowCount>=2||this.stallWindows>=3;
  }
  protected renderPreview(): ImageBitmap { return renderMatitaPreview(this.draw,this.w,this.h); }
  protected exportResult(reason: string): MatitaResult {
    return exportMatita(this.paths,this.draw,this.w,this.h,this.c,this.safeSegment,this.fullError(),this.totalLength,reason);
  }
  async run(onProgress:(strokes:number,mse:number,stage:number,preview:ImageBitmap)=>void):Promise<MatitaResult>{
    let stopReason="no profitable stroke";
    let lastPreviewAt=performance.now();
    onProgress(0,this.fullError(),this.stage,this.renderPreview());
    const emitPreview=()=>{
      const now=performance.now();
      if(now-lastPreviewAt<250)return;
      onProgress(this.paths.length+1,this.fullError(),this.stage,this.renderPreview());
      lastPreviewAt=now;
    };
    while(true){
      if(this.paths.length>=this.c.maxStrokes){stopReason="stroke limit";break;}
      if(this.stage<2&&this.paths.length>=(this.stage===0?Math.max(100,Math.floor(this.c.maxStrokes*.10)):Math.max(200,Math.floor(this.c.maxStrokes*.30)))){this.switchStage();continue;}
      if(this.stage===2&&this.iteration%20===0&&this.fullError()<=this.c.epsilon){stopReason="target MSE";break;}
      if(!this.nextStroke(emitPreview)){if(!this.switchStage()){stopReason="no profitable stroke";break;}}
      else if(this.convergenceCheck()){stopReason="early convergence";break;}
      const now=performance.now();
      if(now-lastPreviewAt>=250){
        onProgress(this.paths.length,this.fullError(),this.stage,this.renderPreview());
        lastPreviewAt=now;
      }
      if(this.iteration%4===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    return this.exportResult(stopReason);
  }
}
