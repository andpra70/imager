export type OpenCvOperationId =
  | "grayscale" | "hsv" | "lab" | "invert" | "channel" | "convert-scale" | "brightness"
  | "box-blur" | "gaussian-blur" | "median-blur" | "bilateral" | "sharpen" | "emboss"
  | "threshold" | "adaptive-threshold" | "otsu"
  | "canny" | "sobel" | "scharr" | "laplacian"
  | "erode" | "dilate" | "morph-open" | "morph-close" | "morph-gradient" | "top-hat" | "black-hat"
  | "equalize-hist" | "clahe" | "distance-transform"
  | "resize" | "rotate" | "flip" | "pyr-down" | "pyr-up"
  | "find-contours" | "hough-lines" | "hough-circles";

export type OpenCvParamValue = number | boolean | string;
export type OpenCvParams = Record<string, OpenCvParamValue>;

export type OpenCvControl =
  | { type: "slider"; key: string; label: string; defaultValue: number; min: number; max: number; step: number }
  | { type: "toggle"; key: string; label: string; defaultValue: boolean }
  | { type: "combo"; key: string; label: string; defaultValue: string | number; values: Array<string | number> };

export interface OpenCvOperationSpec {
  id: OpenCvOperationId;
  label: string;
  glyph: string;
  description: string;
  controls: OpenCvControl[];
}

export interface OpenCvImagePayload { width: number; height: number; rgba: Uint8ClampedArray; }
export interface OpenCvJobRequest { type: "process"; jobId: number; operation: OpenCvOperationId; params: OpenCvParams; image: OpenCvImagePayload; }
export type OpenCvJobResponse =
  | { type: "ready" }
  | { type: "progress"; jobId: number; progress: number; stage: string }
  | { type: "result"; jobId: number; image: OpenCvImagePayload; elapsedMs: number }
  | { type: "error"; jobId: number; message: string };

const slider = (key:string,label:string,defaultValue:number,min:number,max:number,step:number):OpenCvControl => ({type:"slider",key,label,defaultValue,min,max,step});
const combo = (key:string,label:string,defaultValue:string|number,values:Array<string|number>):OpenCvControl => ({type:"combo",key,label,defaultValue,values});

