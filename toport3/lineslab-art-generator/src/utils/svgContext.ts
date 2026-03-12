
export class SVGContext {
  width: number;
  height: number;
  elements: string[] = [];
  currentPath: string = "";
  _strokeStyle: string = "black";
  _fillStyle: string = "white";
  _lineWidth: number = 1;
  _lineCap: string = "round";
  _lineJoin: string = "round";
  _lineDash: number[] = [];
  _font: string = "10px sans-serif";

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  set strokeStyle(val: string) { this._strokeStyle = val; }
  get strokeStyle() { return this._strokeStyle; }
  
  set fillStyle(val: string) { this._fillStyle = val; }
  get fillStyle() { return this._fillStyle; }
  
  set lineWidth(val: number) { this._lineWidth = val; }
  get lineWidth() { return this._lineWidth; }
  
  set lineCap(val: string) { this._lineCap = val; }
  get lineCap() { return this._lineCap; }
  
  set lineJoin(val: string) { this._lineJoin = val; }
  get lineJoin() { return this._lineJoin; }

  set font(val: string) { this._font = val; }
  get font() { return this._font; }

  setLineDash(dash: number[]) {
    this._lineDash = dash;
  }

  clearRect(x: number, y: number, w: number, h: number) {
    // For SVG export, we usually just want the paths, 
    // but we can add a background rect if needed.
    this.elements = []; 
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.elements.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${this._fillStyle}" />`);
  }

  beginPath() {
    this.currentPath = "";
  }

  moveTo(x: number, y: number) {
    this.currentPath += `M ${x.toFixed(2)} ${y.toFixed(2)} `;
  }

  lineTo(x: number, y: number) {
    this.currentPath += `L ${x.toFixed(2)} ${y.toFixed(2)} `;
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
    // Simplified arc for halftone/stippling (usually full circles)
    if (Math.abs(endAngle - startAngle) >= Math.PI * 2) {
      this.elements.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${this._fillStyle}" />`);
    } else {
      // Proper SVG arc would be more complex, but our algorithms mostly use full circles or lines
      const x1 = x + radius * Math.cos(startAngle);
      const y1 = y + radius * Math.sin(startAngle);
      const x2 = x + radius * Math.cos(endAngle);
      const y2 = y + radius * Math.sin(endAngle);
      const largeArcFlag = endAngle - startAngle <= Math.PI ? "0" : "1";
      this.currentPath += `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArcFlag} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} `;
    }
  }

  stroke() {
    if (!this.currentPath) return;
    const dashAttr = this._lineDash.length ? `stroke-dasharray="${this._lineDash.join(',')}"` : "";
    this.elements.push(`<path d="${this.currentPath}" stroke="${this._strokeStyle}" stroke-width="${this._lineWidth.toFixed(2)}" stroke-linecap="${this._lineCap}" stroke-linejoin="${this._lineJoin}" fill="none" ${dashAttr} />`);
  }

  fill() {
    if (!this.currentPath) return;
    this.elements.push(`<path d="${this.currentPath}" fill="${this._fillStyle}" />`);
  }

  serialize(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">
  ${this.elements.join('\n  ')}
</svg>`;
  }
}
