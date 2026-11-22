import { getPreviewWidth } from "../../../../nodePreviewSettings";
import type { GraphImage } from "../../../../../models/graphImage";

export function getGcodePreviewAboveWidgetsLayout(preview: GraphImage | null, widgetCount: number) {
  const padding = 10;
  const top = 56;
  const width = getPreviewWidth();
  const aspect = preview ? preview.height / preview.width : 3 / 4;
  const height = Math.max(120, Math.round(width * aspect));
  const widgetTop = top + height + padding;
  const footerTop = widgetTop + widgetCount * 28 + padding;
  return {
    padding, top, width, height, widgetTop, footerTop,
    size: [width + padding * 2, footerTop + 2 * 18 + padding] as [number, number],
  };
}
