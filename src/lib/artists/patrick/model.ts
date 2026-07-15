export interface PatrickNagelOptions {
  smoothing: number;
  blackPoint: number;
  whitePoint: number;
  saturation: number;
  posterizeLevels: number;
  edgeThreshold: number;
  backgroundColor: string;
}

export const DEFAULT_PATRICK_NAGEL_OPTIONS: PatrickNagelOptions = {
  smoothing: 1.5,
  blackPoint: 18,
  whitePoint: 242,
  saturation: 1.2,
  posterizeLevels: 4,
  edgeThreshold: 34,
  backgroundColor: "#F4EEE6",
};
