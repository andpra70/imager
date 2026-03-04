export type Ml5Task = "bodypose" | "handpose" | "facemesh" | "imageclassifier";

export interface GraphMl5ImageInfo {
  width: number;
  height: number;
}

export interface GraphMl5Summary {
  itemCount: number;
  pointCount: number;
  labels: string[];
}

export interface GraphMl5Data {
  task: Ml5Task;
  modelKey: string;
  image: GraphMl5ImageInfo;
  summary: GraphMl5Summary;
  generatedAtIso: string;
  raw: unknown;
}
