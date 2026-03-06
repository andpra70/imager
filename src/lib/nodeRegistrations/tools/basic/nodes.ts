import {
  drawImagePreview,
  rotateGraphImage,
  scaleGraphImage,
} from "../../../imageUtils";
import type { GraphImage } from "../../../../models/graphImage";
import type { PreviewAwareNode } from "../../shared";
import {
  clamp,
  createToolTitle,
  formatExecutionInfo,
  getGraphImageSignature,
  notifyGraphStateChange,
  refreshNode,
} from "../shared";
import { OptimizedToolNode } from "../shared";

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class ScaleToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & ScaleToolNode;
    node.title = createToolTitle("Scale");
    node.properties = { percent: 100 };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Scale %",
      100,
      (value) => {
        node.properties.percent = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: 1, max: 400, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 1);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & ScaleToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const percent = Number(this.properties.percent ?? 100);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = `percent:${Math.round(percent)}`;
    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = scaleGraphImage(input, percent);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & ScaleToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(
      this.preview ? `${this.preview.width}x${this.preview.height}` : "no output",
      10,
      layout.footerTop + 12,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

export class RotateToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 320];
  preview: GraphImage | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & RotateToolNode;
    node.title = createToolTitle("Rotate");
    node.properties = { angle: 0 };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Angle",
      0,
      (value) => {
        node.properties.angle = Number(value);
        node.setDirtyCanvas(true, true);
        notifyGraphStateChange(node);
      },
      { min: -180, max: 180, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 1);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & RotateToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    const angle = Number(this.properties.angle ?? 0);
    if (!input) {
      this.preview = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    const signature = getGraphImageSignature(input);
    const optionsSignature = `angle:${Math.round(angle)}`;
    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }
    this.preview = rotateGraphImage(input, angle);
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & RotateToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 2 });
    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(`${Number(this.properties.angle ?? 0).toFixed(0)} deg`, 10, layout.footerTop + 12);
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 30);
    context.restore();
  }
}

export class RotatePanZoomToolNode extends OptimizedToolNode {
  size: [number, number] = [280, 440];
  preview: GraphImage | null = null;
  birdEyeImage: GraphImage | null = null;
  cropRect: CropRect | null = null;

  constructor() {
    super();
    const node = this as unknown as PreviewAwareNode & RotatePanZoomToolNode;
    node.title = createToolTitle("RotatePanZoom");
    node.properties = {
      rotation: 0,
      zoom: 1,
      panX: 0,
      panY: 0,
      cropPercent: 70,
    };
    node.addInput("image", "image");
    node.addOutput("image", "image");
    node.addWidget(
      "slider",
      "Rotation",
      0,
      (value) => {
        node.properties.rotation = Number(value);
        notifyGraphStateChange(node);
      },
      { min: -180, max: 180, step: 1 },
    );
    node.addWidget(
      "slider",
      "Zoom",
      1,
      (value) => {
        node.properties.zoom = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 0.2, max: 5, step: 0.05, precision: 2 },
    );
    node.addWidget(
      "slider",
      "Pan X",
      0,
      (value) => {
        node.properties.panX = Number(value);
        notifyGraphStateChange(node);
      },
      { min: -100, max: 100, step: 1 },
    );
    node.addWidget(
      "slider",
      "Pan Y",
      0,
      (value) => {
        node.properties.panY = Number(value);
        notifyGraphStateChange(node);
      },
      { min: -100, max: 100, step: 1 },
    );
    node.addWidget(
      "slider",
      "Crop %",
      70,
      (value) => {
        node.properties.cropPercent = Number(value);
        notifyGraphStateChange(node);
      },
      { min: 10, max: 100, step: 1 },
    );
    node.refreshPreviewLayout = () => {
      refreshNode(node, node.preview, 3);
    };
    node.refreshPreviewLayout();
  }

