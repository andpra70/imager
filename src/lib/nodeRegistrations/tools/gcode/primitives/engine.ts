import { renderMatitaPreview } from "../matita/preview";
import { exportPrimitives } from "./export";
import type { PrimitiveRequest, PrimitiveShape } from "./model";

export class PrimitiveEngine {
  private target: Float32Array;
  private draw: Float32Array;
  private mask: Uint8Array;
  private marks: Int32Array;
  private stamp = 0;
  private error = 0;
  private scores: Float64Array;
  private tiles: number[] = [];
  private readonly tileSize = 18;
  private readonly cols: number;
  private readonly rows: number;
  private readonly shapes: PrimitiveShape[] = [];
  private seed = 0x12345678;
  constructor(private readonly request: PrimitiveRequest) {
    const { width: w, height: h, pixels, options: c } = request;
    const n=w*h; this.cols=Math.ceil(w/18); this.rows=Math.ceil(h/18);
    this.target=new Float32Array(n); this.draw=new Float32Array(n); this.mask=new Uint8Array(n); this.marks=new Int32Array(n);
    this.scores=new Float64Array(this.cols*this.rows);
    for(let i=0;i<n;i++){const j=i*4,y=(.2126*pixels[j]+.7152*pixels[j+1]+.0722*pixels[j+2])/255;this.target[i]=1-y;this.mask[i]=y<c.white/255?1:0;this.error+=this.target[i]**2;}
    const radius=Math.ceil((c.penDiameter/2+c.whiteMargin)*c.resolution);
    if(radius>0){const distance=new Int32Array(n);for(let i=0;i<n;i++)distance[i]=this.mask[i]?100000:0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;distance[i]=Math.min(distance[i],x?distance[i-1]+1:100000,y?distance[i-w]+1:100000);}
      for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;distance[i]=Math.min(distance[i],x<w-1?distance[i+1]+1:100000,y<h-1?distance[i+w]+1:100000);this.mask[i]=distance[i]>radius?1:0;}
    }
  }
  private random(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x;return (x>>>0)/4294967296;}
  private refreshTiles(){const {width:w,height:h}=this.request;this.scores.fill(0);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!this.mask[i])continue;const e=Math.max(0,this.target[i]-this.draw[i]);this.scores[Math.floor(y/18)*this.cols+Math.floor(x/18)]+=e*e;}
    this.tiles=Array.from({length:this.scores.length},(_,i)=>i).filter(i=>this.scores[i]>1e-6).sort((a,b)=>this.scores[b]-this.scores[a]).slice(0,Math.max(20,Math.ceil(this.scores.length*.1)));
  }
  private evaluate(shape: PrimitiveShape, commit=false){const {width:w,height:h,options:c}=this.request,r=Math.max(.45,c.penDiameter*c.resolution/2),rr=r*r, affected:number[]=[];
    if(++this.stamp>=2147483647){this.marks.fill(0);this.stamp=1;}
    const paint=(px:number,py:number)=>{for(let yy=Math.max(0,Math.floor(py-r));yy<=Math.min(h-1,Math.ceil(py+r));yy++)for(let xx=Math.max(0,Math.floor(px-r));xx<=Math.min(w-1,Math.ceil(px+r));xx++){
      if((xx-px)**2+(yy-py)**2>rr)continue;const i=yy*w+xx;if(!this.mask[i])return false;if(this.marks[i]!==this.stamp){this.marks[i]=this.stamp;affected.push(i);}
    }return true;};
    if(shape.kind==="rectangle"){
      if(shape.x-r<0||shape.y-r<0||shape.x+shape.width+r>=w||shape.y+shape.height+r>=h)return 0;
      const step=.42;for(let x=shape.x;x<=shape.x+shape.width;x+=step)if(!paint(x,shape.y)||!paint(x,shape.y+shape.height))return 0;
      for(let y=shape.y;y<=shape.y+shape.height;y+=step)if(!paint(shape.x,y)||!paint(shape.x+shape.width,y))return 0;
    }else{
      if(shape.cx-shape.radius-r<0||shape.cy-shape.radius-r<0||shape.cx+shape.radius+r>=w||shape.cy+shape.radius+r>=h)return 0;
      const count=Math.max(16,Math.ceil(2*Math.PI*shape.radius/.38));for(let j=0;j<count;j++){const a=j*2*Math.PI/count;if(!paint(shape.cx+shape.radius*Math.cos(a),shape.cy+shape.radius*Math.sin(a)))return 0;}
    }
    let gain=0;for(const i of affected){const d=this.draw[i],t=this.target[i],next=d+(1-d)*c.alpha;gain+=(d-t)**2-(next-t)**2;}
    if(gain<=0)return 0;
    if(commit){for(const i of affected){const d=this.draw[i],t=this.target[i],next=d+(1-d)*c.alpha;this.draw[i]=next;this.error+=(next-t)**2-(d-t)**2;}}
    return gain;
  }
  private candidate(){const {width:w,height:h,kind,options:c}=this.request;if(!this.tiles.length)return null;
    const min=Math.max(2,c.minSize*c.resolution),max=Math.max(min+1,c.maxSize*c.resolution),logMin=Math.log(min),logRange=Math.log(max)-logMin;
    let best:PrimitiveShape|null=null,bestScore=0;
    for(let j=0;j<Math.floor(c.samples);j++){
      const tile=this.tiles[Math.min(this.tiles.length-1,Math.floor(this.random()**2*this.tiles.length))],tx=(tile%this.cols)*18,ty=Math.floor(tile/this.cols)*18;
      const sx=tx+this.random()*Math.min(18,w-tx),sy=ty+this.random()*Math.min(18,h-ty),scale=Math.exp(logMin+logRange*this.random());
      let shape:PrimitiveShape,cost:number;
      if(kind==="rectangle"){
        const aspect=Math.exp((this.random()-.5)*2.6),sw=Math.round(Math.max(min,Math.min(max,scale*aspect))),sh=Math.round(Math.max(min,Math.min(max,scale/aspect)));
        shape={kind,x:Math.round(sx-sw*(.2+.6*this.random())),y:Math.round(sy-sh*(.2+.6*this.random())),width:sw,height:sh,gain:0};cost=2*(sw+sh);
      }else{
        const radius=scale/2,angle=this.random()*2*Math.PI;shape={kind,cx:sx-radius*Math.cos(angle),cy:sy-radius*Math.sin(angle),radius,gain:0};cost=2*Math.PI*radius;
      }
      const gain=this.evaluate(shape),score=gain/(1+cost**.45);if(score>bestScore){shape.gain=gain;best=shape;bestScore=score;}
    }
    return best;
  }
  async run(progress:(shapes:number,mse:number,preview:ImageBitmap)=>void){const {width,height,kind,options:c}=this.request,n=width*height;
    progress(0,this.error/n,renderMatitaPreview(this.draw,width,height));
    let fail=0,stall=0,last=this.error,reason="limite forme raggiunto",lastPreview=performance.now();
    for(let attempt=0;attempt<c.maxShapes;attempt++){
      if(attempt%10===0)this.refreshTiles();const best=this.candidate();
      if(!best){if(++fail>=12){reason="nessuna forma utile";break;}continue;}
      fail=0;if(!this.evaluate(best,true))continue;this.shapes.push(best);
      if(this.shapes.length%Math.floor(c.plateauWindow)===0){const change=(last-this.error)/Math.max(last,1e-12);stall=change<c.minProgressPercent/100?stall+1:0;last=this.error;if(stall>=2){reason="plateau";break;}}
      if(this.error/n<=c.targetMse){reason="MSE obiettivo";break;}
      if(performance.now()-lastPreview>180){progress(this.shapes.length,this.error/n,renderMatitaPreview(this.draw,width,height));lastPreview=performance.now();await new Promise(resolve=>setTimeout(resolve,0));}
      else if(attempt%100===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    return exportPrimitives(kind,this.shapes,this.draw,width,height,c,this.error/n,reason);
  }
}
