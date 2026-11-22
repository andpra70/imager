import { renderMatitaPreview } from "../matita/preview";
import { exportCalligraphy } from "./export";
import type { CalligraphyRequest,Curve,Point,Stroke } from "./model";
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export class CalligraphyEngine{
  private target:Float32Array;private draw:Float32Array;private safe:Uint8Array;private edge:Float32Array;private marks:Int32Array;private stamp=0;private error=0;private strokes:Stroke[]=[];
  private readonly cols:number;private readonly scores:Float64Array;private tiles:number[]=[];private seed=0x7f4a7c15;
  constructor(private readonly request:CalligraphyRequest){const {width:w,height:h,pixels,options:c}=request,n=w*h;this.target=new Float32Array(n);this.draw=new Float32Array(n);this.safe=new Uint8Array(n);this.edge=new Float32Array(n);this.marks=new Int32Array(n);this.cols=Math.ceil(w/20);this.scores=new Float64Array(this.cols*Math.ceil(h/20));
    const mask=new Uint8Array(n);for(let i=0;i<n;i++){const k=i*4,l=(.2126*pixels[k]+.7152*pixels[k+1]+.0722*pixels[k+2])/255;this.target[i]=1-l;mask[i]=l<c.white/255?1:0;this.error+=this.target[i]**2;}
    // Exact circular erosion from IEDD7, with a cached disk for the selected pen and margin.
    const r=Math.ceil((c.pen/2+c.margin)*c.ppm),offsets:number[]=[];for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dy*dy<=r*r)offsets.push(dy*w+dx);
    for(let y=r;y<h-r;y++)for(let x=r;x<w-r;x++){const i=y*w+x;if(!mask[i])continue;let valid=true;for(const offset of offsets)if(!mask[i+offset]){valid=false;break;}this.safe[i]=valid?1:0;}
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;this.edge[i]=Math.hypot(this.target[i+1]-this.target[i-1],this.target[i+w]-this.target[i-w]);}
  }
  private random(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x;return(x>>>0)/4294967296;}
  private refreshTiles(){const {width:w,height:h}=this.request;this.scores.fill(0);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!this.safe[i])continue;const e=Math.max(0,this.target[i]-this.draw[i]);this.scores[Math.floor(y/20)*this.cols+Math.floor(x/20)]+=e*e*(1+Math.min(3,this.edge[i]*4));}this.tiles=Array.from({length:this.scores.length},(_,i)=>i).filter(i=>this.scores[i]>.00001).sort((a,b)=>this.scores[b]-this.scores[a]).slice(0,Math.max(24,Math.ceil(this.scores.length*.12)));}
  private tangent(x:number,y:number){const {width:w,height:h}=this.request,ix=clamp(Math.round(x),1,w-2),iy=clamp(Math.round(y),1,h-2),i=iy*w+ix;return Math.atan2(this.target[i+w]-this.target[i-w],-(this.target[i+1]-this.target[i-1]));}
  private pickSeed(){const {width:w,height:h}=this.request;if(!this.tiles.length)return null;let best:{x:number;y:number;score:number}|null=null;for(let j=0;j<Math.min(180,this.tiles.length*6);j++){const tile=this.tiles[Math.floor(this.random()**1.7*this.tiles.length)],tx=(tile%this.cols)*20,ty=Math.floor(tile/this.cols)*20,x=tx+this.random()*Math.min(20,w-tx),y=ty+this.random()*Math.min(20,h-ty),ix=Math.round(x),iy=Math.round(y);if(ix>=w||iy>=h)continue;const i=iy*w+ix;if(!this.safe[i])continue;const e=this.target[i]-this.draw[i],score=e*(1+Math.min(3,this.edge[i]*4));if(score>.03&&(!best||score>best.score))best={x,y,score};}return best;}
  private curve(p:Point,angle:number,len:number,delta:number):Curve{const a=angle+delta,p0={...p},p1={x:p.x+Math.cos(angle)*len*.36,y:p.y+Math.sin(angle)*len*.36},p3={x:p.x+Math.cos(a)*len,y:p.y+Math.sin(a)*len},p2={x:p3.x-Math.cos(a)*len*.36,y:p3.y-Math.sin(a)*len*.36},n=Math.max(8,Math.ceil(len/.27)),points:Point[]=[];
    for(let j=0;j<=n;j++){const t=j/n,q=1-t;points.push({x:q*q*q*p0.x+3*q*q*t*p1.x+3*q*t*t*p2.x+t*t*t*p3.x,y:q*q*q*p0.y+3*q*q*t*p1.y+3*q*t*t*p2.y+t*t*t*p3.y});}return {p0,p1,p2,p3,points,end:p3,angle:a};}
  private score(curve:Curve,commit=false){const {width:w,height:h,options:c}=this.request,brush=Math.max(.45,c.pen*c.ppm/2),rr=brush*brush,ids:number[]=[];if(++this.stamp>=2147483647){this.marks.fill(0);this.stamp=1;}
    for(const p of curve.points){const ix=Math.round(p.x),iy=Math.round(p.y);if(ix<0||iy<0||ix>=w||iy>=h||!this.safe[iy*w+ix])return 0;for(let y=Math.max(0,Math.floor(p.y-brush));y<=Math.min(h-1,Math.ceil(p.y+brush));y++)for(let x=Math.max(0,Math.floor(p.x-brush));x<=Math.min(w-1,Math.ceil(p.x+brush));x++){if((x-p.x)**2+(y-p.y)**2>rr)continue;const i=y*w+x;if(!this.safe[i])return 0;if(this.marks[i]!==this.stamp){this.marks[i]=this.stamp;ids.push(i);}}}
    if(!ids.length)return 0;let gain=0;for(const i of ids){const d=this.draw[i],next=d+(1-d)*c.alpha,t=this.target[i];gain+=(d-t)**2-(next-t)**2;}if(gain<=0)return 0;if(commit)for(const i of ids){const d=this.draw[i],next=d+(1-d)*c.alpha,t=this.target[i];this.draw[i]=next;this.error+=(next-t)**2-(d-t)**2;}return gain;
  }
  private next(p:Point,angle:number,first=false){const {options:c}=this.request,n=Math.floor(c.candidates),base=c.step*c.ppm,bend=c.bend*Math.PI/180;let best:{curve:Curve;score:number;gain:number}|null=null;
    for(let j=0;j<n;j++){const delta=j===0?0:(2*this.random()-1)*bend,len=base*(.65+this.random()*.75),a=first&&j>0?angle+(2*this.random()-1)*Math.PI*.38:angle,curve=this.curve(p,a,len,delta),gain=this.score(curve);if(!gain)continue;const curvature=Math.abs(delta)/Math.max(len,1),score=gain/(len**.38+1)*(1-.15*Math.abs(delta)/Math.max(bend,.01))-.002*curvature;if(!best||score>best.score)best={curve,score,gain};}return best;
  }
  private stroke(seed:Point):Stroke|null{const angle=this.tangent(seed.x,seed.y),forward=this.next(seed,angle,true),reverse=this.next(seed,angle+Math.PI,true);let best=!forward?reverse:!reverse?forward:forward.score>=reverse.score?forward:reverse;if(!best)return null;const curves:Curve[]=[];let p={...seed},a=best.curve.angle,gain=0;for(let k=0;k<Math.floor(this.request.options.chain);k++){const choice=k===0?best:this.next(p,a);if(!choice)break;const current=this.score(choice.curve,true);if(!current)break;curves.push(choice.curve);gain+=current;p=choice.curve.end;a=choice.curve.angle;if(k>3&&current<Math.max(.00001,gain*.0008))break;}return curves.length?{curves,gain}:null;}
  async run(progress:(strokes:number,curves:number,mse:number,preview:ImageBitmap)=>void){const {width,height,options:c}=this.request,n=width*height;progress(0,0,this.error/n,renderMatitaPreview(this.draw,width,height));let last=this.error,stalled=0,fail=0,curveCount=0,reason="limite tratti raggiunto",lastPreview=performance.now();
    for(let k=0;k<c.maxStrokes;k++){if(k%5===0)this.refreshTiles();const seed=this.pickSeed();if(!seed){reason="nessuna zona scura utile";break;}const stroke=this.stroke(seed);if(!stroke){if(++fail>35){reason="nessuna curva valida";break;}continue;}fail=0;this.strokes.push(stroke);curveCount+=stroke.curves.length;
      if(this.strokes.length%30===0){const improvement=(last-this.error)/Math.max(last,1e-12)*100;stalled=improvement<c.minProgress?stalled+1:0;last=this.error;if(stalled>=2){reason="plateau";break;}}
      if(this.error/n<=c.target){reason="MSE obiettivo";break;}
      if(performance.now()-lastPreview>180){progress(this.strokes.length,curveCount,this.error/n,renderMatitaPreview(this.draw,width,height));lastPreview=performance.now();await new Promise(resolve=>setTimeout(resolve,0));}
      else if(k%12===0)await new Promise(resolve=>setTimeout(resolve,0));
    }return exportCalligraphy(this.strokes,this.draw,width,height,c,this.error/n,reason);
  }
}
