export interface GcodeConvergenceSample {
  iteration: number;
  error: number;
  stage?: number;
}

export class GcodeConvergenceSeries {
  private samples: GcodeConvergenceSample[] = [];
  constructor(private readonly maxSamples = 320) {}
  add(sample: GcodeConvergenceSample) {
    const last=this.samples[this.samples.length-1];
    if(last?.iteration===sample.iteration){this.samples[this.samples.length-1]=sample;return;}
    this.samples.push(sample);
    if(this.samples.length>this.maxSamples){const reduced=[this.samples[0]];for(let index=1;index<this.samples.length-1;index+=2)reduced.push(this.samples[index]);reduced.push(this.samples[this.samples.length-1]);this.samples=reduced;}
  }
  values(){return this.samples.slice();}
  clear(){this.samples=[];}
}

export function drawGcodeConvergenceChart(context:CanvasRenderingContext2D,samples:readonly GcodeConvergenceSample[],x:number,y:number,width:number,height=50,target?:number){
  context.save();context.fillStyle="#101515";context.fillRect(x,y,width,height);context.strokeStyle="rgba(255,255,255,.12)";context.strokeRect(x+.5,y+.5,width-1,height-1);
  if(samples.length<2){context.fillStyle="rgba(217,231,237,.55)";context.font="10px sans-serif";context.fillText("convergenza in attesa…",x+7,y+height/2+3);context.restore();return;}
  const minIteration=samples[0].iteration,maxIteration=Math.max(minIteration+1,samples[samples.length-1].iteration),maxError=Math.max(...samples.map(sample=>sample.error),1e-9),minError=Math.min(...samples.map(sample=>sample.error),target??Infinity),logMax=Math.log10(maxError),logMin=Math.log10(Math.max(1e-9,Math.min(minError,maxError*.999)));
  const px=(iteration:number)=>x+3+(iteration-minIteration)/(maxIteration-minIteration)*(width-6),py=(error:number)=>y+3+(logMax-Math.log10(Math.max(1e-9,error)))/Math.max(1e-9,logMax-logMin)*(height-6);
  if(target!==undefined&&target>0&&target<=maxError){context.setLineDash([3,3]);context.strokeStyle="rgba(117,201,135,.55)";context.beginPath();context.moveTo(x+2,py(target));context.lineTo(x+width-2,py(target));context.stroke();context.setLineDash([]);}
  context.strokeStyle="#f2a65a";context.lineWidth=1.5;context.beginPath();samples.forEach((sample,index)=>{const sx=px(sample.iteration),sy=py(sample.error);if(index===0)context.moveTo(sx,sy);else context.lineTo(sx,sy);});context.stroke();
  const last=samples[samples.length-1];context.fillStyle="#d9e7ed";context.font="9px monospace";context.fillText(`MSE ${last.error.toFixed(5)}`,x+6,y+11);context.restore();
}
