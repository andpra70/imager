export interface ImageTracerOptions {
  corsenabled?: boolean;
  ltres?: number;
  qtres?: number;
  pathomit?: number;
  rightangleenhance?: boolean;
  colorsampling?: number;
  numberofcolors?: number;
  mincolorratio?: number;
  colorquantcycles?: number;
  layering?: number;
  strokewidth?: number;
  linefilter?: boolean;
  scale?: number;
  roundcoords?: number;
  viewbox?: boolean;
  desc?: boolean;
  lcpr?: number;
  qcpr?: number;
  blurradius?: number;
  blurdelta?: number;
}

declare const ImageTracer: {
  optionpresets: Record<string, ImageTracerOptions>;
  imagedataToSVG: (
    imageData: ImageData,
    options?: string | ImageTracerOptions,
  ) => string;
  checkoptions: (options?: string | ImageTracerOptions) => ImageTracerOptions;
};

export default ImageTracer;
