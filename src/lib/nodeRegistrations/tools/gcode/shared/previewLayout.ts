import { getPreviewWidth } from "../../../../nodePreviewSettings";
import type { GraphImage } from "../../../../../models/graphImage";

export function getGcodePreviewAboveWidgetsLayout(preview: GraphImage | null, widgetCount: number) {
  const padding = 10;
  const widgetTop = 34;
  const width = getPreviewWidth();
  const aspect = preview ? preview.height / preview.width : 3 / 4;
  const height = Math.max(120, Math.round(width * aspect));
  const top = widgetTop + widgetCount * 28 + padding;
  const chartTop = top + height + padding;
  const footerTop = chartTop + 50 + padding;
  return {
    padding, top, width, height, widgetTop, chartTop, footerTop,
    size: [width + padding * 2, footerTop + 2 * 18 + padding] as [number, number],
  };
}
