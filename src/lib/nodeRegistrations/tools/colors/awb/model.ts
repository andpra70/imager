export type AwbMethod = "gray-world" | "white-patch" | "shades-of-gray" | "gray-edge";

export interface AwbOptions {
  method: AwbMethod;
  strength: number;
  percentile: number;
  minkowskiPower: number;
  maxGain: number;
  preserveLuminance: boolean;
}

export interface AwbResult {
  image: HTMLCanvasElement;
  gains: { red: number; green: number; blue: number };
  illuminant: { red: number; green: number; blue: number };
}

export const defaultAwbOptions: AwbOptions = {
  method: "gray-world",
  strength: 1,
  percentile: 95,
  minkowskiPower: 6,
  maxGain: 3,
  preserveLuminance: true,
};
