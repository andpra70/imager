import type { GraphImage } from "../../../models/graphImage";
import type { GraphPalette } from "../../../models/graphPalette";
import type { GraphSvg } from "../../../models/graphSvg";
import type { LiteNode, NodeCtor, PreviewAwareNode } from "../shared";
import {
  deserializeGraphImage,
  downloadGraphImage,
  downloadGraphSvg,
  drawImagePreview,
  drawSourceToCanvas,
  rasterizeGraphSvg,
  serializeCompressedGraphImage,
} from "../../imageUtils";

interface IoNodeRuntimeDeps {
  refreshNode: (node: PreviewAwareNode, image: CanvasImageSource | null, footerLines?: number) => void;
  notifyGraphStateChange: (node: LiteNode) => void;
  getGraphImageSignature: (image: GraphImage | null) => string;
  formatGraphImageInfo: (image: GraphImage | null) => string;
}

export interface IoNodeCtors {
  InputImageNode: NodeCtor;
  InputSvgNode: NodeCtor;
  WebcamImageNode: NodeCtor;
  OutputImageNode: NodeCtor;
  OutputPaletteNode: NodeCtor;
  OutputSvgNode: NodeCtor;
  OutputJsonNode: NodeCtor;
  OutputTextNode: NodeCtor;
}

function drawPalettePreview(
  context: CanvasRenderingContext2D,
  node: PreviewAwareNode,
  palette: GraphPalette | null,
  footerText?: string,
) {
  const swatches = palette ?? [];
  const columns = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(Math.max(swatches.length, 1)))));
  const rows = Math.max(1, Math.ceil(Math.max(swatches.length, 1) / columns));
  const padding = 10;
  const headerHeight = 34 + (node.widgets?.length ?? 0) * 28;
  const swatchGap = 4;
  const swatchWidth = 30;
  const swatchHeight = 24;
  const previewWidth = columns * swatchWidth + (columns - 1) * swatchGap;
  const previewHeight = rows * swatchHeight + (rows - 1) * swatchGap;
  const footerLines = footerText ? 1 : 0;
  node.size = [
    previewWidth + padding * 2,
    headerHeight + previewHeight + padding * 2 + footerLines * 18,
  ];

  context.save();
  context.fillStyle = "#161616";
  context.fillRect(padding, headerHeight, previewWidth, previewHeight);

  if (!swatches.length) {
    context.fillStyle = "rgba(255,255,255,0.45)";
    context.font = "12px sans-serif";
    context.fillText("No palette", padding + 10, headerHeight + 20);
  } else {
    swatches.forEach((color, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + column * (swatchWidth + swatchGap);
      const y = headerHeight + row * (swatchHeight + swatchGap);
      context.fillStyle = color;
      context.fillRect(x, y, swatchWidth, swatchHeight);
      context.strokeStyle = "rgba(255,255,255,0.18)";
      context.strokeRect(x + 0.5, y + 0.5, swatchWidth - 1, swatchHeight - 1);
    });
  }

  if (footerText) {
    context.fillStyle = "rgba(255,255,255,0.65)";
    context.font = "12px sans-serif";
    context.fillText(footerText, 10, headerHeight + previewHeight + padding + 12);
  }
  context.restore();
}

