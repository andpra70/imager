export interface GraphPoseBox {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphPoseData {
  task: "pose-detection";
  image: {
    width: number;
    height: number;
  };
  poseCount: number;
  keypointCount: number;
  boxes: GraphPoseBox[];
  generatedAtIso: string;
  raw: unknown;
}
