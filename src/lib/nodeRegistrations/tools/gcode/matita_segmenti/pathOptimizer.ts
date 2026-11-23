import type { MatitaSegmentiPath, MatitaSegmentiPoint } from "./export";

const distanceSquared=(a:MatitaSegmentiPoint,b:MatitaSegmentiPoint)=>(a.x-b.x)**2+(a.y-b.y)**2;
const endpoint=(path:MatitaSegmentiPath,end:boolean)=>path[end?path.length-1:0];
export function pathTravel(paths:MatitaSegmentiPath[],start:MatitaSegmentiPoint={x:0,y:0,z:0}){let total=0,position=start;for(const path of paths){total+=Math.sqrt(distanceSquared(position,path[0]));position=path[path.length-1];}return total;}
export function optimizeMatitaSegmentiPaths(source:MatitaSegmentiPath[],start:MatitaSegmentiPoint={x:0,y:0,z:0}){
  if(source.length<2)return source.map(path=>path.slice());let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  source.forEach(path=>[endpoint(path,false),endpoint(path,true)].forEach(point=>{minX=Math.min(minX,point.x);minY=Math.min(minY,point.y);maxX=Math.max(maxX,point.x);maxY=Math.max(maxY,point.y);}));
  const cell=Math.max(8,Math.sqrt(Math.max(1,(maxX-minX)*(maxY-minY))/source.length)),key=(point:MatitaSegmentiPoint)=>`${Math.floor((point.x-minX)/cell)},${Math.floor((point.y-minY)/cell)}`;
  const buckets=new Map<string,Array<[number,boolean]>>();source.forEach((path,index)=>[false,true].forEach(reverse=>{const k=key(endpoint(path,reverse)),list=buckets.get(k)??[];list.push([index,reverse]);buckets.set(k,list);}));
  const used=new Uint8Array(source.length),result:MatitaSegmentiPath[]=[];let position:MatitaSegmentiPoint=start;
  while(result.length<source.length){const bx=Math.floor((position.x-minX)/cell),by=Math.floor((position.y-minY)/cell);let best=-1,reverse=false,bestDistance=Infinity;const maxRing=Math.ceil(Math.max(maxX-minX,maxY-minY)/cell)+2;
    for(let ring=0;ring<=maxRing;ring++){for(let y=by-ring;y<=by+ring;y++)for(let x=bx-ring;x<=bx+ring;x++){if(Math.max(Math.abs(x-bx),Math.abs(y-by))!==ring)continue;for(const [index,candidateReverse] of buckets.get(`${x},${y}`)??[]){if(used[index])continue;const d=distanceSquared(position,endpoint(source[index],candidateReverse));if(d<bestDistance){best=index;reverse=candidateReverse;bestDistance=d;}}}if(best>=0&&Math.sqrt(bestDistance)<Math.max(0,ring-1)*cell)break;}
    if(best<0){best=used.findIndex(value=>!value);if(best<0)break;}used[best]=1;const path=source[best].slice();if(reverse)path.reverse();result.push(path);position=path[path.length-1];}
  return result;
}
