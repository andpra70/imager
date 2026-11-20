export type KodakModelName = "p300r" | "p210r";

export interface KodakPrinterProfile {
  name: KodakModelName;
  label: string;
  width: number;
  height: number;
  nativeModelId: number;
}

export interface KodakPrintOptions {
  model: KodakModelName;
  fit: boolean;
  cropZoom: number;
  cropPanX: number;
  cropPanY: number;
  jpegQuality: number;
  saturation: number;
  brightness: number;
  contrast: number;
  timeoutSeconds: number;
}

export const kodakPrinterProfiles: Record<KodakModelName, KodakPrinterProfile> = {
  p300r: { name: "p300r", label: "Kodak P300R · 3 × 3", width: 896, height: 896, nativeModelId: 9 },
  p210r: { name: "p210r", label: "Kodak P210R · 2.1 × 3.4", width: 640, height: 1024, nativeModelId: 10 },
};

export const defaultKodakPrintOptions: KodakPrintOptions = {
  model: "p300r",
  fit: true,
  cropZoom: 1,
  cropPanX: 0,
  cropPanY: 0,
  jpegQuality: 0.95,
  saturation: 1,
  brightness: 1,
  contrast: 1,
  timeoutSeconds: 180,
};
