const shapes = "path,line,polyline,polygon,rect,circle,ellipse";

function paintedValue(element: Element, name: "stroke" | "fill") {
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = current.getAttribute("style") ?? "";
    const styled = style.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i"))?.[1]?.trim();
    const value = styled ?? current.getAttribute(name);
    if (value !== null && value !== undefined) return value.trim();
  }
  return name === "fill" ? "black" : "none";
}

function normalizedPaint(value: string) {
  if (value === "none" || value.startsWith("url(")) return value;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return value;
  context.fillStyle = "#010203";
  context.fillStyle = value;
  return context.fillStyle === "#010203" && value.toLowerCase() !== "#010203" ? value : context.fillStyle;
}

export function flattenSvgPaint(svg: string) {
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (parsed.querySelector("parsererror")) return svg;
  parsed.querySelectorAll(shapes).forEach(shape => {
    const stroke = paintedValue(shape, "stroke");
    const fill = paintedValue(shape, "fill");
    shape.setAttribute("stroke", normalizedPaint(stroke));
    shape.setAttribute("fill", normalizedPaint(fill));
  });
  return new XMLSerializer().serializeToString(parsed.documentElement);
}