function downloadGraphPalette(palette: GraphPalette, filename: string) {
  const blob = new Blob([JSON.stringify(palette, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadGraphJsonData(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadGraphTextData(text: string, filename: string) {
  const blob = new Blob([text], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getSerializedImageFromConfig(data: Record<string, unknown>) {
  if (typeof data.serializedImage === "string") {
    return data.serializedImage;
  }

  const properties =
    data.properties && typeof data.properties === "object"
      ? (data.properties as Record<string, unknown>)
      : null;

  return typeof properties?.serializedImage === "string" ? properties.serializedImage : null;
}

function getSerializedSvgFromConfig(data: Record<string, unknown>) {
  if (typeof data.serializedSvg === "string") {
    return data.serializedSvg;
  }

  const properties =
    data.properties && typeof data.properties === "object"
      ? (data.properties as Record<string, unknown>)
      : null;

  return typeof properties?.serializedSvg === "string" ? properties.serializedSvg : null;
}

export function createIoNodeCtors(deps: IoNodeRuntimeDeps): IoNodeCtors {
  class InputImageNode {
    image: GraphImage | null = null;
    fileInput!: HTMLInputElement;
    size: [number, number] = [280, 280];
    objectUrl: string | null = null;
    serializedImage: string | null = null;
    infoText = "no image";

    constructor() {
      const node = this as unknown as PreviewAwareNode & InputImageNode;
      node.title = "INPUT";
      node.properties = {};
      node.addOutput("image", "image");
      node.addWidget("button", "Load image", null, () => {
        node.fileInput.click();
      });

      node.fileInput = document.createElement("input");
      node.fileInput.type = "file";
      node.fileInput.accept = "image/*";
      node.fileInput.style.display = "none";
      node.fileInput.addEventListener("change", () => {
        const file = node.fileInput.files?.[0];
        if (!file) {
          return;
        }
        node.loadImageFile(file);
      });

      node.refreshPreviewLayout = () => {
        deps.refreshNode(node, node.image, 1);
      };

      document.body.appendChild(node.fileInput);
      node.refreshPreviewLayout();
    }

    loadImageFile(this: PreviewAwareNode & InputImageNode, file: File) {
      if (!file.type.startsWith("image/")) {
        return;
      }

      if (this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl);
      }

      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      this.objectUrl = objectUrl;
      image.onload = () => {
        this.image = drawSourceToCanvas(image);
        this.serializedImage = serializeCompressedGraphImage(this.image);
        this.infoText = deps.formatGraphImageInfo(this.image);
        this.refreshPreviewLayout();
        deps.notifyGraphStateChange(this);
        URL.revokeObjectURL(objectUrl);
        if (this.objectUrl === objectUrl) {
          this.objectUrl = null;
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        if (this.objectUrl === objectUrl) {
          this.objectUrl = null;
        }
      };
      image.src = objectUrl;
    }

    onDropFile(this: PreviewAwareNode & InputImageNode, file: File) {
      this.loadImageFile(file);
    }

    onSerialize(this: InputImageNode, data: Record<string, unknown>) {
      data.serializedImage = this.image
        ? serializeCompressedGraphImage(this.image)
        : this.serializedImage;
    }

    onConfigure(this: PreviewAwareNode & InputImageNode, data: Record<string, unknown>) {
      const serializedImage = getSerializedImageFromConfig(data);
      this.serializedImage = serializedImage;

      if (!serializedImage) {
        this.image = null;
        this.infoText = "no image";
        this.refreshPreviewLayout();
        return;
      }

      void deserializeGraphImage(serializedImage)
        .then((image) => {
          this.image = image;
          this.serializedImage = serializedImage;
          this.infoText = deps.formatGraphImageInfo(this.image);
          this.refreshPreviewLayout();
          deps.notifyGraphStateChange(this);
        })
        .catch(() => {
          this.image = null;
          this.serializedImage = null;
          this.infoText = "no image";
          this.refreshPreviewLayout();
        });
    }

    onExecute(this: LiteNode & InputImageNode) {
      this.setOutputData(0, this.image);
    }

    onDrawBackground(this: PreviewAwareNode & InputImageNode, context: CanvasRenderingContext2D) {
      const layout = drawImagePreview(context, this, this.image, { footerLines: 1 });
      context.save();
      context.fillStyle = "rgba(255,255,255,0.65)";
      context.font = "12px sans-serif";
      context.fillText(this.infoText, 10, layout.footerTop + 12);
      context.restore();
    }

    onRemoved(this: InputImageNode) {
      if (this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl);
      }
      this.fileInput.remove();
    }
  }

  class WebcamImageNode {
    image: GraphImage | null = null;
    stream: MediaStream | null = null;
    video!: HTMLVideoElement;
    animationFrameId: number | null = null;
    size: [number, number] = [280, 300];
    serializedImage: string | null = null;

    constructor() {
      const node = this as unknown as PreviewAwareNode & WebcamImageNode;
      node.title = "WEBCAM";
      node.properties = {
        status: "requesting camera",
      };
      node.addOutput("image", "image");
      node.addWidget("button", "Grab", null, () => {
        if (node.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          node.image = drawSourceToCanvas(node.video);
          node.serializedImage = null;
          node.properties.status = "frame captured";
          node.refreshPreviewLayout();
          deps.notifyGraphStateChange(node);
        }
      });

      node.video = document.createElement("video");
      node.video.autoplay = true;
      node.video.muted = true;
      node.video.playsInline = true;
      node.video.addEventListener("loadedmetadata", () => {
        node.properties.status = "camera live";
        node.refreshPreviewLayout();
        node.startPreviewLoop();
      });
      node.video.addEventListener("playing", () => {
        node.properties.status = "camera live";
        node.startPreviewLoop();
      });
      node.refreshPreviewLayout = () => {
        deps.refreshNode(node, node.video.readyState >= HTMLMediaElement.HAVE_METADATA ? node.video : null, 1);
      };
      void node.startCamera();
    }

    async startCamera(this: PreviewAwareNode & WebcamImageNode) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        this.video.srcObject = this.stream;
        await this.video.play();
        this.properties.status = "camera live";
        this.refreshPreviewLayout();
      } catch {
        this.properties.status = "camera denied";
        this.refreshPreviewLayout();
      }
    }

    startPreviewLoop(this: PreviewAwareNode & WebcamImageNode) {
      if (this.animationFrameId !== null) {
        return;
      }

      const tick = () => {
        this.animationFrameId = window.requestAnimationFrame(tick);
        if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          this.setDirtyCanvas(true, true);
        }
      };

      this.animationFrameId = window.requestAnimationFrame(tick);
    }

    onExecute(this: PreviewAwareNode & WebcamImageNode) {
      this.setOutputData(0, this.image);
    }

    onSerialize(this: WebcamImageNode, data: Record<string, unknown>) {
      data.serializedImage = this.image
        ? serializeCompressedGraphImage(this.image)
        : this.serializedImage;
    }

    onConfigure(this: PreviewAwareNode & WebcamImageNode, data: Record<string, unknown>) {
      const serializedImage = getSerializedImageFromConfig(data);
      this.serializedImage = serializedImage;

      if (!serializedImage) {
        this.image = null;
        this.refreshPreviewLayout();
        return;
      }

      void deserializeGraphImage(serializedImage)
        .then((image) => {
          this.image = image;
          this.serializedImage = serializedImage;
          this.properties.status = "frame restored";
          this.refreshPreviewLayout();
          deps.notifyGraphStateChange(this);
        })
        .catch(() => {
          this.image = null;
          this.serializedImage = null;
          this.refreshPreviewLayout();
        });
    }

    onDrawBackground(this: PreviewAwareNode & WebcamImageNode, context: CanvasRenderingContext2D) {
      const liveSource =
        this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? this.video : null;
      const layout = drawImagePreview(context, this, liveSource, { footerLines: 1 });
      context.save();
      context.fillStyle = "rgba(255,255,255,0.65)";
      context.font = "12px sans-serif";
      context.fillText(String(this.properties.status ?? ""), 10, layout.footerTop + 12);
      context.restore();
    }

    onRemoved(this: WebcamImageNode) {
      if (this.animationFrameId !== null) {
        window.cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      this.stream?.getTracks().forEach((track) => track.stop());
    }
  }

  class InputSvgNode {
    svg: GraphSvg | null = null;
    preview: GraphImage | null = null;
    fileInput!: HTMLInputElement;
    size: [number, number] = [300, 320];
    serializedSvg: string | null = null;
    infoText = "no svg";
    svgBytes = 0;
    renderToken = 0;
    backgroundColor = "#FFFFFF";

    constructor() {
      const node = this as unknown as PreviewAwareNode & InputSvgNode;
      node.title = "SVG IN";
      node.properties = {
        bgColor: "#FFFFFF",
      };
      node.addOutput("svg", "svg");
      node.addWidget("button", "Load SVG", null, () => {
        node.fileInput.click();
      });
      node.addWidget("text", "BG color", "#FFFFFF", (value) => {
        const nextColor = node.normalizeBackgroundColor(String(value ?? "#FFFFFF"));
        node.properties.bgColor = nextColor;
        node.backgroundColor = nextColor;
        if (node.svg) {
          node.renderSvgPreview(node.svg);
        } else {
          node.refreshPreviewLayout();
        }
        deps.notifyGraphStateChange(node);
      });

      node.fileInput = document.createElement("input");
      node.fileInput.type = "file";
      node.fileInput.accept = ".svg,image/svg+xml";
      node.fileInput.style.display = "none";
      node.fileInput.addEventListener("change", () => {
        const file = node.fileInput.files?.[0];
        if (!file) {
          return;
        }
        node.loadSvgFile(file);
      });

      node.refreshPreviewLayout = () => {
        deps.refreshNode(node, node.preview, 1);
      };

      document.body.appendChild(node.fileInput);
      node.refreshPreviewLayout();
    }

    normalizeBackgroundColor(this: InputSvgNode, raw: string) {
      const trimmed = raw.trim();
      const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
      if (/^[0-9a-fA-F]{6}$/.test(hex)) {
        return `#${hex.toUpperCase()}`;
      }
      if (/^[0-9a-fA-F]{3}$/.test(hex)) {
        const expanded = hex
          .split("")
          .map((channel) => `${channel}${channel}`)
          .join("");
        return `#${expanded.toUpperCase()}`;
      }
      return "#FFFFFF";
    }

    renderSvgPreview(this: PreviewAwareNode & InputSvgNode, svgText: string) {
      const renderToken = ++this.renderToken;
      const backgroundColor = this.normalizeBackgroundColor(String(this.properties.bgColor ?? "#FFFFFF"));
      this.backgroundColor = backgroundColor;

      void rasterizeGraphSvg(svgText)
        .then((preview) => {
          if (renderToken !== this.renderToken) {
            return;
          }

          const composed = document.createElement("canvas");
          composed.width = preview.width;
          composed.height = preview.height;
          const context = composed.getContext("2d");
          if (!context) {
            this.preview = preview;
            this.refreshPreviewLayout();
            deps.notifyGraphStateChange(this);
            return;
          }

          context.fillStyle = backgroundColor;
          context.fillRect(0, 0, composed.width, composed.height);
          context.drawImage(preview, 0, 0);

          this.preview = composed;
          this.refreshPreviewLayout();
          deps.notifyGraphStateChange(this);
        })
        .catch(() => {
          if (renderToken !== this.renderToken) {
            return;
          }
          this.preview = null;
          this.refreshPreviewLayout();
          deps.notifyGraphStateChange(this);
        });
    }

    loadSvgText(this: PreviewAwareNode & InputSvgNode, svgText: string) {
      const normalized = svgText.trim();
      if (!normalized.toLowerCase().includes("<svg")) {
        this.infoText = "invalid svg";
        this.svg = null;
        this.preview = null;
        this.svgBytes = 0;
        this.refreshPreviewLayout();
        return;
      }

      this.svg = normalized;
      this.serializedSvg = normalized;
      this.svgBytes = new Blob([normalized], { type: "image/svg+xml" }).size;
      this.infoText = `svg ${this.svgBytes} bytes`;
      this.renderSvgPreview(normalized);
    }

    loadSvgFile(this: PreviewAwareNode & InputSvgNode, file: File) {
      const isSvg = file.type.includes("svg") || file.name.toLowerCase().endsWith(".svg");
      if (!isSvg) {
        this.infoText = "invalid file";
        this.refreshPreviewLayout();
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const svgText = typeof reader.result === "string" ? reader.result : "";
        this.loadSvgText(svgText);
      };
      reader.onerror = () => {
        this.infoText = "read error";
        this.refreshPreviewLayout();
      };
      reader.readAsText(file);
    }

    onDropFile(this: PreviewAwareNode & InputSvgNode, file: File) {
      this.loadSvgFile(file);
    }

    onSerialize(this: InputSvgNode, data: Record<string, unknown>) {
      data.serializedSvg = this.svg ?? this.serializedSvg;
    }

    onConfigure(this: PreviewAwareNode & InputSvgNode, data: Record<string, unknown>) {
      const serializedSvg = getSerializedSvgFromConfig(data);
      this.serializedSvg = serializedSvg;
      this.backgroundColor = this.normalizeBackgroundColor(String(this.properties.bgColor ?? "#FFFFFF"));
      this.properties.bgColor = this.backgroundColor;

      if (!serializedSvg) {
        this.svg = null;
        this.preview = null;
        this.svgBytes = 0;
        this.infoText = "no svg";
        this.refreshPreviewLayout();
        return;
      }

      this.loadSvgText(serializedSvg);
    }

    onExecute(this: LiteNode & InputSvgNode) {
      this.setOutputData(0, this.svg);
    }

    onDrawBackground(this: PreviewAwareNode & InputSvgNode, context: CanvasRenderingContext2D) {
      const layout = drawImagePreview(context, this, this.preview, { footerLines: 1 });
      context.save();
      context.fillStyle = "rgba(255,255,255,0.65)";
      context.font = "12px sans-serif";
      context.fillText(this.infoText, 10, layout.footerTop + 12);
      context.restore();
    }

    onRemoved(this: InputSvgNode) {
      this.fileInput.remove();
    }
  }

  class OutputImageNode {
    image: GraphImage | null = null;
    size: [number, number] = [320, 300];
    infoText = "no image";
    lastSignature = "";

    constructor() {
      const node = this as unknown as PreviewAwareNode & OutputImageNode;
      node.title = "OUTPUT";
      node.properties = {};
      node.addInput("image", "image");
      node.addWidget("button", "Save image", null, () => {
        if (node.image) {
          downloadGraphImage(node.image, "plotterfun-output.png");
        }
      });
      node.refreshPreviewLayout = () => {
        deps.refreshNode(node, node.image, 1);
      };
      node.refreshPreviewLayout();
    }

    onExecute(this: PreviewAwareNode & OutputImageNode) {
      this.image = this.getInputData(0) ?? null;
      const signature = deps.getGraphImageSignature(this.image);
      if (signature !== this.lastSignature) {
        this.lastSignature = signature;
        this.infoText = deps.formatGraphImageInfo(this.image);
      }
      this.refreshPreviewLayout();
    }

    onDrawBackground(this: PreviewAwareNode & OutputImageNode, context: CanvasRenderingContext2D) {
      const layout = drawImagePreview(context, this, this.image, { footerLines: 1 });
      context.save();
      context.fillStyle = "rgba(255,255,255,0.65)";
      context.font = "12px sans-serif";
      context.fillText(this.infoText, 10, layout.footerTop + 12);
      context.restore();
    }
  }

  class OutputSvgNode {
    svg: GraphSvg | null = null;
    preview: GraphImage | null = null;
    svgBytes = 0;
    elementCount = 0;
    elementTypeCounts: Record<string, number> = {};
    elementReportLines: string[] = [];
    isCountingElements = false;
    lastSvg = "";
    renderToken = 0;
    statsToken = 0;
    statsTimerId: number | null = null;
    size: [number, number] = [320, 340];

    constructor() {
      const node = this as unknown as PreviewAwareNode & OutputSvgNode;
      node.title = "SVG";
      node.properties = {};
      node.addInput("svg", "svg");
      node.addWidget("button", "Save SVG", null, () => {
        if (node.svg) {
          downloadGraphSvg(node.svg, "plotterfun-output.svg");
        }
      });
      node.refreshPreviewLayout = () => {
        deps.refreshNode(node, node.preview, 2);
      };
      node.refreshPreviewLayout();
    }

    onExecute(this: PreviewAwareNode & OutputSvgNode) {
      const svg = this.getInputData(0);
      this.svg = typeof svg === "string" ? svg : null;

      if (!this.svg) {
        this.preview = null;
        this.svgBytes = 0;
        this.elementCount = 0;
        this.elementTypeCounts = {};
        this.elementReportLines = [];
        this.isCountingElements = false;
        this.lastSvg = "";
        this.statsToken += 1;
        if (this.statsTimerId !== null) {
          window.clearTimeout(this.statsTimerId);
          this.statsTimerId = null;
        }
        this.refreshPreviewLayout();
        return;
      }

      if (this.svg !== this.lastSvg) {
        this.lastSvg = this.svg;
        this.svgBytes = new Blob([this.svg]).size;
        this.isCountingElements = true;
        const statsToken = ++this.statsToken;
        if (this.statsTimerId !== null) {
          window.clearTimeout(this.statsTimerId);
          this.statsTimerId = null;
        }
        this.statsTimerId = window.setTimeout(() => {
          if (statsToken !== this.statsToken || !this.svg) {
            return;
          }
          try {
            const document = new DOMParser().parseFromString(this.svg, "image/svg+xml");
            const parseError = document.querySelector("parsererror");
            if (parseError) {
              this.elementCount = 0;
              this.elementTypeCounts = {};
              this.elementReportLines = [];
            } else {
              const counts: Record<string, number> = {};
              const elements = document.querySelectorAll("*");
              for (let index = 0; index < elements.length; index += 1) {
                const tag = elements[index].tagName.toLowerCase();
                if (tag === "svg") {
                  continue;
                }
                counts[tag] = (counts[tag] ?? 0) + 1;
              }
              this.elementTypeCounts = counts;
              this.elementCount = Object.values(counts).reduce((sum, value) => sum + value, 0);
              const entries = Object.entries(counts).sort((a, b) => {
                if (b[1] !== a[1]) {
                  return b[1] - a[1];
                }
                return a[0].localeCompare(b[0]);
              });
              const lines: string[] = [];
              let current: string[] = [];
              for (let i = 0; i < entries.length; i += 1) {
                const [tag, count] = entries[i];
                current.push(`${tag} ${count}`);
                if (current.length >= 3) {
                  lines.push(current.join(" | "));
                  current = [];
                }
              }
              if (current.length > 0) {
                lines.push(current.join(" | "));
              }
              this.elementReportLines = lines;
            }
          } catch {
            this.elementCount = 0;
            this.elementTypeCounts = {};
            this.elementReportLines = [];
          }
          this.isCountingElements = false;
          this.statsTimerId = null;
          this.setDirtyCanvas(true, true);
        }, 300);
        const renderToken = ++this.renderToken;
        void rasterizeGraphSvg(this.svg)
          .then((preview) => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = preview;
            this.setDirtyCanvas(true, true);
          })
          .catch(() => {
            if (renderToken !== this.renderToken) {
              return;
            }
            this.preview = null;
            this.setDirtyCanvas(true, true);
          });
      }

      this.refreshPreviewLayout();
    }

    onDrawBackground(this: PreviewAwareNode & OutputSvgNode, context: CanvasRenderingContext2D) {
      const footerLines = Math.max(2, 2 + this.elementReportLines.length);
      const layout = drawImagePreview(context, this, this.preview, { footerLines });
      context.save();
      context.fillStyle = "rgba(255,255,255,0.65)";
      context.font = "12px sans-serif";
      context.fillText(
        `svg ${this.svgBytes} bytes | elements ${this.isCountingElements ? "..." : this.elementCount}`,
        10,
        layout.footerTop + 12,
      );
      if (this.isCountingElements) {
        context.fillText("report: updating...", 10, layout.footerTop + 30);
      } else if (this.elementReportLines.length > 0) {
        context.fillText(`report: ${this.elementReportLines[0]}`, 10, layout.footerTop + 30);
        for (let lineIndex = 1; lineIndex < this.elementReportLines.length; lineIndex += 1) {
          context.fillText(this.elementReportLines[lineIndex], 10, layout.footerTop + 30 + lineIndex * 18);
        }
      } else {
        context.fillText(this.svg ? "report: no elements" : "no svg", 10, layout.footerTop + 30);
      }
      context.restore();
    }
  }

  class OutputPaletteNode {
    palette: GraphPalette | null = null;
    size: [number, number] = [320, 220];

    constructor() {
      const node = this as unknown as PreviewAwareNode & OutputPaletteNode;
      node.title = "PALETTE";
      node.properties = {};
      node.addInput("palette", "palette");
      node.addWidget("button", "Save palette", null, () => {
        if (node.palette?.length) {
          downloadGraphPalette(node.palette, "plotterfun-palette.json");
        }
      });
      node.refreshPreviewLayout = () => {
        node.setDirtyCanvas(true, true);
      };
      node.refreshPreviewLayout();
    }

    onExecute(this: PreviewAwareNode & OutputPaletteNode) {
      const palette = this.getInputData(0);
      this.palette = Array.isArray(palette)
        ? palette.filter((item): item is string => typeof item === "string")
        : null;
      this.refreshPreviewLayout();
    }

    onDrawBackground(this: PreviewAwareNode & OutputPaletteNode, context: CanvasRenderingContext2D) {
      drawPalettePreview(context, this, this.palette, `${this.palette?.length ?? 0} colors`);
    }
  }

  class OutputJsonNode {
    data: unknown = null;
    previewLines: string[] = [];
    size: [number, number] = [320, 240];

    constructor() {
      const node = this as unknown as PreviewAwareNode & OutputJsonNode;
      node.title = "JSON";
      node.properties = {};
      node.addInput("json", "*");
      node.addWidget("button", "Save JSON", null, () => {
        if (node.data) {
          downloadGraphJsonData(node.data, "plotterfun-output.json");
        }
      });
      node.refreshPreviewLayout = () => {
        node.setDirtyCanvas(true, true);
      };
      node.refreshPreviewLayout();
    }

    onExecute(this: PreviewAwareNode & OutputJsonNode) {
      const value = this.getInputData(0) as unknown;
      this.data = value ?? null;
      if (!this.data) {
        this.previewLines = ["no json data", "connect a JSON output"];
        this.refreshPreviewLayout();
        return;
      }

      try {
        const raw = JSON.stringify(this.data, null, 2) ?? "";
        const lines = raw.split("\n").slice(0, 14).map((line) => {
          if (line.length <= 54) {
            return line;
          }
          return `${line.slice(0, 51)}...`;
        });
        this.previewLines = lines.length ? lines : ["{}"];
      } catch {
        this.previewLines = ["cannot render json", "value is not serializable"];
      }
      this.refreshPreviewLayout();
    }

    onDrawBackground(this: PreviewAwareNode & OutputJsonNode, context: CanvasRenderingContext2D) {
      const padding = 10;
      const headerHeight = 34 + (this.widgets?.length ?? 0) * 28;
      const lines = this.previewLines.length ? this.previewLines : ["no json data", "connect a JSON output"];
      this.size = [320, headerHeight + padding * 2 + lines.length * 18 + 8];

      context.save();
      context.fillStyle = "#121212";
      context.fillRect(padding, headerHeight, this.size[0] - padding * 2, this.size[1] - headerHeight - padding);
      context.fillStyle = "rgba(255,255,255,0.75)";
      context.font = "12px sans-serif";
      lines.forEach((line, index) => {
        context.fillText(line, padding + 8, headerHeight + 18 + index * 18);
      });
      context.restore();
    }
  }

  class OutputTextNode {
    text = "";
    previewLines: string[] = [];
    size: [number, number] = [320, 260];

    constructor() {
      const node = this as unknown as PreviewAwareNode & OutputTextNode;
      node.title = "TXT";
      node.properties = {};
      node.addInput("txt", "string");
      node.addWidget("button", "Save TXT", null, () => {
        if (node.text.length > 0) {
          downloadGraphTextData(node.text, "plotterfun-output.txt");
        }
      });
      node.refreshPreviewLayout = () => {
        node.setDirtyCanvas(true, true);
      };
      node.refreshPreviewLayout();
    }

    onExecute(this: PreviewAwareNode & OutputTextNode) {
      const value = this.getInputData(0);
      this.text = typeof value === "string" ? value : "";
      if (!this.text) {
        this.previewLines = ["no text data", "connect a TXT output"];
        this.refreshPreviewLayout();
        return;
      }
      const lines = this.text.split(/\r?\n/);
      this.previewLines = lines.slice(0, 36).map((line) => (line.length <= 96 ? line : `${line.slice(0, 93)}...`));
      if (lines.length > 36) {
        this.previewLines.push(`... (${lines.length - 36} more lines)`);
      }
      this.refreshPreviewLayout();
    }

    onDrawBackground(this: PreviewAwareNode & OutputTextNode, context: CanvasRenderingContext2D) {
      const padding = 10;
      const headerHeight = 34 + (this.widgets?.length ?? 0) * 28;
      const lines = this.previewLines.length ? this.previewLines : ["no text data", "connect a TXT output"];
      const lineHeight = 12;
      this.size = [360, headerHeight + padding * 2 + lines.length * lineHeight + 10];

      context.save();
      context.fillStyle = "#101010";
      context.fillRect(padding, headerHeight, this.size[0] - padding * 2, this.size[1] - headerHeight - padding);
      context.fillStyle = "rgba(255,255,255,0.9)";
      context.font = "8pt monospace";
      for (let index = 0; index < lines.length; index += 1) {
        context.fillText(lines[index], padding + 8, headerHeight + 14 + index * lineHeight);
      }
      context.restore();
    }
  }

  return {
    InputImageNode,
    InputSvgNode,
    WebcamImageNode,
    OutputImageNode,
    OutputPaletteNode,
    OutputSvgNode,
    OutputJsonNode,
    OutputTextNode,
  };
}
