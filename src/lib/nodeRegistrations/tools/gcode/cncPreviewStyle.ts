export interface CncPressureRange { drawZ: number; safeZ: number }

export interface CncStrokeSettings {
  toolsColors: boolean;
  pressure: boolean;
  traceColor: string;
  travelColor: string;
  drawWidth: number;
  travelWidth: number;
  penDownThreshold: number;
  showTravelMoves: boolean;
  pressureRange: CncPressureRange;
}

export interface CncStrokeSegment { rapid: boolean; endZ: number; color: string | null }

function pressureAmount(z: number, range: CncPressureRange) {
  const span = range.safeZ - range.drawZ;
  return Math.abs(span) > 1e-9 ? Math.max(0, Math.min(1, (range.safeZ - z) / span)) : 0;
}

function mixWithWhite(hex: string, amount: number) {
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16));
  return `rgb(${channels.map(channel => Math.round(255 + (channel - 255) * amount)).join(",")})`;
}

export function cncStrokeStyle(segment: CncStrokeSegment, settings: CncStrokeSettings) {
  if (segment.rapid) return settings.showTravelMoves ? { color: settings.travelColor, width: settings.travelWidth } : null;
  if (settings.pressure) {
    const amount = pressureAmount(segment.endZ, settings.pressureRange);
    if (amount <= 0) return null;
    const baseColor = settings.toolsColors && segment.color ? segment.color : settings.traceColor;
    return { color: mixWithWhite(baseColor, amount), width: Math.max(0.1, settings.drawWidth * amount) };
  }
  if (segment.endZ > settings.penDownThreshold) return settings.showTravelMoves ? { color: settings.travelColor, width: settings.travelWidth } : null;
  return { color: settings.toolsColors && segment.color ? segment.color : settings.traceColor, width: settings.drawWidth };
}
