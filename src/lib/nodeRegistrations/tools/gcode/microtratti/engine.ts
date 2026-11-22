import { renderMatitaPreview } from "../matita/preview";
import { exportCalligraphy } from "../matita_calligrafica/export";
import type { Curve,Point,Stroke } from "../matita_calligrafica/model";
import type { MicroCandidate,MicroRequest } from "./model";
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export class MicroEngine{
  private target:Float32Array;private draw:Float32Array;private safe:Uint8Array;private edge:Float32Array;private visited:Int32Array;private stamp=0;private error=0;private strokes:Stroke[]=[];
  private readonly cols:number;private readonly scores:Float64Array;private tiles:number[]=[];private seed=0x3f841e19;private lastEnd:Point|null=null;
  constructor(private readonly request:MicroRequest){const {width:w,height:h,pixels,options:c}=request,n=w*h;this.target=new Float32Array(n);this.draw=new Float32Array(n);this.safe=new Uint8Array(n);this.edge=new Float32Array(n);this.visited=new Int32Array(n);this.cols=Math.ceil(w/20);this.scores=new Float64Array(this.cols*Math.ceil(h/20));const mask=new Uint8Array(n);
    for(let i=0;i<n;i++){const k=i*4,l=(.2126*pixels[k]+.7152*pixels[k+1]+.0722*pixels[k+2])/255;this.target[i]=1-l;mask[i]=l<c.white/255?1:0;this.error+=this.target[i]**2;}
    const r=Math.ceil((c.pen/2+c.margin)*c.ppm),offsets:number[]=[];for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dy*dy<=r*r)offsets.push(dy*w+dx);
    for(let y=r;y<h-r;y++)for(let x=r;x<w-r;x++){const i=y*w+x;if(!mask[i])continue;let valid=true;for(const offset of offsets)if(!mask[i+offset]){valid=false;break;}this.safe[i]=valid?1:0;}
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;this.edge[i]=Math.hypot(this.target[i+1]-this.target[i-1],this.target[i+w]-this.target[i-w]);}
  }
  private random(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x;return(x>>>0)/4294967296;}
  private refreshTiles(){const {width:w,height:h}=this.request;this.scores.fill(0);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!this.safe[i])continue;const e=Math.max(0,this.target[i]-this.draw[i]);this.scores[Math.floor(y/20)*this.cols+Math.floor(x/20)]+=e*e*(1+Math.min(3,this.edge[i]*4));}this.rankTiles();}
  private rankTiles(){this.tiles=Array.from({length:this.scores.length},(_,i)=>i).filter(i=>this.scores[i]>.00001).sort((a,b)=>this.scores[b]-this.scores[a]).slice(0,Math.max(24,Math.ceil(this.scores.length*.12)));}
  private tangent(x:number,y:number){const {width:w,height:h}=this.request,ix=clamp(Math.round(x),1,w-2),iy=clamp(Math.round(y),1,h-2),i=iy*w+ix;return Math.atan2(this.target[i+w]-this.target[i-w],-(this.target[i+1]-this.target[i-1]));}
  private seeds(){const {width:w,height:h,kind,options:c}=this.request,pool:{x:number;y:number;priority:number}[]=[];if(!this.tiles.length)return pool;const count=Math.min(kind==="turbo"?38:90,this.tiles.length*(kind==="turbo"?3:5));
    for(let j=0;j<count;j++){const limit=kind==="turbo"?Math.min(this.tiles.length,20):this.tiles.length,tile=this.tiles[Math.min(limit-1,Math.floor((kind==="turbo"?this.random():this.random()**1.5)*limit))],tx=(tile%this.cols)*20,ty=Math.floor(tile/this.cols)*20,x=tx+this.random()*Math.min(20,w-tx),y=ty+this.random()*Math.min(20,h-ty),ix=Math.round(x),iy=Math.round(y);if(ix>=w||iy>=h)continue;const i=iy*w+ix;if(!this.safe[i])continue;const residual=this.target[i]-this.draw[i];if(residual<.035)continue;const distance=this.lastEnd?Math.hypot(x-this.lastEnd.x,y-this.lastEnd.y)/c.ppm:0,priority=residual*(1+Math.min(2,this.edge[i]*3))/(1+c.locality*.018*distance);pool.push({x,y,priority});}
    pool.sort((a,b)=>b.priority-a.priority);return pool.slice(0,kind==="turbo"?4:7);
  }
  private curve(p:Point,angle:number,len:number,delta:number):Curve{const a=angle+delta,p0={...p},p1={x:p.x+Math.cos(angle)*len*.36,y:p.y+Math.sin(angle)*len*.36},p3={x:p.x+Math.cos(a)*len,y:p.y+Math.sin(a)*len},p2={x:p3.x-Math.cos(a)*len*.36,y:p3.y-Math.sin(a)*len*.36},n=Math.max(6,Math.ceil(len/.42)),points:Point[]=[];for(let j=0;j<=n;j++){const t=j/n,q=1-t;points.push({x:q*q*q*p0.x+3*q*q*t*p1.x+3*q*t*t*p2.x+t*t*t*p3.x,y:q*q*q*p0.y+3*q*q*t*p1.y+3*q*t*t*p2.y+t*t*t*p3.y});}return {p0,p1,p2,p3,points,end:p3,angle:a};}
  private length(points:Point[]){let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);return length;}
  private limitedCurve(p:Point,angle:number,len:number,delta:number){const max=this.request.options.maxLen*this.request.options.ppm;let curve=this.curve(p,angle,len,delta),length=this.length(curve.points);if(length>max){curve=this.curve(p,angle,len*max/length*.998,delta);length=this.length(curve.points);}return length>max+1e-5?null:{curve,length};}
  private quickScore(curve:Curve){const {width:w,height:h,options:c}=this.request,brush=Math.max(.45,c.pen*c.ppm/2),r=Math.ceil(brush),offsets=r<=1?[[0,0],[1,0],[-1,0],[0,1],[0,-1]]:[[0,0],[r,0],[-r,0],[0,r],[0,-r]];let gain=0;
    for(const p of curve.points){const x=Math.round(p.x),y=Math.round(p.y);if(x<r||y<r||x>=w-r||y>=h-r||!this.safe[y*w+x])return -1;for(const [dx,dy] of offsets){const i=(y+dy)*w+x+dx;if(!this.safe[i])return -1;const d=this.draw[i],next=d+(1-d)*c.alpha,t=this.target[i];gain+=(d-t)**2-(next-t)**2;}}return gain;
  }
  private score(curve:Curve,commit=false){const {width:w,height:h,options:c}=this.request,brush=Math.max(.45,c.pen*c.ppm/2),rr=brush*brush,ids:number[]=[];if(++this.stamp>=2147483640){this.visited.fill(0);this.stamp=1;}
    for(const p of curve.points){const ix=Math.round(p.x),iy=Math.round(p.y);if(ix<0||iy<0||ix>=w||iy>=h||!this.safe[iy*w+ix])return 0;for(let y=Math.max(0,Math.floor(p.y-brush));y<=Math.min(h-1,Math.ceil(p.y+brush));y++)for(let x=Math.max(0,Math.floor(p.x-brush));x<=Math.min(w-1,Math.ceil(p.x+brush));x++){if((x-p.x)**2+(y-p.y)**2>rr)continue;const i=y*w+x;if(!this.safe[i])return 0;if(this.visited[i]!==this.stamp){this.visited[i]=this.stamp;ids.push(i);}}}
    if(!ids.length)return 0;let gain=0;for(const i of ids){const d=this.draw[i],next=d+(1-d)*c.alpha,t=this.target[i];gain+=(d-t)**2-(next-t)**2;}if(gain<=0)return 0;
    if(commit)for(const i of ids){const d=this.draw[i],next=d+(1-d)*c.alpha,t=this.target[i],old=Math.max(0,t-d),now=Math.max(0,t-next),x=i%w,y=Math.floor(i/w),tile=Math.floor(y/20)*this.cols+Math.floor(x/20),weight=1+Math.min(3,this.edge[i]*4);this.draw[i]=next;this.error+=(next-t)**2-(d-t)**2;this.scores[tile]+=(now*now-old*old)*weight;}return gain;
  }
  private find(){const {options:c,kind}=this.request,seeds=this.seeds(),n=Math.floor(c.candidates),bend=c.bend*Math.PI/180,shortlist:MicroCandidate[]=[];let best:MicroCandidate|null=null;
    for(const seed of seeds){const base=this.tangent(seed.x,seed.y);for(let j=0;j<n;j++){let angle=base+(j%2?Math.PI:0)+(this.random()-.5)*1.2;if(j%7===0)angle=this.random()*Math.PI*2;const len=(c.minLen+(c.maxLen-c.minLen)*this.random()**.72)*c.ppm,delta=(this.random()*2-1)*bend,limited=this.limitedCurve(seed,angle,len,delta);if(!limited||limited.length<c.minLen*c.ppm*.96)continue;
      const {curve,length}=limited,distance=this.lastEnd?Math.hypot(seed.x-this.lastEnd.x,seed.y-this.lastEnd.y)/c.ppm:0,cost=(.4+(length/c.ppm)**.55)*(1+c.locality*.012*distance);
      if(kind==="turbo"){const estimate=this.quickScore(curve);if(estimate<=0)continue;const score=estimate/cost;if(shortlist.length<4||score>shortlist[shortlist.length-1].score){shortlist.push({curve,length,distance,score,gain:estimate});shortlist.sort((a,b)=>b.score-a.score);if(shortlist.length>4)shortlist.pop();}}
      else{const gain=this.score(curve);if(!gain)continue;const score=gain/cost;if(!best||score>best.score)best={curve,length,distance,score,gain};}
    }}
    if(kind==="turbo")for(const candidate of shortlist){const gain=this.score(candidate.curve);if(!gain)continue;const score=gain/((.4+(candidate.length/c.ppm)**.55)*(1+c.locality*.012*candidate.distance));if(!best||score>best.score)best={...candidate,gain,score};}return best;
  }
  async run(progress:(strokes:number,mse:number,preview:ImageBitmap)=>void){const {width,height,options:c}=this.request,n=width*height;progress(0,this.error/n,renderMatitaPreview(this.draw,width,height));this.refreshTiles();let fail=0,reason="limite tratti raggiunto",lastPreview=performance.now();if(this.error/n<=c.target)reason="MSE obiettivo già raggiunto";
    for(let k=0;k<c.maxStrokes&&reason==="limite tratti raggiunto";k++){if(k%80===0||fail%80===79)this.rankTiles();const candidate=this.find();if(!candidate){if(++fail>=c.failMax){reason="nessun tratto utile";break;}if(fail%80===0)await new Promise(resolve=>setTimeout(resolve,0));continue;}const gain=this.score(candidate.curve,true);if(!gain)continue;fail=0;this.strokes.push({curves:[candidate.curve],gain});this.lastEnd=candidate.curve.end;
      if(this.error/n<=c.target){reason="MSE obiettivo";break;}if(performance.now()-lastPreview>180){progress(this.strokes.length,this.error/n,renderMatitaPreview(this.draw,width,height));lastPreview=performance.now();await new Promise(resolve=>setTimeout(resolve,0));}else if(this.strokes.length%100===0)await new Promise(resolve=>setTimeout(resolve,0));
    }return exportCalligraphy(this.strokes,this.draw,width,height,c,this.error/n,reason);
  }
}
