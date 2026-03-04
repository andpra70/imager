export interface GraphFaceBlendshapeCategory {
  categoryName: string;
  displayName: string;
  score: number;
}

export interface GraphFaceLandmarksData {
  task: "face-landmarker";
  image: {
    width: number;
    height: number;
  };
  faceCount: number;
  landmarkCount: number;
  blendshapes: GraphFaceBlendshapeCategory[];
  generatedAtIso: string;
  raw: unknown;
}
