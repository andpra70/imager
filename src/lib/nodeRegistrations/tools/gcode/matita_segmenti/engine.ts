import type { MatitaSegmentiOptions, MatitaSegmentiRequest, MatitaSegmentiResult } from "./model";
import { validateMatitaSegmentiOptions } from "./model";
import { exportMatitaSegmenti, type MatitaSegmentiPath, type MatitaSegmentiPoint } from "./export";
import { renderMatitaPreview } from "../matita/preview";
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
interface Step extends MatitaSegmentiPoint { angle:number; score:number; gain:number }
interface Seed { x:number; y:number; score:number }

export class MatitaSegmentiEngine {
  private readonly w:number;private readonly h:number;private readonly c:MatitaSegmentiOptions;
  private readonly target:Float32Array;private readonly draw:Float32Array;private readonly weight:Float32Array;private readonly alphaMask:Float32Array;
  private readonly tilesX:number;private readonly tilesY:number;private readonly tileScores:Float32Array;private readonly dirtyTiles=new Set<number>();
  private readonly paths:MatitaSegmentiPath[]=[];
  private errorSum=0;private segments=0;
  constructor({width,height,pixels,options}:MatitaSegmentiRequest){
    validateMatitaSegmentiOptions(options);
    if(width<10||height<10||width*height>850_000||pixels.length!==width*height*4)throw Error("Raster non valido");
    this.w=width;this.h=height;this.c=options;
    const n=width*height;this.target=new Float32Array(n);this.draw=new Float32Array(n);this.weight=new Float32Array(n);this.alphaMask=new Float32Array(n);
    for(let i=0;i<n;i++){
      const k=i*4,a=pixels[k+3]/255;
      this.alphaMask[i]=a;
      const light=(.2126*pixels[k]+.7152*pixels[k+1]+.0722*pixels[k+2])/255;
      this.target[i]=clamp((1-light)*a,0,1);
    }
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x,x0=Math.max(0,x-1),x1=Math.min(width-1,x+1),y0=Math.max(0,y-1),y1=Math.min(height-1,y+1);
      const gx=this.target[y*width+x1]-this.target[y*width+x0],gy=this.target[y1*width+x]-this.target[y0*width+x];
      this.weight[i]=1+(options.detail-1)*clamp(Math.hypot(gx,gy)*2.8,0,1);
      this.errorSum+=this.errorAt(i,0);
    }
    this.tilesX=Math.ceil(width/16);this.tilesY=Math.ceil(height/16);
    this.tileScores=new Float32Array(this.tilesX*this.tilesY);
    for(let i=0;i<this.tileScores.length;i++)this.updateTile(i);
  }
  private errorAt(i:number,value:number){const e=value-this.target[i];return this.weight[i]*(e>0?this.c.over:1)*e*e;}
  private mse(){return this.errorSum/this.target.length;}
  private rawSeedScore(x:number,y:number){const i=y*this.w+x,r=this.target[i]-this.draw[i];if(r<.045)return 0;const score=r*r*this.weight[i];return score>=.003?score:0;}
  private updateTile(id:number){
    const tx=id%this.tilesX,ty=Math.floor(id/this.tilesX);let best=0;
    for(let y=Math.max(2,ty*16);y<Math.min(this.h-2,ty*16+16);y+=2)
      for(let x=Math.max(2,tx*16);x<Math.min(this.w-2,tx*16+16);x+=2)best=Math.max(best,this.rawSeedScore(x,y));
    this.tileScores[id]=best;
  }
  private refreshDirtyTiles(){for(const id of this.dirtyTiles)this.updateTile(id);this.dirtyTiles.clear();}
  private segment(x0:number,y0:number,x1:number,y1:number,z:number,commit=false){
    const {w,h,c}=this,rad=Math.max(.55,c.diameter*c.resolution*.58),dx=x1-x0,dy=y1-y0,length2=dx*dx+dy*dy;
    const opacity=c.alpha*(.60+.40*(z-c.zMin)/Math.max(.001,c.zMax-c.zMin));
    const minX=Math.max(0,Math.floor(Math.min(x0,x1)-rad-1)),maxX=Math.min(w-1,Math.ceil(Math.max(x0,x1)+rad+1));
    const minY=Math.max(0,Math.floor(Math.min(y0,y1)-rad-1)),maxY=Math.min(h-1,Math.ceil(Math.max(y0,y1)+rad+1));
    let gain=0,ink=0,blocked=0;
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const u=length2?clamp(((x-x0)*dx+(y-y0)*dy)/length2,0,1):0;
      const distance=Math.hypot(x-x0-u*dx,y-y0-u*dy);if(distance>=rad)continue;
      const i=y*w+x,coverage=1-distance/rad,alpha=opacity*coverage*coverage;if(alpha<.0005)continue;
      const before=this.draw[i],after=before+(1-before)*alpha;
      const improvement=this.errorAt(i,before)-this.errorAt(i,after);
      gain+=improvement;ink+=alpha;
      if(this.alphaMask[i]<.05&&after>.025)blocked+=alpha;
      if(commit){this.draw[i]=after;this.errorSum-=improvement;this.dirtyTiles.add((y>>4)*this.tilesX+(x>>4));}
    }
    return {gain,ink,blocked};
  }
  private dirScore(x:number,y:number,angle:number,z:number,heading:number,first:boolean):Step|null{
    const delta=this.c.step*this.c.resolution,nx=x+delta*Math.cos(angle),ny=y+delta*Math.sin(angle);
    if(nx<1||ny<1||nx>=this.w-2||ny>=this.h-2)return null;
    const result=this.segment(x,y,nx,ny,z);
    if(result.blocked>result.ink*.04||result.gain<=0)return null;
    const turn=first?0:Math.abs(Math.atan2(Math.sin(angle-heading),Math.cos(angle-heading)));
    const score=result.gain/(delta+.5)-.005*turn*turn-result.ink*.0005;
    return {x:nx,y:ny,z,angle,score,gain:result.gain};
  }
  private bestStep(x:number,y:number,heading:number,first:boolean):Step|null{
    const directions=first?Array.from({length:this.c.directions},(_,j)=>j*2*Math.PI/this.c.directions):Array.from({length:9},(_,j)=>heading+(j-4)*Math.PI/24);
    const zLevels=[this.c.zMin,(this.c.zMin+this.c.zMax)/2,this.c.zMax];
    let best:Step|null=null;
    for(const angle of directions)for(const z of zLevels){const candidate=this.dirScore(x,y,angle,z,heading,first);if(candidate&&(!best||candidate.score>best.score))best=candidate;}
    return best;
  }
  private seeds(last:MatitaSegmentiPoint|null):Seed[]{
    // Tile maxima are updated only under committed pen footprints.
    const order:number[]=[];for(let i=0;i<this.tileScores.length;i++)if(this.tileScores[i]>.003)order.push(i);
    order.sort((a,b)=>this.tileScores[b]-this.tileScores[a]);
    const candidates:Seed[]=[];
    for(const id of order.slice(0,64)){
      const tx=id%this.tilesX,ty=Math.floor(id/this.tilesX);
      for(let y=Math.max(2,ty*16);y<Math.min(this.h-2,ty*16+16);y+=2)
        for(let x=Math.max(2,tx*16);x<Math.min(this.w-2,tx*16+16);x+=2){
          let score=this.rawSeedScore(x,y);if(!score)continue;
          if(last)score/=1+Math.hypot(x-last.x,y-last.y)/this.c.resolution*.006;
          candidates.push({x,y,score});
        }
    }
    candidates.sort((a,b)=>b.score-a.score);
    const selected:Seed[]=[],separation=Math.max(4,Math.round(this.c.resolution*2));
    for(const point of candidates){if(selected.every(other=>Math.hypot(other.x-point.x,other.y-point.y)>separation)){selected.push(point);if(selected.length>=24)break;}}
    return selected;
  }
  private grow(seed:Seed,initial:Step,onSegment:(count:number)=>void):MatitaSegmentiPath|null{
    let x=seed.x,y=seed.y,angle=initial.angle;
    const points:MatitaSegmentiPath=[{x,y,z:initial.z}],seen=new Set<string>();
    for(let j=0;j<180;j++){
      const next=j===0?initial:this.bestStep(x,y,angle,false);
      if(!next||next.gain<.00006)break;
      const key=`${Math.round(next.x/1.5)},${Math.round(next.y/1.5)}`;
      if(seen.has(key))break;seen.add(key);
      this.segment(x,y,next.x,next.y,next.z,true);
      points.push({x:next.x,y:next.y,z:next.z});x=next.x;y=next.y;angle=next.angle;
      onSegment(points.length-1);
    }
    this.refreshDirtyTiles();
    return points.length>=2?points:null;
  }
  async run(onProgress:(strokes:number,segments:number,mse:number,preview:ImageBitmap)=>void):Promise<MatitaSegmentiResult>{
    let reason="Nessun ulteriore tratto vantaggioso trovato.",last:MatitaSegmentiPoint|null=null,stalled=0;
    let lastPreview=performance.now();
    onProgress(0,0,this.mse(),renderMatitaPreview(this.draw,this.w,this.h));
    const emitPreview=(strokes:number,segments:number)=>{
      const now=performance.now();
      if(now-lastPreview<250)return;
      onProgress(strokes,segments,this.mse(),renderMatitaPreview(this.draw,this.w,this.h));
      lastPreview=now;
    };
    while(this.segments<this.c.maxSegments){
      if(this.mse()<=this.c.epsilon){reason="Soglia di convergenza raggiunta.";break;}
      const options=this.seeds(last);let best:{seed:Seed;initial:Step;score:number}|null=null;
      for(const seed of options){
        const initial=this.bestStep(seed.x,seed.y,0,true);if(!initial)continue;
        const travel=last?Math.hypot(seed.x-last.x,seed.y-last.y)/this.c.resolution:0;
        const score=initial.score/(1+.004*travel);
        if(!best||score>best.score)best={seed,initial,score};
      }
      if(!best||best.score<=0)break;
      const path=this.grow(best.seed,best.initial,count=>emitPreview(this.paths.length+1,this.segments+count));
      if(!path){if(++stalled>10){reason="Stagnazione della ricerca.";break;}continue;}
      this.paths.push(path);this.segments+=path.length-1;last=path[path.length-1];stalled=0;
      emitPreview(this.paths.length,this.segments);
      if(this.paths.length%8===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    if(this.segments>=this.c.maxSegments)reason="Limite segmenti raggiunto.";
    return exportMatitaSegmenti(this.paths,this.draw,this.w,this.h,this.c,this.segments,this.mse(),reason);
  }
}
