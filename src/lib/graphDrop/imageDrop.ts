import { LiteGraph } from "litegraph.js";

export interface DroppedImageNode {
  pos: [number, number];
  size?: [number, number];
  loadImageFile: (file: File) => void;
  refreshPreviewLayout?: () => void;
}

export interface ImageDropGraph {
  add(node: DroppedImageNode): void;
  beforeChange?: () => void;
  afterChange?: () => void;
}

export interface ImageDropCanvas {
  convertEventToCanvasOffset: (event: MouseEvent) => [number, number];
  setDirty: (foreground?: boolean, background?: boolean) => void;
}

const IMAGE_EXTENSIONS = new Set([
  "avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "svg", "webp",
]);

export function getDroppedImageFile(event: DragEvent) {
  const files = Array.from(event.dataTransfer?.files ?? []);
  return files.find((file) => {
    if (file.type.startsWith("image/")) return true;
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    return IMAGE_EXTENSIONS.has(extension);
  }) ?? null;
}

export function createImageNodeFromDrop(
  graph: ImageDropGraph,
  canvas: ImageDropCanvas,
  event: DragEvent,
  file: File,
) {
  const node = LiteGraph.createNode("input/image") as DroppedImageNode | null;
  if (!node) return null;

  node.refreshPreviewLayout?.();
  const [dropX, dropY] = canvas.convertEventToCanvasOffset(event);
  const nodeWidth = node.size?.[0] ?? 280;
  const titleHeight = 30;
  node.pos = [dropX - nodeWidth / 2, dropY - titleHeight / 2];

  graph.beforeChange?.();
  graph.add(node);
  node.loadImageFile(file);
  graph.afterChange?.();
  canvas.setDirty(true, true);
  return node;
}
