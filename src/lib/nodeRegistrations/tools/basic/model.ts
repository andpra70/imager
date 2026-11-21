export interface CropOptions {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export interface ResolvedCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_CROP_OPTIONS: CropOptions = {
  xPercent: 0,
  yPercent: 0,
  widthPercent: 100,
  heightPercent: 100,
};

export function resolveCropRect(imageWidth: number, imageHeight: number, options: CropOptions): ResolvedCropRect {
  const x = Math.min(imageWidth - 1, Math.max(0, Math.round(imageWidth * options.xPercent / 100)));
  const y = Math.min(imageHeight - 1, Math.max(0, Math.round(imageHeight * options.yPercent / 100)));
  const requestedWidth = Math.max(1, Math.round(imageWidth * options.widthPercent / 100));
  const requestedHeight = Math.max(1, Math.round(imageHeight * options.heightPercent / 100));
  return {
    x,
    y,
    width: Math.min(requestedWidth, imageWidth - x),
    height: Math.min(requestedHeight, imageHeight - y),
  };
}
