export interface GraphVideoSize {
  width: number;
  height: number;
}

export interface GraphVideo {
  kind: "graph-video";
  track: MediaStreamTrack;
  stream: MediaStream;
  size: GraphVideoSize | null;
  source: "webcam" | "faceswap" | "external";
  generatedAtIso: string;
}

export function isGraphVideo(value: unknown): value is GraphVideo {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GraphVideo>;
  return candidate.kind === "graph-video" && candidate.track instanceof MediaStreamTrack;
}