export const openCvOperationSpecs: OpenCvOperationSpec[] = [
  {id:"grayscale",label:"Grayscale",glyph:"OCG",description:"Conversione RGBA in scala di grigi.",controls:[]},
  {id:"hsv",label:"HSV",glyph:"HSV",description:"Visualizzazione nello spazio colore HSV.",controls:[]},
  {id:"lab",label:"Lab",glyph:"LAB",description:"Visualizzazione nello spazio colore CIE Lab.",controls:[]},
  {id:"invert",label:"Invert",glyph:"OCI",description:"Inversione bitwise dei canali.",controls:[]},
  {id:"channel",label:"Channel",glyph:"CHN",description:"Estrazione di un singolo canale.",controls:[combo("channel","Channel",0,[0,1,2,3])]},
  {id:"convert-scale",label:"Scale Abs",glyph:"SAB",description:"Regolazione lineare alpha/beta con saturazione.",controls:[slider("alpha","Alpha",1,-3,3,.1),slider("beta","Beta",0,-255,255,1)]},
  {id:"brightness",label:"Brightness",glyph:"BCS",description:"Regola luminosità, contrasto e saturazione preservando i colori con conversione HSV.",controls:[slider("brightness","Luminosità",0,-100,100,1),slider("contrast","Contrasto",0,-100,100,1),slider("saturation","Saturazione",0,-100,200,1)]},
  {id:"box-blur",label:"Box Blur",glyph:"BBL",description:"Filtro media normalizzato.",controls:[slider("kernel","Kernel",5,1,51,2)]},
  {id:"gaussian-blur",label:"Gaussian",glyph:"GBL",description:"Sfocatura gaussiana.",controls:[slider("kernel","Kernel",5,1,51,2),slider("sigma","Sigma",0,0,20,.1)]},
  {id:"median-blur",label:"Median",glyph:"MBL",description:"Filtro mediano robusto al rumore impulsivo.",controls:[slider("kernel","Kernel",5,1,31,2)]},
  {id:"bilateral",label:"Bilateral",glyph:"BIL",description:"Smoothing edge-preserving.",controls:[slider("diameter","Diameter",9,1,31,2),slider("sigmaColor","Sigma color",75,1,200,1),slider("sigmaSpace","Sigma space",75,1,200,1)]},
  {id:"sharpen",label:"Sharpen",glyph:"SHP",description:"Convoluzione di nitidezza.",controls:[slider("amount","Amount",1,0,5,.1)]},
  {id:"emboss",label:"Emboss",glyph:"EMB",description:"Convoluzione rilievo.",controls:[slider("strength","Strength",1,.1,4,.1)]},
  {id:"threshold",label:"Threshold",glyph:"THR",description:"Soglia globale configurabile.",controls:[slider("threshold","Threshold",127,0,255,1),slider("maxValue","Max",255,0,255,1),combo("mode","Mode","binary",["binary","binary-inv","truncate","to-zero","to-zero-inv"])]},
  {id:"adaptive-threshold",label:"Adaptive Thr",glyph:"ATH",description:"Soglia adattiva locale.",controls:[slider("maxValue","Max",255,0,255,1),slider("blockSize","Block",11,3,51,2),slider("constant","C",2,-20,20,.5),combo("method","Method","gaussian",["mean","gaussian"]),combo("mode","Mode","binary",["binary","binary-inv"])]},
  {id:"otsu",label:"Otsu",glyph:"OTS",description:"Soglia automatica Otsu.",controls:[combo("mode","Mode","binary",["binary","binary-inv"])]},
  {id:"canny",label:"Canny",glyph:"CNY",description:"Rilevamento bordi Canny.",controls:[slider("low","Low",50,0,255,1),slider("high","High",150,0,255,1),slider("aperture","Aperture",3,3,7,2),{type:"toggle",key:"l2",label:"L2 gradient",defaultValue:false}]},
  {id:"sobel",label:"Sobel",glyph:"SOB",description:"Derivata Sobel.",controls:[combo("axis","Axis","xy",["x","y","xy"]),slider("kernel","Kernel",3,1,7,2),slider("scale","Scale",1,.1,5,.1)]},
  {id:"scharr",label:"Scharr",glyph:"SCH",description:"Derivata Scharr accurata 3x3.",controls:[combo("axis","Axis","xy",["x","y","xy"]),slider("scale","Scale",1,.1,5,.1)]},
  {id:"laplacian",label:"Laplacian",glyph:"LAP",description:"Derivata Laplaciana.",controls:[slider("kernel","Kernel",3,1,7,2),slider("scale","Scale",1,.1,5,.1)]},
  ...(["erode","dilate","morph-open","morph-close","morph-gradient","top-hat","black-hat"] as OpenCvOperationId[]).map((id,index)=>({id,label:["Erode","Dilate","Open","Close","Gradient","Top Hat","Black Hat"][index],glyph:["ERO","DIL","MOP","MCL","MGR","TOP","BLK"][index],description:`Operazione morfologica ${id}.`,controls:[slider("kernel","Kernel",3,1,31,2),slider("iterations","Iterations",1,1,10,1),combo("shape","Shape","ellipse",["rect","cross","ellipse"])]})),
  {id:"equalize-hist",label:"Equalize",glyph:"EQU",description:"Equalizzazione istogramma luminanza.",controls:[]},
  {id:"clahe",label:"CLAHE",glyph:"CLA",description:"Equalizzazione locale limitata nel contrasto.",controls:[slider("clipLimit","Clip limit",2,.1,10,.1),slider("tiles","Tiles",8,2,32,1)]},
  {id:"distance-transform",label:"Distance",glyph:"DST",description:"Trasformata della distanza normalizzata.",controls:[combo("distance","Distance","l2",["l1","l2","c"]),slider("mask","Mask",3,3,5,2)]},
  {id:"resize",label:"Resize",glyph:"RSZ",description:"Ridimensionamento OpenCV.",controls:[slider("scale","Scale",1,.1,4,.1),combo("interpolation","Interpolation","linear",["nearest","linear","cubic","area","lanczos"])]},
  {id:"rotate",label:"Rotate",glyph:"ROT",description:"Rotazione affine attorno al centro.",controls:[slider("angle","Angle",0,-180,180,1),slider("scale","Scale",1,.1,3,.1),combo("border","Border","reflect",["constant","replicate","reflect","wrap"]) ]},
  {id:"flip",label:"Flip",glyph:"FLP",description:"Riflessione orizzontale o verticale.",controls:[combo("axis","Axis","horizontal",["horizontal","vertical","both"])]},
  {id:"pyr-down",label:"Pyr Down",glyph:"PY-",description:"Livello inferiore piramide gaussiana.",controls:[]},
  {id:"pyr-up",label:"Pyr Up",glyph:"PY+",description:"Livello superiore piramide gaussiana.",controls:[]},
  {id:"find-contours",label:"Contours",glyph:"CNT",description:"Estrazione e disegno contorni.",controls:[slider("threshold","Threshold",127,0,255,1),slider("thickness","Thickness",1,1,10,1),combo("retrieval","Retrieval","external",["external","list","ccomp","tree"]),combo("approximation","Approx","simple",["none","simple","tc89-l1","tc89-kcos"])]},
  {id:"hough-lines",label:"Hough Lines",glyph:"HGL",description:"Rilevamento linee probabilistico Hough.",controls:[slider("low","Canny low",50,0,255,1),slider("high","Canny high",150,0,255,1),slider("threshold","Votes",50,1,300,1),slider("minLength","Min length",30,1,500,1),slider("maxGap","Max gap",10,0,100,1),slider("thickness","Thickness",2,1,10,1)]},
  {id:"hough-circles",label:"Hough Circles",glyph:"HGC",description:"Rilevamento cerchi Hough gradient.",controls:[slider("dp","DP",1,.5,4,.1),slider("minDist","Min distance",20,1,300,1),slider("param1","Edge threshold",100,1,300,1),slider("param2","Center threshold",30,1,200,1),slider("minRadius","Min radius",0,0,500,1),slider("maxRadius","Max radius",0,0,1000,1),slider("thickness","Thickness",2,1,10,1)]},
];

export const defaultParams = (spec:OpenCvOperationSpec):OpenCvParams => Object.fromEntries(spec.controls.map(control=>[control.key,control.defaultValue]));