  onExecute(this: PreviewAwareNode & RotatePanZoomToolNode) {
    const start = performance.now();
    const input = this.getInputData(0);
    if (!input) {
      this.preview = null;
      this.birdEyeImage = null;
      this.cropRect = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    const rotation = Number(this.properties.rotation ?? 0);
    const zoom = clamp(Number(this.properties.zoom ?? 1), 0.2, 5);
    const panX = clamp(Number(this.properties.panX ?? 0), -100, 100);
    const panY = clamp(Number(this.properties.panY ?? 0), -100, 100);
    const cropPercent = clamp(Number(this.properties.cropPercent ?? 70), 10, 100);
    const signature = getGraphImageSignature(input);
    const optionsSignature = JSON.stringify({
      rotation: Math.round(rotation),
      zoom: Number(zoom.toFixed(3)),
      panX: Math.round(panX),
      panY: Math.round(panY),
      cropPercent: Math.round(cropPercent),
    });
    if (this.canReuseOptimizedResult(signature, optionsSignature)) {
      this.setOutputData(0, this.preview);
      this.refreshPreviewLayout();
      return;
    }

    const width = input.width;
    const height = input.height;
    const transformed = document.createElement("canvas");
    transformed.width = width;
    transformed.height = height;
    const transformedContext = transformed.getContext("2d");
    if (!transformedContext) {
      this.preview = null;
      this.birdEyeImage = null;
      this.cropRect = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }

    transformedContext.save();
    transformedContext.translate(width / 2, height / 2);
    transformedContext.rotate((rotation * Math.PI) / 180);
    transformedContext.scale(zoom, zoom);
    transformedContext.drawImage(input, -width / 2, -height / 2, width, height);
    transformedContext.restore();

    const cropWidth = clamp(Math.round(width * (cropPercent / 100)), 1, width);
    const cropHeight = clamp(Math.round(height * (cropPercent / 100)), 1, height);
    const maxOffsetX = Math.max(0, (width - cropWidth) / 2);
    const maxOffsetY = Math.max(0, (height - cropHeight) / 2);
    const centerX = width / 2 + (panX / 100) * maxOffsetX;
    const centerY = height / 2 + (panY / 100) * maxOffsetY;
    const cropX = clamp(Math.round(centerX - cropWidth / 2), 0, width - cropWidth);
    const cropY = clamp(Math.round(centerY - cropHeight / 2), 0, height - cropHeight);

    const cropped = document.createElement("canvas");
    cropped.width = cropWidth;
    cropped.height = cropHeight;
    const croppedContext = cropped.getContext("2d");
    if (!croppedContext) {
      this.preview = null;
      this.birdEyeImage = null;
      this.cropRect = null;
      this.completeOptimizedExecution(start);
      this.resetOptimizedCache();
      this.setOutputData(0, null);
      this.refreshPreviewLayout();
      return;
    }
    croppedContext.drawImage(transformed, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    this.preview = cropped;
    this.birdEyeImage = transformed;
    this.cropRect = { x: cropX, y: cropY, width: cropWidth, height: cropHeight };
    this.completeOptimizedExecution(start, signature, optionsSignature);
    this.setOutputData(0, this.preview);
    this.refreshPreviewLayout();
  }

  onDrawBackground(this: PreviewAwareNode & RotatePanZoomToolNode, context: CanvasRenderingContext2D) {
    const layout = drawImagePreview(context, this, this.preview, { footerLines: 3 });
    if (this.birdEyeImage && this.cropRect) {
      const panelWidth = Math.max(60, Math.min(110, layout.previewWidth * 0.34));
      const panelHeight = Math.max(60, Math.min(110, layout.previewHeight * 0.34));
      const panelX = layout.padding + layout.previewWidth - panelWidth - 8;
      const panelY = layout.previewTop + 8;
      context.save();
      context.fillStyle = "rgba(10,10,10,0.72)";
      context.fillRect(panelX, panelY, panelWidth, panelHeight);
      context.drawImage(this.birdEyeImage, panelX, panelY, panelWidth, panelHeight);
      context.strokeStyle = "rgba(255,255,255,0.2)";
      context.strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);

      const scaleX = panelWidth / this.birdEyeImage.width;
      const scaleY = panelHeight / this.birdEyeImage.height;
      context.strokeStyle = "rgba(255, 173, 92, 0.96)";
      context.lineWidth = 1.2;
      context.strokeRect(
        panelX + this.cropRect.x * scaleX + 0.5,
        panelY + this.cropRect.y * scaleY + 0.5,
        Math.max(1, this.cropRect.width * scaleX - 1),
        Math.max(1, this.cropRect.height * scaleY - 1),
      );
      context.restore();
    }

    context.save();
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    const rotation = Math.round(Number(this.properties.rotation ?? 0));
    const zoom = Number(this.properties.zoom ?? 1);
    const panX = Math.round(Number(this.properties.panX ?? 0));
    const panY = Math.round(Number(this.properties.panY ?? 0));
    context.fillText(`rot:${rotation}deg | zoom:${zoom.toFixed(2)} | pan:${panX},${panY}`, 10, layout.footerTop + 12);
    context.fillText(
      this.preview ? `crop:${this.preview.width}x${this.preview.height}` : "no output",
      10,
      layout.footerTop + 30,
    );
    context.fillText(formatExecutionInfo(this.executionMs), 10, layout.footerTop + 48);
    context.restore();
  }
}
