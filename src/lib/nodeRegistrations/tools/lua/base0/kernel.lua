-- Cross-stitch raster kernel inspired by flockaroo's ShaderToy Md3cWr.
-- Shader-style helpers are translated to Lua and emit physical pen curves.
local floor,ceil,sqrt,sin,cos,pi=math.floor,math.ceil,math.sqrt,math.sin,math.cos,math.pi
local function clamp(v,a,b)return math.max(a,math.min(b,v))end
local function fract(v)return v-floor(v)end
local function hash21(x,y)return fract(sin(x*127.1+y*311.7)*43758.5453123)end
local target,draw={},{} local error=0
for i=0,W*H-1 do local k=i*4 local r,g,b=string.byte(PIXELS,k+1,k+3) local l=(.2126*r+.7152*g+.0722*b)/255 local ink=1-l target[i+1]=ink draw[i+1]=0 error=error+ink*ink end
local function at(x,y)x=clamp(floor(x+.5),0,W-1)y=clamp(floor(y+.5),0,H-1)return target[y*W+x+1]end
local cell=math.max(3,floor(STEP*PPM*1.65+.5)) local cells={}
for cy=floor(cell/2),H-1,cell do for cx=floor(cell/2),W-1,cell do local tone=(at(cx,cy)+at(cx-cell*.22,cy)+at(cx+cell*.22,cy)+at(cx,cy-cell*.22)+at(cx,cy+cell*.22))/5 if tone>.035 then cells[#cells+1]={x=cx,y=cy,tone=tone,noise=hash21(cx,cy)} end end end
table.sort(cells,function(a,b)return a.tone+a.noise*.015>b.tone+b.noise*.015 end)
local strokes={}
local function paint(points)
  local radius=math.max(.55,PEN*PPM*.5) local rr=radius*radius
  for _,p in ipairs(points) do local x0=math.max(0,floor(p.x-radius)) local x1=math.min(W-1,ceil(p.x+radius)) local y0=math.max(0,floor(p.y-radius)) local y1=math.min(H-1,ceil(p.y+radius)) for y=y0,y1 do for x=x0,x1 do local dx,dy=x-p.x,y-p.y local d2=dx*dx+dy*dy if d2<=rr then local coverage=1-sqrt(d2)/radius local a=ALPHA*coverage*coverage local i=y*W+x+1 local before=draw[i] local after=before+(1-before)*a draw[i]=after error=error+(after-target[i])^2-(before-target[i])^2 end end end end
end
local function threadCurve(x0,y0,x3,y3,wobble,gain)
  local dx,dy=x3-x0,y3-y0 local length=sqrt(dx*dx+dy*dy) local nx,ny=-dy/length,dx/length
  local p0={x=x0,y=y0} local p1={x=x0+dx/3+nx*wobble,y=y0+dy/3+ny*wobble} local p2={x=x0+dx*2/3-nx*wobble,y=y0+dy*2/3-ny*wobble} local p3={x=x3,y=y3}
  local points={} local n=math.max(8,ceil(length/.27))
  for j=0,n do local t=j/n local q=1-t points[#points+1]={x=q^3*p0.x+3*q*q*t*p1.x+3*q*t*t*p2.x+t^3*p3.x,y=q^3*p0.y+3*q*q*t*p1.y+3*q*t*t*p2.y+t^3*p3.y} end
  paint(points) strokes[#strokes+1]={gain=gain,curves={{p0=p0,p1=p1,p2=p2,p3=p3,points=points,angle=math.atan(y3-y0,x3-x0)}}}
end
for _,s in ipairs(cells) do if #strokes+2>MAX_STROKES then break end local half=cell*(.34+.08*s.tone) local jitter=(s.noise-.5)*cell*.12 local wobble=(hash21(s.y,s.x)-.5)*cell*.12 threadCurve(s.x-half+jitter,s.y-half,s.x+half+jitter,s.y+half,wobble,s.tone) threadCurve(s.x+half+jitter,s.y-half,s.x-half+jitter,s.y+half,-wobble,s.tone) end
local out={"{\"strokes\":["}
for si,stroke in ipairs(strokes) do if si>1 then out[#out+1]="," end local c=stroke.curves[1] out[#out+1]=string.format("{\"gain\":%.9g,\"curves\":[{\"p0\":{\"x\":%.9g,\"y\":%.9g},\"p1\":{\"x\":%.9g,\"y\":%.9g},\"p2\":{\"x\":%.9g,\"y\":%.9g},\"p3\":{\"x\":%.9g,\"y\":%.9g},\"angle\":%.9g,\"points\":[",stroke.gain,c.p0.x,c.p0.y,c.p1.x,c.p1.y,c.p2.x,c.p2.y,c.p3.x,c.p3.y,c.angle) for pi,p in ipairs(c.points) do if pi>1 then out[#out+1]="," end out[#out+1]=string.format("{\"x\":%.9g,\"y\":%.9g}",p.x,p.y) end out[#out+1]="]}]}" end
out[#out+1]="],\"draw\":[" for i=1,#draw do if i>1 then out[#out+1]="," end out[#out+1]=string.format("%.7g",draw[i]) end out[#out+1]=string.format("],\"mse\":%.12g}",error/(W*H)) return table.concat(out)
