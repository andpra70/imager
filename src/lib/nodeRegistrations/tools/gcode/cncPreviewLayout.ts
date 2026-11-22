import { getPreviewWidth } from "../../../nodePreviewSettings";

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

export function getCncPreviewLayout(widgetCount: number, bounds: Bounds | null) {
  const padding = 10;
  const plotWidth = getPreviewWidth();
  const rangeX = bounds ? bounds.maxX - bounds.minX : 0;
  const rangeY = bounds ? bounds.maxY - bounds.minY : 0;
  const aspect = rangeX > 0 && rangeY > 0 ? rangeY / rangeX : 3 / 4;
  const plotHeight = Math.max(120, Math.round(plotWidth * aspect));
  const plotTop = 34 + widgetCount * 28;
  const footerHeight = 7 * 16 + 14;
  return {
    padding,
    plotLeft: padding,
    plotTop,
    plotWidth,
    plotHeight,
    size: [plotWidth + 2 * padding, plotTop + plotHeight + footerHeight + 8] as [number, number],
  };
}
