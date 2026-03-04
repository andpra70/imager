export interface PnnQuantOptions {
  pixels: Uint32Array;
  width: number;
  height: number;
  colors: number;
  dithering: boolean;
  paletteOnly?: boolean;
  alphaThreshold?: number;
  weight: number;
  weightB?: number;
}

export interface PnnQuantResult {
  img8?: Uint32Array;
  pal8?: ArrayBuffer;
  indexedPixels: Uint8Array | Uint16Array;
  transparent: number;
  type: string;
}

declare class PnnQuant {
  constructor(options: PnnQuantOptions);
  getResult(): Promise<PnnQuantResult>;
}

export default PnnQuant;
